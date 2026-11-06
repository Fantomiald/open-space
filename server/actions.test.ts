import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { asArray, asJson } from './json.ts';
import { MAX_OUTPUT_LINES, toolOutput } from './actions.ts';

/** The results of fixtures/actions-turn.jsonl (claude -p 2.1.318: a Bash printing seven lines, a Read of cart.js, a Grep). */
const results = readFileSync(new URL('./fixtures/actions-turn.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean)
  .map((line) => asJson(JSON.parse(line))).filter((event) => event.type === 'user')
  .map((event) => ({ block: asJson(asArray(asJson(event.message).content)[0]), result: asJson(event.tool_use_result) }));
const [bash, read, grep] = results;

describe('what a tool call gave back, for the thread', () => {
  it('keeps the lines a command wrote, and how many there were', () => {
    assert.deepEqual(toolOutput('Bash', bash.block.content, bash.result), { lines: ['ligne 1', 'ligne 2', 'ligne 3', 'ligne 4', 'ligne 5', 'ligne 6', 'ligne 7'], total: 7 });
  });

  it('only counts the lines of a file read, as Claude Code says it', () => {
    assert.deepEqual(toolOutput('Read', read.block.content, read.result), { lines: [], total: 8, read: true });
  });

  it('keeps what a search found', () => {
    const found = toolOutput('Grep', grep.block.content, grep.result);
    assert.equal(found?.lines[0], 'cart.js:1:export function total(items) {');
    assert.equal(found?.total, found?.lines.length);
  });

  it('leaves out what Claude Code adds for the model, and a call without output', () => {
    assert.deepEqual(toolOutput('mcp__x__y', [{ type: 'text', text: 'done' }, { type: 'text', text: '<system-reminder>Prefer browser_batch.</system-reminder>' }], {}), { lines: ['done'], total: 1 });
    assert.equal(toolOutput('Bash', '', {}), null);
  });

  it('keeps a long output short, counting all its lines, and says nothing for the calls shown as a diff', () => {
    const long = toolOutput('Bash', Array.from({ length: 500 }, (_, at) => `l${at}`).join('\n'), {});
    assert.equal(long?.total, 500);
    assert.equal(long?.lines.length, MAX_OUTPUT_LINES);
    assert.equal(toolOutput('Edit', 'The file was updated.', {}), null);
  });
});
