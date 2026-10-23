/** Absolute filesystem paths used in settings, without depending on Node in the page. */
export const isAbsolutePath = (value: string) => /^(?:\/|[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value);

export const isFolderPath = (value: string) => value.length <= 1000 && !value.includes('\0')
  && (isAbsolutePath(value) || /^~(?:[\\/]|$)/.test(value));

/** Legacy ~ paths remain readable on Windows, including the native separator. */
export const expandHomePath = (value: string, home: string) => value === '~' ? home : value.replace(/^~(?=[\\/])/, () => home.replace(/[\\/]$/, ''));
