import { useEffect, useMemo, useRef, useState } from 'react';
import type { Effort, PermissionMode, TuneChange } from '../../shared/protocol.ts';
import { defaultFolder, formatDuration, homeRelative } from '../lib/format.ts';
import { availability, stillFree } from '../state/availability.ts';
import { useSessions } from '../state/sessions.ts';
import { AttachButton, AttachmentStrip, DropOverlay } from './Attachments.tsx';
import { CommandField } from './CommandField.tsx';
import { t } from '../i18n/index.ts';
import { useAttachments } from './useAttachments.ts';
import { CloseIcon, SendIcon } from './Icons.tsx';
import { FolderPicker } from './FolderPicker.tsx';
import { PersonPicker } from './PersonPicker.tsx';
import { TuneMenu } from './TuneMenu.tsx';


/**
 * Where a session starts when none is open: a message field at the bottom, with its folder (the default one when left empty),
 * model, effort, permissions and ultracode; above it, the folder's Claude Code conversations when resuming one. Enter starts the session,
 * which opens in its place. N puts the focus here; Shift+N starts a session at once (see App.tsx). `onClose`: shown as
 * a window beside the open sessions (focus mode), it can be closed; `replacing`: the session the new one will take the
 * place of, when no room is left.
 */
export function Launcher({ onClose, replacing }: { onClose?: () => void; replacing?: string }) {
  const roots = useSessions((s) => s.roots);
  const directories = useSessions((s) => s.directories);
  const found = useSessions((s) => s.conversations);
  const draft = useSessions((s) => s.newSession);
  const openNewSession = useSessions((s) => s.openNewSession);
  const createSession = useSessions((s) => s.createSession);
  const send = useSessions((s) => s.send);
  const live = useSessions((s) => s.connection === 'live');
  const crew = useSessions((s) => s.crew);
  const sessions = useSessions((s) => s.sessions);
  const people = useMemo(() => availability(crew, Object.values(sessions)), [crew, sessions]);
  // someone asked for who got a session meanwhile is not asked for any more
  const [asked, setAsked] = useState<string | null>(null);
  const person = stillFree(asked, people);

  const [resuming, setResuming] = useState(false);
  const [folder, setFolder] = useState('');
  const preferences = useSessions((s) => s.preferences);
  const [model, setModel] = useState(preferences.model);
  const [effort, setEffort] = useState<Effort>();
  const [ultracode, setUltracode] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(preferences.permissionMode);
  // the settings arrive with the server's hello, maybe after the launcher showed
  useEffect(() => { setModel(preferences.model); setPermissionMode(preferences.permissionMode); }, [preferences.model, preferences.permissionMode]);
  const [text, setText] = useState('');
  const [resumeId, setResumeId] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const attachments = useAttachments();
  const cwd = folder.trim() || defaultFolder(roots, preferences.defaultFolder);
  const conversations = found && found.cwd === cwd ? found.list : null;

  useEffect(() => { if (live) send({ t: 'directories' }); }, [live, send]);

  // a request for a new session (N, the palette, the room) lands here: the field takes the focus and the command asked for
  useEffect(() => {
    if (!draft) return;
    setResuming(false);
    if (draft.command) setText(draft.command);
    if (draft.person) setAsked(draft.person);
    field.current?.focus();
    openNewSession(null);
  }, [draft, openNewSession]);

  // the folder's conversations, asked for once the user stops typing it
  useEffect(() => {
    if (!resuming || !cwd || !live) return;
    setResumeId(null);
    const timer = window.setTimeout(() => send({ t: 'conversations', cwd }), 250);
    return () => window.clearTimeout(timer);
  }, [resuming, cwd, live, send]);

  const tune = (change: TuneChange) => {
    if (change.model !== undefined) setModel(change.model);
    if (change.effort !== undefined) setEffort(change.effort || undefined);
    if (change.ultracode !== undefined) setUltracode(change.ultracode);
    if (change.permissionMode !== undefined) setPermissionMode(change.permissionMode);
  };

  const ready = (resuming ? resumeId !== null : true) && !attachments.preparing;
  const start = () => {
    if (!ready || !cwd) return;
    const message = text.trim();
    const images = attachments.uploads;
    const files = attachments.files;
    createSession({ cwd, model, ...(effort ? { effort } : {}), ...(ultracode ? { ultracode } : {}), permissionMode, ...(person ? { name: person } : {}), ...(message ? { text: message } : {}), ...(images.length ? { images } : {}), ...(files.length ? { files } : {}), ...(resuming && resumeId ? { resumeId } : {}) });
    setText('');
    attachments.clear();
    setResumeId(null);
    setAsked(null);
  };

  const words = t.composer.launcher;
  return (
    <aside className="cp-launcher" aria-label={words.label} {...attachments.dropTarget}>
      <DropOverlay attachments={attachments} />
      <div className="cp-launcher__head">
        <div className="cp-segmented" role="group" aria-label={words.conversation}>
          <button type="button" aria-pressed={!resuming} onClick={() => setResuming(false)}>{words.newConversation}</button>
          <button type="button" aria-pressed={resuming} onClick={() => setResuming(true)}>{words.resume}</button>
        </div>
        {onClose && <button type="button" className="cp-icon-button cp-launcher__close" aria-label={words.close} title={words.close} onClick={onClose}><CloseIcon /></button>}
      </div>

      <div className="cp-launcher__body">
        {!resuming ? (
          <div className="cp-launcher__intro">
            <h2>{words.title}</h2>
            <p>{replacing ? words.replaces(replacing) : words.intro}</p>
            <ul className="cp-launcher__keys">
              <li><kbd className="cp-kbd">N</kbd> {words.newRequest}</li>
              <li><kbd className="cp-kbd">{words.shiftN}</kbd> {words.startNow(homeRelative(defaultFolder(roots, preferences.defaultFolder)))}</li>
              <li><kbd className="cp-kbd">/</kbd> {words.commandKey}</li>
            </ul>
          </div>
        ) : !conversations ? <p className="cp-muted">{words.searching(homeRelative(cwd))}</p>
          : conversations.length === 0 ? <p className="cp-muted">{words.noConversation(homeRelative(cwd))}</p>
            : (
              <ul className="cp-resume__list" aria-label={words.conversationsOf(homeRelative(cwd))}>
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button type="button" className="cp-resume__item" aria-pressed={resumeId === conversation.id} onClick={() => { setResumeId(conversation.id); field.current?.focus(); }}>
                      <span className="cp-resume__title">{conversation.title}</span>
                      <span className="cp-resume__when">{words.ago(formatDuration(Date.now() - conversation.updatedAt))}</span>
                      {conversation.preview && conversation.preview !== conversation.title && <span className="cp-resume__preview">{conversation.preview}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </div>

      <form className="cp-launcher__composer" onSubmit={(e) => { e.preventDefault(); start(); }}>
        <div className="cp-launcher__box">
        <AttachmentStrip attachments={attachments} />
        <CommandField
          ref={field} id="launcher-field" label={words.fieldLabel} value={text} onChange={setText} onSubmit={() => { if (text.trim() || attachments.items.length) start(); }}
          onPaste={attachments.onPaste}
          placeholder={resuming ? (resumeId ? words.placeholderResume : words.placeholderPickFirst) : words.placeholder}
        />
        <div className="cp-launcher__options">
          {people.length > 0 && <PersonPicker people={people} chosen={person} onChoose={setAsked} />}
          <FolderPicker directories={directories} value={folder} onChange={setFolder} placeholder={homeRelative(defaultFolder(roots, preferences.defaultFolder))} />
          <TuneMenu tuning={{ model, effort, ultracode, permissionMode }} cwd={cwd} onChange={tune} />
          <AttachButton attachments={attachments} className="cp-icon-button cp-launcher__attach" />
          <button type="submit" className="cp-launcher__send" disabled={!ready}><span className="cp-launcher__send-label">{resuming ? words.resume : words.start}</span><SendIcon /></button>
        </div>
        </div>
      </form>
    </aside>
  );
}
