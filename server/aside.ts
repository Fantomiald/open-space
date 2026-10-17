// A side question, like Claude Code's /btw: asked while a session works, answered from its conversation without
// interrupting it and without entering it. A second `claude -p` resumes the conversation as a fork that is never
// saved (--fork-session --no-session-persistence): the session's own process and transcript are left alone.
// Checked with a real run: the fork answers from the conversation in a few seconds, and leaves no session file.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import type { ClaudeBinary } from './claude-process.ts';
import { asJson, asString, isJson } from './json.ts';

export interface AsideRequest {
  cwd: string;
  /** the session's conversation, resumed (forked) when it exists on disk */
  sessionId: string;
  resume: boolean;
  model: string;
  untrusted?: boolean;
  question: string;
}

export interface AsideHandlers {
  /** the answer so far, while it is written */
  onText: (text: string) => void;
  onEnd: (result: { ok: boolean; text: string }) => void;
}

export type AsideRunner = (request: AsideRequest, handlers: AsideHandlers) => { stop: () => void };

/** A side question that takes longer than this is given up. */
const TIME_LIMIT_MS = 3 * 60_000;

export const ASIDE_PROMPT =
  'Question à côté (/btw), posée pendant que tu travailles : réponds brièvement, à partir de ce qui est déjà ' +
  'dans la conversation, sans utiliser d’outil. Ta réponse n’entre pas dans la conversation principale.';

/**
 * Without --permission-prompt-tool, whatever would need a permission is refused at once: the fork can only read. The
 * question goes after "--", so one starting with a dash is not taken for an option.
 */
export function buildAsideArgs(request: Omit<AsideRequest, 'cwd'>): string[] {
  const args = ['-p'];
  if (request.resume) args.push('--resume', request.sessionId, '--fork-session');
  args.push('--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'default');
  if (request.model) args.push('--model', request.model);
  if (request.untrusted) args.push('--setting-sources', 'user');
  args.push('--append-system-prompt', ASIDE_PROMPT, '--', request.question);
  return args;
}

/** Reads the fork's stream: the text of its answer as it is written, then its result. */
export function readAsideLine(message: unknown, written: string): { text?: string; result?: { ok: boolean; text: string } } {
  if (!isJson(message)) return {};
  if (message.type === 'stream_event' && !message.parent_tool_use_id) {
    const event = asJson(message.event), delta = asJson(event.delta);
    if (event.type === 'content_block_start' && asJson(event.content_block).type === 'text' && written) return { text: `${written}\n\n` };
    if (event.type === 'content_block_delta' && delta.type === 'text_delta') return { text: written + asString(delta.text) };
  }
  if (message.type === 'result') return { result: { ok: message.subtype === 'success' && !message.is_error, text: asString(message.result) } };
  return {};
}

export function createAsideRunner(binary: ClaudeBinary, environment: NodeJS.ProcessEnv): AsideRunner {
  return (request, handlers) => {
    const child = spawn(binary.path, buildAsideArgs(request), { cwd: request.cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let written = '';
    let ended = false;
    let stderr = '';
    const end = (result: { ok: boolean; text: string }) => {
      if (ended) return;
      ended = true;
      clearTimeout(limit);
      handlers.onEnd(result);
    };
    const stop = () => { if (child.pid !== undefined) try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } };
    const limit = setTimeout(() => { stop(); end({ ok: false, text: 'La question à côté a pris trop de temps.' }); }, TIME_LIMIT_MS);
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let message: unknown;
      try { message = JSON.parse(line); } catch { return; }
      const read = readAsideLine(message, written);
      if (read.text !== undefined && read.text !== written) { written = read.text; handlers.onText(written); }
      if (read.result) end({ ok: read.result.ok, text: read.result.text || written });
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on('close', () => end({ ok: false, text: stderr.trim().split('\n').slice(-2).join(' ') || 'Claude Code s’est arrêté sans répondre.' }));
    child.on('error', (error) => end({ ok: false, text: String(error) }));
    return { stop: () => { stop(); end({ ok: false, text: 'Question retirée.' }); } };
  };
}
