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
    const listening = app.listen(0, () => resolve(listening));
  });
  const baseUrl = `http://localhost:${server.address().port}`;
  return (body, headers = {}) =>
    fetch(`${baseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
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

  it('limits each visitor separately behind proxies, and ignores a faked forwarding header', async () => {
    // The chain measured on Render: visitor, Cloudflare, Render's load balancer
    // in X-Forwarded-For, and a local proxy as the direct connection.
    const post = await start({ trustProxy: 3, rateLimitPerMinute: 1 });
    const body = JSON.stringify({ text: 'hooks' });
    const forwardedFor = (visitor, cloudflare, balancer) => ({ 'X-Forwarded-For': `${visitor}, ${cloudflare}, ${balancer}` });

    expect((await post(body, forwardedFor('198.51.100.1', '104.22.0.1', '10.0.0.1'))).status).toBe(200);
    // Same visitor, different proxies on the way: still the same visitor.
    expect((await post(body, forwardedFor('198.51.100.1', '172.69.0.9', '10.0.0.7'))).status).toBe(429);
    // A different visitor has their own limit.
    expect((await post(body, forwardedFor('198.51.100.2', '104.22.0.1', '10.0.0.1'))).status).toBe(200);
    // Putting a fake address in front does not reset the limit.
    const spoofed = { 'X-Forwarded-For': '203.0.113.7, 198.51.100.1, 104.22.0.1, 10.0.0.1' };
    expect((await post(body, spoofed)).status).toBe(429);
  });
});
