import { useEffect, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { Logo } from './components/Icons.jsx';
import SavedSessions from './components/SavedSessions.jsx';
import { EmptyState, ErrorState, LoadingState } from './components/StatusViews.jsx';
import StudySet from './components/StudySet.jsx';
import TopicForm from './components/TopicForm.jsx';
import { useGeneration } from './hooks/useGeneration.js';
import { useSavedSessions } from './hooks/useSavedSessions.js';

export default function App() {
  const [text, setText] = useState('');
  const generation = useGeneration();
  const { sessions, saveSession, deleteSession } = useSavedSessions();
  const resultsRef = useRef(null);

  const { status, result, error, isSlow } = generation;

  // Every newly generated set is saved automatically. Opening a saved one is
  // not a new result, so it is skipped (it already has this id in storage).
  const savedIds = useRef(new Set(sessions.map((s) => s.id)));
  useEffect(() => {
    if (status === 'success' && result && !savedIds.current.has(result.id)) {
      savedIds.current.add(result.id);
      saveSession(result);
    }
  }, [status, result, saveSession]);

  function handleSubmit(value, options) {
    // Asking again for the text that is already on screen means "give me a
    // different set", so tell the server not to answer from its cache.
    const isRepeat = result !== null && result.sourceText.trim() === value.trim();
    generation.generate(value, { ...options, fresh: isRepeat });
    // On a phone the form fills the screen; bring the loading state into view.
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleOpenSession(session) {
    setText(session.sourceText);
    generation.load({ id: session.id, sourceText: session.sourceText, studySet: session.studySet, warnings: [] });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleDeleteSession(id) {
    deleteSession(id);
    if (result?.id === id) generation.clear();
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__inner">
          <p className="brand">
            <Logo />
            <span>Study Assistant</span>
          </p>
          <h1 className="hero__title">
            Turn your notes into <em>something you can study.</em>
          </h1>
          <p className="hero__lede">Paste notes or name a topic. Get flashcards to flip and a quiz that re-tests what you miss.</p>
        </div>
      </header>

      <main className="app__main">
        <TopicForm value={text} onChange={setText} onSubmit={handleSubmit} />

        <div ref={resultsRef} className="results">
          {status === 'idle' && <EmptyState />}
          {status === 'loading' && <LoadingState isSlow={isSlow} onCancel={generation.cancel} />}
          {status === 'error' && (
            <ErrorState error={error} hasPreviousResult={result !== null} onRetry={generation.retry} onDismiss={generation.cancel} />
          )}
          {status === 'success' && result && (
            // key={result.id}: a new study set gets brand-new components, so no
            // card index or quiz answer from the previous set can leak into it.
            <ErrorBoundary key={result.id} onReset={generation.clear}>
              <StudySet studySet={result.studySet} warnings={result.warnings} />
            </ErrorBoundary>
          )}
        </div>

        <SavedSessions sessions={sessions} activeId={status === 'success' ? result?.id : null} onOpen={handleOpenSession} onDelete={handleDeleteSession} />
      </main>

      <footer className="app__footer">AI-generated content can be wrong. Check anything important against your own notes.</footer>
    </div>
  );
}
