import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { MAX_METRICS, hasNewMetrics, isMetricsPath } from '../shared/metrics.ts';
import { parseClientMessage } from './messages.ts';
import { metricsChangedAt, readMetrics } from './metrics.ts';
import { DEFAULT_PREFERENCES, Settings, parsePreferences } from './settings.ts';

let base: string;

before(() => {
  base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-metrics-')));
  writeFileSync(path.join(base, 'chiffres.md'), '# Chiffres\n\n| App | MRR |\n|---|---|\n| A | 4 $ |\n');
  utimesSync(path.join(base, 'chiffres.md'), 1_700_000_000, 1_700_000_000);
  writeFileSync(path.join(base, 'secret.txt'), 'not numbers');
  symlinkSync(path.join(base, 'secret.txt'), path.join(base, 'link.md'));
  symlinkSync(path.join(base, 'chiffres.md'), path.join(base, 'alias.md'));
  writeFileSync(path.join(base, 'huge.md'), 'x'.repeat(MAX_METRICS + 1));
});

after(() => rmSync(base, { recursive: true, force: true }));

describe('the numbers object', () => {
  it('reads the numbers file with its change time, and nothing when there is none yet', async () => {
    const metrics = await readMetrics(path.join(base, 'chiffres.md'));
    assert.equal(metrics?.text.startsWith('# Chiffres'), true);
    assert.equal(metrics?.mtime, 1_700_000_000_000);
    assert.equal(await metricsChangedAt(path.join(base, 'chiffres.md')), 1_700_000_000_000);
    assert.equal(await readMetrics(path.join(base, 'missing.md')), null);
    assert.equal(await metricsChangedAt(path.join(base, 'missing', 'chiffres.md')), null);
    assert.equal(await metricsChangedAt(''), null, 'no numbers file set');
    assert.equal(await readMetrics(''), null);
  });

  it('reads only a Markdown file, on its real path', async () => {
    assert.equal(await readMetrics(path.join(base, 'link.md')), null, 'a link named .md leading to another file');
    assert.equal(await readMetrics(base), null, 'a folder');
    assert.equal((await readMetrics(path.join(base, 'alias.md')))?.mtime, 1_700_000_000_000, 'a link to a Markdown file');
    await assert.rejects(readMetrics(path.join(base, 'huge.md')));
  });

  it('shows the badge while the file changed after the panel last showed it', () => {
    assert.equal(hasNewMetrics(null, 0), false, 'no file, no badge');
    assert.equal(hasNewMetrics(1000, 0), true, 'never opened');
    assert.equal(hasNewMetrics(1000, 1000), false, 'seen as it is');
    assert.equal(hasNewMetrics(2000, 1000), true, 'rewritten since');
  });

  it('keeps the numbers file of the settings a full path to a Markdown file ("~" being the home), or none', () => {
    assert.deepEqual(parsePreferences({ metricsFile: '~/Journal/chiffres/chiffres.md' }, '/home/someone'), { metricsFile: '/home/someone/Journal/chiffres/chiffres.md' });
    assert.deepEqual(parsePreferences({ metricsFile: ' /data/numbers.MD ' }, '/home/someone'), { metricsFile: '/data/numbers.MD' });
    assert.deepEqual(parsePreferences({ metricsFile: '  ' }, '/home/someone'), { metricsFile: '' }, 'emptied: no numbers object');
    for (const metricsFile of ['chiffres.md', '~other/chiffres.md', '/data/numbers.txt', '/data/', 3]) assert.deepEqual(parsePreferences({ metricsFile }, '/home/someone'), {}, String(metricsFile));
    assert.equal(isMetricsPath('~/x.md'), true);
    assert.equal(DEFAULT_PREFERENCES.metricsFile, '', 'opt-in: no numbers object until the user names a file');
  });

  it('remembers when the numbers were seen, across restarts, and reads an older settings file without it', async () => {
    const file = path.join(base, 'settings.json');
    writeFileSync(file, JSON.stringify({ onboarded: true, notifications: false }));
    const settings = new Settings(file);
    await settings.load();
    assert.equal(settings.metricsSeenAt, 0);
    assert.equal(settings.preferences.metricsFile, '', 'an older file: no numbers object');
    await settings.metricsSeen(1_700_000_000_000);
    const reloaded = new Settings(file);
    await reloaded.load();
    assert.equal(reloaded.metricsSeenAt, 1_700_000_000_000);
    assert.equal(reloaded.onboarded, true);
    assert.equal(reloaded.preferences.notifications, false);
  });

  it('takes the request to read it from the page, and no seen time', () => {
    assert.deepEqual(parseClientMessage({ t: 'metrics', file: '/etc/passwd' }), { t: 'metrics' });
    assert.deepEqual(parseClientMessage({ t: 'preferences', preferences: { metricsSeenAt: 9e15 } }), { t: 'preferences', preferences: {} });
  });
});
