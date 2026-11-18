// "@Name" in a message: another session named, by its name or its tag, which the page shows as such and the server
// introduces to Claude.

export interface Mention { start: number; end: number; name: string }

const NAME_CHAR = /[\p{L}\p{N}_-]/u;
const BEFORE_AT = /[\p{L}\p{N}._-]/u;
/** After a name, what makes it a path instead ("@src/app.ts", "@README.md"): a separator, or a dot then a name. */
const PATH_GOES_ON = /^(?:[/\\]|\.[\p{L}\p{N}_-])/u;

/**
 * The sessions named in `text` by "@" and their name, in any case: the longest name that fits wins ("@Ana Lou" over
 * "@Ana"), and an "@" inside a word (an email), a name going on ("@Anabelle" for Ana) or a path that starts like a
 * name ("@src/app.ts" for a session named src, see shared/file-mentions.ts) is none.
 */
export function findMentions(text: string, names: readonly string[]): Mention[] {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  const found: Mention[] = [];
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    if (at > 0 && BEFORE_AT.test(text[at - 1])) continue;
    const name = sorted.find((candidate) => {
      const end = at + 1 + candidate.length;
      return text.slice(at + 1, end).toLowerCase() === candidate.toLowerCase() && !(end < text.length && NAME_CHAR.test(text[end])) && !PATH_GOES_ON.test(text.slice(end, end + 2));
    });
    if (name) { found.push({ start: at, end: at + 1 + name.length, name }); at += name.length; }
  }
  return found;
}

/** What "@" can name a session by: its name, and each of its tags. */
export function mentionNames(sessions: Iterable<{ name: string; tags?: readonly string[] }>): string[] {
  return [...sessions].flatMap((session) => [session.name, ...(session.tags ?? [])]);
}

/** Whether a mention found by findMentions names this session, by its name or one of its tags. */
export function isNamedBy(mention: string, session: { name: string; tags?: readonly string[] }): boolean {
  const wanted = mention.toLowerCase();
  return session.name.toLowerCase() === wanted || !!session.tags?.some((tag) => tag.toLowerCase() === wanted);
}

/**
 * The "@" being typed where the caret is ("va voir @Li"): where it starts, what follows it up to the caret, and where it
 * ends, else null. A quoted path (`@"my no`) takes its spaces, and ends after its closing quote when one follows the
 * caret in the same word (`@"my docs/|"`).
 */
export function mentionAt(text: string, caret: number): { start: number; end: number; typed: string } | null {
  const before = text.slice(0, caret);
  const quoted = /(?:^|[\s(])@("[^"\n]*)$/.exec(before);
  if (quoted) {
    const closing = /^[^"\s]*"/.exec(text.slice(caret));
    return { start: caret - quoted[1].length - 1, end: caret + (closing?.[0].length ?? 0), typed: quoted[1] };
  }
  const match = /(?:^|[\s(])@([^\s@]*)$/.exec(before);
  return match ? { start: caret - match[1].length - 1, end: caret, typed: match[1] } : null;
}
