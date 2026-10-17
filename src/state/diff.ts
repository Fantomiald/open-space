/** A line of a file's diff as shown: a hunk's start (where it starts), or a line kept, added or removed with its numbers before and after. */
export type DiffRow =
  | { kind: 'hunk'; before: number; after: number; text: string }
  | { kind: 'context' | 'add' | 'remove'; before: number | null; after: number | null; text: string };

/** The rows of a unified diff from its first hunk on ("@@ -1,3 +1,4 @@" headers, then " ", "+" and "-" lines). */
export function diffRows(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let before = 0, after = 0;
  for (const line of patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line);
    if (hunk) {
      before = Number(hunk[1]);
      after = Number(hunk[2]);
      rows.push({ kind: 'hunk', before, after, text: hunk[3] });
    } else if (line.startsWith('+')) rows.push({ kind: 'add', before: null, after: after++, text: line.slice(1) });
    else if (line.startsWith('-')) rows.push({ kind: 'remove', before: before++, after: null, text: line.slice(1) });
    else if (line.startsWith(' ')) rows.push({ kind: 'context', before: before++, after: after++, text: line.slice(1) });
    // "\ No newline at end of file" and the empty end say nothing worth a row
  }
  return rows;
}
