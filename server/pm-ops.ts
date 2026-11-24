// The changes a project manager (PM) makes to its plan, on a PM file held in memory: no I/O (server/pm.ts stores the file).
// Each one changes `file` in place and gives its result, or `{ error }` with a text for the PM and the file left untouched:
// everything is checked before anything is changed. What is written reads back as is through parsePmFile (shared/pm.ts),
// so a text too long is cut to its limit, while what the parser would drop (an empty text, an address too long) is refused.
// `now` is a time in ms, above 0: the parser reads 0 as no time at all.
import { askTag, itemTag, openWaits, PM_LIMITS, type PmAsk, type PmFile, type PmItem, type PmLink, type PmWait, type PmWorker, parseTag, SESSION_ID } from '../shared/pm.ts';
import type { SessionInfo } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';

export type Err = { error: string };

/** A session's name as the PM reads it: one line of 80 characters at most (the user or an agent named it). */
export const nameOf = (session: SessionInfo) => session.name.replace(/\s+/g, ' ').trim().slice(0, 80);

// caps on what the PM may add, so that one file stays small
const MAX_ITEMS = 500;
const MAX_ASKS = 1000;
const MAX_LINKS = 30;
const MAX_WAITS = 10;

const fail = (error: string): Err => ({ error });
const clean = (text: string, max: number): string => text.trim().slice(0, max);
const findItem = (file: PmFile, no: number): PmItem | undefined => file.items.find((item) => item.no === no);
const findAsk = (file: PmFile, no: number): PmAsk | undefined => file.asks.find((ask) => ask.no === no);

export function setMission(file: PmFile, text: string): void {
  file.mission = clean(text, PM_LIMITS.mission);
}

export function setInstructions(file: PmFile, text: string): void {
  file.instructions = clean(text, PM_LIMITS.instructions);
}

/** Keeps a note; its number is its place in the memory, from 1. */
export function remember(file: PmFile, text: string, now: number): { number: number } | Err {
  const note = clean(text, PM_LIMITS.note);
  if (!note) return fail(st.pm.emptyNote);
  if (file.memory.length >= PM_LIMITS.memory) return fail(st.pm.memoryFull(PM_LIMITS.memory));
  file.memory.push({ text: note, at: now });
  return { number: file.memory.length };
}

/** Forgets note `number`; the notes after it move up one number. */
export function forget(file: PmFile, number: number): Err | undefined {
  if (!Number.isInteger(number) || number < 1 || number > file.memory.length) return fail(st.pm.noNote(number));
  file.memory.splice(number - 1, 1);
}

/** A new task, numbered after every task there ever was; `worker` (one of the PM's own) is put on it. */
export function addItem(file: PmFile, title: string, now: number, worker?: string): PmItem | Err {
  const name = clean(title, PM_LIMITS.title);
  if (!name) return fail(st.pm.noTitle);
  if (file.items.length >= MAX_ITEMS) return fail(st.pm.tooManyItems(MAX_ITEMS));
  const own = worker === undefined ? undefined : ownWorker(file, worker);
  if (worker !== undefined && !own) return fail(st.pm.notYourWorker(worker));
  const item: PmItem = {
    no: file.nextItem++, title: name, state: 'moving', now: '', done: '', steps: [], waits: [], links: [], touchedTurn: file.turn, createdAt: now, updatedAt: now,
  };
  file.items.push(item);
  if (own) own.item = item.no;
  return item;
}

export interface ItemUpdate {
  item: number; title?: string; now?: string; step?: string; stepDone?: number; chore?: boolean; wait?: string; clearWaits?: boolean;
  status?: 'done' | 'drop' | 'later' | 'restore'; done?: string;
}

/** What a wait text points at: "W3" a task, "Q2" (or "W4 Q2") a question, both kept by number; any other text as is. */
function waitOn(file: PmFile, text: string): Pick<PmWait, 'on' | 'ref'> | Err {
  const ref = clean(text, PM_LIMITS.line);
  const tag = parseTag(ref);
  if (tag?.ask !== undefined) return findAsk(file, tag.ask) ? { on: 'ask', ref: String(tag.ask) } : fail(st.pm.noAsk(askTag(tag.ask)));
  if (tag?.item !== undefined) return findItem(file, tag.item) ? { on: 'item', ref: String(tag.item) } : fail(st.pm.noItem(itemTag(tag.item)));
  return ref ? { on: 'text', ref } : fail(st.pm.emptyWait);
}

/**
 * Changes a task: `step` adds a step (a chore with `chore`), `stepDone` ticks step n (from 1), `clearWaits` lifts every wait
 * still holding it (a text wait lifts no other way), then `wait` adds one. `status`: 'done' needs `done`, the line kept about
 * what was done, and leaves its open questions open; 'drop' withdraws them; both lift its waits; 'restore' puts a finished,
 * dropped or later task back in motion. The task counts as touched in the PM's turn.
 */
export function updateItem(file: PmFile, update: ItemUpdate, now: number): PmItem | Err {
  const item = findItem(file, update.item);
  if (!item) return fail(st.pm.noItem(itemTag(update.item)));
  const tag = itemTag(item.no);
  const title = update.title === undefined ? undefined : clean(update.title, PM_LIMITS.title);
  if (title === '') return fail(st.pm.noTitle);
  const step = update.step === undefined ? undefined : clean(update.step, PM_LIMITS.line);
  if (step === '') return fail(st.pm.emptyStep);
  if (step !== undefined && item.steps.length >= PM_LIMITS.steps) return fail(st.pm.tooManySteps(tag, PM_LIMITS.steps));
  const ticked = update.stepDone;
  if (ticked !== undefined && !(Number.isInteger(ticked) && item.steps[ticked - 1])) return fail(st.pm.noStep(tag, ticked));
  const wait = update.wait === undefined ? undefined : waitOn(file, update.wait);
  if (wait && 'error' in wait) return wait;
  // the cap counts only the waits still holding the task
  const waits = update.clearWaits ? [] : openWaits(item, file);
  const known = wait && waits.some((one) => one.on === wait.on && one.ref === wait.ref);
  if (wait && !known && waits.length >= MAX_WAITS) return fail(st.pm.tooManyWaits(tag, MAX_WAITS));
  const done = update.done === undefined ? undefined : clean(update.done, PM_LIMITS.line);
  if (update.status === 'done' && !done) return fail(st.pm.doneNeedsLine);

  if (title !== undefined) item.title = title;
  if (update.now !== undefined) item.now = clean(update.now, PM_LIMITS.line);
  if (step !== undefined) item.steps.push({ text: step, done: false, chore: update.chore === true, at: now });
  if (ticked !== undefined) item.steps[ticked - 1].done = true;
  const lift = () => { for (const one of openWaits(item, file)) one.cleared = now; };
  if (update.clearWaits) lift();
  // a new wait lets go of the lifted ones, so the list stays short
  if (wait && !known) item.waits = [...openWaits(item, file), { ...wait, since: now }];
  if (done !== undefined) item.done = done;
  if (update.status === 'done' || update.status === 'drop') lift();
  if (update.status === 'done') item.state = 'finished';
  if (update.status === 'later') item.state = 'later';
  if (update.status === 'restore') item.state = 'moving';
  if (update.status === 'drop') {
    item.state = 'dropped';
    for (const ask of file.asks) if (ask.item === item.no && ask.state === 'open') Object.assign(ask, { state: 'withdrawn', settledAt: now });
  }
  item.touchedTurn = file.turn;
  item.updatedAt = now;
  return item;
}

/** A new question, about task `item` or none; `recommended` is one of `answers`, `holds` blocks the task until settled. */
export function addAsk(
  file: PmFile, ask: { item?: number; title: string; detail: string; answers?: string[]; recommended?: string; holds?: boolean }, now: number,
): PmAsk | Err {
  const title = clean(ask.title, PM_LIMITS.title);
  if (!title) return fail(st.pm.noTitle);
  if (file.asks.length >= MAX_ASKS) return fail(st.pm.tooManyAsks(MAX_ASKS));
  if (ask.item !== undefined && !findItem(file, ask.item)) return fail(st.pm.noItem(itemTag(ask.item)));
  const answers = (ask.answers ?? []).map((answer) => clean(answer, PM_LIMITS.answer)).filter(Boolean);
  if (answers.length > PM_LIMITS.answers) return fail(st.pm.tooManyAnswers(PM_LIMITS.answers));
  const recommended = clean(ask.recommended ?? '', PM_LIMITS.answer);
  if (recommended && !answers.includes(recommended)) return fail(st.pm.notAnAnswer(recommended));
  const created: PmAsk = {
    no: file.nextAsk++, ...(ask.item === undefined ? {} : { item: ask.item }), title, detail: clean(ask.detail, PM_LIMITS.detail), answers,
    ...(recommended ? { recommended } : {}), holds: ask.holds === true, state: 'open', createdAt: now,
  };
  file.asks.push(created);
  return created;
}

/** Closes a question still open or answered: done with, or withdrawn by the PM. */
export function settleAsk(file: PmFile, no: number, how: 'done' | 'withdrawn', now: number): PmAsk | Err {
  const ask = findAsk(file, no);
  if (!ask) return fail(st.pm.noAsk(askTag(no)));
  if (ask.state !== 'open' && ask.state !== 'answered') return fail(st.pm.askSettled(askTag(no)));
  Object.assign(ask, { state: how, settledAt: now });
  return ask;
}

/** The user's answer to an open question; a question takes one answer only. */
export function answerAsk(file: PmFile, no: number, answer: string, now: number): PmAsk | Err {
  const ask = findAsk(file, no);
  if (!ask) return fail(st.pm.noAsk(askTag(no)));
  if (ask.state !== 'open') return fail(st.pm.askNotOpen(askTag(no)));
  const text = clean(answer, PM_LIMITS.detail);
  if (!text) return fail(st.pm.emptyAnswer);
  Object.assign(ask, { state: 'answered', answer: text, settledAt: now });
  return ask;
}

/** Links a web address to task `item`, or to the task of `worker` (one of the PM's workers) when no task is given. */
export function addLink(file: PmFile, link: { item?: number; worker?: string; url: string }): PmLink | Err {
  const url = link.url.trim();
  // the same test as parsePmFile, which drops any other address
  if (!/^https?:\/\/\S/i.test(url)) return fail(st.pm.badUrl);
  if (url.length > PM_LIMITS.url) return fail(st.pm.urlTooLong(PM_LIMITS.url));
  const worker = link.worker === undefined ? undefined : file.workers.find((one) => one.session === link.worker);
  if (link.worker !== undefined && !worker) return fail(st.pm.notYourWorker(link.worker));
  const no = link.item ?? worker?.item;
  if (no === undefined) return fail(st.pm.linkNeedsItem);
  const item = findItem(file, no);
  if (!item) return fail(st.pm.noItem(itemTag(no)));
  const kept = item.links.find((one) => one.url === url);
  if (kept) return kept;
  if (item.links.length >= MAX_LINKS) return fail(st.pm.tooManyLinks(itemTag(no), MAX_LINKS));
  const path = url.replace(/^https?:\/\/[^/]*/i, '');
  const kind = /\/(pull|merge_requests)\//.test(path) ? 'pr' : /\/issues\//.test(path) ? 'issue' : 'url';
  const created: PmLink = { url, kind, title: '', ...(worker ? { worker: worker.session } : {}) };
  item.links.push(created);
  return created;
}

/** Makes `session` one of the PM's workers, on task `item` if given; a worker resolved before is taken back. */
export function linkWorker(file: PmFile, session: string, now: number, item?: number): PmWorker | Err {
  if (!SESSION_ID.test(session)) return fail(st.pm.badId(session));
  if (item !== undefined && !findItem(file, item)) return fail(st.pm.noItem(itemTag(item)));
  const kept = file.workers.find((one) => one.session === session);
  if (kept) {
    delete kept.resolvedAt;
    if (item !== undefined) kept.item = item;
    return kept;
  }
  const worker: PmWorker = { session, ...(item === undefined ? {} : { item }), linkedAt: now, watch: {} };
  file.workers.push(worker);
  return worker;
}

/** Lets go of a worker: it is no longer the PM's. */
export function unlinkWorker(file: PmFile, session: string): Err | undefined {
  const index = file.workers.findIndex((one) => one.session === session);
  if (index < 0) return fail(st.pm.notYourWorker(session));
  file.workers.splice(index, 1);
}

/** Closes a worker's job: kept in the file, no longer the PM's to drive. Resolving it again keeps the first time. */
export function resolveWorker(file: PmFile, session: string, now: number): Err | undefined {
  const worker = file.workers.find((one) => one.session === session);
  if (!worker) return fail(st.pm.notYourWorker(session));
  worker.resolvedAt ??= now;
}

/** One of the PM's workers it may still drive: linked and not resolved. */
export function ownWorker(file: PmFile, session: string): PmWorker | undefined {
  return file.workers.find((one) => one.session === session && !one.resolvedAt);
}

/** The footer of a pm_* result: the questions the user set aside that the PM was not told about yet, then marked told. */
export function dismissedNotice(file: PmFile): string {
  const untold = file.asks.filter((ask) => ask.state === 'dismissed' && !ask.dismissalTold);
  for (const ask of untold) ask.dismissalTold = true;
  return untold.length ? st.pm.dismissed(untold.map((ask) => askTag(ask.no)).join(', ')) : '';
}
