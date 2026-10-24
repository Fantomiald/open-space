import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { windowsScript } from './windows.ts';

/** Windows argv quoting: quotes group spaces; only backslashes before a quote are escapes. */
export function windowsArguments(command: string): string[] {
  const args: string[] = [];
  let word = '', quoted = false, started = false;
  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;
    if (!quoted && /\s/.test(char)) {
      if (started) { args.push(word); word = ''; started = false; }
      continue;
    }
    started = true;
    if (char === '\\') {
      let end = index;
      while (command[end] === '\\') end++;
      const count = end - index;
      if (command[end] === '"') {
        word += '\\'.repeat(Math.floor(count / 2));
        if (count % 2) word += '"'; else quoted = !quoted;
        index = end;
      } else { word += '\\'.repeat(count); index = end - 1; }
    } else if (char === '"') quoted = !quoted;
    else word += char;
  }
  if (started) args.push(word);
  return args;
}

const samePath = (a: string, b: string) => path.win32.resolve(a).toLowerCase() === path.win32.resolve(b).toLowerCase();

export function ownsBrowser(command: string, executable: string, profile: string, chrome: string): boolean {
  if (!samePath(executable, chrome)) return false;
  const args = windowsArguments(command);
  return ownsBrowserArguments(args, profile);
}

function ownsBrowserArguments(args: string[], profile: string): boolean {
  const folder = args.find((arg) => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  return !!folder && samePath(folder, profile) && args.includes('--headless=new') && args.includes('--remote-debugging-port=0');
}

/** Close through Chrome's own protocol: no administrator rights or Windows process command-line access needed. */
export async function closeBrowserProfile(profile: string, chrome: string): Promise<boolean> {
  const lines = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).trim().split(/\r?\n/);
  const port = Number(lines[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^\/devtools\/browser\/[\w-]+$/.test(lines[1] ?? '')) return false;
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${lines[1]}`);
    let closing = false, settled = false;
    const finish = (ok: boolean) => { if (settled) return; settled = true; clearTimeout(timeout); socket.terminate(); resolve(ok); };
    const timeout = setTimeout(() => finish(false), 4000);
    socket.on('error', () => finish(false));
    socket.on('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.getBrowserCommandLine' })));
    socket.on('message', (message) => {
      try {
        const answer = JSON.parse(String(message));
        if (answer.id !== 1) return;
        const args: unknown = answer.result?.arguments;
        if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string') || !args[0] || !samePath(args[0], chrome) || !ownsBrowserArguments(args, profile)) { finish(false); return; }
        closing = true;
        socket.send(JSON.stringify({ id: 2, method: 'Browser.close' }));
      } catch { finish(false); }
    });
    // Give Chrome time to release the profile's filesystem lock after its debug socket closes.
    socket.on('close', () => { if (closing) setTimeout(() => finish(true), 150); else finish(false); });
  });
}

/** Only our headless browser on this exact profile; recheck identity immediately before stopping its tree. */
export async function recoverWindowsBrowser(profile: string, chrome: string): Promise<void> {
  if (!await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')) return;
  if (await closeBrowserProfile(profile, chrome)) return;
  const raw = await windowsScript(`ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe' OR Name = 'brave.exe' OR Name = 'chromium.exe'" | Select-Object ProcessId, ExecutablePath, CommandLine, @{n='Created';e={$_.CreationDate.ToUniversalTime().Ticks.ToString()}})`);
  const candidates: unknown = JSON.parse(raw);
  if (!Array.isArray(candidates)) return;
  for (const candidate of candidates) {
    const { ProcessId: pid, ExecutablePath: executable, CommandLine: command, Created: created } = candidate;
    if (!Number.isInteger(pid) || pid <= 0 || typeof executable !== 'string' || typeof command !== 'string' || typeof created !== 'string'
      || !ownsBrowser(command, executable, profile, chrome)) continue;
    await windowsScript(`
      $browser = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $env:OPEN_SPACE_BROWSER_PID)
      if ($browser -and $browser.ExecutablePath -eq $env:OPEN_SPACE_BROWSER_EXE -and $browser.CommandLine -ceq $env:OPEN_SPACE_BROWSER_COMMAND -and $browser.CreationDate.ToUniversalTime().Ticks.ToString() -eq $env:OPEN_SPACE_BROWSER_CREATED) {
        & "$env:SystemRoot\\System32\\taskkill.exe" /PID $browser.ProcessId /T /F | Out-Null
        if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $browser.ProcessId -ErrorAction SilentlyContinue)) { throw 'Cannot stop previous Open Space browser' }
      }`, { OPEN_SPACE_BROWSER_PID: String(pid), OPEN_SPACE_BROWSER_EXE: executable, OPEN_SPACE_BROWSER_COMMAND: command, OPEN_SPACE_BROWSER_CREATED: created });
  }
}
