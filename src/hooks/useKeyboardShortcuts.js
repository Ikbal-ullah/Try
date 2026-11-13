import { useEffect, useRef } from 'react';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Call handlers[key] when that key is pressed anywhere on the page - unless
 * the user is typing in a field or holding a modifier (so Ctrl+R still reloads).
 * Example: useKeyboardShortcuts({ ArrowRight: next, ArrowLeft: previous })
 */
export function useKeyboardShortcuts(handlers) {
  // Keep the latest handlers in a ref so the listener is attached only once
  // but never calls an outdated function.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (TYPING_TAGS.has(event.target.tagName)) return;
      const handler = handlersRef.current[event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
