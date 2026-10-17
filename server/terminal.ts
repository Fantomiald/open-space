// A terminal window on the user's computer, opened from the room (a click on the user's own screen). macOS only:
// iTerm when it is installed, Terminal otherwise, in the folder given (`open -a` opens a window there).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { st } from './i18n/index.ts';

const ITERM = ['/Applications/iTerm.app', path.join(os.homedir(), 'Applications', 'iTerm.app')];

export function openTerminal(folder: string): Promise<void> {
  if (process.platform !== 'darwin') return Promise.reject(new Error(st.terminal.macOnly));
  const application = ITERM.find((candidate) => existsSync(candidate)) ?? 'Terminal';
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/open', ['-a', application, folder], { timeout: 10_000 }, (error) => (error ? reject(new Error(st.terminal.failed)) : resolve()));
  });
}
