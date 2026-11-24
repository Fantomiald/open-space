// A project manager (PM) session's file: its plan (tasks W, questions Q, memory), its workers and their reports.
// Pure logic shared by the server and the page: tolerant parsing, the status shown for a task, W/Q tags.

const ITEM_STATES = ['moving', 'waiting', 'needs', 'later', 'finished', 'dropped'] as const;
const ASK_STATES = ['open', 'answered', 'done', 'withdrawn', 'dismissed'] as const;
const REPORT_KINDS = ['finished', 'waiting', 'quiet', 'stopped', 'error', 'paused', 'restarted'] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export type AskState = (typeof ASK_STATES)[number];
export type ReportKind = (typeof REPORT_KINDS)[number];
export interface PmStep { text: string; done: boolean; chore: boolean; at: number }
export interface PmWait { on: 'item' | 'ask' | 'text'; ref: string; since: number; cleared?: number }
export interface PmLink { url: string; kind: 'pr' | 'issue' | 'url'; title: string; worker?: string }
export interface PmItem {
  no: number; title: string; state: ItemState; now: string; done: string; steps: PmStep[]; waits: PmWait[]; links: PmLink[];
  touchedTurn: number; createdAt: number; updatedAt: number; archived?: true;
}
export interface PmAsk {
  no: number; item?: number; title: string; detail: string; answers: string[]; recommended?: string; holds: boolean; state: AskState;
  answer?: string; snoozedUntil?: number; dismissalTold?: true; createdAt: number; settledAt?: number;
}
export interface PmWorker {
  session: string; item?: number; linkedAt: number; resolvedAt?: number;
  /** `turns`: the worker's finished turns then (SessionInfo.turns), which a compaction does not move */
  lastReport?: { kind: ReportKind; at: number; line: string; seq: number; turns?: number };
  watch: { quietSince?: number; stopAsked?: number };
}
export interface PmReportRecord { key: string; worker: string; kind: ReportKind; at: number }
export interface PmFile {
  version: 1; mission: string; instructions: string; nextItem: number; nextAsk: number; turn: number;
  memory: { text: string; at: number }[]; items: PmItem[]; asks: PmAsk[]; workers: PmWorker[]; reports: PmReportRecord[];
  // kept as stored until live pages exist
  pages: unknown[];
}

export const PM_LIMITS = {
  memory: 60, note: 600, title: 200, detail: 4000, answers: 6, answer: 80, line: 300, steps: 30, reports: 200, mission: 2000, instructions: 4000, url: 2000,
} as const;

/** How much of a worker's last reply follows its report, and pm_worker_read shows by default, in characters. */
export const REPORT_WORDS = 3000;

/** The tools of the open-space MCP kept for PM sessions, without their `mcp__open-space__` prefix. */
export const PM_TOOL_NAMES = [
  'pm_status', 'pm_set_mission', 'pm_set_instructions', 'pm_remember', 'pm_forget', 'pm_item_add', 'pm_item_update', 'pm_item_list',
  'pm_ask', 'pm_ask_done', 'pm_ask_withdraw', 'pm_link_add', 'pm_worker_start', 'pm_worker_link', 'pm_worker_unlink', 'pm_worker_resolve',
  'pm_worker_send', 'pm_worker_read', 'pm_worker_stop',
] as const;

/**
 * Each pm_* tool with its exact arguments (`?`: optional), told to a PM in its playbook: Claude Code loads a tool's schema
 * only when it is first called, and a model that guesses an argument's name otherwise gets it wrong. The server's schemas
 * (server/pm-tools.ts) are checked against these lines.
 */
export const PM_TOOL_USAGE: Record<(typeof PM_TOOL_NAMES)[number], string> = {
  pm_status: 'pm_status()',
  pm_set_mission: 'pm_set_mission({ mission })',
  pm_set_instructions: 'pm_set_instructions({ instructions })',
  pm_remember: 'pm_remember({ text })',
  pm_forget: 'pm_forget({ number })',
  pm_item_add: 'pm_item_add({ title, worker? })',
  pm_item_update: 'pm_item_update({ item, title?, now?, step?, chore?, step_done?, wait?, clear_waits?, status?: done|drop|later|restore, done? })',
  pm_item_list: 'pm_item_list()',
  pm_ask: 'pm_ask({ title, detail, item?, answers?: [text], recommended?, holds? })',
  pm_ask_done: 'pm_ask_done({ tag })',
  pm_ask_withdraw: 'pm_ask_withdraw({ tag })',
  pm_link_add: 'pm_link_add({ url, item?, worker? })',
  pm_worker_start: 'pm_worker_start({ brief, item?, cwd?, model?, effort?, isolate? })',
  pm_worker_link: 'pm_worker_link({ session, item? })',
  pm_worker_unlink: 'pm_worker_unlink({ session | item })',
  pm_worker_resolve: 'pm_worker_resolve({ session | item })',
  pm_worker_send: 'pm_worker_send({ session | item, text })',
  pm_worker_read: 'pm_worker_read({ session | item, last? })',
  pm_worker_stop: 'pm_worker_stop({ session | item })',
};

/** What a message sent to a PM by Open Space is: a worker's report, the user's answer to a question, or the PM's setup. */
export type PmMessageTag = { report: { worker: string; kind: ReportKind } } | { answer: { ask: number } } | { setup: true };

/** What a message to a PM is by its tag; null for an ordinary message. */
export function pmMessageKind(tag: PmMessageTag | undefined): 'report' | 'answer' | 'setup' | null {
  if (!tag) return null;
  return 'report' in tag ? 'report' : 'answer' in tag ? 'answer' : 'setup';
}

/** Written by Open Space (a PM's setup, a worker's report), not by the user: an answer is the user's own words. */
export const fromOpenSpace = (tag: PmMessageTag | undefined): boolean => { const kind = pmMessageKind(tag); return kind === 'setup' || kind === 'report'; };

/** The PM settings (Preferences.pm): off, no PM tools nor reports; `quietMinutes` of silence before a worker is nudged. */
export interface PmSettings { enabled: boolean; quietMinutes: number; lastModel?: string }
export const PM_QUIET_MINUTES = { min: 2, max: 60 } as const;
export const DEFAULT_PM_SETTINGS: PmSettings = { enabled: true, quietMinutes: 8 };

/** The PM settings of the user's preferences, the defaults when there are none (settings.json of an older version). */
export const pmSettings = (preferences: { pm?: PmSettings }): PmSettings => ({ ...DEFAULT_PM_SETTINGS, ...preferences.pm });

export const SESSION_ID = /^[\w-]{1,100}$/;

export function emptyPm(): PmFile {
  return { version: 1, mission: '', instructions: '', nextItem: 1, nextAsk: 1, turn: 0, memory: [], items: [], asks: [], workers: [], reports: [], pages: [] };
}

// One reader per primitive: a wrong type gives the default (or undefined for an optional field), never an error.
type Raw = Record<string, unknown>;
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const time = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
const count = (value: unknown): number => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0);
const number = (value: unknown): number | undefined => (Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined);
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T | undefined => values.find((one) => one === value);
const session = (value: unknown): string | undefined => (typeof value === 'string' && SESSION_ID.test(value) ? value : undefined);
/** The valid elements of a list, the invalid ones dropped. */
const list = <T>(value: unknown, parse: (raw: Raw) => T | undefined): T[] =>
  (Array.isArray(value) ? value : []).flatMap((raw) => (isRaw(raw) ? (parse(raw) ?? []) : []));
/** The first element for each key: a damaged file could hold two W3, or the same worker twice. */
const firstOfEach = <T>(elements: T[], key: (element: T) => unknown): T[] => elements.filter((element, index) => elements.findIndex((other) => key(other) === key(element)) === index);
/** An optional field, absent rather than undefined, so that a file reads back exactly as written. */
const optional = <K extends string, V>(key: K, value: V | undefined | false | 0 | ''): { [key in K]?: V } =>
  (value === undefined || value === false || value === 0 || value === '' ? {} : { [key]: value }) as { [key in K]?: V };

const parseStep = (raw: Raw): PmStep | undefined =>
  (typeof raw.text === 'string' && raw.text ? { text: text(raw.text, PM_LIMITS.line), done: raw.done === true, chore: raw.chore === true, at: time(raw.at) } : undefined);

const parseWait = (raw: Raw): PmWait | undefined => {
  const on = oneOf(raw.on, ['item', 'ask', 'text'] as const);
  const ref = text(raw.ref, PM_LIMITS.line);
  // a wait on a task or a question keeps its bare number ("2"), even when it was stored as "Q2"
  const tagged = on !== 'text' && /^[wq]?(\d{1,9})$/i.exec(ref.trim());
  return on && { on, ref: tagged ? String(Number(tagged[1])) : ref, since: time(raw.since), ...optional('cleared', time(raw.cleared)) };
};

// a truncated address would lead elsewhere: one too long is dropped, like one that is not a web page
const parseLink = (raw: Raw): PmLink | undefined =>
  (typeof raw.url === 'string' && raw.url.length <= PM_LIMITS.url && /^https?:\/\/\S/i.test(raw.url)
    ? { url: raw.url, kind: oneOf(raw.kind, ['pr', 'issue', 'url'] as const) ?? 'url', title: text(raw.title, PM_LIMITS.title), ...optional('worker', session(raw.worker)) }
    : undefined);

const parseItem = (raw: Raw): PmItem | undefined => {
  const no = number(raw.no);
  return no === undefined ? undefined : {
    no, title: text(raw.title, PM_LIMITS.title), state: oneOf(raw.state, ITEM_STATES) ?? 'moving', now: text(raw.now, PM_LIMITS.line), done: text(raw.done, PM_LIMITS.line),
    steps: list(raw.steps, parseStep).slice(0, PM_LIMITS.steps), waits: list(raw.waits, parseWait), links: list(raw.links, parseLink),
    touchedTurn: count(raw.touchedTurn), createdAt: time(raw.createdAt), updatedAt: time(raw.updatedAt), ...optional('archived', raw.archived === true),
  };
};

const parseAsk = (raw: Raw): PmAsk | undefined => {
  const no = number(raw.no);
  const answers = (Array.isArray(raw.answers) ? raw.answers : []).filter((answer) => typeof answer === 'string' && answer).map((answer) => text(answer, PM_LIMITS.answer));
  return no === undefined ? undefined : {
    no, ...optional('item', number(raw.item)), title: text(raw.title, PM_LIMITS.title), detail: text(raw.detail, PM_LIMITS.detail),
    answers: answers.slice(0, PM_LIMITS.answers), ...optional('recommended', text(raw.recommended, PM_LIMITS.answer)),
    holds: raw.holds === true, state: oneOf(raw.state, ASK_STATES) ?? 'open',
    // a free answer typed by the user may be longer than an offered one
    ...optional('answer', text(raw.answer, PM_LIMITS.detail)), ...optional('snoozedUntil', time(raw.snoozedUntil)),
    ...optional('dismissalTold', raw.dismissalTold === true), createdAt: time(raw.createdAt), ...optional('settledAt', time(raw.settledAt)),
  };
};

const parseReport = (raw: Raw): PmWorker['lastReport'] => {
  const kind = oneOf(raw.kind, REPORT_KINDS);
  return kind && { kind, at: time(raw.at), line: text(raw.line, PM_LIMITS.line), seq: count(raw.seq), ...optional('turns', count(raw.turns)) };
};

const parseWorker = (raw: Raw): PmWorker | undefined => {
  const id = session(raw.session);
  const watch = isRaw(raw.watch) ? raw.watch : {};
  return id === undefined ? undefined : {
    session: id, ...optional('item', number(raw.item)), linkedAt: time(raw.linkedAt), ...optional('resolvedAt', time(raw.resolvedAt)),
    ...optional('lastReport', isRaw(raw.lastReport) ? parseReport(raw.lastReport) : undefined),
    watch: { ...optional('quietSince', time(watch.quietSince)), ...optional('stopAsked', time(watch.stopAsked)) },
  };
};

/** The tag of a message to a PM as stored (a queued message in sessions.json); undefined when it is not one. */
export function parsePmTag(raw: unknown): PmMessageTag | undefined {
  if (!isRaw(raw)) return undefined;
  if (raw.setup === true) return { setup: true };
  if (isRaw(raw.report)) {
    const worker = session(raw.report.worker);
    const kind = oneOf(raw.report.kind, REPORT_KINDS);
    return worker && kind ? { report: { worker, kind } } : undefined;
  }
  const ask = isRaw(raw.answer) ? number(raw.answer.ask) : undefined;
  return ask === undefined ? undefined : { answer: { ask } };
}

const parseReportRecord = (raw: Raw): PmReportRecord | undefined => {
  const kind = oneOf(raw.kind, REPORT_KINDS);
  return typeof raw.key === 'string' && raw.key && typeof raw.worker === 'string' && kind ? { key: raw.key, worker: raw.worker, kind, at: time(raw.at) } : undefined;
};

/** A PM file as stored, whatever its state: what does not fit takes its default, the rest is kept. */
export function parsePmFile(raw: unknown): PmFile {
  if (!isRaw(raw)) return emptyPm();
  const items = firstOfEach(list(raw.items, parseItem), (item) => item.no);
  const asks = firstOfEach(list(raw.asks, parseAsk), (ask) => ask.no);
  // a W or Q number is never handed out twice, even when the counter was lost
  const next = (stored: unknown, taken: { no: number }[]) => taken.reduce((first, one) => Math.max(first, one.no + 1), number(stored) ?? 1);
  return {
    version: 1, mission: text(raw.mission, PM_LIMITS.mission), instructions: text(raw.instructions, PM_LIMITS.instructions),
    nextItem: next(raw.nextItem, items), nextAsk: next(raw.nextAsk, asks), turn: count(raw.turn),
    // notes are numbered from the first: keeping the first 60 keeps their numbers
    memory: list(raw.memory, (note) => (typeof note.text === 'string' && note.text ? { text: text(note.text, PM_LIMITS.note), at: time(note.at) } : undefined)).slice(0, PM_LIMITS.memory),
    items, asks, workers: firstOfEach(list(raw.workers, parseWorker), (worker) => worker.session),
    reports: list(raw.reports, parseReportRecord).slice(-PM_LIMITS.reports),
    pages: Array.isArray(raw.pages) ? raw.pages : [],
  };
}

export type ShownStatus = 'dropped' | 'done' | 'blocked' | 'needsYou' | 'inProgress' | 'waiting' | 'idle' | 'later';
/** What a worker session is doing now; `waiting` is a permission or a question waiting for the user. */
export interface WorkerLive { session: string; working: boolean; waiting: boolean }

/** The waits of a task not lifted yet: a wait on a question ends once it is settled, on a task once it is finished or dropped,
 * and on either once it is gone. */
export function openWaits(item: PmItem, file: PmFile): PmWait[] {
  return item.waits.filter((wait) => {
    if (wait.cleared) return false;
    if (wait.on === 'ask') return file.asks.find((ask) => String(ask.no) === wait.ref)?.state === 'open';
    if (wait.on === 'item') {
      const state = file.items.find((other) => String(other.no) === wait.ref)?.state;
      return state !== undefined && state !== 'finished' && state !== 'dropped';
    }
    return true;
  });
}

/** The status shown for a task: the first rule that applies, in this order. */
export function itemStatus(item: PmItem, file: PmFile, live: readonly WorkerLive[]): ShownStatus {
  if (item.state === 'dropped') return 'dropped';
  if (item.state === 'finished') return 'done';
  if (file.asks.some((ask) => ask.item === item.no && ask.holds && ask.state === 'open')) return 'blocked';
  const workers = file.workers.filter((worker) => worker.item === item.no && !worker.resolvedAt)
    .flatMap((worker) => live.filter((one) => one.session === worker.session));
  if (workers.some((one) => one.waiting)) return 'needsYou';
  if (workers.some((one) => one.working)) return 'inProgress';
  if (openWaits(item, file).length) return 'waiting';
  if (item.state === 'later') return 'later';
  // the PM touched it during its current turn or the one before
  return item.touchedTurn >= file.turn - 1 ? 'inProgress' : 'idle';
}

export const itemTag = (no: number): string => `W${no}`;
export const askTag = (no: number): string => `Q${no}`;
/** A question's tag with its task's before it: "W4 Q3", or "Q3" for a question about no task. */
export const fullAskTag = (ask: Pick<PmAsk, 'item' | 'no'>): string => `${ask.item ? `${itemTag(ask.item)} ` : ''}${askTag(ask.no)}`;

/** "W4", "Q12" or "W4 Q3" (either order, any case), the whole text and nothing else; null for any other text. */
export function parseTag(text: string): { item?: number; ask?: number } | null {
  const words = text.trim().split(/\s+/);
  const tag: { item?: number; ask?: number } = {};
  for (const word of words) {
    const match = /^([wq])([1-9]\d{0,8})$/i.exec(word);
    const key = match?.[1].toLowerCase() === 'w' ? 'item' : 'ask';
    if (!match || tag[key] !== undefined) return null;
    tag[key] = Number(match[2]);
  }
  return tag;
}

/** The message that carries the user's answer to the PM: "W4 Q3: iPhone only", or "Q3: …" for a question about no task. */
export function answerMessage(ask: PmAsk, answer: string): string {
  return `${fullAskTag(ask)}: ${answer}`;
}
