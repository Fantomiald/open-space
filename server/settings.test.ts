import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { DEFAULT_PREFERENCES, Settings, parsePreferences } from './settings.ts';

const folder = mkdtempSync(path.join(os.tmpdir(), 'office-settings-'));
after(() => rmSync(folder, { recursive: true, force: true }));

describe('settings', () => {
  it('keeps only what is valid from the page: absolute folders, known modes, a short note', () => {
    assert.deepEqual(parsePreferences({ roots: ['/a/b', 'relative', '/a/b/', 3], permissionMode: 'bypassPermissions', model: 'opus; rm -rf', agentNote: ` ${'x'.repeat(700)} `, festivals: 'yes' }), {
      roots: ['/a/b'], agentNote: 'x'.repeat(600),
    });
    assert.deepEqual(parsePreferences({ model: 'claude-opus-5-5', permissionMode: 'plan', defaultFolder: '' }), { model: 'claude-opus-5-5', permissionMode: 'plan', defaultFolder: '' });
    assert.deepEqual(parsePreferences('nope'), {});
    assert.deepEqual(parsePreferences({ language: 'en' }), { language: 'en' });
    assert.deepEqual(parsePreferences({ language: 'de' }), {}, 'a language Open Space does not speak');
    assert.deepEqual(parsePreferences({ pet: { kind: 'dog', variant: 'pug', colors: { fur: '#7fd36a', belly: 'red', eyes: 3 } } }).pet, { kind: 'dog', variant: 'pug', colors: { fur: '#7fd36a' } }, 'only valid colours');
    assert.deepEqual(parsePreferences({ pet: { kind: 'rocky', colors: {} } }).pet, { kind: 'rocky' });
    assert.equal(parsePreferences({ pet: { kind: 'unicorn' } }).pet, undefined);
    assert.deepEqual(parsePreferences({ pet: { kind: 'dragon', variant: 'red', colors: { fur: '#e8645a' } } }).pet, { kind: 'dragon', colors: { fur: '#e8645a' } }, 'a later pet, its colour kept');
    assert.deepEqual(parsePreferences({ pet: { kind: 'cat', variant: 'grey' } }).pet, { kind: 'cat', variant: 'plain', colors: { fur: '#8b919c' } }, 'a coat named after its colour becomes a plain cat of that colour');
    assert.deepEqual(parsePreferences({ pet: { kind: 'duck' } }).pet, { kind: 'duck' });
    assert.equal(parsePreferences({ theme: 'pirate' }).theme, 'pirate');
    assert.equal(parsePreferences({ theme: 'moon' }).theme, undefined, 'an unknown theme is left out');
    assert.deepEqual(parsePreferences({ effort: 'xhigh', timeFormat: '12h', timestamps: true, turnDuration: false, reduceMotion: 'yes' }), { effort: 'xhigh', timeFormat: '12h', timestamps: true, turnDuration: false });
    assert.deepEqual(parsePreferences({ effort: 'ultra', timeFormat: 'swatch' }), {});
    assert.deepEqual(parsePreferences({ claude: { enableWorkflows: false, crossSessionInbound: 'hold', outputStyle: 'Concis', workflowSizeGuideline: 'huge', ultracode: true, env: { A: '1' } } }).claude, {
      enableWorkflows: false, crossSessionInbound: 'hold', outputStyle: 'Concis',
    }, 'only the keys Open Space offers, with known values');
  });

  it('needs the first start until it is done, and keeps the notifications of an older file', async () => {
    const file = path.join(folder, 'settings.json');
    writeFileSync(file, JSON.stringify({ notifications: false }));
    const settings = new Settings(file);
    await settings.load();
    assert.equal(settings.onboarded, false);
    assert.equal(settings.notifications, false);
    await settings.update({ roots: ['/w'], agentNote: 'Tutoie-moi.' }, true);
    const reloaded = new Settings(file);
    await reloaded.load();
    assert.equal(reloaded.onboarded, true);
    assert.deepEqual(reloaded.preferences, { ...DEFAULT_PREFERENCES, notifications: false, roots: ['/w'], agentNote: 'Tutoie-moi.' });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).onboarded, true);
  });
});
