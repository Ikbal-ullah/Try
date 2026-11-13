const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function SavedSessions({ sessions, activeId, onOpen, onDelete }) {
  if (sessions.length === 0) return null;
  return (
    <section className="panel saved">
      <h2 className="saved__heading">Recent study sets</h2>
      <p className="form__hint">Saved in this browser only.</p>
      <ul className="saved__list">
        {sessions.map((session) => (
          <li key={session.id} className={`saved__item ${session.id === activeId ? 'is-active' : ''}`}>
            <button type="button" className="saved__open" onClick={() => onOpen(session)} aria-current={session.id === activeId}>
              <span className="saved__title">{session.studySet.title}</span>
              <span className="saved__meta">
                {session.studySet.flashcards.length} cards · {session.studySet.quiz.length} questions
                {session.savedAt > 0 && ` · ${dateFormat.format(session.savedAt)}`}
              </span>
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => onDelete(session.id)} aria-label={`Delete ${session.studySet.title}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
