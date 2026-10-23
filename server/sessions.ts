// The collection of sessions: creation (with the folder and option checks), persistence across restarts,
// the slash command cache, and a clean shutdown of every process.
//
// On disk (OFFICE_DIR):  sessions.json  (the list, rewritten atomically)   logs/<session id>.jsonl  (one event per line)
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PERMISSION_MODE, EFFORTS, isPermissionMode, type Conversation, type ImageUpload, type LoggedEvent, type PermissionDecision, type SearchHit, type Quota, type ServerMessage, type SessionInfo, type SessionOptions, type SlashCommand, type Effort, type ModelChoice, type TuneChange } from '../shared/protocol.ts';
import { attachmentsFolder, bundlePage, copyAttachment, saveAttachment, sweepAttachments } from './attachments.ts';
import { sweepUploads, uploadPath, uploadsFolder } from './uploads.ts';
import { TrustedFolders, folderCode, runsCode, trustedInClaudeCode } from './trust.ts';
import type { ShellRunner } from './shell.ts';
import { findMentions } from '../shared/mentions.ts';
import type { Aside, BranchRow, CleanedBranch, FolderCode, FolderRepo, InspectView, McpAction, MergeProblem, SessionChanges, WorktreeInfo } from '../shared/protocol.ts';
import type { AsideRunner } from './aside.ts';
import type { CatalogProbe, LaunchOptions, ProcessFactory } from './claude-process.ts';
import type { Config } from './config.ts';
import { lastContextUse, lastExchanges, listConversations } from './conversations.ts';
import { st } from './i18n/index.ts';
import { asArray, asJson, asNumber, asString, isJson } from './json.ts';
import { MAX_NAME, MAX_TAG } from './messages.ts';
import { pickSessionName } from './names.ts';
import { sessionChanges } from './changes.ts';
import { listProjectDirectories, resolveAllowedDirectory } from './paths.ts';
import { Session, newSessionInfo, type SessionDeps, type StoredInfo, type TurnEnd } from './session.ts';
import { SessionLog } from './session-log.ts';
import { searchSessions } from './search.ts';
import {
  branchStatus, canOpenPullRequest, checkOnBranch, commitWork, copyIncluded, createWorktree, deleteBranch, dropBranch, folderRepo, keptBranchOf, landBranch,
  listBranches, moveConversation, recreateWorktree, removeWorktree, setBranchNote,
} from './worktrees.ts';

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
  onSubagentStopped?: (sessionId: string, type: string) => void;
  /** the user's first name and their note for every agent */
  identity?: SessionDeps['identity'];
  claudeSettings?: SessionDeps['claudeSettings'];
  /** asks a side question (/btw); null when Claude Code is not installed */
  askAside?: AsideRunner | null;
  /** runs a command typed with "!" (see shell.ts) */
  runShell?: ShellRunner;
  /** asks Claude Code for a folder's commands and the models (see createCatalogProbe); without it, the commands come from the sessions' init */
  probeCatalog?: CatalogProbe | null;
  /** the --mcp-config and --agents that give a session and its testers the browsers Open Space shows (see server/browser.ts) */
  browserMcp?: (sessionId: string) => Pick<LaunchOptions, 'mcpConfig' | 'agents'>;
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
    await this.checkWorktrees();
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

  /**
   * A session whose worktree was removed while Open Space was not running (by hand, by another tool) goes back to the
   * main checkout, with its conversation, and says so.
   */
  private async checkWorktrees() {
    for (const session of this.sessions.values()) await this.rehome(session);
  }

  /** An isolated session whose worktree's folder is gone goes back to the main checkout (true when it did). */
  private async rehome(session: Session): Promise<boolean> {
    const info = session.snapshot();
    if (!info.worktree || existsSync(info.worktree.root) || session.alive || session.isPreparing) return false;
    await moveConversation(info.cwd, info.worktree.home, this.conversationIds(info), this.deps.home).catch((error) => this.deps.log(`cannot move the conversation of ${info.name}`, error));
    session.relocate(info.worktree.home, undefined);
    session.announce({ k: 'note', text: st.worktree.folderGone(info.worktree.branch, path.basename(info.worktree.home)) });
    return true;
  }

  /** The Claude Code conversations a session has written: its own id, and the one it goes on with after a /clear. */
  private conversationIds(info: SessionInfo) { return [info.id, info.conversationId ?? info.id]; }

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

  /**
   * The other sessions a message of `sessionId` names with "@": each woken up (a released process cannot be reached)
   * and introduced to Claude, with how to write to it ('' : none named).
   */
  private introduceMentioned(sessionId: string, text: string): string {
    const others = [...this.sessions.values()].map((session) => ({ session, info: session.snapshot() })).filter(({ info }) => info.id !== sessionId);
    const named = new Set(findMentions(text, others.map(({ info }) => info.name)).map((mention) => mention.name));
    const found = others.filter(({ info }) => named.has(info.name));
    for (const { session } of found) session.wake();
    return found.map(({ info }) => st.prompt.mention(info.name, info.cwd.replace(os.homedir(), '~'))).join('\n');
  }

  private createSession(info: StoredInfo, log: SessionLog): Session {
    return new Session(info, {
      spawnProcess: (launch, handlers) => {
        if (this.stopping) throw new Error(st.sessions.stoppingNoStart);
        if (!this.deps.spawnProcess) throw new Error(st.sessions.claudeMissing);
        return this.deps.spawnProcess({ ...launch, addDirs: [uploadsFolder(this.deps.config.dataDir)], ...this.deps.browserMcp?.(info.id) }, handlers);
      },
      log,
      broadcast: this.deps.broadcast,
      persist: () => this.save(),
      mentioned: (text) => this.introduceMentioned(info.id, text),
      // a process started: the folder's commands may have changed since they were probed (a skill added)
      onInitCommands: (names) => (this.deps.probeCatalog ? void this.probeFolder(info.cwd, !!info.untrusted) : this.setCommandNames(names)),
      onCommandDetails: (details) => { if (!this.deps.probeCatalog) this.setCommandDetails(details); },
      onQuota: (quota) => { this.quota = quota; this.deps.broadcast({ t: 'quota', quota }); this.save(); },
      allowedDirectory: (cwd) => resolveAllowedDirectory(cwd, this.deps.config.roots),
      saveImage: (image) => saveAttachment(attachmentsFolder(this.deps.config.dataDir), image),
      uploadPath: (id) => uploadPath(uploadsFolder(this.deps.config.dataDir), id),
      copyFile: (file) => copyAttachment(attachmentsFolder(this.deps.config.dataDir), file),
      bundlePage: (page, files) => bundlePage(attachmentsFolder(this.deps.config.dataDir), page, files),
      onAttention: (kind, session) => this.deps.onAttention?.(kind, session),
      onSubagentStopped: (type) => this.deps.onSubagentStopped?.(info.id, type),
      identity: this.deps.identity,
      claudeSettings: this.deps.claudeSettings,
      peerName: (address) => this.peerName(address),
      liveCount: () => [...this.sessions.values()].filter((session) => session.alive).length,
      maxLive: this.deps.config.maxLive,
      idleMs: this.deps.config.idleMs,
      now: this.deps.now,
      graceMs: this.deps.graceMs,
      runShell: this.deps.runShell,
      onTurnEnd: (session, how) => this.onTurnEnd(session.id, how),
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

  /** the session has a Claude Code process running */
  isAlive(sessionId: string): boolean { return !!this.sessions.get(sessionId)?.alive; }
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
  /** The folder a session works in, or null when there is no such session. */
  folderOf(id: string): string | null { return this.sessions.get(id)?.snapshot().cwd ?? null; }
  directories(): string[] { return listProjectDirectories(this.deps.config.roots); }

  /** What a session changed in its files (see changes.ts). */
  changes(id: string): Promise<SessionChanges> {
    const { cwd, conversationId, worktree } = this.session(id).snapshot();
    return sessionChanges(cwd, conversationId ?? id, (directory) => resolveAllowedDirectory(directory, this.deps.config.roots) !== null, this.deps.home, worktree?.base);
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
    // a folder running code of its own (hooks, MCP servers, settings) needs the user's word once (see trust.ts)
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
    // on a branch of its own: the worktree is made while the first message waits in the queue; a conversation that
    // was switched off with its branch kept gets that branch's worktree back
    const repo = options.isolate || options.resumeId ? await folderRepo(cwd).catch(() => null) : null;
    const kept = options.resumeId && repo ? await keptBranchOf(repo.root, options.resumeId).catch(() => null) : null;
    if (options.isolate || kept) session.startPreparing(st.worktree.preparing);
    if (options.text?.trim() || options.images?.length || options.files?.length) {
      try {
        session.send(options.text ?? '', options.images, options.files);
      } catch (error) {
        await this.forget(info.id);
        throw error;
      }
    }
    if (kept && repo) void this.reviveWorktree(info.id, repo, kept.branch, kept.note.base);
    else if (options.isolate) void this.prepareWorktree(info.id, cwd, repo, options.isolate.base, options.text ?? '');
    return session.snapshot();
  }

  // ── worktrees: a branch and a folder of its own per session (server/worktrees.ts) ──
  /** Makes the worktree of a new isolated session, then lets its first message go; on failure it stays in the main checkout, its message queued. */
  private async prepareWorktree(id: string, cwd: string, repo: Omit<FolderRepo, 'merged'> | null, asked: string | undefined, about: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    const info = session.snapshot();
    try {
      if (!repo) throw new Error(st.worktree.notRepo);
      this.checkRepoAllowed(repo);
      const base = asked || repo.branch;
      if (!base) throw new Error(repo.branches.length ? st.worktree.noBase : st.worktree.noCommit);
      if (!repo.branches.includes(base)) throw new Error(st.worktree.unknownBase(base));
      const made = await createWorktree({ mainRoot: repo.root, name: info.name, about: info.tag || about, base, note: { name: info.name, sub: repo.sub, conversation: info.id } });
      await this.settleWorktree(session, repo, made.root, made.branch, base, cwd);
    } catch (error) {
      session.announce({ k: 'note', text: st.worktree.prepareFailed(error instanceof Error ? error.message : String(error), info.name, path.basename(cwd)) });
      session.finishPreparing(false);
    }
  }

  /** A kept branch resumed: its worktree again, and the conversation moved there. */
  private async reviveWorktree(id: string, repo: Omit<FolderRepo, 'merged'>, branch: string, base: string | undefined) {
    const session = this.sessions.get(id);
    if (!session) return;
    const info = session.snapshot();
    try {
      this.checkRepoAllowed(repo);
      const root = await recreateWorktree(repo.root, branch);
      session.announce({ k: 'note', text: st.worktree.revived(branch) });
      await this.settleWorktree(session, repo, root, branch, base || repo.branch, info.cwd);
    } catch (error) {
      session.announce({ k: 'note', text: st.worktree.prepareFailed(error instanceof Error ? error.message : String(error), info.name, path.basename(info.cwd)) });
      session.finishPreparing(false);
    }
  }

  /** A worktree goes where the repository is: outside the allowed folders, no process could start there. */
  private checkRepoAllowed(repo: Pick<FolderRepo, 'root'>) {
    if (!resolveAllowedDirectory(repo.root, this.deps.config.roots)) throw new Error(st.worktree.outsideRoots(repo.root));
  }

  /** The worktree is there: what git does not carry is copied, the session moves in, and its queue leaves. */
  private async settleWorktree(session: Session, repo: Omit<FolderRepo, 'merged'>, root: string, branch: string, base: string, home: string) {
    const copied = await copyIncluded(repo.root, root).catch(() => ({ copied: 0, failed: 1, skipped: false }));
    // switched off while its folder was made: the folder goes, and the branch too when it holds nothing of its own
    if (this.sessions.get(session.id) !== session) {
      await removeWorktree(repo.root, root, false).catch((error) => this.deps.log(`cannot remove the worktree ${root}`, error));
      await deleteBranch(repo.root, branch, base).catch((error) => this.deps.log(`cannot delete the branch ${branch}`, error));
      return;
    }
    if (copied.failed || copied.skipped) session.announce({ k: 'note', text: st.worktree.notCopied(session.snapshot().name) });
    const worktree: WorktreeInfo = { branch, base, root, mainRoot: repo.root, home, canPr: await canOpenPullRequest(repo.root).catch(() => false) };
    const inside = path.join(root, repo.sub);
    const cwd = existsSync(inside) ? inside : root;
    // the user agreed to what the main folder runs (trust.ts), not to hooks, MCP servers or settings only the branch has
    const info = session.snapshot();
    const code = (folder: string) => { const { hooks, mcpServers, settings } = folderCode(folder); return JSON.stringify({ hooks, mcpServers, settings }); };
    if (!info.untrusted && runsCode(folderCode(cwd)) && code(cwd) !== code(home) && !this.trusted.has(cwd) && !trustedInClaudeCode(cwd, this.deps.home)) {
      session.restrict();
      session.announce({ k: 'note', text: st.worktree.restricted(info.name) });
    }
    // a conversation that goes on (resumed) is looked for by its folder: its transcripts follow it
    if (info.resumable) await moveConversation(info.cwd, cwd, this.conversationIds(info), this.deps.home).catch((error) => this.deps.log(`cannot move the conversation of ${info.name}`, error));
    session.relocate(cwd, worktree);
    session.finishPreparing(true);
    if (!this.folderCommands.has(session.snapshot().cwd)) void this.probeFolder(session.snapshot().cwd, !!session.snapshot().untrusted);
    await this.refreshBranch(session.id);
  }

  /** Looks at what an isolated session's branch holds again (after each turn, after a change), for its card. */
  async refreshBranch(id: string) {
    const session = this.sessions.get(id);
    const worktree = session?.snapshot().worktree;
    if (!session || !worktree) return;
    // its folder removed by hand while Open Space runs: back to the main checkout, as at startup
    if (await this.rehome(session)) return;
    const status = await branchStatus(worktree.root, worktree.base).catch(() => null);
    // a remote may have been added since
    const canPr = await canOpenPullRequest(worktree.mainRoot).catch(() => false);
    // read again: a merge may have started or ended meanwhile
    const now = session.snapshot().worktree;
    if (status && now && now.root === worktree.root) session.setWorktree({ ...now, status, ...(canPr ? { canPr } : { canPr: undefined }) });
  }

  /** A turn of an isolated session is over: the merge it was asked for is checked and done, or its branch looked at again. */
  private onTurnEnd(id: string, how: TurnEnd) {
    const session = this.sessions.get(id);
    const worktree = session?.snapshot().worktree;
    if (!session || !worktree) return;
    if (worktree.merge?.step === 'asked') {
      if (how === 'done') { void this.completeMerge(id); return; }
      // stopped by the user: no merge, the card comes back; ended on an error or gone: the card says so, with Try again
      session.setWorktree({ ...worktree, merge: how === 'interrupted' ? undefined : { step: 'failed', problem: { kind: 'stopped' }, ...(worktree.merge.thenOff ? { thenOff: true } : {}) } });
    }
    void this.refreshBranch(id);
  }

  private isBusy(info: SessionInfo) { return info.state === 'starting' || info.state === 'work' || info.state === 'perm' || !!info.background; }

  private isolated(id: string): { session: Session; info: SessionInfo; worktree: WorktreeInfo } {
    const session = this.session(id);
    const info = session.snapshot();
    if (!info.worktree) throw new Error(st.worktree.notIsolated);
    return { session, info, worktree: info.worktree };
  }

  /** At work, its folder being made or moved, or a merge under way: what touches its branch waits. */
  private checkFree(session: Session) {
    const info = session.snapshot();
    if (this.isBusy(info) || session.isPreparing || info.worktree?.merge?.step === 'asked') throw new Error(st.worktree.waitTurn(info.name));
  }

  /**
   * Merges an isolated session's branch into its base: the session is asked to squash its work into one commit, catch
   * up with the base and settle the conflicts; at the end of that turn Open Space checks and fast-forwards the base
   * (completeMerge). `thenOff`: switched off once merged.
   */
  async mergeBranch(id: string, thenOff = false): Promise<void> {
    const { session, worktree } = this.isolated(id);
    this.checkFree(session);
    const status = await branchStatus(worktree.root, worktree.base);
    // read again: another click (another tab) may have asked meanwhile
    this.checkFree(session);
    const now = session.snapshot().worktree;
    if (!now || now.root !== worktree.root) throw new Error(st.worktree.notIsolated);
    if (!status.ahead && !status.dirty) {
      if (thenOff) return this.forget(id);
      // nothing left to merge (a merge cut by a restart after the base moved): a failed card goes
      session.setWorktree({ ...now, status, merge: undefined });
      throw new Error(st.worktree.nothingToMerge);
    }
    session.setWorktree({ ...now, status, merge: { step: 'asked', retried: false, ...(thenOff ? { thenOff: true } : {}) } });
    try {
      session.instruct(st.prompt.merge(worktree), st.worktree.mergeBubble(worktree.base));
    } catch (error) {
      session.setWorktree({ ...now, status });
      throw error;
    }
    // after the user's line: the thread reads "merge into main", then why the session catches up first
    if (status.behind) session.announce({ k: 'branch', what: 'moved', branch: worktree.branch, base: worktree.base, behind: status.behind });
  }

  /** The session did its part of a merge: the checks, then the base moves; a base that moved meanwhile is caught up once more. */
  private async completeMerge(id: string) {
    const session = this.sessions.get(id);
    const worktree = session?.snapshot().worktree;
    if (!session || worktree?.merge?.step !== 'asked' || session.isPreparing) return;
    const { merge } = worktree;
    // nothing starts in the worktree, nothing else touches the branch, until it is landed and left
    session.hold();
    const outcome = await landBranch({ mainRoot: worktree.mainRoot, worktreeRoot: worktree.root, branch: worktree.branch, base: worktree.base });
    const thenOff = merge.thenOff ? { thenOff: true as const } : {};
    const fail = (problem: MergeProblem) => { session.setWorktree({ ...worktree, merge: { step: 'failed', problem, ...thenOff } }); void this.refreshBranch(id); };
    if (!outcome.ok) {
      session.finishPreparing(true);
      if (outcome.problem.kind === 'behind' && !merge.retried) {
        const status = await branchStatus(worktree.root, worktree.base).catch(() => null);
        session.announce({ k: 'branch', what: 'moved', branch: worktree.branch, base: worktree.base, ...(status?.behind ? { behind: status.behind } : {}) });
        session.setWorktree({ ...worktree, merge: { step: 'asked', retried: true, ...thenOff } });
        try {
          session.instruct(st.prompt.catchUp(worktree.base), st.worktree.catchUpBubble(worktree.base));
        } catch {
          fail(outcome.problem);
        }
        return;
      }
      fail(outcome.problem);
      return;
    }
    try {
      await this.moveOut(session, 'merged');
    } catch (error) {
      fail({ kind: 'git', text: error instanceof Error ? error.message : String(error) });
      return;
    } finally {
      session.finishPreparing(!merge.thenOff);
    }
    if (merge.thenOff) await this.forget(id);
  }

  /** Puts a failed merge aside: the card goes back to what the branch holds. */
  dismissMerge(id: string) {
    const { session, worktree } = this.isolated(id);
    if (worktree.merge?.step === 'failed') session.setWorktree({ ...worktree, merge: undefined });
  }

  /** Asks an isolated session to push its branch and open a pull request into its base. */
  pullRequest(id: string) {
    const { session, worktree } = this.isolated(id);
    this.checkFree(session);
    session.instruct(st.prompt.pullRequest(worktree), st.worktree.prBubble(worktree.base));
  }

  /** Throws an isolated session's branch away, with its folder: the session goes on in the main checkout. */
  async discardBranch(id: string) {
    const { session } = this.isolated(id);
    this.checkFree(session);
    await this.leaveWorktree(session, 'discarded');
  }

  /** moveOut, with nothing starting in the worktree meanwhile, and nothing else touching the branch. */
  private async leaveWorktree(session: Session, what: 'discarded' | 'cleaned') {
    if (session.isPreparing) throw new Error(st.worktree.waitTurn(session.snapshot().name));
    session.hold();
    try {
      await this.moveOut(session, what);
    } finally {
      session.finishPreparing(true);
    }
  }

  /**
   * An isolated session leaves its worktree for the main checkout, its process stopped first: merged (the folder
   * removed, the branch deleted only when all of it is in the base), thrown away or cleaned (removed whatever they
   * hold). Once the folder is gone, the session moves home whatever else fails; its conversation's transcripts move
   * with it.
   */
  private async moveOut(session: Session, what: 'merged' | 'discarded' | 'cleaned') {
    const info = session.snapshot();
    const worktree = info.worktree;
    if (!worktree) return;
    await session.stopForMove();
    await removeWorktree(worktree.mainRoot, worktree.root, what !== 'merged');
    await deleteBranch(worktree.mainRoot, worktree.branch, what === 'merged' ? worktree.base : undefined)
      .then((deleted) => { if (!deleted) this.deps.log(`kept the branch ${worktree.branch}: it has commits that are not in ${worktree.base}`); })
      .catch((error) => this.deps.log(`cannot delete the branch ${worktree.branch}`, error));
    await moveConversation(info.cwd, worktree.home, this.conversationIds(info), this.deps.home).catch((error) => this.deps.log(`cannot move the conversation of ${info.name}`, error));
    session.relocate(worktree.home, undefined);
    session.announce({ k: 'branch', what, branch: worktree.branch, base: worktree.base });
  }

  /** Whether a folder is in a git repository, its branches, its uncommitted files, and how many branches are left to tidy. */
  async folderInfo(directory: string): Promise<FolderRepo | null> {
    const cwd = resolveAllowedDirectory(directory, this.deps.config.roots);
    if (!cwd) return null;
    const repo = await folderRepo(cwd).catch(() => null);
    // a repository that starts above the allowed folders cannot have its worktrees there: no branch is offered
    if (!repo || !resolveAllowedDirectory(repo.root, this.deps.config.roots)) return null;
    const rows = await listBranches(repo.root).catch(() => [] as BranchRow[]);
    return { ...repo, merged: rows.filter((row) => row.merged && !row.inUse && !this.sessionOn(repo.root, row)).length };
  }

  /** The session working on a branch of the cleaning panel, if one does. */
  private sessionOn(mainRoot: string, row: { branch: string; folder: string | null }): Session | undefined {
    return [...this.sessions.values()].find((session) => {
      const worktree = session.snapshot().worktree;
      return !!worktree && worktree.mainRoot === mainRoot && ((row.folder !== null && worktree.root === row.folder) || (!!row.branch && worktree.branch === row.branch));
    });
  }

  /** The branches of a folder's repository, for the cleaning panel. */
  async branches(directory: string): Promise<{ root: string; branches: BranchRow[] }> {
    const cwd = resolveAllowedDirectory(directory, this.deps.config.roots);
    if (!cwd) throw new Error(st.sessions.outsideRoots);
    const repo = await folderRepo(cwd);
    if (!repo) return { root: '', branches: [] };
    return { root: repo.root, branches: await listBranches(repo.root) };
  }

  /**
   * Removes branches of a folder's repository and their worktrees, as the user checked them. One a session is working
   * on, one still in use (a terminal's Claude Code), and one that got work since the page showed it are left alone; one
   * a session waits or rests on takes it back to the main checkout. Returns the branches that could not go.
   */
  async cleanBranches(directory: string, chosen: readonly CleanedBranch[]): Promise<string[]> {
    const cwd = resolveAllowedDirectory(directory, this.deps.config.roots);
    if (!cwd) throw new Error(st.sessions.outsideRoots);
    const repo = await folderRepo(cwd);
    if (!repo) return [];
    const rows = await listBranches(repo.root);
    const failed: string[] = [];
    for (const wanted of chosen) {
      const row = rows.find((candidate) => candidate.branch === wanted.branch && candidate.folder === wanted.folder);
      if (!row) continue;
      const session = this.sessionOn(repo.root, row);
      // what the user agreed to lose is what they saw: new commits or more changes since are not part of it
      const changed = !row.merged && (row.head !== wanted.head || row.dirty > wanted.dirty);
      try {
        if (row.inUse || changed || (session && (this.isBusy(session.snapshot()) || session.isPreparing))) { failed.push(row.branch || row.folder || ''); continue; }
        if (session) await this.leaveWorktree(session, 'cleaned');
        else await dropBranch(repo.root, row);
      } catch (error) {
        this.deps.log(`cannot clean ${row.branch || row.folder}`, error);
        failed.push(row.branch || row.folder || '');
      }
    }
    return failed;
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

  send(id: string, text: string, images?: readonly ImageUpload[], files?: readonly string[]) {
    const session = this.session(id);
    // writing to the session again moves on from a failed merge: its card would stay over the new work
    const worktree = session.snapshot().worktree;
    if (worktree?.merge?.step === 'failed') session.setWorktree({ ...worktree, merge: undefined });
    session.send(text, images, files);
  }
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

  /**
   * Removes a session (closed first if it runs) and its log. Claude Code's own transcript is not touched. One on a
   * branch of its own never loses its work silently: `branch` says what becomes of it (merged first, kept without its
   * folder, thrown away); without a word, a branch with work is kept, one without is removed. When its branch cannot be
   * put away safely, nothing is removed and the session stays (the error says why).
   */
  async forget(id: string, branch?: 'merge' | 'keep' | 'discard'): Promise<void> {
    const session = this.session(id);
    const worktree = session.snapshot().worktree;
    if (worktree && branch === 'merge') return this.mergeBranch(id, true);
    if (worktree) {
      if (session.isPreparing) throw new Error(st.worktree.waitTurn(session.snapshot().name));
      // nothing may start in the worktree while it is put away
      session.hold();
    }
    try {
      if (session.alive) await session.close();
      else await session.stopShells();
      if (worktree) await this.switchOffBranch(session, worktree, branch === 'discard');
    } catch (error) {
      if (worktree) session.finishPreparing(false);
      throw error;
    }
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

  /**
   * What becomes of a switched off session's branch: thrown away when asked; kept when it holds work (what is left
   * committed as "wip", the folder removed); else removed. Throws, removing nothing, when that cannot be done safely.
   */
  private async switchOffBranch(session: Session, worktree: WorktreeInfo, discard: boolean) {
    const info = session.snapshot();
    const { mainRoot, root, branch, base } = worktree;
    try {
      if (discard) {
        await dropBranch(mainRoot, { branch, folder: root });
      } else if (!existsSync(root)) {
        // its folder went (by hand): what was committed stays on the branch, and git forgets the folder
        await setBranchNote(mainRoot, branch, { name: info.name, conversation: info.conversationId ?? info.id, base });
        await removeWorktree(mainRoot, root, true);
      } else {
        // what is not on the branch (a detached HEAD, a rebase under way) would go with the folder
        await checkOnBranch(root, branch);
        const status = await branchStatus(root, base).catch(() => null);
        // what cannot be read is kept, rather than lost
        if (!status || status.ahead > 0 || status.dirty > 0) {
          await commitWork(root, info.name);
          await setBranchNote(mainRoot, branch, { name: info.name, conversation: info.conversationId ?? info.id, base });
          await removeWorktree(mainRoot, root, true);
        } else {
          await dropBranch(mainRoot, { branch, folder: root }, base);
        }
      }
    } catch (error) {
      this.deps.log(`cannot put away the branch of ${info.name}`, error);
      throw new Error(st.worktree.putAwayFailed(info.name, error instanceof Error ? error.message : String(error)));
    }
    await moveConversation(info.cwd, worktree.home, this.conversationIds(info), this.deps.home).catch((error) => this.deps.log(`cannot move the conversation of ${info.name}`, error));
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
    worktree: parseWorktree(raw.worktree),
    toldPlace: asString(raw.toldPlace) || undefined,
    // fields of older versions (restricted, permissions, lastSeq) are ignored: they are not stored any more, or recomputed
    stateSince: asNumber(raw.stateSince), createdAt: asNumber(raw.createdAt), turns: asNumber(raw.turns),
    subagents: [], command: asString(raw.command), lastMessage: asString(raw.lastMessage), error: asString(raw.error) || undefined, resumable: raw.resumable === true,
  };
}

const MERGE_PROBLEMS: ReadonlySet<string> = new Set(['dirty', 'behind', 'overlap', 'elsewhere', 'git', 'stopped']);

/** A saved session's worktree; a merge that was asked when the server stopped is told as stopped (its turn was cut). */
function parseWorktree(raw: unknown): WorktreeInfo | undefined {
  if (!isJson(raw)) return undefined;
  const [branch, base, root, mainRoot, home] = [raw.branch, raw.base, raw.root, raw.mainRoot, raw.home].map((value) => asString(value));
  if (!branch || !base || !path.isAbsolute(root) || !path.isAbsolute(mainRoot) || !path.isAbsolute(home)) return undefined;
  const status = isJson(raw.status) ? {
    ahead: asNumber(raw.status.ahead), behind: asNumber(raw.status.behind), files: asNumber(raw.status.files), dirty: asNumber(raw.status.dirty), head: asString(raw.status.head),
  } : undefined;
  const merge = isJson(raw.merge) ? raw.merge : null;
  const thenOff = merge?.thenOff === true ? { thenOff: true as const } : {};
  const problem = merge && isJson(merge.problem) && MERGE_PROBLEMS.has(asString(merge.problem.kind)) ? merge.problem as MergeProblem : { kind: 'stopped' as const };
  return {
    branch, base, root, mainRoot, home, ...(status ? { status } : {}), ...(raw.canPr === true ? { canPr: true } : {}),
    ...(merge ? { merge: { step: 'failed' as const, problem: merge.step === 'failed' ? problem : { kind: 'stopped' as const }, ...thenOff } } : {}),
  };
}

function parseQueue(raw: unknown): SessionInfo['queued'] {
  if (!Array.isArray(raw)) return undefined;
  const queued = raw.flatMap((item) => (isJson(item) && asString(item.id) && asString(item.text) ? [{ id: asString(item.id), text: asString(item.text) }] : []));
  return queued.length ? queued : undefined;
}
