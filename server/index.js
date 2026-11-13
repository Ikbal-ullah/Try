// Entry point: load settings, start the server, shut down cleanly.

import 'dotenv/config';
import { createApp, mocksEnabled } from './app.js';

const port = Number(process.env.PORT) || 3001;
const server = createApp().listen(port, () => {
  console.log(`[server] listening on http://localhost:${port} (failure simulator ${mocksEnabled ? 'on' : 'off'})`);
  if (!process.env.LLM_API_KEY) {
    console.warn('[server] LLM_API_KEY is not set - copy .env.example to .env and add your key.');
  }
});

// Hosting platforms send SIGTERM before replacing the server during a deploy.
// Stop accepting new requests, let in-flight ones finish, then exit. If
// something hangs, exit anyway after 10 seconds.
function shutDown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutDown('SIGTERM'));
process.on('SIGINT', () => shutDown('SIGINT'));
