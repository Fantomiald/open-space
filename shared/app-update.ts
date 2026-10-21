import type { SessionInfo } from './protocol.ts';

/** The sessions a restart of the app would cut short: a turn, a sub-agent, a background command or a planned wake-up. */
export const busySessions = (sessions: readonly SessionInfo[]) => sessions.filter((session) =>
  session.state === 'starting' || session.state === 'work' || session.state === 'perm'
  || session.subagents.length > 0 || Boolean(session.background?.length) || Boolean(session.scheduled));
