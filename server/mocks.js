// Development-only failure simulator.
//
// Real models misbehave rarely and unpredictably, which makes failure handling
// hard to test and impossible to demo. Each mock below stands in for the model
// call and returns (or throws) exactly one kind of bad behaviour. Everything
// AFTER the model call - parsing, validation, retry, error mapping, the UI -
// is the real code path.

import { AppError } from './errors.js';

const sample = {
  title: 'React hooks basics',
  flashcards: [
    { front: 'What does useState return?', back: 'An array with the current state value and a function to update it.' },
    { front: 'When does useEffect run?', back: 'After the component renders, and again whenever one of its dependencies changes.' },
    { front: 'What is useRef for?', back: 'Holding a mutable value that survives re-renders without causing one.' },
    { front: 'What is a custom hook?', back: 'A function starting with "use" that calls other hooks to share stateful logic.' },
  ],
  quiz: [
    {
      question: 'Which hook should you use to store a value that changes what the UI shows?',
      options: ['useRef', 'useState', 'useMemo', 'useId'],
      answerIndex: 1,
      explanation: 'Updating state triggers a re-render; updating a ref does not.',
    },
    {
      question: 'What does the function returned from a useEffect callback do?',
      options: ['Runs before the first render', 'Cancels the render', 'Cleans up the effect', 'Updates the state'],
      answerIndex: 2,
      explanation: 'React calls it before re-running the effect and when the component unmounts.',
    },
    {
      question: 'Where can hooks be called?',
      options: ['Inside loops', 'Inside conditions', 'In any function', 'At the top level of a component or custom hook'],
      answerIndex: 3,
      explanation: 'Hooks rely on being called in the same order on every render.',
    },
  ],
};

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

const MOCKS = {
  ok: async () => JSON.stringify(sample),
  // Valid JSON but wrapped the way chatty models like to wrap it. Should succeed.
  fenced: async () => 'Sure! Here is your study set:\n```json\n' + JSON.stringify(sample, null, 2) + '\n```\nHappy studying!',
  // Some items are broken. Should succeed with a warning about skipped items.
  partial: async () =>
    JSON.stringify({
      ...sample,
      flashcards: [...sample.flashcards, { front: 'Card with no back' }, 'not even an object'],
      quiz: [...sample.quiz, { question: 'Broken?', options: ['Yes', 'No'], answerIndex: 9, explanation: '' }],
    }),
  // Output cut off mid-way, e.g. the model hit its token limit.
  malformed: async () => JSON.stringify(sample).slice(0, 180),
  // Valid JSON, wrong structure.
  'wrong-shape': async () => JSON.stringify({ answer: 'Hooks let you use state in function components.' }),
  empty: async () => JSON.stringify({ title: '', flashcards: [], quiz: [] }),
  slow: async (signal) => {
    await wait(8000, signal);
    return JSON.stringify({ ...sample, title: 'Slow response (8s)' });
  },
  timeout: async (signal) => {
    await wait(4000, signal);
    throw new AppError('TIMEOUT', 'The AI took too long to respond.');
  },
  'rate-limit': async () => {
    throw new AppError('RATE_LIMITED', 'The AI provider is rate-limiting requests. Wait a moment and try again.');
  },
  overloaded: async () => {
    throw new AppError('OVERLOADED', 'The AI model is overloaded right now. Try again in a moment.');
  },
  fail: async () => {
    throw new AppError('PROVIDER_ERROR', 'The AI provider returned an error (500).');
  },
};

// Off unless explicitly switched on: `npm start` passes --dev, and the test
// runner sets NODE_ENV=test. A server started any other way (including one
// deployed without NODE_ENV=production by mistake) ignores mock requests.
export const mocksEnabled =
  process.env.NODE_ENV !== 'production' && (process.argv.includes('--dev') || process.env.NODE_ENV === 'test');

/** Returns a function to use instead of the model call, or null for "use the real model". */
export function getMock(name) {
  if (!mocksEnabled || typeof name !== 'string') return null;
  return MOCKS[name] ?? null;
}
