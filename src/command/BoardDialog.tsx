import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Note, NoteFile } from '../../shared/protocol.ts';
import { noteFileName, noteTitle } from '../../shared/journal.ts';
import { t } from '../i18n/index.ts';
import { IS_MAC, shortcut } from '../lib/platform.ts';
import { formatAgo, homeRelative } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { useSessions } from '../state/sessions.ts';
import { CheckIcon, CloseIcon, CopyIcon, InfoIcon, NotesIcon, PencilIcon, PlusIcon, RemoveIcon, SearchIcon, StarIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { Prose } from './Prose.tsx';
import { SaveNote } from './SaveNote.tsx';
import { useAutosave } from './useAutosave.ts';
import { useSearchMarks } from './useSearchMarks.ts';

/** The folder is listed again this often while the board is open: sessions write to the notes too. */
const POLL_MS = 4000;
const SAVE_DELAY_MS = 800;
const COPIED_MS = 1500;
const SEARCH_DELAY_MS = 200;
/** a rename or delete the folder still does not show after this long has failed (the server said why in a toast) */
const CHANGE_TIMEOUT_MS = 3000;

export function BoardDialog() {
  const open = useSessions((s) => s.boardOpen);
  return open ? <Board /> : null;
}

/** The text shown of a note, and which note it is. */
interface Draft { name: string; text: string }

/** The notes as the list shows them: the starred ones first, each group the last changed first. */
function inListOrder(files: NoteFile[], favorites: string[]): NoteFile[] {
  const recent = [...files].sort((a, b) => b.mtime - a.mtime);
  return [...recent.filter((file) => favorites.includes(file.name)), ...recent.filter((file) => !favorites.includes(file.name))];
}

/** A rename (`to`, the new name) or a delete (`to` null) sent, until the folder shows it. */
interface Change { from: string; to: string | null; at: number }

/**
 * The whiteboard's notes: the Markdown files of the journal folder listed on the left (the starred ones first, or those
 * holding what is searched for), the open one on the right, read as rendered Markdown and written in a plain text field
 * only once "Edit" is pressed, saved by itself. A note a session changed on the disk is shown again as long as the user
 * has nothing waiting to be saved; a save made from an older version is refused by the server, and the note is reloaded
 * with a word about it.
 */
function Board() {
  const send = useSessions((s) => s.send);
  const openBoard = useSessions((s) => s.openBoard);
  const notes = useSessions((s) => s.notes);
  const lastNote = useSessions((s) => s.lastNote);
  const noteMatches = useSessions((s) => s.noteMatches);
  const favorites = useSessions((s) => s.preferences.favoriteNotes);
  const setPreferences = useSessions((s) => s.setPreferences);
  const now = useNow(60_000);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** the name of a new note being typed, null when none */
  const [naming, setNaming] = useState<string | null>(null);
  /** the new name of the open note being typed, null when none */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [query, setQuery] = useState('');
  /** what the board is and how sessions write to it, shown under the "i" */
  const [helping, setHelping] = useState(false);
  /** the version of the open note the text field started from: a save carries it (none: nothing is saved) */
  const loaded = useRef<{ name: string; version: string; mtime: number } | null>(null);
  /** a new note asked for and not answered yet: the folder may be listed without it meanwhile */
  const creating = useRef<string | null>(null);
  const changing = useRef<Change | null>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLDivElement>(null);
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
    setCopied(false);
    setRenaming(null);
    setConfirmingDelete(false);
    setSelected(name);
    send({ t: 'readNote', name });
  };

  const toggleEditing = () => {
    if (editing) flush();
    setEditing(!editing);
  };

  /** Sends a rename (to the new name) or a delete (null) of the open note: what was waiting is saved first, then nothing more is saved to it. */
  const change = (to: string | null) => {
    if (!selected) return;
    flush();
    loaded.current = null;
    setEditing(false);
    setRenaming(null);
    setConfirmingDelete(false);
    changing.current = { from: selected, to, at: Date.now() };
    send(to ? { t: 'renameNote', name: selected, newName: to } : { t: 'deleteNote', name: selected });
  };

  useEffect(() => {
    const list = () => { if (!document.hidden) send({ t: 'notes' }); };
    list();
    const timer = window.setInterval(list, POLL_MS);
    return () => window.clearInterval(timer);
  }, [send]);

  // the board opens on its search field, except on a touch screen (its keyboard would cover the notes)
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) searchField.current?.focus();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // searched again when the query or a note changes
  const filesKey = (notes?.files ?? []).map((file) => `${file.name}:${file.mtime}`).join('|');
  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => send({ t: 'searchNotes', query }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [send, query, filesKey]);

  // the first note opens by itself; one deleted on the disk gives its place to the first; one changed there is read
  // again; a renamed one opens under its new name
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each listing, with the open note at that time
  useEffect(() => {
    if (!notes) return;
    const has = (name: string) => notes.files.some((file) => file.name === name);
    const pending = changing.current;
    if (pending) {
      if (pending.to && has(pending.to)) { changing.current = null; choose(pending.to); return; }
      if (!has(pending.from)) changing.current = null;
      else if (Date.now() - pending.at > CHANGE_TIMEOUT_MS) { changing.current = null; choose(pending.from); return; }
      else return;
    }
    const listed = notes.files.find((file) => file.name === selected);
    if (!listed) {
      if (selected !== null && selected === creating.current) return;
      const first = inListOrder(notes.files, favorites)[0]?.name ?? null;
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

  const files = notes?.files ?? [];
  const taken = (name: string) => files.some((file) => file.name === name);

  const create = (event: FormEvent) => {
    event.preventDefault();
    const name = noteFileName(naming ?? '');
    if (!name) return;
    setNaming(null);
    setQuery('');
    if (taken(name)) { choose(name); return; }
    flush();
    setNotice(null);
    setDraft(null);
    loaded.current = null;
    creating.current = name;
    setSelected(name);
    send({ t: 'writeNote', name, text: `# ${noteTitle(name)}\n\n`, version: null });
  };

  const newName = renaming === null ? null : noteFileName(renaming);
  const renameProblem = renaming === null || !renaming.trim() ? null
    : !newName ? words.badName
    : newName !== selected && taken(newName) ? words.taken(noteTitle(newName))
    : null;
  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!newName || renameProblem) return;
    if (newName === selected) setRenaming(null);
    else change(newName);
  };

  const listed = inListOrder(files, favorites);
  const starred = listed.filter((file) => favorites.includes(file.name));
  const toggleFavorite = (name: string) => {
    setPreferences({ favoriteNotes: favorites.includes(name) ? favorites.filter((favorite) => favorite !== name) : [...favorites, name] });
  };
  const star = (name: string) => {
    const on = favorites.includes(name);
    const label = on ? words.unstar(noteTitle(name)) : words.star(noteTitle(name));
    return <button type="button" className="cp-board__star" aria-pressed={on} aria-label={label} title={label} onClick={() => toggleFavorite(name)}><StarIcon /></button>;
  };

  const searching = query.trim() !== '';
  const matches = searching && noteMatches?.query === query ? noteMatches.matches : null;
  const shown = draft && draft.name === selected ? draft : null;
  const openFile = files.find((file) => file.name === selected);
  const badName = naming !== null && naming.trim() !== '' && !noteFileName(naming);
  const folder = homeRelative(notes?.folder ?? '');
  useSearchMarks(page, editing ? '' : query, `${shown?.name}:${shown?.text}`);

  const copy = () => {
    if (!shown) return;
    void navigator.clipboard.writeText(shown.text).then(() => setCopied(true), () => { /* refused: nothing copied */ });
  };

  // Enter opens the first note found; Escape empties the search before it closes the board
  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && matches?.[0]) { event.preventDefault(); choose(matches[0].name); }
    if (event.key === 'Escape' && query) { event.preventDefault(); setQuery(''); }
  };

  // ⌘E (Ctrl+E) writes in the open note or goes back to reading it, wherever the focus is in the board; Escape in the
  // text field reads the note again instead of closing the board
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens again whenever what a key does changes
  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'e' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        toggleEditing();
      } else if (event.key === 'Escape' && editing && event.target instanceof HTMLTextAreaElement) {
        event.preventDefault();
        toggleEditing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown?.name, editing]);

  const noteTab = (name: string, detail: ReactNode) => (
    <button type="button" role="tab" aria-selected={name === selected} onClick={() => { if (name !== selected) choose(name); }}>
      <span className="cp-board__name">{noteTitle(name)}</span>
      {detail}
    </button>
  );

  return (
    <Modal title={words.title} onClose={() => openBoard(false)} look="panel">
      <div className="cp-board">
        <aside className="cp-board__side">
          <div className="cp-board__brand">
            <NotesIcon />
            <span>{words.title}</span>
            <button type="button" className="cp-icon-button" data-size="small" aria-label={words.add} title={words.add} onClick={() => setNaming('')}><PlusIcon /></button>
          </div>
          <label className="cp-board__search">
            <SearchIcon />
            <input
              ref={searchField} type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
              placeholder={words.search} aria-label={words.search} spellCheck={false}
            />
          </label>
          {naming !== null && (
            <form className="cp-board__new" onSubmit={create}>
              <input
                value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={words.newPlaceholder} aria-label={words.add} aria-invalid={badName} autoFocus spellCheck={false}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setNaming(null); } }}
              />
              {badName && <p className="cp-board__problem">{words.badName}</p>}
              <div className="cp-board__new-actions">
                <button type="button" className="cp-button" data-variant="quiet" onClick={() => setNaming(null)}>{words.cancel}</button>
                <button type="submit" className="cp-button" data-variant="primary" disabled={!noteFileName(naming)}>{words.create}</button>
              </div>
            </form>
          )}
          <div className="cp-board__list" role="tablist" aria-label={words.tabs} aria-orientation="vertical">
            {!searching ? listed.map((file, at) => (
              <div key={file.name} className="cp-board__item" role="presentation" data-favorite={favorites.includes(file.name)} data-last-favorite={at === starred.length - 1 && at < listed.length - 1}>
                {noteTab(file.name, <span className="cp-board__age">{formatAgo(now - file.mtime)}</span>)}
                {star(file.name)}
              </div>
            )) : matches === null ? (
              <p className="cp-board__status">{words.searching}</p>
            ) : !matches.length ? (
              <p className="cp-board__status">{words.noMatch(query.trim())}</p>
            ) : matches.map((match) => (
              <div key={match.name} className="cp-board__item" role="presentation" data-found="true">
                {noteTab(match.name, (
                  <>
                    {match.count > 0 && <span className="cp-board__count" title={words.hits(match.count)}>{match.count}</span>}
                    {match.excerpt && <span className="cp-board__excerpt">{match.excerpt}</span>}
                  </>
                ))}
              </div>
            ))}
          </div>
          <div className="cp-board__foot">
            <code title={notes?.folder}>{folder}</code>
            <button type="button" className="cp-icon-button" data-size="small" aria-label={words.help} title={words.help} aria-expanded={helping} aria-controls="board-help" onClick={() => setHelping(!helping)}><InfoIcon /></button>
          </div>
        </aside>

        <section className="cp-board__main">
          <header className="cp-board__head">
            <div className="cp-board__heading">
              {renaming !== null ? (
                <form className="cp-board__rename" onSubmit={rename}>
                  <input
                    value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label={words.renameLabel} aria-invalid={renameProblem !== null} autoFocus spellCheck={false}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setRenaming(null); } }}
                  />
                  <button type="submit" className="cp-icon-button" data-size="small" aria-label={words.renameSave} title={words.renameSave} disabled={!newName || renameProblem !== null}><CheckIcon /></button>
                  <button type="button" className="cp-icon-button" data-size="small" aria-label={words.cancel} title={words.cancel} onClick={() => setRenaming(null)}><CloseIcon /></button>
                </form>
              ) : (
                <div className="cp-board__title">
                  <h3 onDoubleClick={() => { if (openFile) setRenaming(noteTitle(openFile.name)); }}>{selected ? noteTitle(selected) : words.title}</h3>
                  {openFile && star(openFile.name)}
                  {openFile && (
                    <button type="button" className="cp-board__star" data-quiet="true" aria-label={words.rename} title={words.rename} onClick={() => setRenaming(noteTitle(openFile.name))}><PencilIcon /></button>
                  )}
                </div>
              )}
              {renameProblem ? <p className="cp-board__problem">{renameProblem}</p> : shown && (
                <div className="cp-board__meta">
                  {openFile && <span>{words.changed(formatAgo(now - openFile.mtime))}</span>}
                  <SaveNote status={status} />
                </div>
              )}
            </div>
            {shown && (
              <div className="cp-board__actions">
                <button type="button" className="cp-button" data-variant="quiet" onClick={copy} disabled={!shown.text.trim()} aria-live="polite">
                  {copied ? <CheckIcon /> : <CopyIcon />}{copied ? t.common.copied : words.copy}
                </button>
                <button type="button" className="cp-button" data-variant={editing ? 'primary' : undefined} aria-pressed={editing} aria-keyshortcuts={IS_MAC ? 'Meta+E' : 'Control+E'} onClick={toggleEditing} title={editing ? words.viewHint : words.editHint}>
                  {editing ? <CheckIcon /> : <PencilIcon />}{editing ? words.view : words.edit}
                  <kbd className="cp-kbd">{shortcut('E')}</kbd>
                </button>
                <button type="button" className="cp-icon-button" aria-label={words.delete} title={words.delete} aria-expanded={confirmingDelete} onClick={() => setConfirmingDelete(!confirmingDelete)}><RemoveIcon /></button>
              </div>
            )}
            <button type="button" className="cp-icon-button" aria-label={t.settings.close} title={t.settings.close} onClick={() => openBoard(false)}><CloseIcon /></button>
          </header>

          {confirmingDelete && selected && (
            <div className="cp-board__confirm" role="alertdialog" aria-label={words.delete}>
              <p>{words.deleteAsk(noteTitle(selected))}</p>
              <button type="button" className="cp-button" data-variant="quiet" onClick={() => setConfirmingDelete(false)}>{words.cancel}</button>
              <button type="button" className="cp-button" data-variant="danger" onClick={() => change(null)} autoFocus><RemoveIcon />{words.deleteConfirm}</button>
            </div>
          )}
          {helping && (
            <div id="board-help" className="cp-board__help">
              <p>{words.helpWhat(folder)}</p>
              <p>{words.helpSessions}<code>{words.claudeLine(folder)}</code></p>
              <p>{words.helpFolder}</p>
            </div>
          )}
          {notice && <p className="cp-board__notice" role="status">{notice}</p>}

          {notes && !files.length && selected === null ? (
            <div className="cp-board__content">
              <div className="cp-empty-state">
                <p>{words.empty(folder)}</p>
                <p>{words.emptyHint}<code>{words.claudeLine(folder)}</code></p>
                <button type="button" className="cp-button" onClick={() => setNaming('')}><PlusIcon />{words.add}</button>
              </div>
            </div>
          ) : !shown ? (
            <p className="cp-board__content cp-muted">{words.loading}</p>
          ) : editing ? (
            <textarea
              className="cp-board__editor" value={shown.text} aria-label={words.editLabel(noteTitle(shown.name))} autoFocus spellCheck={false}
              onChange={(e) => setDraft({ name: shown.name, text: e.target.value })} onBlur={flush}
            />
          ) : (
            <div className="cp-board__content" ref={page}>
              {shown.text.trim() ? <Prose text={shown.text} className="cp-board__prose" /> : (
                <div className="cp-empty-state">
                  <p>{words.blank}</p>
                  <button type="button" className="cp-button" onClick={toggleEditing}><PencilIcon />{words.write}</button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
