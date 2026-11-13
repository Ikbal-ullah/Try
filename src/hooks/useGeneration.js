// Owns the whole "ask the AI for a study set" lifecycle:
// loading / success / error state, cancelling, timing out, retrying, and the
// guarantee that an old response can never overwrite a newer one.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { requestStudySet } from '../api/studyApi.js';
import { generationReducer, initialState } from './generationReducer.js';

const SLOW_AFTER_MS = 6_000; // when to say "still working..."
const GIVE_UP_AFTER_MS = 75_000; // browser-side safety net; the server has its own, shorter timeouts

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useGeneration() {
  const [state, dispatch] = useReducer(generationReducer, initialState);

  // Refs, not state: changing them must not re-render, and async code needs
  // to read the CURRENT value, not the one captured when the request started.
  const latestRequestId = useRef(0);
  const controllerRef = useRef(null);
  const lastRequestRef = useRef(null);

  /** Make whatever request is in flight irrelevant: abort it and outdate its id. */
  const invalidateInFlight = useCallback(() => {
    latestRequestId.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const generate = useCallback(
    async (text, { mock = '', fresh = false } = {}) => {
      invalidateInFlight();
      const requestId = latestRequestId.current;
      const isLatest = () => requestId === latestRequestId.current;

      const controller = new AbortController();
      controllerRef.current = controller;
      lastRequestRef.current = { text, mock, fresh };

      let timedOut = false;
      const slowTimer = setTimeout(() => isLatest() && dispatch({ type: 'slow' }), SLOW_AFTER_MS);
      const giveUpTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, GIVE_UP_AFTER_MS);

      dispatch({ type: 'start' });

      try {
        const { studySet, warnings } = await requestStudySet({ text, mock, fresh, signal: controller.signal });
        // THE stale-response guard. If the user has started another request
        // (or cancelled) while we were waiting, this answer is dropped.
        if (!isLatest()) return;
        dispatch({ type: 'success', result: { id: makeId(), sourceText: text, studySet, warnings } });
      } catch (err) {
        if (!isLatest()) return; // superseded or cancelled: not an error the user should see
        const error = timedOut
          ? { code: 'TIMEOUT', message: 'The AI took too long to respond.' }
          : { code: err.code ?? 'UNKNOWN', message: err.message || 'Something went wrong.', requestId: err.requestId };
        dispatch({ type: 'failure', error });
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(giveUpTimer);
      }
    },
    [invalidateInFlight],
  );

  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (last) generate(last.text, { mock: last.mock, fresh: last.fresh });
  }, [generate]);

  /** Stop waiting (or dismiss an error) and go back to the previous result, if any. */
  const cancel = useCallback(() => {
    invalidateInFlight();
    dispatch({ type: 'cancel' });
  }, [invalidateInFlight]);

  const load = useCallback(
    (result) => {
      invalidateInFlight();
      dispatch({ type: 'load', result });
    },
    [invalidateInFlight],
  );

  const clear = useCallback(() => {
    invalidateInFlight();
    dispatch({ type: 'clear' });
  }, [invalidateInFlight]);

  // If the component goes away mid-request, stop the request with it.
  useEffect(() => invalidateInFlight, [invalidateInFlight]);

  return { ...state, generate, retry, cancel, load, clear };
}
