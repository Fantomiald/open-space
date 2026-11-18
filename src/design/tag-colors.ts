// The colours of the session tags (Preferences.tagColors), the same on the panes (.cp-tag[data-hue]) and in the room.
const TAG_COLORS = ['#ff8f8a', '#ffb866', '#f2d45c', '#a9d95f', '#6fdc9b', '#5fd9c8', '#6fcfff', '#8cb4ff', '#b5a3ff', '#dc9bf0', '#f29bd2', '#d8b894'];

/** Where a tag falls in the colours, from its name alone (FNV-1a): "Pro" and "pro" are the same everywhere, for everyone. */
export function tagHue(tag: string): number {
  let hash = 0x811c9dc5;
  for (const char of tag.trim().toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193);
  return (hash >>> 0) % TAG_COLORS.length;
}

export const tagColor = (tag: string) => TAG_COLORS[tagHue(tag)];

/**
 * The colours of one session's tags, in their order: each its own (tagHue), unless an earlier tag of the session took
 * it; then the next free one, so that the tags of a session never look alike.
 */
export function sessionTagHues(tags: readonly string[]): number[] {
  const taken = new Set<number>();
  return tags.map((tag) => {
    let hue = tagHue(tag);
    while (taken.has(hue) && taken.size < TAG_COLORS.length) hue = (hue + 1) % TAG_COLORS.length;
    taken.add(hue);
    return hue;
  });
}

/** The colours of one session's tags, in their order (see sessionTagHues). */
export const sessionTagColors = (tags: readonly string[]) => sessionTagHues(tags).map((hue) => TAG_COLORS[hue]);

export function applyTagColors(enabled: boolean) {
  const root = document.documentElement;
  root.dataset.tagColors = String(enabled);
  for (const [hue, color] of TAG_COLORS.entries()) root.style.setProperty(`--tag-${hue}`, color);
}

const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrastWithWhite = (rgb: number[]) => 1.05 / (luminance(rgb) + 0.05);

/**
 * `color` (#rrggbb) darkened just enough for white text on it to read (WCAG AA, 4.5:1): its hue and saturation kept,
 * its lightness taken down one step at a time.
 */
export function darkEnoughForWhite(color: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2, delta = max - min;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const hue = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const rgbAt = (l: number) => {
    const chroma = (1 - Math.abs(2 * l - 1)) * saturation, x = chroma * (1 - Math.abs((hue % 2) - 1)), m = l - chroma / 2;
    const [a, c, d] = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(hue) % 6];
    return [a, c, d].map((value) => Math.round((value + m) * 255));
  };
  let l = lightness;
  while (l > 0 && contrastWithWhite(rgbAt(l)) < 4.5) l -= 0.005;
  return `#${rgbAt(Math.max(l, 0)).map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
