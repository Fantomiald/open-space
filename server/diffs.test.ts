import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { asJson } from './json.ts';
import { fileDiff, MAX_DIFF_LINES } from './diffs.ts';

/** The tool results of fixtures/edit-turn.jsonl (claude -p 2.1.318: an Edit of cart.js, then a Write creating notes.md). */
const results = readFileSync(new URL('./fixtures/edit-turn.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean)
  .map((line) => asJson(JSON.parse(line))).filter((event) => event.type === 'user').map((event) => asJson(event.tool_use_result));
const [read, edit, write] = results;

describe('the diff of a file the session changed', () => {
  it('takes an Edit’s own patch, its path from the session’s folder', () => {
    assert.deepEqual(fileDiff('Edit', edit, '/Users/me/shop'), {
      path: 'cart.js', created: false, added: 1, removed: 1,
      hunks: [{ oldStart: 1, newStart: 1, lines: [' export function total(items) {', '   let sum = 0;', '-  for (const item of items) sum += item.price;', '+  for (const item of items) sum += item.price * item.quantity;', '   return sum;', ' }', ' '] }],
    });
  });

  it('shows a file a Write created as all added, and keeps a path outside the folder whole', () => {
    const created = fileDiff('Write', write, '/Users/me/elsewhere');
    assert.equal(created?.path, '/Users/me/shop/notes.md');
    assert.equal(created?.created, true);
    assert.deepEqual([created?.added, created?.removed], [3, 0]);
    assert.deepEqual(created?.hunks, [{ oldStart: 0, newStart: 1, lines: [
      '+Le panier calcule le total en multipliant le prix par la quantité.', '+La TVA est fixée à 20 % (VAT = 0.2).', '+La fonction total() parcourt les articles et additionne leurs montants.',
    ] }]);
  });

  it('keeps a long diff short, counting all its lines', () => {
    const lines = Array.from({ length: 2000 }, (_, at) => `+line ${at}`);
    const long = fileDiff('Edit', { filePath: '/a/b.ts', structuredPatch: [{ oldStart: 1, newStart: 1, lines }] }, '/a');
    assert.equal(long?.added, 2000);
    assert.equal(long?.truncated, true);
    assert.equal(long?.hunks.flatMap((hunk) => hunk.lines).length, MAX_DIFF_LINES);
  });

  it('says nothing of another tool, nor of a result without a patch', () => {
    assert.equal(fileDiff('Read', read, '/Users/me/shop'), null);
    assert.equal(fileDiff('Edit', { filePath: '/a/b.ts' }, '/a'), null);
    assert.equal(fileDiff('Edit', { filePath: '/a/b.ts', structuredPatch: [] }, '/a'), null);
  });
});
