import { useEffect, useRef, useState } from 'react';
import { PERMISSION_MODES, type PermissionMode } from '../../shared/protocol.ts';
import { defaultFolder, formatDuration, homeRelative } from '../lib/format.ts';
import { MODELS, PERMISSION_MODE_LABELS, SHORT_MODE_LABELS as MODES } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';
import { AttachButton, AttachmentStrip, DropOverlay } from './Attachments.tsx';
import { CommandField } from './CommandField.tsx';
import { useAttachments } from './useAttachments.ts';
import { SendIcon } from './Icons.tsx';


/**
 * Where a session starts when none is open: a message field at the bottom, with its folder (the default one when left empty),
 * model and permissions; above it, the folder's Claude Code conversations when resuming one. Enter starts the session,
 * which opens in its place. N puts the focus here; Shift+N starts a session at once (see App.tsx).
 */
export function Launcher() {
  const roots = useSessions((s) => s.roots);
  const directories = useSessions((s) => s.directories);
  const found = useSessions((s) => s.conversations);
  const draft = useSessions((s) => s.newSession);
  const openNewSession = useSessions((s) => s.openNewSession);
  const createSession = useSessions((s) => s.createSession);
  const send = useSessions((s) => s.send);
  const live = useSessions((s) => s.connection === 'live');

  const [resuming, setResuming] = useState(false);
  const [folder, setFolder] = useState('');
  const preferences = useSessions((s) => s.preferences);
  const [model, setModel] = useState(preferences.model);
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

  const ready = (resuming ? resumeId !== null : true) && !attachments.preparing;
  const start = () => {
    if (!ready || !cwd) return;
    const message = text.trim();
    const images = attachments.uploads;
    createSession({ cwd, model, permissionMode, ...(message ? { text: message } : {}), ...(images.length ? { images } : {}), ...(resuming && resumeId ? { resumeId } : {}) });
    setText('');
    attachments.clear();
    setResumeId(null);
  };

  return (
    <aside className="cp-launcher" aria-label="Nouvelle session" {...attachments.dropTarget}>
      <DropOverlay attachments={attachments} />
      <div className="cp-launcher__head">
        <div className="cp-segmented" role="group" aria-label="Conversation">
          <button type="button" aria-pressed={!resuming} onClick={() => setResuming(false)}>Nouvelle conversation</button>
          <button type="button" aria-pressed={resuming} onClick={() => setResuming(true)}>Reprendre</button>
        </div>
      </div>

      <div className="cp-launcher__body">
        {!resuming ? (
          <div className="cp-launcher__intro">
            <h2>Qu’est-ce qu’on lance ?</h2>
            <p>Écris ta demande en bas : une session démarre dans le dossier choisi, avec un prénom de ton équipe, et s’ouvre ici.</p>
            <ul className="cp-launcher__keys">
              <li><kbd className="cp-kbd">N</kbd> écrire une nouvelle demande</li>
              <li><kbd className="cp-kbd">Maj N</kbd> lancer tout de suite une session dans {homeRelative(defaultFolder(roots, preferences.defaultFolder))}</li>
              <li><kbd className="cp-kbd">/</kbd> en début de message pour une commande</li>
            </ul>
          </div>
        ) : !conversations ? <p className="cp-muted">Recherche des conversations de {homeRelative(cwd)}…</p>
          : conversations.length === 0 ? <p className="cp-muted">Aucune conversation Claude Code dans {homeRelative(cwd)} (ou elles sont déjà ouvertes ici).</p>
            : (
              <ul className="cp-resume__list" aria-label={`Conversations de ${homeRelative(cwd)}`}>
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button type="button" className="cp-resume__item" aria-pressed={resumeId === conversation.id} onClick={() => { setResumeId(conversation.id); field.current?.focus(); }}>
                      <span className="cp-resume__title">{conversation.title}</span>
                      <span className="cp-resume__when">il y a {formatDuration(Date.now() - conversation.updatedAt)}</span>
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
          ref={field} id="launcher-field" label="Première demande" value={text} onChange={setText} onSubmit={() => { if (text.trim() || attachments.items.length) start(); }}
          onPaste={attachments.onPaste}
          placeholder={resuming ? (resumeId ? 'Un message pour reprendre (facultatif)…' : 'Choisis d’abord une conversation au-dessus') : 'Qu’est-ce qu’on fait ? (Entrée lance, / pour une commande)'}
        />
        <div className="cp-launcher__options">
          <label className="cp-chip" data-folder title="Dossier de la session (laisse vide pour ton dossier par défaut)">
            <span className="cp-sr-only">Dossier</span>
            <input list="launcher-directories" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={homeRelative(defaultFolder(roots, preferences.defaultFolder))} />
            <datalist id="launcher-directories">{directories.map((directory) => <option key={directory} value={directory}>{homeRelative(directory)}</option>)}</datalist>
          </label>
          <label className="cp-chip" data-select>
            <span className="cp-sr-only">Modèle</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>{MODELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="cp-chip" data-select title={PERMISSION_MODE_LABELS[permissionMode]}>
            <span className="cp-sr-only">Autorisations</span>
            <select value={permissionMode} onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}>
              {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{MODES[mode]}</option>)}
            </select>
          </label>
          <AttachButton attachments={attachments} className="cp-icon-button cp-launcher__attach" />
          <button type="submit" className="cp-launcher__send" disabled={!ready}>{resuming ? 'Reprendre' : 'Lancer'}<SendIcon /></button>
        </div>
        </div>
      </form>
    </aside>
  );
}
