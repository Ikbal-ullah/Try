import { useState } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { ArrowLeft, ArrowRight, Flip, Shuffle } from './Icons.jsx';

/** Fisher-Yates shuffle on a copy; the original array is never mutated. */
function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function Flashcards({ cards, isActive }) {
  const [deck, setDeck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const card = deck[index];
  const isFirst = index === 0;
  const isLast = index === deck.length - 1;

  function goTo(nextIndex) {
    if (nextIndex < 0 || nextIndex >= deck.length) return;
    setIndex(nextIndex);
    setIsFlipped(false); // always land on the question side
  }

  function shuffle() {
    setDeck(shuffled(deck));
    setIndex(0);
    setIsFlipped(false);
  }

  useKeyboardShortcuts(
    isActive ? { ArrowRight: () => goTo(index + 1), ArrowLeft: () => goTo(index - 1) } : {},
  );

  return (
    <div className="flashcards">
      <div className="progress">
        <span aria-live="polite">
          Card {index + 1} of {deck.length}
        </span>
        <progress value={index + 1} max={deck.length} aria-hidden="true" />
      </div>

      {/* A real <button>, so Enter and Space flip it without any extra code. */}
      <button
        type="button"
        className={`flashcard ${isFlipped ? 'is-flipped' : ''}`}
        onClick={() => setIsFlipped((flipped) => !flipped)}
        aria-label={isFlipped ? 'Showing the answer. Press to see the question.' : 'Showing the question. Press to see the answer.'}
      >
        <span className="flashcard__inner">
          <span className="flashcard__face flashcard__face--front" aria-hidden={isFlipped}>
            <span className="flashcard__tag">Question</span>
            <span className="flashcard__text">{card.front}</span>
            <span className="flashcard__hint">
              <Flip size={14} /> Tap to see the answer
            </span>
          </span>
          <span className="flashcard__face flashcard__face--back" aria-hidden={!isFlipped}>
            <span className="flashcard__tag">Answer</span>
            <span className="flashcard__text">{card.back}</span>
            <span className="flashcard__hint">
              <Flip size={14} /> Tap to flip back
            </span>
          </span>
        </span>
      </button>

      <div className="card-nav">
        <button type="button" className="btn" onClick={() => goTo(index - 1)} disabled={isFirst} aria-label="Previous card">
          <ArrowLeft />
          <span className="btn__label">Previous</span>
        </button>
        <button type="button" className="btn btn--quiet" onClick={shuffle} disabled={deck.length < 2}>
          <Shuffle />
          Shuffle
        </button>
        <button type="button" className="btn" onClick={() => goTo(index + 1)} disabled={isLast} aria-label="Next card">
          <span className="btn__label">Next</span>
          <ArrowRight />
        </button>
      </div>
      <p className="keyboard-hint">Keyboard: ← → to move, Enter or Space to flip</p>
    </div>
  );
}
