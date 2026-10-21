import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LoggedEvent } from '../shared/protocol.ts';
import { searchSessions } from './search.ts';

const say = (seq: number, at: number, text: string): LoggedEvent => ({ seq, at, ev: { k: 'say', who: 'chef', text } });

describe('search over every session', () => {
  it('ignores accents and case, and takes the words in any order', () => {
    const logs: [string, LoggedEvent[]][] = [['a', [say(1, 10, 'Le café du Pack ZEN est prêt'), say(2, 11, 'rien')]]];
    assert.equal(searchSessions(logs, 'CAFE').length, 1);
    assert.equal(searchSessions(logs, 'zen pack').length, 1);
    assert.equal(searchSessions(logs, 'zen thé').length, 0);
    assert.deepEqual(searchSessions(logs, ' é '), [], 'too short');
  });

  it('reads starts, reports, peers and ends, without repeating a say as the end of its turn', () => {
    const events: LoggedEvent[] = [
      { seq: 1, at: 1, ev: { k: 'start', text: 'fais le zebra' } },
      { seq: 2, at: 2, ev: { k: 'report', who: 'x', text: 'zebra fini' } },
      { seq: 3, at: 3, ev: { k: 'peer', from: 'Ana', text: 'un zebra ici' } },
      say(4, 4, 'zebra voila'),
      { seq: 5, at: 5, ev: { k: 'end', ok: true, text: 'zebra voila', ms: 1 } },
      { seq: 6, at: 6, ev: { k: 'end', ok: true, text: 'autre zebra', ms: 1 } },
    ];
    const hits = searchSessions([['a', events]], 'zebra', 10);
    assert.deepEqual(hits.map((hit) => [hit.seq, hit.who]), [[6, 'agent'], [4, 'agent'], [3, 'peer'], [2, 'agent']]);
  });

  it('keeps four hits a session, newest first, up to the limit', () => {
    const many = (id: string, from: number): [string, LoggedEvent[]] => [id, Array.from({ length: 6 }, (_, index) => say(index, from + index, 'mot clé'))];
    const hits = searchSessions([many('a', 100), many('b', 50)], 'mot');
    assert.equal(hits.length, 8);
    assert.deepEqual(hits.map((hit) => hit.sessionId).join(''), 'aaaabbbb');
    assert.ok(hits.every((hit, index) => index === 0 || hits[index - 1].at >= hit.at || hit.sessionId !== hits[index - 1].sessionId));
    assert.equal(searchSessions([many('a', 100), many('b', 50)], 'mot', 5).length, 5);
  });

  it('points the snippet at the match', () => {
    const text = `${'début '.repeat(40)}Éléphant${' fin'.repeat(40)}`;
    const [hit] = searchSessions([['a', [say(1, 1, text)]]], 'elephant');
    assert.equal(hit.snippet.slice(hit.start, hit.start + hit.length), 'Éléphant');
  });
});
