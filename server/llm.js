// Talks to the model provider. This is the ONLY file that touches the API key.
//
// We call the provider's OpenAI-compatible /chat/completions endpoint with
// plain fetch - no SDK - so every step of the request is visible here.
// Gemini, Groq, OpenRouter and Ollama all expose this same endpoint shape,
// so switching provider is a .env change, not a code change.

import { AppError } from './errors.js';
import { log } from './log.js';

/**
 * Send messages to the model and return its raw text reply.
 * `signal` lets the caller cancel (e.g. when the browser gives up).
 * `attempt` (1, 2, ...) picks the model: LLM_MODEL may list a fallback after a
 * comma, so a retry can go to a different model when the first is overloaded.
 */
export async function callModel(messages, { signal, attempt = 1 } = {}) {
  const baseUrl = (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, '');
  const models = (process.env.LLM_MODEL ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  const model = models[(attempt - 1) % models.length];
  const apiKey = process.env.LLM_API_KEY;
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 30_000;

  if (!baseUrl || !model || !apiKey) {
    throw new AppError('CONFIG', 'The server is missing its AI settings. Copy .env.example to .env and add your API key.');
  }

  const body = { model, messages };
  // A low temperature makes the output more predictable. Some models only
  // accept their default, so LLM_TEMPERATURE=off leaves the setting out.
  if (process.env.LLM_TEMPERATURE !== 'off') {
    body.temperature = Number(process.env.LLM_TEMPERATURE) || 0.4;
  }
  // JSON mode asks the provider to return syntactically valid JSON.
  // It does not guarantee OUR shape, so we still validate afterwards.
  if (process.env.LLM_JSON_MODE !== 'off') {
    body.response_format = { type: 'json_object' };
  }

  // Abort when either our timeout fires or the caller cancels.
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    if (timeout.aborted) throw new AppError('TIMEOUT', 'The AI took too long to respond.');
    if (signal?.aborted) throw err; // caller cancelled; nobody is listening for the answer
    log('error', 'llm.network_error', { model, reason: err.message });
    throw new AppError('PROVIDER_ERROR', 'Could not reach the AI provider.');
  }

  if (response.status === 429) {
    // 429 means two different things: "slow down" (waiting helps) and
    // "this account is out of credit" (waiting does not). Tell them apart so
    // the user is not told to retry something that cannot work.
    const detail = await response.text().catch(() => '');
    if (/insufficient_quota|no credits|billing/i.test(detail)) {
      log('error', 'llm.quota_exhausted', { model });
      throw new AppError('QUOTA_EXHAUSTED', 'The AI account behind this app has run out of credit.');
    }
    throw new AppError('RATE_LIMITED', 'The AI provider is rate-limiting requests. Wait a moment and try again.');
  }
  if (response.status === 503 || response.status === 529) {
    throw new AppError('OVERLOADED', 'The AI model is overloaded right now. Try again in a moment.');
  }
  if (!response.ok) {
    // Log the provider's detail on the server; send the browser a safe summary.
    const detail = await response.text().catch(() => '');
    log('error', 'llm.provider_error', { model, status: response.status, detail: detail.slice(0, 300) });
    throw new AppError('PROVIDER_ERROR', `The AI provider returned an error (${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    if (timeout.aborted) throw new AppError('TIMEOUT', 'The AI took too long to respond.');
    throw new AppError('PROVIDER_ERROR', 'The AI provider sent an unreadable response.');
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AppError('EMPTY_RESULT', 'The AI returned an empty response.');
  }
  return content;
}
