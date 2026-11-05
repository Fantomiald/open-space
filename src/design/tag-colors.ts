// The colours of the session tags (Preferences.tagColors), the same on the panes (.cp-tag[data-hue]) and in the room.
const TAG_COLORS = ['#ff8f8a', '#ffb866', '#f2d45c', '#a9d95f', '#6fdc9b', '#5fd9c8', '#6fcfff', '#8cb4ff', '#b5a3ff', '#dc9bf0', '#f29bd2', '#d8b894'];

/** Where a tag falls in the colours, from its name alone (FNV-1a): "Pro" and "pro" are the same everywhere, for everyone. */
export function tagHue(tag: string): number {
  let hash = 0x811c9dc5;
  for (const char of tag.trim().toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193);
  return (hash >>> 0) % TAG_COLORS.length;
}

export const tagColor = (tag: string) => TAG_COLORS[tagHue(tag)];

export function applyTagColors(enabled: boolean) {
  const root = document.documentElement;
  root.dataset.tagColors = String(enabled);
  for (const [hue, color] of TAG_COLORS.entries()) root.style.setProperty(`--tag-${hue}`, color);
}
