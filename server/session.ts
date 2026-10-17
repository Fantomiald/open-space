// One session = one conversation with Claude Code in one folder. It owns the claude process (started when
// a message needs it, released when idle), the event log, the state machine and the requests waiting for
// the user; everything it does is published as events with a sequence number.
import { randomUUID } from 'node:crypto';
import { tail } from '../shared/activity.ts';
import type { AttentionKind, ImageUpload, OfficeEvent, PermissionDecision, PermissionPrompt, Quota, RemoteControl, ServerMessage, SessionInfo, SlashCommand } from '../shared/protocol.ts';
import { renameNote, type ProcessFactory, type ProcessHandle } from './claude-process.ts';
import { st } from './i18n/index.ts';
import type { Json } from './json.ts';
import { Normalizer, describeRequest, type InitInfo, type ToolRequest, type TurnResult } from './normalizer.ts';
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
  /** stores a picture sent by the user and returns its name (see attachments.ts) */
  saveImage: (image: ImageUpload) => string;
  /** how many claude processes are alive across all sessions */
  liveCount: () => number;
  maxLive: number;
  idleMs: number;
  /** the user's first name and the note for every new agent (Preferences.agentNote), read when a conversation starts */
  identity?: () => { user: string; note: string };
  /** the name of the session a SendMessage call goes to (see Normalizer) */
  peerName?: (address: string) => string;
  /** time source, replaceable in tests */
  now?: () => number;
}

/** Why we asked the process to stop (null = nobody did: it ended or crashed on its own). */
type StopRequest = { reason: 'closed' | 'idle'; note: string } | null;

/** A request waiting for the user: what to send back, and what to show. */
interface PendingRequest { input: Record<string, unknown>; suggestions: Json[]; prompt: PermissionPrompt }

/** Session fields that are computed, not stored. */
export type StoredInfo = Omit<SessionInfo, 'permissions' | 'lastSeq' | 'remote'>;

const LAST_MESSAGE_LENGTH = 400;
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
  private stopRequest: StopRequest = null;
  private interrupted = false;
  /** the pictures of the queued messages, by queue id: kept in memory only (a restart keeps the texts, not them) */
  private queuedImages = new Map<string, readonly ImageUpload[]>();
  /** the text being written not sent yet, by who writes it */
  private partials = new Map<string, string>();
  private partialTimer: NodeJS.Timeout | null = null;
  /** where other Claude Code sessions reach the current process (see InitInfo), '' before its init */
  private socket = '';
  /** Remote Control, while it is on: it lasts as long as the process, which is then never released for being idle */
  private remote: RemoteControl | undefined;

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
    return { ...this.info, permissions: [...this.requests.values()].map((request) => request.prompt), lastSeq: this.deps.log.lastSeq, ...(this.remote ? { remote: this.remote } : {}) };
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
   * A message from the user. During a turn it is queued (the user sees it, can take it back, or interrupt the turn to
   * send it at once); otherwise it leaves now, after anything still queued.
   */
  send(text: string, images: readonly ImageUpload[] = []) {
    const clean = text.trim();
    if (!clean && !images.length) return;
    if (this.stopRequest) throw new Error(st.sessions.closing);
    const id = randomUUID();
    if (images.length) this.queuedImages.set(id, images);
    this.info.queued = [...(this.info.queued ?? []), { id, text: clean, ...(images.length ? { images: images.length } : {}) }];
    if (this.busy) { this.publish(); return; }
    this.sendQueued();
  }

  /** Takes a message back from the queue. */
  unqueue(queueId: string) {
    this.queuedImages.delete(queueId);
    this.info.queued = this.info.queued?.filter((message) => message.id !== queueId);
    if (!this.info.queued?.length) this.info.queued = undefined;
    this.publish();
  }

  /** Sends the queue now: the running turn is interrupted, and the queue leaves when it ends. */
  sendNow() {
    if (this.busy) this.interrupt();
    else this.sendQueued();
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
    this.deliver(batch.map((message) => message.text).filter(Boolean).join('\n\n'), batch.flatMap((message) => this.queuedImages.get(message.id) ?? []));
    for (const message of batch) this.queuedImages.delete(message.id);
    this.info.queued = queued.length > count ? queued.slice(count) : undefined;
    this.publish();
  }

  private deliver(clean: string, images: readonly ImageUpload[]) {
    this.clearIdleTimer();
    this.interrupted = false;
    // a message calls a resting session back from the break room
    this.info.resting = undefined;
    const command = /^\/(\S+)/.exec(clean)?.[1];
    if (command) this.info.command = command;
    const spawning = !this.process?.alive;
    if (spawning) {
      // a new conversation gets the name in its system prompt (see buildClaudeArgs)
      if (!this.info.resumable) this.info.introducedAs = this.info.name;
      this.startProcess();
      this.info.error = undefined;
    }
    let outgoing = clean;
    // a slash command must stay first in its message: the new name then goes with the next plain message
    if (this.info.introducedAs !== this.info.name && !command) {
      outgoing = renameNote(this.info.name) + clean;
      this.info.introducedAs = this.info.name;
    }
    const names = images.map((image) => this.deps.saveImage(image));
    this.record({ k: 'start', text: clean, ...(names.length ? { images: names } : {}) });
    this.apply({ type: spawning ? 'spawn' : 'send' });
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
      onResult: (result) => this.onResult(result),
      onRequest: (request) => this.onRequest(request),
      onCancel: (requestId) => this.settle(requestId, { k: 'ask_done', requestId, allow: false, cancelled: true }),
      onPartial: (who, text) => this.onPartial(who, text),
      onRemoteState: (state) => this.onRemoteState(state),
      names: this.subagentNames,
      peerName: this.deps.peerName,
    });
    const handle: ProcessHandle = this.deps.spawnProcess(
      { cwd, sessionId: this.info.id, resume: this.info.resumable, model: this.info.model, permissionMode: this.info.permissionMode, name: this.info.name, ...this.deps.identity?.(), ...(this.info.untrusted ? { untrusted: true } : {}) },
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

  private onInit(init: InitInfo) {
    this.socket = init.socket;
    this.info.activeModel = init.model;
    this.info.resumable = true;
    this.deps.onInitCommands(init.commands);
    this.apply({ type: 'init' });
  }

  /**
   * Turns Remote Control on (the process starts without a message when there is none, and stays) or off (the process
   * may then be released as usual).
   */
  async setRemote(enabled: boolean) {
    if (!enabled) {
      if (!this.remote) return;
      this.remote = undefined;
      this.publish();
      if (this.process?.alive) await this.process.remoteControl(false).catch(() => {});
      if (this.context.state === 'wait') this.armIdleTimer();
      return;
    }
    if (this.remote) return;
    if (this.stopRequest) throw new Error(st.sessions.closing);
    this.clearIdleTimer();
    if (!this.process?.alive) {
      this.info.resting = undefined;
      this.info.error = undefined;
      this.startProcess();
    }
    const process = this.process!;
    this.remote = { url: '', state: 'connecting' };
    this.apply({ type: 'attach' });
    try {
      const url = await process.remoteControl(true);
      if (this.remote && this.process === process) this.remote = { ...this.remote, url };
    } catch (error) {
      this.remote = undefined;
      if (this.context.state === 'wait') this.armIdleTimer();
      throw new Error(st.sessions.remoteFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      this.publish();
    }
  }

  private onRemoteState(state: string) {
    if (!this.remote) return;
    this.remote = { ...this.remote, state: state === 'connected' ? 'connected' : state === 'failed' || state.endsWith('disabled') ? 'failed' : 'connecting' };
    this.publish();
  }

  private onPartial(who: string, text: string) {
    this.partials.set(who, text);
    this.partialTimer ??= setTimeout(() => {
      this.partialTimer = null;
      for (const [writer, written] of this.partials) this.deps.broadcast({ t: 'partial', sessionId: this.info.id, who: writer, text: written });
      this.partials.clear();
    }, PARTIAL_EVERY_MS);
  }

  private onEvent(ev: OfficeEvent) {
    // the whole message is here: what was left of it to send is not needed any more
    if (ev.k === 'say') this.partials.delete(ev.who);
    // output while waiting: a queued message or a background task started a new turn
    if (this.context.state === 'wait' && (ev.k === 'say' || ev.k === 'act' || ev.k === 'hire' || ev.k === 'think')) this.apply({ type: 'activity' });
    if (ev.k === 'say' && ev.who === 'chef') this.info.lastMessage = tail(ev.text, LAST_MESSAGE_LENGTH);
    if (ev.k === 'hire') this.info.subagents = [...this.info.subagents, { id: ev.id, name: ev.name, type: ev.type }];
    if (ev.k === 'leave') {
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
    for (const requestId of this.requests.keys()) this.record({ k: 'ask_done', requestId, allow: false, cancelled: true });
    this.requests.clear();
  }

  private onResult(result: TurnResult) {
    this.info.turns++;
    this.cancelRequests();
    const stopped = this.interrupted;
    this.record({ k: 'end', ok: result.ok, text: result.text.slice(0, 20000), ms: result.ms, stopped: stopped || undefined });
    this.interrupted = false;
    this.apply({ type: 'turn_result' });
    if (this.context.state !== 'wait') return;
    // queued messages leave at once: the session works again, nothing to tell the user
    if (this.info.queued?.length) { this.sendQueued(); return; }
    this.armIdleTimer();
    // a turn the user stopped themselves needs no telling either
    if (!stopped) this.deps.onAttention?.('finished', this.snapshot());
  }

  private pending(requestId: string): PendingRequest {
    const request = this.requests.get(requestId);
    if (!this.process?.alive || !request) throw new Error(st.sessions.requestGone);
    return request;
  }

  answer(requestId: string, decision: PermissionDecision) {
    const request = this.pending(requestId);
    if (request.prompt.questions) throw new Error(st.sessions.questionNotYesNo);
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

  /** Puts a label on the session, or removes it (empty). */
  setTag(tag: string) {
    this.info.tag = tag || undefined;
    this.publish();
  }

  /** Stops the process now. A session without a process is simply marked closed. */
  async close() {
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
    if (!this.process?.alive) return;
    const waiting = this.context.state === 'wait';
    this.stopRequest = waiting ? { reason: 'idle', note: st.sessions.stopped.released } : { reason: 'closed', note: st.sessions.stopped.serverStopped };
    await this.process.stop(waiting ? 500 : 0);
  }

  private armIdleTimer() {
    this.clearIdleTimer();
    // sub-agents still at work in the background would die with the process, and Remote Control with it: it stays
    if (!this.process?.alive || this.info.subagents.length || this.remote) return;
    this.idleTimer = setTimeout(() => {
      if (this.context.state !== 'wait' || !this.process?.alive) return;
      this.stopRequest = { reason: 'idle', note: st.sessions.stopped.idle };
      void this.process.stop(2000);
    }, this.deps.idleMs);
    this.idleTimer.unref();
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private onExit(handle: ProcessHandle, code: number | null, signal: NodeJS.Signals | null, stderr: string) {
    if (this.process !== handle) return;
    this.clearIdleTimer();
    const normalizer = this.normalizer;
    if (this.partialTimer) clearTimeout(this.partialTimer);
    this.partialTimer = null;
    this.partials.clear();
    this.process = null;
    this.normalizer = null;
    this.remote = undefined;
    this.cancelRequests();
    // sub-agents that will not report
    for (const id of normalizer?.present ?? []) this.onEvent({ k: 'leave', who: id, ok: false, tokens: 0, tools: 0, ms: 0 });
    this.info.subagents = [];
    const requested = this.stopRequest;
    this.stopRequest = null;
    if (requested) return this.apply({ type: 'exit', reason: requested.reason }, requested.note);
    if (code === 0 && signal === null) return this.apply({ type: 'exit', reason: 'clean' }, st.sessions.stopped.ended);
    const message = stderr.split('\n').map((line) => line.trim()).filter(Boolean).slice(-3).join(' ')
      || (signal ? st.sessions.killed(signal) : st.sessions.exited(code));
    this.info.error = message;
    this.record({ k: 'error', message });
    this.apply({ type: 'exit', reason: 'failed' }, message);
  }
}

export function newSessionInfo(fields: Pick<SessionInfo, 'id' | 'name' | 'cwd' | 'model' | 'permissionMode'>, now: number): StoredInfo {
  return { ...fields, activeModel: '', state: 'wait', stateSince: now, createdAt: now, turns: 0, subagents: [], command: '', lastMessage: '', resumable: false };
}
