// The tags of a session (SessionInfo.tags): a few short labels the user puts on it to recognize it at a glance.

/** How long a tag may be, and how many a session may have. */
export const MAX_TAG = 24;
export const MAX_TAGS = 5;
/** The tags a name tag of the room shows before "+N". */
const ROOM_TAGS = 2;

const sameTag = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** `tags` tidied: trimmed, cut to MAX_TAG, the empty ones and the doubles (whatever their case) left out, MAX_TAGS at most. */
function tidy(tags: readonly string[]): string[] {
  const kept: string[] = [];
  for (const tag of tags.map((each) => each.trim().slice(0, MAX_TAG))) {
    if (tag && !kept.some((other) => sameTag(other, tag))) kept.push(tag);
  }
  return kept.slice(0, MAX_TAGS);
}

/** The tags written in a field or after /tag, separated by commas ("Pro, PDF"). */
export const parseTags = (text: string): string[] => tidy(text.split(','));

/** `current` with the tags written in `text` added after it. */
export const withTags = (current: readonly string[], text: string): string[] => tidy([...current, ...text.split(',')]);

/** `current` without `tag`, whatever its case. */
export const withoutTag = (current: readonly string[], tag: string): string[] => current.filter((each) => !sameTag(each, tag));

/** The tags of untrusted JSON (a stored session, a message of the page): its `tags`, or the single `tag` of older versions. */
export function storedTags(raw: { tags?: unknown; tag?: unknown }): string[] {
  if (Array.isArray(raw.tags)) return tidy(raw.tags.filter((tag): tag is string => typeof tag === 'string'));
  return typeof raw.tag === 'string' ? tidy([raw.tag]) : [];
}

/** What a name tag of the room shows of the tags: the first ones, and how many are left out. */
export function roomTags(tags: readonly string[]): { shown: string[]; more: number } {
  return { shown: tags.slice(0, ROOM_TAGS), more: Math.max(0, tags.length - ROOM_TAGS) };
}
