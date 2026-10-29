import { Fragment, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { formatSize } from '../lib/format.ts';
import { IS_WINDOWS, shortcut } from '../lib/platform.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { EMPTY_EXPLORER, fileKind, parentOf, previewOf, previewUrl, treeRows, useFiles, type FileKind, type OpenFile, type Preview, type TreeRow } from '../state/files.ts';
import { useSessions } from '../state/sessions.ts';
import {
  AlertIcon, BackIcon, ChevronDownIcon, ChevronRightIcon, CodeIcon, PreviewIcon, RevealIcon, FileArchiveIcon, FileAudioIcon, FileCodeIcon, FileConfigIcon, FileDataIcon, FileIcon, FileImageIcon, FileLockIcon,
  FileTableIcon, FileTextIcon, FileVideoIcon, FolderIcon, FolderOpenIcon, NewFileIcon, NewFolderIcon, PencilIcon, RefreshIcon, RemoveIcon, SaveIcon,
} from './Icons.tsx';
import { Modal } from './Modal.tsx';

const CodeEditor = lazy(() => import('./CodeEditor.tsx'));

/** A name being typed in the tree: for a new file or folder in `folder`, or a new name for `path`. */
type Naming = { kind: 'newFile' | 'newFolder'; folder: string } | { kind: 'rename'; path: string; name: string };

const nameOf = (path: string) => path.split('/').pop() ?? path;

const KIND_ICONS: Record<FileKind, () => JSX.Element> = {
  code: FileCodeIcon, markup: FileCodeIcon, data: FileDataIcon, table: FileTableIcon, text: FileTextIcon, config: FileConfigIcon, lock: FileLockIcon,
  image: FileImageIcon, video: FileVideoIcon, audio: FileAudioIcon, archive: FileArchiveIcon, other: FileIcon,
};

/** A file's icon, tinted by its kind (components.css, .cp-files__kind). */
function KindIcon({ name }: { name: string }) {
  const kind = fileKind(name);
  const Icon = KIND_ICONS[kind];
  return <span className="cp-files__kind" data-kind={kind}><Icon /></span>;
}

/** The tree's width, dragged by the user, kept in this browser. */
const TREE_WIDTH = { min: 160, fallback: 240, key: 'filesTree' };

/**
 * The files of a session's folder: the tree beside the open file (the border between them dragged), or one of the two
 * at a time in a narrow window (the tree first, the file once picked, with a way back). Files and folders are made,
 * renamed and put in the Trash from their line; what the session changes shows at the end of each of its turns.
 */
export function FilesView({ session }: { session: SessionInfo }) {
  const explorer = useFiles((s) => s.explorers[session.id]) ?? EMPTY_EXPLORER;
  const refresh = useFiles((s) => s.refresh);
  const [pane, setPane] = useState<'tree' | 'file'>(explorer.file ? 'file' : 'tree');
  const [width, setWidth] = useState(() => readPreference(TREE_WIDTH.key, TREE_WIDTH.fallback));
  const box = useRef<HTMLElement>(null);
  // shown again on opening, and at the end of each turn of the session
  useEffect(() => { refresh(session.id); }, [session.id, session.turns, refresh]);
  const words = t.session.explorer;
  const resize = (next: number) => {
    const most = (box.current?.clientWidth ?? 800) * 0.6;
    const clamped = Math.round(Math.min(Math.max(next, TREE_WIDTH.min), most));
    setWidth(clamped);
    writePreference(TREE_WIDTH.key, clamped);
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const left = box.current?.getBoundingClientRect().left ?? 0;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moved: globalThis.PointerEvent) => resize(moved.clientX - left);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true });
  };
  const dirty = explorer.file?.draft != null ? explorer.file.path : null;
  // a folder of the path above the file, picked: shown in the tree, its line focused
  const reveal = (folder: string) => {
    useFiles.getState().reveal(session.id, folder);
    setPane('tree');
    requestAnimationFrame(() => {
      const line = box.current?.querySelector<HTMLButtonElement>(`.cp-files__entry[data-path="${CSS.escape(folder)}"]`);
      line?.focus({ preventScroll: true });
      line?.scrollIntoView({ block: 'nearest' });
    });
  };
  return (
    <section ref={box} className="cp-files" aria-label={words.label} data-pane={pane} style={{ '--tree': `${width}px` } as CSSProperties}>
      <FileTree session={session} rows={treeRows(explorer)} listed={'' in explorer.folders} expanded={explorer.expanded} openPath={explorer.file?.path ?? null} dirty={dirty} onOpened={() => setPane('file')} />
      <div
        className="cp-files__split" role="separator" aria-orientation="vertical" aria-label={words.resize} aria-valuenow={width} tabIndex={0} onPointerDown={drag}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); resize(width + (e.key === 'ArrowLeft' ? -24 : 24)); } }}
        onDoubleClick={() => resize(TREE_WIDTH.fallback)}
      />
      <div className="cp-files__file">
        {explorer.file ? <FilePane sessionId={session.id} file={explorer.file} onBack={() => setPane('tree')} onReveal={reveal} /> : <Placeholder />}
      </div>
    </section>
  );
}

/** No file open yet: what to do, and the keys worth knowing. */
function Placeholder() {
  const words = t.session.explorer;
  return (
    <div className="cp-files__empty">
      <span className="cp-files__empty-icon"><FolderOpenIcon /></span>
      <p>{words.pick}</p>
      <p className="cp-files__keys"><kbd className="cp-kbd">{shortcut('S')}</kbd>{words.keySave}<kbd className="cp-kbd">{shortcut('F')}</kbd>{words.keyFind}</p>
    </div>
  );
}

function FileTree({ session, rows, listed, expanded, openPath, dirty, onOpened }: { session: SessionInfo; rows: TreeRow[]; listed: boolean; expanded: string[]; openPath: string | null; dirty: string | null; onOpened: () => void }) {
  const { toggle, open, act, refresh } = useFiles.getState();
  const [naming, setNaming] = useState<Naming | null>(null);
  const [removing, setRemoving] = useState<TreeRow | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const words = t.session.explorer;
  const root = nameOf(session.cwd.replace(/[\\/]+$/, ''));
  const submit = (name: string) => {
    const value = name.trim();
    setNaming(null);
    if (!naming || !value) return;
    if (naming.kind === 'rename') { if (value !== naming.name) act(session.id, { kind: 'rename', path: naming.path, name: value }); return; }
    act(session.id, { kind: naming.kind, folder: naming.folder, name: value });
    if (naming.kind === 'newFile') onOpened();
  };
  const pick = (row: TreeRow) => { if (row.folder) toggle(session.id, row.path); else { open(session.id, row.path); onOpened(); } };
  const focusRow = (path: string) => list.current?.querySelector<HTMLButtonElement>(`[data-path="${CSS.escape(path)}"]`)?.focus();
  // the arrows walk the tree as in the Finder; F2 renames, Delete (⌘⌫) puts in the Trash
  const keys = (event: KeyboardEvent<HTMLButtonElement>, row: TreeRow, index: number) => {
    const unfolded = row.folder && expanded.includes(row.path);
    const go = (target: TreeRow | undefined) => { if (target) { event.preventDefault(); focusRow(target.path); } };
    switch (event.key) {
      case 'ArrowDown': go(rows[index + 1]); break;
      case 'ArrowUp': go(rows[index - 1]); break;
      case 'Home': go(rows[0]); break;
      case 'End': go(rows.at(-1)); break;
      case 'ArrowRight': if (row.folder && !unfolded) { event.preventDefault(); toggle(session.id, row.path); } else if (unfolded) go(rows[index + 1]); break;
      case 'ArrowLeft': if (unfolded) { event.preventDefault(); toggle(session.id, row.path); } else go(rows.find((each) => each.path === parentOf(row.path))); break;
      case 'F2': event.preventDefault(); setNaming({ kind: 'rename', path: row.path, name: row.name }); break;
      case 'Delete': case 'Backspace': if (event.key === 'Delete' || event.metaKey) { event.preventDefault(); setRemoving(row); } break;
    }
  };
  const field = (depth: number, initial = '', folder = false) => (
    <li key="naming" className="cp-files__row" data-naming="true" style={{ '--depth': depth } as CSSProperties}>
      <NameField initial={initial} folder={folder} onDone={submit} onCancel={() => setNaming(null)} />
    </li>
  );
  const newField = (folder: string, depth: number) => (naming && naming.kind !== 'rename' && naming.folder === folder ? field(depth, '', naming.kind === 'newFolder') : null);
  return (
    <div className="cp-files__tree">
      <header className="cp-files__head">
        <span className="cp-files__root" title={session.cwd}>{root}</span>
        <span className="cp-files__tools">
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.newFile} title={words.newFile} onClick={() => setNaming({ kind: 'newFile', folder: '' })}><NewFileIcon /></button>
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.newFolder} title={words.newFolder} onClick={() => setNaming({ kind: 'newFolder', folder: '' })}><NewFolderIcon /></button>
          <button type="button" className="cp-icon-button" data-size="small" aria-label={t.session.panel.refresh} title={t.session.panel.refresh} onClick={() => refresh(session.id)}><RefreshIcon /></button>
        </span>
      </header>
      <ul ref={list} className="cp-files__list" role="tree" aria-label={words.tree} aria-busy={!listed}>
        {newField('', 0)}
        {!listed && [58, 72, 40, 66, 50].map((width) => <li key={width} className="cp-files__skeleton" style={{ '--line': `${width}%` } as CSSProperties} aria-hidden="true" />)}
        {listed && rows.length === 0 && !naming && <li className="cp-files__note">{words.empty}</li>}
        {rows.map((row, index) => {
          if (naming?.kind === 'rename' && naming.path === row.path) return field(row.depth, row.name, row.folder);
          const unfolded = row.folder && expanded.includes(row.path);
          return (
            <Fragment key={row.path}>
              <li className="cp-files__row" style={{ '--depth': row.depth } as CSSProperties} role="treeitem" aria-expanded={row.folder ? unfolded : undefined} aria-selected={row.path === openPath}>
                <button type="button" className="cp-files__entry" data-path={row.path} title={row.path} onClick={() => pick(row)} onKeyDown={(e) => keys(e, row, index)}>
                  <span className="cp-files__twist">{row.folder && (unfolded ? <ChevronDownIcon /> : <ChevronRightIcon />)}</span>
                  {row.folder ? <span className="cp-files__kind" data-kind="folder">{unfolded ? <FolderOpenIcon /> : <FolderIcon />}</span> : <KindIcon name={row.name} />}
                  <span className="cp-files__name">{row.name}</span>
                  {row.path === dirty && <span className="cp-files__dirty" role="img" aria-label={words.unsaved} />}
                </button>
                {/* out of the tab order: the keys (F2, Delete) reach them from the line */}
                <span className="cp-files__actions">
                  {row.folder && <button type="button" className="cp-icon-button" data-size="small" tabIndex={-1} aria-label={words.newFileIn(row.name)} title={words.newFileIn(row.name)} onClick={() => setNaming({ kind: 'newFile', folder: row.path })}><NewFileIcon /></button>}
                  {row.folder && <button type="button" className="cp-icon-button" data-size="small" tabIndex={-1} aria-label={words.newFolderIn(row.name)} title={words.newFolderIn(row.name)} onClick={() => setNaming({ kind: 'newFolder', folder: row.path })}><NewFolderIcon /></button>}
                  <button type="button" className="cp-icon-button" data-size="small" tabIndex={-1} aria-label={words.rename(row.name)} title={`${words.rename(row.name)} (F2)`} onClick={() => setNaming({ kind: 'rename', path: row.path, name: row.name })}><PencilIcon /></button>
                  <button type="button" className="cp-icon-button" data-size="small" data-variant="danger" tabIndex={-1} aria-label={words.remove(row.name)} title={words.remove(row.name)} onClick={() => setRemoving(row)}><RemoveIcon /></button>
                </span>
              </li>
              {unfolded && newField(row.path, row.depth + 1)}
            </Fragment>
          );
        })}
      </ul>
      {removing && (
        <Modal title={words.removeQuestion(removing.name)} onClose={() => setRemoving(null)}>
          <p className="cp-muted">{removing.folder ? words.removeFolderText : words.removeText}</p>
          <div className="cp-form__actions">
            <button type="button" className="cp-button" onClick={() => setRemoving(null)}>{words.cancel}</button>
            <button type="button" className="cp-button" data-variant="danger" data-autofocus onClick={() => { act(session.id, { kind: 'delete', path: removing.path }); setRemoving(null); }}>{words.removeConfirm}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The name of a new or renamed line, typed in place: Enter keeps it, Escape or leaving the field gives up. */
function NameField({ initial, folder, onDone, onCancel }: { initial: string; folder: boolean; onDone: (name: string) => void; onCancel: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();
    // the name selected without its extension, as in the Finder
    const dot = initial.lastIndexOf('.');
    element.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const words = t.session.explorer;
  return (
    <form className="cp-files__naming" onSubmit={(e) => { e.preventDefault(); onDone(name); }}>
      <span className="cp-files__twist" />
      {folder ? <span className="cp-files__kind" data-kind="folder"><FolderIcon /></span> : <KindIcon name={name} />}
      <label className="cp-sr-only" htmlFor="files-name">{words.nameField}</label>
      <input
        id="files-name" ref={input} value={name} spellCheck={false} autoComplete="off" maxLength={255} placeholder={folder ? words.newFolder : words.newFile}
        onChange={(e) => setName(e.target.value)} onBlur={onCancel} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
      />
    </form>
  );
}

function FilePane({ sessionId, file, onBack, onReveal }: { sessionId: string; file: OpenFile; onBack: () => void; onReveal: (folder: string) => void }) {
  const { edit, save, settle } = useFiles.getState();
  const words = t.session.explorer;
  const name = nameOf(file.path);
  const folders = file.path.split('/').slice(0, -1);
  const dirty = file.draft !== null;
  const preview = previewOf(name);
  // an SVG is text and a picture: shown as a picture, its code a click away (and while it is being edited)
  const [codeOf, setCodeOf] = useState<string | null>(null);
  const svg = preview === 'image' && file.text !== null;
  const asCode = svg && (codeOf === file.path || dirty);
  const reveal = () => useSessions.getState().send({ t: 'revealFile', sessionId, path: file.path });
  const revealLabel = IS_WINDOWS ? words.revealWindows : words.reveal;
  return (
    <>
      <header className="cp-files__head cp-files__file-head">
        <button type="button" className="cp-icon-button cp-files__back" data-size="small" aria-label={words.backToTree} title={words.backToTree} onClick={onBack}><BackIcon /></button>
        <p className="cp-files__crumbs" title={file.path}>
          {folders.map((folder, index) => {
            const path = folders.slice(0, index + 1).join('/');
            return <span key={path} className="cp-files__crumb"><button type="button" title={words.showFolder(path)} onClick={() => onReveal(path)}>{folder}</button><ChevronRightIcon /></span>;
          })}
          <span className="cp-files__crumb" data-current="true"><KindIcon name={name} /><span>{name}</span></span>
          {dirty && <span className="cp-files__dirty" role="img" aria-label={words.unsaved} title={words.unsaved} />}
        </p>
        {svg && (
          <button
            type="button" className="cp-icon-button" data-size="small" aria-pressed={asCode} disabled={dirty}
            aria-label={asCode ? words.showPreview : words.showCode} title={asCode ? words.showPreview : words.showCode} onClick={() => setCodeOf(asCode ? null : file.path)}
          >{asCode ? <PreviewIcon /> : <CodeIcon />}</button>
        )}
        {file.text === null && file.unreadable !== 'missing' && !file.loading && (
          <button type="button" className="cp-icon-button" data-size="small" aria-label={revealLabel} title={revealLabel} onClick={reveal}><RevealIcon /></button>
        )}
        {file.saving ? <span className="cp-files__status" aria-live="polite">{words.saving}</span>
          : dirty && !file.conflict && (
            <button type="button" className="cp-button cp-files__save" data-size="small" data-variant="primary" title={words.saveTitle(shortcut('S'))} onClick={() => save(sessionId)}>
              <SaveIcon /><span>{words.save}</span><kbd className="cp-kbd">{shortcut('S')}</kbd>
            </button>
          )}
      </header>
      {file.conflict && (
        <div className="cp-files__conflict" role="alert">
          <AlertIcon />
          <p>{words.conflict}</p>
          <span className="cp-files__choices">
            <button type="button" className="cp-button" data-size="small" data-variant="quiet" onClick={() => settle(sessionId, 'disk')}>{words.takeDisk}</button>
            <button type="button" className="cp-button" data-size="small" data-variant="primary" onClick={() => settle(sessionId, 'mine')}>{words.keepMine}</button>
          </span>
        </div>
      )}
      {file.loading ? <Loading />
        : preview && file.unreadable !== 'missing' && (file.text === null || !asCode) ? <FilePreview sessionId={sessionId} file={file} kind={preview} name={name} />
        : file.text === null ? (
          <div className="cp-files__empty">
            <span className="cp-files__empty-icon"><KindIcon name={name} /></span>
            <p>{words[file.unreadable ?? 'binary']}</p>
            {file.size !== undefined && <p className="cp-files__meta">{formatSize(file.size)}</p>}
            {file.unreadable !== 'missing' && <button type="button" className="cp-button" data-size="small" onClick={reveal}><RevealIcon /><span>{revealLabel}</span></button>}
          </div>
        ) : (
          <Suspense fallback={<Loading />}>
            <CodeEditor
              key={`${file.path}:${file.loaded}`} path={file.path} text={file.draft ?? file.text} label={words.editor(name)}
              onChange={(text) => edit(sessionId, text)} onSave={() => save(sessionId)}
            />
          </Suspense>
        )}
    </>
  );
}

/** A picture, a PDF, a video or a sound, as the browser shows them, with what is worth knowing of it. */
function FilePreview({ sessionId, file, kind, name }: { sessionId: string; file: OpenFile; kind: Preview; name: string }) {
  const [size, setSize] = useState<string | null>(null);
  const source = previewUrl(sessionId, file.path, file.loaded);
  const facts = [size, file.size !== undefined ? formatSize(file.size) : null].filter(Boolean).join(' · ');
  return (
    <div className="cp-files__preview" data-kind={kind}>
      {kind === 'pdf' ? <iframe src={source} title={name} />
        : (
          <>
            <div className="cp-files__stage">
              {kind === 'image' && <img src={source} alt={name} onLoad={(e) => setSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} />}
              {/* biome-ignore lint/a11y/useMediaCaption: a file of the folder has no captions to give */}
              {kind === 'video' && <video src={source} controls preload="metadata" onLoadedMetadata={(e) => setSize(`${e.currentTarget.videoWidth} × ${e.currentTarget.videoHeight}`)} />}
              {kind === 'audio' && <span className="cp-files__empty-icon"><KindIcon name={name} /></span>}
              {/* biome-ignore lint/a11y/useMediaCaption: a file of the folder has no captions to give */}
              {kind === 'audio' && <audio src={source} controls preload="metadata" />}
            </div>
            {facts && <p className="cp-files__meta">{facts}</p>}
          </>
        )}
    </div>
  );
}

/** Lines of uneven length where the text will be, while it comes. */
function Loading() {
  return (
    <div className="cp-files__loading" role="status" aria-label={t.session.explorer.loading}>
      {[62, 84, 45, 70, 30, 76, 52].map((width) => <span key={width} style={{ '--line': `${width}%` } as CSSProperties} />)}
    </div>
  );
}
