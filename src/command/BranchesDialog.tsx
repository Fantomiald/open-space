import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { t } from '../i18n/index.ts';
import { folderName, formatAge } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { chibiHead, lookOfStranger } from '../room/chibi.ts';
import { useSessions } from '../state/sessions.ts';
import { branchLines, checkedByDefault, keyOf, loss, type BranchLine } from '../state/worktrees.ts';
import { CheckIcon, CleanIcon, CloseIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { SessionFace } from './SessionFace.tsx';

/** The face of a line: the session's own when there is one, else the crew member it was for, else a stranger's. */
function LineFace({ line }: { line: BranchLine }) {
  const member = useSessions((s) => s.crew.find((candidate) => !candidate.self && candidate.name === line.name));
  if (line.session) return <SessionFace session={line.session} resting={line.state === 'resting'} />;
  const look = member ? member.look ?? DEFAULT_LOOK : lookOfStranger(line.row.branch || line.row.folder || '');
  return <span className="cp-face" data-status="idle"><img src={chibiHead(look)} alt="" width={36} height={36} /></span>;
}

/**
 * The branches of a project (⌘K "Branches", the branch pill, the launcher's reminder): every worktree of Open Space
 * and Claude Code, every os/* branch without one, with who it is for, how old, merged or not, and how its session is
 * doing. The merged ones nobody works on are checked; checking one with work turns the button red with what it would
 * lose. Nothing goes before the click on Clean.
 */
export function BranchesDialog() {
  const cwd = useSessions((s) => s.branchesFor);
  return cwd ? <BranchesPanel cwd={cwd} /> : null;
}

function BranchesPanel({ cwd }: { cwd: string }) {
  const list = useSessions((s) => s.branchLists[cwd]);
  const sessions = useSessions((s) => s.sessions);
  const openBranches = useSessions((s) => s.openBranches);
  const send = useSessions((s) => s.send);
  const now = useNow(60_000);
  const lines = useMemo(() => (list ? branchLines(list.rows, Object.values(sessions)) : []), [list, sessions]);
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [cleaning, setCleaning] = useState(false);
  // refused as a whole (the error shows as a toast): the button can be used again
  const refused = useSessions((s) => s.toasts.findLast((toast) => toast.kind === 'error')?.id);
  useEffect(() => { setCleaning(false); }, [refused]);
  // a new answer (opened, or after cleaning): the merged ones are checked again
  useEffect(() => { if (list) { setChecked(checkedByDefault(branchLines(list.rows, Object.values(useSessions.getState().sessions)))); setCleaning(false); } }, [list]);
  const words = t.branches.panel;
  const repo = list?.root ? folderName(list.root) : folderName(cwd);
  const close = () => openBranches(null);
  const chosen = checked ?? new Set<string>();
  const picked = lines.filter((line) => chosen.has(keyOf(line)));
  const lost = loss(lines, chosen);
  const losing = lost.commits > 0 || lost.files > 0;
  const toggle = (line: BranchLine) => {
    if (line.locked) return;
    const next = new Set(chosen);
    if (next.has(keyOf(line))) next.delete(keyOf(line)); else next.add(keyOf(line));
    setChecked(next);
  };
  const clean = () => {
    if (!picked.length) return;
    setCleaning(true);
    // what was seen of each: one that got work since is left by the server
    send({ t: 'cleanBranches', cwd, branches: picked.map(({ row }) => ({ branch: row.branch, folder: row.folder, head: row.head, dirty: row.dirty })) });
  };

  return (
    <Modal title={words.title(repo)} onClose={close} look="sheet">
      <div className="cp-branches">
        <header className="cp-branches__head">
          <h2>{words.title(repo)}</h2>
          <button type="button" className="cp-icon-button" aria-label={words.close} title={words.close} onClick={close}><CloseIcon /></button>
        </header>
        {!list ? <p className="cp-muted cp-branches__empty">{words.loading}</p>
          : !list.root ? <p className="cp-muted cp-branches__empty">{words.notRepo}</p>
            : lines.length === 0 ? <p className="cp-muted cp-branches__empty">{words.empty}</p> : (
              <ul className="cp-branches__list" aria-label={words.list}>
                {lines.map((line) => {
                  const { row } = line;
                  const on = chosen.has(keyOf(line));
                  const label = row.branch || folderName(row.folder ?? '');
                  const who = line.name ?? (row.claude ? words.claude : words.nobody);
                  const state = line.state === 'working' && row.ahead ? words.ahead(row.ahead)
                    : line.state === 'resting' && on ? `${words.sessions.resting}, ${words.rebranched(row.base)}`
                      : line.state === 'ready' && on ? `${words.sessions.ready}, ${words.rebranched(row.base)}` : words.sessions[line.state];
                  return (
                    <li key={keyOf(line)}>
                      <button
                        type="button" role="checkbox" className="cp-branches__row" aria-checked={on} aria-disabled={line.locked || undefined}
                        aria-label={words.check(label)} title={line.locked ? (line.state === 'working' ? words.locked : words.inUse) : undefined} onClick={() => toggle(line)}
                      >
                        <span className="cp-branches__check" aria-hidden="true">{on && <CheckIcon />}</span>
                        <LineFace line={line} />
                        <span className="cp-branches__text">
                          <span className="cp-branches__line">
                            <code className="cp-branch-name">{row.branch || words.noBranch}</code>
                            {line.locked ? <span className="cp-state-pill" data-tone="working">{line.state === 'working' ? words.states.working : words.states.inUse}</span>
                              : row.merged ? <span className="cp-state-pill" data-tone="merged">{words.states.merged}</span> : null}
                            {!line.locked && row.ahead > 0 && <span className="cp-state-pill" data-tone="ahead">{words.states.ahead(row.ahead)}</span>}
                            {!line.locked && row.dirty > 0 && <span className="cp-state-pill" data-tone="dirty">{words.states.dirty}</span>}
                          </span>
                          <span className="cp-branches__who">{who} · {state}</span>
                        </span>
                        <span className="cp-branches__age">{row.at ? formatAge(now - row.at) : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
        {list?.failed && list.failed.length > 0 && <p className="cp-branches__failed" role="alert">{words.failed(list.failed.join(', '))}</p>}
        <footer className="cp-branches__foot">
          <span className="cp-branches__meta" data-losing={losing || undefined}>
            {losing ? words.lost(lost.commits, lost.files) : picked.some((line) => line.row.folder) ? words.folders(picked.filter((line) => line.row.folder).length) : ''}
          </span>
          <button type="button" className="cp-button" data-variant={losing ? 'danger' : 'primary'} disabled={!picked.length || cleaning} onClick={clean}>
            <CleanIcon />{words.clean(picked.length)}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
