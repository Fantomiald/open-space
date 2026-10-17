import { useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { plural } from '../lib/format.ts';
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

  const placeholder = stopped ? 'Écris un message pour reprendre cette session…'
    : session.state === 'perm' ? 'Une autorisation attend ta réponse ci-dessus (un message ici attendra la fin du tour)…'
      : busy ? `${session.name} travaille : ton message attendra la fin du tour…`
        : 'Écris à cette session, ou / pour une commande (Entrée envoie, Maj+Entrée saute une ligne)';

  return (
    <form className="cp-composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {queued.length > 0 && (
        <section className="cp-queue" aria-label="Messages en attente">
          <div className="cp-queue__head">
            <span>{plural(queued.length, 'message en attente', 'messages en attente')}{busy ? ', partent à la fin du tour' : ''}</span>
            <button
              type="button" className="cp-button" data-variant="primary" onClick={() => send({ t: 'sendNow', sessionId: session.id })}
              title={busy ? 'Interrompt le tour en cours, puis envoie la file' : undefined}
            >
              {busy ? 'Envoyer maintenant' : 'Envoyer'}
            </button>
          </div>
          <ol className="cp-queue__list">
            {queued.map((message) => (
              <li key={message.id} className="cp-queue__item">
                <span className="cp-queue__text">{message.text}</span>
                {message.images ? <span className="cp-queue__images" title={plural(message.images, 'image jointe', 'images jointes')}><ImageIcon />{message.images}</span> : null}
                <button type="button" className="cp-icon-button" aria-label="Modifier ce message" title="Modifier" onClick={() => edit(message.id, message.text)}><PencilIcon /></button>
                <button type="button" className="cp-icon-button" aria-label="Retirer ce message" title="Retirer" onClick={() => unqueue(message.id)}><CloseIcon /></button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <AttachmentStrip attachments={attachments} />
      <CommandField
        id="composer-field" label={`Message pour ${session.name}`} value={text} onChange={setText} onSubmit={submit} placeholder={placeholder}
        onPaste={attachments.onPaste}
      />
      <div className="cp-composer__actions">
        <div className="cp-composer__tools">
          <button type="button" className="cp-button" onClick={() => openPalette(true)}>Commandes</button>
          <AttachButton attachments={attachments} />
        </div>
        <button type="submit" className="cp-button" data-variant="primary" disabled={!ready}>{asideQuestion(text) !== null ? 'Demander à côté' : stopped ? 'Reprendre et envoyer' : busy ? 'Mettre en file' : 'Envoyer'}</button>
      </div>
    </form>
  );
}
