import { describe, expect, it } from 'vitest';
import { generateStudySet, validateInput } from '../server/generate.js';

/** Await a promise and return the error code it rejects with. */
async function codeOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err.code;
  }
  throw new Error('expected a rejection');
}

describe('validateInput', () => {
  it('rejects empty and oversized input before any model call', () => {
    expect(() => validateInput('   ')).toThrow(/notes or type a topic/);
    expect(() => validateInput(undefined)).toThrow();
    expect(() => validateInput('x'.repeat(6001))).toThrow(/too long/);
  });
});

describe('generateStudySet (using the failure simulator instead of a model)', () => {
  it('returns a study set for good output on the first attempt', async () => {
    const result = await generateStudySet({ text: 'hooks', mock: 'ok' });
    expect(result.attempts).toBe(1);
    expect(result.studySet.flashcards.length).toBeGreaterThan(0);
  });

  it('salvages partially broken output and reports warnings', async () => {
    const result = await generateStudySet({ text: 'hooks', mock: 'partial' });
    expect(result.warnings.length).toBe(2);
  });

  it('maps each kind of bad output to its own error code', async () => {
    expect(await codeOf(generateStudySet({ text: 'hooks', mock: 'malformed' }))).toBe('MALFORMED_JSON');
    expect(await codeOf(generateStudySet({ text: 'hooks', mock: 'wrong-shape' }))).toBe('WRONG_SHAPE');
    expect(await codeOf(generateStudySet({ text: 'hooks', mock: 'empty' }))).toBe('EMPTY_RESULT');
    expect(await codeOf(generateStudySet({ text: 'hooks', mock: 'fail' }))).toBe('PROVIDER_ERROR');
  });

  it('stops immediately when the caller aborts', async () => {
    const controller = new AbortController();
    const pending = generateStudySet({ text: 'hooks', mock: 'slow', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});
