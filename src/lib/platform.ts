export const IS_WINDOWS = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The modifier shown for app shortcuts: Command on Apple platforms, Control elsewhere. */
export const MODIFIER = IS_MAC ? '⌘' : 'Ctrl';
/** A shortcut as shown to the user: ⌘E on a Mac, Ctrl+E elsewhere. */
export const shortcut = (key: string) => (IS_MAC ? `⌘${key}` : `Ctrl+${key}`);
/** The Option key as shown to the user: ⌥ on a Mac, Alt elsewhere. */
export const OPTION = IS_MAC ? '⌥' : 'Alt';
