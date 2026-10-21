import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { costOf, dayOf, type CostReport, type Tokens } from '../shared/usage.ts';
import { UsageLedger } from './usage.ts';

const base = mkdtempSync(path.join(os.tmpdir(), 'office-usage-'));
after(() => rmSync(base, { recursive: true, force: true }));

const NOW = new Date(2026, 9, 20, 15, 0, 0).getTime();
const at = (hours: number, minutes = 0) => new Date(2026, 9, 20, hours, minutes, 5).toISOString();

interface Answer { id: string; time: string; session?: string; model?: string; input?: number; output?: number; written?: number; split?: [number, number]; fast?: boolean; request?: string }
/** One assistant line of a transcript, as Claude Code writes it. */
function answer(options: Answer): string {
  const usage: Record<string, unknown> = { input_tokens: options.input ?? 1, cache_creation_input_tokens: options.written ?? 0, cache_read_input_tokens: 0, output_tokens: options.output ?? 1 };
  if (options.split) usage.cache_creation = { ephemeral_1h_input_tokens: options.split[0], ephemeral_5m_input_tokens: options.split[1] };
  if (options.fast) usage.speed = 'fast';
  return `${JSON.stringify({ type: 'assistant', timestamp: options.time, sessionId: options.session ?? 's1', cwd: '/work/app', requestId: options.request ?? `req_${options.id}`, message: { id: options.id, model: options.model ?? 'claude-opus-5-5', usage } })}\n`;
}
const userLine = (time: string, session = 's1') => `${JSON.stringify({ type: 'user', timestamp: time, sessionId: session, cwd: '/work/app', message: { content: 'hi' } })}\n`;

function setup(name: string) {
  const home = path.join(base, name);
  const folder = path.join(home, '.claude', 'projects', '-work-app');
  mkdirSync(path.join(folder, 's1', 'subagents'), { recursive: true });
  const ledger = () => new UsageLedger({ home, cacheFile: path.join(home, 'cache.json'), log: () => {}, now: () => NOW });
  return { main: path.join(folder, 's1.jsonl'), sub: path.join(folder, 's1', 'subagents', 'agent-a.jsonl'), cache: path.join(home, 'cache.json'), ledger };
}

const sum = (report: CostReport): Tokens => report.models.reduce((total, row) => ({
  input: total.input + row.tokens.input, output: total.output + row.tokens.output, cacheWrite5m: total.cacheWrite5m + row.tokens.cacheWrite5m,
  cacheWrite1h: total.cacheWrite1h + row.tokens.cacheWrite1h, cacheRead: total.cacheRead + row.tokens.cacheRead,
}), { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });

describe('usage ledger', () => {
  it('counts a message once, splits cache writes, flags fast, skips synthetic', async () => {
    const files = setup('basic');
    writeFileSync(files.main, userLine(at(9)) + answer({ id: 'm1', time: at(9, 1), input: 10, output: 5, written: 300, split: [200, 100] }).repeat(3)
      + answer({ id: 'm2', time: at(9, 2), input: 2, written: 50 })
      + answer({ id: 'm3', time: at(10), fast: true, input: 1000 })
      + answer({ id: 'm4', time: at(10), model: '<synthetic>', input: 99 })
      + 'not json "usage"\n');
    const report = await files.ledger().report(false);
    assert.deepEqual(sum(report), { input: 1012, output: 7, cacheWrite5m: 150, cacheWrite1h: 200, cacheRead: 0 });
    const fast = report.models.filter((row) => row.fast);
    assert.equal(fast.length, 1);
    assert.equal(fast[0].tokens.input, 1000);
    assert.equal(report.models.reduce((turns, row) => turns + row.turns, 0), 3);
    assert.equal(report.projects[0].project, '/work/app');
    assert.equal(costOf('claude-opus-5-5', { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 1_000_000, cacheRead: 0 }), 8);
  });

  it('adds a sub-agent file to its conversation without counting a minute twice', async () => {
    const files = setup('subagent');
    writeFileSync(files.main, userLine(at(9)) + answer({ id: 'm1', time: at(9, 1), input: 5 }));
    writeFileSync(files.sub, userLine(at(9, 1)) + answer({ id: 'a1', time: at(9, 2), input: 7 }));
    const report = await files.ledger().report(false);
    assert.equal(sum(report).input, 12);
    assert.equal(report.conversations.length, 1);
    assert.equal(report.conversations[0].id, 's1');
    assert.equal(report.conversations[0].minutes, 3, '9:00, 9:01 (in both files), 9:02');
    assert.deepEqual(report.conversations[0].days, [dayOf(NOW)]);
    assert.deepEqual(report.hours, [{ day: dayOf(NOW), hour: 9, minutes: 3 }]);
  });

  it('reads only what was appended, and again from the start when a file shrinks', async () => {
    const files = setup('incremental');
    writeFileSync(files.main, answer({ id: 'm1', time: at(9), input: 5 }));
    const ledger = files.ledger();
    assert.equal(sum(await ledger.report(true)).input, 5);
    appendFileSync(files.main, answer({ id: 'm1', time: at(9), input: 5 }) + answer({ id: 'm2', time: at(9, 1), input: 6 }));
    assert.equal(sum(await ledger.report(true)).input, 11, 'm1 repeated across the reads is not counted again');
    writeFileSync(files.main, answer({ id: 'm9', time: at(11), input: 3 }));
    assert.equal(sum(await ledger.report(true)).input, 3, 'a shorter file replaces what it had');
  });

  it('keeps the report for a minute unless asked for a fresh one', async () => {
    const files = setup('fresh');
    writeFileSync(files.main, answer({ id: 'm1', time: at(9), input: 5 }));
    const ledger = files.ledger();
    await ledger.report(false);
    appendFileSync(files.main, answer({ id: 'm2', time: at(9, 1), input: 6 }));
    assert.equal(sum(await ledger.report(false)).input, 5);
    assert.equal(sum(await ledger.report(true)).input, 11);
  });

  it('reloads its cache: a new ledger reads only the growth', async () => {
    const files = setup('cache');
    writeFileSync(files.main, answer({ id: 'm1', time: at(9), input: 5 }));
    const first = await files.ledger().report(false);
    const second = files.ledger();
    assert.deepEqual(second.current()?.models, first.models);
    assert.equal(second.current()?.scanning, false);
    // same size and date: not read again, so a change that keeps them (a rewrite of the same length) goes unseen
    assert.deepEqual((await second.report(false)).models, first.models);
    appendFileSync(files.main, answer({ id: 'm2', time: at(9, 1), input: 6 }));
    assert.equal(sum(await second.report(true)).input, 11);
  });

  it('leaves out what is older than 90 days', async () => {
    const files = setup('old');
    const old = new Date(2026, 9, 20 - 95, 9, 0, 5).toISOString();
    const edge = new Date(2026, 9, 20 - 89, 9, 0, 5).toISOString();
    writeFileSync(files.main, userLine(old) + answer({ id: 'm1', time: old, input: 50 }) + answer({ id: 'm2', time: edge, input: 7 }));
    const report = await files.ledger().report(false);
    assert.equal(sum(report).input, 7);
    assert.equal(report.conversations[0].minutes, 1);
  });
});
