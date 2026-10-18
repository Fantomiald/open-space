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
