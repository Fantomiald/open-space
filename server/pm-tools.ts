// The pm_* tools of the open-space MCP server (server/mcp.ts): what a project manager (PM) session does to its plan and to
// its workers. Only a PM session gets them (mcp.ts checks it before calling here). The server alone keeps the limits: a PM
// drives its own workers only, never itself nor another session, and never answers a permission or a question of theirs.
// Every change goes through the PM's file (server/pm.ts, server/pm-ops.ts); each result ends with the questions the user
// set aside since the PM last heard, as a second text block.
// mcp.ts imports this file's values: what comes from it is only used inside functions, once both are loaded.
import { askTag, itemStatus, itemTag, type PmFile, type PmItem, PM_TOOL_NAMES, parseTag, type WorkerLive } from '../shared/pm.ts';
import { EFFORTS, type SessionInfo } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { asArray, asString, type Json } from './json.ts';
import { failure, type OpenSpaceApi, type PmApi, shownWait, type Tool, text } from './mcp.ts';
import {
  addAsk, addItem, addLink, dismissedNotice, type Err, forget, type ItemUpdate, linkWorker, nameOf, ownWorker, remember, resolveWorker, setInstructions,
  setMission, settleAsk, unlinkWorker, updateItem,
} from './pm-ops.ts';

type PmToolName = (typeof PM_TOOL_NAMES)[number];

const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const object = (properties: Json, required: string[] = []): Json => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const string = (description: string): Json => ({ type: 'string', description });
const ITEM = string('The task: its tag, e.g. "W3"');
const WORKER = string('The worker\'s session id');
/** The default and the most of a worker's last reply pm_worker_read shows, in characters. */
const LAST_WORDS = { shown: 3000, max: 20000 };

const tools: Record<PmToolName, Omit<Tool, 'name'>> = {
  pm_status: {
    description: 'Your plan as it stands: mission, instructions, numbered memory, tasks (W) under way with their status (finished and dropped ones only counted: pm_item_list has them all), open and answered questions (Q), workers with their state and last report. Call it at the start of every request and after a compaction.',
    inputSchema: object({}), annotations: read,
  },
  pm_set_mission: { description: 'Sets the mission of your project, in a sentence or two (replaces the previous one).', inputSchema: object({ text: { type: 'string' } }, ['text']), annotations: write },
  pm_set_instructions: { description: 'Sets the lasting instructions the user gave you for this project (replaces the previous ones). Only when the user asks for it.', inputSchema: object({ text: { type: 'string' } }, ['text']), annotations: write },
  pm_remember: { description: 'Keeps a note in your memory, with the user\'s yes on its exact wording. Returns its number.', inputSchema: object({ text: { type: 'string' } }, ['text']), annotations: write },
  pm_forget: { description: 'Removes note `number` from your memory; the notes after it move up one number.', inputSchema: object({ number: { type: 'integer' } }, ['number']), annotations: write },
  pm_item_add: {
    description: 'Adds a task to your plan. Returns its tag (W<n>).',
    inputSchema: object({ title: { type: 'string' }, worker: string('One of your workers to put on it (session id, optional)') }, ['title']), annotations: write,
  },
  pm_item_update: {
    description: 'Changes a task. now: what is happening now (replaces the previous one); step: adds a step the user cares about (chore: a minor one); step_done: ticks step n (from 1); wait: what it waits on (W<n>, Q<n> or a text); clear_waits: lifts its waits; status: done (with done, the line worth keeping about what was done), drop (withdraws its open questions), later, restore.',
    inputSchema: object({
      item: ITEM, title: { type: 'string' }, now: { type: 'string' }, step: { type: 'string' }, chore: { type: 'boolean' }, step_done: { type: 'integer' },
      wait: { type: 'string' }, clear_waits: { type: 'boolean' }, status: { type: 'string', enum: ['done', 'drop', 'later', 'restore'] }, done: { type: 'string' },
    }, ['item']),
    annotations: write,
  },
  pm_item_list: { description: 'Lists every task of your plan in full: status, steps, waits, links, the line kept about what was done.', inputSchema: object({}), annotations: read },
  pm_ask: {
    description: 'Asks the user a question for a decision of theirs. Returns its tag (Q<n>); the answer comes as a message "W<n> Q<n>: …". holds: the task cannot move until it is settled.',
    inputSchema: object({
      item: ITEM, title: string('Short'), detail: string('The context, the options and what they change'),
      answers: { type: 'array', items: { type: 'string' }, description: 'The possible answers, 6 at most' }, recommended: string('The answer you recommend, one of answers'), holds: { type: 'boolean' },
    }, ['title', 'detail']),
    annotations: write,
  },
  pm_ask_done: { description: 'Closes a question settled otherwise, or once its answer is acted on.', inputSchema: object({ tag: string('The question: its tag, e.g. "Q3"') }, ['tag']), annotations: write },
  pm_ask_withdraw: { description: 'Withdraws a question that no longer stands.', inputSchema: object({ tag: string('The question: its tag, e.g. "Q3"') }, ['tag']), annotations: write },
  pm_link_add: {
    description: 'Links a PR, an issue or a web address to a task, or to the task of one of your workers.',
    inputSchema: object({ item: ITEM, worker: WORKER, url: { type: 'string' } }, ['url']), annotations: write,
  },
  pm_worker_start: {
    description: 'Starts a worker: a new Open Space session in your project with this brief as its first message, in your permission mode. Its reports come to you on their own. Returns its session id.',
    inputSchema: object({
      title: string('What it works on, in a few words'), brief: string('Its first message: the task, the context, what proves it is done'), item: ITEM,
      cwd: string('Absolute folder, inside the folders Open Space allows (default: yours)'), model: string('Model alias or name (default: the settings\')'),
      effort: { type: 'string', enum: [...EFFORTS] }, isolate: { type: 'boolean', description: 'Works on a branch of its own (a worktree)' },
    }, ['title', 'brief']),
    annotations: write,
  },
  pm_worker_link: {
    description: 'Adopts an existing session of your project as one of your workers, one the user pointed you to; on a task if given.',
    inputSchema: object({ session: WORKER, item: ITEM }, ['session']), annotations: write,
  },
  pm_worker_unlink: { description: 'Lets go of a worker: it is no longer yours.', inputSchema: object({ session: WORKER }, ['session']), annotations: write },
  pm_worker_resolve: { description: 'Closes a worker\'s job: nothing left for it to do; it stays in your plan, no longer driven.', inputSchema: object({ session: WORKER }, ['session']), annotations: write },
  pm_worker_send: { description: 'Sends a message to one of your workers (it waits for the end of a turn under way).', inputSchema: object({ session: WORKER, text: { type: 'string' } }, ['session', 'text']), annotations: write },
  pm_worker_read: {
    description: 'Where one of your workers is: its state, what it waits for from the user, and its last reply.',
    inputSchema: object({ session: WORKER, last: { type: 'integer', description: `How many characters of its last reply (default ${LAST_WORDS.shown}, at most ${LAST_WORDS.max})` } }, ['session']),
    annotations: read,
  },
  pm_worker_stop: { description: 'Stops what one of your workers is doing (like Stop in Open Space); it keeps its conversation.', inputSchema: object({ session: WORKER }, ['session']), annotations: write },
};

/** The tools of a PM session, one per name of PM_TOOL_NAMES. */
export const PM_TOOLS: Tool[] = PM_TOOL_NAMES.map((name) => ({ name, ...tools[name] }));

export const isPmTool = (name: string): name is PmToolName => (PM_TOOL_NAMES as readonly string[]).includes(name);

const isErr = (value: unknown): value is Err => typeof value === 'object' && value !== null && 'error' in value;
/** A result followed by the questions the user set aside, as a block of their own. */
const told = (result: ReturnType<typeof text>, notice: string | undefined): Json => (notice ? { ...result, content: [...result.content, ...text(notice).content] } : result);

/** A task or a question as the PM names it: a tag ("W3", "W4 Q3") or its number; undefined when not given, null when it names none. */
function numberOf(value: unknown, kind: 'item' | 'ask'): number | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  return typeof value === 'string' ? (parseTag(value)?.[kind] ?? null) : null;
}

/** What a worker session is doing now, for the statuses of the tasks. */
const liveOf = (sessions: SessionInfo[]): WorkerLive[] =>
  sessions.map((one) => ({ session: one.id, working: one.state === 'work' || one.state === 'starting', waiting: one.state === 'perm' }));

const shownItem = (item: PmItem, file: PmFile, live: WorkerLive[]) => ({
  tag: itemTag(item.no), title: item.title, status: itemStatus(item, file, live),
  ...(item.now ? { now: item.now } : {}), ...(item.done ? { done: item.done } : {}),
});

/** The PM's plan as pm_status shows it: what is still under way in full, what is over only counted (pm_item_list has it all). */
function status(file: PmFile, sessions: SessionInfo[]) {
  const live = liveOf(sessions);
  const shown = file.items.filter((item) => !item.archived);
  const over = shown.filter((item) => item.state === 'finished' || item.state === 'dropped');
  return {
    mission: file.mission, instructions: file.instructions,
    memory: file.memory.map((note, index) => `${index + 1}. ${note.text}`),
    items: shown.filter((item) => !over.includes(item)).map((item) => shownItem(item, file, live)),
    ...(over.length ? { itemsOver: over.length } : {}),
    asks: file.asks.filter((ask) => ask.state === 'open' || ask.state === 'answered').map((ask) => ({
      tag: `${ask.item ? `${itemTag(ask.item)} ` : ''}${askTag(ask.no)}`, title: ask.title, state: ask.state, holds: ask.holds,
      ...(ask.answer ? { answer: ask.answer } : {}),
    })),
    workers: file.workers.filter((worker) => !worker.resolvedAt).map((worker) => {
      const session = sessions.find((one) => one.id === worker.session);
      return {
        session: worker.session, name: session ? nameOf(session) : null, state: session?.state ?? 'gone', item: worker.item ? itemTag(worker.item) : null,
        lastReport: worker.lastReport ? { kind: worker.lastReport.kind, at: new Date(worker.lastReport.at).toISOString(), line: worker.lastReport.line } : null,
      };
    }),
  };
}

const fullItem = (item: PmItem, file: PmFile, live: WorkerLive[]) => ({
  ...shownItem(item, file, live),
  steps: item.steps.map((step, index) => `${index + 1}. [${step.done ? 'x' : ' '}] ${step.text}${step.chore ? ' (chore)' : ''}`),
  waits: item.waits.filter((wait) => !wait.cleared).map((wait) => (wait.on === 'item' ? itemTag(Number(wait.ref)) : wait.on === 'ask' ? askTag(Number(wait.ref)) : wait.ref)),
  links: item.links.map((link) => ({ url: link.url, kind: link.kind })),
});

/**
 * Runs `edit` on the PM's file, then `after` with its result (what is sent or started once the file allows it). A refusal
 * is the result, with nothing changed nor told; otherwise the result ends with the questions the user set aside, even when
 * `after` fails (they are marked told already).
 */
async function run<T>(pm: PmApi, id: string, edit: (file: PmFile) => T | Err, after?: (value: T) => unknown): Promise<Json> {
  const done = await pm.book.change(id, (file) => {
    const value = edit(file);
    return isErr(value) ? { value } : { value, notice: dismissedNotice(file) };
  });
  if (isErr(done.value)) return failure(done.value.error);
  try {
    const shown = after ? await after(done.value as T) : done.value;
    return told(text(shown ?? 'done'), done.notice);
  } catch (problem) {
    return told(failure(problem instanceof Error ? problem.message : String(problem)), done.notice);
  }
}

/** A worker's linking: `undo` when it is refused or fails, so that no session stays marked as the PM's for nothing. */
async function linking(result: Promise<Json>, undo: () => void): Promise<Json> {
  let linked: Json;
  try {
    linked = await result;
  } catch (problem) {
    undo();
    throw problem;
  }
  if (linked.isError === true) undo();
  return linked;
}

/** Runs pm tool `name` for PM session `pm`, once mcp.ts has checked it is one. */
export async function callPmTool(api: OpenSpaceApi, pm: string, name: string, args: Json): Promise<Json> {
  const book = api.pm;
  if (!book || !isPmTool(name)) return failure(st.triggers.mcp.unknownTool(name));
  const now = book.now();
  const session = asString(args.session).trim();
  const item = numberOf(args.item, 'item');
  if (item === null) return failure(st.pm.badItem);
  /**
   * A session the PM may drive: one of its workers in its file (linked, not resolved) that still is one live: never itself,
   * a session gone, turned PM, or now another PM's.
   */
  const ownOnly = (file: PmFile) => {
    const live = api.sessions().find((one) => one.id === session);
    return (session !== pm && live && !live.pm && live.pmOf === pm && ownWorker(file, session)) || { error: st.pm.notYourWorker(session) };
  };

  switch (name) {
    case 'pm_status': return run(book, pm, (file) => status(file, api.sessions()));
    case 'pm_item_list': return run(book, pm, (file) => {
      const live = liveOf(api.sessions());
      return file.items.filter((one) => !one.archived).map((one) => fullItem(one, file, live));
    });
    case 'pm_set_mission': return run(book, pm, (file) => { setMission(file, asString(args.text)); return 'saved'; });
    case 'pm_set_instructions': return run(book, pm, (file) => { setInstructions(file, asString(args.text)); return 'saved'; });
    case 'pm_remember': return run(book, pm, (file) => remember(file, asString(args.text), now));
    case 'pm_forget': return run(book, pm, (file) => forget(file, typeof args.number === 'number' ? args.number : 0) ?? 'forgotten');
    case 'pm_item_add': return run(book, pm, (file) => {
      const added = addItem(file, asString(args.title), now, asString(args.worker) || undefined);
      return isErr(added) ? added : { item: itemTag(added.no) };
    });
    case 'pm_item_update': {
      if (item === undefined) return failure(st.pm.badItem);
      const update: ItemUpdate = { item };
      for (const key of ['title', 'now', 'step', 'wait', 'done'] as const) if (typeof args[key] === 'string') update[key] = args[key];
      if (args.chore === true) update.chore = true;
      if (args.clear_waits === true) update.clearWaits = true;
      if (typeof args.step_done === 'number') update.stepDone = args.step_done;
      if (args.status === 'done' || args.status === 'drop' || args.status === 'later' || args.status === 'restore') update.status = args.status;
      return run(book, pm, (file) => {
        const changed = updateItem(file, update, now);
        return isErr(changed) ? changed : fullItem(changed, file, liveOf(api.sessions()));
      });
    }
    case 'pm_ask': return run(book, pm, (file) => {
      const answers = asArray(args.answers).filter((one): one is string => typeof one === 'string');
      const asked = addAsk(file, {
        ...(item === undefined ? {} : { item }), title: asString(args.title), detail: asString(args.detail), answers,
        ...(typeof args.recommended === 'string' ? { recommended: args.recommended } : {}), holds: args.holds === true,
      }, now);
      return isErr(asked) ? asked : { ask: askTag(asked.no), ...(asked.item ? { item: itemTag(asked.item) } : {}) };
    });
    case 'pm_ask_done': case 'pm_ask_withdraw': {
      const ask = numberOf(args.tag, 'ask');
      if (!ask) return failure(st.pm.badAsk);
      return run(book, pm, (file) => {
        const settled = settleAsk(file, ask, name === 'pm_ask_done' ? 'done' : 'withdrawn', now);
        return isErr(settled) ? settled : settled.state;
      });
    }
    case 'pm_link_add': return run(book, pm, (file) =>
      addLink(file, { ...(item === undefined ? {} : { item }), ...(asString(args.worker) ? { worker: asString(args.worker) } : {}), url: asString(args.url) }));
    case 'pm_worker_start': {
      const title = asString(args.title).trim();
      const brief = asString(args.brief).trim();
      if (!title) return failure(st.pm.noTitle);
      if (!brief) return failure(st.triggers.mcp.noText);
      // what linking checks, before the session starts: a worker left unlinked would be no one's
      if (item !== undefined && !(await book.book.read(pm)).items.some((one) => one.no === item)) return failure(st.pm.noItem(itemTag(item)));
      const effort = EFFORTS.find((one) => one === args.effort);
      const started = await book.startWorker(pm, {
        title, brief, ...(asString(args.cwd) ? { cwd: asString(args.cwd) } : {}), ...(asString(args.model) ? { model: asString(args.model) } : {}),
        ...(effort ? { effort } : {}), ...(args.isolate === true ? { isolate: true } : {}),
      });
      // started as its worker (pmOf): when it cannot be linked after all, it is let go and stopped
      return linking(
        run(book, pm, (file) => linkWorker(file, started.id, now, item), (linked) => ({ session: started.id, name: nameOf(started), item: linked.item ? itemTag(linked.item) : null })),
        () => { book.releaseWorker(started.id, pm); book.stopWorker(started.id); },
      );
    }
    case 'pm_worker_link': {
      const sessions = api.sessions();
      const self = sessions.find((one) => one.id === pm);
      const target = sessions.find((one) => one.id === session);
      if (!target) return failure(st.triggers.mcp.noSession(session));
      if (target.id === pm) return failure(st.pm.notYourself);
      if (target.pm) return failure(st.pm.otherPm(nameOf(target)));
      if (target.trigger) return failure(st.pm.triggerRun(nameOf(target)));
      if (!self || (target.project ?? target.cwd) !== (self.project ?? self.cwd)) return failure(st.pm.otherProject(nameOf(target)));
      // Adopted as it is: the user's own session, which the user named, keeps its permission mode (only a worker the PM
      // starts takes the PM's). Claimed first, at once, so that two PMs never both adopt it.
      const ours = target.pmOf === pm;
      if (!book.claimWorker(target.id, pm)) return failure(st.pm.othersWorker(nameOf(target)));
      return linking(
        run(book, pm, (file) => linkWorker(file, target.id, now, item), (linked) => ({ session: target.id, name: nameOf(target), item: linked.item ? itemTag(linked.item) : null })),
        () => { if (!ours) book.releaseWorker(target.id, pm); },
      );
    }
    case 'pm_worker_unlink': return run(book, pm, (file) => unlinkWorker(file, session) ?? 'unlinked', (shown) => { book.releaseWorker(session, pm); return shown; });
    case 'pm_worker_resolve': return run(book, pm, (file) => resolveWorker(file, session, now) ?? 'resolved', (shown) => { book.releaseWorker(session, pm); return shown; });
    case 'pm_worker_send': {
      const words = asString(args.text).trim();
      if (!words) return failure(st.triggers.mcp.noText);
      return run(book, pm, ownOnly, () => { api.send(session, words); return 'sent'; });
    }
    case 'pm_worker_read': return run(book, pm, ownOnly, () => {
      const found = api.sessions().find((one) => one.id === session);
      if (!found) return { session, state: 'gone' };
      const last = typeof args.last === 'number' && args.last > 0 ? Math.min(Math.floor(args.last), LAST_WORDS.max) : LAST_WORDS.shown;
      return {
        session, name: nameOf(found), state: found.state, since: new Date(found.stateSince).toISOString(),
        // what kind of wait, never its request id: only the user answers it
        waitsFor: found.permissions.map((wait) => { const { requestId: _requestId, ...shown } = shownWait(wait); return shown; }), lastWords: api.lastWords(session).slice(-last),
      };
    });
    case 'pm_worker_stop': return run(book, pm, (file) => {
      const worker = ownOnly(file);
      if (isErr(worker)) return worker;
      // known before its turn ends, so that the interruption is not reported as a stop of its own
      worker.watch.stopAsked = now;
      return worker;
    }, () => { book.stopWorker(session); return 'stopping'; });
  }
}
