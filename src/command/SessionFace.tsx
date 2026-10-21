import type { SessionInfo } from '../../shared/protocol.ts';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { sessionStatus, type Status } from '../room/cast.ts';
import { chibiHead, lookOfStranger } from '../room/chibi.ts';
import { useSessions } from '../state/sessions.ts';

/** The sign on a face, the same as over a head in the room; none for a session that is ready or resting. */
const SIGNS: Readonly<Record<Exclude<Status, null>, string>> = { permission: '!', question: '?', finished: '✓', error: '×', working: '…', compacting: '⇕' };

/** A session's face (the look of the crew member it is named after, as in the room) with its state as a sign on it. */
export function SessionFace({ session, resting = false }: { session: SessionInfo; resting?: boolean }) {
  const crew = useSessions((s) => s.crew);
  const seen = useSessions((s) => s.seen);
  const member = crew.find((candidate) => !candidate.self && candidate.name === session.name);
  const status = sessionStatus(session, seen);
  return (
    <span className="cp-face" data-status={status ?? 'idle'} data-resting={resting}>
      <img src={chibiHead(member ? member.look ?? DEFAULT_LOOK : lookOfStranger(session.id))} alt="" width={36} height={36} />
      {status && <span className="cp-face__sign" aria-hidden="true">{SIGNS[status]}</span>}
    </span>
  );
}
