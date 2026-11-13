// The Express app, built by a function so tests can create one with their own
// settings and without opening a real port. server/index.js starts it.
//
// A deliberately small backend. Its jobs:
//   1. Keep the API key on the server (the browser only ever calls /api/generate).
//   2. Validate input, call the model, validate output, retry once.
//   3. Always answer with JSON: { studySet, warnings } or { error: { code, message } }.
//   4. Protect itself and the AI quota from abuse and traffic spikes.

import compression from 'compression';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCache } from './cache.js';
import { AppError, statusFor } from './errors.js';
import { generateStudySet } from './generate.js';
import { log } from './log.js';
import { mocksEnabled } from './mocks.js';

const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const DAY_MS = 24 * 60 * 60 * 1000;

function sendError(res, code, message) {
  res.status(statusFor(code)).json({ error: { code, message, requestId: res.locals.requestId } });
}

/** Same topic typed with different capitals or spacing should hit the same cache entry. */
function cacheKeyFor(text) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function createApp({
  // How many proxies sit in front of us (1 behind a load balancer, 2 behind a
  // CDN plus a load balancer). Needed so rate limiting sees the visitor's IP
  // instead of the proxy's.
  trustProxy = Number(process.env.TRUST_PROXY) || 0,
  // Per-visitor limits on generations. Each one costs AI quota.
  rateLimitPerMinute = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10,
  rateLimitPerDay = Number(process.env.RATE_LIMIT_PER_DAY) || 100,
  // Model calls allowed at the same moment across ALL visitors. Beyond this
  // we answer "busy" immediately instead of letting requests pile up.
  maxConcurrent = Number(process.env.MAX_CONCURRENT_GENERATIONS) || 8,
  cache = createCache(),
  distDir = DIST_DIR,
  generate = generateStudySet,
} = {}) {
  const app = express();
  app.set('trust proxy', trustProxy);

  // ---------- security headers ----------
  app.use(
    helmet({
      xFrameOptions: { action: 'deny' }, // same rule as frame-ancestors below, for older browsers
      // The browser may only load scripts, styles, fonts and data from this
      // app's own origin. Even if a script were somehow injected into the
      // page, it could not run or send data anywhere else.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"], // nobody may embed this app in a frame (clickjacking)
          objectSrc: ["'none'"],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    // The app uses none of these browser features, so switch them off.
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    // Every request gets an id that appears in the logs and in error
    // responses, so a user's report can be matched to a log line.
    res.locals.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', res.locals.requestId);
    next();
  });

  app.use(compression());
  // 6,000 characters is at most 24 KB of UTF-8; anything bigger is not a real request.
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  // TEMPORARY: shows the caller their own forwarding chain, to find the right
  // TRUST_PROXY value on the host. Remove once it is set.
  app.get('/api/debug-proxy', (req, res) => {
    res.json({ xff: req.get('x-forwarded-for') ?? null, socket: req.socket.remoteAddress, ip: req.ip, trustProxy: trustProxy });
  });

  // Browsers say where a request comes from (Sec-Fetch-Site). Another website
  // must not be able to use our API, and our AI quota, through its visitors.
  app.use('/api', (req, res, next) => {
    const site = req.get('sec-fetch-site');
    if (req.method !== 'GET' && site && site !== 'same-origin' && site !== 'none') {
      sendError(res, 'FORBIDDEN', 'This API can only be used from the app itself.');
      return;
    }
    next();
  });

  // ---------- limits ----------
  const limiter = (windowMs, limit, message) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-7', // tells well-behaved clients when they can retry
      legacyHeaders: false,
      handler: (req, res) => {
        log('warn', 'generate.rate_limited', { requestId: res.locals.requestId, windowMs });
        sendError(res, 'TOO_MANY_REQUESTS', message);
      },
    });
  const perMinute = limiter(60_000, rateLimitPerMinute, 'You are generating study sets very quickly. Wait a minute and try again.');
  const perDay = limiter(DAY_MS, rateLimitPerDay, 'You have reached the daily limit for this app. Please come back tomorrow.');

  let inFlight = 0;

  // ---------- the one real route ----------
  app.post('/api/generate', perMinute, perDay, async (req, res) => {
    const { requestId } = res.locals;
    const { text, mock, fresh } = req.body ?? {};
    const startedAt = Date.now();
    const finish = (outcome, extra = {}) =>
      // One line per generation. The user's text is never logged.
      log('info', 'generate.done', { requestId, outcome, ms: Date.now() - startedAt, inFlight, ...extra });

    // Serve a recent identical request from memory: instant, and no AI quota used.
    // `fresh` (sent when the user asks again for the same text) skips the read.
    const useCache = typeof text === 'string' && !(mocksEnabled && mock);
    const cacheKey = useCache ? cacheKeyFor(text) : null;
    if (cacheKey && !fresh) {
      const hit = cache.get(cacheKey);
      if (hit) {
        res.json({ ...hit, cached: true });
        finish('cache-hit');
        return;
      }
    }

    if (inFlight >= maxConcurrent) {
      sendError(res, 'SERVER_BUSY', 'The app is handling a lot of requests right now. Try again in a moment.');
      finish('SERVER_BUSY');
      return;
    }

    // If the browser disconnects (user cancelled or sent a newer request),
    // stop the model call too instead of paying for an answer nobody will read.
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    inFlight += 1;
    try {
      const result = await generate({ text, mock, signal: controller.signal });
      if (cacheKey) cache.set(cacheKey, { studySet: result.studySet, warnings: result.warnings });
      res.json(result);
      inFlight -= 1;
      finish('ok', { attempts: result.attempts });
    } catch (err) {
      inFlight -= 1;
      if (controller.signal.aborted) {
        finish('client-aborted'); // client is gone; nothing to send
      } else if (err instanceof AppError) {
        sendError(res, err.code, err.message);
        finish(err.code);
      } else {
        log('error', 'server.unexpected_error', { requestId, reason: err?.message });
        sendError(res, 'INTERNAL', 'Something went wrong on the server.');
        finish('INTERNAL');
      }
    }
  });

  // Unknown API routes still get a JSON answer.
  app.use('/api', (req, res) => sendError(res, 'NOT_FOUND', 'Unknown API route.'));

  // ---------- the React app ----------
  // Production: after `npm run build`, this same server also serves the frontend.
  if (fs.existsSync(distDir)) {
    // Vite puts a content hash in every asset filename, so they can be cached
    // "forever": a new build produces new filenames.
    app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
    // index.html must always be re-checked, or users would keep an old build.
    app.use(express.static(distDir, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Last stop for errors thrown by middleware, e.g. an unreadable request body.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      sendError(res, 'BAD_REQUEST', 'The request could not be read.');
    } else if (err.status === 404) {
      res.status(404).end(); // a missing static asset
    } else {
      log('error', 'server.unexpected_error', { requestId: res.locals.requestId, reason: err?.message });
      sendError(res, 'INTERNAL', 'Something went wrong on the server.');
    }
  });

  return app;
}

export { mocksEnabled };
