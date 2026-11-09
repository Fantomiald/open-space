// The triggers (shared/triggers.ts): kept in OFFICE_DIR/triggers.json (0600, written atomically), fired by the clock
// (cron, checked every 20 s, once per minute that matches), by a webhook (POST /hooks/<id>/<token>, server/http.ts), by
// the page ("Lancer maintenant") or by an agent through the open-space MCP server. A firing starts an ordinary session
// through the same path as the page (index.ts startSession: crew name, trust rules, Remote Control), marked with the
// trigger. A webhook trigger runs up to PARALLEL_HOOK_RUNS sessions at once (one per call); the calls beyond wait in a
// queue, kept in memory, and start as runs end (starting, at work, or waiting for a permission counts as working). A
// cron trigger runs one at a time: a firing while its previous run works is skipped, the next minute will come. A
// minute missed while Open Space was stopped is not caught up, nor is a call still queued when it stopped.
import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { cronMatches, minuteOf, parseCron } from '../shared/cron.ts';
import type { SessionInfo } from '../shared/protocol.ts';
import {
  KEPT_RUNS, MAX_HOOK_BODY, MAX_QUEUED, MAX_TRIGGERS, PARALLEL_HOOK_RUNS, parseTriggerInput, RUN_OUTCOMES, RUN_SOURCES, TRIGGER_ID,
  type Trigger, type TriggerError, type TriggerInput, type TriggerRun, type TriggerRunSource,
} from '../shared/triggers.ts';
import { st } from './i18n/index.ts';
import { asArray, asNumber, asString, isJson } from './json.ts';
import { secretsMatch } from './security.ts';

const CHECK_MS = 20_000;
/** how often the queues look for a run that ended */
const DRAIN_MS = 2_000;
const BUSY: ReadonlySet<SessionInfo['state']> = new Set(['starting', 'work', 'perm']);

export const newTriggerId = () => randomBytes(8).toString('hex');
const newRunId = newTriggerId;
export const newToken = () => randomBytes(32).toString('base64url');

/**
 * The first message of a run: the trigger's prompt, then what a webhook sent, as data in a block of its own whose
 * fence carries a random word (the sender cannot close it early), never as instructions.
 */
export function runPrompt(prompt: string, payload: string | null, fence = randomBytes(6).toString('hex')): string {
  if (payload === null) return prompt;
  let body = payload.slice(0, MAX_HOOK_BODY);
  try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* sent as text */ }
  const tag = `webhook-data-${fence}`;
  return `${prompt}\n\n${st.prompt.webhookData(tag)}\n<${tag}>\n${body}\n</${tag}>`;
}

/** Whether a session of a previous run is still busy (`state`: its state, or null when it is gone). */
export const stillBusy = (state: SessionInfo['state'] | null) => state !== null && BUSY.has(state);

function parseStored(raw: unknown): { triggers: Trigger[]; runs: TriggerRun[] } {
  if (!isJson(raw)) return { triggers: [], runs: [] };
  const triggers = asArray(raw.triggers).flatMap((entry): Trigger[] => {
    if (!isJson(entry) || !TRIGGER_ID.test(asString(entry.id))) return [];
    const parsed = parseTriggerInput(entry);
    const token = asString(entry.token);
    return 'input' in parsed ? [{ ...parsed.input, id: asString(entry.id), token: token.length >= 32 ? token : newToken(), createdAt: asNumber(entry.createdAt) }] : [];
  }).slice(0, MAX_TRIGGERS);
  const runs = asArray(raw.runs).flatMap((entry): TriggerRun[] => {
    if (!isJson(entry) || !TRIGGER_ID.test(asString(entry.triggerId))) return [];
    const source = RUN_SOURCES.find((known) => known === entry.source);
    const outcome = RUN_OUTCOMES.find((known) => known === entry.outcome);
    if (!source || !outcome) return [];
    const sessionId = asString(entry.sessionId);
    const id = asString(entry.id);
    // the queue lived in memory: a call still waiting when Open Space stopped is lost, and said so
    const lost = outcome === 'queued';
    const error = lost ? st.triggers.lostInQueue : asString(entry.error).slice(0, 300);
    return [{
      id: TRIGGER_ID.test(id) ? id : newRunId(), triggerId: asString(entry.triggerId), at: asNumber(entry.at), source, outcome: lost ? 'failed' : outcome,
      ...(/^[\w-]{1,100}$/.test(sessionId) ? { sessionId } : {}), ...(error ? { error } : {}),
    }];
  }).slice(0, KEPT_RUNS);
  return { triggers, runs };
}

export interface TriggersOptions {
  file: string;
  /** starts the run's session the way the page does (index.ts); throws when it cannot (folder not trusted, outside the roots) */
  start: (trigger: Trigger, prompt: string) => Promise<SessionInfo>;
  /** the state of a session, null when it is gone */
  sessionState: (sessionId: string) => SessionInfo['state'] | null;
  /** the real folder when it is inside the allowed roots, else null */
  allowedFolder: (cwd: string) => string | null;
  /** the triggers or their runs changed */
  onChange: () => void;
  log: (message: string, error?: unknown) => void;
  now?: () => number;
}

export class Triggers {
  private triggers: Trigger[] = [];
  private runs: TriggerRun[] = [];
  private readonly options: TriggersOptions;
  private readonly now: () => number;
  /** the minute each cron trigger last fired in */
  private readonly firedIn = new Map<string, number>();
  /** sessions being started, by trigger */
  private readonly firing = new Map<string, number>();
  /** the webhook calls waiting their turn, by trigger, oldest first */
  private readonly queues = new Map<string, { run: TriggerRun; payload: string | null }[]>();
  private timer: NodeJS.Timeout | undefined;
  private drainTimer: NodeJS.Timeout | undefined;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(options: TriggersOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  async load() {
    try { ({ triggers: this.triggers, runs: this.runs } = parseStored(JSON.parse(await readFile(this.options.file, 'utf8')))); } catch { /* none yet */ }
  }

  start() {
    this.timer = setInterval(() => this.tick(), CHECK_MS);
    this.timer.unref();
    this.drainTimer = setInterval(() => this.drain(), DRAIN_MS);
    this.drainTimer.unref();
  }

  stop() { clearInterval(this.timer); clearInterval(this.drainTimer); }

  list(): Trigger[] { return this.triggers.map((trigger) => ({ ...trigger })); }
  recentRuns(): TriggerRun[] { return this.runs.map((run) => ({ ...run })); }
  get(id: string): Trigger | undefined { return this.triggers.find((trigger) => trigger.id === id); }

  /** Adds a trigger (`id` undefined) or changes one; its folder must lie in the allowed roots. */
  async save(id: string | undefined, input: TriggerInput): Promise<{ trigger: Trigger } | { error: TriggerError }> {
    const cwd = this.options.allowedFolder(input.cwd);
    if (!cwd) return { error: 'folder' };
    const checked = { ...input, cwd };
    let trigger: Trigger;
    if (id === undefined) {
      if (this.triggers.length >= MAX_TRIGGERS) return { error: 'tooMany' };
      trigger = { ...checked, id: newTriggerId(), token: newToken(), createdAt: this.now() };
      this.triggers.push(trigger);
    } else {
      const index = this.triggers.findIndex((candidate) => candidate.id === id);
      if (index < 0) return { error: 'unknown' };
      trigger = { ...this.triggers[index], ...checked };
      this.triggers[index] = trigger;
    }
    await this.store();
    return { trigger: { ...trigger } };
  }

  async remove(id: string) {
    const before = this.triggers.length;
    this.triggers = this.triggers.filter((trigger) => trigger.id !== id);
    if (this.triggers.length === before) return false;
    this.runs = this.runs.filter((run) => run.triggerId !== id);
    this.queues.delete(id);
    await this.store();
    return true;
  }

  /** Takes a waiting call out of its queue. */
  async cancel(runId: string) {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex((entry) => entry.run.id === runId);
      if (index < 0) continue;
      queue.splice(index, 1)[0].run.outcome = 'cancelled';
      await this.store();
      return true;
    }
    return false;
  }

  /** The trigger a webhook names, when its token matches (constant time) and it is a webhook trigger turned on. */
  hook(id: string, token: string): Trigger | null {
    const trigger = this.get(id);
    return trigger && trigger.kind === 'webhook' && trigger.enabled && secretsMatch(trigger.token, token) ? trigger : null;
  }

  /** Every cron trigger turned on whose expression matches this minute, once. */
  tick() {
    const now = this.now();
    const minute = minuteOf(now);
    for (const trigger of this.triggers) {
      if (trigger.kind !== 'cron' || !trigger.enabled || this.firedIn.get(trigger.id) === minute) continue;
      const cron = parseCron(trigger.cron);
      if (!cron || !cronMatches(cron, now)) continue;
      this.firedIn.set(trigger.id, minute);
      void this.fire(trigger.id, 'cron');
    }
  }

  /**
   * Starts a run, or queues it when a webhook trigger already works at its limit (a cron trigger's is skipped instead).
   * `payload`: what a webhook sent. A test run is in plan mode: the session says what it would do and changes nothing.
   */
  async fire(id: string, source: TriggerRunSource, payload: string | null = null): Promise<TriggerRun> {
    const run: TriggerRun = { id: newRunId(), triggerId: id, at: this.now(), source, outcome: 'queued' };
    const trigger = this.get(id);
    if (!trigger) return { ...run, outcome: 'failed', error: st.triggers.unknown };
    const queue = this.queues.get(id) ?? [];
    if (!queue.length && this.room(trigger) > 0) return this.launch(trigger, run, payload);
    if (trigger.kind !== 'webhook') return this.record({ ...run, outcome: 'skipped', error: st.triggers.stillBusy });
    if (queue.length >= MAX_QUEUED) return this.record({ ...run, outcome: 'skipped', error: st.triggers.queueFull });
    queue.push({ run, payload });
    this.queues.set(id, queue);
    return this.record(run);
  }

  /** Starts the waiting calls that now have room, oldest first; a paused trigger keeps its own waiting. */
  drain() {
    for (const [id, queue] of this.queues) {
      const trigger = this.get(id);
      if (!trigger) { this.queues.delete(id); continue; }
      while (trigger.enabled && queue.length && this.room(trigger) > 0) {
        const { run, payload } = queue.shift()!;
        void this.launch(trigger, run, payload);
      }
      if (!queue.length) this.queues.delete(id);
    }
  }

  /** How many more runs of this trigger may start now. */
  private room(trigger: Trigger) {
    const working = this.runs.filter((run) => run.triggerId === trigger.id && run.outcome === 'started' && run.sessionId && stillBusy(this.options.sessionState(run.sessionId))).length;
    return (trigger.kind === 'webhook' ? PARALLEL_HOOK_RUNS : 1) - working - (this.firing.get(trigger.id) ?? 0);
  }

  /** Starts the session of a run (counted at once, so the room is right before it is up); a queued run is updated in place. */
  private async launch(saved: Trigger, run: TriggerRun, payload: string | null): Promise<TriggerRun> {
    // a test changes nothing: plan mode, and none of the rules that let it act without asking
    const trigger = run.source === 'test' ? { ...saved, permissionMode: 'plan' as const, allowedTools: [] } : saved;
    this.firing.set(trigger.id, (this.firing.get(trigger.id) ?? 0) + 1);
    try {
      const session = await this.options.start(trigger, runPrompt(trigger.prompt, payload));
      Object.assign(run, { outcome: 'started', sessionId: session.id });
    } catch (error) {
      this.options.log(`trigger ${trigger.name}`, error);
      Object.assign(run, { outcome: 'failed', error: (error instanceof Error ? error.message : String(error)).slice(0, 300) });
    } finally {
      this.firing.set(trigger.id, (this.firing.get(trigger.id) ?? 1) - 1);
    }
    if (this.runs.includes(run)) await this.store();
    else await this.record(run);
    return run;
  }

  private async record(run: TriggerRun): Promise<TriggerRun> {
    this.runs = [run, ...this.runs].slice(0, KEPT_RUNS);
    await this.store();
    return run;
  }

  private store(): Promise<void> {
    this.options.onChange();
    const write = this.writes.then(async () => {
      const temporary = `${this.options.file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ triggers: this.triggers, runs: this.runs }, null, 2), { mode: 0o600 });
      await rename(temporary, this.options.file);
    });
    this.writes = write.catch((error: unknown) => this.options.log('cannot save the triggers', error));
    return write;
  }
}
