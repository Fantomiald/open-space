import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backHash, isOfSession, outKey, outPath, parseBackHash, parseOut, type OutTarget } from './out.ts';

const targets: OutTarget[] = [
  { kind: 'session', sessionId: 'a1-b2' },
  { kind: 'mod', modId: 'my_mod' },
  { kind: 'browser', sessionId: 'a1-b2', lane: 3 },
];

describe('a window taken out', () => {
  it('has one key per window, read back as it was', () => {
    for (const target of targets) assert.deepEqual(parseOut(outKey(target)), target);
    assert.deepEqual(targets.map(outKey), ['session:a1-b2', 'mod:my_mod', 'browser:a1-b2:3']);
  });

  it('refuses a key that names nothing it knows', () => {
    for (const key of [null, '', 'session', 'session:', 'session:a/b', 'session:a:1', 'mod:a:b', 'browser:a', 'browser:a:x', 'browser:a:1:2', 'room:a', 'session:../x']) {
      assert.equal(parseOut(key), null, String(key));
    }
  });

  it('opens on its own page, and goes back through a link of the main page', () => {
    assert.equal(outPath(targets[2]!), '/?out=browser%3Aa1-b2%3A3');
    assert.deepEqual(targets.map(backHash), ['session=a1-b2', 'mod=my_mod', 'browser=a1-b2:3']);
    for (const target of targets) assert.deepEqual(parseBackHash(`#${backHash(target)}`), target);
    assert.equal(parseBackHash('#settings'), null);
  });

  it('belongs to its session, a browser as much as the conversation', () => {
    assert.equal(isOfSession(targets[0]!, 'a1-b2'), true);
    assert.equal(isOfSession(targets[2]!, 'a1-b2'), true);
    assert.equal(isOfSession(targets[1]!, 'my_mod'), false);
  });
});
