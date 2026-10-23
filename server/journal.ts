// The whiteboard's notes (the room's "Tableau"): the Markdown files directly inside the journal folder of the settings,
// which Claude sessions write to as well. Only plain names (shared/journal.ts) are read or written, compared on real
// paths: a symlink or a sub-folder never leads outside the folder. A save carries the version of the note it was made
// from, and is refused (with the note as it is now) when the file changed since, so a session's write is never lost.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { copyFile, link, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findInNote, MAX_NOTE, NOTE_NAME } from '../shared/journal.ts';
import type { Note, NoteFile, NoteMatch } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { resolveInside } from './paths.ts';
import { recycleFile } from './recycle.ts';

export const versionOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The notes of the folder, by name; none when it does not exist yet. Links and sub-folders are left out. */
export async function listNotes(folder: string): Promise<NoteFile[]> {
  let names: string[];
  try {
    names = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile() && NOTE_NAME.test(entry.name)).map((entry) => entry.name);
  } catch {
    return [];
  }
  const files = await Promise.all(names.map(async (name) => {
    try { return { name, mtime: Math.round((await stat(path.join(folder, name))).mtimeMs) }; } catch { return null; }
  }));
  return files.filter((file) => file !== null).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Where a note is, as a real path inside the real folder: an existing file, or a name nothing stands at yet (a new
 * note). Null for a bad name, a missing folder, or anything else (a link leading out or nowhere, a folder).
 */
export function locateNote(folder: string, name: string): { file: string; exists: boolean } | null {
  if (!NOTE_NAME.test(name)) return null;
  let realFolder: string;
  try { realFolder = realpathSync(folder); } catch { return null; }
  const inside = resolveInside(realFolder, name);
  if (inside) return statSync(inside).isFile() ? { file: inside, exists: true } : null;
  try {
    lstatSync(path.join(realFolder, name));
    return null;
  } catch {
    return { file: path.join(realFolder, name), exists: false };
  }
}

async function readAt(file: string, name: string): Promise<Note> {
  const info = await stat(file);
  if (info.size > MAX_NOTE) throw new Error(st.journal.tooBig);
  const text = await readFile(file, 'utf8');
  return { name, text, version: versionOf(text), mtime: Math.round(info.mtimeMs) };
}

export async function readNote(folder: string, name: string): Promise<Note> {
  const found = locateNote(folder, name);
  if (!found?.exists) throw new Error(st.journal.missing(name));
  return readAt(found.file, name);
}

/**
 * Saves a note made from `version` (null: a new note), creating the folder if needed. Not saved when the file changed
 * since (or, for a new note, already exists): the note as it is now comes back instead. A note deleted meanwhile is
 * written again, so the user's text is not lost.
 */
export async function writeNote(folder: string, name: string, text: string, version: string | null): Promise<{ saved: boolean; note: Note }> {
  if (Buffer.byteLength(text) > MAX_NOTE) throw new Error(st.journal.tooBig);
  await mkdir(folder, { recursive: true });
  const found = locateNote(folder, name);
  if (!found) throw new Error(st.journal.badName(name));
  if (found.exists) {
    const current = await readAt(found.file, name);
    if (current.version !== version) return { saved: false, note: current };
  }
  // "wx": a note created by someone else in between is not overwritten (the write fails instead)
  await writeFile(found.file, text, { flag: found.exists ? 'w' : 'wx' });
  // the version of what was written, not re-read: a session writing right after must still be caught by the next save
  return { saved: true, note: { name, text, version: versionOf(text), mtime: Math.round((await stat(found.file)).mtimeMs) } };
}

/** Renames a note's file. A hard link then an unlink, so a note created under the new name meanwhile is never replaced. */
export async function renameNote(folder: string, name: string, newName: string): Promise<void> {
  const from = locateNote(folder, name);
  if (!from?.exists) throw new Error(st.journal.missing(name));
  const to = locateNote(folder, newName);
  if (!to) throw new Error(st.journal.badName(newName));
  if (to.exists) throw new Error(st.journal.taken(newName));
  try {
    await link(from.file, to.file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(st.journal.taken(newName));
    throw error;
  }
  await unlink(from.file);
}

/** Uses the Windows Recycle Bin, or the Mac's Trash. An explicit folder is also used by tests. */
export async function deleteNote(folder: string, name: string, trash?: string): Promise<void> {
  const found = locateNote(folder, name);
  if (!found?.exists) throw new Error(st.journal.missing(name));
  if (trash === undefined && process.platform === 'win32') { await recycleFile(found.file); return; }
  trash ??= path.join(os.homedir(), '.Trash');
  if (!existsSync(trash)) { await unlink(found.file); return; }
  let target = path.join(trash, name);
  for (let copy = 2; existsSync(target); copy++) target = path.join(trash, name.replace(/\.md$/, ` ${copy}.md`));
  try {
    await rename(found.file, target);
  } catch (error) {
    // the Trash on another disk than the folder: copied there, then removed here
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await copyFile(found.file, target);
    await unlink(found.file);
  }
}

const MAX_MATCHES = 50;
const EXCERPT_LENGTH = 120;

/**
 * The notes whose name or text holds `query`, case and accents aside, those with the most hits first. The excerpt is the
 * first line holding it, cut around it when long.
 */
export async function searchNotes(folder: string, query: string): Promise<NoteMatch[]> {
  if (!query.trim()) return [];
  const matches: NoteMatch[] = [];
  for (const { name } of await listNotes(folder)) {
    let text = '';
    try { text = (await readNote(folder, name)).text; } catch { /* gone or too big: searched by its name only */ }
    const found = findInNote(text, query);
    if (!found.length && !findInNote(name.replace(/\.md$/, ''), query).length) continue;
    matches.push({ name, count: found.length, excerpt: found[0] ? excerptAt(text, found[0][0]) : '' });
  }
  return matches.sort((a, b) => b.count - a.count).slice(0, MAX_MATCHES);
}

function excerptAt(text: string, at: number): string {
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const end = text.indexOf('\n', at);
  const line = text.slice(start, end === -1 ? text.length : end);
  const from = line.length <= EXCERPT_LENGTH ? 0 : Math.max(0, Math.min(at - start - EXCERPT_LENGTH / 3, line.length - EXCERPT_LENGTH));
  const shown = line.slice(from, from + EXCERPT_LENGTH);
  // a line's Markdown marks ("- ", "## ") are left out
  return `${from > 0 ? '…' : ''}${(from > 0 ? shown : shown.replace(/^[\s#>*-]+/, '')).trim()}${from + EXCERPT_LENGTH < line.length ? '…' : ''}`;
}
