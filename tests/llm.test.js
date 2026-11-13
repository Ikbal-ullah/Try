// callModel with the network replaced by a stub: how each provider response
// is translated into an error code.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callModel } from '../server/llm.js';

const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const messages = [{ role: 'user', content: 'hi' }];

async function codeOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err.code;
  }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  vi.stubEnv('LLM_BASE_URL', 'https://example.test/v1');
  vi.stubEnv('LLM_MODEL', 'first-model, second-model');
  vi.stubEnv('LLM_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('callModel', () => {
  it('returns the text of the first choice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { choices: [{ message: { content: '{"ok":true}' } }] })));
    expect(await callModel(messages)).toBe('{"ok":true}');
  });

  it('uses the fallback model on the second attempt', async () => {
    const fetchStub = vi.fn(async () => reply(200, { choices: [{ message: { content: 'x' } }] }));
    vi.stubGlobal('fetch', fetchStub);
    await callModel(messages, { attempt: 2 });
    expect(JSON.parse(fetchStub.mock.calls[0][1].body).model).toBe('second-model');
  });

  it('tells "slow down" apart from "out of credit", which share status 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(429, { error: { message: 'Rate limit reached' } })));
    expect(await codeOf(callModel(messages))).toBe('RATE_LIMITED');

    vi.stubGlobal('fetch', vi.fn(async () => reply(429, { error: { message: 'You have no credits remaining.', code: 'insufficient_quota' } })));
    expect(await codeOf(callModel(messages))).toBe('QUOTA_EXHAUSTED');
  });

  it('maps overload, other provider errors and unreachable hosts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(503, 'busy')));
    expect(await codeOf(callModel(messages))).toBe('OVERLOADED');

    vi.stubGlobal('fetch', vi.fn(async () => reply(404, 'model not found')));
    expect(await codeOf(callModel(messages))).toBe('PROVIDER_ERROR');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await codeOf(callModel(messages))).toBe('PROVIDER_ERROR');
  });

  it('treats an empty or missing reply as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { choices: [] })));
    expect(await codeOf(callModel(messages))).toBe('EMPTY_RESULT');
  });

  it('refuses to call anything when the key is missing', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    expect(await codeOf(callModel(messages))).toBe('CONFIG');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
