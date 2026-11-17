import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClientMessage } from '../../shared/protocol.ts';
import { askPaths, heardPaths, usePathAnswers } from './path-mentions.ts';

describe('the paths "@" asks the server for', () => {
  it('keeps the answer to the latest question only, with the folder it was asked for', () => {
    const sent: ClientMessage[] = [];
    const send = (message: ClientMessage) => { sent.push(message); return true; };
    askPaths(send, { sessionId: 's1' }, 'sr');
    askPaths(send, { cwd: '~/work/demo' }, 'src');
    assert.deepEqual(sent.map((message) => ({ ...message, id: 0 })), [
      { t: 'findPaths', id: 0, query: 'sr', sessionId: 's1' },
      { t: 'findPaths', id: 0, query: 'src', cwd: '~/work/demo' },
    ]);
    const [first, second] = sent.map((message) => (message.t === 'findPaths' ? message.id : -1));
    heardPaths(first, 'sr', [{ path: 'stale.ts', folder: false }]);
    assert.equal(usePathAnswers.getState().latest, null, 'overtaken by the question asked since');
    heardPaths(second, 'src', [{ path: 'src', folder: true }]);
    assert.deepEqual(usePathAnswers.getState().latest, { scope: 'folder:~/work/demo', query: 'src', paths: [{ path: 'src', folder: true }] });
  });
});
