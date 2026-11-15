// The single place that turns "whatever the model said" into data the UI can trust.
//
// This file is shared: the server uses it on the raw model text, the browser
// uses it again on the server response and on anything loaded from localStorage.
// Nothing reaches a React component without passing through normalizeStudySet().

import { z } from 'zod';

export const LIMITS = {
  inputChars: 6000,
  flashcards: 30,
  quiz: 20,
};

/** An error with a machine-readable code the UI can map to a helpful message. */
export class StudySetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StudySetError';
    this.code = code;
  }
}

/**
 * Models often wrap JSON in ```json fences or add a sentence before/after it.
 * We try the strict parse first, then progressively more forgiving ones.
 * If nothing works we throw MALFORMED_JSON - we never guess at broken JSON.
 */
export function extractJson(rawText) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    throw new StudySetError('EMPTY_RESULT', 'The AI returned an empty response.');
  }

  const candidates = [rawText.trim()];

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());

  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(rawText.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  throw new StudySetError('MALFORMED_JSON', 'The AI response was not valid JSON.');
}

const nonEmptyText = (maxChars) => z.string().trim().min(1).max(maxChars);

const FlashcardSchema = z.object({
  front: nonEmptyText(300),
  back: nonEmptyText(600),
});

// Accept 2 or "2" for the answer index, but nothing else. We deliberately do
// NOT coerce null/true/"" to a number: a silently wrong answer key is worse
// than a dropped question.
const AnswerIndexSchema = z.union([
  z.number().int().min(0),
  z.string().trim().regex(/^\d+$/).transform(Number),
]);

const QuizQuestionSchema = z
  .object({
    question: nonEmptyText(400),
    options: z.array(nonEmptyText(200)).min(2).max(6),
    answerIndex: AnswerIndexSchema,
    explanation: z.string().trim().max(600).catch(''),
  })
  .refine((question) => question.answerIndex < question.options.length, {
    message: 'answerIndex points outside the options list',
  })
  .refine((question) => new Set(question.options.map((option) => option.toLowerCase())).size === question.options.length, {
    message: 'duplicate options',
  });

/** Keep the valid items, count the invalid ones. One bad card should not sink the whole set. */
function salvage(items, schema, maxItems) {
  const kept = [];
  let dropped = 0;
  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) kept.push(result.data);
    else dropped += 1;
  }
  return { kept: kept.slice(0, maxItems), dropped };
}

/**
 * Validate and clean a parsed (but still untrusted) study set.
 * Returns { studySet, warnings } or throws StudySetError (WRONG_SHAPE | EMPTY_RESULT).
 */
export function normalizeStudySet(rawStudySet) {
  if (rawStudySet === null || typeof rawStudySet !== 'object' || Array.isArray(rawStudySet)) {
    throw new StudySetError('WRONG_SHAPE', 'The AI response was not in the expected format.');
  }

  const hasCards = Array.isArray(rawStudySet.flashcards);
  const hasQuiz = Array.isArray(rawStudySet.quiz);
  if (!hasCards && !hasQuiz) {
    throw new StudySetError('WRONG_SHAPE', 'The AI response was missing flashcards and quiz questions.');
  }

  const cards = salvage(hasCards ? rawStudySet.flashcards : [], FlashcardSchema, LIMITS.flashcards);
  const quiz = salvage(hasQuiz ? rawStudySet.quiz : [], QuizQuestionSchema, LIMITS.quiz);

  if (cards.kept.length === 0 && quiz.kept.length === 0) {
    // Everything was invalid -> shape problem. Nothing was sent at all -> empty.
    if (cards.dropped + quiz.dropped > 0) {
      throw new StudySetError('WRONG_SHAPE', 'None of the generated items were usable.');
    }
    throw new StudySetError('EMPTY_RESULT', 'The AI could not create any study material from that input.');
  }

  const warnings = [];
  if (cards.dropped > 0) warnings.push(`${cards.dropped} flashcard(s) were skipped because they were incomplete.`);
  if (quiz.dropped > 0) warnings.push(`${quiz.dropped} quiz question(s) were skipped because they were invalid.`);

  const title =
    typeof rawStudySet.title === 'string' && rawStudySet.title.trim() !== ''
      ? rawStudySet.title.trim().slice(0, 120)
      : 'Study set';

  return {
    studySet: {
      title,
      // We assign ids ourselves. Model-provided ids can be missing or duplicated,
      // and React keys / quiz bookkeeping need them to be stable and unique.
      flashcards: cards.kept.map((card, i) => ({ id: `card-${i}`, ...card })),
      quiz: quiz.kept.map((question, i) => ({ id: `q-${i}`, ...question })),
    },
    warnings,
  };
}

/** Raw model text in, trusted study set out. */
export function parseStudySet(rawText) {
  return normalizeStudySet(extractJson(rawText));
}
