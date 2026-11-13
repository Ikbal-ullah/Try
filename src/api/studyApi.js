// The browser's only door to the backend. It turns every possible outcome of
// the HTTP call into either a trusted result or an ApiError with a code -
// components never see a raw Response or an unvalidated object.

import { normalizeStudySet } from '../../shared/studySet.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function requestStudySet({ text, mock, signal }) {
  let response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mock: mock || undefined }),
      signal,
    });
  } catch (err) {
    // Aborts are not failures - the hook decides what an abort means.
    if (err.name === 'AbortError' || signal?.aborted) throw err;
    throw new ApiError('NETWORK', 'Could not reach the server. Check your connection and try again.');
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) throw err;
    // e.g. the dev proxy answering with an HTML error page because the API is down
    throw new ApiError('BAD_RESPONSE', 'The server sent an unreadable response. Is the API server running?');
  }

  if (!response.ok) {
    const code = typeof body?.error?.code === 'string' ? body.error.code : 'UNKNOWN';
    const message = typeof body?.error?.message === 'string' ? body.error.message : 'Something went wrong.';
    throw new ApiError(code, message);
  }

  // The server already validated this, but the browser should not have to
  // take that on faith. Same validator, second checkpoint.
  let checked;
  try {
    checked = normalizeStudySet(body?.studySet);
  } catch (err) {
    throw new ApiError(err.code ?? 'WRONG_SHAPE', err.message);
  }

  const serverWarnings = Array.isArray(body.warnings) ? body.warnings.filter((w) => typeof w === 'string') : [];
  return { studySet: checked.studySet, warnings: [...serverWarnings, ...checked.warnings] };
}
