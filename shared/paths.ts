/** Absolute filesystem paths used in settings, without depending on Node in the page. */
export const isAbsolutePath = (value: string) => /^(?:\/|[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value);

/** A full path or one from the home ("~/…"), as typed in the settings. */
export const isFullPath = (value: string) => value.length <= 1000 && !value.includes('\0')
  && (isAbsolutePath(value) || /^~(?:[\\/]|$)/.test(value));

/** "~" is the home, followed by / or, on Windows, \\. */
export const expandHomePath = (value: string, home: string) => value === '~' ? home : value.replace(/^~(?=[\\/])/, () => home.replace(/[\\/]$/, ''));
