// Recent study sets, kept in localStorage so a refresh does not lose them.
// localStorage is user-editable and can hold data from an older version of
// the app, so it gets the same treatment as model output: validate on the way in.

import { useCallback, useState } from 'react';
import { normalizeStudySet } from '../../shared/studySet.js';

const STORAGE_KEY = 'study-assistant:sessions:v1';
const MAX_SESSIONS = 8;

function readSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const sessions = [];
    for (const item of parsed) {
      try {
        if (typeof item?.id !== 'string') continue;
        const { studySet } = normalizeStudySet(item.studySet);
        sessions.push({
          id: item.id,
          savedAt: typeof item.savedAt === 'number' ? item.savedAt : 0,
          sourceText: typeof item.sourceText === 'string' ? item.sourceText : '',
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
      const entry = { id: result.id, savedAt: Date.now(), sourceText: result.sourceText, studySet: result.studySet };
      const next = [entry, ...current.filter((s) => s.id !== result.id)].slice(0, MAX_SESSIONS);
      writeSessions(next);
      return next;
    });
  }, []);

  const deleteSession = useCallback((id) => {
    setSessions((current) => {
      const next = current.filter((s) => s.id !== id);
      writeSessions(next);
      return next;
    });
  }, []);

  return { sessions, saveSession, deleteSession };
}
