// Integration tests: a real Express app on a random port, with the model
// call replaced by a stub so nothing leaves the machine.

import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { AppError } from '../server/errors.js';

const goodResult = { studySet: { title: 'T', flashcards: [], quiz: [] }, warnings: [], attempts: 1 };
let server;

async function start(options) {
  const app = createApp({ distDir: '/nonexistent', generate: async () => goodResult, ...options });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${server.address().port}`;
  return (body) =>
    fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}

afterEach(() => new Promise((resolve) => server.close(resolve)));

describe('POST /api/generate', () => {
  it('returns the study set and sends security headers', async () => {
    const post = await start();
    const res = await post(JSON.stringify({ text: 'hooks' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(goodResult);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('turns an AppError into a JSON error with the matching status', async () => {
    const post = await start({
      generate: async () => {
        throw new AppError('TIMEOUT', 'The AI took too long to respond.');
      },
    });
    const res = await post(JSON.stringify({ text: 'hooks' }));
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe('TIMEOUT');
  });

  it('never leaks the details of an unexpected error', async () => {
    const post = await start({
      generate: async () => {
        throw new Error('secret internal detail');
      },
    });
    const res = await post(JSON.stringify({ text: 'hooks' }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });

  it('answers unreadable and oversized bodies with JSON, not a crash', async () => {
    const post = await start();
    expect((await (await post('{oops')).json()).error.code).toBe('BAD_REQUEST');
    const huge = await post(JSON.stringify({ text: 'x'.repeat(40_000) }));
    expect(huge.status).toBe(400);
  });

  it('rate limits a single visitor', async () => {
    const post = await start({ rateLimitPerMinute: 2 });
    const body = JSON.stringify({ text: 'hooks' });
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    const third = await post(body);
    expect(third.status).toBe(429);
    expect((await third.json()).error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('answers "busy" instead of queueing when too many generations are running', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const post = await start({ maxConcurrent: 1, generate: () => gate.then(() => goodResult) });
    const body = JSON.stringify({ text: 'hooks' });
    const first = post(body); // occupies the only slot
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await post(body);
    expect(second.status).toBe(503);
    expect((await second.json()).error.code).toBe('SERVER_BUSY');
    release();
    expect((await first).status).toBe(200);
    // the slot is free again
    expect((await post(body)).status).toBe(200);
  });
});
