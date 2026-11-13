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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, statusFor } from './errors.js';
import { generateStudySet } from './generate.js';
import { mocksEnabled } from './mocks.js';

const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const sendError = (res, code, message) => res.status(statusFor(code)).json({ error: { code, message } });

export function createApp({
  // How many proxies sit in front of us (1 on Render/Railway/Fly). Needed so
  // rate limiting sees the visitor's IP instead of the proxy's.
  trustProxy = Number(process.env.TRUST_PROXY) || 0,
  // Per-visitor limit on generations. Each one costs AI quota.
  rateLimitPerMinute = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10,
  // Model calls allowed at the same moment across ALL visitors. Beyond this
  // we answer "busy" immediately instead of letting requests pile up.
  maxConcurrent = Number(process.env.MAX_CONCURRENT_GENERATIONS) || 8,
  distDir = DIST_DIR,
  generate = generateStudySet,
} = {}) {
  const app = express();
  app.set('trust proxy', trustProxy);

  // Security headers, including a Content-Security-Policy that only allows
  // scripts and requests to our own origin.
  app.use(helmet());
  app.use(compression());
  // 6,000 characters is at most 24 KB of UTF-8; anything bigger is not a real request.
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  const generateLimiter = rateLimit({
    windowMs: 60_000,
    limit: rateLimitPerMinute,
    standardHeaders: 'draft-7', // tells well-behaved clients when they can retry
    legacyHeaders: false,
    handler: (req, res) => sendError(res, 'TOO_MANY_REQUESTS', 'You are generating study sets too quickly. Wait a minute and try again.'),
  });

  let inFlight = 0;

  app.post('/api/generate', generateLimiter, async (req, res) => {
    if (inFlight >= maxConcurrent) {
      sendError(res, 'SERVER_BUSY', 'The app is handling a lot of requests right now. Try again in a moment.');
      return;
    }

    // If the browser disconnects (user cancelled or sent a newer request),
    // stop the model call too instead of paying for an answer nobody will read.
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    const startedAt = Date.now();
    let outcome = 'ok';
    inFlight += 1;
    try {
      const { text, mock } = req.body ?? {};
      const result = await generate({ text, mock, signal: controller.signal });
      res.json(result);
    } catch (err) {
      if (controller.signal.aborted) {
        outcome = 'client-aborted'; // client is gone; nothing to send
      } else if (err instanceof AppError) {
        outcome = err.code;
        sendError(res, err.code, err.message);
      } else {
        outcome = 'INTERNAL';
        console.error('[server] unexpected error:', err);
        sendError(res, 'INTERNAL', 'Something went wrong on the server.');
      }
    } finally {
      inFlight -= 1;
      // One line per generation. The user's text is never logged.
      console.log(`[generate] ${outcome} ${Date.now() - startedAt}ms inFlight=${inFlight}`);
    }
  });

  // Unknown API routes still get a JSON answer.
  app.use('/api', (req, res) => sendError(res, 'NOT_FOUND', 'Unknown API route.'));

  // Production: after `npm run build`, this same server also serves the React app.
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
      console.error('[server] unexpected error:', err);
      sendError(res, 'INTERNAL', 'Something went wrong on the server.');
    }
  });

  return app;
}

export { mocksEnabled };
