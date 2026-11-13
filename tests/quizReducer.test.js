import { describe, expect, it } from 'vitest';
import { quizReducer, startQuiz } from '../src/components/quizReducer.js';

const ids = ['q-0', 'q-1', 'q-2'];
const play = (state, ...actions) => actions.reduce(quizReducer, state);
const right = { type: 'answer', optionIndex: 0, isCorrect: true };
const wrong = { type: 'answer', optionIndex: 1, isCorrect: false };
const next = { type: 'next' };

describe('quizReducer', () => {
  it('ignores a second answer to the same question', () => {
    const state = play(startQuiz(ids), wrong, right);
    expect(state.selected).toBe(1);
    expect(state.wrongIds).toEqual(['q-0']);
  });

  it('does not advance until the question is answered', () => {
    expect(play(startQuiz(ids), next).position).toBe(0);
  });

  it('shows results after the last question', () => {
    const state = play(startQuiz(ids), right, next, wrong, next, right, next);
    expect(state.phase).toBe('results');
    expect(state.wrongIds).toEqual(['q-1']);
  });

  it('re-tests only the wrong answers in a new round', () => {
    const finished = play(startQuiz(ids), wrong, next, right, next, wrong, next);
    const retest = quizReducer(finished, { type: 'retest-wrong' });
    expect(retest.queue).toEqual(['q-0', 'q-2']);
    expect(retest.round).toBe(2);
    expect(retest.phase).toBe('asking');
    expect(retest.wrongIds).toEqual([]);
  });

  it('has nothing to re-test after a perfect round', () => {
    const finished = play(startQuiz(ids), right, next, right, next, right, next);
    expect(quizReducer(finished, { type: 'retest-wrong' })).toBe(finished);
  });
});
