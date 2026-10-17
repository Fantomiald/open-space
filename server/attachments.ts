// Images the user sends with a message (pasted or dropped screenshots): stored once in OFFICE_DIR/attachments, named
// by their content, so the thread can show them again. Served under /attachments/ to paired browsers only (http.ts).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageType, ImageUpload } from '../shared/protocol.ts';

export const IMAGE_EXTENSIONS: Readonly<Record<ImageType, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
/** A stored image's name: its SHA-256 and its extension. */
export const ATTACHMENT_NAME = /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/;

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
