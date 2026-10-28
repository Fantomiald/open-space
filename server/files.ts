// The file explorer of a session's window: its folder listed, its files read and written, files and folders made,
// renamed and put in the Trash. Every path comes from the page as a path from the session's folder ("/" between
// names) and is resolved there on real paths (paths.ts): a symlink never leads outside it, and the folder itself is
// never renamed or deleted. A save carries the version it was made from, as a note does (journal.ts), so a file the
// session changed meanwhile is not overwritten without the user knowing.
import { execFile } from 'node:child_process';
import { lstatSync, statSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type FileAction, type FileEntry, MAX_SESSION_FILE, type SessionFile } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { versionOf } from './journal.ts';
import { isWithin, resolveInside } from './paths.ts';
import { moveToTrash } from './trash.ts';

/** Never listed: git's own folder and the Finder's leftovers. */
const HIDDEN = new Set(['.git', '.DS_Store']);
const MAX_ENTRIES = 3000;

/** A name a file or a folder can be given: no separator, not "." or "..". */
export const isEntryName = (name: string) => name.length > 0 && name.length <= 255 && !/[/\\\0]/.test(name) && name !== '.' && name !== '..' && name.trim() === name;

const parts = (relative: string) => relative.split('/').filter(Boolean);
const asRelative = (root: string, real: string) => path.relative(root, real).split(path.sep).join('/');

/** The real path of a folder inside `root`, or null. */
function folderAt(root: string, relative: string): string | null {
  const real = resolveInside(root, path.join(...parts(relative), '.'));
  try { return real && statSync(real).isDirectory() ? real : null; } catch { return null; }
}

/** An entry itself (a link, not where it leads), inside `root` and not `root`: what is renamed or deleted. */
function entryAt(root: string, relative: string): string | null {
  const names = parts(relative);
  const name = names.pop();
  if (!name || !isEntryName(name)) return null;
  const parent = folderAt(root, names.join('/'));
  if (!parent) return null;
  try { lstatSync(path.join(parent, name)); } catch { return null; }
  return path.join(parent, name);
}

/** The folders then the files of a folder, by name as a person sorts them; null when it is not there. */
export async function listFolder(root: string, relative: string): Promise<FileEntry[] | null> {
  const folder = folderAt(root, relative);
  if (!folder) return null;
  const found = await readdir(folder, { withFileTypes: true }).catch(() => null);
  if (!found) return null;
  const entries: FileEntry[] = [];
  for (const entry of found.slice(0, MAX_ENTRIES)) {
    if (HIDDEN.has(entry.name)) continue;
    if (!entry.isSymbolicLink()) { entries.push({ name: entry.name, folder: entry.isDirectory() }); continue; }
    // a link counts as what it leads to, and is left out when that is outside the session's folder or nowhere
    const real = resolveInside(root, path.join(folder, entry.name));
    if (!real) continue;
    try { entries.push({ name: entry.name, folder: statSync(real).isDirectory() }); } catch { /* gone meanwhile */ }
  }
  return entries.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

async function readAt(file: string, relative: string): Promise<SessionFile> {
  const info = await stat(file);
  if (info.size > MAX_SESSION_FILE) return { path: relative, text: null, unreadable: 'tooBig', version: '', size: info.size };
  const content = await readFile(file);
  if (content.includes(0)) return { path: relative, text: null, unreadable: 'binary', version: '', size: info.size };
  const text = content.toString('utf8');
  return { path: relative, text, version: versionOf(text) };
}

/** The real path of a file inside `root`, or null: what the explorer reads, previews (http.ts) and shows in the Finder. */
export const fileAt = (root: string, relative: string) => {
  const real = resolveInside(root, path.join(...parts(relative)));
  try { return real && real !== root && statSync(real).isFile() ? real : null; } catch { return null; }
};

/** A file as the editor shows it; one gone (or that is no file) comes back `missing`. */
export async function readSessionFile(root: string, relative: string): Promise<SessionFile> {
  const file = fileAt(root, relative);
  return file ? readAt(file, relative) : { path: relative, text: null, unreadable: 'missing', version: '' };
}

/**
 * Saves a file made from `version`. Not saved when it changed since: the file as it is now comes back instead. A file
 * deleted meanwhile is written again where it was, so the user's text is not lost.
 */
export async function writeSessionFile(root: string, relative: string, text: string, version: string): Promise<{ saved: boolean; file: SessionFile }> {
  if (Buffer.byteLength(text) > MAX_SESSION_FILE) throw new Error(st.files.tooBig);
  const file = fileAt(root, relative);
  if (file) {
    const current = await readAt(file, relative);
    if (current.version !== version) return { saved: false, file: current };
    await writeFile(file, text);
  } else {
    const names = parts(relative);
    const name = names.pop();
    const parent = folderAt(root, names.join('/'));
    if (!name || !isEntryName(name) || !parent) throw new Error(st.files.missing(relative));
    // "wx": something made there meanwhile (a folder, a link) is never replaced
    await writeFile(path.join(parent, name), text, { flag: 'wx' });
  }
  return { saved: true, file: { path: relative, text, version: versionOf(text) } };
}

/** Shows a file in the Finder, the Explorer on Windows, or opens its folder elsewhere. */
export function revealFile(root: string, relative: string) {
  const file = fileAt(root, relative);
  if (!file) throw new Error(st.files.missing(relative));
  if (process.platform === 'darwin') execFile('open', ['-R', file]);
  else if (process.platform === 'win32') execFile('explorer.exe', [`/select,${file}`]);
  else execFile('xdg-open', [path.dirname(file)]);
}

/** Makes, renames or deletes a file or a folder; returns the folders whose list changed. A new file is opened by the page: see index.ts. */
export async function changeFiles(root: string, action: FileAction, trash?: string): Promise<string[]> {
  const parentOf = (relative: string) => parts(relative).slice(0, -1).join('/');
  switch (action.kind) {
    case 'newFile':
    case 'newFolder': {
      const folder = folderAt(root, action.folder);
      if (!folder) throw new Error(st.files.missing(action.folder));
      if (!isEntryName(action.name)) throw new Error(st.files.badName(action.name));
      const target = path.join(folder, action.name);
      if (await lstat(target).then(() => true, () => false)) throw new Error(st.files.taken(action.name));
      if (action.kind === 'newFolder') await mkdir(target);
      else await writeFile(target, '', { flag: 'wx' });
      return [asRelative(root, folder)];
    }
    case 'rename': {
      const source = entryAt(root, action.path);
      if (!source) throw new Error(st.files.missing(action.path));
      if (!isEntryName(action.name)) throw new Error(st.files.badName(action.name));
      const target = path.join(path.dirname(source), action.name);
      // only a change of case may land on what is there (the same entry on a Mac's disk)
      if (target.toLowerCase() !== source.toLowerCase() && await lstat(target).then(() => true, () => false)) throw new Error(st.files.taken(action.name));
      await rename(source, target);
      return [parentOf(action.path)];
    }
    case 'delete': {
      const target = entryAt(root, action.path);
      if (!target || !isWithin(root, path.dirname(target))) throw new Error(st.files.missing(action.path));
      await moveToTrash(target, (await lstat(target)).isDirectory(), trash);
      return [parentOf(action.path)];
    }
  }
}
