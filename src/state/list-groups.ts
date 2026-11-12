// Focus mode's list, in groups (SessionList.tsx): by state (what waits for the user, who works, who is ready, who
// rests), or by project with the states in that order inside each. The triggers' runs stay apart, last.
import { folderName } from '../lib/format.ts';
import { roomSessions } from '../room/cast.ts';
import { projectOf } from './projects.ts';
import { attentionKind, type SeenSequences } from './queue.ts';
import type { SessionInfo } from '../../shared/protocol.ts';

export const LIST_GROUPINGS = ['state', 'project'] as const;
export type ListGrouping = (typeof LIST_GROUPINGS)[number];

export type StateGroup = 'waiting' | 'working' | 'ready' | 'resting' | 'automata';

/** A group of the list: a state, or a project (`label`, its `folder`); `waiting`: how many wait for the user. */
export interface ListGroup { key: string; state?: StateGroup; label?: string; folder?: string; sessions: SessionInfo[]; waiting: number }

/** The session just opened from the waiting group, kept there until another is opened, at the place it had. */
export interface Kept { id: string; index: number }

const latestFirst = (list: readonly SessionInfo[]) => [...list].sort((a, b) => b.stateSince - a.stateSince);

export function listGroups(all: readonly SessionInfo[], seen: SeenSequences, grouping: ListGrouping, kept: Kept | null = null): ListGroup[] {
  const [queue, working, ready] = roomSessions(all, seen, 'office');
  const [resting] = roomSessions(all, seen, 'lounge');
  const automata = roomSessions(all, seen, 'automata').flat();
  let waiting = queue;
  let readyLatest = latestFirst(ready);
  // opened, it stops waiting: it would jump to another group under the pointer
  const moved = kept && !queue.some((session) => session.id === kept.id) ? readyLatest.find((session) => session.id === kept.id) : undefined;
  if (moved && kept) {
    readyLatest = readyLatest.filter((session) => session !== moved);
    waiting = [...queue.slice(0, kept.index), moved, ...queue.slice(kept.index)];
  }
  const count = (list: readonly SessionInfo[]) => list.filter((session) => attentionKind(session, seen) !== null).length;
  const states: [StateGroup, SessionInfo[]][] = [['waiting', waiting], ['working', working], ['ready', readyLatest], ['resting', latestFirst(resting)]];
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
