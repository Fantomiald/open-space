import { useMemo } from 'react';
import type { FileChange, SessionChanges } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { homeRelative, splitPath } from '../lib/format.ts';
import { diffRows } from '../state/diff.ts';
import { PanelFrame } from './PanelFrame.tsx';

const STATUS_LETTERS = { modified: 'M', added: 'A', deleted: 'D', outside: '?' } as const;

/** "+12 −3", the way Claude Code counts lines. */
export function LineCounts({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="cp-line-counts">
      <span data-sign="add" aria-hidden="true">+{added}</span> <span data-sign="remove" aria-hidden="true">−{removed}</span>
      <span className="cp-sr-only">{t.session.changes.lineCounts(added, removed)}</span>
    </span>
  );
}

/** A path from the session's folder when it is inside it, from the home otherwise; the folder part quiet. */
function shownPath(file: string, cwd: string) {
  const normalized = file.replace(/\\/g, '/'), base = cwd.replace(/\\/g, '/');
  const relative = normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : homeRelative(file);
  return splitPath(relative);
}

function FileDiff({ change, cwd, open }: { change: FileChange; cwd: string; open: boolean }) {
  const rows = useMemo(() => diffRows(change.patch), [change.patch]);
  const { folder, name } = shownPath(change.path, cwd);
  const note = change.status === 'outside' ? t.session.changes.outside
    : change.binary ? t.session.changes.binary
      : change.truncated && !rows.length ? t.session.changes.tooLong : null;
  return (
    <details className="cp-change" open={open}>
      <summary title={change.path}>
        <span className="cp-change__status" data-status={change.status} title={t.session.changes.status[change.status]}>{STATUS_LETTERS[change.status]}</span>
        <span className="cp-change__path"><span className="cp-muted">{folder}</span><span>{name}</span></span>
        {change.status !== 'outside' && !change.binary && <LineCounts added={change.added} removed={change.removed} />}
      </summary>
      {note ? <p className="cp-change__note">{note}</p> : (
        <div className="cp-diff">
          <table>
            <tbody>
              {rows.map((row) => row.kind === 'hunk'
                ? <tr key={`hunk:${row.before}:${row.after}`} data-kind="hunk"><td colSpan={3}>⋯ {row.text}</td></tr>
                : (
                  <tr key={`${row.kind}:${row.before}:${row.after}`} data-kind={row.kind}>
                    <td className="cp-diff__number">{row.before ?? ''}</td>
                    <td className="cp-diff__number">{row.after ?? ''}</td>
                    <td className="cp-diff__line"><span aria-hidden="true">{row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' '}</span>{row.text}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {change.truncated && <p className="cp-change__note">{t.session.changes.cut}</p>}
        </div>
      )}
    </details>
  );
}

/**
 * What a session changed: the files it and its sub-agents wrote that differ from their last commit, the latest first,
 * each with its diff. `changes`: undefined until the server answered.
 */
export function ChangesView({ cwd, changes, onBack, onRefresh }: { cwd: string; changes: SessionChanges | undefined; onBack: () => void; onRefresh: () => void }) {
  const files = changes?.files ?? [];
  const settled = changes ? changes.touched - files.length : 0;
  const summary = !changes ? t.session.changes.computing : files.length === 0 ? t.session.changes.none : (
    <>{t.session.files(files.length)} · <LineCounts added={changes.added} removed={changes.removed} /></>
  );
  return (
    <PanelFrame label={t.session.changes.label} summary={summary} onBack={onBack} onRefresh={onRefresh}>
        {changes && files.length === 0 && (
          <p className="cp-muted">{changes.touched === 0 ? t.session.changes.nothingWritten : t.session.changes.allSettled}</p>
        )}
        {files.map((change) => <FileDiff key={change.path} change={change} cwd={cwd} open={files.length <= 3} />)}
        {files.length > 0 && settled > 0 && (
          <p className="cp-panel-view__note">{t.session.changes.settled(settled)}</p>
        )}
        <p className="cp-panel-view__note">{t.session.changes.tracked}</p>
    </PanelFrame>
  );
}
