// Entry point: load settings, start the server, shut down cleanly.

import 'dotenv/config';
import { createApp, mocksEnabled } from './app.js';
import { log } from './log.js';

const port = Number(process.env.PORT) || 3001;
const server = createApp().listen(port, () => {
  log('info', 'server.started', { port, failureSimulator: mocksEnabled ? 'on' : 'off' });
  if (!process.env.LLM_API_KEY) {
    log('warn', 'server.missing_api_key', { fix: 'copy .env.example to .env and add your key' });
  }
});

// Load balancers keep idle connections open for about 60 seconds and reuse
// them. Node closes idle connections after 5 seconds by default, so the
// balancer would sometimes send a request down a connection Node had just
// closed (a random "502 Bad Gateway"). Keeping ours open longer avoids that.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Hosting platforms send SIGTERM before replacing the server during a deploy.
// Stop accepting new requests, let in-flight ones finish, then exit. If
// something hangs, exit anyway after 10 seconds.
function shutDown(signal) {
  log('info', 'server.stopping', { signal });
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutDown('SIGTERM'));
process.on('SIGINT', () => shutDown('SIGINT'));
