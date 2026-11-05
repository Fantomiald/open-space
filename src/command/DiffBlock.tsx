import { useEffect, useMemo, useState } from 'react';
import type { FileDiff } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { editRows } from '../state/edit-diff.ts';

/** The rows shown before "… +N lines" opens the rest, like ctrl+o in Claude Code. */
const SHOWN_ROWS = 40;
const SIGNS = { context: ' ', add: '+', remove: '−', hunk: '' } as const;

/**
 * A file an Edit, MultiEdit or Write call changed, as Claude Code shows it: "Update(path)", how many lines went in and
 * out, then its numbered lines in the table of the Changes view (.cp-diff), coloured by the file's language once its
 * highlighter has loaded (src/lib/highlight.ts: the text escaped, in tok-* spans).
 */
export function DiffBlock({ diff }: { diff: FileDiff }) {
  const words = t.session.feed.diff;
  const rows = useMemo(() => editRows(diff.hunks), [diff]);
  const [open, setOpen] = useState(false);
  const [coloured, setColoured] = useState<string[] | null>(null);
  useEffect(() => {
    let current = true;
    const code = rows.map((row) => row.text).join('\n');
    void import('../lib/highlight.ts').then(({ highlightedLines }) => highlightedLines(code, diff.path)).then((lines) => { if (current) setColoured(lines); });
    return () => { current = false; };
  }, [rows, diff.path]);
  const shown = open ? rows : rows.slice(0, SHOWN_ROWS);
  return (
    <li className="cp-feed__item" data-kind="diff">
      <div className="cp-edit">
        <p className="cp-edit__head"><code>{diff.created ? words.write : words.update}</code>({diff.path})</p>
        <p className="cp-edit__summary">{diff.created ? words.wrote(diff.added) : words.changed(diff.added, diff.removed)}</p>
        <div className="cp-diff">
          <table className="cp-code">
            <tbody>
              {shown.map((row, index) => (
                <tr key={`${row.kind}:${row.number}:${rows.indexOf(row)}`} data-kind={row.kind}>
                  <td className="cp-diff__number">{row.kind === 'hunk' ? '⋮' : row.number}</td>
                  <td className="cp-diff__line">
                    <span aria-hidden="true">{SIGNS[row.kind]}</span>
                    {coloured?.[index] !== undefined
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: highlightedLines escapes the code and only adds tok-* spans
                      ? <code dangerouslySetInnerHTML={{ __html: coloured[index] }} />
                      : <code>{row.text}</code>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > SHOWN_ROWS && (
          <button type="button" className="cp-edit__more" onClick={() => setOpen(!open)}>{open ? words.less : words.more(rows.length - SHOWN_ROWS)}</button>
        )}
        {diff.truncated && <p className="cp-edit__summary">{words.cut}</p>}
      </div>
    </li>
  );
}
