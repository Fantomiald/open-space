import { useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { asideQuestion } from '../state/commands.ts';
import { useSessions } from '../state/sessions.ts';
import { AttachButton, AttachmentStrip } from './Attachments.tsx';
import { CommandField } from './CommandField.tsx';
import { CloseIcon, ImageIcon, PencilIcon } from './Icons.tsx';
import type { Attachments } from './useAttachments.ts';

/**
 * The message field of a session. During a turn, what the user sends waits in a queue (kept by the server) shown above
 * the field: it leaves when the turn ends, or at once with "Envoyer maintenant", which interrupts the turn. Pictures
 * go with the message (`attachments`, kept by Detail so they can be dropped anywhere on the panel).
 */
export function Composer({ session, attachments }: { session: SessionInfo; attachments: Attachments }) {
  const [text, setText] = useState('');
  const sendText = useSessions((s) => s.sendText);
  const send = useSessions((s) => s.send);
  const openPalette = useSessions((s) => s.openPalette);
  const stopped = session.state === 'closed' || session.state === 'done' || session.state === 'error';
  const busy = session.state === 'starting' || session.state === 'work' || session.state === 'perm';
  const queued = session.queued ?? [];

  const ready = (text.trim() !== '' || attachments.items.length > 0) && !attachments.preparing;
  const submit = () => {
    if (!ready) return;
    // "/btw <question>": asked aside at once, even during a turn, without waiting in the queue (see AsidePanel)
    const question = asideQuestion(text);
    if (question !== null) {
      if (question && send({ t: 'aside', sessionId: session.id, question })) setText('');
      return;
    }
    // the text and the pictures stay when they could not leave (not connected), so nothing is lost
    if (sendText(session.id, text.trim(), attachments.uploads)) { setText(''); attachments.clear(); }
  };

  const unqueue = (queueId: string) => send({ t: 'unqueue', sessionId: session.id, queueId });
  /** Back in the field, before what is being typed there. */
  const edit = (queueId: string, message: string) => {
    if (!unqueue(queueId)) return;
    setText((current) => (current.trim() ? `${message}\n${current}` : message));
  };

  const words = t.composer.composer;
  const placeholder = stopped ? words.placeholderStopped
    : session.state === 'perm' ? words.placeholderPermission
      : busy ? words.placeholderBusy(session.name)
        : words.placeholder;

  return (
    <form className="cp-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {queued.length > 0 && (
        <section className="cp-queue" aria-label={words.queueLabel}>
          <div className="cp-queue__head">
            <span>{words.queued(queued.length)}{busy ? words.leaveAtTurnEnd : ''}</span>
            <button
              type="button" className="cp-button" data-variant="primary" onClick={() => send({ t: 'sendNow', sessionId: session.id })}
              title={busy ? words.sendNowTitle : undefined}
            >
              {busy ? words.sendNow : words.send}
            </button>
          </div>
          <ol className="cp-queue__list">
            {queued.map((message) => (
              <li key={message.id} className="cp-queue__item">
                <span className="cp-queue__text">{message.text}</span>
                {message.images ? <span className="cp-queue__images" title={words.images(message.images)}><ImageIcon />{message.images}</span> : null}
                <button type="button" className="cp-icon-button" aria-label={words.editLabel} title={words.edit} onClick={() => edit(message.id, message.text)}><PencilIcon /></button>
                <button type="button" className="cp-icon-button" aria-label={words.removeLabel} title={words.remove} onClick={() => unqueue(message.id)}><CloseIcon /></button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <AttachmentStrip attachments={attachments} />
      <CommandField
        id="composer-field" label={words.fieldLabel(session.name)} value={text} onChange={setText} onSubmit={submit} placeholder={placeholder}
        onPaste={attachments.onPaste}
      />
      <div className="cp-composer__actions">
        <div className="cp-composer__tools">
          <button type="button" className="cp-button" onClick={() => openPalette(true)}>{words.commands}</button>
          <AttachButton attachments={attachments} />
        </div>
        <button type="submit" className="cp-button" data-variant="primary" disabled={!ready}>{asideQuestion(text) !== null ? words.askAside : stopped ? words.resumeAndSend : busy ? words.queue : words.send}</button>
      </div>
    </form>
  );
}
