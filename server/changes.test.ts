import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { editedFiles, parseNumstat, sessionChanges, splitPatch } from './changes.ts';
import { projectFolder } from './conversations.ts';

const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-changes-')));
after(() => rmSync(base, { recursive: true, force: true }));

const toolUse = (name: string, input: Record<string, unknown>) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });

describe('changes', () => {
  it('finds the files written by the editing tools, the last written last', () => {
    const transcript = [
      toolUse('Edit', { file_path: '/repo/a.ts' }), toolUse('Read', { file_path: '/repo/b.ts' }), toolUse('Write', { file_path: '/repo/c.ts' }),
      toolUse('NotebookEdit', { notebook_path: '/repo/n.ipynb' }), toolUse('Edit', { file_path: 'relative.ts' }), 'not json "tool_use"', toolUse('MultiEdit', { file_path: '/repo/a.ts' }),
    ].join('\n');
    assert.deepEqual(editedFiles(transcript), ['/repo/c.ts', '/repo/n.ipynb', '/repo/a.ts']);
  });

  it('reads git numstat and cuts a patch per file', () => {
    assert.deepEqual([...parseNumstat('3\t1\tsrc/a.ts\n-\t-\tlogo.png\n')], [['src/a.ts', { added: 3, removed: 1, binary: false }], ['logo.png', { added: 0, removed: 0, binary: true }]]);
    const patch = 'diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/gone.ts b/gone.ts\ndeleted file mode 100644\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-z\n';
    assert.deepEqual([...splitPatch(patch)], [['a.ts', '@@ -1 +1 @@\n-x\n+y\n'], ['gone.ts', '@@ -1 +0,0 @@\n-z\n']]);
  });

  it('shows what is not committed yet of the files a session and its sub-agents wrote', async () => {
    const home = path.join(base, 'home');
    const repo = path.join(base, 'repo');
    const loose = path.join(base, 'loose');
    const hidden = path.join(base, 'hidden');
    for (const folder of [repo, loose, hidden]) mkdirSync(folder, { recursive: true });
    const run = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: repo });
    run('init', '-q');
    writeFileSync(path.join(repo, 'kept.txt'), 'one\ntwo\n');
    writeFileSync(path.join(repo, 'committed.txt'), 'same\n');
    writeFileSync(path.join(repo, 'gone.txt'), 'bye\n');
    run('add', '.');
    run('commit', '-q', '-m', 'start');
    writeFileSync(path.join(repo, 'kept.txt'), 'one\nTWO\nthree\n');
    writeFileSync(path.join(repo, 'new.txt'), 'a\nb\n');
    rmSync(path.join(repo, 'gone.txt'));
    writeFileSync(path.join(loose, 'note.txt'), 'x\n');
    writeFileSync(path.join(hidden, 'secret.txt'), 'x\n');

    const folder = projectFolder(repo, home);
    mkdirSync(path.join(folder, 'session', 'subagents'), { recursive: true });
    writeFileSync(path.join(folder, 'session.jsonl'), [
      toolUse('Edit', { file_path: path.join(repo, 'kept.txt') }), toolUse('Edit', { file_path: path.join(repo, 'committed.txt') }),
      toolUse('Write', { file_path: path.join(loose, 'note.txt') }), toolUse('Write', { file_path: path.join(hidden, 'secret.txt') }),
      toolUse('Edit', { file_path: path.join(repo, 'gone.txt') }),
    ].join('\n'));
    writeFileSync(path.join(folder, 'session', 'subagents', 'agent-1.jsonl'), toolUse('Write', { file_path: path.join(repo, 'new.txt') }));

    const changes = await sessionChanges(repo, 'session', (directory) => directory !== hidden, home);
    assert.deepEqual(changes.files.map(({ path: file, status, added, removed }) => ({ file: path.relative(base, file).split(path.sep).join('/'), status, added, removed })), [
      { file: 'repo/new.txt', status: 'added', added: 2, removed: 0 },
      { file: 'repo/gone.txt', status: 'deleted', added: 0, removed: 1 },
      { file: 'loose/note.txt', status: 'outside', added: 0, removed: 0 },
      { file: 'repo/kept.txt', status: 'modified', added: 2, removed: 1 },
    ], 'the committed file is left out, the hidden folder is not read, the latest first');
    assert.equal(changes.files[0].patch, '@@ -0,0 +1,2 @@\n+a\n+b\n');
    assert.match(changes.files[3].patch, /^@@ .* @@\n one\n-two\n\+TWO\n\+three\n$/);
    assert.deepEqual({ added: changes.added, removed: changes.removed, touched: changes.touched }, { added: 4, removed: 2, touched: 6 });
  });
});
