import { useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { asideQuestion, nativeView, tuning } from '../state/commands.ts';
import { readDraft, writeDraft } from '../state/drafts.ts';
import { contextLevel } from '../state/labels.ts';
import { closeCompact, compactClosed } from '../state/hints.ts';
import { useSessions } from '../state/sessions.ts';
import { AttachButton, AttachmentStrip } from './Attachments.tsx';
import { CommandField } from './CommandField.tsx';
import { AlertIcon, CloseIcon, CommandIcon, FileIcon, ImageIcon, PencilIcon, PhoneIcon } from './Icons.tsx';
import { TuneMenu } from './TuneMenu.tsx';
import type { Attachments } from './useAttachments.ts';

/**
 * The message field of a session. During a turn, what the user sends waits in a queue (kept by the server) shown above
 * the field: it leaves when the turn ends, or at once with "Envoyer maintenant", which interrupts the turn. Pictures
 * go with the message (`attachments`, kept by Detail so they can be dropped anywhere on the panel).
 */
export function Composer({ session, attachments }: { session: SessionInfo; attachments: Attachments }) {
  // kept per session while it is not sent (App keys the composer by session)
  const [text, setTyped] = useState(() => readDraft(session.id));
  const setText = (next: string | ((current: string) => string)) => setTyped((current) => {
    const value = typeof next === 'function' ? next(current) : next;
    writeDraft(session.id, value);
    return value;
  });
  const sendText = useSessions((s) => s.sendText);
  const send = useSessions((s) => s.send);
  const openPalette = useSessions((s) => s.openPalette);
  const showPanel = useSessions((s) => s.showPanel);
  // a small window (several open, this one not zoomed): icons beside a one-line field
  const stacked = useSessions((s) => s.openIds.length > 1 && s.zoomedId !== session.id);
  const stopped = session.state === 'closed' || session.state === 'done' || session.state === 'error';
  const busy = session.state === 'starting' || session.state === 'work' || session.state === 'perm';
  const queued = session.queued ?? [];
  // during a turn a plain message joins it at once; a slash command, or anything behind one, waits for its end (Session.send)
  const waits = busy && (session.state === 'starting' || text.trim().startsWith('/') || queued.length > 0);

  // "!command": run in the session's folder at once, without Claude, like Claude Code's bash mode
  const shellCommand = text.startsWith('!') ? text.slice(1).trim() : null;
  const ready = shellCommand !== null ? shellCommand !== '' : (text.trim() !== '' || attachments.items.length > 0) && !attachments.preparing;
  const submit = () => {
    if (!ready) return;
    if (shellCommand !== null) {
      if (send({ t: 'shell', sessionId: session.id, command: shellCommand })) setText('');
      return;
    }
    // "/btw <question>": asked aside at once, even during a turn, without waiting in the queue (see AsidePanel)
    const question = asideQuestion(text);
    if (question !== null) {
      if (question && send({ t: 'aside', sessionId: session.id, question })) setText('');
      return;
    }
    // "/mcp", "/context", "/usage": Open Space's own view of it, in the panel, instead of Claude Code's line of text
    const view = attachments.items.length ? null : nativeView(text);
    if (view) { showPanel(view); setText(''); return; }
    // "/model sonnet", "/effort high": the same as the buttons below the field, so the session keeps it
    const tune = attachments.items.length ? null : tuning(text);
    if (tune) { if (send({ t: 'tune', sessionId: session.id, ...tune })) setText(''); return; }
    // the text and the pictures stay when they could not leave (not connected), so nothing is lost
    if (sendText(session.id, text.trim(), attachments.uploads, attachments.files)) { setText(''); attachments.clear(); }
  };

  const unqueue = (queueId: string) => send({ t: 'unqueue', sessionId: session.id, queueId });
  /** Back in the field, before what is being typed there. */
  const edit = (queueId: string, message: string) => {
    if (!unqueue(queueId)) return;
    setText((current) => (current.trim() ? `${message}\n${current}` : message));
  };

  const words = t.composer.composer;
  const placeholder = shellCommand !== null ? words.placeholderShell : stopped ? words.placeholderStopped
    : session.state === 'perm' ? words.placeholderPermission
      : busy ? words.placeholderBusy(session.name)
        : stacked ? words.placeholderShort : words.placeholder;

  const sendLabel = shellCommand !== null ? words.run : asideQuestion(text) !== null ? words.askAside : stopped ? words.resumeAndSend : waits ? words.queue : words.send;
  const field = (
    <CommandField
      id={`composer-field-${session.id}`} label={words.fieldLabel(session.name)} value={text} onChange={setText} onSubmit={submit} placeholder={placeholder}
      onPaste={attachments.onPaste} shell cwd={session.cwd}
    />
  );
  const tools = (
    <div className="cp-composer__tools">
      <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={words.commands} title={words.commands} onClick={() => openPalette(true)}><CommandIcon /></button>
      <TuneMenu tuning={session} cwd={session.cwd} onChange={(change) => send({ t: 'tune', sessionId: session.id, ...change })} compact={stacked} />
      <AttachButton attachments={attachments} />
    </div>
  );
  return (
    <form className="cp-composer" data-compact={stacked} onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
                {message.files ? <span className="cp-queue__images" title={words.files(message.files)}><FileIcon />{message.files}</span> : null}
                <button type="button" className="cp-icon-button" aria-label={words.editLabel} title={words.edit} onClick={() => edit(message.id, message.text)}><PencilIcon /></button>
                <button type="button" className="cp-icon-button" aria-label={words.removeLabel} title={words.remove} onClick={() => unqueue(message.id)}><CloseIcon /></button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <CompactHint session={session} />
      <AttachmentStrip attachments={attachments} />
      {stacked ? (
        // a small window: the tools as icons on the left of a one-line field, Enter to send
        <div className="cp-composer__row">
          {tools}
          <div className="cp-composer__field">{field}</div>
        </div>
      ) : (
        <>
          {field}
          <div className="cp-composer__actions">
            {tools}
            <button type="submit" className="cp-button" data-variant="primary" disabled={!ready}>{sendLabel}</button>
          </div>
        </>
      )}
    </form>
  );
}

/**
 * Says, right where the user types, when a long conversation is worth compacting (every message reads it all again,
 * which wears down the usage limits), with the button that does it, told what to keep to go on (compactCommand).
 */
function CompactHint({ session }: { session: SessionInfo }) {
  const sendText = useSessions((s) => s.sendText);
  const [, refresh] = useState(0);
  const level = contextLevel(session.context);
  const key = `${session.conversationId ?? session.id}:${level}`;
  if ((level !== 'rising' && level !== 'high') || compactClosed(key)) return null;
  const words = t.session.context;
  const percent = Math.min(100, Math.round((session.context!.used / session.context!.max) * 100));
  return (
    <div className="cp-compact-hint" data-level={level} role="note">
      <AlertIcon />
      <span>{words.level(t.common.percent(percent))}</span>
      <button type="button" className="cp-button" data-size="small" title={words.compactTitle} onClick={() => sendText(session.id, words.compactCommand)}>
        {words.compact}
      </button>
      <button type="button" className="cp-icon-button" aria-label={words.hide} title={words.hide} onClick={() => { closeCompact(key); refresh((count) => count + 1); }}>
        <CloseIcon />
      </button>
    </div>
  );
}

/** Remote Control: the phone, with a dot that says whether it is on; what it does and where it is at in its tooltip. */
export function RemoteButton({ session }: { session: SessionInfo }) {
  const send = useSessions((s) => s.send);
  const words = t.session.remote;
  const state = session.remote?.state ?? 'off';
  return (
    <button
      type="button" className="cp-icon-button cp-remote-button" data-variant="outlined" data-state={state} aria-label="Remote Control" aria-pressed={!!session.remote}
      title={session.remote ? words.on(words.states[session.remote.state]) : words.off}
      onClick={() => send({ t: 'remoteControl', sessionId: session.id, enabled: !session.remote })}
    >
      <PhoneIcon /><span className="cp-remote-button__dot" aria-hidden="true" />
    </button>
  );
}
