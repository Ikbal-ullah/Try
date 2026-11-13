import { useEffect, useReducer, useRef } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { ArrowRight, Check, Cross } from './Icons.jsx';
import { quizReducer, startQuiz } from './quizReducer.js';

export default function Quiz({ questions, isActive }) {
  const allIds = questions.map((q) => q.id);
  const [state, dispatch] = useReducer(quizReducer, allIds, startQuiz);
  const nextButtonRef = useRef(null);

  const question = questions.find((q) => q.id === state.queue[state.position]);
  const hasAnswered = state.selected !== null;

  function answer(optionIndex) {
    if (optionIndex >= question.options.length) return;
    dispatch({ type: 'answer', optionIndex, isCorrect: optionIndex === question.answerIndex });
  }

  // After answering, move focus to "Next" so keyboard users can just press Enter.
  useEffect(() => {
    if (hasAnswered) nextButtonRef.current?.focus();
  }, [hasAnswered]);

  // Number keys pick an option while a question is waiting for an answer.
  const canPick = isActive && state.phase === 'asking' && !hasAnswered;
  useKeyboardShortcuts(
    canPick ? Object.fromEntries(question.options.map((_, i) => [String(i + 1), () => answer(i)])) : {},
  );

  if (state.phase === 'results') {
    const total = state.queue.length;
    const correct = total - state.wrongIds.length;
    const wrongQuestions = questions.filter((q) => state.wrongIds.includes(q.id));
    return (
      <div className="quiz">
        <div className="score">
          <p className="score__number">
            {correct}
            <span>/{total}</span>
          </p>
          <div>
            <h3 className="quiz__score">
              {correct} of {total} correct
              {state.round > 1 && <span className="quiz__round"> · round {state.round}</span>}
            </h3>
            <progress value={correct} max={total} aria-hidden="true" />
          </div>
        </div>

        {wrongQuestions.length === 0 ? (
          <p>{state.round > 1 ? 'You fixed every one you missed. Nicely done.' : 'A perfect round. Nicely done.'}</p>
        ) : (
          <>
            <p>Worth another look:</p>
            <ul className="review-list">
              {wrongQuestions.map((q) => (
                <li key={q.id}>
                  <strong>{q.question}</strong>
                  <span>Answer: {q.options[q.answerIndex]}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="button-row">
          {wrongQuestions.length > 0 && (
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'retest-wrong' })}>
              Re-test {wrongQuestions.length} wrong {wrongQuestions.length === 1 ? 'answer' : 'answers'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => dispatch({ type: 'restart', questionIds: allIds })}>
            Restart full quiz
          </button>
        </div>
      </div>
    );
  }

  const isCorrect = state.selected === question.answerIndex;
  const isLastQuestion = state.position === state.queue.length - 1;

  return (
    <div className="quiz">
      <div className="progress">
        <span>
          Question {state.position + 1} of {state.queue.length}
          {state.round > 1 && ` · re-test round ${state.round}`}
        </span>
        <progress value={state.position + (hasAnswered ? 1 : 0)} max={state.queue.length} aria-hidden="true" />
      </div>
      <h3 className="quiz__question">{question.question}</h3>

      <ol className="options">
        {question.options.map((option, i) => {
          // Colour is never the only signal: each state also gets a text label.
          let stateClass = '';
          let label = '';
          if (hasAnswered && i === question.answerIndex) {
            stateClass = 'is-correct';
            label = 'Correct answer';
          } else if (hasAnswered && i === state.selected) {
            stateClass = 'is-wrong';
            label = 'Your answer';
          }
          return (
            <li key={option}>
              <button type="button" className={`option ${stateClass}`} onClick={() => answer(i)} disabled={hasAnswered}>
                <span className="option__key" aria-hidden="true">{i + 1}</span>
                <span className="option__text">{option}</span>
                {label && (
                  <span className="option__label">
                    {stateClass === 'is-correct' ? <Check size={14} /> : <Cross size={14} />}
                    {label}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {hasAnswered && (
        <div className={`feedback ${isCorrect ? 'feedback--correct' : 'feedback--wrong'}`} role="status">
          <strong>{isCorrect ? 'Correct.' : 'Not quite.'}</strong>
          {question.explanation && <span> {question.explanation}</span>}
        </div>
      )}

      <div className="button-row button-row--end">
        <button ref={nextButtonRef} type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'next' })} disabled={!hasAnswered}>
          {isLastQuestion ? 'See results' : 'Next question'}
          <ArrowRight />
        </button>
      </div>
      <p className="keyboard-hint">Keyboard: 1–{question.options.length} to answer, Enter for next</p>
    </div>
  );
}
