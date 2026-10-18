// One `claude -p` process per session, talking stream-json on stdin/stdout:
//   - we write user messages and permission answers;
//   - it writes everything it does, and asks for permissions with control_request messages.
// The process leads its own process group, so stopping it also stops the commands its Bash tool started.
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { ImageUpload, PermissionMode } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { asJson, asString, isJson, type Json } from './json.ts';

export interface ClaudeBinary { path: string; version: string }

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 15000 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

/** Finds the `claude` executable without going through terminal aliases. Relative PATH entries are ignored. */
export async function findClaude(env: NodeJS.ProcessEnv = process.env): Promise<ClaudeBinary | null> {
  const home = os.homedir();
  const fromPath = (env.PATH ?? '').split(path.delimiter).filter((directory) => path.isAbsolute(directory)).map((directory) => path.join(directory, 'claude'));
  const candidates = [env.CLAUDE_BIN, ...fromPath, path.join(home, '.local/bin/claude'), path.join(home, '.claude/local/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const candidate of new Set(candidates.filter((c): c is string => !!c))) {
    if (!path.isAbsolute(candidate) || !existsSync(candidate)) continue;
    try {
      const output = await run(candidate, ['--version']);
      return { path: candidate, version: output.trim().split(/\s+/)[0] ?? output.trim() };
    } catch { /* try the next one */ }
  }
  return null;
}

export interface LaunchOptions {
  cwd: string;
  /** Claude Code session id: created with --session-id, reopened with --resume */
  sessionId: string;
  resume: boolean;
  model: string;
  permissionMode: PermissionMode;
  /** the session's name, given to Claude when the conversation starts, with the user's name and their note (Preferences) */
  name: string;
  user?: string;
  note?: string;
  /** without the folder's own settings (see server/trust.ts) */
  untrusted?: boolean;
  /** folders the session may read besides its own (--add-dir): where the files the user sends are kept */
  addDirs?: readonly string[];
}

/**
 * The command line. Notes verified against Claude Code 2.1.301:
 * - `--permission-prompt-tool stdio` is what makes permission requests arrive as control_request messages;
 *   `--permission-prompts host` alone does not (the tool call is denied and a system/permission_denied message is sent).
 * - `--permission-mode` is chosen per session (auto by default); whatever still needs a yes arrives as a control_request.
 * - `--tools` is deliberately not passed.
 * - `--setting-sources user` keeps a folder's hooks and .mcp.json servers from starting (they do with -p otherwise).
 * - A user message may carry image blocks (base64, as in the Messages API) next to its text: checked with a real run.
 * - `--include-partial-messages` sends the text as it is written (stream_event), then the whole message as usual.
 * - `--forward-subagent-text` adds what sub-agents write (and think) to the stream, under their parent_tool_use_id;
 *   it only forwards text they write anyway (fixtures/subagent-forwarded.jsonl).
 * - `--append-system-prompt` is recorded with a new conversation and kept as is by every later --resume, so the
 *   name is only passed when the conversation starts (renames are told in a message, see Session.send).
 * - `--name` is how other Claude Code sessions of the machine see this one (ListAgents, SendMessage "to"), accents and
 *   spaces kept (checked with 2.1.302). It is also the conversation's title in Claude Code's own /resume; Open Space's
 *   resume list shows Claude's summary instead (see listConversations). Given at every launch, so a rename shows from the next one.
 */
export function buildClaudeArgs(options: Pick<LaunchOptions, 'sessionId' | 'resume' | 'model' | 'permissionMode' | 'name' | 'untrusted' | 'user' | 'note' | 'addDirs'>): string[] {
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--forward-subagent-text',
    '--permission-prompt-tool', 'stdio', '--permission-mode', options.permissionMode,
    options.resume ? '--resume' : '--session-id', options.sessionId,
    '--name', options.name,
  ];
  if (options.model) args.push('--model', options.model);
  for (const directory of options.addDirs ?? []) args.push('--add-dir', directory);
  // the user's own settings only: none of the folder's hooks nor MCP servers (server/trust.ts)
  if (options.untrusted) args.push('--setting-sources', 'user');
  if (!options.resume) args.push('--append-system-prompt', identityPrompt(options.name, options.user, options.note));
  return args;
}

/**
 * Each session is told its own name, so that it answers to it instead of calling itself Claude, and to keep its
 * messages short: the user follows several sessions at once, in a narrow panel and in speech bubbles. `user`: their
 * first name; `note`: what they want every agent to know (their own words, added at the end).
 */
export function identityPrompt(name: string, user = '', note = ''): string {
  return st.prompt.identity(name, user.trim(), note.trim());
}

/** Told in the next message when a session was renamed, or started before sessions had names. */
export const renameNote = (name: string) => st.prompt.rename(name);

export interface ExitInfo { code: number | null; signal: NodeJS.Signals | null; stderr: string }

export interface ProcessHandlers {
  onMessage: (message: Json) => void;
  onExit: (info: ExitInfo) => void;
}

export type PermissionAnswer = { allow: true; input: Record<string, unknown>; updates: Json[] } | { allow: false };

/** What a Session needs from a process: the real one below, or a scripted one in tests. */
export interface ProcessHandle {
  readonly alive: boolean;
  /** a user message: its text (may be empty when pictures go alone) and its pictures */
  send: (text: string, images?: readonly ImageUpload[]) => boolean;
  answerPermission: (requestId: string, answer: PermissionAnswer) => void;
  refuseControl: (requestId: string) => void;
  interrupt: () => void;
  /** A control request of ours (Remote Control, the MCP servers, the context…): resolves with Claude Code's answer. */
  control: (request: Json) => Promise<Json>;
  /** Ends stdin, then SIGTERM to the process group after `graceMs`, SIGKILL 3 s later. Resolves once the process is gone. */
  stop: (graceMs: number) => Promise<void>;
}

export type ProcessFactory = (launch: LaunchOptions, handlers: ProcessHandlers) => ProcessHandle;

const KILL_AFTER_TERM_MS = 3000;

export function createProcessFactory(binary: ClaudeBinary, environment: NodeJS.ProcessEnv): ProcessFactory {
  return (launch, handlers) => new ClaudeProcess(binary, environment, launch, handlers);
}

class ClaudeProcess implements ProcessHandle {
  private child: ChildProcessWithoutNullStreams;
  private stderr = '';
  private exited = false;
  private exitWaiters: (() => void)[] = [];
  private handlers: ProcessHandlers;
  /** our own control requests waiting for their control_response, by request id (`requests` numbers them) */
  private requests = 0;
  private replies = new Map<string, { resolve: (response: Json) => void; reject: (error: Error) => void }>();

  constructor(binary: ClaudeBinary, environment: NodeJS.ProcessEnv, launch: LaunchOptions, handlers: ProcessHandlers) {
    this.handlers = handlers;
    // CLAUDE_CODE_ATTACHMENTS_BY_PATH gives Claude its SendUserFile tool and has it hand the files' paths over instead of
    // uploading them (checked with 2.1.302): Open Space shows them in the thread (see Normalizer and Session.onFiles)
    const env = { ...environment, CLAUDE_CODE_ATTACHMENTS_BY_PATH: '1' };
    const child = spawn(binary.path, buildClaudeArgs(launch), { cwd: launch.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    this.child = child;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      if (!line.trim()) return;
      let message: unknown;
      try { message = JSON.parse(line); } catch { return; }
      if (!isJson(message)) return;
      const reply = message.type === 'control_response' ? this.replies.get(asString(asJson(message.response).request_id)) : undefined;
      if (reply) this.settleReply(asJson(message.response), reply);
      else handlers.onMessage(message);
    });
    child.stderr.on('data', (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-4000); });
    // "close" fires once the output has been fully read (unlike "exit")
    child.on('close', (code, signal) => this.finish(code, signal));
    // could not start at all (binary removed, cwd gone...): that is an exit, with an error
    child.on('error', (error) => { this.stderr += String(error); this.finish(1, null); });
    child.stdin.on('error', () => { /* process already gone: "close" reports it */ });
  }

  get alive() { return !this.exited; }

  private finish(code: number | null, signal: NodeJS.Signals | null) {
    if (this.exited) return;
    this.exited = true;
    // whatever the Bash tool left running in the group goes with its parent
    this.signalGroup('SIGTERM');
    for (const { reject } of this.replies.values()) reject(new Error(st.process.stopped));
    this.replies.clear();
    this.handlers.onExit({ code, signal, stderr: this.stderr });
    for (const resolve of this.exitWaiters.splice(0)) resolve();
  }

  private write(payload: Json): boolean {
    if (this.exited) return false;
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return true;
  }

  send(text: string, images: readonly ImageUpload[] = []) {
    const content = [
      ...(text ? [{ type: 'text', text }] : []),
      ...images.map(({ mediaType, data }) => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })),
    ];
    return this.write({ type: 'user', message: { role: 'user', content } });
  }

  answerPermission(requestId: string, answer: PermissionAnswer) {
    const response = answer.allow
      ? { behavior: 'allow', updatedInput: answer.input, ...(answer.updates.length ? { updatedPermissions: answer.updates } : {}) }
      : { behavior: 'deny', message: 'The user denied this action. Do something else, or ask them.' };
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  /** A control request we do not handle: answered at once so Claude Code does not wait for nothing. */
  refuseControl(requestId: string) {
    this.write({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: 'Not supported by Open Space' } });
  }

  interrupt() {
    this.write({ type: 'control_request', request_id: `interrupt-${Date.now()}`, request: { subtype: 'interrupt' } });
  }

  control(request: Json): Promise<Json> {
    const requestId = `${asString(request.subtype)}-${++this.requests}`;
    return new Promise((resolve, reject) => {
      this.replies.set(requestId, { resolve, reject });
      if (!this.write({ type: 'control_request', request_id: requestId, request })) {
        this.replies.delete(requestId);
        reject(new Error(st.process.stopped));
      }
    });
  }

  private settleReply(response: Json, reply: { resolve: (response: Json) => void; reject: (error: Error) => void }) {
    this.replies.delete(asString(response.request_id));
    if (response.subtype === 'success') reply.resolve(asJson(response.response));
    else reply.reject(new Error(asString(response.error) || st.process.refused));
  }

  private signalGroup(signal: NodeJS.Signals) {
    const pid = this.child.pid;
    if (pid === undefined) return;
    try { process.kill(-pid, signal); } catch { /* group already gone */ }
  }

  stop(graceMs: number): Promise<void> {
    if (this.exited) return Promise.resolve();
    return new Promise((resolve) => {
      this.exitWaiters.push(resolve);
      this.child.stdin.end();
      const term = setTimeout(() => {
        if (this.exited) return;
        this.signalGroup('SIGTERM');
        const kill = setTimeout(() => { if (!this.exited) this.signalGroup('SIGKILL'); }, KILL_AFTER_TERM_MS);
        kill.unref();
      }, graceMs);
      term.unref();
    });
  }
}
