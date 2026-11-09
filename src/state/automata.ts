// The external runs on the page's side (shared/automata.ts): who of them goes into the room, and their threads as the
// server tells them. Pure functions, tested without a DOM.
import type { AgentRole, AutomataState, AutomatonAgent, AutomatonRun } from '../../shared/automata.ts';
import type { LoggedEvent } from '../../shared/protocol.ts';

/** A run's thread as the page has it. */
export interface RunLog { events: LoggedEvent[]; truncated: boolean }

/** The events a page keeps of a run, like the server. */
export const MAX_RUN_EVENTS = 600;

/** A thread with what the server sent since: only events after its last one (a reconnection may repeat some), the last ones kept. */
export function appendRunEvents(log: RunLog, events: readonly LoggedEvent[], max = MAX_RUN_EVENTS): RunLog {
  const last = log.events.at(-1)?.seq ?? 0;
  const fresh = events.filter((event) => event.seq > last);
  if (!fresh.length) return log;
  const all = [...log.events, ...fresh];
  return all.length > max ? { events: all.slice(-max), truncated: true } : { events: all, truncated: log.truncated };
}

/** Who of the external runs takes a seat: a run at work, or one of its sub-agents at work (`agent`). */
export interface SeatedAutomaton { run: AutomatonRun; agent: AutomatonAgent | null }

/** The external runs that take a seat in the server room, oldest first: each run at work, then its sub-agents at work, each in a capsule of its own. */
export function seatedRuns(state: AutomataState): SeatedAutomaton[] {
  return state.running.flatMap((run) => [{ run, agent: null }, ...(state.agents[run.id] ?? []).map((agent) => ({ run, agent }))]);
}

/** Every run the page knows, at work first. */
export const allRuns = (state: AutomataState): AutomatonRun[] => [...state.running, ...state.recent];

export const roleOf = (state: AutomataState, role: string): AgentRole | undefined => state.roles.find((candidate) => candidate.name === role);
