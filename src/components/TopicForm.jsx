import { useState } from 'react';
import { LIMITS } from '../../shared/studySet.js';

const EXAMPLES = [
  'The causes of World War I',
  'JavaScript promises and async/await',
  'Photosynthesis: the light reactions and the Calvin cycle',
];

// Only offered in development; the server also ignores mocks in production.
const MOCK_OPTIONS = [
  ['', 'Off (real AI)'],
  ['ok', 'Good response'],
  ['fenced', 'JSON inside ``` fences'],
  ['partial', 'Some items broken'],
  ['malformed', 'Malformed JSON'],
  ['wrong-shape', 'Wrong shape'],
  ['empty', 'Empty result'],
  ['slow', 'Slow (8s)'],
  ['timeout', 'Timeout'],
  ['overloaded', 'Model overloaded'],
  ['rate-limit', 'Rate limited'],
  ['fail', 'Provider error'],
];

export default function TopicForm({ value, onChange, onSubmit }) {
  const [mock, setMock] = useState('');
  const [touched, setTouched] = useState(false);

  const isEmpty = value.trim() === '';
  const isTooLong = value.length > LIMITS.inputChars;
  const problem = isTooLong
    ? `Please shorten this to ${LIMITS.inputChars.toLocaleString()} characters or fewer.`
    : touched && isEmpty
      ? 'Paste some notes or type a topic first.'
      : '';

  function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    if (isEmpty || isTooLong) return;
    onSubmit(value, { mock });
  }

  function handleKeyDown(event) {
    // Ctrl+Enter / Cmd+Enter submits, plain Enter still makes a new line.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) handleSubmit(event);
  }

  return (
    <form className="panel form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="study-text" className="form__label">
        What do you want to study?
      </label>
      <textarea
        id="study-text"
        className="form__textarea"
        rows={6}
        placeholder="Paste your notes here, or just type a topic…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-invalid={problem !== ''}
        aria-describedby="study-text-help"
      />
      <div id="study-text-help" className="form__meta">
        <span className={problem ? 'form__problem' : 'form__hint'}>{problem || 'Tip: Ctrl + Enter to generate'}</span>
        <span className={isTooLong ? 'form__problem' : 'form__hint'}>
          {value.length.toLocaleString()} / {LIMITS.inputChars.toLocaleString()}
        </span>
      </div>

      {isEmpty && (
        <div className="chips" aria-label="Example topics">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" onClick={() => onChange(example)}>
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="form__actions">
        <button type="submit" className="btn btn--primary">
          Generate study set
        </button>
        {import.meta.env.DEV && (
          <label className="form__mock">
            <span>Failure simulator (dev only)</span>
            <select value={mock} onChange={(event) => setMock(event.target.value)}>
              {MOCK_OPTIONS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </form>
  );
}
