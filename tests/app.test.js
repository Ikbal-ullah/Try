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
  return (body, headers = {}) =>
    fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
}

afterEach(() => new Promise((resolve) => server.close(resolve)));

describe('POST /api/generate', () => {
  it('returns the study set and sends security headers', async () => {
    const post = await start();
    const res = await post(JSON.stringify({ text: 'hooks' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(goodResult);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('refuses requests that another website makes through a visitor\'s browser', async () => {
    const post = await start();
    const body = JSON.stringify({ text: 'hooks' });
    const crossSite = await post(body, { 'Sec-Fetch-Site': 'cross-site' });
    expect(crossSite.status).toBe(403);
    expect((await crossSite.json()).error.code).toBe('FORBIDDEN');
    expect((await post(body, { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
  });

  it('serves a repeated request from the cache without calling the model again', async () => {
    let calls = 0;
    const post = await start({
      generate: async () => {
        calls += 1;
        return goodResult;
      },
    });
    const first = await (await post(JSON.stringify({ text: 'React Hooks' }))).json();
    const second = await (await post(JSON.stringify({ text: '  react   hooks ' }))).json();
    expect(first.cached).toBeUndefined();
    expect(second.cached).toBe(true);
    expect(second.studySet).toEqual(goodResult.studySet);
    expect(calls).toBe(1);

    // "generate again" must reach the model
    await post(JSON.stringify({ text: 'React Hooks', fresh: true }));
    expect(calls).toBe(2);
  });

  it('never caches failures', async () => {
    let calls = 0;
    const post = await start({
      generate: async () => {
        calls += 1;
        throw new AppError('OVERLOADED', 'busy');
      },
    });
    await post(JSON.stringify({ text: 'hooks' }));
    await post(JSON.stringify({ text: 'hooks' }));
    expect(calls).toBe(2);
  });

  it('turns an AppError into a JSON error with the matching status', async () => {
    const post = await start({
      generate: async () => {
        throw new AppError('TIMEOUT', 'The AI took too long to respond.');
      },
    });
    const res = await post(JSON.stringify({ text: 'hooks' }));
    expect(res.status).toBe(504);
    const { error } = await res.json();
    expect(error.code).toBe('TIMEOUT');
    expect(error.requestId).toBe(res.headers.get('x-request-id'));
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

  it('enforces the daily limit separately from the per-minute limit', async () => {
    const post = await start({ rateLimitPerMinute: 50, rateLimitPerDay: 1 });
    const body = JSON.stringify({ text: 'hooks' });
    expect((await post(body)).status).toBe(200);
    const second = await post(body);
    expect(second.status).toBe(429);
    expect((await second.json()).error.message).toMatch(/daily limit/);
  });

  it('answers "busy" instead of queueing when too many generations are running', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const post = await start({ maxConcurrent: 1, generate: () => gate.then(() => goodResult) });
    const body = JSON.stringify({ text: 'hooks' });
    const first = post(body); // occupies the only slot
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await post(JSON.stringify({ text: 'a different topic' }));
    expect(second.status).toBe(503);
    expect((await second.json()).error.code).toBe('SERVER_BUSY');
    release();
    expect((await first).status).toBe(200);
    // the slot is free again
    expect((await post(body)).status).toBe(200);
  });
});
