// The file explorer of each session's window (the "Fichiers" tab): the folders listed so far, those unfolded, and the
// file open in the editor with what the user typed in it. Kept by session while the page lives, so leaving the tab or
// the window loses nothing. A save carries the version it was read at; the server refuses it when the session changed
// the file meanwhile, and the user then picks their text or the disk's (server/files.ts).
import { create } from 'zustand';
import { type FileAction, type FileEntry, PREVIEW_TYPES, type ServerMessage, type SessionFile } from '../../shared/protocol.ts';
import { useSessions } from './sessions.ts';

export interface OpenFile extends SessionFile {
  /** what the user typed, while it differs from the file's text */
  draft: string | null;
  /** the file as it is on the disk, when a save found it changed since it was read */
  conflict: SessionFile | null;
  /** counts the times the text under the editor was replaced (read again, the disk's taken): the editor starts over */
  loaded: number;
  saving: boolean;
  /** asked for, not read yet */
  loading: boolean;
}

export interface Explorer {
  /** the folders listed, by path from the session's folder ('' : the folder itself) */
  folders: Record<string, FileEntry[]>;
  expanded: string[];
  /** null: none open */
  file: OpenFile | null;
}

/** A line of the tree as shown: a folder or a file at some depth under the session's folder. */
export interface TreeRow { path: string; name: string; folder: boolean; depth: number }

export const EMPTY_EXPLORER: Explorer = { folders: {}, expanded: [], file: null };

export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
/** `path` is `folder` or inside it. */
export const isUnder = (path: string, folder: string) => !folder || path === folder || path.startsWith(`${folder}/`);

/** The lines of the tree, the unfolded folders' contents under them, as far as they were listed. */
export function treeRows(explorer: Explorer): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (folder: string, depth: number) => {
    for (const entry of explorer.folders[folder] ?? []) {
      const path = joinPath(folder, entry.name);
      rows.push({ path, name: entry.name, folder: entry.folder, depth });
      if (entry.folder && explorer.expanded.includes(path)) walk(path, depth + 1);
    }
  };
  walk('', 0);
  return rows;
}

export type FileKind = 'code' | 'markup' | 'data' | 'table' | 'text' | 'config' | 'lock' | 'image' | 'video' | 'audio' | 'archive' | 'other';

const KINDS: Record<string, FileKind> = {};
const kinds: [FileKind, string][] = [
  ['code', 'ts tsx js jsx mjs cjs py rb go rs swift kt java c h cpp hpp cs php sh zsh bash fish lua dart scala sql vue svelte astro'],
  ['markup', 'html htm css scss sass less xml svg'],
  ['data', 'json jsonc json5 yaml yml toml ini plist graphql gql proto'],
  ['table', 'csv tsv xls xlsx numbers'],
  ['text', 'md mdx markdown txt log rst'],
  ['image', 'png jpg jpeg gif webp avif ico bmp heic tiff psd'],
  ['video', 'mp4 mov webm m4v mkv avi'],
  ['audio', 'mp3 wav m4a aac flac ogg'],
  ['archive', 'zip tar gz tgz bz2 xz 7z rar dmg'],
  ['lock', 'lock lockb'],
];
for (const [kind, extensions] of kinds) for (const extension of extensions.split(' ')) KINDS[extension] = kind;

/** What a file is, from its name, for its icon: a dotfile or a "*.config.*" is configuration. */
/** How the explorer previews a file instead of (or beside, an SVG) its text, from its name; null: it does not. */
export type Preview = 'image' | 'pdf' | 'video' | 'audio';
export function previewOf(name: string): Preview | null {
  const type = PREVIEW_TYPES[name.split('.').pop()?.toLowerCase() ?? ''];
  if (!type) return null;
  return type === 'application/pdf' ? 'pdf' : (type.split('/')[0] as Preview);
}

/** Where the page gets a file of a session's folder to preview it (http.ts, /files/); `loaded` asks it again once changed. */
export const previewUrl = (sessionId: string, path: string, loaded: number) => `/files/${encodeURIComponent(sessionId)}/${path.split('/').map(encodeURIComponent).join('/')}?v=${loaded}`;

export function fileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('-lock.json') || lower.endsWith('-lock.yaml')) return 'lock';
  if (lower.startsWith('.') || /\.config\.[a-z]+$/.test(lower) || lower === 'dockerfile' || lower === 'makefile') return 'config';
  return KINDS[lower.split('.').pop() ?? ''] ?? 'other';
}

/** A path moved or gone: what pointed at it or inside it follows (`to`) or is dropped (null). */
export function movePaths(paths: readonly string[], from: string, to: string | null): string[] {
  return paths.flatMap((path) => (!isUnder(path, from) ? [path] : to === null ? [] : [to + path.slice(from.length)]));
}

/** What a 'file' message makes of the open file. */
export function fileAfter(open: OpenFile | null, file: SessionFile, outcome: 'read' | 'saved' | 'conflict'): OpenFile | null {
  if (!open || open.path !== file.path) return open;
  if (outcome === 'conflict') return { ...open, saving: false, conflict: file };
  if (outcome === 'saved') {
    // typed on while it saved: what came after stays a draft
    const draft = open.draft !== null && open.draft !== file.text ? open.draft : null;
    return { ...open, ...file, draft, conflict: null, saving: false };
  }
  // read again after a turn: the user's draft wins until they save
  if (!open.loading && (open.draft !== null || (open.text === file.text && open.unreadable === file.unreadable && open.size === file.size))) return open;
  return { ...file, draft: null, conflict: null, loaded: open.loaded + 1, saving: false, loading: false };
}

interface FilesState {
  explorers: Record<string, Explorer>;
  receive: (message: Extract<ServerMessage, { t: 'folder' | 'file' }>) => void;
  toggle: (sessionId: string, folder: string) => void;
  /** unfolds a folder and those around it, to show it in the tree */
  reveal: (sessionId: string, folder: string) => void;
  open: (sessionId: string, path: string) => void;
  close: (sessionId: string) => void;
  edit: (sessionId: string, text: string) => void;
  save: (sessionId: string) => void;
  /** after a refused save: the user's text over the disk's, or the disk's in place of theirs */
  settle: (sessionId: string, keep: 'mine' | 'disk') => void;
  act: (sessionId: string, action: FileAction) => void;
  /** lists the shown folders again and reads the open file again (a turn ended, the user asked) */
  refresh: (sessionId: string) => void;
}

const send = (...args: Parameters<ReturnType<typeof useSessions.getState>['send']>) => useSessions.getState().send(...args);

export const useFiles = create<FilesState>((set, get) => {
  const explorer = (sessionId: string) => get().explorers[sessionId] ?? EMPTY_EXPLORER;
  const change = (sessionId: string, update: (explorer: Explorer) => Explorer) => set({ explorers: { ...get().explorers, [sessionId]: update(explorer(sessionId)) } });
  /** a file shown as being read, until the server sends it */
  const waitFor = (sessionId: string, path: string) => change(sessionId, (each) => ({ ...each, file: { path, text: null, version: '', draft: null, conflict: null, loaded: (each.file?.loaded ?? 0) + 1, saving: false, loading: true } }));
  return {
    explorers: {},

    receive: (message) => {
      if (message.t === 'folder') {
        const { folder, entries } = message;
        change(message.sessionId, (each) => {
          if (entries) return { ...each, folders: { ...each.folders, [folder]: entries } };
          // gone: it and what was under it are forgotten
          const folders = Object.fromEntries(Object.entries(each.folders).filter(([path]) => !isUnder(path, folder)));
          return { ...each, folders, expanded: movePaths(each.expanded, folder, null) };
        });
        return;
      }
      change(message.sessionId, (each) => ({ ...each, file: fileAfter(each.file, message.file, message.outcome) }));
    },

    toggle: (sessionId, folder) => {
      const shown = explorer(sessionId).expanded.includes(folder);
      change(sessionId, (each) => ({ ...each, expanded: shown ? each.expanded.filter((path) => path !== folder) : [...each.expanded, folder] }));
      if (!shown) send({ t: 'listFolder', sessionId, folder });
    },

    reveal: (sessionId, folder) => {
      const names = folder.split('/');
      for (let depth = 1; depth <= names.length; depth++) {
        const path = names.slice(0, depth).join('/');
        if (!explorer(sessionId).expanded.includes(path)) get().toggle(sessionId, path);
      }
    },

    open: (sessionId, path) => {
      if (explorer(sessionId).file?.path === path) return;
      waitFor(sessionId, path);
      send({ t: 'readFile', sessionId, path });
    },

    close: (sessionId) => change(sessionId, (each) => ({ ...each, file: null })),

    edit: (sessionId, text) => change(sessionId, (each) => (each.file ? { ...each, file: { ...each.file, draft: text === each.file.text ? null : text } } : each)),

    save: (sessionId) => {
      const file = explorer(sessionId).file;
      if (!file || file.draft === null || file.saving || file.conflict) return;
      if (!send({ t: 'writeFile', sessionId, path: file.path, text: file.draft, version: file.version })) return;
      change(sessionId, (each) => (each.file ? { ...each, file: { ...each.file, saving: true } } : each));
    },

    settle: (sessionId, keep) => {
      const file = explorer(sessionId).file;
      if (!file?.conflict) return;
      if (keep === 'disk') {
        change(sessionId, (each) => (each.file?.conflict ? { ...each, file: { ...each.file.conflict, draft: null, conflict: null, loaded: each.file.loaded + 1, saving: false, loading: false } } : each));
        return;
      }
      // the disk's version is the one the save now starts from
      const text = file.draft ?? file.text ?? '';
      if (!send({ t: 'writeFile', sessionId, path: file.path, text, version: file.conflict.version })) return;
      change(sessionId, (each) => (each.file ? { ...each, file: { ...each.file, draft: text, version: file.conflict?.version ?? '', conflict: null, saving: true } } : each));
    },

    act: (sessionId, action) => {
      if (!send({ t: 'fileAction', sessionId, action })) return;
      if ('folder' in action) {
        const folder = action.folder;
        // made in a folded folder: it unfolds, so the new line is in sight
        if (folder && !explorer(sessionId).expanded.includes(folder)) get().toggle(sessionId, folder);
        // the server sends it once made
        if (action.kind === 'newFile') waitFor(sessionId, joinPath(folder, action.name));
        return;
      }
      const from = action.path;
      const to = action.kind === 'rename' ? joinPath(parentOf(from), action.name) : null;
      change(sessionId, (each) => {
        const file = each.file && isUnder(each.file.path, from) ? (to === null ? null : { ...each.file, path: to + each.file.path.slice(from.length) }) : each.file;
        // a folder renamed folds up: listing it under its new name could reach the server before the renaming
        return { ...each, expanded: movePaths(each.expanded, from, null), file };
      });
    },

    refresh: (sessionId) => {
      const each = explorer(sessionId);
      for (const folder of ['', ...each.expanded]) send({ t: 'listFolder', sessionId, folder });
      if (each.file && each.file.draft === null && !each.file.loading) send({ t: 'readFile', sessionId, path: each.file.path });
    },
  };
});
