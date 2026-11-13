// The use case: study text in, trusted study set out.
// Kept separate from Express so it can be tested without starting a server.

import { LIMITS, parseStudySet, StudySetError } from '../shared/studySet.js';
import { AppError } from './errors.js';
import { callModel } from './llm.js';
import { log } from './log.js';
import { getMock } from './mocks.js';
import { buildMessages } from './prompt.js';

// Bad output and "model overloaded" are often one-offs, so one automatic retry
// fixes most cases without the user noticing. More than one would just make
// failures slower. Timeouts are NOT retried: the user has waited long enough.
const MAX_ATTEMPTS = 2;
const RETRYABLE = new Set(['MALFORMED_JSON', 'WRONG_SHAPE', 'OVERLOADED']);
const RETRY_DELAY_MS = 800;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function validateInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new AppError('EMPTY_INPUT', 'Paste some notes or type a topic first.');
  }
  if (text.length > LIMITS.inputChars) {
    throw new AppError('INPUT_TOO_LONG', `That is too long. Please keep it under ${LIMITS.inputChars} characters.`);
  }
  return text.trim();
}

export async function generateStudySet({ text, mock, signal }) {
  const studyText = validateInput(text);
  const mockCall = getMock(mock);
  const messages = buildMessages(studyText);

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const rawText = mockCall ? await mockCall(signal) : await callModel(messages, { signal, attempt });
      const { studySet, warnings } = parseStudySet(rawText);
      return { studySet, warnings, attempts: attempt };
    } catch (err) {
      // Only errors we understand are candidates for a retry; anything else
      // (including "the browser cancelled") goes straight to the caller.
      const known = err instanceof StudySetError || err instanceof AppError;
      if (!known || signal?.aborted) throw err;
      lastError = err;
      log('warn', 'generate.attempt_failed', { attempt, code: err.code });
      if (!RETRYABLE.has(err.code) || attempt === MAX_ATTEMPTS) break;
      await pause(RETRY_DELAY_MS);
    }
  }
  throw new AppError(lastError.code, lastError.message);
}
