import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Note } from '../../shared/protocol.ts';
import { noteFileName, noteTitle } from '../../shared/journal.ts';
import { t } from '../i18n/index.ts';
import { homeRelative } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';
import { BoardTray } from './BoardTray.tsx';
import { InfoIcon, PencilIcon, PlusIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { Prose } from './Prose.tsx';
import { SaveNote } from './SaveNote.tsx';
import { useAutosave } from './useAutosave.ts';

/** The folder is listed again this often while the board is open: sessions write to the notes too. */
const POLL_MS = 4000;
const SAVE_DELAY_MS = 800;

export function BoardDialog() {
  const open = useSessions((s) => s.boardOpen);
  return open ? <Board /> : null;
}

/** The text shown of a note, and which note it is. */
interface Draft { name: string; text: string }

/**
 * The whiteboard's notes: one tab per Markdown file of the journal folder, shown rendered, written in a plain text field
 * and saved by itself. A note a session changed on the disk is shown again as long as the user has nothing waiting to be
 * saved; a save made from an older version is refused by the server, and the note is reloaded with a word about it.
 */
function Board() {
  const send = useSessions((s) => s.send);
  const openBoard = useSessions((s) => s.openBoard);
  const notes = useSessions((s) => s.notes);
  const lastNote = useSessions((s) => s.lastNote);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** the name of a new note being typed, null when none */
  const [naming, setNaming] = useState<string | null>(null);
  /** what the board is and how sessions write to it, shown under the "i" */
  const [helping, setHelping] = useState(false);
  /** the version of the open note the text field started from: a save carries it */
  const loaded = useRef<{ name: string; version: string; mtime: number } | null>(null);
  /** a new note asked for and not answered yet: the folder may be listed without it meanwhile */
  const creating = useRef<string | null>(null);
  const words = t.board;

  const { status, flush, start } = useAutosave<Draft | null>(draft, (next) => {
    const base = loaded.current;
    if (!next || base?.name !== next.name) return null;
    return send({ t: 'writeNote', name: next.name, text: next.text, version: base.version }) ? null : t.settings.noServer;
  }, undefined, SAVE_DELAY_MS);
  const waiting = status.state !== 'saved';
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;

  /** Shows a note as it is on the disk, without saving it back. */
  const show = (note: Note) => {
    loaded.current = { name: note.name, version: note.version, mtime: note.mtime };
    const next = { name: note.name, text: note.text };
    start(next);
    setDraft(next);
  };

  const choose = (name: string) => {
    flush();
    setNotice(null);
    setEditing(false);
    setSelected(name);
    send({ t: 'readNote', name });
  };

  useEffect(() => {
    const list = () => { if (!document.hidden) send({ t: 'notes' }); };
    list();
    const timer = window.setInterval(list, POLL_MS);
    return () => window.clearInterval(timer);
  }, [send]);

  // the first note opens by itself; one deleted on the disk gives its place to the first; one changed there is read again
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each listing, with the open note at that time
  useEffect(() => {
    if (!notes) return;
    const listed = notes.files.find((file) => file.name === selected);
    if (!listed) {
      if (selected !== null && selected === creating.current) return;
      const first = notes.files[0]?.name ?? null;
      if (first) choose(first);
      else { setSelected(null); setDraft(null); loaded.current = null; }
      return;
    }
    if (loaded.current?.name === listed.name && loaded.current.mtime !== listed.mtime && !waitingRef.current) send({ t: 'readNote', name: listed.name });
  }, [notes]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each note the server sends
  useEffect(() => {
    if (!lastNote || lastNote.note.name !== selected) return;
    const { note, outcome } = lastNote;
    const isNew = creating.current === note.name;
    if (isNew) creating.current = null;
    if (outcome === 'saved' && !isNew) { loaded.current = { name: note.name, version: note.version, mtime: note.mtime }; return; }
    if (outcome === 'read' && waitingRef.current) return;
    if (outcome === 'conflict' && !isNew) setNotice(words.conflict);
    show(note);
    if (isNew && outcome === 'saved') setEditing(true);
  }, [lastNote]);

  const create = (event: FormEvent) => {
    event.preventDefault();
    const name = noteFileName(naming ?? '');
    if (!name) return;
    setNaming(null);
    if (notes?.files.some((file) => file.name === name)) { choose(name); return; }
    flush();
    setNotice(null);
    setDraft(null);
    loaded.current = null;
    creating.current = name;
    setSelected(name);
    send({ t: 'writeNote', name, text: `# ${noteTitle(name)}\n\n`, version: null });
  };

  const files = notes?.files ?? [];
  const shown = draft && draft.name === selected ? draft : null;
  const badName = naming !== null && naming.trim() !== '' && !noteFileName(naming);
  return (
    <Modal title={words.title} onClose={() => openBoard(false)} wide look="board">
      <div className="cp-board">
        <div className="cp-board__bar">
          <div className="cp-board__tabs" role="tablist" aria-label={words.tabs}>
            {files.map((file) => (
              <button key={file.name} type="button" role="tab" aria-selected={file.name === selected} onClick={() => { if (file.name !== selected) choose(file.name); }}>
                {noteTitle(file.name)}
              </button>
            ))}
          </div>
          <button type="button" className="cp-icon-button" aria-label={words.add} title={words.add} onClick={() => setNaming('')}><PlusIcon /></button>
          <button type="button" className="cp-icon-button" aria-label={words.help} title={words.help} aria-expanded={helping} aria-controls="board-help" onClick={() => setHelping(!helping)}><InfoIcon /></button>
        </div>
        {helping && (
          <div id="board-help" className="cp-board__help">
            <p>{words.helpWhat(homeRelative(notes?.folder ?? ''))}</p>
            <p>{words.helpSessions}<code>{words.claudeLine(homeRelative(notes?.folder ?? ''))}</code></p>
            <p>{words.helpFolder}</p>
          </div>
        )}
        {naming !== null && (
          <form className="cp-board__new" onSubmit={create}>
            <input value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={words.newPlaceholder} aria-label={words.add} aria-invalid={badName} autoFocus spellCheck={false} />
            <button type="submit" className="cp-button" data-variant="primary" disabled={!noteFileName(naming)}>{words.create}</button>
            <button type="button" className="cp-button" data-variant="quiet" onClick={() => setNaming(null)}>{words.cancel}</button>
            {badName && <p className="cp-board__problem">{words.badName}</p>}
          </form>
        )}
        {notice && <p className="cp-board__notice" role="status">{notice}</p>}
        {notes && !files.length && selected === null ? (
          <div className="cp-empty-state">
            <p>{words.empty(homeRelative(notes.folder))}</p>
            <p>{words.emptyHint}<code>{words.claudeLine(homeRelative(notes.folder))}</code></p>
            <button type="button" className="cp-button" onClick={() => setNaming('')}><PlusIcon />{words.add}</button>
          </div>
        ) : !shown ? (
          <p className="cp-muted">{words.loading}</p>
        ) : editing ? (
          <textarea
            className="cp-board__editor" value={shown.text} aria-label={words.editLabel(noteTitle(shown.name))} autoFocus spellCheck={false}
            onChange={(e) => setDraft({ name: shown.name, text: e.target.value })} onBlur={flush}
          />
        ) : (
          // a click on the note writes in it, except on a link (the "Edit" button does the same from the keyboard)
          <div className="cp-board__page" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) setEditing(true); }}>
            {shown.text.trim() ? <Prose text={shown.text} className="cp-board__prose" /> : <p className="cp-muted">{words.blank}</p>}
          </div>
        )}
        <div className="cp-form__actions">
          {shown && <SaveNote status={status} />}
          {shown && (
            <button type="button" className="cp-button" data-variant="quiet" aria-pressed={editing} onClick={() => { if (editing) flush(); setEditing(!editing); }}>
              <PencilIcon />{editing ? words.view : words.edit}
            </button>
          )}
          <button type="button" className="cp-button" onClick={() => openBoard(false)}>{t.settings.close}</button>
        </div>
      </div>
      <BoardTray />
    </Modal>
  );
}
