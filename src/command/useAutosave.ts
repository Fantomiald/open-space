import { useCallback, useEffect, useRef, useState } from 'react';

/** `problem`: why the draft cannot be saved as it is (no first name, no folder), shown until it changes. */
export type SaveStatus = { state: 'saved' | 'pending' } | { state: 'blocked'; problem: string };

/**
 * Saves a draft by itself, a moment after the user stops changing it, and at once when the editor closes: no button to
 * forget. `save` sends the draft and returns null, or returns why it cannot. `keyOf` tells drafts apart (what is not in
 * it, like who the draft was loaded from, does not call for a save).
 * `start` makes a draft the saved one without saving it: another member picked, or one just removed.
 */
export function useAutosave<T>(draft: T, save: (draft: T) => string | null, keyOf: (draft: T) => string = JSON.stringify, delayMs = 500) {
  const [status, setStatus] = useState<SaveStatus>({ state: 'saved' });
  const savedKey = useRef(keyOf(draft));
  const latest = useRef({ draft, save, keyOf });
  latest.current = { draft, save, keyOf };
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const { draft: current, save: send, keyOf: key } = latest.current;
    if (key(current) === savedKey.current) return;
    const problem = send(current);
    if (problem) { setStatus({ state: 'blocked', problem }); return; }
    savedKey.current = key(current);
    setStatus({ state: 'saved' });
  }, []);

  const start = useCallback((next: T) => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    savedKey.current = latest.current.keyOf(next);
    setStatus({ state: 'saved' });
  }, []);

  const key = keyOf(draft);
  useEffect(() => {
    if (key === savedKey.current) return;
    setStatus({ state: 'pending' });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delayMs);
  }, [key, flush, delayMs]);

  // closing the editor saves what was still waiting
  useEffect(() => flush, [flush]);

  return { status, flush, start };
}
