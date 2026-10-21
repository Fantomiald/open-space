// The collection of sessions: creation (with the folder and option checks), persistence across restarts,
// the slash command cache, and a clean shutdown of every process.
//
// On disk (OFFICE_DIR):  sessions.json  (the list, rewritten atomically)   logs/<session id>.jsonl  (one event per line)
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PERMISSION_MODE, EFFORTS, isPermissionMode, type Conversation, type ImageUpload, type LoggedEvent, type PermissionDecision, type SearchHit, type Quota, type ServerMessage, type SessionInfo, type SessionOptions, type SlashCommand, type Effort, type ModelChoice, type TuneChange } from '../shared/protocol.ts';
import { attachmentsFolder, copyAttachment, saveAttachment, sweepAttachments } from './attachments.ts';
import { sweepUploads, uploadPath, uploadsFolder } from './uploads.ts';
import { TrustedFolders, folderCode, runsCode, trustedInClaudeCode } from './trust.ts';
import type { ShellRunner } from './shell.ts';
import type { Aside, FolderCode, InspectView, McpAction, SessionChanges } from '../shared/protocol.ts';
import type { AsideRunner } from './aside.ts';
import type { CatalogProbe, ProcessFactory } from './claude-process.ts';
import type { Config } from './config.ts';
import { lastContextUse, lastExchanges, listConversations } from './conversations.ts';
import { st } from './i18n/index.ts';
import { asArray, asJson, asNumber, asString, isJson } from './json.ts';
import { MAX_NAME, MAX_TAG } from './messages.ts';
import { pickSessionName } from './names.ts';
import { sessionChanges } from './changes.ts';
import { listProjectDirectories, resolveAllowedDirectory } from './paths.ts';
import { Session, newSessionInfo, type SessionDeps, type StoredInfo } from './session.ts';
import { SessionLog } from './session-log.ts';
import { searchSessions } from './search.ts';

const STATES: ReadonlySet<string> = new Set(['starting', 'work', 'perm', 'wait', 'done', 'closed', 'error']);
const SAVE_DELAY_MS = 500;
const MAX_COMMAND_DESCRIPTION = 200;
/** a shorter conversation is not worth compacting while idle (Preferences.idleCompact): Claude Code alone starts near 45k */
const IDLE_COMPACT_MIN_TOKENS = 100_000;

export interface SessionManagerDeps {
  config: Config;
  /** null when Claude Code is not installed: sessions can be listed but not started */
  spawnProcess: ProcessFactory | null;
  broadcast: (message: ServerMessage) => void;
  log: (message: string, error?: unknown) => void;
  now?: () => number;
  /** see SessionDeps.graceMs */
  graceMs?: number;
  /** where Claude Code keeps its conversations (~/.claude); tests point it elsewhere */
  home?: string;
  /** a session now waits for the user (see Session's deps) */
  onAttention?: SessionDeps['onAttention'];
  /** the user's first name and their note for every agent */
  identity?: SessionDeps['identity'];
  claudeSettings?: SessionDeps['claudeSettings'];
  /** asks a side question (/btw); null when Claude Code is not installed */
  askAside?: AsideRunner | null;
  /** runs a command typed with "!" (see shell.ts) */
  runShell?: ShellRunner;
  /** asks Claude Code for a folder's commands and the models (see createCatalogProbe); without it, the commands come from the sessions' init */
  probeCatalog?: CatalogProbe | null;
}

/** The answer of a side question is sent at most this often while it is written. */
const ASIDE_EVERY_MS = 80;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private logs = new Map<string, SessionLog>();
  private commandNames: string[] = [];
  private commandDetails = new Map<string, SlashCommand>();
  /** the commands of each session folder, as probed (see probeFolder) */
  private folderCommands = new Map<string, SlashCommand[]>();
  private models: ModelChoice[] = [];
  /** probes under way, by folder: one at a time per folder */
  private probes = new Map<string, Promise<void>>();
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
    // --add-dir needs it to exist
    await mkdir(uploadsFolder(this.deps.config.dataDir), { recursive: true, mode: 0o700 });
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
    this.sweep();
    void this.fillContexts();
    void this.probeAll();
    // Remote Control was on when the server stopped: back on, on the same session of claude.ai
    for (const session of this.sessions.values()) {
      if (session.snapshot().remoteSession) session.setRemote(true).catch((error) => this.deps.log(`cannot turn Remote Control back on for ${session.snapshot().name}`, error));
    }
  }

  /**
   * How full the context of the sessions saved without it is (they have not answered since it was recorded), from
   * their conversation on disk. The window's size is not there: it is taken from a session with the same model.
   */
  private async fillContexts() {
    const windows = new Map(this.list().flatMap((info) => (info.context?.max && info.activeModel ? [[info.activeModel, info.context.max] as const] : [])));
    for (const session of this.sessions.values()) {
      const info = session.snapshot();
      if (info.context || !info.resumable) continue;
      const last = await lastContextUse(info.cwd, session.conversationId, this.deps.home);
      const max = last && windows.get(last.model || info.activeModel);
      if (last && max) session.recallContext({ used: last.used, max });
    }
  }

  /** Removes in the background the stored pictures and files of forgotten sessions (see sweepAttachments). */
  private sweep() {
    sweepAttachments(attachmentsFolder(this.deps.config.dataDir), this.logsDir, this.now())
      .catch((error) => this.deps.log('cannot sweep the attachments', error));
    sweepUploads(uploadsFolder(this.deps.config.dataDir), this.logsDir, this.now())
      .catch((error) => this.deps.log('cannot sweep the uploads', error));
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
      this.deps.broadcast({ t: 'toast', kind: 'error', text: st.sessions.logFailed(name, error.message) });
    });
    await log.load();
    return log;
  }

  private createSession(info: StoredInfo, log: SessionLog): Session {
    return new Session(info, {
      spawnProcess: (launch, handlers) => {
        if (this.stopping) throw new Error(st.sessions.stoppingNoStart);
        if (!this.deps.spawnProcess) throw new Error(st.sessions.claudeMissing);
        return this.deps.spawnProcess({ ...launch, addDirs: [uploadsFolder(this.deps.config.dataDir)] }, handlers);
      },
      log,
      broadcast: this.deps.broadcast,
      persist: () => this.save(),
      // a process started: the folder's commands may have changed since they were probed (a skill added)
      onInitCommands: (names) => (this.deps.probeCatalog ? void this.probeFolder(info.cwd, !!info.untrusted) : this.setCommandNames(names)),
      onCommandDetails: (details) => { if (!this.deps.probeCatalog) this.setCommandDetails(details); },
      onQuota: (quota) => { this.quota = quota; this.deps.broadcast({ t: 'quota', quota }); this.save(); },
      allowedDirectory: (cwd) => resolveAllowedDirectory(cwd, this.deps.config.roots),
      saveImage: (image) => saveAttachment(attachmentsFolder(this.deps.config.dataDir), image),
      uploadPath: (id) => uploadPath(uploadsFolder(this.deps.config.dataDir), id),
      copyFile: (file) => copyAttachment(attachmentsFolder(this.deps.config.dataDir), file),
      onAttention: (kind, session) => this.deps.onAttention?.(kind, session),
      identity: this.deps.identity,
      claudeSettings: this.deps.claudeSettings,
      peerName: (address) => this.peerName(address),
      liveCount: () => [...this.sessions.values()].filter((session) => session.alive).length,
      maxLive: this.deps.config.maxLive,
      idleMs: this.deps.config.idleMs,
      now: this.deps.now,
      graceMs: this.deps.graceMs,
      runShell: this.deps.runShell,
    });
  }

  /**
   * Who a SendMessage call writes to, for the thread: a session named by Claude Code ("Margot", "app-d6") as is,
   * one of ours answered at its socket by its name, any other socket as "another session" (st.normalizer.recipientUnknown).
   */
  private peerName(address: string): string {
    if (!address.startsWith('uds:') && !address.startsWith('/')) return address;
    return [...this.sessions.values()].find((session) => session.answersAt(address))?.snapshot().name ?? st.normalizer.recipientUnknown;
  }

  // ── read side ──
  /**
   * Compacts, one at a time, the long conversations left alone for Preferences.idleCompact minutes (asked by
   * `idleCompact`, 0 : never), at their desk or resting. Run every minute.
   */
  compactIdle(minutes: number) {
    const sessions = [...this.sessions.values()];
    if (!minutes || this.stopping || sessions.some((session) => session.autoCompacting)) return;
    const now = this.now();
    const due = sessions
      .filter((session) => {
        const info = session.snapshot();
        return (info.context?.used ?? 0) >= IDLE_COMPACT_MIN_TOKENS && now - info.stateSince >= minutes * 60_000 && !info.compacting;
      })
      .sort((a, b) => a.snapshot().stateSince - b.snapshot().stateSince);
    for (const session of due) {
      try {
        if (session.autoCompact(st.prompt.idleCompact)) return;
      } catch (error) {
        // too many live sessions: the next minute tries again
        this.deps.log(`cannot compact ${session.snapshot().name}`, error);
        return;
      }
    }
  }

  /** Releases the waiting sessions whose process runs another Claude Code than `version`; how many were. */
  releaseOutdated(version: string): number {
    return [...this.sessions.values()].filter((session) => {
      const running = session.snapshot().claudeVersion;
      return running !== undefined && running !== version && session.release();
    }).length;
  }

  /** Tells the running sessions about Claude Code settings changed in Open Space; one that refuses keeps its own. */
  async applySettings(changes: Record<string, unknown>) {
    if (!Object.keys(changes).length) return;
    await Promise.all([...this.sessions.values()].map((session) => session.applySettings(changes).catch((error: unknown) => this.deps.log(`cannot apply the Claude Code settings to ${session.snapshot().name}`, error))));
  }

  list(): SessionInfo[] { return [...this.sessions.values()].map((session) => session.snapshot()); }
  getCommands(): SlashCommand[] { return this.commands; }
  getFolderCommands(): Record<string, SlashCommand[]> { return Object.fromEntries(this.folderCommands); }
  getModels(): ModelChoice[] { return this.models; }
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

  /** What a session changed in its files (see changes.ts). */
  changes(id: string): Promise<SessionChanges> {
    const { cwd, conversationId } = this.session(id).snapshot();
    return sessionChanges(cwd, conversationId ?? id, (directory) => resolveAllowedDirectory(directory, this.deps.config.roots) !== null, this.deps.home);
  }

  /** The Claude Code conversations of an allowed folder that are not open here yet. */
  async conversations(directory: string): Promise<Conversation[]> {
    const cwd = resolveAllowedDirectory(directory, this.deps.config.roots);
    if (!cwd) throw new Error(st.sessions.outsideRoots);
    return listConversations(cwd, new Set([...this.sessions.values()].map((session) => session.conversationId)), this.deps.home);
  }

  private session(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error(st.sessions.notFound);
    return session;
  }

  // ── side questions (/btw) ──
  /** Asks a side question about a session's conversation; one at a time per session, a new one replaces the last. */
  aside(id: string, question: string) {
    const info = this.session(id).snapshot();
    if (!this.deps.askAside) throw new Error(st.sessions.claudeMissing);
    const cwd = resolveAllowedDirectory(info.cwd, this.deps.config.roots);
    if (!cwd) throw new Error(st.sessions.folderGone);
    this.asides.get(id)?.stop();
    const entry = { aside: { question, answer: '', state: 'asking' } as Aside, stop: () => {} };
    this.asides.set(id, entry);
    const publish = () => { if (this.asides.get(id) === entry) this.deps.broadcast({ t: 'aside', sessionId: id, aside: entry.aside }); };
    let timer: NodeJS.Timeout | null = null;
    const running = this.deps.askAside({ cwd, sessionId: info.conversationId ?? id, resume: info.resumable, model: info.model, untrusted: info.untrusted, question }, {
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

  /** The threads of every session (what is in memory) searched for `query`. */
  search(query: string): SearchHit[] {
    return searchSessions([...this.logs].map(([id, log]): [string, LoggedEvent[]] => [id, log.since(0).events]), query);
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

  /**
   * The commands of no folder in particular (from the home folder, with the user's settings only), then those of each
   * session folder, one after the other: a probe is a short claude process.
   */
  private async probeAll() {
    if (!this.deps.probeCatalog) return;
    await this.probeFolder(os.homedir(), true, true);
    const folders = new Map([...this.sessions.values()].map((session) => [session.snapshot().cwd, !!session.snapshot().untrusted]));
    for (const [cwd, untrusted] of folders) await this.probeFolder(cwd, untrusted);
  }

  /** Probes a folder unless it is being probed already; `global`: its commands become the commands of no folder. */
  private probeFolder(cwd: string, untrusted: boolean, global = false): Promise<void> {
    const probe = this.deps.probeCatalog;
    const running = this.probes.get(cwd);
    if (!probe || running) return running ?? Promise.resolve();
    const done = probe(cwd, untrusted).then(({ commands, models }) => {
      if (models.length && JSON.stringify(models) !== JSON.stringify(this.models)) {
        this.models = models;
        this.deps.broadcast({ t: 'models', models });
      }
      if (global) {
        this.commands = commands;
        this.deps.broadcast({ t: 'commands', commands });
        this.save();
      } else if (JSON.stringify(commands) !== JSON.stringify(this.folderCommands.get(cwd))) {
        this.folderCommands.set(cwd, commands);
        this.deps.broadcast({ t: 'folderCommands', cwd, commands });
      }
    }).catch((error) => this.deps.log(`cannot probe the commands of ${cwd}`, error)).finally(() => this.probes.delete(cwd));
    this.probes.set(cwd, done);
    return done;
  }

  // ── commands from clients ──
  async create(options: SessionOptions): Promise<SessionInfo> {
    if (this.stopping) throw new Error(st.sessions.stoppingNoCreate);
    if (!this.deps.spawnProcess) throw new Error(st.sessions.claudeMissing);
    const cwd = resolveAllowedDirectory(options.cwd, this.deps.config.roots);
    if (!cwd) throw new Error(st.sessions.outsideRoots);
    // a folder running code of its own (hooks, MCP servers) needs the user's word once (see trust.ts)
    const code = folderCode(cwd);
    const trusted = !runsCode(code) || trustedInClaudeCode(cwd, this.deps.home) || this.trusted.has(cwd);
    if (!trusted && !options.trust) throw new TrustNeeded(cwd, code);
    if (!trusted && options.trust === 'folder') await this.trusted.add(cwd);
    const name = options.name?.trim().slice(0, MAX_NAME) || pickSessionName(new Set([...this.sessions.values()].map((session) => session.snapshot().name)));
    if (options.resumeId && this.sessions.has(options.resumeId)) throw new Error(st.sessions.alreadyOpen);
    // a resumed conversation keeps its id: the session goes on with it through --resume
    const info = newSessionInfo({ id: options.resumeId ?? randomUUID(), name, cwd, model: options.model ?? '', permissionMode: options.permissionMode ?? DEFAULT_PERMISSION_MODE }, this.now());
    if (options.resumeId) info.resumable = true;
    if (options.effort) info.effort = options.effort;
    if (options.ultracode) info.ultracode = true;
    if (!trusted && options.trust === 'restricted') info.untrusted = true;
    const log = await this.openLog(info.id);
    const session = this.createSession(info, log);
    this.logs.set(info.id, log);
    this.sessions.set(info.id, session);
    this.deps.broadcast({ t: 'session', session: session.snapshot() });
    this.save();
    if (!this.folderCommands.has(cwd)) void this.probeFolder(cwd, !!info.untrusted);
    if (options.resumeId) {
      const found = (await listConversations(cwd, new Set(), this.deps.home)).find((conversation) => conversation.id === options.resumeId);
      session.showHistory(found?.title ?? st.sessions.untitledConversation, await lastExchanges(cwd, options.resumeId, 8, this.deps.home));
    }
    if (options.text?.trim() || options.images?.length || options.files?.length) {
      try {
        session.send(options.text ?? '', options.images, options.files);
      } catch (error) {
        await this.forget(info.id);
        throw error;
      }
    }
    return session.snapshot();
  }

  /**
   * A new session that goes on from `id`'s conversation as it is now, in the same folder and with the same settings,
   * under another name (`name`, or someone free): the original carries on its own. It waits for a message.
   */
  async duplicate(id: string, name?: string): Promise<SessionInfo> {
    if (this.stopping) throw new Error(st.sessions.stoppingNoCreate);
    const source = this.session(id).snapshot();
    if (!source.resumable) throw new Error(st.sessions.nothingToDuplicate);
    const conversation = source.conversationId ?? source.id;
    const taken = new Set([...this.sessions.values()].map((session) => session.snapshot().name));
    const info = newSessionInfo({ id: randomUUID(), name: name && !taken.has(name) ? name : pickSessionName(taken), cwd: source.cwd, model: source.model, permissionMode: source.permissionMode }, this.now());
    Object.assign(info, {
      forkOf: conversation, introducedAs: source.introducedAs ?? source.name, context: source.context,
      ...(source.effort ? { effort: source.effort } : {}), ...(source.ultracode ? { ultracode: true } : {}), ...(source.untrusted ? { untrusted: true } : {}), ...(source.tag ? { tag: source.tag } : {}),
    });
    const log = await this.openLog(info.id);
    const session = this.createSession(info, log);
    this.logs.set(info.id, log);
    this.sessions.set(info.id, session);
    this.deps.broadcast({ t: 'session', session: session.snapshot() });
    this.save();
    session.showHistory(st.sessions.duplicateOf(source.name), await lastExchanges(source.cwd, conversation, 8, this.deps.home));
    return session.snapshot();
  }

  send(id: string, text: string, images?: readonly ImageUpload[], files?: readonly string[]) { this.session(id).send(text, images, files); }
  answer(id: string, requestId: string, decision: PermissionDecision) { this.session(id).answer(requestId, decision); }
  reply(id: string, requestId: string, answers: Record<string, string>) { this.session(id).reply(requestId, answers); }
  interrupt(id: string) { this.session(id).interrupt(); }
  unqueue(id: string, queueId: string) { this.session(id).unqueue(queueId); }
  sendNow(id: string) { this.session(id).sendNow(); }
  close(id: string) { return this.session(id).close(); }
  tune(id: string, change: TuneChange) { return this.session(id).tune(change); }

  rename(id: string, name: string) {
    const clean = name.trim();
    if (!clean) throw new Error(st.sessions.emptyName);
    this.session(id).rename(clean);
  }

  tag(id: string, tag: string) { this.session(id).setTag(tag); }
  rest(id: string) { return this.session(id).rest(); }
  remoteControl(id: string, enabled: boolean) { return this.session(id).setRemote(enabled); }
  inspect(id: string, view: InspectView) { return this.session(id).inspect(view); }
  shell(id: string, command: string) { return this.session(id).shell(command); }
  stopShell(id: string, shellId: string) { this.session(id).stopShell(shellId); }
  mcpAction(id: string, server: string, action: McpAction) { return this.session(id).mcpAction(server, action); }

  /** Removes a session (closed first if it runs) and its log. Claude Code's own transcript is not touched. */
  async forget(id: string) {
    const session = this.session(id);
    if (session.alive) await session.close();
    else await session.stopShells();
    this.closeAside(id);
    this.sessions.delete(id);
    const log = this.logs.get(id);
    this.logs.delete(id);
    await log?.close();
    await rm(path.join(this.logsDir, `${id}.jsonl`), { force: true });
    this.deps.broadcast({ t: 'forgotten', sessionId: id });
    this.save();
    this.sweep();
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
    super(st.sessions.trustNeeded);
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
    effort: (EFFORTS as readonly unknown[]).includes(raw.effort) ? raw.effort as Effort : undefined,
    ultracode: raw.ultracode === true || undefined,
    // sessions saved before the mode was selectable were all launched in manual mode
    permissionMode: isPermissionMode(raw.permissionMode) ? raw.permissionMode : 'manual',
    introducedAs: asString(raw.introducedAs) || undefined,
    forkOf: /^[\w-]{1,100}$/.test(asString(raw.forkOf)) ? asString(raw.forkOf) : undefined,
    quietFrom: typeof raw.quietFrom === 'number' && Number.isInteger(raw.quietFrom) && raw.quietFrom >= 0 ? raw.quietFrom : undefined,
    conversationId: /^[\w-]{1,100}$/.test(asString(raw.conversationId)) ? asString(raw.conversationId) : undefined,
    context: isJson(raw.context) && asNumber(raw.context.max) > 0 ? { used: asNumber(raw.context.used), max: asNumber(raw.context.max) } : undefined,
    tag: asString(raw.tag).slice(0, MAX_TAG) || undefined,
    resting: raw.resting === true || undefined,
    remoteSession: /^cse_\w{1,100}$/.test(asString(raw.remoteSession)) ? asString(raw.remoteSession) : undefined,
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
