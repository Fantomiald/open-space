import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comboOf, DEFAULT_SHORTCUTS, parseCombo, parseShortcuts, resolveShortcuts, shortcutProblem, withShortcut } from './shortcuts.ts';

const press = (key: string, code: string, held: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) =>
  comboOf({ key, code, metaKey: !!held.meta, ctrlKey: !!held.ctrl, altKey: !!held.alt, shiftKey: !!held.shift });

describe('the combo a key press makes', () => {
  it('fires the default shortcuts as before, on a QWERTY and on a French keyboard', () => {
    assert.equal(press('k', 'KeyK', { meta: true }), DEFAULT_SHORTCUTS.search);
    assert.equal(press('k', 'KeyK', { ctrl: true }), DEFAULT_SHORTCUTS.search, 'Control is the modifier off a Mac');
    assert.equal(press(',', 'KeyM', { meta: true }), DEFAULT_SHORTCUTS.settings, 'the comma of a French keyboard, by what it types');
    assert.equal(press('.', 'Comma', { meta: true, shift: true }), DEFAULT_SHORTCUTS.focus, 'the dot takes Shift on a French keyboard');
    assert.equal(press('Tab', 'Tab'), DEFAULT_SHORTCUTS.hide);
  });

  it('reads the key by its place when Option is held, as Option changes the character on a Mac', () => {
    assert.equal(press('†', 'KeyT', { meta: true, alt: true }), DEFAULT_SHORTCUTS.terminal);
    assert.equal(press('Dead', 'KeyN', { alt: true }), 'Alt+n');
    assert.equal(press('¡', 'Digit1', { alt: true }), 'Alt+1');
    assert.equal(press('æ', 'KeyA', { alt: true }), 'Alt+a');
  });

  it('reads the letter typed when Alt is held, as the key is not at the same place on a French keyboard', () => {
    assert.equal(press('a', 'KeyQ', { alt: true }), 'Alt+a');
  });

  it('keeps Shift with a letter', () => {
    assert.equal(press('N', 'KeyN', { shift: true }), DEFAULT_SHORTCUTS.quickSession);
    assert.equal(press('n', 'KeyN'), DEFAULT_SHORTCUTS.newSession);
  });

  it('names the space bar', () => {
    assert.equal(press(' ', 'Space', { ctrl: true }), 'Mod+Space');
  });

  it('makes nothing of a modifier pressed alone or a dead key', () => {
    for (const key of ['Meta', 'Control', 'Alt', 'Shift']) assert.equal(press(key, `${key}Left`, { shift: key === 'Shift', alt: key === 'Alt' }), null, key);
    assert.equal(press('Dead', 'BracketLeft'), null);
  });
});

describe('the shortcuts read from the settings', () => {
  it('reads back every combo a key press makes', () => {
    for (const combo of ['Mod+Alt+Shift+k', 'Mod++', 'Shift+F5', 'Alt+ArrowUp', 'g', 'Mod+Space']) assert.equal(parseCombo(combo), combo);
  });

  it('refuses what is not a combo', () => {
    for (const junk of ['', 'Mod+', 'Shift+Mod+k', 'Mod+K', 'Ctrl+k', 'Mod+Shift', 'kk', 'Mod+toString', 'constructor', 7, null]) assert.equal(parseCombo(junk), null, String(junk));
  });

  it('keeps the valid combos of known actions only, and none the page keeps for itself', () => {
    assert.deepEqual(parseShortcuts({ search: 'Mod+p', focus: 'Mod+K', hide: 'Escape', settings: 'Mod+c', nope: 'Mod+j', newSession: 3 }), { search: 'Mod+p' });
    assert.deepEqual(parseShortcuts({ search: 'ArrowUp' }), {});
    assert.deepEqual(parseShortcuts('Mod+p'), {});
    assert.deepEqual(parseShortcuts(['Mod+p']), {});
  });
});

describe('the shortcuts read from the settings never share a combo', () => {
  it('drops a combo another action has', () => {
    assert.deepEqual(parseShortcuts({ search: 'n' }), {});
    assert.deepEqual(parseShortcuts({ search: 'Mod+p', focus: 'Mod+p' }), { search: 'Mod+p' });
  });

  it('keeps a combo the other action gives up', () => {
    assert.deepEqual(parseShortcuts({ search: 'n', newSession: 'm' }), { search: 'n', newSession: 'm' });
  });
});

describe('changing a shortcut', () => {
  const current = resolveShortcuts({});

  it('refuses the combos the page keeps', () => {
    for (const combo of ['Escape', 'Mod+Shift+Escape', 'Shift+Tab', 'Alt+3', 'Mod+c', 'Mod+v', 'Mod+z']) assert.equal(shortcutProblem('search', combo, current), 'reserved', combo);
  });

  it('refuses a named key alone that scrolls the page or moves in the menus, not Tab or a function key', () => {
    for (const key of ['ArrowUp', 'ArrowLeft', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Insert']) assert.equal(shortcutProblem('search', key, current), 'reserved', key);
    for (const combo of ['F5', 'Mod+ArrowUp', 'Shift+Home']) assert.equal(shortcutProblem('search', combo, current), null, combo);
  });

  it('says which action already has the combo', () => {
    assert.deepEqual(shortcutProblem('search', 'Mod+f', current), { taken: 'threadSearch' });
  });

  it('lets an action take its own combo again, or a free one', () => {
    assert.equal(shortcutProblem('threadSearch', 'Mod+f', current), null);
    assert.equal(shortcutProblem('search', 'Mod+p', current), null);
  });

  it('stores only the combos that differ from the default', () => {
    assert.deepEqual(withShortcut({ focus: 'Mod+j' }, 'search', 'Mod+p'), { focus: 'Mod+j', search: 'Mod+p' });
    assert.deepEqual(withShortcut({ search: 'Mod+p' }, 'search', DEFAULT_SHORTCUTS.search), {});
    assert.deepEqual(withShortcut({ search: 'Mod+p' }, 'search', null), {});
  });
});
