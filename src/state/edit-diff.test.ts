import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FileDiff, LoggedEvent } from '../../shared/protocol.ts';
import { editRows } from './edit-diff.ts';
import { actionName, buildFeed, threadOf } from './feed.ts';

const edit: FileDiff = {
  path: 'cart.js', created: false, added: 1, removed: 1,
  hunks: [
    { oldStart: 2, newStart: 2, lines: ['   let sum = 0;', '-  sum += item.price;', '+  sum += item.price * item.quantity;', '   return sum;'] },
    { oldStart: 40, newStart: 40, lines: [' export const VAT = 0.2;'] },
  ],
};

describe('the lines of a changed file', () => {
  it('numbers each line as Claude Code does: the old number for a removed one, the new one otherwise, a gap between hunks', () => {
    assert.deepEqual(editRows(edit.hunks), [
      { kind: 'context', number: 2, text: '  let sum = 0;' },
      { kind: 'remove', number: 3, text: '  sum += item.price;' },
      { kind: 'add', number: 3, text: '  sum += item.price * item.quantity;' },
      { kind: 'context', number: 4, text: '  return sum;' },
      { kind: 'hunk', number: null, text: '' },
      { kind: 'context', number: 40, text: 'export const VAT = 0.2;' },
    ]);
  });

  it('numbers a created file from its first line', () => {
    assert.deepEqual(editRows([{ oldStart: 0, newStart: 1, lines: ['+# Notes', '+'] }]), [
      { kind: 'add', number: 1, text: '# Notes' },
      { kind: 'add', number: 2, text: '' },
    ]);
  });
});

describe('the detailed actions in the thread', () => {
  const at = 1;
  const events: LoggedEvent[] = [
    { seq: 1, at, ev: { k: 'start', text: 'go' } },
    { seq: 2, at, ev: { k: 'act', who: 'chef', id: 'r1', tool: 'Read', detail: 'cart.js' } },
    { seq: 3, at, ev: { k: 'act', who: 'chef', id: 'e1', tool: 'Edit', detail: 'cart.js' } },
    { seq: 4, at, ev: { k: 'diff', who: 'chef', id: 'e1', diff: edit } },
    { seq: 5, at, ev: { k: 'act_done', who: 'chef', id: 'e1', ok: true } },
    { seq: 6, at, ev: { k: 'act', who: 'chef', id: 'b1', tool: 'Bash', detail: 'npm test' } },
    { seq: 7, at, ev: { k: 'act_done', who: 'chef', id: 'b1', ok: true, output: { lines: ['ok 1', 'ok 2'], total: 2 } } },
  ];
  const { items } = buildFeed(events);
  const shape = (detailed: boolean) => threadOf(items, null, detailed).map((entry) => (entry.kind === 'tools' ? `tools:${entry.tools.map((tool) => tool.tool).join('+')}` : entry.kind));

  it('each stand on its own when detailed, the changed file with its diff, the others with what they gave back', () => {
    assert.deepEqual(shape(true), ['user', 'action', 'diff', 'action']);
    const [, , changed, command] = threadOf(items, null, true);
    assert.equal(changed.kind === 'diff' && changed.call.diff?.path, 'cart.js');
    assert.deepEqual(command.kind === 'action' && command.call.output, { lines: ['ok 1', 'ok 2'], total: 2 });
  });

  it('stay in one run when not detailed', () => {
    assert.deepEqual(shape(false), ['user', 'tools:Read+Edit+Bash']);
  });

  it('are named as Claude Code names them, an MCP server’s tool included', () => {
    assert.equal(actionName('Bash'), 'Bash');
    assert.equal(actionName('mcp__claude-in-chrome__navigate'), 'claude-in-chrome - navigate (MCP)');
  });
});
