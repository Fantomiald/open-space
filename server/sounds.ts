// The error sound: macOS's own "Basso", converted once to WAV (browsers do not all read AIFF) into OFFICE_DIR. It is
// taken from the user's system, so no Apple sound ships with the project. Elsewhere there is no file, and the page
// plays a sound of its own instead.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASSO = '/System/Library/Sounds/Basso.aiff';

/** The folder served under /sounds/. */
export const soundsFolder = (dataDir: string) => path.join(dataDir, 'sounds');

export function prepareSounds(dataDir: string, log: (message: string, error?: unknown) => void) {
  const target = path.join(soundsFolder(dataDir), 'error.wav');
  if (process.platform !== 'darwin' || !existsSync(BASSO) || existsSync(target)) return;
  mkdirSync(soundsFolder(dataDir), { recursive: true, mode: 0o700 });
  execFile('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', BASSO, target], { timeout: 15000 }, (error) => {
    if (error) log('could not convert the error sound', error);
  });
}
