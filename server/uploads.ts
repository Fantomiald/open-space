// Files of any kind the user sends with a message (a zip, a PDF, a CSV…). Like Claude Code in the terminal, where a
// dropped file becomes its path in the message, Claude gets the file's path and opens it with its own tools: the page
// cannot give a path of the user's disk, so the file is first uploaded (POST /upload, http.ts) and kept here, in
// OFFICE_DIR/uploads/<the start of its SHA-256>/<its own name>, a folder every session may read (--add-dir).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { namedInLogs } from './attachments.ts';

/** A file the user sends, up to this size. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
/** Files per message. */
export const MAX_FILES = 10;
/** How a message names an uploaded file: its folder (16 hexadecimal digits of its SHA-256), then its name. */
export const UPLOAD_ID = /^[0-9a-f]{16}\/[^/\\\0]{1,200}$/;

export const uploadsFolder = (dataDir: string) => path.join(dataDir, 'uploads');

/** The file's own name, made safe as one path segment (no folders, no control characters, no leading dots). */
export function uploadName(raw: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed
  const clean = path.basename(raw.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim().slice(0, 200);
  return clean || 'file';
}

/** Keeps a file the user sent (once: the same file twice is the same copy) and returns its id. */
export function saveUpload(folder: string, rawName: string, bytes: Buffer): string {
  const id = `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}/${uploadName(rawName)}`;
  const file = path.join(folder, id);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, bytes, { mode: 0o600 });
  } else {
    // sent again: its grace starts over (sweepUploads)
    const now = new Date();
    utimesSync(path.dirname(file), now, now);
  }
  return id;
}

/** Where an uploaded file is, or null when the id is not one or the file is gone. */
export function uploadPath(folder: string, id: string): string | null {
  if (!UPLOAD_ID.test(id) || id.split('/')[1] === '..') return null;
  const file = path.join(folder, id);
  try { return statSync(file).isFile() ? file : null; } catch { return null; }
}

/** An upload this recent is kept even when no log names it: it may still be waiting in a field, or in a queue. */
export const UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

/** Removes the uploaded files no session log names any more (see sweepAttachments); returns how many folders went. */
export async function sweepUploads(folder: string, logsDir: string, now = Date.now()): Promise<number> {
  const stored = (await readdir(folder).catch(() => [] as string[])).filter((name) => /^[0-9a-f]{16}$/.test(name));
  if (!stored.length) return 0;
  const named = await namedInLogs(logsDir, /[0-9a-f]{16}(?=\/)/g);
  let removed = 0;
  for (const name of stored.filter((candidate) => !named.has(candidate))) {
    const directory = path.join(folder, name);
    if (now - (await stat(directory)).mtimeMs < UPLOAD_GRACE_MS) continue;
    await rm(directory, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
