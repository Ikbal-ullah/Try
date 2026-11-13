// A deliberately small backend. Its jobs:
//   1. Keep the API key on the server (the browser only ever calls /api/generate).
//   2. Validate input, call the model, validate output, retry once.
//   3. Always answer with JSON: { studySet, warnings } or { error: { code, message } }.

import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, statusFor } from './errors.js';
import { generateStudySet } from './generate.js';
import { mocksEnabled } from './mocks.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mocksEnabled });
});

app.post('/api/generate', async (req, res) => {
  // If the browser disconnects (user cancelled or sent a newer request),
  // stop the model call too instead of paying for an answer nobody will read.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const { text, mock } = req.body ?? {};
    const result = await generateStudySet({ text, mock, signal: controller.signal });
    res.json(result);
  } catch (err) {
    if (controller.signal.aborted) return; // client is gone; nothing to send
    if (err instanceof AppError) {
      res.status(statusFor(err.code)).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error('[server] unexpected error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
  }
});

// Unknown API routes and unreadable request bodies still get a JSON answer.
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
});

// Production: after `npm run build`, this same server also serves the React app.
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const badBody = err.type === 'entity.parse.failed' || err.type === 'entity.too.large';
  res
    .status(badBody ? 400 : 500)
    .json({ error: { code: badBody ? 'BAD_REQUEST' : 'INTERNAL', message: badBody ? 'The request could not be read.' : 'Something went wrong on the server.' } });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[server] API listening on http://localhost:${port}`);
  if (!process.env.LLM_API_KEY) {
    console.warn('[server] LLM_API_KEY is not set - copy .env.example to .env and add your key.');
  }
});
