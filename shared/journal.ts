// The whiteboard's notes (the room's "Tableau"): Markdown files directly inside the journal folder of the settings, one
// per project, that Claude sessions write to as well. Shared because the page names new notes the way the server checks them.

/** A note's file name: letters, digits, "_", " ", "." and "-", ending in ".md", neither hidden nor in a sub-folder. */
export const NOTE_NAME = /^\w[\w .-]{0,95}\.md$/;
/** The longest note read or written, in bytes (and so in characters). */
export const MAX_NOTE = 1_000_000;

/** The file name of a note the user titled ("meadow" or "meadow.md": "meadow.md"), or null when it cannot be one. */
export function noteFileName(title: string): string | null {
  const name = `${title.trim().replace(/\.md$/i, '')}.md`;
  return NOTE_NAME.test(name) ? name : null;
}

/** A note's title, as its tab shows it: its file name without ".md". */
export const noteTitle = (name: string) => name.replace(/\.md$/, '');

/** A character as the notes' search compares it: in lower case, without its accents ("É" is "e"). */
const foldCharacter = (character: string) => character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Where `query` is in `text`, case and accents aside: [start, end) offsets in `text`, so the page can mark them in the
 * text it shows. Folding may change a character's length, hence the offsets kept for each folded character.
 */
export function findInNote(text: string, query: string): [number, number][] {
  const needle = [...query.trim()].map(foldCharacter).join('');
  if (!needle) return [];
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let at = 0; at < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(at) ?? 0);
    const fold = foldCharacter(character);
    for (let index = 0; index < fold.length; index++) { starts.push(at); ends.push(at + character.length); }
    // a mark folded away (a decomposed accent) goes with the character before it
    if (!fold && ends.length) ends[ends.length - 1] = at + character.length;
    folded += fold;
    at += character.length;
  }
  const found: [number, number][] = [];
  for (let index = folded.indexOf(needle); index !== -1; index = folded.indexOf(needle, index + needle.length)) {
    found.push([starts[index] as number, ends[index + needle.length - 1] as number]);
  }
  return found;
}
