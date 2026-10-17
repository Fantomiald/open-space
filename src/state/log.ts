// The client copy of a session's event log, kept consistent with the server's sequence numbers.
import type { LoggedEvent } from '../../shared/protocol.ts';

/** Events kept per followed session (older ones stay on the server). */
export const CLIENT_LOG_LIMIT = 3000;

/** Adds events the log does not have yet (those after its last sequence number), in order. */
export function mergeLog(current: readonly LoggedEvent[], incoming: readonly LoggedEvent[]): LoggedEvent[] {
  const lastSeq = current.at(-1)?.seq ?? 0;
  const fresh = incoming.filter((event) => event.seq > lastSeq).sort((a, b) => a.seq - b.seq);
  const merged = fresh.length ? [...current, ...fresh] : [...current];
  return merged.length > CLIENT_LOG_LIMIT ? merged.slice(merged.length - CLIENT_LOG_LIMIT) : merged;
}

export type LiveResult = { kind: 'appended'; log: LoggedEvent[] } | { kind: 'duplicate' } | { kind: 'gap'; after: number };

/** A live event: appended if it is the next one, ignored if already seen, reported as a gap if some were missed. */
export function appendLive(current: readonly LoggedEvent[], event: LoggedEvent): LiveResult {
  const lastSeq = current.at(-1)?.seq ?? 0;
  if (event.seq <= lastSeq) return { kind: 'duplicate' };
  if (event.seq !== lastSeq + 1) return { kind: 'gap', after: lastSeq };
  return { kind: 'appended', log: mergeLog(current, [event]) };
}
