// The "your turn" queue: which sessions wait for the user, in which order, and why. Pure functions.
// A finished turn (or an error) only waits for the user until they have seen it: `seen` holds, per session,
// the last event sequence number shown to the user.
import type { AttentionKind, SessionInfo } from '../../shared/protocol.ts';

export type { AttentionKind };

export interface AttentionItem { session: SessionInfo; kind: AttentionKind }

/** Last event sequence number the user has seen, by session id. */
export type SeenSequences = Readonly<Record<string, number>>;

const unseen = (session: SessionInfo, seen: SeenSequences) => session.lastSeq > (seen[session.id] ?? 0);

/** The reason a session needs the user, or null. A question is an AskUserQuestion call waiting for its answers. */
export function attentionKind(session: SessionInfo, seen: SeenSequences = {}): AttentionKind | null {
  if (session.state === 'perm') return session.permissions[0]?.questions ? 'question' : 'permission';
  if (session.state === 'error') return unseen(session, seen) ? 'error' : null;
  if (session.state === 'wait' && session.turns > 0 && unseen(session, seen)) return 'finished';
  return null;
}

const RANK: Record<AttentionKind, number> = { permission: 0, question: 0, finished: 1, error: 2 };

/** Permissions and questions first (the session is blocked), then finished turns, then errors; the one waiting the longest comes first in each group. */
export function attentionQueue(sessions: readonly SessionInfo[], seen: SeenSequences = {}): AttentionItem[] {
  return sessions
    .flatMap((session) => { const kind = attentionKind(session, seen); return kind ? [{ session, kind }] : []; })
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.session.stateSince - b.session.stateSince);
}

export interface SessionGroups { working: SessionInfo[]; idle: SessionInfo[]; stopped: SessionInfo[] }

/** Sessions that are not in the queue: running, ready (new, or finished and seen), or stopped (seen errors included). */
export function otherSessions(sessions: readonly SessionInfo[], seen: SeenSequences = {}): SessionGroups {
  const byRecent = (a: SessionInfo, b: SessionInfo) => b.stateSince - a.stateSince;
  const rest = sessions.filter((session) => attentionKind(session, seen) === null);
  return {
    working: rest.filter((s) => s.state === 'work' || s.state === 'starting').sort(byRecent),
    idle: rest.filter((s) => s.state === 'wait').sort(byRecent),
    stopped: rest.filter((s) => s.state === 'closed' || s.state === 'done' || s.state === 'error').sort(byRecent),
  };
}

/** Sessions that just started needing the user (for browser notifications). */
export function newlyWaiting(before: Readonly<Record<string, SessionInfo>>, after: readonly SessionInfo[], seen: SeenSequences = {}): AttentionItem[] {
  return attentionQueue(after, seen).filter(({ session, kind }) => {
    const previous = before[session.id];
    return kind !== 'error' && (!previous || attentionKind(previous, seen) !== kind);
  });
}

export function tabTitle(count: number, base = 'Open Space'): string {
  return count > 0 ? `(${count}) ${base}` : base;
}
