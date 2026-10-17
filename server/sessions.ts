// The collection of sessions: creation (with the folder and option checks), persistence across restarts,
// the slash command cache, and a clean shutdown of every process.
//
// On disk (OFFICE_DIR):  sessions.json  (the list, rewritten atomically)   logs/<session id>.jsonl  (one event per line)
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PERMISSION_MODE, isPermissionMode, type Conversation, type ImageUpload, type LoggedEvent, type PermissionDecision, type Quota, type ServerMessage, type SessionInfo, type SessionOptions, type SlashCommand } from '../shared/protocol.ts';
import { attachmentsFolder, saveAttachment } from './attachments.ts';
import { TrustedFolders, folderCode, runsCode, trustedInClaudeCode } from './trust.ts';
import type { Aside, FolderCode } from '../shared/protocol.ts';
import type { AsideRunner } from './aside.ts';
import type { ProcessFactory } from './claude-process.ts';
import type { Config } from './config.ts';
import { lastExchanges, listConversations } from './conversations.ts';
import { asArray, asJson, asNumber, asString, isJson } from './json.ts';
import { MAX_NAME, MAX_TAG } from './messages.ts';
import { pickSessionName } from './names.ts';
import { listProjectDirectories, resolveAllowedDirectory } from './paths.ts';
import { Session, newSessionInfo, type SessionDeps, type StoredInfo } from './session.ts';
import { SessionLog } from './session-log.ts';

const STATES: ReadonlySet<string> = new Set(['starting', 'work', 'perm', 'wait', 'done', 'closed', 'error']);
const SAVE_DELAY_MS = 500;
const MAX_COMMAND_DESCRIPTION = 200;

export interface SessionManagerDeps {
  config: Config;
  /** null when Claude Code is not installed: sessions can be listed but not started */
  spawnProcess: ProcessFactory | null;
  broadcast: (message: ServerMessage) => void;
  log: (message: string, error?: unknown) => void;
  now?: () => number;
  /** where Claude Code keeps its conversations (~/.claude); tests point it elsewhere */
  home?: string;
  /** a session now waits for the user (see Session's deps) */
  onAttention?: SessionDeps['onAttention'];
  /** the user's first name and their note for every agent */
  identity?: SessionDeps['identity'];
  /** asks a side question (/btw); null when Claude Code is not installed */
  askAside?: AsideRunner | null;
}

/** The answer of a side question is sent at most this often while it is written. */
const ASIDE_EVERY_MS = 80;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private logs = new Map<string, SessionLog>();
  private commandNames: string[] = [];
  private commandDetails = new Map<string, SlashCommand>();
  private commands: SlashCommand[] = [];
  private quota: Quota | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  /** set by shutdown(): no new process may start after it */
  private stopping = false;
  private deps: SessionManagerDeps;
  private stateFile: string;
  private logsDir: string;
  private trusted: TrustedFolders;
  /** the side question of each session that has one, and how to withdraw it while it is asked */
  private asides = new Map<string, { aside: Aside; stop: () => void }>();

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.stateFile = path.join(deps.config.dataDir, 'sessions.json');
    this.logsDir = path.join(deps.config.dataDir, 'logs');
    this.trusted = new TrustedFolders(path.join(deps.config.dataDir, 'trusted-folders.json'));
  }

  private now() { return (this.deps.now ?? Date.now)(); }

  async init() {
    await mkdir(this.logsDir, { recursive: true, mode: 0o700 });
    await this.trusted.load();
    const stored = await this.readStoredState();
    this.commands = stored.commands;
    this.quota = stored.quota;
    for (const info of stored.sessions) {
      const log = await this.openLog(info.id);
      const session = this.createSession(info, log);
      session.markInterrupted();
      this.logs.set(info.id, log);
      this.sessions.set(info.id, session);
    }
    this.save();
  }

  private async readStoredState(): Promise<{ sessions: StoredInfo[]; commands: SlashCommand[]; quota: Quota | null }> {
    let raw: string;
    try {
      raw = await readFile(this.stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.deps.log('cannot read sessions.json', error);
      return { sessions: [], commands: [], quota: null };
    }
    try {
      const parsed = asJson(JSON.parse(raw));
      return {
        sessions: asArray(parsed.sessions).map(parseStoredSession).filter((info): info is StoredInfo => info !== null),
        commands: asArray(parsed.commands).map(asJson).filter((c) => asString(c.name)).map((c) => ({ name: asString(c.name), description: asString(c.description) || undefined, argumentHint: asString(c.argumentHint) || undefined })),
        quota: this.storedQuota(parsed.quota),
      };
    } catch (error) {
      // keep the unreadable file for inspection rather than overwriting it with an empty list
      const backup = `${this.stateFile}.corrupt-${this.now()}`;
      await rename(this.stateFile, backup).catch(() => {});
      this.deps.log(`sessions.json is unreadable, moved to ${backup}`, error);
      return { sessions: [], commands: [], quota: null };
    }
  }

  private async openLog(id: string): Promise<SessionLog> {
    const log = new SessionLog(path.join(this.logsDir, `${id}.jsonl`), (error) => {
      this.deps.log(`log write failed for session ${id}`, error);
      const name = this.sessions.get(id)?.snapshot().name ?? id.slice(0, 8);
      this.deps.broadcast({ t: 'toast', kind: 'error', text: `Le journal de ${name} n’a pas pu être écrit (${error.message}). Il sera rouvert au prochain événement.` });
    });
    await log.load();
    return log;
  }

  private createSession(info: StoredInfo, log: SessionLog): Session {
    return new Session(info, {
      spawnProcess: (launch, handlers) => {
        if (this.stopping) throw new Error('Le serveur s’arrête : aucune session ne peut démarrer.');
        if (!this.deps.spawnProcess) throw new Error('Claude Code n’est pas installé sur cet ordinateur.');
        return this.deps.spawnProcess(launch, handlers);
      },
      log,
      broadcast: this.deps.broadcast,
      persist: () => this.save(),
      onInitCommands: (names) => this.setCommandNames(names),
      onCommandDetails: (details) => this.setCommandDetails(details),
      onQuota: (quota) => { this.quota = quota; this.deps.broadcast({ t: 'quota', quota }); this.save(); },
      allowedDirectory: (cwd) => resolveAllowedDirectory(cwd, this.deps.config.roots),
      saveImage: (image) => saveAttachment(attachmentsFolder(this.deps.config.dataDir), image),
      onAttention: (kind, session) => this.deps.onAttention?.(kind, session),
      identity: this.deps.identity,
      liveCount: () => [...this.sessions.values()].filter((session) => session.alive).length,
      maxLive: this.deps.config.maxLive,
      idleMs: this.deps.config.idleMs,
      now: this.deps.now,
    });
  }

  // ── read side ──
  list(): SessionInfo[] { return [...this.sessions.values()].map((session) => session.snapshot()); }
  getCommands(): SlashCommand[] { return this.commands; }
  getQuota(): Quota | null { return this.quota; }

  /**
   * The last usage Claude Code reported, kept across restarts (it is only sent while a session works), unless its
   * five-hour window has reset since. resetsAt may be in seconds or milliseconds.
   */
  private storedQuota(raw: unknown): Quota | null {
    if (!isJson(raw) || typeof raw.fiveHour !== 'number') return null;
    const resetsAt = typeof raw.resetsAt === 'number' ? raw.resetsAt : null;
    const resetsAtMs = resetsAt === null ? null : resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
    if (resetsAtMs !== null && resetsAtMs <= this.now()) return null;
    const windows = asArray(raw.windows).flatMap((entry) => (isJson(entry) && typeof entry.name === 'string' && typeof entry.utilization === 'number'
      ? [{ name: entry.name, utilization: entry.utilization, resetsAt: typeof entry.resetsAt === 'number' ? entry.resetsAt : null }] : []));
    return { fiveHour: raw.fiveHour, resetsAt, windows };
  }
  directories(): string[] { return listProjectDirectories(this.deps.config.roots); }

  /** The Claude Code conversations of an allowed folder that are not open here yet. */
  async conversations(directory: string): Promise<Conversation[]> {
    const cwd = resolveAllowedDirectory(directory, this.deps.config.roots);
    if (!cwd) throw new Error('Ce dossier n’est pas dans les racines autorisées (OFFICE_ROOTS).');
    return listConversations(cwd, new Set(this.sessions.keys()), this.deps.home);
  }

  private session(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Cette session n’existe pas.');
    return session;
  }

  // ── side questions (/btw) ──
  /** Asks a side question about a session's conversation; one at a time per session, a new one replaces the last. */
  aside(id: string, question: string) {
    const info = this.session(id).snapshot();
    if (!this.deps.askAside) throw new Error('Claude Code n’est pas installé sur cet ordinateur.');
    const cwd = resolveAllowedDirectory(info.cwd, this.deps.config.roots);
    if (!cwd) throw new Error('Le dossier de cette session n’est plus dans les racines autorisées.');
    this.asides.get(id)?.stop();
    const entry = { aside: { question, answer: '', state: 'asking' } as Aside, stop: () => {} };
    this.asides.set(id, entry);
    const publish = () => { if (this.asides.get(id) === entry) this.deps.broadcast({ t: 'aside', sessionId: id, aside: entry.aside }); };
    let timer: NodeJS.Timeout | null = null;
    const running = this.deps.askAside({ cwd, sessionId: id, resume: info.resumable, model: info.model, untrusted: info.untrusted, question }, {
      onText: (text) => { entry.aside = { ...entry.aside, answer: text }; timer ??= setTimeout(() => { timer = null; publish(); }, ASIDE_EVERY_MS); },
      onEnd: ({ ok, text }) => {
        if (timer) clearTimeout(timer);
        entry.aside = { question, answer: text, state: ok ? 'answered' : 'failed' };
        entry.stop = () => {};
        publish();
      },
    });
    if (entry.aside.state === 'asking') entry.stop = running.stop;
    publish();
  }

  /** Puts a side question away, withdrawing it if it is still asked. */
  closeAside(id: string) {
    const entry = this.asides.get(id);
    if (!entry) return;
    this.asides.delete(id);
    entry.stop();
    this.deps.broadcast({ t: 'aside', sessionId: id, aside: null });
  }

  /** What a client missed: the events after `after`. */
  logSince(id: string, after: number): { events: LoggedEvent[]; truncated: boolean } {
    return this.logs.get(id)?.since(after) ?? { events: [], truncated: false };
  }

  // ── commands ──
  private setCommandNames(names: string[]) {
    if (!names.length) return;
    this.commandNames = names;
    this.refreshCommands();
  }

  private setCommandDetails(details: SlashCommand[]) {
    this.commandDetails = new Map(details.map((command) => [command.name, { ...command, description: command.description?.slice(0, MAX_COMMAND_DESCRIPTION) }]));
    this.refreshCommands();
  }

  /** The init message is the authority on which commands exist; commands_changed only adds descriptions. */
  private refreshCommands() {
    const next = this.commandNames.length
      ? this.commandNames.map((name) => this.commandDetails.get(name) ?? { name })
      : [...this.commandDetails.values()];
    if (JSON.stringify(next) === JSON.stringify(this.commands)) return;
    this.commands = next;
    this.deps.broadcast({ t: 'commands', commands: next });
    this.save();
  }

  // ── commands from clients ──
  async create(options: SessionOptions): Promise<SessionInfo> {
    if (this.stopping) throw new Error('Le serveur s’arrête : aucune session ne peut être créée.');
    if (!this.deps.spawnProcess) throw new Error('Claude Code n’est pas installé sur cet ordinateur.');
    const cwd = resolveAllowedDirectory(options.cwd, this.deps.config.roots);
    if (!cwd) throw new Error('Ce dossier n’est pas dans les racines autorisées (OFFICE_ROOTS).');
    // a folder running code of its own (hooks, MCP servers) needs the user's word once (see trust.ts)
    const code = folderCode(cwd);
    const trusted = !runsCode(code) || trustedInClaudeCode(cwd, this.deps.home) || this.trusted.has(cwd);
    if (!trusted && !options.trust) throw new TrustNeeded(cwd, code);
    if (!trusted && options.trust === 'folder') await this.trusted.add(cwd);
    const name = options.name?.trim().slice(0, MAX_NAME) || pickSessionName(new Set([...this.sessions.values()].map((session) => session.snapshot().name)));
    if (options.resumeId && this.sessions.has(options.resumeId)) throw new Error('Cette conversation est déjà ouverte ici.');
    // a resumed conversation keeps its id: the session goes on with it through --resume
    const info = newSessionInfo({ id: options.resumeId ?? randomUUID(), name, cwd, model: options.model ?? '', permissionMode: options.permissionMode ?? DEFAULT_PERMISSION_MODE }, this.now());
    if (options.resumeId) info.resumable = true;
    if (!trusted && options.trust === 'restricted') info.untrusted = true;
    const log = await this.openLog(info.id);
    const session = this.createSession(info, log);
    this.logs.set(info.id, log);
    this.sessions.set(info.id, session);
    this.deps.broadcast({ t: 'session', session: session.snapshot() });
    this.save();
    if (options.resumeId) {
      const found = (await listConversations(cwd, new Set(), this.deps.home)).find((conversation) => conversation.id === options.resumeId);
      session.showHistory(found?.title ?? 'la conversation', await lastExchanges(cwd, options.resumeId, 8, this.deps.home));
    }
    if (options.text?.trim() || options.images?.length) {
      try {
        session.send(options.text ?? '', options.images);
      } catch (error) {
        await this.forget(info.id);
        throw error;
      }
    }
    return session.snapshot();
  }

  send(id: string, text: string, images?: readonly ImageUpload[]) { this.session(id).send(text, images); }
  answer(id: string, requestId: string, decision: PermissionDecision) { this.session(id).answer(requestId, decision); }
  reply(id: string, requestId: string, answers: Record<string, string>) { this.session(id).reply(requestId, answers); }
  interrupt(id: string) { this.session(id).interrupt(); }
  unqueue(id: string, queueId: string) { this.session(id).unqueue(queueId); }
  sendNow(id: string) { this.session(id).sendNow(); }
  close(id: string) { return this.session(id).close(); }
  rename(id: string, name: string) {
    const clean = name.trim();
    if (!clean) throw new Error('Le nom ne peut pas être vide.');
    this.session(id).rename(clean);
  }

  tag(id: string, tag: string) { this.session(id).setTag(tag); }
  rest(id: string) { return this.session(id).rest(); }

  /** Removes a session (closed first if it runs) and its log. Claude Code's own transcript is not touched. */
  async forget(id: string) {
    const session = this.session(id);
    if (session.alive) await session.close();
    this.closeAside(id);
    this.sessions.delete(id);
    const log = this.logs.get(id);
    this.logs.delete(id);
    await log?.close();
    await rm(path.join(this.logsDir, `${id}.jsonl`), { force: true });
    this.deps.broadcast({ t: 'forgotten', sessionId: id });
    this.save();
  }

  // ── persistence ──
  private save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.saveNow(); }, SAVE_DELAY_MS);
    this.saveTimer.unref();
  }

  private async saveNow() {
    // a unique temporary name: a timer save and the shutdown save may overlap, and each rename must publish a complete file
    const temporary = `${this.stateFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, sessions: this.list(), commands: this.commands, quota: this.quota }), { mode: 0o600 });
      await rename(temporary, this.stateFile);
    } catch (error) {
      this.deps.log('cannot save sessions.json', error);
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  /** Stops every process (waiting ones stay waiting, working ones are marked closed), then writes everything to disk. */
  async shutdown() {
    this.stopping = true;
    for (const id of [...this.asides.keys()]) this.closeAside(id);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await Promise.all([...this.sessions.values()].map((session) => session.shutdown()));
    await this.saveNow();
    await Promise.all([...this.logs.values()].map((log) => log.close()));
  }
}

/** A session asked for in a folder that runs code of its own and was never trusted: the user must decide first. */
export class TrustNeeded extends Error {
  readonly cwd: string;
  readonly code: FolderCode;
  constructor(cwd: string, code: FolderCode) {
    super('Ce dossier fait tourner du code à lui : confirme d’abord.');
    this.cwd = cwd;
    this.code = code;
  }
}

function parseStoredSession(raw: unknown): StoredInfo | null {
  if (!isJson(raw)) return null;
  const id = asString(raw.id);
  const cwd = asString(raw.cwd);
  const state = asString(raw.state);
  if (!/^[\w-]{1,100}$/.test(id) || !cwd || !STATES.has(state)) return null;
  return {
    id, cwd, state: state as SessionInfo['state'], name: asString(raw.name, id.slice(0, 8)), model: asString(raw.model), activeModel: asString(raw.activeModel),
    // sessions saved before the mode was selectable were all launched in manual mode
    permissionMode: isPermissionMode(raw.permissionMode) ? raw.permissionMode : 'manual',
    introducedAs: asString(raw.introducedAs) || undefined,
    tag: asString(raw.tag).slice(0, MAX_TAG) || undefined,
    resting: raw.resting === true || undefined,
    untrusted: raw.untrusted === true || undefined,
    queued: parseQueue(raw.queued),
    // fields of older versions (restricted, permissions, lastSeq) are ignored: they are not stored any more, or recomputed
    stateSince: asNumber(raw.stateSince), createdAt: asNumber(raw.createdAt), turns: asNumber(raw.turns),
    subagents: [], command: asString(raw.command), lastMessage: asString(raw.lastMessage), error: asString(raw.error) || undefined, resumable: raw.resumable === true,
  };
}

function parseQueue(raw: unknown): SessionInfo['queued'] {
  if (!Array.isArray(raw)) return undefined;
  const queued = raw.flatMap((item) => (isJson(item) && asString(item.id) && asString(item.text) ? [{ id: asString(item.id), text: asString(item.text) }] : []));
  return queued.length ? queued : undefined;
}
