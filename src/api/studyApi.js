// The browser's only door to the backend. It turns every possible outcome of
// the HTTP call into either a trusted result or an ApiError with a code -
// components never see a raw Response or an unvalidated object.

import { normalizeStudySet } from '../../shared/studySet.js';

export class ApiError extends Error {
  constructor(code, message, requestId) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId; // lets a user's report be matched to a server log line
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

  let responseBody;
  try {
    responseBody = await response.json();
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) throw err;
    // e.g. the dev proxy answering with an HTML error page because the API is down
    throw new ApiError('BAD_RESPONSE', 'The server sent an unreadable response. Is the API server running?');
  }

  if (!response.ok) {
    const { code, message, requestId } = responseBody?.error ?? {};
    throw new ApiError(
      typeof code === 'string' ? code : 'UNKNOWN',
      typeof message === 'string' ? message : 'Something went wrong.',
      typeof requestId === 'string' ? requestId : undefined,
    );
  }

  // The server already validated this, but the browser should not have to
  // take that on faith. Same validator, second checkpoint.
  let validated;
  try {
    validated = normalizeStudySet(responseBody?.studySet);
  } catch (err) {
    throw new ApiError(err.code ?? 'WRONG_SHAPE', err.message);
  }

  const serverWarnings = Array.isArray(responseBody.warnings)
    ? responseBody.warnings.filter((warning) => typeof warning === 'string')
    : [];
  return { studySet: validated.studySet, warnings: [...serverWarnings, ...validated.warnings] };
}
