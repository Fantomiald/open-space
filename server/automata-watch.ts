// Watches the external runs' folder (Preferences.automataFolder), read-only: every few seconds the run files that
// changed are read again (server/automata.ts makes sense of them), and the end of the transcript of each
// run at work is followed, its sub-agents' too. Nothing is ever written there, no process is started: a run's process
// is only asked whether it still exists (signal 0). Memory stays bounded: a transcript is read from its last
// TAIL_BYTES, then by pieces, and only a run's last events are kept (RunThread).
import { open, readdir, readFile, stat, type FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NO_AUTOMATA, RUN_ID, type AutomataState, type AutomatonRun } from '../shared/automata.ts';
import type { LoggedEvent, ServerMessage } from '../shared/protocol.ts';
import { readRoles } from './agent-roles.ts';
import { agentsAtWork, automataState, parseRun, recordsOf, RunThread, withLiveness } from './automata.ts';
import { agentLaunch, CONVERSATION_ID, projectFolder } from './conversations.ts';
import { resolveDirectory } from './paths.ts';

const POLL_MS = 2000;
/** The largest run file read. */
const MAX_FILE = 64 * 1024;
/** The most run files looked at (the newest names first): a program's history may grow for ever. */
const MAX_FILES = 2000;
/** Where a transcript is first read from its end, then how much of what was added is read at a time. */
const TAIL_BYTES = 512 * 1024;
const PIECE_BYTES = 1024 * 1024;
/** A line longer than this (a huge tool result) is skipped rather than kept waiting for its end. */
const MAX_LINE = 4 * 1024 * 1024;
const MAX_SUBAGENTS = 20;
/** The threads of ended runs kept for the page, the last opened ones. */
const KEPT_THREADS = 8;

/** Whether a process id still exists: signal 0 checks without sending anything (EPERM: it exists, someone else's). */
export function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** The end of a growing file, read piece by piece; a line cut at the end waits for the rest. */
class Tail {
  private offset = -1;
  private rest = '';
  private readonly file: string;
  constructor(file: string) { this.file = file; }

  /** The whole lines added since the last read (the first time, those of its last TAIL_BYTES); nothing when there is no file. */
  async read(): Promise<string> {
    let handle: FileHandle;
    try { handle = await open(this.file, 'r'); } catch { return ''; }
    try {
      const { size } = await handle.stat();
      let skipFirst = false;
      // first read, or the file shrank (rewritten): from its end
      if (this.offset < 0 || size < this.offset) {
        this.offset = Math.max(0, size - TAIL_BYTES);
        this.rest = '';
        skipFirst = this.offset > 0;
      }
      const length = Math.min(PIECE_BYTES, size - this.offset);
      if (length <= 0) return '';
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, this.offset);
      this.offset += bytesRead;
      let text = this.rest + buffer.subarray(0, bytesRead).toString('utf8');
      if (skipFirst) text = text.slice(text.indexOf('\n') + 1);
      const cut = text.lastIndexOf('\n');
      this.rest = text.slice(cut + 1);
      if (this.rest.length > MAX_LINE) this.rest = '';
      return cut < 0 ? '' : text.slice(0, cut);
    } finally {
      await handle.close();
    }
  }
}

/** A run's transcript and its sub-agents', turned into its thread as they grow. */
class Follower {
  readonly thread: RunThread;
  private readonly main: Tail;
  private readonly subs = new Map<string, { tail: Tail; parent: string; type: string; description: string }>();
  private readonly run: AutomatonRun;
  private readonly home: string;

  constructor(run: AutomatonRun, home: string) {
    this.run = run;
    this.home = home;
    this.thread = new RunThread(run.cwd);
    this.main = new Tail(path.join(projectFolder(run.cwd, home), `${run.sessionId}.jsonl`));
  }

  async step() {
    for (const record of recordsOf(await this.main.read())) this.thread.add(record);
    const folder = path.join(projectFolder(this.run.cwd, this.home), this.run.sessionId, 'subagents');
    let names: string[] = [];
    try { names = (await readdir(folder)).filter((name) => /^agent-\w+\.jsonl$/.test(name)).sort(); } catch { /* none yet */ }
    for (const name of names) {
      const agentId = name.slice('agent-'.length, -'.jsonl'.length);
      if (!this.subs.has(agentId)) {
        if (this.subs.size >= MAX_SUBAGENTS) continue;
        const launch = agentLaunch(this.run.cwd, this.run.sessionId, agentId, this.home);
        if (!launch) continue;
        this.subs.set(agentId, { tail: new Tail(path.join(folder, name)), parent: launch.call, type: launch.type, description: launch.description ?? '' });
      }
      const sub = this.subs.get(agentId)!;
      const records = recordsOf(await sub.tail.read());
      // once it has written something: its Agent call, read just before in the run's transcript, names it first
      if (records.length) this.thread.subagent(sub.parent, sub.type, sub.description);
      for (const record of records) this.thread.add(record, sub.parent);
    }
  }
}

/** Whether a run's transcript can be looked for: a conversation id and a full folder, as Claude Code keys them. */
const hasTranscript = (run: AutomatonRun) => CONVERSATION_ID.test(run.sessionId) && path.isAbsolute(run.cwd);

interface Cached<T> { mtime: number; size: number; value: T | null }

export interface AutomataWatchOptions {
  /** the folder of the settings, '' when the feature is off */
  folder: () => string;
  broadcast: (message: ServerMessage) => void;
  log: (message: string, error?: unknown) => void;
  home?: string;
  alive?: (pid: number) => boolean;
}

export class AutomataWatch {
  state: AutomataState = NO_AUTOMATA;
  private readonly options: AutomataWatchOptions;
  private readonly home: string;
  private readonly files = new Map<string, Cached<unknown>>();
  /** the runs at work whose transcripts are followed, by run id */
  private readonly following = new Map<string, Follower>();
  /** the threads of ended runs the page asked for, the last ones */
  private readonly kept = new Map<string, RunThread>();
  private polling = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(options: AutomataWatchOptions) {
    this.options = options;
    this.home = options.home ?? os.homedir();
  }

  start() {
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, POLL_MS);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  /** Reads what changed, tells the pages, and follows the transcripts of the runs at work. */
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const read = await this.read();
      await this.follow(read.running);
      // the sub-agents at work, as their run's transcript tells them so far
      const working = new Map([...this.following].map(([id, follower]) => [id, follower.thread.working()]));
      const next = { ...read, agents: agentsAtWork(read.running, working) };
      if (JSON.stringify(next) !== JSON.stringify(this.state)) {
        this.state = next;
        this.options.broadcast({ t: 'automata', state: next });
      }
    } catch (error) {
      this.options.log('automatons', error);
    } finally {
      this.polling = false;
    }
  }

  private async read(): Promise<AutomataState> {
    const setting = this.options.folder();
    if (!setting) { this.files.clear(); return NO_AUTOMATA; }
    const root = resolveDirectory(setting, this.home);
    if (!root) return { ...NO_AUTOMATA, folder: 'missing' };
    const seen = new Set<string>();
    const parse = (text: string, id: string) => parseRun(JSON.parse(text), id);
    // runs/ at the root, or state/runs/ (the layout of the first program that used it)
    const runs = [
      ...await this.readKind<AutomatonRun>(path.join(root, 'runs'), '.json', seen, parse),
      ...await this.readKind<AutomatonRun>(path.join(root, 'state', 'runs'), '.json', seen, parse),
    ];
    for (const file of this.files.keys()) if (!seen.has(file)) this.files.delete(file);
    const alive = this.options.alive ?? processAlive;
    const unique = [...new Map(runs.map((run) => [run.id, run])).values()];
    return automataState(unique.map((run) => withLiveness(run, alive)), await readRoles(path.join(root, '.claude', 'agents')));
  }

  /** The files of one kind in a folder, each read again only when its size or change time moved. */
  private async readKind<T>(folder: string, extension: string, seen: Set<string>, parse: (text: string, id: string) => T | null): Promise<T[]> {
    let names: string[];
    try { names = (await readdir(folder)).filter((name) => name.endsWith(extension) && RUN_ID.test(name.slice(0, -extension.length))); } catch { return []; }
    const found: T[] = [];
    for (const name of names.sort().reverse().slice(0, MAX_FILES)) {
      const file = path.join(folder, name);
      seen.add(file);
      try {
        const info = await stat(file);
        if (!info.isFile()) continue;
        const cached = this.files.get(file);
        let value = cached && cached.mtime === info.mtimeMs && cached.size === info.size ? cached.value as T | null : undefined;
        if (value === undefined) {
          // a file written while being read is read again at the next look (its size or time moves)
          try { value = info.size <= MAX_FILE ? parse(await readFile(file, 'utf8'), name.slice(0, -extension.length)) : null; } catch { value = null; }
          this.files.set(file, { mtime: info.mtimeMs, size: info.size, value });
        }
        if (value) found.push(value);
      } catch { /* gone meanwhile */ }
    }
    return found;
  }

  private async follow(running: readonly AutomatonRun[]) {
    const now = new Set(running.map((run) => run.id));
    // an ended run: what its transcript got last is read once more, then its thread is kept for the page
    for (const [id, follower] of this.following) {
      if (now.has(id)) continue;
      await this.step(id, follower);
      this.following.delete(id);
      this.keep(id, follower.thread);
    }
    for (const run of running) {
      if (!hasTranscript(run)) continue;
      let follower = this.following.get(run.id);
      if (!follower) { follower = new Follower(run, this.home); this.following.set(run.id, follower); }
      await this.step(run.id, follower);
    }
  }

  private async step(id: string, follower: Follower) {
    await follower.step();
    const events = follower.thread.take();
    if (events.length) this.options.broadcast({ t: 'automatonEvents', runId: id, events });
  }

  private keep(id: string, thread: RunThread) {
    this.kept.delete(id);
    this.kept.set(id, thread);
    while (this.kept.size > KEPT_THREADS) this.kept.delete(this.kept.keys().next().value!);
  }

  /** A run's thread so far, for the page: followed, kept, or read once from the end of its transcript. */
  async thread(runId: string): Promise<{ events: LoggedEvent[]; truncated: boolean }> {
    const followed = this.following.get(runId)?.thread ?? this.kept.get(runId);
    if (followed) return { events: [...followed.events], truncated: followed.truncated };
    const run = [...this.state.running, ...this.state.recent].find((candidate) => candidate.id === runId);
    if (!run || !hasTranscript(run)) return { events: [], truncated: false };
    const follower = new Follower(run, this.home);
    await follower.step();
    follower.thread.take();
    this.keep(runId, follower.thread);
    return { events: [...follower.thread.events], truncated: follower.thread.truncated };
  }
}

