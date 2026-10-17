import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('has safe defaults: no root until the user chooses some, data outside Documents', () => {
    const config = loadConfig({}, '/home/max');
    assert.deepEqual(config.roots, []);
    assert.equal(config.rootsLocked, false);
    assert.equal(config.dataDir, '/home/max/.open-space');
    assert.equal(config.port, 4848);
    assert.equal(config.maxLive, 8);
    assert.equal(config.idleMs, 30 * 60_000);
    assert.deepEqual(config.passthrough, []);
  });

  it('reads roots like PATH, expands ~, makes them absolute, keeps those that exist, and locks them', () => {
    const config = loadConfig({ OFFICE_ROOTS: ['~/a', '/srv/b', '/gone', ' '].join(path.delimiter) }, '/home/max', (folder) => folder !== '/gone');
    assert.deepEqual(config.roots, ['/home/max/a', '/srv/b']);
    assert.equal(config.rootsLocked, true);
  });

  it('ignores invalid numbers', () => {
    const config = loadConfig({ PORT: 'abc', OFFICE_MAX_LIVE: '-3', OFFICE_IDLE_MINUTES: '1.5' }, '/h');
    assert.deepEqual([config.port, config.maxLive, config.idleMs], [4848, 8, 30 * 60_000]);
  });

});
