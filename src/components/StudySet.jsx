import { useState } from 'react';
import Flashcards from './Flashcards.jsx';
import Quiz from './Quiz.jsx';

export default function StudySet({ studySet, warnings }) {
  const hasCards = studySet.flashcards.length > 0;
  const hasQuiz = studySet.quiz.length > 0;
  const [tab, setTab] = useState(hasCards ? 'flashcards' : 'quiz');

  return (
    <section className="panel study-set">
      <h2 className="study-set__title">{studySet.title}</h2>

      {warnings.length > 0 && (
        <div className="notice" role="status">
          <strong>Heads up:</strong> part of the AI's answer was unusable and has been left out.
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Study mode">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'flashcards'} disabled={!hasCards} onClick={() => setTab('flashcards')}>
          Flashcards ({studySet.flashcards.length})
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'quiz'} disabled={!hasQuiz} onClick={() => setTab('quiz')}>
          Quiz ({studySet.quiz.length})
        </button>
      </div>

      {/* Both panels stay mounted and the inactive one is only hidden, so
          switching tabs never loses your place in the cards or the quiz.
          `isActive` tells each one whether it should react to the keyboard. */}
      {hasCards && (
        <div role="tabpanel" hidden={tab !== 'flashcards'}>
          <Flashcards cards={studySet.flashcards} isActive={tab === 'flashcards'} />
        </div>
      )}
      {hasQuiz && (
        <div role="tabpanel" hidden={tab !== 'quiz'}>
          <Quiz questions={studySet.quiz} isActive={tab === 'quiz'} />
        </div>
      )}
    </section>
  );
}
