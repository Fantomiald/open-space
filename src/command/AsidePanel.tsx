import type { SessionInfo } from '../../shared/protocol.ts';
import { useSessions } from '../state/sessions.ts';
import { copyCodeOnClick } from './Feed.tsx';
import { Prose } from './Prose.tsx';
import { CloseIcon } from './Icons.tsx';

/**
 * The answer to the session's side question (/btw), above its message field: written as it comes, never part of the
 * conversation. Closing it withdraws the question if it is still being answered.
 */
export function AsidePanel({ session }: { session: SessionInfo }) {
  const aside = useSessions((s) => s.asides[session.id]);
  const send = useSessions((s) => s.send);
  if (!aside) return null;
  return (
    <section className="cp-aside" data-state={aside.state} aria-label="Question à côté" aria-live="polite" onClick={(e) => copyCodeOnClick(e.target)}>
      <header className="cp-aside__head">
        <span className="cp-aside__label">À côté</span>
        <p className="cp-aside__question">{aside.question}</p>
        <button type="button" className="cp-icon-button" aria-label="Fermer la question à côté" title={aside.state === 'asking' ? 'Retirer la question' : 'Fermer'} onClick={() => send({ t: 'asideClose', sessionId: session.id })}>
          <CloseIcon />
        </button>
      </header>
      {aside.answer
        ? <Prose className="cp-aside__answer" text={aside.answer} />
        : <span className="cp-feed__typing" role="img" aria-label={`${session.name} réfléchit`}><span /><span /><span /></span>}
    </section>
  );
}
