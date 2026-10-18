// A command the user runs with "!" in a session's field, like Claude Code's bash mode in the terminal: Open Space runs it
// itself, in the session's folder, with the user's shell and the environment Claude Code gets, without the model.
// Claude learns of it with the user's next message (see Session.shell), in the terminal's own format.
import { spawn } from 'node:child_process';

/** `stopped`: by the user (the signal) or after TIMEOUT_MS (`timedOut`) */
export interface ShellResult { code: number | null; stdout: string; stderr: string; ms: number; timedOut: boolean; stopped: boolean }
export type ShellRunner = (command: string, cwd: string, signal?: AbortSignal) => Promise<ShellResult>;

const TIMEOUT_MS = 120_000;
const KILL_DELAY_MS = 3000;
/** Kept of each stream: the end, where the useful part of a long output usually is. */
const MAX_CHARS = 30_000;

const keepEnd = (text: string) => (text.length > MAX_CHARS ? `…${text.slice(-MAX_CHARS)}` : text);

export function createShellRunner(environment: NodeJS.ProcessEnv): ShellRunner {
  return (command, cwd, signal) => new Promise((resolve) => {
    const started = Date.now();
    // its own process group, so a timeout stops what the command started too
    const child = spawn(environment.SHELL || '/bin/zsh', ['-c', command], { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = '', stderr = '', timedOut = false, stopped = false;
    let killer: NodeJS.Timeout | undefined;
    const signalGroup = (name: NodeJS.Signals) => { try { process.kill(-child.pid!, name); } catch { /* already gone */ } };
    // a command that ignores SIGTERM (a dev server, a watcher) is killed a moment later
    const stop = () => {
      stopped = true;
      signalGroup('SIGTERM');
      killer = setTimeout(() => signalGroup('SIGKILL'), KILL_DELAY_MS);
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = keepEnd(stdout + chunk.toString()); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = keepEnd(stderr + chunk.toString()); });
    const timer = setTimeout(() => { timedOut = true; stop(); }, TIMEOUT_MS);
    signal?.addEventListener('abort', stop, { once: true });
    const finish = (code: number | null) => {
      clearTimeout(timer);
      clearTimeout(killer);
      signal?.removeEventListener('abort', stop);
      resolve({ code, stdout: stdout.replace(/\n$/, ''), stderr: stderr.replace(/\n$/, ''), ms: Date.now() - started, timedOut, stopped });
    };
    child.on('close', (code) => finish(code));
    child.on('error', (error) => { stderr += String(error); finish(null); });
  });
}
