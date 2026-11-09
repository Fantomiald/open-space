// Who is in each room and on which seat. The office: the sessions at work or waiting, those waiting for the user
// first, then the working ones, then the idle ones. The break room: the sessions put to rest and the closed ones,
// until a message calls them back. Sub-agents do not take a seat: they show above the head of whoever runs them.
// The sessions a trigger started (shared/triggers.ts) and the external runs at work (shared/automata.ts) stand in the
// capsules of their own room, the server room, as robots.
import { automatonAgentPersonId, automatonPersonId, roleLabel } from '../../shared/automata.ts';
import type { SeatedAutomaton } from '../state/automata.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { attentionKind, attentionQueue, isWorking, type AttentionKind, type SeenSequences } from '../state/queue.ts';
import { assignSeats } from './seats.ts';

/** The icon above someone's head: an attention kind, at work, or nothing. */
export type Status = AttentionKind | 'working' | 'compacting' | null;

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
  /** the tags the user put on the session */
  tags: string[];
  /** the session works on a branch of its own: a little branch after its name */
  branch: boolean;
  /** an external run, not a session: its run id (a click opens the Automates panel on it) */
  automaton?: string;
  /** an automaton that is a sub-agent of that run: the id of the Agent call that launched it */
  automatonAgent?: string;
  /** a robot of this role (src/room/robot.ts), with the automatons' tag and cord: an external run (its role, or its sub-agent's) or a session a trigger started (its role, or its trigger's name) */
  automatonRole?: string;
}

export interface RoomPlan {
  people: Person[];
  /** person id -> seat number; everyone in `people` has one */
  seats: Map<string, number>;
  /** sessions that would be in the room but found no seat */
  hiddenSessions: number;
  /** automatons at work that found no capsule (they take one as soon as one is free) */
  waitingAutomata: number;
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
  if (session.compacting) return 'compacting';
  return isWorking(session) ? 'working' : null;
}

/** The office, the break room, and the server room (the automatons': the sessions started by a trigger, and the external runs). */
export type RoomKind = 'office' | 'lounge' | 'automata';

/** Which room's festival decorations a room takes (festivals.ts): the automatons' server room never has any, it counts as the office. */
export const decorOf = (room: RoomKind): 'office' | 'lounge' => (room === 'lounge' ? 'lounge' : 'office');

const STOPPED: ReadonlySet<SessionInfo['state']> = new Set(['closed', 'done', 'error']);

/** Sessions that belong in a room, by priority (in the office: waiting for the user, then working, then idle; oldest first in each group). */
export function roomSessions(all: readonly SessionInfo[], seen: SeenSequences, room: RoomKind = 'office'): SessionInfo[][] {
  const inLounge = (session: SessionInfo) => session.resting === true || (STOPPED.has(session.state) && attentionKind(session, seen) === null);
  // a trigger's run stands in the server room while it works or has something to show, and is in no room after
  const own = all.filter((session) => (room === 'automata') === !!session.trigger);
  if (room === 'lounge') return [own.filter(inLounge).sort((a, b) => a.createdAt - b.createdAt)];
  const sessions = own.filter((session) => !inLounge(session));
  const queue = attentionQueue(sessions, seen).map(({ session }) => session);
  const queued = new Set(queue.map((session) => session.id));
  const rest = sessions.filter((session) => !queued.has(session.id)).sort((a, b) => a.createdAt - b.createdAt);
  return [
    queue,
    rest.filter(isWorking),
    rest.filter((session) => session.state === 'wait' && !isWorking(session)),
  ];
}

/** Within a priority group, people already seated keep their place before newcomers (no musical chairs). */
function seatedFirst<T>(group: readonly T[], isSeated: (item: T) => boolean): T[] {
  return [...group.filter(isSeated), ...group.filter((item) => !isSeated(item))];
}

/**
 * An external run at work in the server room: its role for a name, at work. A run's sub-agent stands as an automaton
 * of its own, named after its role.
 */
export function automatonPerson({ run, agent }: SeatedAutomaton): Person {
  const id = agent ? automatonAgentPersonId(run.id, agent.id) : automatonPersonId(run.id);
  const name = roleLabel(agent ? agent.role : run.role || run.task || run.id);
  return {
    id, sessionId: id, name, title: name, status: 'working',
    agents: [], tags: [], branch: false, automaton: run.id,
    automatonRole: agent ? agent.role : run.role || 'agent',
    ...(agent ? { automatonAgent: agent.id } : {}),
  };
}

/**
 * `previousSeats`: who sits where now (people walking out excluded). `reserved`: seats nobody gets (the user's).
 * `automata`: the external runs at work (src/state/automata.ts seatedRuns), in the server room only, after the
 * sessions started by a trigger.
 */
export function planRoom(
  sessions: readonly SessionInfo[], seen: SeenSequences, previousSeats: ReadonlyMap<string, number>, seatCount: number,
  room: RoomKind = 'office', reserved: ReadonlySet<number> = new Set(),
  automata: readonly SeatedAutomaton[] = [],
): RoomPlan {
  const isSeated = (id: string) => previousSeats.has(id);
  const eligible = roomSessions(sessions, seen, room).flatMap((group) => seatedFirst(group, (session) => isSeated(session.id)));
  const admitted = eligible.slice(0, seatCount - reserved.size);
  const left = seatCount - reserved.size - admitted.length;
  const bots = room === 'automata' ? seatedFirst(automata, (bot) => isSeated(automatonPerson(bot).id)).slice(0, Math.max(0, left)) : [];

  const people: Person[] = admitted.map((session) => ({
    id: session.id, sessionId: session.id, name: session.name,
    title: roleTitle(session.command) ?? session.name, status: sessionStatus(session, seen),
    agents: session.subagents.map(({ id, name, type }) => ({ id, name, type: type || t.room.subagent })),
    tags: session.tags ?? [],
    branch: !!session.worktree,
    // a trigger's run is a robot of its role, else of its trigger (src/room/robot.ts)
    ...(session.trigger ? { automatonRole: session.trigger.role || session.trigger.name } : {}),
  }));
  people.push(...bots.map(automatonPerson));
  return {
    people,
    seats: assignSeats(people.map(({ id }) => ({ id })), previousSeats, seatCount, reserved),
    hiddenSessions: eligible.length - admitted.length,
    waitingAutomata: room === 'automata' ? automata.length - bots.length : 0,
  };
}
