// Who is in each room and on which seat. The office: the sessions at work or waiting, those waiting for the user
// first, then the working ones, then the idle ones. The break room: the sessions put to rest and the closed ones,
// until a message calls them back. Sub-agents do not take a seat: they show above the head of whoever runs them.
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { attentionKind, attentionQueue, type AttentionKind, type SeenSequences } from '../state/queue.ts';
import { assignSeats } from './seats.ts';

/** The icon above someone's head: an attention kind, at work, or nothing. */
export type Status = AttentionKind | 'working' | null;

export interface Agent { id: string; name: string; type: string }

export interface Person {
  /** the session id */
  id: string;
  sessionId: string;
  /** shown on the name tag */
  name: string;
  /** what they do, shown before their words in the speech bubbles */
  title: string;
  status: Status;
  /** the sub-agents at work for this session */
  agents: Agent[];
  /** the tag the user put on the session, or null */
  tag: string | null;
}

export interface RoomPlan {
  people: Person[];
  /** person id -> seat number; everyone in `people` has one */
  seats: Map<string, number>;
  /** sessions that would be in the room but found no seat */
  hiddenSessions: number;
}

/**
 * The role played by a session running a plugin's command ("kit:screenshots" -> "Screenshots", "kit:aso" -> "ASO": short
 * words read as acronyms), or null for anything else.
 */
export function roleTitle(command: string): string | null {
  const name = /^[\w-]+:([\w-]+)$/.exec(command)?.[1];
  if (!name) return null;
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
}

export function sessionStatus(session: SessionInfo, seen: SeenSequences): Status {
  const kind = attentionKind(session, seen);
  if (kind) return kind;
  return session.state === 'work' || session.state === 'starting' ? 'working' : null;
}

export type RoomKind = 'office' | 'lounge';

const STOPPED: ReadonlySet<SessionInfo['state']> = new Set(['closed', 'done', 'error']);

/** Sessions that belong in a room, by priority (in the office: waiting for the user, then working, then idle; oldest first in each group). */
export function roomSessions(all: readonly SessionInfo[], seen: SeenSequences, room: RoomKind = 'office'): SessionInfo[][] {
  const inLounge = (session: SessionInfo) => session.resting === true || (STOPPED.has(session.state) && attentionKind(session, seen) === null);
  if (room === 'lounge') return [all.filter(inLounge).sort((a, b) => a.createdAt - b.createdAt)];
  const sessions = all.filter((session) => !inLounge(session));
  const queue = attentionQueue(sessions, seen).map(({ session }) => session);
  const queued = new Set(queue.map((session) => session.id));
  const rest = sessions.filter((session) => !queued.has(session.id)).sort((a, b) => a.createdAt - b.createdAt);
  return [
    queue,
    rest.filter((session) => session.state === 'work' || session.state === 'starting'),
    rest.filter((session) => session.state === 'wait'),
  ];
}

/** Within a priority group, people already seated keep their place before newcomers (no musical chairs). */
function seatedFirst<T>(group: readonly T[], isSeated: (item: T) => boolean): T[] {
  return [...group.filter(isSeated), ...group.filter((item) => !isSeated(item))];
}

/** `previousSeats`: who sits where now (people walking out excluded). `reserved`: seats nobody gets (the user's). */
export function planRoom(
  sessions: readonly SessionInfo[], seen: SeenSequences, previousSeats: ReadonlyMap<string, number>, seatCount: number,
  room: RoomKind = 'office', reserved: ReadonlySet<number> = new Set(),
): RoomPlan {
  const isSeated = (id: string) => previousSeats.has(id);
  const eligible = roomSessions(sessions, seen, room).flatMap((group) => seatedFirst(group, (session) => isSeated(session.id)));
  const admitted = eligible.slice(0, seatCount - reserved.size);

  const people: Person[] = admitted.map((session) => ({
    id: session.id, sessionId: session.id, name: session.name,
    title: roleTitle(session.command) ?? session.name, status: sessionStatus(session, seen),
    agents: session.subagents.map(({ id, name, type }) => ({ id, name, type: type || t.room.subagent })),
    tag: session.tag ?? null,
  }));
  return {
    people,
    seats: assignSeats(people.map(({ id }) => ({ id })), previousSeats, seatCount, reserved),
    hiddenSessions: eligible.length - admitted.length,
  };
}
