/**
 * The keyboard shortcuts the user can change (Settings > Shortcuts), as App.tsx listens to them. A combo is kept as a
 * canonical string: `Mod+`, `Alt+`, `Shift+`, in this order and each optional, then a key. `Mod` is Command on a Mac,
 * Control elsewhere; the key is one printable character in lower case (`+` included) or a name of NAMED_KEYS.
 */

export const SHORTCUT_ACTIONS = ['search', 'settings', 'focus', 'terminal', 'threadSearch', 'newSession', 'quickSession', 'hide'] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type Shortcuts = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: Shortcuts = {
  search: 'Mod+k',
  settings: 'Mod+,',
  focus: 'Mod+.',
  terminal: 'Mod+Alt+t',
  threadSearch: 'Mod+f',
  newSession: 'n',
  quickSession: 'Shift+n',
  hide: 'Tab',
};

/** The keys known by name, with how they are shown (Escape is known only to be refused: it belongs to the dialogs and the interrupt). */
const NAMED_KEYS = new Map<string, string>(Object.entries({
  Tab: 'tab', Enter: 'enter', Space: 'space', Backspace: 'backspace', Delete: 'delete', Home: 'home', End: 'end',
  PageUp: 'pgup', PageDown: 'pgdn', Insert: 'insert', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'esc',
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`])),
}));
/** What `e.key` says for a modifier held alone, or a key that does not say which (a dead key, an input method). */
const NO_KEY = new Set(['Meta', 'Control', 'Alt', 'AltGraph', 'Shift', 'CapsLock', 'OS', 'Fn', 'Hyper', 'Super', 'Dead', 'Process', 'Unidentified']);
const PREFIXES = ['Mod', 'Alt', 'Shift'] as const;

/**
 * Taken by the page or the system whatever the user wants: Escape (dialogs, the interrupt), Shift+Tab (the focus),
 * Alt+1…9 (a request in the header's projects), copy, paste, cut, select all and undo; Space and Enter alone press
 * the focused button, and the other named keys alone (arrows, Backspace, Home…) scroll the page and move in the menus.
 */
const RESERVED = new Set(['Shift+Tab', 'Space', 'Enter', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ...Array.from({ length: 9 }, (_, i) => `Alt+${i + 1}`), ...['c', 'v', 'x', 'a', 'z'].map((key) => `Mod+${key}`)]);

interface EventLike { key: string; code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

const isChar = (key: string) => [...key].length === 1 && /^[^\p{C}\s]$/u.test(key);
const isLetter = (char: string) => char.toLowerCase() !== char.toUpperCase();
/** The key by its place (KeyT, Digit1), whatever the layout or Option say. */
const keyOfCode = (code: string) => /^Key([A-Z])$/.exec(code)?.[1].toLowerCase() ?? /^Digit([0-9])$/.exec(code)?.[1] ?? null;

/** The combo a keydown makes, or null for a modifier pressed alone or a key that does not say which. */
export function comboOf(e: EventLike): string | null {
  if (NO_KEY.has(e.key) && !(e.altKey && keyOfCode(e.code))) return null;
  let key: string | null = null;
  let shift = e.shiftKey;
  // Option changes what `e.key` says on a Mac (⌥T types †): with Alt, a plain letter or digit is itself (AZERTY), else the key by its place
  if (e.altKey) key = /^[a-zA-Z0-9]$/.test(e.key) ? e.key.toLowerCase() : keyOfCode(e.code);
  if (!key) {
    if (e.key === ' ') key = 'Space';
    else if (NAMED_KEYS.has(e.key)) key = e.key;
    else if (isChar(e.key)) {
      key = e.key.toLowerCase();
      // a sign typed with Shift (`.` on a French keyboard, `?`) is the sign itself: Shift is part of it
      if (!isLetter(key)) shift = false;
    } else key = keyOfCode(e.code);
  }
  if (!key) return null;
  return `${e.metaKey || e.ctrlKey ? 'Mod+' : ''}${e.altKey ? 'Alt+' : ''}${shift ? 'Shift+' : ''}${key}`;
}

function partsOf(combo: string): { mods: Set<(typeof PREFIXES)[number]>; key: string } {
  const mods = new Set<(typeof PREFIXES)[number]>();
  let rest = combo;
  for (const prefix of PREFIXES) {
    if (rest.length > prefix.length + 1 && rest.startsWith(`${prefix}+`)) {
      mods.add(prefix);
      rest = rest.slice(prefix.length + 1);
    }
  }
  return { mods, key: rest };
}

/** A combo read from a file or the page, as stored, or null when it is not one. */
export function parseCombo(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 30) return null;
  const { key } = partsOf(raw);
  const known = NAMED_KEYS.has(key) || (isChar(key) && key === key.toLowerCase());
  return known ? raw : null;
}

const isReserved = (combo: string) => partsOf(combo).key === 'Escape' || RESERVED.has(combo);

/** The user's own combos from the settings file, those that are valid and free to take. */
export function parseShortcuts(raw: unknown): Partial<Shortcuts> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const found: Partial<Shortcuts> = {};
  for (const action of SHORTCUT_ACTIONS) {
    const combo = parseCombo((raw as Record<string, unknown>)[action]);
    if (combo) found[action] = combo;
  }
  // an override that is reserved or shares its combo with another action goes, the later action first so the earlier keeps it, until none is left
  for (let changed = true; changed; ) {
    changed = false;
    for (const action of [...SHORTCUT_ACTIONS].reverse()) {
      const combo = found[action];
      if (combo && shortcutProblem(action, combo, resolveShortcuts(found))) {
        delete found[action];
        changed = true;
      }
    }
  }
  return found;
}

/** Every action's combo: the user's own, the default for the others. */
export const resolveShortcuts = (overrides: Partial<Shortcuts> | undefined): Shortcuts => ({ ...DEFAULT_SHORTCUTS, ...overrides });

/** The action a combo does, if any. */
export const actionOf = (combo: string, shortcuts: Shortcuts): ShortcutAction | undefined => SHORTCUT_ACTIONS.find((action) => shortcuts[action] === combo);

/** Why `combo` cannot be given to `action`: the page keeps it, or another action has it; null when it can. */
export function shortcutProblem(action: ShortcutAction, combo: string, current: Shortcuts): 'reserved' | { taken: ShortcutAction } | null {
  if (isReserved(combo)) return 'reserved';
  const taken = SHORTCUT_ACTIONS.find((other) => other !== action && current[other] === combo);
  return taken ? { taken } : null;
}

/** The user's own combos once `action` gets `combo`: only those that differ from the default are kept. */
export function withShortcut(overrides: Partial<Shortcuts> | undefined, action: ShortcutAction, combo: string | null): Partial<Shortcuts> {
  const next = { ...overrides };
  if (combo === null || combo === DEFAULT_SHORTCUTS[action]) delete next[action];
  else next[action] = combo;
  return next;
}

/** How the modifiers are written on this computer; on a Mac they come before the key in Apple's order (⌥⇧⌘). */
export interface KeyNames { mod: string; alt: string; shift: string; mac: boolean }

/** The keys of a combo as shown, one `<kbd>` each. */
export function comboKeys(combo: string, names: KeyNames): string[] {
  const { mods, key } = partsOf(combo);
  const order = names.mac ? (['Alt', 'Shift', 'Mod'] as const) : (['Mod', 'Alt', 'Shift'] as const);
  const label = { Mod: names.mod, Alt: names.alt, Shift: names.shift };
  return [...order.filter((mod) => mods.has(mod)).map((mod) => label[mod]), NAMED_KEYS.get(key) ?? key.toUpperCase()];
}
