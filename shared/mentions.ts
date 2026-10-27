// "@Name" in a message: another session named, by its name or its tag, which the page shows as such and the server
// introduces to Claude.

export interface Mention { start: number; end: number; name: string }

const NAME_CHAR = /[\p{L}\p{N}_-]/u;
const BEFORE_AT = /[\p{L}\p{N}._-]/u;

/**
 * The sessions named in `text` by "@" and their name, in any case: the longest name that fits wins ("@Ana Lou" over
 * "@Ana"), and an "@" inside a word (an email) or a name going on ("@Anabelle" for Ana) is none.
 */
export function findMentions(text: string, names: readonly string[]): Mention[] {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  const found: Mention[] = [];
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    if (at > 0 && BEFORE_AT.test(text[at - 1])) continue;
    const name = sorted.find((candidate) => {
      const end = at + 1 + candidate.length;
      return text.slice(at + 1, end).toLowerCase() === candidate.toLowerCase() && !(end < text.length && NAME_CHAR.test(text[end]));
    });
    if (name) { found.push({ start: at, end: at + 1 + name.length, name }); at += name.length; }
  }
  return found;
}

/** What "@" can name a session by: its name, and its tag when it has one. */
export function mentionNames(sessions: Iterable<{ name: string; tag?: string }>): string[] {
  return [...sessions].flatMap((session) => (session.tag ? [session.name, session.tag] : [session.name]));
}

/** Whether a mention found by findMentions names this session, by its name or its tag. */
export function isNamedBy(mention: string, session: { name: string; tag?: string }): boolean {
  const wanted = mention.toLowerCase();
  return session.name.toLowerCase() === wanted || session.tag?.toLowerCase() === wanted;
}

/** The "@" being typed where the caret is ("va voir @Li"): where it starts and what follows it, else null. */
export function mentionAt(text: string, caret: number): { start: number; typed: string } | null {
  const match = /(?:^|[\s(])@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, typed: match[1] } : null;
}
