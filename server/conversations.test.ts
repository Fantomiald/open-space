import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { lastExchanges, listConversations, projectFolder } from './conversations.ts';

const home = mkdtempSync(path.join(os.tmpdir(), 'office-conversations-'));
after(() => rmSync(home, { recursive: true, force: true }));
const cwd = '/Users/me/code/my_app';
const A = '0552561c-ed98-44d9-97f9-e8b3abc2bf14';
const B = 'c0e9b38f-6acd-4694-a6dd-7a19abdba4f6';
const line = (record: object) => JSON.stringify(record);

describe('Claude Code conversations on disk', () => {
  const folder = projectFolder(cwd, home);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, `${A}.jsonl`), [
    line({ type: 'last-prompt', sessionId: A }),
    line({ type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>…' } }),
    line({ type: 'user', message: { role: 'user', content: '<command-name>/model</command-name>' } }),
    line({ type: 'user', message: { role: 'user', content: 'Compare les deux flows Kiin' } }),
    line({ type: 'ai-title', aiTitle: 'Kiin business flows comparison' }),
    line({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: 'Le premier est plus simple.' }] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } }),
    'not json',
  ].join('\n'));
  writeFileSync(path.join(folder, `${B}.jsonl`), line({ type: 'queue-operation' }));
  writeFileSync(path.join(folder, 'notes.txt'), 'x');

  it('finds the folder of a project the way Claude Code names it', () => {
    assert.equal(path.basename(projectFolder('/Users/me/code/my_app', home)), '-Users-me-code-my-app');
  });

  it('lists the conversations with their title and first message, without empty ones or those already open', async () => {
    assert.deepEqual((await listConversations(cwd, new Set(), home)).map(({ id, title, preview }) => ({ id, title, preview })),
      [{ id: A, title: 'Kiin business flows comparison', preview: 'Compare les deux flows Kiin' }]);
    assert.deepEqual(await listConversations(cwd, new Set([A]), home), []);
    assert.deepEqual(await listConversations('/nowhere', new Set(), home), []);
  });

  it('puts the name of an Open Space session (its custom title) before what it was asked', async () => {
    const named = '/Users/me/code/named';
    mkdirSync(projectFolder(named, home), { recursive: true });
    writeFileSync(path.join(projectFolder(named, home), `${A}.jsonl`), [
      line({ type: 'custom-title', customTitle: 'Charline', sessionId: A }),
      line({ type: 'user', message: { role: 'user', content: 'Corrige le bug du login' } }),
    ].join('\n'));
    assert.deepEqual((await listConversations(named, new Set(), home)).map(({ title }) => title), ['Charline · Corrige le bug du login']);
  });

  it('reads the last exchanges, what the user said and what Claude answered', async () => {
    assert.deepEqual(await lastExchanges(cwd, A, 8, home), [
      { who: 'user', text: 'Compare les deux flows Kiin' },
      { who: 'assistant', text: 'Le premier est plus simple.' },
    ]);
    assert.deepEqual(await lastExchanges(cwd, '../etc', 8, home), []);
  });
});
