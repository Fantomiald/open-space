import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StoredKey } from '../../shared/secrets.ts';
import { isStale, projectChoices, sortKeys, STALE_AFTER_MS } from './keys.ts';

const key = (name: string, scope: StoredKey['scope'], owner?: string, lastUsed?: number): StoredKey => ({ id: `${name}-${scope}-${owner ?? ''}`, name, scope, ...(owner ? { owner } : {}), usedIn: [], ...(lastUsed !== undefined ? { lastUsed: { at: lastUsed, by: 'Morgane' } } : {}) });

describe('Settings > Keys', () => {
  const keys = [key('B', 'project', '/repo/app'), key('A', 'all'), key('C', 'project', '/repo/other'), key('A', 'trigger', 't1')];

  it('sorts by name, every session first', () => {
    assert.deepEqual(sortKeys(keys).map((each) => `${each.name}:${each.scope}`), ['A:all', 'A:trigger', 'B:project', 'C:project']);
  });

  it('marks a key unused for a month', () => {
    const now = STALE_AFTER_MS * 2;
    assert.equal(isStale(key('A', 'all', undefined, now - STALE_AFTER_MS - 1), now), true);
    assert.equal(isStale(key('A', 'all', undefined, now - 1000), now), false);
    assert.equal(isStale(key('A', 'all'), now), false, 'never used is not stale');
  });

  it('offers the projects of the sessions and of the keys, once each', () => {
    assert.deepEqual(projectChoices(['/repo/app', undefined, '/repo/app'], keys), ['/repo/app', '/repo/other']);
  });
});
