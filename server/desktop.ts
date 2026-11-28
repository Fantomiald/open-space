// What Open Space opens on the user's computer: a terminal window, from the room (a click on the user's own screen),
// a web page, in the default browser (an MCP server's sign-in), and a folder or a file in the Finder, the Explorer or
// the file manager. Always a fixed program with its arguments, never through a shell.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { st } from './i18n/index.ts';
import type { TerminalChoice, TerminalKind } from '../shared/terminal.ts';

const ITERM = ['/Applications/iTerm.app', path.join(os.homedir(), 'Applications', 'iTerm.app')];

// A detached cmd.exe with ignored stdio exits immediately when started by Electron's console-less utility process.
// Hide only the PowerShell launcher; Start-Process explicitly opens an independent, visible console window.
// Paths travel through the environment, never through shell source; quote the Git Bash argument for Windows argv.
const OPEN_WINDOWS_TERMINAL = "$ErrorActionPreference = 'Stop'; $terminalArgs = switch ($env:OPEN_SPACE_TERMINAL_KIND) { 'cmd' { @('/d', '/k') } 'powershell' { @('-NoLogo', '-NoExit') } 'git-bash' { @('--cd=\"' + $env:OPEN_SPACE_TERMINAL_FOLDER.Replace([char]92, [char]47) + '\"') } }; Start-Process -FilePath $env:OPEN_SPACE_TERMINAL_EXE -ArgumentList $terminalArgs -WorkingDirectory $env:OPEN_SPACE_TERMINAL_FOLDER -WindowStyle Normal";

/** Fixed executable names only: a saved preference never supplies executable code or a command line. */
export function findTerminals(env: NodeJS.ProcessEnv = process.env, exists: (file: string) => boolean = existsSync): TerminalChoice[] {
  const system = path.join(env.SystemRoot || 'C:\\Windows', 'System32');
  const search = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter((folder) => path.isAbsolute(folder));
  const programs = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')].filter((folder): folder is string => !!folder);
  const gitRoots = [
    ...(env.CLAUDE_CODE_GIT_BASH_PATH ? [path.resolve(path.dirname(env.CLAUDE_CODE_GIT_BASH_PATH), '..')] : []),
    ...search.flatMap((folder) => [folder, path.dirname(folder)]),
    ...programs.map((folder) => path.join(folder, 'Git')),
  ];
  const candidates: { id: TerminalKind; name: string; paths: string[] }[] = [
    { id: 'cmd', name: 'cmd', paths: [env.ComSpec || path.join(system, 'cmd.exe')] },
    { id: 'powershell', name: 'PowerShell', paths: [...search.map((folder) => path.join(folder, 'pwsh.exe')), ...programs.map((folder) => path.join(folder, 'PowerShell', '7', 'pwsh.exe')), path.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')] },
    { id: 'git-bash', name: 'Git Bash', paths: gitRoots.map((folder) => path.join(folder, 'git-bash.exe')) },
  ];
  return candidates.flatMap(({ id, name, paths }) => {
    const file = paths.find((candidate) => path.isAbsolute(candidate) && exists(candidate));
    return file ? [{ id, name, path: file }] : [];
  });
}

/** A visible terminal in the chosen folder: the one picked in the settings on Windows, iTerm/Terminal on macOS. */
export function openTerminal(folder: string, kind: TerminalKind = 'cmd'): Promise<void> {
  if (process.platform === 'win32') {
    return new Promise((resolve, reject) => {
      const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
      const choice = findTerminals().find((terminal) => terminal.id === kind);
      if (!choice) { reject(new Error(st.terminal.failed)); return; }
      execFile(path.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', OPEN_WINDOWS_TERMINAL], {
          timeout: 10_000, windowsHide: true,
          env: { ...process.env, OPEN_SPACE_TERMINAL_EXE: choice.path, OPEN_SPACE_TERMINAL_FOLDER: folder, OPEN_SPACE_TERMINAL_KIND: choice.id },
        }, (error) => (error ? reject(new Error(st.terminal.failed)) : resolve()));
    });
  }
  if (process.platform !== 'darwin') return Promise.reject(new Error(st.terminal.unsupported));
  const application = ITERM.find((candidate) => existsSync(candidate)) ?? 'Terminal';
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/open', ['-a', application, folder], { timeout: 10_000 }, (error) => (error ? reject(new Error(st.terminal.failed)) : resolve()));
  });
}

/** the program that opens an address, a folder or a file as the system does: the Finder, the Explorer, the file manager, the browser */
const SYSTEM_OPENER = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';

/** Opens an address or a folder the way the system does; the caller checked what it is. */
export function openWithSystem(target: string) {
  execFile(SYSTEM_OPENER, [target], () => {});
}

/** Shows a file in the Finder, the Explorer on Windows, or opens its folder elsewhere; the caller checked the file. */
export function revealWithSystem(file: string) {
  if (process.platform === 'darwin') execFile('open', ['-R', file], () => {});
  else if (process.platform === 'win32') execFile('explorer.exe', [`/select,${file}`], () => {});
  else openWithSystem(path.dirname(file));
}

/** A web page in the default browser; only an https address (they come from Claude Code, not from the page). */
export function openWebPage(address: string) {
  if (/^https:\/\//.test(address)) openWithSystem(address);
}
