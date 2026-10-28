import { existsSync } from 'node:fs';
import { cp, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { recycle } from './windows.ts';

/** "name.ext", "name 2.ext", "name 3.ext"…: the first name nothing stands at in `folder`. */
function freeName(folder: string, name: string): string {
  const extension = path.extname(name);
  const stem = extension && extension !== name ? name.slice(0, -extension.length) : name;
  let target = path.join(folder, name);
  for (let copy = 2; existsSync(target); copy++) target = path.join(folder, `${stem} ${copy}${extension}`);
  return target;
}

/**
 * Puts a file or a folder in the user's Trash (macOS) under a free name, or in the Recycle Bin (Windows); deletes it
 * where there is neither. `trash`, given by the tests, is the Trash folder, on every platform.
 */
export async function moveToTrash(target: string, folder: boolean, trash?: string): Promise<void> {
  if (trash === undefined && process.platform === 'win32') { await recycle(target, folder); return; }
  trash ??= path.join(os.homedir(), '.Trash');
  if (!existsSync(trash)) { await rm(target, { recursive: folder }); return; }
  const destination = freeName(trash, path.basename(target));
  try {
    await rename(target, destination);
  } catch (error) {
    // the Trash on another disk: copied there, then removed here
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await cp(target, destination, { recursive: true, verbatimSymlinks: true });
    await rm(target, { recursive: true });
  }
}
