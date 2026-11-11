import { useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { copyCodeOnClick } from './copyCode.ts';
import { Prose } from './Prose.tsx';
import { CloseIcon } from './Icons.tsx';

/**
 * The answer to the session's side question (/btw), above its message field: written as it comes, never part of the
 * conversation. Once answered it can be replied to, the exchange going on until it is closed. Closing it withdraws the
 * question if it is still being answered.
 */
export function AsidePanel({ session }: { session: SessionInfo }) {
  const aside = useSessions((s) => s.asides[session.id]);
  const send = useSessions((s) => s.send);
  const [reply, setReply] = useState('');
  if (!aside) return null;
  const earlier = aside.earlier ?? [];
  return (
    <section className="cp-aside" data-state={aside.state} aria-label={t.session.aside.label} aria-live="polite" onClick={(e) => copyCodeOnClick(e.target)}>
      <header className="cp-aside__head">
        <span className="cp-aside__label">{t.session.aside.title}</span>
        <p className="cp-aside__question">{earlier[0]?.question ?? aside.question}</p>
        <button type="button" className="cp-icon-button" aria-label={t.session.aside.close} title={aside.state === 'asking' ? t.session.aside.withdraw : t.session.aside.closeTitle} onClick={() => send({ t: 'asideClose', sessionId: session.id })}>
          <CloseIcon />
        </button>
      </header>
      {earlier.map((exchange, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the exchange only grows at its end
        <div key={index} className="cp-aside__exchange">
          {index > 0 && <p className="cp-aside__reply">{exchange.question}</p>}
          <Prose className="cp-aside__answer" text={exchange.answer} />
        </div>
      ))}
      {earlier.length > 0 && <p className="cp-aside__reply">{aside.question}</p>}
      {aside.answer
        ? <Prose className="cp-aside__answer" text={aside.answer} />
        : <span className="cp-feed__typing" role="img" aria-label={t.session.feed.thinking(session.name)}><span /><span /><span /></span>}
      {aside.state === 'answered' && (
        <form className="cp-aside__form" onSubmit={(e) => {
          e.preventDefault();
          if (reply.trim() && send({ t: 'aside', sessionId: session.id, question: reply.trim(), follow: true })) setReply('');
        }}>
          <input className="cp-aside__field" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t.session.aside.reply} aria-label={t.session.aside.replyLabel} />
        </form>
      )}
    </section>
  );
}
