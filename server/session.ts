// One session = one conversation with Claude Code in one folder. It owns the claude process (started when
// a message needs it, released when idle), the event log, the state machine and the requests waiting for
// the user; everything it does is published as events with a sequence number.
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';
import { tail } from '../shared/activity.ts';
import type { ClaudeSettings } from '../shared/claude-settings.ts';
import type { AttentionKind, BackgroundTask, ImageUpload, Inspection, InspectView, McpAction, OfficeEvent, PermissionDecision, PermissionPrompt, Quota, RemoteControl, ServerMessage, SessionInfo, SlashCommand, SessionState, TuneChange, WorktreeInfo } from '../shared/protocol.ts';
import { VIDEO_EXTENSIONS } from './attachments.ts';
import { placeNote, renameNote, secretsNote, sharedBrowserNote, type ProcessFactory, type ProcessHandle } from './claude-process.ts';
import { agentLaunch } from './conversations.ts';
import { st } from './i18n/index.ts';
import { asString, type Json } from './json.ts';
import { parseContextUsage, parseMcpServers, parseUsageReport } from './inspect.ts';
import type { ShellRunner } from './shell.ts';
import { Normalizer, describeRequest, type InitInfo, type ScheduleChange, type ToolRequest, type TurnResult } from './normalizer.ts';
import { applySchedule, noSchedules, pendingSchedules, scheduledUntil, type Schedules } from './schedules.ts';
import type { SessionLog } from './session-log.ts';
import { initialContext, reduce, type MachineContext, type MachineInput } from './session-state.ts';

export interface SessionDeps {
  spawnProcess: ProcessFactory;
  log: SessionLog;
  broadcast: (message: ServerMessage) => void;
  /** save sessions.json soon */
  persist: () => void;
  onInitCommands: (names: string[]) => void;
  onCommandDetails: (commands: SlashCommand[]) => void;
  onQuota: (quota: Quota) => void;
  /** the real path of the working directory if it is still allowed, otherwise null */
  allowedDirectory: (cwd: string) => string | null;
  /** the session now waits for the user (a turn ended, a permission or a question, an error) */
  onAttention?: (kind: AttentionKind, session: SessionInfo) => void;
  /** a sub-agent is done, its task finished or stopped (`type`: its subagent_type) */
  onSubagentLeft?: (type: string) => void;
  /** whether the session's process gets the shared browser (server/shared-browser.ts) */
  sharedBrowser?: () => boolean;
  /** the names of the keys the user gave it (server/secrets.ts); absent without os-secret */
  secretNames?: () => string[];
  /** stores a picture sent by the user and returns its name (see attachments.ts) */
  saveImage: (image: ImageUpload) => string;
  /** where a file the user uploaded is (see uploads.ts), or null */
  uploadPath?: (id: string) => string | null;
  /** keeps a copy of a file Claude sent; its stored name, or null (see attachments.ts) */
  copyFile?: (path: string) => string | null;
  /** keeps a copy of the files a published page loads, by the path it names them with; the stored bundle's name, or null (see attachments.ts) */
  bundlePage?: (page: string, files: Readonly<Record<string, string>>) => string | null;
  /** how many claude processes are alive across all sessions */
  liveCount: () => number;
  maxLive: number;
  idleMs: number;
  /** who the other sessions named in a message by "@" are, for Claude, woken up to be reached ('' : none named) */
  mentioned?: (text: string) => string;
  /** the user's first name and the note for every new agent (Preferences.agentNote), read when a conversation starts */
  identity?: () => { user: string; note: string };
  /** the Claude Code settings chosen for Open Space's sessions (Preferences.claude), read at each launch */
  claudeSettings?: () => ClaudeSettings;
  /** the name of the session a SendMessage call goes to (see Normalizer) */
  peerName?: (address: string) => string;
  /** time source, replaceable in tests */
  now?: () => number;
  /** runs a command typed with "!" (see shell.ts) */
  runShell?: ShellRunner;
  /** how long an empty turn (see onResult) and an interrupt without answer (see sendNow) are given, in ms; shorter in tests */
  graceMs?: number;
  /**
   * the session is done for now: its turn ended and nothing is queued (`done`, or `failed` when Claude Code ended it
   * on an error), the user stopped it (`interrupted`), or its process went away on its own or was closed (`exited`);
   * what a merge under way waits for
   */
  onTurnEnd?: (session: SessionInfo, how: TurnEnd) => void;
  /** a compaction asked by autoCompact ended without compacting (the session limit reached, most often) */
  onAutoCompactFailed?: () => void;
}

export type TurnEnd = 'done' | 'failed' | 'interrupted' | 'exited';

/** Why we asked the process to stop (null = nobody did: it ended or crashed on its own). */
type StopRequest = { reason: 'closed' | 'idle'; note: string } | null;

/** A request waiting for the user: what to send back, and what to show. */
/** `given`: an `os-secret ask` (no tool call of Claude Code's), told the names given, or null when refused or cancelled */
interface PendingRequest { input: Record<string, unknown>; suggestions: Json[]; prompt: PermissionPrompt; given?: (names: string[] | null) => void }

/** Session fields that are computed, not stored. */
export type StoredInfo = Omit<SessionInfo, 'permissions' | 'lastSeq' | 'remote' | 'secrets'>;

const LAST_MESSAGE_LENGTH = 400;
const GRACE_MS = 3000;
/** The text being written is sent at most this often: one message per chunk would flood the clients. */
const PARTIAL_EVERY_MS = 80;

export class Session {
  private info: StoredInfo;
  private context: MachineContext;
  private deps: SessionDeps;
  private process: ProcessHandle | null = null;
  private normalizer: Normalizer | null = null;
  /** the only record of the requests waiting for the user; emptied at the end of each turn and when the process goes */
  private requests = new Map<string, PendingRequest>();
  /** the real path the current process runs in, used to shorten paths in permission texts */
  private folder = '';
  /** first names of sub-agents already used in this session, kept across resumes */
  private subagentNames = new Set<string>();
  private idleTimer: NodeJS.Timeout | null = null;
  /** wake-ups and cron jobs the process holds (they die with it) */
  private schedules: Schedules = noSchedules();
  private stopRequest: StopRequest = null;
  private interrupted = false;
  /** the pictures of the queued messages, by queue id: kept in memory only (a restart keeps the texts, not them) */
  private queuedImages = new Map<string, readonly ImageUpload[]>();
  /** the other files of the queued messages, by queue id, as their upload ids (same) */
  private queuedFiles = new Map<string, readonly string[]>();
  /** the text being written not sent yet, by who writes it */
  private partials = new Map<string, string>();
  private partialTimer: NodeJS.Timeout | null = null;
  /** where other Claude Code sessions reach the current process (see InitInfo), '' before its init */
  private socket = '';
  /** the commands run with "!" since the last message, with what they wrote, in Claude Code's own format: they go with the next one */
  private shellNotes: string[] = [];
  /** the "!" commands still running, by their id, to stop them */
  /** the "!" commands still running: how to stop each, and its end */
  private shells = new Map<string, { stop: AbortController; done: Promise<unknown> }>();
  /** something happened in the turn under way (or since the last one ended): an empty result does not end a real turn */
  private turnOutput = false;
  /** /clear's turn, empty: it ends at once (see onResult) */
  private cleared = false;
  /** an empty result waiting to see whether the turn goes on (see onResult) */
  private emptyResult: NodeJS.Timeout | null = null;
  /** Remote Control, while it is on: it lasts as long as the process, which is then never released for being idle */
  private remote: RemoteControl | undefined;
  /** Open Space compacts the conversation on its own (see autoCompact): how the session was before, to go back to it */
  private autoCompaction: { resting: boolean; hadProcess: boolean; compacted: boolean } | null = null;
  /** its worktree is being made: messages wait in the queue, nothing starts until it is ready */
  private preparing = false;

  constructor(info: StoredInfo, deps: SessionDeps) {
    this.info = info;
    this.deps = deps;
    this.context = initialContext(info.state);
  }

  get id() { return this.info.id; }
  get alive() { return !!this.process?.alive; }
  /** True when a SendMessage address ("uds:/tmp/…" or the path alone) is this session's live process. */
  answersAt(address: string) { return !!this.socket && this.alive && address.replace(/^uds:/, '') === this.socket; }
  snapshot(): SessionInfo {
    const secrets = this.deps.secretNames?.() ?? [];
    return { ...this.info, permissions: [...this.requests.values()].map((request) => request.prompt), lastSeq: this.deps.log.lastSeq, ...(this.remote ? { remote: this.remote } : {}), ...(secrets.length ? { secrets } : {}) };
  }

  private now() { return (this.deps.now ?? Date.now)(); }

  private publish() {
    this.deps.broadcast({ t: 'session', session: this.snapshot() });
    this.deps.persist();
  }

  /** Puts the last exchanges of a resumed conversation in the thread, under a note, so the user sees where it was. */
  showHistory(title: string, exchanges: readonly { who: 'user' | 'assistant'; text: string }[]) {
    this.record({ k: 'note', text: exchanges.length ? st.sessions.resumedWithHistory(title) : st.sessions.resumed(title) });
    for (const { who, text } of exchanges) this.record(who === 'user' ? { k: 'start', text } : { k: 'say', who: 'chef', text });
    this.record({ k: 'note', text: st.sessions.nextMessageContinues });
  }

  /** Records an event in the log and sends it to the clients. */
  private record(ev: OfficeEvent) {
    const logged = this.deps.log.append(this.now(), ev);
    this.deps.broadcast({ t: 'ev', sessionId: this.info.id, seq: logged.seq, at: logged.at, ev });
  }

  private apply(input: MachineInput, reason?: string) {
    const next = reduce(this.context, input);
    const changed = next.state !== this.context.state;
    this.context = next;
    if (changed) {
      // since when it works: a permission or a question on the way does not start it again
      const busy = (state: SessionState) => state === 'starting' || state === 'work' || state === 'perm';
      if (!busy(next.state)) this.info.busySince = undefined;
      else if (!busy(this.info.state)) this.info.busySince = this.now();
      this.info.state = next.state;
      this.info.stateSince = this.now();
      this.record({ k: 'state', state: next.state, reason });
    }
    this.publish();
    if (changed && next.state === 'error') this.deps.onAttention?.('error', this.snapshot());
  }

  /** Called at startup for sessions found in a running state: their process died with the previous server. */
  markInterrupted() {
    if (this.info.state === 'starting' || this.info.state === 'work' || this.info.state === 'perm') {
      this.apply({ type: 'exit', reason: 'closed' }, st.sessions.stopped.serverStopped);
    }
  }

  /** True while a turn runs: a message sent now waits in the queue until the turn ends. */
  private get busy() {
    return !!this.process?.alive && (this.context.state === 'starting' || this.context.state === 'work' || this.context.state === 'perm');
  }

  /**
   * A message from the user. During a turn, a plain one goes at once and joins it: Claude Code reads it at the turn's
   * next step, without stopping it (checked with 2.1.302: Claude answers it, then usually goes on). A slash command,
   * which only runs between turns, is queued (the user sees it, can take it back, or interrupt the turn to send it at
   * once), and so is anything sent after it. Otherwise the message leaves now, after anything still queued.
   */
  send(text: string, images: readonly ImageUpload[] = [], files: readonly string[] = []) {
    const clean = text.trim();
    if (!clean && !images.length && !files.length) return;
    if (this.stopRequest) throw new Error(st.sessions.closing);
    if (this.busy && !this.autoCompaction && this.context.state !== 'starting' && !clean.startsWith('/') && !this.info.queued?.length) {
      this.deliver(clean, images, files, true);
      this.publish();
      return;
    }
    const id = randomUUID();
    if (images.length) this.queuedImages.set(id, images);
    if (files.length) this.queuedFiles.set(id, files);
    this.info.queued = [...(this.info.queued ?? []), { id, text: clean, ...(images.length ? { images: images.length } : {}), ...(files.length ? { files: files.length } : {}) }];
    if (this.busy || this.preparing) { this.publish(); return; }
    this.sendQueued();
  }

  /**
   * Its folder is being made (a worktree of its own): it shows as starting, with `note` in the thread, and what is
   * sent meanwhile waits in the queue.
   */
  startPreparing(note: string) {
    this.preparing = true;
    this.record({ k: 'note', text: note });
    this.apply({ type: 'prepare' });
  }

  /**
   * Its folder is being moved under it (its worktree going away, a merge being landed): like preparing, what is sent
   * waits in the queue and no process starts, but nothing shows. finishPreparing ends it.
   */
  hold() { this.preparing = true; }

  /** The folder is ready: the queue leaves (`send`), or stays for the user to send or take back (it could not be made). */
  finishPreparing(send: boolean) {
    this.preparing = false;
    this.apply({ type: 'prepared' });
    if (!send || this.context.state !== 'wait') return;
    try {
      this.sendQueued();
    } catch (error) {
      // refused (too many sessions alive): the queue stays, and the thread says why
      this.record({ k: 'note', text: error instanceof Error ? error.message : String(error) });
    }
  }

  /** From its next launch, without the folder's own settings (see trust.ts): its new folder runs code the user never accepted. */
  restrict() {
    this.info.untrusted = true;
    this.publish();
  }

  get isPreparing() { return this.preparing; }

  /** A note of Open Space in the thread, or the news of its branch. */
  announce(ev: Extract<OfficeEvent, { k: 'note' } | { k: 'branch' }>) { this.record(ev); }

  /**
   * Something Open Space asks of the session itself (merge its branch, open a pull request): `prompt` goes to Claude,
   * the thread shows `shown`, a short line in the user's name. Only between turns.
   */
  instruct(prompt: string, shown: string) {
    if (this.busy || this.preparing || this.stopRequest || this.info.queued?.length) throw new Error(st.worktree.waitTurn(this.info.name));
    this.deliver(prompt, [], [], false, shown);
    this.publish();
  }

  /** Its worktree's state changed (what the branch holds, a merge under way), or it has none any more. */
  setWorktree(worktree: WorktreeInfo | undefined) {
    this.info.worktree = worktree;
    this.publish();
  }

  /**
   * Moves the session to another folder (into its worktree, or back to the main checkout), its process stopped first
   * (see stopForMove): its conversation goes on there, and is told where it now is with the next message (placeNote).
   */
  relocate(cwd: string, worktree: WorktreeInfo | undefined) {
    if (this.process?.alive) throw new Error(st.sessions.closing);
    // a conversation started before worktrees was never told where it works: from now on it is
    if (this.info.resumable || this.info.forkOf) this.info.toldPlace ??= this.info.cwd;
    this.info.cwd = cwd;
    this.info.worktree = worktree;
    this.publish();
  }

  /** Stops the process (and Remote Control, the "!" commands) without closing the session: it waits, and its next message starts one again. */
  async stopForMove() {
    await Promise.all([this.setRemote(false), this.stopShells()]);
    this.clearIdleTimer();
    if (!this.process?.alive) return;
    this.stopRequest = { reason: 'idle', note: st.sessions.stopped.moved };
    await this.process.stop(2000);
  }

  /** Takes a message back from the queue. */
  unqueue(queueId: string) {
    this.queuedImages.delete(queueId);
    this.queuedFiles.delete(queueId);
    this.info.queued = this.info.queued?.filter((message) => message.id !== queueId);
    if (!this.info.queued?.length) this.info.queued = undefined;
    this.publish();
  }

  /** Sends the queue now: the running turn is interrupted, and the queue leaves when it ends. */
  sendNow() {
    // its folder is being made or moved: the queue leaves once it is done
    if (this.preparing) return;
    if (!this.busy) { this.sendQueued(); return; }
    this.interrupt();
    // an interrupt with no turn to stop (the session looked busy, Claude Code was waiting) never ends one: the queue
    // then leaves anyway, Claude Code takes it as soon as it can
    const timer = setTimeout(() => { if (this.busy && this.info.queued?.length && this.process?.alive) this.sendQueued(); }, this.deps.graceMs ?? GRACE_MS);
    timer.unref();
  }

  /** Sends the oldest queued messages as one: the plain ones together, a slash command alone (it must come first). */
  private sendQueued() {
    const queued = this.info.queued ?? [];
    if (!queued.length) return;
    const isCommand = (message: { text: string }) => message.text.startsWith('/');
    const firstCommand = queued.findIndex(isCommand);
    const count = firstCommand === 0 ? 1 : firstCommand === -1 ? queued.length : firstCommand;
    const batch = queued.slice(0, count);
    // the queue only shrinks once the message has left: a refusal (too many live sessions) keeps it
    this.deliver(batch.map((message) => message.text).filter(Boolean).join('\n\n'), batch.flatMap((message) => this.queuedImages.get(message.id) ?? []), batch.flatMap((message) => this.queuedFiles.get(message.id) ?? []));
    for (const message of batch) { this.queuedImages.delete(message.id); this.queuedFiles.delete(message.id); }
    this.info.queued = queued.length > count ? queued.slice(count) : undefined;
    this.publish();
  }

  /** `joining`: sent during a turn, which it joins (see send) instead of starting one; `shown`: what the thread shows instead of the text. */
  private deliver(clean: string, images: readonly ImageUpload[], files: readonly string[] = [], joining = false, shown?: string) {
    this.clearIdleTimer();
    if (!joining) {
      this.turnOutput = false;
      this.interrupted = false;
    }
    // a message calls a resting session back from the break room, and is news to read again
    this.info.resting = undefined;
    this.info.quietFrom = undefined;
    const command = /^\/(\S+)/.exec(clean)?.[1];
    if (command) this.info.command = command;
    if (command === 'compact') this.info.compacting = 'manual';
    const spawning = !this.process?.alive;
    if (spawning) {
      // a new conversation gets the name in its system prompt (see buildClaudeArgs), and where it works
      if (!this.info.resumable && !this.info.forkOf) {
        this.info.introducedAs = this.info.name;
        this.info.toldPlace = this.info.cwd;
        this.info.toldSharedBrowser = this.deps.sharedBrowser?.() ? true : undefined;
        this.info.toldSecrets = this.deps.secretNames ? true : undefined;
      }
      this.startProcess();
      this.info.error = undefined;
    }
    let outgoing = clean;
    // a slash command must stay first in its message: the new name and the commands run with "!" then go with the next plain message
    if (this.info.introducedAs !== this.info.name && !command) {
      outgoing = renameNote(this.info.name) + clean;
      this.info.introducedAs = this.info.name;
    }
    // moved since it last worked (into its worktree, back to the main checkout): told where it now is
    if (this.info.toldPlace !== undefined && this.info.toldPlace !== this.info.cwd && !command) {
      outgoing = placeNote(this.info.cwd, this.info.worktree) + outgoing;
      this.info.toldPlace = this.info.cwd;
    }
    // the shared browser came after its conversation started: told what it is for, once
    if (!this.info.toldSharedBrowser && !command && this.deps.sharedBrowser?.()) {
      outgoing = sharedBrowserNote(this.deps.identity?.().user) + outgoing;
      this.info.toldSharedBrowser = true;
    }
    if (!this.info.toldSecrets && !command && this.deps.secretNames) {
      outgoing = secretsNote(this.deps.identity?.().user) + outgoing;
      this.info.toldSecrets = true;
    }
    if (this.shellNotes.length && !command) {
      outgoing = `${this.shellNotes.join('\n\n')}\n\n${outgoing}`;
      this.shellNotes = [];
    }
    const mentioned = command ? '' : this.deps.mentioned?.(clean);
    if (mentioned) outgoing = `${outgoing}\n\n${mentioned}`;
    const names = images.map((image) => this.deps.saveImage(image));
    // like a file dropped in the terminal: its path in the message, Claude opens it with its tools
    const uploaded = files.flatMap((id) => {
      const file = this.deps.uploadPath?.(id);
      return file ? [{ id, name: path.basename(file), size: statSync(file).size, file }] : [];
    });
    if (uploaded.length) outgoing = [outgoing, st.prompt.attached(uploaded.map((upload) => upload.file))].filter(Boolean).join('\n\n');
    this.record({ k: 'start', text: shown ?? clean, ...(names.length ? { images: names } : {}), ...(uploaded.length ? { files: uploaded.map(({ id, name, size }) => ({ id, name, size })) } : {}) });
    if (uploaded.length < files.length) this.record({ k: 'note', text: st.sessions.uploadsGone(files.length - uploaded.length) });
    if (!joining) this.apply({ type: spawning ? 'spawn' : 'send' });
    this.process?.send(outgoing, images);
  }

  private startProcess() {
    if (this.deps.liveCount() >= this.deps.maxLive) throw new Error(st.sessions.tooMany(this.deps.maxLive));
    const cwd = this.deps.allowedDirectory(this.info.cwd);
    if (!cwd) throw new Error(st.sessions.folderGone);
    const normalizer = new Normalizer({
      emit: (ev) => this.onEvent(ev),
      onInit: (init) => this.onInit(init),
      onCommands: (commands) => this.deps.onCommandDetails(commands),
      onQuota: (quota) => this.deps.onQuota(quota),
      onCompacting: () => { this.info.compacting ??= 'auto'; this.publish(); },
      onResult: (result) => this.onResult(result),
      onRequest: (request) => this.onRequest(request),
      onCancel: (requestId) => this.settle(requestId, { k: 'ask_done', requestId, allow: false, cancelled: true }),
      onPartial: (who, text) => this.onPartial(who, text),
      onRemoteState: (state) => this.onRemoteState(state),
      onBackground: (tasks) => this.onBackground(tasks),
      onSchedule: (change) => this.onSchedule(change),
      onContext: ({ used, max }) => { this.info.context = { used: used ?? this.info.context?.used ?? 0, max: max ?? this.info.context?.max ?? 0 }; },
      onFiles: (who, caption, files, display) => this.onEvent({
        k: 'files', who, ...(caption.trim() ? { caption: caption.slice(0, 2000) } : {}),
        files: files.map((file) => {
          const stored = this.deps.copyFile?.(file.path) ?? null;
          const extension = stored?.split('.').pop();
          // a page is previewed unless Claude sent it as a mere attachment ('attach'); an SVG is a picture
          return {
            title: path.basename(file.path), stored, image: file.image || extension === 'svg', size: file.size,
            ...(extension === 'html' && display !== 'attach' ? { page: true as const } : {}),
            ...(extension && VIDEO_EXTENSIONS.has(extension) && display !== 'attach' ? { video: true as const } : {}),
          };
        }),
      }),
      onArtifact: (who, artifact) => {
        const stored = this.deps.copyFile?.(artifact.path) ?? null;
        const bundle = stored && Object.keys(artifact.files).length ? this.deps.bundlePage?.(stored, artifact.files) : null;
        this.onEvent({ k: 'artifact', who, title: artifact.title || path.basename(artifact.path), url: artifact.url, stored, ...(bundle ? { bundle } : {}) });
      },
      names: this.subagentNames,
      peerName: this.deps.peerName,
      agentLaunch: (agentId) => agentLaunch(cwd, this.conversationId, agentId),
      cwd,
    });
    const handle: ProcessHandle = this.deps.spawnProcess(
      { cwd, sessionId: this.conversationId, resume: this.info.resumable, model: this.info.model, ...(this.info.effort ? { effort: this.info.effort } : {}), ...(this.info.ultracode ? { ultracode: true } : {}), permissionMode: this.info.permissionMode, name: this.info.name, ...this.deps.identity?.(), ...(this.info.untrusted ? { untrusted: true } : {}), ...(this.deps.claudeSettings ? { settings: this.deps.claudeSettings() } : {}), ...(this.info.forkOf ? { forkOf: this.info.forkOf } : {}), ...(this.info.worktree ? { worktree: this.info.worktree } : {}) },
      {
        onMessage: (message) => {
          if (this.process !== handle) return; // a previous process still talking
          const refused = normalizer.handle(message);
          if (refused) handle.refuseControl(refused);
        },
        onExit: (exit) => this.onExit(handle, exit.code, exit.signal, exit.stderr),
      },
    );
    this.normalizer = normalizer;
    this.folder = cwd;
    this.stopRequest = null;
    this.process = handle;
  }

  /** A context use found on disk, kept unless the session reported one meanwhile. */
  recallContext(context: { used: number; max: number }) {
    if (this.info.context) return;
    this.info.context = context;
    this.publish();
  }

  /** The Claude Code conversation the session goes on with (a new one after /clear). */
  get conversationId() { return this.info.conversationId ?? this.info.id; }

  private onInit(init: InitInfo) {
    // /clear: Claude Code goes on in a new conversation, the one a release must resume afterwards
    if (init.conversationId && init.conversationId !== this.conversationId) {
      this.info.conversationId = init.conversationId === this.info.id ? undefined : init.conversationId;
      this.info.context = undefined;
      // the rules of the shared browser went with the old conversation when they were told in a message: told again
      this.info.toldSharedBrowser = undefined;
      this.info.toldSecrets = undefined;
      this.record({ k: 'cleared' });
      this.cleared = true;
    }
    this.socket = init.socket;
    this.info.activeModel = init.model;
    this.info.claudeVersion = init.version || undefined;
    this.info.forkOf = undefined;
    this.info.resumable = true;
    this.deps.onInitCommands(init.commands);
    this.apply({ type: 'init' });
  }

  /**
   * Turns Remote Control on (the process starts without a message when there is none, and stays) or off (the process
   * may then be released as usual). Its session on claude.ai outlives the process (keep_session_on_exit): after a
   * restart of the server, the session reattaches to it, the same conversation on the phone (checked with 2.1.302).
   */
  async setRemote(enabled: boolean) {
    if (!enabled) {
      const wasOn = !!this.remote || !!this.info.remoteSession;
      this.info.remoteSession = undefined;
      if (!wasOn) return;
      this.remote = undefined;
      this.publish();
      // not waited for long: closing must not hang on a Claude Code that does not answer
      if (this.process?.alive) await Promise.race([this.process.control({ subtype: 'remote_control', enabled: false }).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5000).unref())]);
      if (this.context.state === 'wait') this.armIdleTimer();
      return;
    }
    if (this.remote) return;
    // reachable from elsewhere: out of the break room
    this.info.resting = undefined;
    const process = this.liveProcess();
    this.clearIdleTimer();
    this.remote = { url: '', state: 'connecting' };
    this.publish();
    try {
      // Remote Control works in -p as this control request, not as the /remote-control command nor the
      // --remote-control flag (both do nothing there). Checked with 2.1.302: the answer carries session_url, then
      // system/bridge_state messages follow ("ready", "connected").
      // its title on claude.ai and in the app (`name`, kept apart from --name, which other sessions write to): what it is about, then who
      const title = `${this.info.tag || path.basename(this.info.cwd)} - ${this.info.name}`;
      const ask = (reattach?: string) => process.control({ subtype: 'remote_control', enabled: true, name: title, keep_session_on_exit: true, ...(reattach ? { reattach_session_id: reattach } : {}) });
      // a session ended on claude.ai meanwhile cannot be reattached to: a new one then
      const answer = await ask(this.info.remoteSession).catch((error: unknown) => (this.info.remoteSession ? ask() : Promise.reject(error)));
      this.info.remoteSession = asString(answer.bridge_session_id) || undefined;
      if (this.remote && this.process === process) this.remote = { ...this.remote, url: asString(answer.session_url) };
    } catch (error) {
      this.remote = undefined;
      this.info.remoteSession = undefined;
      if (this.context.state === 'wait') this.armIdleTimer();
      throw new Error(st.sessions.remoteFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      this.publish();
    }
  }

  /** Named by another session's message: its process starts, if it can, so that a message from that one reaches it. */
  wake() {
    try { this.liveProcess(); } catch { /* closing, or too many sessions alive: it is told of the message when it wakes */ }
  }

  /**
   * The session's process, started without a message when it has none (it then waits, and is released when idle like
   * any other): what Claude Code is asked about directly (Remote Control, the views of the panel) needs one.
   */
  private liveProcess(): ProcessHandle {
    if (this.process?.alive) return this.process;
    if (this.stopRequest) throw new Error(st.sessions.closing);
    if (this.preparing) throw new Error(st.worktree.preparingRetry);
    this.info.error = undefined;
    this.startProcess();
    this.apply({ type: 'attach' });
    this.armIdleTimer();
    return this.process!;
  }

  /**
   * Runs a command typed with "!" in the session's folder, without Claude, and shows it with its output. Like Claude
   * Code's bash mode, Claude sees it with the user's next message, as the terminal writes it in the conversation
   * (`<bash-input>`, then `<bash-stdout>` and `<bash-stderr>`, checked in transcripts of 2.1.302).
   */
  async shell(command: string) {
    if (this.preparing) throw new Error(st.worktree.preparingRetry);
    const cwd = this.deps.allowedDirectory(this.info.cwd);
    if (!cwd) throw new Error(st.sessions.folderGone);
    if (!this.deps.runShell) throw new Error(st.sessions.claudeMissing);
    const id = randomUUID();
    const stop = new AbortController();
    this.record({ k: 'shell', id, command });
    const run = this.deps.runShell(command, cwd, stop.signal);
    this.shells.set(id, { stop, done: run });
    const result = await run.finally(() => this.shells.delete(id));
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    this.record({ k: 'shell_done', id, code: result.stopped ? null : result.code, output: output.slice(-20_000), ms: result.ms, ...(result.stopped && !result.timedOut ? { byUser: true } : {}) });
    const stdout = result.stdout || (result.stderr ? '' : '(Bash completed with no output)');
    this.shellNotes.push(`<bash-input>${command}</bash-input>\n<bash-stdout>${stdout}</bash-stdout><bash-stderr>${result.stderr}</bash-stderr>`);
  }

  /** Stops a "!" command still running (its whole process group); what it wrote so far is kept. */
  stopShell(shellId: string) { this.shells.get(shellId)?.stop.abort(); }

  /** Stops every "!" command still running, once they have ended and been written down: none outlives the session. */
  async stopShells() {
    const running = [...this.shells.values()];
    for (const { stop } of running) stop.abort();
    await Promise.all(running.map(({ done }) => done.catch(() => {})));
    // their end is recorded once the runner's promise settles, a tick later
    await new Promise((resolve) => setImmediate(resolve));
  }

  /** What one of the panel's own views shows, asked to Claude Code (see inspect.ts). */
  async inspect(view: InspectView): Promise<Inspection> {
    const process = this.liveProcess();
    switch (view) {
      case 'mcp': return { view, servers: parseMcpServers(await process.control({ subtype: 'mcp_status' })) };
      // 'summary': from the last answer's usage and estimates, without a token-count call per category
      case 'context': return { view, usage: parseContextUsage(await process.control({ subtype: 'get_context_usage', detail: 'summary' })) };
      case 'usage': return { view, report: parseUsageReport(await process.control({ subtype: 'get_usage' })) };
    }
  }

  /**
   * Acts on one of the session's MCP servers. Turning one on or off is kept for the session's folder, like /mcp in the
   * terminal. Signing in answers the page to open: Claude Code waits for the sign-in's return on localhost, then
   * reconnects the server (checked with 2.1.302).
   */
  async mcpAction(server: string, action: McpAction): Promise<string | null> {
    const process = this.liveProcess();
    if (action === 'reconnect') await process.control({ subtype: 'mcp_reconnect', serverName: server });
    else if (action === 'enable' || action === 'disable') await process.control({ subtype: 'mcp_toggle', serverName: server, enabled: action === 'enable' });
    else return asString((await process.control({ subtype: 'mcp_authenticate', serverName: server })).authUrl) || null;
    return null;
  }

  private onRemoteState(state: string) {
    if (!this.remote) return;
    this.remote = { ...this.remote, state: state === 'connected' ? 'connected' : state === 'failed' || state.endsWith('disabled') ? 'failed' : 'connecting' };
    this.publish();
  }

  private onBackground(tasks: BackgroundTask[]) {
    this.info.background = tasks.length ? tasks : undefined;
    // the last one is done: the idle process may now be released
    if (!tasks.length && this.context.state === 'wait') this.armIdleTimer();
    this.publish();
  }

  private onSchedule(change: ScheduleChange) {
    this.schedules = applySchedule(this.schedules, change, this.now());
    this.info.scheduled = pendingSchedules(this.schedules, this.now()) || undefined;
    this.publish();
  }

  /** Sub-agents and commands still at work in the background would die with the process, and Remote Control with it. */
  private keepsProcess() {
    return this.info.subagents.length > 0 || !!this.info.background || !!this.remote;
  }

  private onPartial(who: string, text: string) {
    if (this.autoCompaction) return;
    this.partials.set(who, text);
    this.partialTimer ??= setTimeout(() => {
      this.partialTimer = null;
      for (const [writer, written] of this.partials) this.deps.broadcast({ t: 'partial', sessionId: this.info.id, who: writer, text: written });
      this.partials.clear();
    }, PARTIAL_EVERY_MS);
  }

  private onEvent(event: OfficeEvent) {
    // what Claude says while Open Space compacts on its own (an error, the session limit) is not shown
    if (event.k === 'say' && this.autoCompaction) return;
    const ev: OfficeEvent = event.k === 'compact' && this.autoCompaction ? { ...event, idle: true } : event;
    if (ev.k === 'compact') { this.info.compacting = undefined; if (this.autoCompaction) this.autoCompaction.compacted = true; this.publish(); }
    // the whole message is here: what was left of it to send is not needed any more
    if (ev.k === 'say') this.partials.delete(ev.who);
    // Claude Code's init (it opens every turn) is not something happening in it
    if (ev.k !== 'init') {
      this.turnOutput = true;
      if (this.emptyResult) { clearTimeout(this.emptyResult); this.emptyResult = null; }
    }
    // the session's own agent at work while waiting: a queued message or a background task started a new turn (a
    // sub-agent still at work in the background does not: the session itself waits for the user)
    const own = (ev.k === 'say' || ev.k === 'act' || ev.k === 'think') ? ev.who === 'chef' : ev.k === 'hire';
    if (this.context.state === 'wait' && own) this.apply({ type: 'activity' });
    if (ev.k === 'say' && ev.who === 'chef') this.info.lastMessage = tail(ev.text, LAST_MESSAGE_LENGTH);
    if (ev.k === 'hire') this.info.subagents = [...this.info.subagents, { id: ev.id, name: ev.name, type: ev.type }];
    if (ev.k === 'leave') {
      const gone = this.info.subagents.find((subagent) => subagent.id === ev.who);
      if (gone) this.deps.onSubagentLeft?.(gone.type);
      this.info.subagents = this.info.subagents.filter((subagent) => subagent.id !== ev.who);
      // the last sub-agent working in the background is done: the idle process may now be released
      if (!this.info.subagents.length && this.context.state === 'wait') this.armIdleTimer();
    }
    this.record(ev);
    if (ev.k === 'hire' || ev.k === 'leave' || ev.k === 'say') this.publish();
  }

  private onRequest(request: ToolRequest) {
    const ask = describeRequest(request, this.folder);
    const prompt: PermissionPrompt = { requestId: ask.requestId, who: ask.who, tool: ask.tool, detail: ask.detail, canAlways: ask.canAlways, ...(ask.always ? { always: ask.always } : {}), ...(ask.questions ? { questions: ask.questions } : {}) };
    this.requests.set(request.requestId, { input: request.input, suggestions: request.suggestions, prompt });
    this.record(ask);
    this.apply({ type: 'permission_requested' });
    this.deps.onAttention?.(ask.questions ? 'question' : 'permission', this.snapshot());
  }

  /** Removes one request (answered or withdrawn) and records how it ended. */
  private settle(requestId: string, done: Extract<OfficeEvent, { k: 'ask_done' }>) {
    if (!this.requests.delete(requestId)) return;
    this.record(done);
    this.apply({ type: 'permission_resolved', remaining: this.requests.size });
  }

  /** Requests nobody can answer any more (the turn ended, or the process is gone). The caller applies the next state. */
  private cancelRequests() {
    for (const [requestId, request] of this.requests) {
      this.record({ k: 'ask_done', requestId, allow: false, cancelled: true });
      request.given?.(null);
    }
    this.requests.clear();
  }

  /**
   * `os-secret ask`, run by the agent's Bash during its turn: a box asks the user for the keys `names` (`why`: what they
   * are for), as a permission would. Resolves with the names given, or null when the user refuses or the turn ends.
   */
  askSecrets(names: string[], why: string): Promise<string[] | null> {
    if (!this.process?.alive || (this.context.state !== 'work' && this.context.state !== 'perm')) return Promise.reject(new Error(st.sessions.secretsOutsideTurn));
    const requestId = `secrets-${randomUUID()}`;
    const prompt: PermissionPrompt = { requestId, who: 'chef', tool: 'os-secret', detail: why, canAlways: false, secrets: names };
    return new Promise((resolve) => {
      this.requests.set(requestId, { input: {}, suggestions: [], prompt, given: resolve });
      this.record({ k: 'ask', ...prompt });
      this.apply({ type: 'permission_requested' });
      this.deps.onAttention?.('question', this.snapshot());
    });
  }

  /** The user gave keys in the box of an `os-secret ask` (already kept by the caller): the agent's command goes on. */
  secretsGiven(requestId: string) {
    const request = this.requests.get(requestId);
    if (!request?.given) throw new Error(st.sessions.requestGone);
    request.given(this.deps.secretNames?.() ?? []);
    this.settle(requestId, { k: 'ask_done', requestId, allow: true });
  }

  /** The names of the keys changed (given, forgotten, expired): the page shows them. */
  secretsChanged() { this.deps.broadcast({ t: 'session', session: this.snapshot() }); }

  private onResult(result: TurnResult) {
    if (this.autoCompaction) {
      if (this.emptyResult) { clearTimeout(this.emptyResult); this.emptyResult = null; }
      // a process woken up for it closes an empty turn first: the compaction's own turn comes after
      if (!this.autoCompaction.compacted && result.ok && !result.text.trim()) {
        this.emptyResult = setTimeout(() => { this.emptyResult = null; this.endAutoCompaction(); }, this.deps.graceMs ?? GRACE_MS);
        this.emptyResult.unref();
      } else this.endAutoCompaction();
      return;
    }
    // Claude Code sometimes closes an empty turn of a few ms before the real one (waking a session up, after a
    // background sub-agent's hand-back): nothing happened, so nothing is told. If nothing follows, the session waits.
    if (this.cleared && !result.text.trim()) { this.cleared = false; this.endTurn(false); return; }
    this.cleared = false;
    if (result.ok && !this.turnOutput && !result.text.trim() && !this.interrupted && !this.requests.size) {
      if (this.emptyResult) clearTimeout(this.emptyResult);
      this.emptyResult = setTimeout(() => { this.emptyResult = null; this.endTurn(false); }, this.deps.graceMs ?? GRACE_MS);
      this.emptyResult.unref();
      return;
    }
    this.info.turns++;
    this.cancelRequests();
    const stopped = this.interrupted;
    this.record({ k: 'end', ok: result.ok, text: result.text.slice(0, 20000), ms: result.ms, stopped: stopped || undefined });
    this.interrupted = false;
    this.endTurn(!stopped, stopped ? 'interrupted' : result.ok ? 'done' : 'failed');
  }

  /**
   * Compacts the conversation of a session left alone (Preferences.idleCompact), at its desk or in the break room,
   * without telling the user anything new: no message of theirs in the thread, no "read what X did", no sound. A
   * resting one goes back to rest after. false: it is not idle; throws when no process can start (too many alive).
   */
  autoCompact(command: string): boolean {
    const idle = this.context.state === 'wait' || (this.info.resting === true && (this.context.state === 'closed' || this.context.state === 'done'));
    if (!idle || this.busy || this.preparing || this.stopRequest || this.autoCompaction || !this.info.resumable || this.info.queued?.length || this.info.subagents.length || this.info.background) return false;
    const hadProcess = !!this.process?.alive;
    if (!hadProcess) this.startProcess();
    this.autoCompaction = { resting: this.info.resting === true, hadProcess, compacted: false };
    this.info.quietFrom ??= this.deps.log.lastSeq;
    this.info.compacting = 'auto';
    this.clearIdleTimer();
    this.apply({ type: hadProcess ? 'send' : 'spawn' });
    this.process?.send(command, []);
    return true;
  }

  get autoCompacting() { return this.autoCompaction !== null; }

  /** The compaction Open Space asked for is over: the session goes back to how it was, or takes what was sent meanwhile. */
  private endAutoCompaction() {
    const before = this.autoCompaction;
    this.autoCompaction = null;
    this.info.compacting = undefined;
    this.turnOutput = false;
    if (before && !before.compacted) this.deps.onAutoCompactFailed?.();
    this.apply({ type: 'turn_result' });
    if (this.context.state !== 'wait' || !before) return;
    if (this.info.queued?.length) { this.sendQueued(); return; }
    if (before.resting && this.process?.alive) {
      this.info.resting = true;
      this.stopRequest = { reason: 'closed', note: st.sessions.stopped.compacted };
      void this.process.stop(2000);
    } else if (!before.hadProcess && this.process?.alive) {
      this.stopRequest = { reason: 'idle', note: st.sessions.stopped.compacted };
      void this.process.stop(2000);
    } else {
      this.armIdleTimer();
    }
    this.publish();
  }

  /** The turn is over: the queue leaves, or the session waits (`tell`: and the user hears it finished; `how`: how it ended). */
  private endTurn(tell: boolean, how: TurnEnd = 'done') {
    this.turnOutput = false;
    // a /compact that ended without compacting (nothing to compact, refused): it is not under way any more
    this.info.compacting = undefined;
    this.apply({ type: 'turn_result' });
    if (this.context.state !== 'wait') return;
    // queued messages leave at once: the session works again, nothing to tell the user
    if (this.info.queued?.length) { this.sendQueued(); return; }
    this.armIdleTimer();
    // a turn the user stopped themselves needs no telling either
    if (tell) this.deps.onAttention?.('finished', this.snapshot());
    this.deps.onTurnEnd?.(this.snapshot(), how);
  }

  private pending(requestId: string): PendingRequest {
    const request = this.requests.get(requestId);
    if (!this.process?.alive || !request) throw new Error(st.sessions.requestGone);
    return request;
  }

  answer(requestId: string, decision: PermissionDecision) {
    const request = this.pending(requestId);
    if (request.prompt.questions) throw new Error(st.sessions.questionNotYesNo);
    // a box for keys is only refused this way: they are given with secretsGiven
    if (request.given) {
      request.given(null);
      this.settle(requestId, { k: 'ask_done', requestId, allow: false });
      return;
    }
    if (decision === 'deny') this.process!.answerPermission(requestId, { allow: false });
    else {
      // "always" sends back the rules Claude Code suggested, scoped to this session only (nothing is written to settings files)
      const updates = decision === 'always' ? request.suggestions.map((suggestion) => ({ ...suggestion, destination: 'session' })) : [];
      this.process!.answerPermission(requestId, { allow: true, input: request.input, updates });
    }
    this.settle(requestId, { k: 'ask_done', requestId, allow: decision !== 'deny' });
  }

  /** Answers an AskUserQuestion call: the original input plus `answers` (question text -> chosen labels or own text). */
  reply(requestId: string, answers: Record<string, string>) {
    const request = this.pending(requestId);
    if (!request.prompt.questions) throw new Error(st.sessions.requestYesNo);
    const kept = Object.fromEntries(request.prompt.questions.flatMap(({ question }) => (answers[question]?.trim() ? [[question, answers[question].trim()]] : [])));
    if (Object.keys(kept).length === 0) throw new Error(st.sessions.chooseAnswer);
    this.process!.answerPermission(requestId, { allow: true, input: { ...request.input, answers: kept }, updates: [] });
    this.settle(requestId, { k: 'ask_done', requestId, allow: true });
  }

  interrupt() {
    if (!this.process?.alive || (this.context.state !== 'work' && this.context.state !== 'perm')) return;
    this.interrupted = true;
    this.process.interrupt();
  }

  /**
   * Another model, effort ('' : the default), ultracode or permission mode. A running process takes it at once, as the
   * Agent SDK does it (checked with 2.1.303 through get_settings); the next launches pass it as --model, --effort,
   * --settings and --permission-mode.
   */
  async tune(change: TuneChange) {
    const process = this.process?.alive ? this.process : null;
    const model = change.model !== undefined && change.model !== this.info.model ? change.model : null;
    const effort = change.effort !== undefined && change.effort !== (this.info.effort ?? '') ? change.effort : null;
    const ultracode = change.ultracode !== undefined && change.ultracode !== !!this.info.ultracode ? change.ultracode : null;
    const permissionMode = change.permissionMode !== undefined && change.permissionMode !== this.info.permissionMode ? change.permissionMode : null;
    if (model !== null) {
      this.info.model = model;
      // the model in use is known again at the next init; until then the session shows the one asked for
      this.info.activeModel = '';
    }
    if (effort !== null) this.info.effort = effort || undefined;
    if (ultracode !== null) this.info.ultracode = ultracode || undefined;
    if (permissionMode !== null) this.info.permissionMode = permissionMode;
    this.publish();
    if (model !== null) await process?.control({ subtype: 'set_model', model: model || 'default' });
    if (effort !== null) await process?.control({ subtype: 'apply_flag_settings', settings: { effortLevel: effort || null } });
    // Claude Code takes "manual" as its "default" mode
    if (permissionMode !== null) await process?.control({ subtype: 'set_permission_mode', mode: permissionMode });
    if (ultracode === null) return;
    try {
      await process?.control({ subtype: 'apply_flag_settings', settings: { ultracode } });
    } catch (error) {
      // refused when dynamic workflows are off in Claude Code's /config: the session stays as it was
      this.info.ultracode = !ultracode || undefined;
      this.publish();
      throw error;
    }
  }

  /** Claude Code settings changed in Open Space (null : back to Claude Code's own): a running process takes them at once. */
  async applySettings(changes: Record<string, unknown>) {
    if (this.process?.alive) await this.process.control({ subtype: 'apply_flag_settings', settings: changes });
  }

  rename(name: string) {
    this.info.name = name;
    this.publish();
  }

  /** Off to the break room: the process is released (the conversation can be resumed), and a message calls it back. */
  async rest() {
    this.info.resting = true;
    if (this.process?.alive) await this.close();
    this.publish();
  }

  /**
   * Lets the process go while the session waits, so that its next message starts the Claude Code installed since.
   * false: it is at work, or keeps its process for its background work or Remote Control.
   */
  release(): boolean {
    if (!this.process?.alive || this.context.state !== 'wait' || this.keepsProcess() || scheduledUntil(this.schedules, this.now())) return false;
    this.clearIdleTimer();
    this.stopRequest = { reason: 'idle', note: st.sessions.stopped.updated };
    void this.process.stop(2000);
    return true;
  }

  /** Puts a label on the session, or removes it (empty). */
  setTag(tag: string) {
    this.info.tag = tag || undefined;
    this.publish();
  }

  /** Stops the process now (and Remote Control for good). A session without a process is simply marked closed. */
  async close() {
    await Promise.all([this.setRemote(false), this.stopShells()]);
    this.clearIdleTimer();
    if (this.process?.alive) {
      this.stopRequest = { reason: 'closed', note: st.sessions.stopped.byUser };
      await this.process.stop(0);
    } else if (this.context.state !== 'closed') {
      this.apply({ type: 'exit', reason: 'closed' }, st.sessions.stopped.byUser);
    }
  }

  /** The server is stopping: release the process. A waiting session stays waiting, a working one is marked closed (it can be resumed). */
  async shutdown() {
    this.clearIdleTimer();
    await this.stopShells();
    if (!this.process?.alive) return;
    const waiting = this.context.state === 'wait';
    this.stopRequest = waiting ? { reason: 'idle', note: st.sessions.stopped.released } : { reason: 'closed', note: st.sessions.stopped.serverStopped };
    await this.process.stop(waiting ? 500 : 0);
  }

  private armIdleTimer() {
    this.clearIdleTimer();
    if (!this.process?.alive || this.keepsProcess()) return;
    // a planned wake-up only comes while the process lives: it is kept until a while after the last one
    const planned = scheduledUntil(this.schedules, this.now());
    this.idleTimer = setTimeout(() => {
      if (this.context.state !== 'wait' || !this.process?.alive || this.keepsProcess()) return;
      this.stopRequest = { reason: 'idle', note: st.sessions.stopped.idle };
      void this.process.stop(2000);
    }, Math.max(this.deps.idleMs, planned - this.now() + this.deps.idleMs));
    this.idleTimer.unref();
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private onExit(handle: ProcessHandle, code: number | null, signal: NodeJS.Signals | null, stderr: string) {
    if (this.process !== handle) return;
    this.clearIdleTimer();
    if (this.emptyResult) clearTimeout(this.emptyResult);
    this.emptyResult = null;
    const normalizer = this.normalizer;
    if (this.partialTimer) clearTimeout(this.partialTimer);
    this.partialTimer = null;
    this.partials.clear();
    this.process = null;
    this.normalizer = null;
    this.remote = undefined;
    this.info.claudeVersion = undefined;
    this.info.compacting = undefined;
    this.autoCompaction = null;
    this.cancelRequests();
    // sub-agents that will not report
    for (const id of normalizer?.present ?? []) this.onEvent({ k: 'leave', who: id, ok: false, tokens: 0, tools: 0, ms: 0 });
    this.info.subagents = [];
    this.info.background = undefined;
    this.schedules = noSchedules();
    this.info.scheduled = undefined;
    const requested = this.stopRequest;
    this.stopRequest = null;
    if (requested) {
      this.apply({ type: 'exit', reason: requested.reason }, requested.note);
      if (requested.reason === 'closed') this.deps.onTurnEnd?.(this.snapshot(), 'exited');
      return;
    }
    if (code === 0 && signal === null) this.apply({ type: 'exit', reason: 'clean' }, st.sessions.stopped.ended);
    else {
      const message = stderr.split('\n').map((line) => line.trim()).filter(Boolean).slice(-3).join(' ')
        || (signal ? st.sessions.killed(signal) : st.sessions.exited(code));
      this.info.error = message;
      this.record({ k: 'error', message });
      this.apply({ type: 'exit', reason: 'failed' }, message);
    }
    this.deps.onTurnEnd?.(this.snapshot(), 'exited');
  }
}

export function newSessionInfo(fields: Pick<SessionInfo, 'id' | 'name' | 'cwd' | 'model' | 'permissionMode'>, now: number): StoredInfo {
  return { ...fields, activeModel: '', state: 'wait', stateSince: now, createdAt: now, turns: 0, subagents: [], command: '', lastMessage: '', resumable: false };
}
