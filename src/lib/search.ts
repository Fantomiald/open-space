// Finding words in a thread the way people type them: without caring about capitals or accents ("eleve" finds
// "Élève"). Pure functions; the thread's DOM side is in src/command/useFeedSearch.ts.

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
