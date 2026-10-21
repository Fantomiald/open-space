// The session state machine: a pure reducer, no I/O. The Session class feeds it what happens
// (a message sent, a permission asked, a turn finished, the process gone) and publishes the result.
// It keeps no counters: the Session owns the pending requests and says how many remain.
import type { SessionState } from '../shared/protocol.ts';

export interface MachineContext { state: SessionState }

export type MachineInput =
  /** a message is sent and no process is alive: one is being started */
  | { type: 'spawn' }
  /** a message is sent to a live process */
  | { type: 'send' }
  /** a process started without a message (Remote Control): it waits for one from elsewhere */
  | { type: 'attach' }
  /** its folder is being made (a worktree of its own) before any process: it looks like it starts */
  | { type: 'prepare' }
  /** the folder is ready (or could not be made): it waits, unless a process started meanwhile */
  | { type: 'prepared' }
  /** Claude Code sent its init message */
  | { type: 'init' }
  /** the assistant produced output while waiting (a queued message or a background task started a new turn) */
  | { type: 'activity' }
  | { type: 'permission_requested' }
  /** a request was answered or withdrawn; `remaining` requests still wait */
  | { type: 'permission_resolved'; remaining: number }
  | { type: 'turn_result' }
  /** the process is gone: asked by the user, by the idle timer, cleanly on its own, or crashed */
  | { type: 'exit'; reason: 'closed' | 'idle' | 'clean' | 'failed' };

export const initialContext = (state: SessionState = 'wait'): MachineContext => ({ state });

const RESTARTABLE: ReadonlySet<SessionState> = new Set(['wait', 'done', 'closed', 'error']);
const RUNNING: ReadonlySet<SessionState> = new Set(['starting', 'work', 'perm']);

export function reduce(context: MachineContext, input: MachineInput): MachineContext {
  const { state } = context;
  switch (input.type) {
    case 'spawn':
      return RESTARTABLE.has(state) ? { state: 'starting' } : context;
    case 'attach':
      return RESTARTABLE.has(state) ? { state: 'wait' } : context;
    case 'prepare':
      return RESTARTABLE.has(state) ? { state: 'starting' } : context;
    case 'prepared':
      return state === 'starting' ? { state: 'wait' } : context;
    case 'send':
    case 'activity':
      return state === 'wait' ? { state: 'work' } : context;
    case 'init':
      // the CLI only sends init once it has a message to work on
      return state === 'starting' ? { state: 'work' } : context;
    case 'permission_requested':
      return state === 'work' || state === 'perm' ? { state: 'perm' } : context;
    case 'permission_resolved':
      return state === 'perm' ? { state: input.remaining > 0 ? 'perm' : 'work' } : context;
    case 'turn_result':
      // a message queued during the turn starts the next one: its first output comes back as 'activity'
      return RUNNING.has(state) ? { state: 'wait' } : context;
    case 'exit': {
      // an idle stop only releases the process: the session stays where it was (waiting)
      if (input.reason === 'idle') return state === 'wait' ? context : { state: 'wait' };
      if (state === 'closed') return context;
      return { state: input.reason === 'closed' ? 'closed' : input.reason === 'clean' ? 'done' : 'error' };
    }
  }
}
