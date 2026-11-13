import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanPending, MAX_PENDING, MAX_PENDING_TEXT } from './pending.ts';

describe('what a session leaves pending', () => {
  it('keeps a few short lines, without the empty ones', () => {
    const many = Array.from({ length: 10 }, (_, index) => `point ${index}`);
    assert.equal(cleanPending(many, 1).length, MAX_PENDING);
    assert.equal(cleanPending(['x'.repeat(300)], 1)[0].text.length, MAX_PENDING_TEXT);
    assert.deepEqual(cleanPending(['  ', ' PR à ouvrir '], 5).map((item) => [item.text, item.since]), [['PR à ouvrir', 5]]);
  });

  it('reads untrusted input as nothing', () => {
    assert.deepEqual(cleanPending('push', 1), []);
    assert.deepEqual(cleanPending([3, null, { text: 'objet' }], 1).map((item) => item.text), ['objet']);
  });

  it('keeps the id and the age of a line said again', () => {
    const [first] = cleanPending(['Pas poussé'], 100);
    const again = cleanPending(['Pas poussé', 'Clé Stripe à demander'], 200, [first]);
    assert.deepEqual(again[0], first);
    assert.equal(again[1].since, 200);
    assert.notEqual(again[1].id, first.id);
  });
});
