import { describe, expect, it } from 'vitest';
import { extractJson, normalizeStudySet, parseStudySet, StudySetError } from '../shared/studySet.js';

const card = { front: 'What is a hook?', back: 'A function that lets components use React features.' };
const question = {
  question: 'Which hook stores state?',
  options: ['useState', 'useEffect', 'useRef'],
  answerIndex: 0,
  explanation: 'useState returns a value and a setter.',
};
const valid = { title: 'React hooks', flashcards: [card], quiz: [question] };

/** Run fn and return the StudySetError code it throws. */
function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(StudySetError);
    return err.code;
  }
  throw new Error('expected a StudySetError');
}

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson(JSON.stringify(valid))).toEqual(valid);
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw = 'Sure! Here you go:\n```json\n' + JSON.stringify(valid) + '\n```\nGood luck!';
    expect(extractJson(raw)).toEqual(valid);
  });

  it('parses JSON surrounded by prose with no fence', () => {
    expect(extractJson('Here is the set: ' + JSON.stringify(valid) + ' Enjoy.')).toEqual(valid);
  });

  it('rejects truncated JSON', () => {
    const truncated = JSON.stringify(valid).slice(0, 60);
    expect(codeOf(() => extractJson(truncated))).toBe('MALFORMED_JSON');
  });

  it('rejects empty text', () => {
    expect(codeOf(() => extractJson('   '))).toBe('EMPTY_RESULT');
  });
});

describe('normalizeStudySet', () => {
  it('accepts a valid set and assigns its own ids', () => {
    const { studySet, warnings } = normalizeStudySet(valid);
    expect(warnings).toEqual([]);
    expect(studySet.flashcards[0].id).toBe('card-0');
    expect(studySet.quiz[0].id).toBe('q-0');
  });

  it('rejects values that are not an object with the expected keys', () => {
    expect(codeOf(() => normalizeStudySet('just text'))).toBe('WRONG_SHAPE');
    expect(codeOf(() => normalizeStudySet([valid]))).toBe('WRONG_SHAPE');
    expect(codeOf(() => normalizeStudySet({ answer: 'Hooks are great' }))).toBe('WRONG_SHAPE');
  });

  it('reports an empty result when the model sent no items', () => {
    expect(codeOf(() => normalizeStudySet({ flashcards: [], quiz: [] }))).toBe('EMPTY_RESULT');
  });

  it('keeps valid items and warns about dropped ones', () => {
    const { studySet, warnings } = normalizeStudySet({
      flashcards: [card, { front: 'No back' }, null],
      quiz: [question],
    });
    expect(studySet.flashcards).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/2 flashcard/);
  });

  it('drops a question whose answerIndex is out of range', () => {
    const { studySet } = normalizeStudySet({ flashcards: [card], quiz: [{ ...question, answerIndex: 7 }] });
    expect(studySet.quiz).toHaveLength(0);
  });

  it('drops a question with duplicate options', () => {
    const { studySet } = normalizeStudySet({
      flashcards: [card],
      quiz: [{ ...question, options: ['useState', 'usestate', 'useRef'] }],
    });
    expect(studySet.quiz).toHaveLength(0);
  });

  it('accepts a numeric string answerIndex but not null', () => {
    const asString = normalizeStudySet({ quiz: [{ ...question, answerIndex: '1' }] });
    expect(asString.studySet.quiz[0].answerIndex).toBe(1);
    expect(codeOf(() => normalizeStudySet({ quiz: [{ ...question, answerIndex: null }] }))).toBe('WRONG_SHAPE');
  });

  it('falls back to a default title and an empty explanation', () => {
    const { studySet } = normalizeStudySet({ quiz: [{ ...question, explanation: 42 }] });
    expect(studySet.title).toBe('Study set');
    expect(studySet.quiz[0].explanation).toBe('');
  });
});

describe('parseStudySet', () => {
  it('goes from raw model text to a trusted study set', () => {
    const { studySet } = parseStudySet('```json\n' + JSON.stringify(valid) + '\n```');
    expect(studySet.title).toBe('React hooks');
  });
});
