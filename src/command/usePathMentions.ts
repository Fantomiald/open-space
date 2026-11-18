import { useEffect, useMemo } from 'react';
import { rankPaths, type PathEntry } from '../../shared/file-mentions.ts';
import { askPaths, scopeKey, usePathAnswers, type PathScope } from '../state/path-mentions.ts';
import { useSessions } from '../state/sessions.ts';

/** How long the field waits after a keystroke before asking: one question for a word typed quickly. */
const ASK_DELAY_MS = 120;

/**
 * The files and folders of `scope` that fit `query` (what follows the "@"; null: no "@" is being typed). The server is
 * asked once the user pauses; meanwhile its last answer for the same folder is ranked again for what is typed now.
 */
export function usePathMentions(scope: PathScope | undefined, query: string | null): PathEntry[] {
  const send = useSessions((s) => s.send);
  const latest = usePathAnswers((s) => s.latest);
  // the scope as plain values: the page builds a new object at each render
  const sessionId = scope && 'sessionId' in scope ? scope.sessionId : undefined;
  const cwd = scope && 'cwd' in scope ? scope.cwd : undefined;
  const key = sessionId ? scopeKey({ sessionId }) : cwd ? scopeKey({ cwd }) : null;
  useEffect(() => {
    if (query === null || (!sessionId && !cwd)) return;
    const where: PathScope = sessionId ? { sessionId } : { cwd: cwd as string };
    const timer = window.setTimeout(() => askPaths(send, where, query), ASK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [sessionId, cwd, query, send]);
  return useMemo(() => (key && query !== null && latest?.scope === key ? rankPaths(latest.paths, query) : []), [key, query, latest]);
}
