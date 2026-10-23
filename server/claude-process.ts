// One `claude -p` process per session, talking stream-json on stdin/stdout:
//   - we write user messages and permission answers;
//   - it writes everything it does, and asks for permissions with control_request messages.
// The process leads its own process group, so stopping it also stops the commands its Bash tool started.
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { ClaudeSettings } from '../shared/claude-settings.ts';
import { type ClaudeAccount, EFFORTS, type Effort, type ImageUpload, type ModelChoice, type PermissionMode, type SlashCommand, type WorktreeInfo } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { asArray, asJson, asString, isJson, type Json } from './json.ts';
import { signalTree } from './process-tree.ts';

/** Run npm's Claude shim through Node directly, keeping JSON arguments out of cmd.exe. */
export function claudeCommand(file: string, args: string[]): [string, string[]] {
  if (process.platform === 'win32' && /\.cmd$/i.test(file)) {
    const node = path.join(path.dirname(file), 'node.exe');
    return [existsSync(node) ? node : 'node.exe', [path.join(path.dirname(file), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'), ...args]];
  }
  return [file, args];
}

export interface ClaudeBinary { path: string; version: string }

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(...claudeCommand(file, args), { timeout: 15000, windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

/** The version a `claude` executable says it is ("2.1.305"), or null when it does not answer. */
export async function readVersion(file: string): Promise<string | null> {
  try {
    const output = (await run(file, ['--version'])).trim();
    return output.split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Runs `claude update`, which checks and installs (through the package manager for those installs). The only network
 * use is Claude Code's own, asked for by the user. Resolves with what it printed, rejects when it failed.
 */
export function runUpdate(file: string, environment: NodeJS.ProcessEnv): Promise<string> {
  return runClaude(file, ['update'], environment, 300_000);
}

/** a sign-in left open in the browser stops waiting after this */
const LOGIN_TIMEOUT_MS = 5 * 60_000;

/**
 * `claude auth login` opens the browser and waits for its sign-in (Claude Code's callback on localhost); the credentials
 * it stores are then the ones every new `claude` uses. `claude auth logout` removes them.
 * ponytail: no field for the code the CLI asks for when the browser cannot open; the browser on this computer can.
 */
export function runAuth(file: string, environment: NodeJS.ProcessEnv, action: 'login' | 'logout'): Promise<string> {
  return runClaude(file, ['auth', action], environment, action === 'login' ? LOGIN_TIMEOUT_MS : 30_000);
}

function runClaude(file: string, args: string[], environment: NodeJS.ProcessEnv, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(...claudeCommand(file, args), { env: environment, timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) { resolve(stdout); return; }
      if (error.killed) { reject(new Error(st.process.timedOut)); return; }
      const lines = `${stderr}\n${stdout}`.split('\n').map((line) => line.trim()).filter(Boolean);
      reject(new Error(lines.at(-1) ?? error.message));
    });
  });
}

/** Who Claude Code is signed in as, or null when it does not answer (signed out, it prints the same JSON with exit code 1). */
export function readAccount(file: string, environment: NodeJS.ProcessEnv): Promise<ClaudeAccount | null> {
  return new Promise((resolve) => {
    execFile(...claudeCommand(file, ['auth', 'status', '--json']), { env: environment, timeout: 15_000, windowsHide: true }, (_error, stdout) => {
      try { resolve(parseAccount(JSON.parse(stdout))); } catch { resolve(null); }
    });
  });
}

export function parseAccount(status: unknown): ClaudeAccount | null {
  if (!isJson(status) || typeof status.loggedIn !== 'boolean') return null;
  if (!status.loggedIn) return { loggedIn: false };
  // how it reaches Claude: the sign-in (claude.ai, an API key…), or the cloud it goes through when not Anthropic's own
  const provider = asString(status.apiProvider);
  const via = provider && provider !== 'firstParty' ? provider : asString(status.authMethod);
  return { loggedIn: true, email: asString(status.email), org: asString(status.orgName), plan: asString(status.subscriptionType), ...(via ? { via } : {}) };
}

/** Finds the `claude` executable without going through terminal aliases. Relative PATH entries are ignored. */
export async function findClaude(env: NodeJS.ProcessEnv = process.env): Promise<ClaudeBinary | null> {
  const home = os.homedir();
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const searchPath = env.PATH ?? env.Path ?? '';
  const folders = [...searchPath.split(path.delimiter), path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), ...(process.platform === 'win32' ? [path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm')] : ['/opt/homebrew/bin', '/usr/local/bin'])];
  const fromPath = folders.filter((directory) => path.isAbsolute(directory)).flatMap((directory) => names.map((name) => path.join(directory, name)));
  const candidates = [env.CLAUDE_BIN, ...fromPath];
  for (const candidate of new Set(candidates.filter((c): c is string => !!c))) {
    if (!path.isAbsolute(candidate) || !existsSync(candidate)) continue;
    const version = await readVersion(candidate);
    if (version) return { path: candidate, version };
  }
  return null;
}

export interface LaunchOptions {
  cwd: string;
  /** Claude Code session id: created with --session-id, reopened with --resume */
  sessionId: string;
  resume: boolean;
  model: string;
  effort?: Effort;
  ultracode?: boolean;
  permissionMode: PermissionMode;
  /** the session's name, given to Claude when the conversation starts, with the user's name and their note (Preferences) */
  name: string;
  user?: string;
  note?: string;
  /** without the folder's own settings (see server/trust.ts) */
  untrusted?: boolean;
  /** the Claude Code settings the user chose for Open Space's sessions (shared/claude-settings.ts) */
  settings?: ClaudeSettings;
  /** a duplicate's first launch: the conversation it goes on from, copied under `sessionId` */
  forkOf?: string;
  /** folders the session may read besides its own (--add-dir): where the files the user sends are kept */
  addDirs?: readonly string[];
  /** its Playwright server, pointed at the browser Open Space shows (see server/browser.ts) */
  mcpConfig?: string;
  /** its sub-agents with a browser of their own (server/browser.ts testerAgents) */
  agents?: string;
  /** it works on a branch of its own, in a worktree: its conversation is told so when it starts */
  worktree?: Pick<WorktreeInfo, 'branch' | 'base' | 'root' | 'mainRoot'>;
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
export function buildClaudeArgs(options: Pick<LaunchOptions, 'sessionId' | 'resume' | 'model' | 'effort' | 'ultracode' | 'permissionMode' | 'name' | 'untrusted' | 'user' | 'note' | 'addDirs' | 'settings' | 'forkOf' | 'worktree' | 'mcpConfig' | 'agents'>): string[] {
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--forward-subagent-text',
    '--permission-prompt-tool', 'stdio', '--permission-mode', options.permissionMode,
    // a duplicate copies the conversation it comes from under its own id (checked with 2.1.305: --resume then knows it)
    ...(options.forkOf ? ['--resume', options.forkOf, '--fork-session', '--session-id', options.sessionId] : [options.resume ? '--resume' : '--session-id', options.sessionId]),
    '--name', options.name,
  ];
  if (options.model) args.push('--model', options.model);
  if (options.effort) args.push('--effort', options.effort);
  // ultracode is a settings key of its own, so that it holds at any effort (`--effort ultracode` would replace the level)
  const settings = { ...options.settings, ...(options.ultracode ? { ultracode: true } : {}) };
  if (Object.keys(settings).length) args.push('--settings', JSON.stringify(settings));
  for (const directory of options.addDirs ?? []) args.push('--add-dir', directory);
  // a server of the same name in the user's settings gives way to this one (checked with 2.1.306)
  if (options.mcpConfig) args.push('--mcp-config', options.mcpConfig);
  if (options.agents) args.push('--agents', options.agents);
  // the user's own settings only: none of the folder's hooks nor MCP servers (server/trust.ts)
  if (options.untrusted) args.push('--setting-sources', 'user');
  if (!options.resume && !options.forkOf) args.push('--append-system-prompt', identityPrompt(options.name, options.user, options.note, options.worktree, !!options.mcpConfig));
  return args;
}

/**
 * Each session is told its own name, so that it answers to it instead of calling itself Claude, and to keep its
 * messages short: the user follows several sessions at once, in a narrow panel and in speech bubbles. `user`: their
 * first name; `note`: what they want every agent to know (their own words, added at the end).
 */
export function identityPrompt(name: string, user = '', note = '', worktree?: LaunchOptions['worktree'], browser = false): string {
  const identity = st.prompt.identity(name, user.trim(), note.trim(), browser);
  return worktree ? `${identity}\n\n${st.prompt.worktree(worktree)}` : identity;
}

/**
 * Told in the next message when a session moved since its conversation started: into its worktree (a kept branch
 * resumed), or back to the main checkout `cwd` (its branch merged, thrown away or cleaned).
 */
export const placeNote = (cwd: string, worktree: LaunchOptions['worktree'] | undefined) => (worktree ? st.prompt.intoWorktree(worktree) : st.prompt.backHome(cwd));

/** Told in the next message when a session was renamed, or started before sessions had names. */
export const renameNote = (name: string) => st.prompt.rename(name);

/** What Claude Code offers in a folder: its slash commands (the folder's own included) and the models. */
export interface Catalog { commands: SlashCommand[]; models: ModelChoice[] }

export type CatalogProbe = (cwd: string, untrusted: boolean) => Promise<Catalog>;

const PROBE_TIMEOUT_MS = 20000;
const MAX_PROBED_DESCRIPTION = 200;

/**
 * Asks Claude Code for a folder's commands and models before any message is sent: a process that only gets the
 * `initialize` control request, then stops (checked with 2.1.303: about 0.6 s, no API call, no conversation written).
 * Without MCP servers (--strict-mcp-config): their prompts are not offered anyway (see isOffered), and starting them is slow.
 */
export function createCatalogProbe(binary: ClaudeBinary, environment: NodeJS.ProcessEnv): CatalogProbe {
  return (cwd, untrusted) => new Promise((resolve, reject) => {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio', '--strict-mcp-config'];
    if (untrusted) args.push('--setting-sources', 'user');
    const child = spawn(...claudeCommand(binary.path, args), { cwd, env: environment, stdio: ['pipe', 'pipe', 'ignore'], detached: process.platform !== 'win32', windowsHide: true });
    const end = () => signalTree(child.pid, 'SIGTERM');
    const timer = setTimeout(() => { end(); reject(new Error('no answer to initialize')); }, PROBE_TIMEOUT_MS);
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let message: unknown;
      try { message = JSON.parse(line); } catch { return; }
      if (!isJson(message) || message.type !== 'control_response') return;
      clearTimeout(timer);
      end();
      resolve(parseCatalog(asJson(asJson(message.response).response)));
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', () => { clearTimeout(timer); reject(new Error('claude ended before answering initialize')); });
    child.stdin.on('error', () => { /* gone: "close" reports it */ });
    child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: 'catalog', request: { subtype: 'initialize' } })}\n`);
  });
}

const isEffort = (value: unknown): value is Effort => (EFFORTS as readonly unknown[]).includes(value);

export function parseCatalog(response: Json): Catalog {
  const commands = asArray(response.commands).map(asJson).filter((c) => asString(c.name)).map((c): SlashCommand => {
    const aliases = asArray(c.aliases).filter((alias): alias is string => typeof alias === 'string' && !!alias);
    return {
      name: asString(c.name),
      ...(asString(c.description) ? { description: asString(c.description).slice(0, MAX_PROBED_DESCRIPTION) } : {}),
      ...(asString(c.argumentHint) ? { argumentHint: asString(c.argumentHint) } : {}),
      ...(aliases.length ? { aliases } : {}),
    };
  });
  const models = asArray(response.models).map(asJson).filter((m) => asString(m.value)).map((m): ModelChoice => ({
    value: asString(m.value),
    label: asString(m.displayName) || asString(m.value),
    ...(asString(m.description) ? { description: asString(m.description) } : {}),
    efforts: m.supportsEffort === false ? [] : asArray(m.supportedEffortLevels).filter(isEffort),
  }));
  return { commands, models };
}

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
    // auto-compact turned off in Claude Code's own /config is kept in ~/.claude.json, which wins over --settings: the
    // variable turns it off whatever that file says
    const env = { ...environment, CLAUDE_CODE_ATTACHMENTS_BY_PATH: '1', ...(launch.settings?.autoCompactEnabled === false ? { DISABLE_AUTO_COMPACT: '1' } : {}) };
    const child = spawn(...claudeCommand(binary.path, buildClaudeArgs(launch)), { cwd: launch.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
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
    signalTree(pid, signal);
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
