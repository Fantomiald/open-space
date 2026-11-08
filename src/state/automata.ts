// The automatons on the page's side (shared/automata.ts): who of them goes into the room, and their threads as the
// server tells them. Pure functions, tested without a DOM.
import type { AutomataState, AutomatonRole, AutomatonRun, AutomatonTask } from '../../shared/automata.ts';
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

/**
 * The runs that take a seat in the room, oldest first, each with the runs at work it started: a run whose coordinator
 * is at work too shows as a face on its coordinator's tag, like a session's sub-agents.
 */
export function seatedRuns(state: AutomataState): { run: AutomatonRun; helpers: AutomatonRun[] }[] {
  const running = new Set(state.running.map((run) => run.id));
  const top = state.running.filter((run) => !run.parent || !running.has(run.parent));
  return top.map((run) => ({ run, helpers: state.running.filter((other) => other.parent === run.id) }));
}

/** Every run the page knows, at work first. */
export const allRuns = (state: AutomataState): AutomatonRun[] => [...state.running, ...state.recent];

export const roleOf = (state: AutomataState, role: string): AutomatonRole | undefined => state.roles.find((candidate) => candidate.name === role);

/** The task a run works on: by its id, else by a task that lists the run. */
export const taskOf = (state: AutomataState, run: AutomatonRun): AutomatonTask | undefined =>
  state.tasks.find((task) => task.id === run.task) ?? state.tasks.find((task) => task.runs.includes(run.id));

/** The runs a run started (a coordinator's helpers), at work or ended. */
export const childrenOf = (state: AutomataState, runId: string): AutomatonRun[] => allRuns(state).filter((run) => run.parent === runId);
