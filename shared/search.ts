// Finding words the way people type them: without caring about capitals or accents ("cafe" finds "Café"). Pure
// functions, used by a thread's search bar (src/command/useFeedSearch.ts) and by the search over every session
// (server/search.ts).

/** The text in lowercase without accents, and for each of its characters, the index it comes from in `text`. */
export function fold(text: string): { folded: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const plain = text[index].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const character of plain) { folded += character; origin.push(index); }
  }
  return { folded, origin };
}

export const foldQuery = (query: string) => fold(query.trim()).folded;

/** Where `needle` (already folded) starts in `haystack` (folded), one match after the other without overlapping. */
export function findAll(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const starts: number[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) starts.push(at);
  return starts;
}

/** Every word of the query is in the text, in any order ("pack zen" finds "le zen du pack"). */
export function matchesAll(text: string, query: string): boolean {
  const words = foldQuery(query).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const folded = fold(text).folded;
  return words.every((word) => folded.includes(word));
}

/**
 * The line of `text` around its first match of `query` (whole query first, else its first word), at most `width`
 * characters, with "…" where it was cut; `start`/`length`: where the match is in the line. Null when nothing matches.
 */
export function snippetOf(text: string, query: string, width = 140): { text: string; start: number; length: number } | null {
  const { folded, origin } = fold(text);
  const needle = foldQuery(query);
  const word = needle.split(/\s+/).find(Boolean) ?? '';
  let found = folded.indexOf(needle);
  let length = needle.length;
  if (found === -1 && word) { found = folded.indexOf(word); length = word.length; }
  if (found === -1 || !length) return null;
  const from = origin[found];
  const to = origin[found + length - 1] + 1;
  const flat = text.replace(/\s/g, ' ');
  const before = Math.max(0, Math.min(from - Math.floor((width - (to - from)) / 3), flat.length - width));
  const after = Math.min(flat.length, before + width);
  const head = before > 0 ? '…' : '';
  return { text: `${head}${flat.slice(before, after)}${after < flat.length ? '…' : ''}`, start: from - before + head.length, length: to - from };
}
