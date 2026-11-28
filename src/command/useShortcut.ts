import { useMemo } from 'react';
import { comboKeys, resolveShortcuts, type KeyNames, type ShortcutAction } from '../../shared/shortcuts.ts';
import { IS_MAC, MODIFIER, OPTION } from '../lib/platform.ts';
import { useSessions } from '../state/sessions.ts';

const KEY_NAMES: KeyNames = { mod: MODIFIER, alt: OPTION, shift: '⇧', mac: IS_MAC };

/** The keys of a combo as shown on this computer, one `<kbd>` each. */
export const shortcutKeys = (combo: string) => comboKeys(combo, KEY_NAMES);

/** The keys written in one piece, as platform.ts `shortcut()` does: ⌘K on a Mac, Ctrl+K elsewhere. */
export const shortcutText = (keys: readonly string[]) => keys.join(IS_MAC ? '' : '+');

/** The combo the user gave an action (its default when they did not), as it is shown. */
export function useShortcutKeys(action: ShortcutAction): string[] {
  const combo = useSessions((s) => resolveShortcuts(s.preferences.shortcuts)[action]);
  return useMemo(() => shortcutKeys(combo), [combo]);
}

/** The same, in one piece. */
export const useShortcutText = (action: ShortcutAction) => shortcutText(useShortcutKeys(action));
