// The messages still being written, shown as they grow until they arrive whole. Pure functions.
import type { OfficeEvent } from '../../shared/protocol.ts';

/** By session id, then by who writes ("chef" or a sub-agent id): the text so far. */
export type Partials = Readonly<Record<string, Readonly<Record<string, string>>>>;

export function withPartial(partials: Partials, sessionId: string, who: string, text: string): Partials {
  return { ...partials, [sessionId]: { ...partials[sessionId], [who]: text } };
}

/** True when no message can still be on its way: the turn ended, stopped or waits for the user. */
export const writingStops = (ev: OfficeEvent) =>
  ev.k === 'end' || ev.k === 'error' || ev.k === 'start' || (ev.k === 'state' && ev.state !== 'work' && ev.state !== 'starting');

/** What an event of the log leaves of them: the whole message replaces its draft, and a turn that stops leaves none. */
export function afterEvent(partials: Partials, sessionId: string, ev: OfficeEvent): Partials {
  const drafts = partials[sessionId];
  if (!drafts) return partials;
  if (ev.k === 'say' && ev.who in drafts) {
    const { [ev.who]: _done, ...rest } = drafts;
    return { ...partials, [sessionId]: rest };
  }
  if (writingStops(ev)) {
    const { [sessionId]: _gone, ...rest } = partials;
    return rest;
  }
  return partials;
}
