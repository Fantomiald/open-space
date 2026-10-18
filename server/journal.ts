// The whiteboard's notes (the room's "Tableau"): the Markdown files directly inside the journal folder of the settings,
// which Claude sessions write to as well. Only plain names (shared/journal.ts) are read or written, compared on real
// paths: a symlink or a sub-folder never leads outside the folder. A save carries the version of the note it was made
// from, and is refused (with the note as it is now) when the file changed since, so a session's write is never lost.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_NOTE, NOTE_NAME } from '../shared/journal.ts';
import type { Note, NoteFile } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { resolveInside } from './paths.ts';

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
