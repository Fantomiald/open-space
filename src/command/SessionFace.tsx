import type { SessionInfo } from '../../shared/protocol.ts';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { sessionStatus, type Status } from '../room/cast.ts';
import { chibiHead, lookOfStranger } from '../room/chibi.ts';
import { STATUS_GLYPHS, WORKING_DOTS } from '../room/status-glyphs.ts';
import { useSessions } from '../state/sessions.ts';

/** The sign on a face, the pixels of the round icon on a name tag in the room (its dots bob the same way). */
function Sign({ status }: { status: Exclude<Status, null> }) {
  const pixels = status === 'working' ? WORKING_DOTS.map((x) => [x, 2] as const) : STATUS_GLYPHS[status];
  return (
    <svg className="cp-face__sign" viewBox="-2 -2 9 9" aria-hidden="true">
      {pixels.map(([x, y]) => <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} />)}
    </svg>
  );
}

/** A session's face (the look of the crew member it is named after, as in the room) with its state as a sign on it. */
export function SessionFace({ session, resting = false }: { session: SessionInfo; resting?: boolean }) {
  const crew = useSessions((s) => s.crew);
  const seen = useSessions((s) => s.seen);
  const member = crew.find((candidate) => !candidate.self && candidate.name === session.name);
  const status = sessionStatus(session, seen);
  return (
    <span className="cp-face" data-status={status ?? 'idle'} data-resting={resting}>
      <img src={chibiHead(member ? member.look ?? DEFAULT_LOOK : lookOfStranger(session.id))} alt="" width={36} height={36} />
      {status && <Sign status={status} />}
    </span>
  );
}
