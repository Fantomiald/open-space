import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_NAME, MAX_TEXT, parseClientMessage } from './messages.ts';

describe('parseClientMessage', () => {
  it('reads openTerminal with or without a session, and nothing else', () => {
    assert.deepEqual(parseClientMessage({ t: 'openTerminal' }), { t: 'openTerminal' });
    assert.deepEqual(parseClientMessage({ t: 'openTerminal', sessionId: 's1' }), { t: 'openTerminal', sessionId: 's1' });
    assert.deepEqual(parseClientMessage({ t: 'openTerminal', sessionId: 's1', folder: '/etc' }), { t: 'openTerminal', sessionId: 's1' }, 'no path from the client');
    assert.equal(parseClientMessage({ t: 'openTerminal', sessionId: '../x' }), null);
    assert.equal(parseClientMessage({ t: 'openTerminal', sessionId: 5 }), null);
  });

  it('reads a change of model or effort, and refuses an unknown effort', () => {
    assert.deepEqual(parseClientMessage({ t: 'tune', sessionId: 's1', model: 'sonnet' }), { t: 'tune', sessionId: 's1', model: 'sonnet' });
    assert.deepEqual(parseClientMessage({ t: 'tune', sessionId: 's1', model: '', effort: '' }), { t: 'tune', sessionId: 's1', model: '', effort: '' });
    assert.deepEqual(parseClientMessage({ t: 'tune', sessionId: 's1', effort: 'xhigh' }), { t: 'tune', sessionId: 's1', effort: 'xhigh' });
    assert.equal(parseClientMessage({ t: 'tune', sessionId: 's1', effort: 'turbo' }), null);
    assert.deepEqual(parseClientMessage({ t: 'tune', sessionId: 's1', ultracode: true }), { t: 'tune', sessionId: 's1', ultracode: true });
    assert.equal(parseClientMessage({ t: 'tune', sessionId: 's1', ultracode: 'yes' }), null);
    assert.deepEqual(parseClientMessage({ t: 'tune', sessionId: 's1', permissionMode: 'plan' }), { t: 'tune', sessionId: 's1', permissionMode: 'plan' });
    assert.equal(parseClientMessage({ t: 'tune', sessionId: 's1', permissionMode: 'bypassPermissions' }), null);
    assert.equal(parseClientMessage({ t: 'tune', sessionId: 's1', model: '--settings x' }), null);
    assert.equal(parseClientMessage({ t: 'tune', sessionId: 's1' }), null);
  });


  it('accepts every well-formed message', () => {
    assert.deepEqual(parseClientMessage({ t: 'create', options: { cwd: '/a/b', model: 'haiku', permissionMode: 'plan', name: 'Zoé', text: '/kit:new' } }),
      { t: 'create', options: { cwd: '/a/b', model: 'haiku', permissionMode: 'plan', name: 'Zoé', text: '/kit:new' } });
    assert.deepEqual(parseClientMessage({ t: 'create', options: { cwd: '/a', effort: 'max', ultracode: true } }), { t: 'create', options: { cwd: '/a', effort: 'max', ultracode: true } });
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/a', effort: 'turbo' } }), null);
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/a', ultracode: 1 } }), null);
    assert.deepEqual(parseClientMessage({ t: 'reply', sessionId: 's1', requestId: 'r-1', answers: { 'Which one?': 'A, B' } }), { t: 'reply', sessionId: 's1', requestId: 'r-1', answers: { 'Which one?': 'A, B' } });
    assert.deepEqual(parseClientMessage({ t: 'send', sessionId: 'abc-123', text: 'hello' }), { t: 'send', sessionId: 'abc-123', text: 'hello' });
    assert.deepEqual(parseClientMessage({ t: 'answer', sessionId: 's1', requestId: 'r-1', decision: 'always' }), { t: 'answer', sessionId: 's1', requestId: 'r-1', decision: 'always' });
    assert.deepEqual(parseClientMessage({ t: 'interrupt', sessionId: 's1' }), { t: 'interrupt', sessionId: 's1' });
    assert.deepEqual(parseClientMessage({ t: 'log', sessionId: 's1', after: 12.9 }), { t: 'log', sessionId: 's1', after: 12 });
    assert.deepEqual(parseClientMessage({ t: 'directories' }), { t: 'directories' });
    assert.deepEqual(parseClientMessage({ t: 'updateClaude', extra: 1 }), { t: 'updateClaude' });
    assert.deepEqual(parseClientMessage({ t: 'claudeLogin', email: 'x' }), { t: 'claudeLogin' });
    assert.deepEqual(parseClientMessage({ t: 'claudeLogout' }), { t: 'claudeLogout' });
    assert.deepEqual(parseClientMessage({ t: 'restartOutdated' }), { t: 'restartOutdated' });
    assert.deepEqual(parseClientMessage({ t: 'restartApp' }), { t: 'restartApp' });
  });

  it('accepts pictures with a message or a new session, and drops the message when one is not right', () => {
    const image = { mediaType: 'image/png', data: 'iVBORw0KGgo=' };
    assert.deepEqual(parseClientMessage({ t: 'send', sessionId: 's1', text: '', images: [image] }), { t: 'send', sessionId: 's1', text: '', images: [image] });
    assert.deepEqual(parseClientMessage({ t: 'create', options: { cwd: '/a', images: [image] } }), { t: 'create', options: { cwd: '/a', images: [image] } });
    assert.equal(parseClientMessage({ t: 'send', sessionId: 's1', text: 'a', images: [{ ...image, mediaType: 'image/svg+xml' }] }), null, 'no SVG');
    assert.equal(parseClientMessage({ t: 'send', sessionId: 's1', text: 'a', images: [{ ...image, data: 'not base64!' }] }), null);
    assert.equal(parseClientMessage({ t: 'send', sessionId: 's1', text: 'a', images: Array(9).fill(image) }), null, 'too many');
    assert.deepEqual(parseClientMessage({ t: 'send', sessionId: 's1', text: 'a', images: [] }), { t: 'send', sessionId: 's1', text: 'a' });
  });

  it('drops anything that is not an object with a known type', () => {
    for (const raw of [null, undefined, 'send', 42, [], {}, { t: 1 }, { t: 'nope' }, { t: 'send' }]) assert.equal(parseClientMessage(raw), null);
  });

  it('refuses malformed fields', () => {
    assert.equal(parseClientMessage({ t: 'send', sessionId: '../../x', text: 'a' }), null);
    assert.equal(parseClientMessage({ t: 'send', sessionId: 's1', text: 5 }), null);
    assert.equal(parseClientMessage({ t: 'send', sessionId: 's1', text: 'x'.repeat(MAX_TEXT + 1) }), null);
    assert.equal(parseClientMessage({ t: 'answer', sessionId: 's1', requestId: 'r', decision: 'maybe' }), null);
    assert.equal(parseClientMessage({ t: 'rename', sessionId: 's1', name: 'x'.repeat(MAX_NAME + 1) }), null);
    assert.equal(parseClientMessage({ t: 'create', options: {} }), null);
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/a', permissionMode: 'bypassPermissions' } }), null);
    assert.equal(parseClientMessage({ t: 'reply', sessionId: 's1', requestId: 'r', answers: {} }), null);
    assert.equal(parseClientMessage({ t: 'reply', sessionId: 's1', requestId: 'r', answers: { q: 3 } }), null);
    assert.equal(parseClientMessage({ t: 'reply', sessionId: 's1', requestId: 'r', answers: { a: '1', b: '2', c: '3', d: '4', e: '5' } }), null);
  });

  it('refuses model values that could be mistaken for a flag', () => {
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/a', model: '--dangerously-skip-permissions' } }), null);
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/a', model: 'a b' } }), null);
    assert.ok(parseClientMessage({ t: 'create', options: { cwd: '/a', model: 'claude-haiku-5-5' } }));
    assert.ok(parseClientMessage({ t: 'create', options: { cwd: '/a', model: 'opus[1m]' } }));
    assert.ok(parseClientMessage({ t: 'create', options: { cwd: '/a', model: '' } }));
  });

  it('floors a negative or missing log cursor to 0', () => {
    assert.deepEqual(parseClientMessage({ t: 'log', sessionId: 's1', after: -5 }), { t: 'log', sessionId: 's1', after: 0 });
    assert.deepEqual(parseClientMessage({ t: 'log', sessionId: 's1' }), { t: 'log', sessionId: 's1', after: 0 });
  });
  it('reads a side question, trimmed, and refuses an empty one', () => {
    assert.deepEqual(parseClientMessage({ t: 'aside', sessionId: 's1', question: '  où en es-tu ? ' }), { t: 'aside', sessionId: 's1', question: 'où en es-tu ?' });
    assert.equal(parseClientMessage({ t: 'aside', sessionId: 's1', question: '   ' }), null);
    assert.deepEqual(parseClientMessage({ t: 'asideClose', sessionId: 's1' }), { t: 'asideClose', sessionId: 's1' });
  });
  it('drives only the known music apps, with actions in range', () => {
    assert.deepEqual(parseClientMessage({ t: 'music', app: 'music' }), { t: 'music', app: 'music' });
    assert.deepEqual(parseClientMessage({ t: 'music', app: 'spotify', action: { kind: 'next' } }), { t: 'music', app: 'spotify', action: { kind: 'next' } });
    assert.deepEqual(parseClientMessage({ t: 'music', app: 'music', action: { kind: 'volume', volume: 40 } }), { t: 'music', app: 'music', action: { kind: 'volume', volume: 40 } });
    assert.deepEqual(parseClientMessage({ t: 'music', app: 'music', action: { kind: 'playlist', name: 'le rap' } }), { t: 'music', app: 'music', action: { kind: 'playlist', name: 'le rap' } });
    assert.deepEqual(parseClientMessage({ t: 'music', app: 'music', action: { kind: 'track', id: 'A3666739BEC79A78' } }), { t: 'music', app: 'music', action: { kind: 'track', id: 'A3666739BEC79A78' } });
    assert.equal(parseClientMessage({ t: 'music', app: 'vlc' }), null);
    assert.equal(parseClientMessage({ t: 'music', app: 'music', action: { kind: 'volume', volume: 140 } }), null);
    assert.equal(parseClientMessage({ t: 'music', app: 'music', action: { kind: 'track', id: '" & do shell script "x' } }), null);
    assert.equal(parseClientMessage({ t: 'music', app: 'music', action: { kind: 'quit' } }), null);
    assert.deepEqual(parseClientMessage({ t: 'musicLibrary', query: '  joey ' }), { t: 'musicLibrary', query: 'joey' });
    assert.equal(parseClientMessage({ t: 'musicLibrary', query: 'x'.repeat(101) }), null);
  });

  it('accepts a search with a bounded query and a costs request, and drops the malformed ones', () => {
    assert.deepEqual(parseClientMessage({ t: 'search', id: 3, query: 'pack zen' }), { t: 'search', id: 3, query: 'pack zen' });
    assert.equal(parseClientMessage({ t: 'search', id: -1, query: 'x' }), null);
    assert.equal(parseClientMessage({ t: 'search', id: 1.5, query: 'x' }), null);
    assert.equal(parseClientMessage({ t: 'search', id: 1 }), null);
    assert.equal(parseClientMessage({ t: 'search', id: 1, query: 'x'.repeat(201) }), null);
    assert.deepEqual(parseClientMessage({ t: 'costs' }), { t: 'costs' });
    assert.deepEqual(parseClientMessage({ t: 'costs', fresh: true }), { t: 'costs', fresh: true });
    assert.deepEqual(parseClientMessage({ t: 'costs', fresh: 'yes' }), { t: 'costs' });
  });
  it('takes the worktree messages with a sane branch name, and drops the others', () => {
    const id = 'abc-1';
    assert.deepEqual(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: {} } }), { t: 'create', options: { cwd: '/p', isolate: {} } });
    assert.deepEqual(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: { base: 'release/2.0' } } }), { t: 'create', options: { cwd: '/p', isolate: { base: 'release/2.0' } } });
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: { base: '--force' } } }), null);
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: { base: 'a..b' } } }), null);
    // a branch with accents is a branch; a space or a control character is not
    assert.deepEqual(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: { base: 'fonctionnalité' } } }), { t: 'create', options: { cwd: '/p', isolate: { base: 'fonctionnalité' } } });
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: { base: 'a b' } } }), null);
    assert.equal(parseClientMessage({ t: 'create', options: { cwd: '/p', isolate: { base: 'a\nb' } } }), null);
    assert.deepEqual(parseClientMessage({ t: 'forget', sessionId: id, branch: 'keep' }), { t: 'forget', sessionId: id, branch: 'keep' });
    assert.equal(parseClientMessage({ t: 'forget', sessionId: id, branch: 'burn' }), null);
    assert.deepEqual(parseClientMessage({ t: 'branch', sessionId: id, action: 'merge' }), { t: 'branch', sessionId: id, action: 'merge' });
    assert.equal(parseClientMessage({ t: 'branch', sessionId: id, action: 'push' }), null);
    assert.deepEqual(parseClientMessage({ t: 'folderInfo', cwd: '/p' }), { t: 'folderInfo', cwd: '/p' });
    const head = 'a'.repeat(40);
    assert.deepEqual(parseClientMessage({ t: 'cleanBranches', cwd: '/p', branches: [{ branch: 'os/lina', folder: null, head, dirty: 0 }, { branch: '', folder: '/p/.claude/worktrees/x', head, dirty: 2 }] }),
      { t: 'cleanBranches', cwd: '/p', branches: [{ branch: 'os/lina', folder: null, head, dirty: 0 }, { branch: '', folder: '/p/.claude/worktrees/x', head, dirty: 2 }] });
    assert.equal(parseClientMessage({ t: 'cleanBranches', cwd: '/p', branches: [{ branch: '', folder: null, head, dirty: 0 }] }), null);
    assert.equal(parseClientMessage({ t: 'cleanBranches', cwd: '/p', branches: [{ branch: '-D', folder: null, head, dirty: 0 }] }), null);
    // what the page saw of it must come with it
    assert.equal(parseClientMessage({ t: 'cleanBranches', cwd: '/p', branches: [{ branch: 'os/lina', folder: null }] }), null);
    assert.equal(parseClientMessage({ t: 'cleanBranches', cwd: '/p', branches: [{ branch: 'os/lina', folder: null, head: 'HEAD', dirty: 0 }] }), null);
  });
});