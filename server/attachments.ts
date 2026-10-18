// Images the user sends with a message (pasted or dropped screenshots), and the files a session's Claude sends the user
// (its SendUserFile tool): stored once in OFFICE_DIR/attachments, named by their content, so the thread can show them
// again even once the original changed. Served under /attachments/ to paired browsers only (http.ts).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ImageType, ImageUpload } from '../shared/protocol.ts';

export const IMAGE_EXTENSIONS: Readonly<Record<ImageType, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
/** A stored file's name: its SHA-256 and its extension (a file without one gets "bin"). */
export const ATTACHMENT_NAME = /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/;
/** Shown in the page as pictures (an SVG under a sandbox, see http.ts); anything else but a page is only offered for download. */
export const SHOWN_EXTENSIONS: ReadonlySet<string> = new Set([...Object.values(IMAGE_EXTENSIONS), 'svg']);
/** A file a session sends is kept up to this size (a video is often tens of MB); a bigger one is only named in the thread. */
const MAX_SENT_BYTES = 200 * 1024 * 1024;
/** Played in the page, from the thread (anything the browser cannot play is still offered for download). */
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(['mp4', 'm4v', 'webm', 'mov']);

export const attachmentsFolder = (dataDir: string) => path.join(dataDir, 'attachments');

/** Writes an image (once: the same picture sent twice is the same file) and returns its name. */
export function saveAttachment(folder: string, image: ImageUpload): string {
  const bytes = Buffer.from(image.data, 'base64');
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${IMAGE_EXTENSIONS[image.mediaType]}`;
  const file = path.join(folder, name);
  if (!existsSync(file)) {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    writeFileSync(file, bytes, { mode: 0o600 });
  }
  return name;
}

/** Keeps a copy of a file a session sent; returns its stored name, or null when it cannot be read or is too big. */
export function copyAttachment(folder: string, source: string): string | null {
  try {
    if (!statSync(source).isFile() || statSync(source).size > MAX_SENT_BYTES) return null;
    const bytes = readFileSync(source);
    const extension = path.extname(source).slice(1).toLowerCase();
    const name = `${createHash('sha256').update(bytes).digest('hex')}.${/^[a-z0-9]{1,8}$/.test(extension) ? (extension === 'jpeg' ? 'jpg' : extension === 'htm' ? 'html' : extension) : 'bin'}`;
    const file = path.join(folder, name);
    if (!existsSync(file)) {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      writeFileSync(file, bytes, { mode: 0o600 });
    }
    return name;
  } catch {
    return null;
  }
}

/** A file stored this recently is kept even when no log names it yet: its message may be on its way. */
export const SWEEP_GRACE_MS = 60 * 60 * 1000;

/**
 * Everything the session logs hold that matches `pattern` (global). The logs are read as text: a stored name is
 * distinctive enough to be found wherever an event holds it.
 */
export async function namedInLogs(logsDir: string, pattern: RegExp): Promise<Set<string>> {
  const named = new Set<string>();
  for (const log of (await readdir(logsDir)).filter((name) => name.endsWith('.jsonl'))) {
    for (const [name] of (await readFile(path.join(logsDir, log), 'utf8')).matchAll(pattern)) named.add(name);
  }
  return named;
}

/** Removes the stored files no session log names any more (their sessions were forgotten); returns how many. */
export async function sweepAttachments(folder: string, logsDir: string, now = Date.now()): Promise<number> {
  const stored = (await readdir(folder).catch(() => [] as string[])).filter((name) => ATTACHMENT_NAME.test(name));
  if (!stored.length) return 0;
  const named = await namedInLogs(logsDir, /[0-9a-f]{64}\.[a-z0-9]{1,8}/g);
  let removed = 0;
  for (const name of stored.filter((candidate) => !named.has(candidate))) {
    const file = path.join(folder, name);
    if (now - (await stat(file)).mtimeMs < SWEEP_GRACE_MS) continue;
    await rm(file, { force: true });
    removed++;
  }
  return removed;
}
