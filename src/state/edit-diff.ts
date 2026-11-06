// The lines of the diff of a file a session changed, as the thread shows them (src/command/DiffBlock.tsx). Pure function.
import type { DiffHunk } from '../../shared/protocol.ts';
import { diffRows } from './diff.ts';

/** One line of the diff: what it is, its one number in the file, its text without the sign; `hunk`: the gap between two hunks. */
export interface EditRow { kind: 'context' | 'add' | 'remove' | 'hunk'; number: number | null; text: string }

/**
 * The rows of Claude Code's hunks (FileDiff), read as a unified diff by diffRows and numbered as Claude Code numbers
 * them: a removed line by the file before, the others by the file after; a gap before every hunk but the first.
 */
export function editRows(hunks: readonly DiffHunk[]): EditRow[] {
  const patch = hunks.map((hunk) => `@@ -${hunk.oldStart} +${hunk.newStart} @@\n${hunk.lines.join('\n')}`).join('\n');
  return diffRows(patch).flatMap((row, index): EditRow[] => {
    if (row.kind === 'hunk') return index ? [{ kind: 'hunk', number: null, text: '' }] : [];
    return [{ kind: row.kind, number: row.kind === 'remove' ? row.before : row.after, text: row.text }];
  });
}
