import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasNewData, isModId, MOD_SIZE, modIdFor, readManifest } from './mods.ts';

describe('mods', () => {
  it('names a mod by a folder name that cannot leave the mods folder', () => {
    for (const good of ['ventes', 'mes-apps-2', '0']) assert.ok(isModId(good), good);
    for (const bad of ['', '-x', 'Ventes', '../x', 'a/b', '.hidden', 'a'.repeat(41), 42, null]) assert.ok(!isModId(bad), String(bad));
  });

  it('reads a manifest half written, or wrong, as a mod that still shows', () => {
    assert.deepEqual(readManifest(null, 'ventes'), { name: 'ventes', description: '', icon: 'puzzle', width: MOD_SIZE.width.initial, height: MOD_SIZE.height.initial, draft: false, refresh: 0, env: [], trigger: null });
    const read = readManifest({ name: '  Mes   apps ', description: 'x'.repeat(500), icon: 'rocket', width: 5000, height: 10, draft: true }, 'apps');
    assert.equal(read.name, 'Mes apps');
    assert.equal(read.description.length, 120);
    assert.equal(read.icon, 'puzzle', 'an icon it does not know');
    assert.equal(read.width, MOD_SIZE.width.max);
    assert.equal(read.height, MOD_SIZE.height.min);
    assert.equal(read.draft, true);
    assert.equal(readManifest({ icon: 'chart', width: '300' }, 'x').width, MOD_SIZE.width.initial, 'a size as text is not a size');
  });

  it('refreshes only at the paces the settings offer, and asks only for variables with a usable name', () => {
    assert.equal(readManifest({ refresh: 300 }, 'x').refresh, 300);
    assert.equal(readManifest({ refresh: 42 }, 'x').refresh, 0, 'a pace the settings do not offer');
    assert.equal(readManifest({ trigger: 'f0bbff1129e1da16' }, 'x').trigger, 'f0bbff1129e1da16');
    assert.equal(readManifest({ trigger: '../hooks' }, 'x').trigger, null, 'not a trigger id');
    const read = readManifest({ env: [{ name: 'JIRA_TOKEN', label: '  Ton token ' }, { name: 'JIRA_TOKEN' }, { name: 'bad name' }, 'x', { name: 'EMAIL' }] }, 'x');
    assert.deepEqual(read.env, [{ name: 'JIRA_TOKEN', label: 'Ton token' }, { name: 'EMAIL', label: '' }]);
  });

  it('takes the folder of a new mod from the first words asked, free among the others', () => {
    assert.equal(modIdFor('Mes ventes du jour par pays', new Set()), 'mes-ventes-jour');
    assert.equal(modIdFor('Récap détaillé de Claude', new Set(['recap-detaille-claude'])), 'recap-detaille-claude-2');
    assert.equal(modIdFor('!!!', new Set(['mod'])), 'mod-2');
    assert.ok(isModId(modIdFor('a'.repeat(200), new Set())));
  });

  it('has news when its data changed after the user last saw it', () => {
    assert.equal(hasNewData(null, undefined), false);
    assert.equal(hasNewData(10, undefined), true);
    assert.equal(hasNewData(10, 10), false);
    assert.equal(hasNewData(11, 10), true);
  });
});
