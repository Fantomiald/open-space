import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { answerMessage, emptyPm, itemStatus, PM_LIMITS, type PmAsk, type PmFile, type PmItem, type PmWorker, parsePmFile, parseTag, type ShownStatus, type WorkerLive } from './pm.ts';

const item = (no: number, more: Partial<PmItem> = {}): PmItem => ({
  no, title: `Task ${no}`, state: 'moving', now: '', done: '', steps: [], waits: [], links: [], touchedTurn: 0, createdAt: 1, updatedAt: 1, ...more,
});
const ask = (no: number, more: Partial<PmAsk> = {}): PmAsk => ({ no, title: `Question ${no}`, detail: '', answers: [], holds: false, state: 'open', createdAt: 1, ...more });
const worker = (session: string, more: Partial<PmWorker> = {}): PmWorker => ({ session, linkedAt: 1, watch: {}, ...more });
const pm = (more: Partial<PmFile> = {}): PmFile => ({ ...emptyPm(), ...more });

describe('reading a PM file', () => {
  it('starts empty when there is no file, or nothing readable in it', () => {
    const empty = {
      version: 1, mission: '', instructions: '', nextItem: 1, nextAsk: 1, turn: 0,
      memory: [], items: [], asks: [], workers: [], reports: [], pages: [],
    };
    for (const raw of [undefined, null, '{"mission":', [], 42]) assert.deepEqual(parsePmFile(raw), empty, String(raw));
    assert.deepEqual(emptyPm(), empty);
  });

  it('gives a new file each time, so changing one leaves the next untouched', () => {
    emptyPm().items.push(item(1));
    assert.deepEqual(emptyPm().items, []);
  });

  it('reads back what it wrote, optional fields present or not', () => {
    const file: PmFile = {
      version: 1, mission: 'Ship the app', instructions: 'French only', nextItem: 3, nextAsk: 3, turn: 7,
      memory: [{ text: 'Uses pnpm', at: 5 }],
      items: [
        item(1, {
          state: 'finished', done: 'Merged', touchedTurn: 6, archived: true,
          steps: [{ text: 'Write tests', done: true, chore: false, at: 2 }],
          waits: [{ on: 'ask', ref: '2', since: 3, cleared: 4 }, { on: 'text', ref: 'Bob', since: 3 }],
          links: [{ url: 'https://github.com/o/r/pull/3', kind: 'pr', title: 'PR', worker: 'w-1' }, { url: 'https://example.com', kind: 'url', title: '' }],
        }),
        item(2, { state: 'later' }),
      ],
      asks: [
        ask(1, { item: 2, answers: ['iPhone', 'Both'], recommended: 'Both', holds: true, state: 'answered', answer: 'Both', snoozedUntil: 9, dismissalTold: true, settledAt: 8 }),
        ask(2),
      ],
      workers: [
        worker('w-1', { item: 1, resolvedAt: 9, lastReport: { kind: 'finished', at: 8, line: 'Done', seq: 4, turns: 3 }, watch: { quietSince: 5, stopAsked: 7 } }),
        worker('w-2'),
      ],
      reports: [{ key: 'w-1:4', worker: 'w-1', kind: 'finished', at: 8 }],
      pages: [{ id: 'p1', anything: [1, 2] }],
    };
    assert.deepEqual(parsePmFile(JSON.parse(JSON.stringify(file))), file);
  });

  it('drops an element without a usable number and gives a bad field its default, keeping the rest', () => {
    const file = parsePmFile({ version: 2, mission: 42, instructions: 'Be brief', items: [{ no: 'x' }, { no: 3, title: 'A', state: 'bogus' }] });
    assert.equal(file.version, 1, 'a file of a later version still loads');
    assert.equal(file.mission, '');
    assert.equal(file.instructions, 'Be brief');
    assert.deepEqual(file.items, [item(3, { title: 'A', createdAt: 0, updatedAt: 0 })]);
  });

  it('drops a worker, a report or a link that says nothing usable', () => {
    const file = parsePmFile({
      items: [{ no: 1, links: [{ url: 42 }, { url: 'javascript:alert(1)' }, { url: `https://x.test/${'a'.repeat(PM_LIMITS.url)}` }, { url: 'https://x.test' }] }],
      workers: [{ session: '../x' }, { session: 'w-1' }],
      reports: [{ key: '', worker: 'w-1', kind: 'finished', at: 1 }, { key: 'k', worker: 'w-1', kind: 'bogus', at: 1 }, { key: 'k', worker: 'w-1', kind: 'quiet', at: 1 }],
    });
    assert.deepEqual(file.items[0].links.map((link) => link.url), ['https://x.test']);
    assert.deepEqual(file.workers.map((one) => one.session), ['w-1']);
    assert.deepEqual(file.reports, [{ key: 'k', worker: 'w-1', kind: 'quiet', at: 1 }]);
  });

  it('keeps the first of two tasks with the same number, and of the same worker twice', () => {
    const file = parsePmFile({ items: [{ no: 1, title: 'A' }, { no: 1, title: 'B' }], workers: [{ session: 'w', item: 1 }, { session: 'w', item: 2 }] });
    assert.deepEqual(file.items.map((one) => one.title), ['A']);
    assert.deepEqual(file.workers.map((one) => one.item), [1]);
  });

  it('reads a wait stored with its tag as a wait on that number', () => {
    const file = parsePmFile({ turn: 5, items: [{ no: 1, touchedTurn: 5, waits: [{ on: 'ask', ref: 'Q2' }] }], asks: [{ no: 2 }] });
    assert.equal(itemStatus(file.items[0], file, []), 'waiting');
  });

  it('never hands out a W or Q number already taken', () => {
    const file = parsePmFile({ nextItem: 1, nextAsk: 2, items: [{ no: 5, title: 'A' }, { no: 2 }], asks: [{ no: 4, title: 'Q' }] });
    assert.equal(file.nextItem, 6);
    assert.equal(file.nextAsk, 5);
    assert.equal(parsePmFile({ nextItem: 9, items: [{ no: 5 }] }).nextItem, 9, 'a number used then removed stays used');
  });

  it('keeps texts and lists within their limits', () => {
    const long = (size: number) => 'x'.repeat(size + 10);
    const file = parsePmFile({
      mission: long(PM_LIMITS.mission), instructions: long(PM_LIMITS.instructions),
      memory: Array.from({ length: 70 }, (_, index) => ({ text: index === 0 ? long(PM_LIMITS.note) : `note ${index}`, at: index })),
      items: [{ no: 1, title: long(PM_LIMITS.title), now: long(PM_LIMITS.line), done: long(PM_LIMITS.line), steps: Array.from({ length: 40 }, () => ({ text: 'step' })) }],
      asks: [{ no: 1, title: long(PM_LIMITS.title), detail: long(PM_LIMITS.detail), answers: Array.from({ length: 8 }, () => long(PM_LIMITS.answer)) }],
      reports: Array.from({ length: 210 }, (_, index) => ({ key: `k${index}`, worker: 'w', kind: 'finished', at: index })),
    });
    assert.equal(file.mission.length, PM_LIMITS.mission);
    assert.equal(file.instructions.length, PM_LIMITS.instructions);
    assert.equal(file.memory.length, PM_LIMITS.memory);
    assert.equal(file.memory[0].text.length, PM_LIMITS.note);
    assert.equal(file.memory.at(-1)?.text, 'note 59', 'the first notes are kept, so that their numbers stay');
    assert.equal(file.items[0].title.length, PM_LIMITS.title);
    assert.equal(file.items[0].now.length, PM_LIMITS.line);
    assert.equal(file.items[0].done.length, PM_LIMITS.line);
    assert.equal(file.items[0].steps.length, PM_LIMITS.steps);
    assert.equal(file.asks[0].title.length, PM_LIMITS.title);
    assert.equal(file.asks[0].detail.length, PM_LIMITS.detail);
    assert.equal(file.asks[0].answers.length, PM_LIMITS.answers);
    assert.equal(file.asks[0].answers[0].length, PM_LIMITS.answer);
    assert.equal(file.reports.length, PM_LIMITS.reports);
    assert.equal(file.reports[0].key, 'k10', 'the latest reports are the ones kept');
  });
});

describe('the status shown for a task', () => {
  const linked = (session: string) => worker(session, { item: 1 });
  const cases: { name: string; task: PmItem; file?: Partial<PmFile>; live?: WorkerLive[]; expected: ShownStatus }[] = [
    { name: 'dropped', task: item(1, { state: 'dropped' }), expected: 'dropped' },
    {
      name: 'finished, even with its worker at work', task: item(1, { state: 'finished' }),
      file: { workers: [linked('w')] }, live: [{ session: 'w', working: true, waiting: false }], expected: 'done',
    },
    { name: 'an open question that holds it', task: item(1), file: { asks: [ask(1, { item: 1, holds: true })] }, expected: 'blocked' },
    {
      name: 'an open question that holds it, even with its worker waiting', task: item(1), file: { asks: [ask(1, { item: 1, holds: true })], workers: [linked('w')] },
      live: [{ session: 'w', working: false, waiting: true }], expected: 'blocked',
    },
    { name: 'an open question that does not hold it', task: item(1), file: { turn: 5, asks: [ask(1, { item: 1 })] }, expected: 'idle' },
    { name: 'a holding question already answered', task: item(1), file: { turn: 5, asks: [ask(1, { item: 1, holds: true, state: 'answered' })] }, expected: 'idle' },
    {
      name: 'its worker waits for a permission or an answer', task: item(1, { state: 'later' }),
      file: { workers: [linked('a'), linked('b')] }, live: [{ session: 'a', working: true, waiting: false }, { session: 'b', working: false, waiting: true }], expected: 'needsYou',
    },
    { name: 'its worker works', task: item(1, { state: 'later' }), file: { workers: [linked('w')] }, live: [{ session: 'w', working: true, waiting: false }], expected: 'inProgress' },
    {
      name: 'a worker of another task, or one resolved, does not count', task: item(1), file: { turn: 5, workers: [worker('a', { item: 2 }), worker('b', { item: 1, resolvedAt: 3 })] },
      live: [{ session: 'a', working: true, waiting: true }, { session: 'b', working: true, waiting: true }], expected: 'idle',
    },
    {
      name: 'its worker works, even while the task waits', task: item(1, { waits: [{ on: 'text', ref: 'Bob', since: 1 }] }), file: { workers: [linked('w')] },
      live: [{ session: 'w', working: true, waiting: false }], expected: 'inProgress',
    },
    { name: 'a wait on an open question', task: item(1, { waits: [{ on: 'ask', ref: '2', since: 1 }] }), file: { asks: [ask(2)] }, expected: 'waiting' },
    ...(['answered', 'done', 'withdrawn', 'dismissed'] as const).map((state) => ({
      name: `a wait on a question ${state}`, task: item(1, { waits: [{ on: 'ask' as const, ref: '2', since: 1 }] }), file: { turn: 5, asks: [ask(2, { state })] }, expected: 'idle' as const,
    })),
    { name: 'a wait on an unfinished task', task: item(1, { waits: [{ on: 'item', ref: '2', since: 1 }] }), file: { items: [item(2)] }, expected: 'waiting' },
    { name: 'a wait on a finished task', task: item(1, { waits: [{ on: 'item', ref: '2', since: 1 }] }), file: { turn: 5, items: [item(2, { state: 'finished' })] }, expected: 'idle' },
    { name: 'a wait on a dropped task', task: item(1, { waits: [{ on: 'item', ref: '2', since: 1 }] }), file: { turn: 5, items: [item(2, { state: 'dropped' })] }, expected: 'idle' },
    { name: 'a wait on a task that is gone', task: item(1, { waits: [{ on: 'item', ref: '9', since: 1 }] }), file: { turn: 5 }, expected: 'idle' },
    { name: 'a wait on something else', task: item(1, { waits: [{ on: 'text', ref: 'Bob', since: 1 }] }), expected: 'waiting' },
    { name: 'a wait, even on a task touched this turn', task: item(1, { touchedTurn: 5, waits: [{ on: 'text', ref: 'Bob', since: 1 }] }), file: { turn: 5 }, expected: 'waiting' },
    { name: 'a wait on something else, cleared', task: item(1, { waits: [{ on: 'text', ref: 'Bob', since: 1, cleared: 2 }] }), file: { turn: 5 }, expected: 'idle' },
    { name: 'touched by the PM this turn', task: item(1, { touchedTurn: 5 }), file: { turn: 5 }, expected: 'inProgress' },
    { name: 'touched by the PM the turn before', task: item(1, { touchedTurn: 4 }), file: { turn: 5 }, expected: 'inProgress' },
    { name: 'left alone for longer', task: item(1, { touchedTurn: 3 }), file: { turn: 5 }, expected: 'idle' },
    ...(['waiting', 'needs'] as const).flatMap((state) => [
      { name: `stored as ${state}, touched this turn`, task: item(1, { state, touchedTurn: 5 }), file: { turn: 5 }, expected: 'inProgress' as const },
      { name: `stored as ${state}, left alone`, task: item(1, { state, touchedTurn: 3 }), file: { turn: 5 }, expected: 'idle' as const },
    ]),
    { name: 'put off for later', task: item(1, { state: 'later' }), file: { turn: 5 }, expected: 'later' },
  ];
  for (const { name, task, file, live, expected } of cases) {
    it(`${expected}: ${name}`, () => {
      assert.equal(itemStatus(task, pm({ ...file, items: [task, ...(file?.items ?? [])] }), live ?? []), expected);
    });
  }
});

describe('W and Q tags', () => {
  it('reads a task, a question or both, whatever the case', () => {
    assert.deepEqual(parseTag('w4 q3'), { item: 4, ask: 3 });
    assert.deepEqual(parseTag(' Q3 W4 '), { item: 4, ask: 3 });
    assert.deepEqual(parseTag('W4'), { item: 4 });
    assert.deepEqual(parseTag('Q12'), { ask: 12 });
  });

  it('takes anything else as plain text', () => {
    for (const text of ['bonjour', 'wait for W4', 'W4 W5', 'W0', 'W', '']) assert.equal(parseTag(text), null, text);
  });

  it('puts the question, and its task when it has one, before the answer', () => {
    assert.equal(answerMessage(ask(3, { item: 4 }), 'iPhone only'), 'W4 Q3: iPhone only');
    assert.equal(answerMessage(ask(3), 'iPhone only'), 'Q3: iPhone only');
  });
});
