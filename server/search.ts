// The search over every session's thread: which messages (yours, the agents', the reports, the other sessions')
// contain the words typed, newest first, for the page's search over all sessions.
import type { LoggedEvent, SearchHit } from '../shared/protocol.ts';
import { foldQuery, matchesAll, snippetOf } from '../shared/search.ts';

const MIN_QUERY = 2;
const MAX_PER_SESSION = 4;

/** The text of an event that people wrote or read, and who it is from; null for the other events. */
function wording(event: LoggedEvent['ev']): { who: SearchHit['who']; text: string } | null {
  switch (event.k) {
    case 'start': return { who: 'user', text: event.text };
    case 'say': case 'report': case 'end': return { who: 'agent', text: event.text };
    case 'peer': return { who: 'peer', text: event.text };
    default: return null;
  }
}

/** Every word of `query` in a message, newest first: at most 4 hits per session and `limit` in all. */
export function searchSessions(logs: Iterable<[string, LoggedEvent[]]>, query: string, limit = 60): SearchHit[] {
  if (foldQuery(query).length < MIN_QUERY) return [];
  const hits: SearchHit[] = [];
  for (const [sessionId, events] of logs) {
    let lastSaid = '';
    for (const { seq, at, ev } of events) {
      const found = wording(ev);
      if (!found) continue;
      // a turn's end repeats what the agent just said
      const repeated = ev.k === 'end' && found.text === lastSaid;
      if (ev.k === 'say') lastSaid = found.text;
      if (repeated || !matchesAll(found.text, query)) continue;
      const snippet = snippetOf(found.text, query);
      if (snippet) hits.push({ sessionId, seq, at, who: found.who, snippet: snippet.text, start: snippet.start, length: snippet.length });
    }
  }
  hits.sort((a, b) => b.at - a.at);
  const perSession = new Map<string, number>();
  return hits.filter((hit) => {
    const count = (perSession.get(hit.sessionId) ?? 0) + 1;
    perSession.set(hit.sessionId, count);
    return count <= MAX_PER_SESSION;
  }).slice(0, limit);
}
