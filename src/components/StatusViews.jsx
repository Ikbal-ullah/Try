import { describeError } from '../errorCopy.js';
import { Alert } from './Icons.jsx';

const STEPS = [
  ['Add your material', 'Paste lecture notes, a chapter summary, or just the name of a topic.'],
  ['Flip through the cards', 'Key ideas become flashcards. Flip, shuffle and move at your own pace.'],
  ['Quiz, then fix your misses', 'Answer the questions, see why, and re-test only the ones you got wrong.'],
];

export function EmptyState() {
  return (
    <section className="panel how">
      <h2 className="eyebrow">How it works</h2>
      <ol className="how__steps">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="how__step">
            <span className="how__number" aria-hidden="true">{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LoadingState({ isSlow, onCancel }) {
  return (
    <section className="panel status" aria-busy="true">
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__line skeleton__line--title" />
        <div className="skeleton__card" />
        <div className="skeleton__line" />
      </div>
      {/* role="status" makes screen readers announce the text when it changes */}
      <p role="status" className="status__text">
        {isSlow ? 'Still working… free AI models can take up to half a minute.' : 'Writing your flashcards and quiz…'}
      </p>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}

export function ErrorState({ error, hasPreviousResult, onRetry, onDismiss }) {
  const { title, hint, retryable } = describeError(error);
  return (
    <section className="panel status status--error" role="alert">
      <h2 className="status__title">
        <Alert size={20} />
        {title}
      </h2>
      <p className="status__text">{hint}</p>
      <div className="button-row">
        {retryable && (
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Try again
          </button>
        )}
        {hasPreviousResult && (
          <button type="button" className="btn" onClick={onDismiss}>
            Back to my previous set
          </button>
        )}
      </div>
      <p className="status__detail">
        Your text is still in the box above.
        {/* A short reference a user can quote; it matches a line in the server logs. */}
        {error?.requestId && <span> Reference: {error.requestId.slice(0, 8)}</span>}
      </p>
    </section>
  );
}
