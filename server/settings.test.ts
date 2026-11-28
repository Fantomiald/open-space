import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { DEFAULT_PREFERENCES, Settings, parsePreferences } from './settings.ts';
import { MAX_PROJECT_ICONS } from '../shared/project-icons.ts';

const folder = mkdtempSync(path.join(os.tmpdir(), 'office-settings-'));
after(() => rmSync(folder, { recursive: true, force: true }));

describe('settings', () => {
  it('keeps only what is valid from the page: absolute folders, known modes, a short note', () => {
    assert.deepEqual(parsePreferences({ roots: ['~/radar', '~'] }, '/home/me'), { roots: [path.resolve('/home/me/radar'), path.resolve('/home/me')] });
    assert.deepEqual(parsePreferences({ roots: ['/a/b', 'relative', '/a/b/', 3], permissionMode: 'bypassPermissions', model: 'opus; rm -rf', agentNote: ` ${'x'.repeat(700)} `, festivals: 'yes' }), {
      roots: [path.resolve('/a/b')], agentNote: 'x'.repeat(600),
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
    assert.deepEqual(parsePreferences({ pet: { kind: 'droid', variant: 'sphere', colors: { fur: '#e8742c' } } }).pet, { kind: 'droid', variant: 'sphere', colors: { fur: '#e8742c' } });
    assert.equal(parsePreferences({ pet: { kind: 'droid', variant: 'wookiee' } }).pet, undefined);
    assert.equal(parsePreferences({ theme: 'pirate' }).theme, 'pirate');
    assert.equal(parsePreferences({ theme: 'moon' }).theme, undefined, 'an unknown theme is left out');
    assert.deepEqual(parsePreferences({ effort: 'xhigh', timeFormat: '12h', timestamps: true, turnDuration: false, reduceMotion: 'yes' }), { effort: 'xhigh', timeFormat: '12h', timestamps: true, turnDuration: false });
    assert.deepEqual(parsePreferences({ effort: 'ultra', timeFormat: 'swatch' }), {});
    assert.deepEqual(parsePreferences({ windowStyle: 'terminal' }), { windowStyle: 'terminal' });
    assert.deepEqual(parsePreferences({ windowStyle: 'matrix' }), {});
    assert.deepEqual(parsePreferences({ remoteByDefault: true }), { remoteByDefault: true });
    assert.deepEqual(parsePreferences({ remoteByDefault: 'yes' }), {});
    assert.deepEqual(parsePreferences({ tagColors: true }), { tagColors: true });
    assert.deepEqual(parsePreferences({ sessionPanel: false, maxWindows: 3 }), { sessionPanel: false, maxWindows: 3 });
    assert.deepEqual(parsePreferences({ sessionPanel: 'no', maxWindows: 7 }), {}, 'more windows than fit is left out');
    assert.deepEqual(parsePreferences({ maxWindows: 0 }), {});
    assert.deepEqual(parsePreferences({ alwaysArrangeHint: true }), { alwaysArrangeHint: true });
    assert.deepEqual(parsePreferences({ alwaysArrangeHint: 'on' }), {});
    assert.deepEqual(parsePreferences({ maxWindows: 2.5 }), {});
    assert.deepEqual(parsePreferences({ detailedActions: true }), { detailedActions: true });
    assert.deepEqual(parsePreferences({ detailedActions: 'yes' }), {});
    assert.deepEqual(parsePreferences({ promptSuggestions: false }), { promptSuggestions: false });
    assert.deepEqual(parsePreferences({ promptSuggestions: 'no' }), {});
    assert.deepEqual(parsePreferences({ accountsBrowser: 'chrome' }), { accountsBrowser: 'chrome' });
    assert.deepEqual(parsePreferences({ accountsBrowser: 'firefox' }), {}, 'an unknown browser is left out');
    assert.equal(parsePreferences({ glassOpacity: 45 }).glassOpacity, 45);
    assert.deepEqual(parsePreferences({ glassOpacity: 5 }), {}, 'too see-through to read is left out');
    assert.deepEqual(parsePreferences({ isolate: 'always' }), { isolate: 'always' });
    assert.deepEqual(parsePreferences({ isolate: 'sometimes' }), {}, 'an unknown way to isolate is left out');
    assert.deepEqual(parsePreferences({ claude: { enableWorkflows: false, crossSessionInbound: 'hold', outputStyle: 'Concis', workflowSizeGuideline: 'huge', ultracode: true, env: { A: '1' } } }).claude, {
      enableWorkflows: false, crossSessionInbound: 'hold', outputStyle: 'Concis',
    }, 'only the keys Open Space offers, with known values');
  });

  it('keeps a project icon only in a known shape, colour and size, for an absolute folder', () => {
    const picture = `${'a'.repeat(64)}.png`;
    const icons = parsePreferences({ projectIcons: {
      '/code/app': { kind: 'icon', name: 'FolderCode', color: 'emerald' },
      '/code/later': { kind: 'icon', name: 'SomeLaterIcon', color: 'rose' },
      '/code/emoji': { kind: 'emoji', value: '🚀' },
      '/code/flag': { kind: 'emoji', value: '🇫🇷' },
      '/code/mono': { kind: 'mono', letters: 'Té', color: 'sky' },
      '/code/accents': { kind: 'mono', letters: 'ÉÉ', color: 'sky' },
      '/code/devanagari': { kind: 'mono', letters: 'कि', color: 'sky' },
      '/code/image': { kind: 'image', id: picture },
      '/code/script': { kind: 'icon', name: '<svg onload=x>', color: 'red' },
      '/code/hex': { kind: 'icon', name: 'Bot', color: '#ff0000' },
      '/code/two': { kind: 'emoji', value: '🚀🚀' },
      '/code/text': { kind: 'emoji', value: 'a' },
      '/code/three': { kind: 'mono', letters: 'ABC', color: 'sky' },
      '/code/mark': { kind: 'mono', letters: '́', color: 'sky' },
      '/code/svg': { kind: 'image', id: `${'a'.repeat(64)}.svg` },
      '/code/away': { kind: 'image', id: '../secret.png' },
      '/code/before': { kind: 'image', dataUrl: 'data:image/png;base64,AAAA' },
      'relative/app': { kind: 'emoji', value: '🚀' },
    } }).projectIcons;
    assert.deepEqual(icons, {
      '/code/app': { kind: 'icon', name: 'FolderCode', color: 'emerald' },
      '/code/later': { kind: 'icon', name: 'SomeLaterIcon', color: 'rose' },
      '/code/emoji': { kind: 'emoji', value: '🚀' },
      '/code/flag': { kind: 'emoji', value: '🇫🇷' },
      '/code/mono': { kind: 'mono', letters: 'Té', color: 'sky' },
      '/code/accents': { kind: 'mono', letters: 'ÉÉ', color: 'sky' },
      '/code/devanagari': { kind: 'mono', letters: 'कि', color: 'sky' },
      '/code/image': { kind: 'image', id: picture },
    });
  });

  it('keeps the latest project icons once there are too many', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_PROJECT_ICONS + 5 }, (_, index) => [`/code/p${index}`, { kind: 'emoji', value: '🚀' }]));
    const kept = Object.keys(parsePreferences({ projectIcons: many }).projectIcons ?? {});
    assert.equal(kept.length, MAX_PROJECT_ICONS);
    assert.equal(kept[0], '/code/p5');
    assert.equal(kept.at(-1), `/code/p${MAX_PROJECT_ICONS + 4}`);
  });

  it('a settings file from before worktrees offers to isolate when the folder is taken', async () => {
    const file = path.join(folder, 'older.json');
    writeFileSync(file, JSON.stringify({ onboarded: true, model: 'opus', idleCompact: 30 }));
    const settings = new Settings(file);
    await settings.load();
    assert.equal(settings.preferences.isolate, 'busy');
    assert.equal(DEFAULT_PREFERENCES.isolate, 'busy');
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
    assert.deepEqual(reloaded.preferences, { ...DEFAULT_PREFERENCES, notifications: false, roots: [path.resolve('/w')], agentNote: 'Tutoie-moi.' });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).onboarded, true);
  });

  it('tells a file it could not read from a missing one, until the preferences are saved', async () => {
    const file = path.join(folder, 'corrupt.json');
    writeFileSync(file, '{ not json');
    const settings = new Settings(file);
    await settings.load();
    assert.equal(settings.loadFailed, true);
    await settings.update({ model: 'opus' });
    assert.equal(settings.loadFailed, false);
    const fresh = new Settings(path.join(folder, 'missing.json'));
    await fresh.load();
    assert.equal(fresh.loadFailed, false);
  });
});
