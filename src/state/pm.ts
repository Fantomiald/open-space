// What the page shows of project managers (PM) and their workers (shared/pm.ts). Pure.
import type { SessionInfo } from '../../shared/protocol.ts';

/**
 * The PM a session works for, while it still is one: a worker of a session gone or made an ordinary session again is
 * shown as any other session.
 */
export function leadOf(session: SessionInfo, sessions: Readonly<Record<string, SessionInfo>>): SessionInfo | undefined {
  const lead = session.pmOf ? sessions[session.pmOf] : undefined;
  return lead?.pm ? lead : undefined;
}
