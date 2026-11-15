// Recent study sets, kept in localStorage so a refresh does not lose them.
// localStorage is user-editable and can hold data from an older version of
// the app, so it gets the same treatment as model output: validate on the way in.

import { useCallback, useState } from 'react';
import { normalizeStudySet } from '../../shared/studySet.js';

const STORAGE_KEY = 'study-assistant:sessions:v1';
const MAX_SESSIONS = 8;

function readSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const sessions = [];
    for (const storedSession of stored) {
      try {
        if (typeof storedSession?.id !== 'string') continue;
        const { studySet } = normalizeStudySet(storedSession.studySet);
        sessions.push({
          id: storedSession.id,
          savedAt: typeof storedSession.savedAt === 'number' ? storedSession.savedAt : 0,
          sourceText: typeof storedSession.sourceText === 'string' ? storedSession.sourceText : '',
          studySet,
        });
      } catch {
        // skip a corrupted entry, keep the rest
      }
    }
    return sessions.slice(0, MAX_SESSIONS);
  } catch {
    return []; // storage blocked (private mode) or not JSON at all
  }
}

function writeSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Quota exceeded or storage disabled: saving is a nice-to-have, never crash for it.
  }
}

export function useSavedSessions() {
  const [sessions, setSessions] = useState(readSessions);

  const saveSession = useCallback((result) => {
    setSessions((current) => {
      const newSession = { id: result.id, savedAt: Date.now(), sourceText: result.sourceText, studySet: result.studySet };
      const updated = [newSession, ...current.filter((session) => session.id !== result.id)].slice(0, MAX_SESSIONS);
      writeSessions(updated);
      return updated;
    });
  }, []);

  const deleteSession = useCallback((id) => {
    setSessions((current) => {
      const remaining = current.filter((session) => session.id !== id);
      writeSessions(remaining);
      return remaining;
    });
  }, []);

  return { sessions, saveSession, deleteSession };
}
