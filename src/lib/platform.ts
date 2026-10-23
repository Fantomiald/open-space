export const IS_WINDOWS = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The modifier shown for app shortcuts: Command on Apple platforms, Control elsewhere. */
export const MODIFIER = IS_MAC ? '⌘' : 'Ctrl';
