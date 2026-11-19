// Focus mode's list, in groups (SessionList.tsx): by state, as in the Status panel (who works, what waits for the user,
// who left something to finish, who is done, who rests), or by project with the states in that order inside each.
// The triggers' runs stay apart, last.
import { folderName } from '../lib/format.ts';
import { roomSessions } from '../room/cast.ts';
import { pendingEntries } from './pending.ts';
import { isPutOff } from './pending-later.ts';
import { projectOf } from './projects.ts';
import { ATTENTION_RANK, attentionKind, type SeenSequences } from './queue.ts';
import type { SessionInfo } from '../../shared/protocol.ts';

export const LIST_GROUPINGS = ['state', 'project'] as const;
export type ListGrouping = (typeof LIST_GROUPINGS)[number];

export type StateGroup = 'working' | 'waiting' | 'finish' | 'ready' | 'resting' | 'automata';

/** A group of the list: a state, or a project (`label`, its `folder`); `waiting`: how many wait for the user. */
export interface ListGroup { key: string; state?: StateGroup; label?: string; folder?: string; sessions: SessionInfo[]; waiting: number }

/** The session just opened from the waiting group, kept there until another is opened, at the place it had. */
export interface Kept { id: string; index: number }

const latestFirst = (list: readonly SessionInfo[]) => [...list].sort((a, b) => b.stateSince - a.stateSince);

/** `later`: the leftovers the user put off (pending-later.ts), whose sessions go with the done ones. */
export function listGroups(
  all: readonly SessionInfo[], seen: SeenSequences, grouping: ListGrouping, kept: Kept | null = null, later: Readonly<Record<string, string>> = {},
): ListGroup[] {
  const [queue, working, idle] = roomSessions(all, seen, 'office');
  const [resting] = roomSessions(all, seen, 'lounge');
  const automata = roomSessions(all, seen, 'automata').flat();
  const finishing = new Set(pendingEntries(idle).filter((entry) => !isPutOff(later, entry.session)).map((entry) => entry.session.id));
  // unlike the queue (the longest waiting first), the list shows the latest first, blocked sessions still on top
  const rank = (session: SessionInfo) => ATTENTION_RANK[attentionKind(session, seen) ?? 'finished'];
  const waitingNow = [...queue].sort((a, b) => rank(a) - rank(b) || b.stateSince - a.stateSince);
  let waiting = waitingNow;
  let finish = latestFirst(idle.filter((session) => finishing.has(session.id)));
  let ready = latestFirst(idle.filter((session) => !finishing.has(session.id)));
  // opened, it stops waiting: it would jump to another group under the pointer
  const moved = kept && !queue.some((session) => session.id === kept.id) ? idle.find((session) => session.id === kept.id) : undefined;
  if (moved && kept) {
    finish = finish.filter((session) => session !== moved);
    ready = ready.filter((session) => session !== moved);
    waiting = [...waitingNow.slice(0, kept.index), moved, ...waitingNow.slice(kept.index)];
  }
  const count = (list: readonly SessionInfo[]) => list.filter((session) => attentionKind(session, seen) !== null).length;
  const states: [StateGroup, SessionInfo[]][] = [['working', working], ['waiting', waiting], ['finish', finish], ['ready', ready], ['resting', latestFirst(resting)]];
  const tail: ListGroup[] = automata.length ? [{ key: 'automata', state: 'automata', sessions: automata, waiting: count(automata) }] : [];
  if (grouping === 'state') {
    return [...states.filter(([, list]) => list.length > 0).map(([state, list]) => ({ key: state, state, sessions: list, waiting: count(list) })), ...tail];
  }
  const byKey = new Map<string, ListGroup>();
  for (const [, list] of states) {
    for (const session of list) {
      const folder = projectOf(session);
      const key = `project:${folder}`;
      const group = byKey.get(key) ?? { key, label: folderName(folder), folder, sessions: [], waiting: 0 };
      group.sessions.push(session);
      if (attentionKind(session, seen) !== null) group.waiting += 1;
      byKey.set(key, group);
    }
  }
  // what waits for the user first, then by name
  const groups = [...byKey.values()].sort((a, b) => Number(b.waiting > 0) - Number(a.waiting > 0) || (a.label ?? '').localeCompare(b.label ?? ''));
  return [...groups, ...tail];
}
