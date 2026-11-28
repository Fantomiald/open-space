// A project's pictures in the sessions' panel (shared/project-icons.ts). The automatic one, when the user chose none: its
// favicon or logo, looked for at a few fixed places of its folder only. Read-only, in realpath (a link that leads out is
// ignored), small files only. And the pictures the user picked: stored in OFFICE_DIR/project-icons, named by their
// content (the preferences only name them), kept while an icon shows them. Both served to a paired browser under
// /project-icon (http.ts).
import { statSync, utimesSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ICON_IMAGE_ID, MAX_ICON_IMAGE, pictureIdsOf, type ProjectIcon } from '../shared/project-icons.ts';
import { storeOnce } from './attachments.ts';
import { resolveInside } from './paths.ts';

/** Where a project keeps its picture, most telling first (Vite and Next keep theirs in public/ or app/). */
const PLACES = ['favicon.svg', 'favicon.png', 'favicon.ico', 'icon.svg', 'icon.png', 'logo.svg', 'logo.png'] as const;
const FOLDERS = ['', 'public', 'static', 'assets', 'app', 'src', 'src/app', 'src/assets', 'resources'] as const;
/** a favicon anywhere before a logo anywhere */
const CANDIDATES = PLACES.flatMap((name) => FOLDERS.map((folder) => (folder ? `${folder}/${name}` : name)));

/** The largest picture served: a favicon or a logo, not a photo. */
export const MAX_PROJECT_PICTURE = 512 * 1024;

/** The real path of the first picture found in `folder` (itself a real, allowed folder), else null. */
export function findProjectPicture(folder: string): string | null {
  for (const candidate of CANDIDATES) {
    const file = resolveInside(folder, candidate);
    if (!file || path.extname(file).toLowerCase() !== path.extname(candidate)) continue;
    try {
      const stats = statSync(file);
      if (stats.isFile() && stats.size > 0 && stats.size <= MAX_PROJECT_PICTURE) return file;
    } catch { /* gone meanwhile */ }
  }
  return null;
}

export const projectIconsFolder = (dataDir: string) => path.join(dataDir, 'project-icons');

/** The type of a picture by its first bytes, as its extension: PNG, JPEG or WebP only (never an SVG, which may run code). */
function pictureType(bytes: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Keeps a picture the user picked for a project (once: the same picture twice is the same file); its id, or null when it is no PNG, JPEG or WebP, or too heavy. */
export function saveProjectPicture(folder: string, bytes: Buffer): string | null {
  const type = bytes.length <= MAX_ICON_IMAGE ? pictureType(bytes) : null;
  if (!type) return null;
  const id = storeOnce(folder, bytes, type);
  // picked again: its grace starts over (sweepProjectPictures)
  const now = new Date();
  utimesSync(path.join(folder, id), now, now);
  return id;
}

/** Where a stored picture is, or null when the id is not one or the file is gone. */
export function storedProjectPicture(folder: string, id: string): string | null {
  const file = ICON_IMAGE_ID.test(id) ? resolveInside(folder, id) : null;
  try { return file && statSync(file).isFile() ? file : null; } catch { return null; }
}

/** A picture this recent is kept though no icon shows it: it may be waiting in the dialog for Save. */
export const PICTURE_GRACE_MS = 60 * 60 * 1000;

/** Removes the stored pictures no icon shows any more; returns how many went. */
export async function sweepProjectPictures(folder: string, icons: Readonly<Record<string, ProjectIcon>> | undefined, now = Date.now()): Promise<number> {
  const shown = new Set(pictureIdsOf(icons));
  let removed = 0;
  for (const name of await readdir(folder).catch(() => [] as string[])) {
    if (!ICON_IMAGE_ID.test(name) || shown.has(name)) continue;
    const file = path.join(folder, name);
    if (now - (await stat(file)).mtimeMs < PICTURE_GRACE_MS) continue;
    await rm(file, { force: true });
    removed++;
  }
  return removed;
}
