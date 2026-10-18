import type { Dictionary } from '../index.ts';

export const board: Dictionary['board'] = {
  title: 'Whiteboard',
  tabs: 'Notes',
  add: 'New note',
  newPlaceholder: 'Note name (e.g. meadow)',
  create: 'Create',
  cancel: 'Cancel',
  badName: 'Letters, digits, spaces, "-" and "_" only.',
  empty: (folder) => `No notes in ${folder} yet: each .md file of this folder becomes a tab of the whiteboard.`,
  emptyHint: 'Write here, or let your Claude sessions write in it, for instance with this line in your CLAUDE.md: ',
  help: 'What the whiteboard is for',
  helpWhat: (folder) => `The whiteboard shows the .md files of your notes folder (${folder}), one tab per file. You can write in them here.`,
  helpSessions: 'Your Claude sessions can write in them too: for instance, add to your CLAUDE.md a line like ',
  helpFolder: 'The notes folder is changed in Settings.',
  claudeLine: (folder) => `When a task is done, add a line to ${folder}/<project>.md`,
  edit: 'Edit',
  view: 'View',
  blank: 'Empty note: click to write.',
  editLabel: (title) => `Text of the note ${title}`,
  loading: 'Loading…',
  conflict: 'A session changed this note meanwhile: reloaded, your last change was not kept.',
};
