import { describeError } from '../errorCopy.js';

export function EmptyState() {
  return (
    <section className="panel status">
      <h2>Nothing to study yet</h2>
      <p>Paste your notes or type a topic above. You will get flashcards to flip through and a quiz that re-tests whatever you get wrong.</p>
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
      <p role="status">
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
      <h2>{title}</h2>
      <p>{hint}</p>
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
      <p className="status__detail">Your text is still in the box above.</p>
    </section>
  );
}
