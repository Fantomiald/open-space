// The diffs of the files a session changes, from what Claude Code says of its own Edit, MultiEdit and Write calls.
import path from 'node:path';
import type { DiffHunk, FileDiff } from '../shared/protocol.ts';
import { asArray, asJson, asNumber, asString, type Json } from './json.ts';

/** The tools whose result carries a diff of their file. */
export const DIFF_TOOLS: ReadonlySet<string> = new Set(['Edit', 'MultiEdit', 'Write']);
/** The lines a diff keeps (the rest is counted, not kept: the thread shows a change, the session's log stays small). */
export const MAX_DIFF_LINES = 400;
const MAX_LINE = 400;

/** The file's path from the session's folder when it is inside it, else whole. */
function shownPath(file: string, cwd: string | undefined): string {
  if (!cwd) return file;
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

/**
 * The diff of an Edit, MultiEdit or Write call from its result (checked with 2.1.318, fixtures/edit-turn.jsonl):
 * `structuredPatch` holds Claude Code's hunks; a Write that creates a file has an empty one, `type: "create"` and the
 * file's `content`. Null for another tool, or a result without a change.
 */
export function fileDiff(tool: string, result: Json, cwd?: string): FileDiff | null {
  const file = asString(result.filePath);
  if (!DIFF_TOOLS.has(tool) || !file) return null;
  const created = result.type === 'create';
  const content = asString(result.content).replace(/\n$/, '');
  const hunks: DiffHunk[] = created
    ? [{ oldStart: 0, newStart: 1, lines: content ? content.split('\n').map((line) => `+${line}`) : [] }]
    : asArray(result.structuredPatch).map(asJson).map((hunk) => ({ oldStart: asNumber(hunk.oldStart), newStart: asNumber(hunk.newStart), lines: asArray(hunk.lines).map((line) => asString(line)) }));
  const lines = hunks.flatMap((hunk) => hunk.lines);
  if (!lines.length) return null;
  const added = lines.filter((line) => line.startsWith('+')).length;
  const removed = lines.filter((line) => line.startsWith('-')).length;
  let room = MAX_DIFF_LINES;
  const kept = hunks.flatMap((hunk) => {
    if (room <= 0) return [];
    const taken = hunk.lines.slice(0, room).map((line) => line.slice(0, MAX_LINE));
    room -= taken.length;
    return [{ ...hunk, lines: taken }];
  });
  return { path: shownPath(file, cwd), created, added, removed, hunks: kept, ...(lines.length > MAX_DIFF_LINES ? { truncated: true as const } : {}) };
}
