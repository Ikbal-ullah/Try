import { describe, expect, it } from 'vitest';
import { generationReducer, initialState } from '../src/hooks/generationReducer.js';

const result = { id: 'a', sourceText: 'hooks', studySet: { title: 'Hooks', flashcards: [], quiz: [] }, warnings: [] };
const error = { code: 'TIMEOUT', message: 'Too slow' };
const run = (...actions) => actions.reduce(generationReducer, initialState);

describe('generationReducer', () => {
  it('goes idle -> loading -> success', () => {
    expect(run({ type: 'start' }).status).toBe('loading');
    const done = run({ type: 'start' }, { type: 'success', result });
    expect(done.status).toBe('success');
    expect(done.result).toBe(result);
  });

  it('keeps the previous result while a new request loads or fails', () => {
    const failed = run({ type: 'start' }, { type: 'success', result }, { type: 'start' }, { type: 'failure', error });
    expect(failed.status).toBe('error');
    expect(failed.error).toBe(error);
    expect(failed.result).toBe(result);
  });

  it('cancel returns to the previous result, or to idle when there is none', () => {
    expect(run({ type: 'start' }, { type: 'cancel' }).status).toBe('idle');
    const back = run({ type: 'start' }, { type: 'success', result }, { type: 'start' }, { type: 'cancel' });
    expect(back.status).toBe('success');
    expect(back.result).toBe(result);
  });

  it('only flags "slow" while loading', () => {
    expect(run({ type: 'slow' }).isSlow).toBe(false);
    expect(run({ type: 'start' }, { type: 'slow' }).isSlow).toBe(true);
    expect(run({ type: 'start' }, { type: 'slow' }, { type: 'success', result }).isSlow).toBe(false);
  });
});
