import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MergeProblem, SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { folderName } from '../lib/format.ts';
import type { FeedItem } from '../state/feed.ts';
import { useSessions } from '../state/sessions.ts';
import { branchCard, branchSignature } from '../state/worktrees.ts';
import { AlertIcon, BranchIcon, CheckIcon, MergeIcon, MoreIcon, PullRequestIcon, RefreshIcon, RemoveIcon, TimerIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

/** "3 commits": the number in bold, the word as it is. */
function Count({ text }: { text: string }) {
  const [, number, rest] = /^(\d+)(.*)$/.exec(text) ?? [null, '', text];
  return <span>{number && <b>{number}</b>}{rest}</span>;
}

/** The little branch after a session's name in the lists (focus mode, the state card): its name on hover. */
export const BranchMark = ({ branch }: { branch: string }) => (
  <span className="cp-branch-mark" role="img" aria-label={t.branches.icon(branch)} title={t.branches.icon(branch)}><BranchIcon /></span>
);

/** A branch's name, in monospace and the accent, as everywhere it shows. */
export const BranchName = ({ name }: { name: string }) => <code className="cp-branch-name">{name}</code>;

/** What became of the session's branch, told in its thread as a card (its base moved on, merged, thrown away…). */
export function BranchNewsItem({ item, sessionId, speaker }: { item: FeedItem & { kind: 'branch' }; sessionId: string; speaker: string }) {
  const folder = useSessions((s) => folderName(s.sessions[sessionId]?.worktree?.home ?? s.sessions[sessionId]?.cwd ?? ''));
  const words = t.branches.card;
  const [tone, icon, title, text] = ((): [string, ReactNode, string, string] => {
    switch (item.what) {
      case 'moved': return ['moved', <RefreshIcon key="i" />, words.moved(item.base), words.movedText(speaker, item.base, item.behind)];
      case 'merged': return ['done', <CheckIcon key="i" />, words.merged(item.base), words.mergedText(speaker, folder, item.base)];
      case 'discarded': return ['quiet', <RemoveIcon key="i" />, words.discarded, words.discardedText(item.branch, speaker, folder)];
      case 'kept': return ['quiet', <BranchIcon key="i" />, words.kept, words.keptText(item.branch)];
      case 'cleaned': return ['quiet', <BranchIcon key="i" />, words.cleaned, words.cleanedText(item.branch, speaker, folder)];
    }
  })();
  return (
    <li className="cp-feed__item" data-kind="branch">
      <section className="cp-branch-card" data-tone={tone}>
        <h3 className="cp-branch-card__title">{icon}{title}</h3>
        <p className="cp-branch-card__text">{text}</p>
      </section>
    </li>
  );
}

const problemText = (problem: MergeProblem, session: SessionInfo) => {
  const words = t.branches.card.problems;
  const base = session.worktree?.base ?? '';
  switch (problem.kind) {
    case 'dirty': return words.dirty(session.name, problem.count);
    case 'behind': return words.behind(base);
    case 'overlap': return words.overlap(folderName(session.worktree?.home ?? session.cwd), problem.count);
    case 'elsewhere': return words.elsewhere(base, folderName(problem.folder));
    case 'git': return words.git(problem.text);
    case 'stopped': return words.stopped(session.name);
  }
};

/** The other choices of a card ("⋯"): later, throw the branch away. */
function CardMenu({ onLater, onDiscard }: { onLater?: () => void; onDiscard: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const words = t.branches.card;
  const pick = (action: () => void) => () => { close(); action(); };
  return (
    <div className="cp-branch-card__more" ref={box}>
      <button type="button" className="cp-icon-button" data-size="small" aria-expanded={open} aria-haspopup="menu" aria-label={words.more} title={words.more} onClick={() => setOpen(!open)}><MoreIcon /></button>
      {open && (
        <div className="cp-detail__menu cp-branch-card__menu" role="menu" aria-label={words.more}>
          {onLater && <button type="button" role="menuitem" title={words.laterTitle} onClick={pick(onLater)}><TimerIcon />{words.later}</button>}
          <button type="button" role="menuitem" data-variant="danger" onClick={pick(onDiscard)}><RemoveIcon />{words.discard}</button>
        </div>
      )}
    </div>
  );
}

/**
 * The card at the end of an isolated session's thread: ready to merge into its base (Merge, Open a PR, Later, Throw
 * the branch away, confirmed in the card itself), or a merge that did not go through (why, and Try again).
 */
export function BranchCardView({ sessionId }: { sessionId: string }) {
  const session = useSessions((s) => s.sessions[sessionId]);
  const snoozed = useSessions((s) => s.branchSnoozes[sessionId]);
  const send = useSessions((s) => s.send);
  const snooze = useSessions((s) => s.snoozeBranch);
  const [confirming, setConfirming] = useState(false);
  // a click waits for the session to answer: the buttons stay still until its branch changes
  const [pending, setPending] = useState(false);
  // or until it is refused: the error shows as a toast, and the buttons can be used again
  const refused = useSessions((s) => s.toasts.findLast((toast) => toast.kind === 'error')?.id);
  const worktree = session?.worktree;
  const card = session ? branchCard(session, snoozed) : null;
  const stamp = worktree ? `${worktree.status?.head}:${worktree.merge?.step}:${session?.state}:${refused}` : '';
  useEffect(() => { setPending(false); setConfirming(false); }, [stamp]);
  if (!session || !worktree || !card) return null;
  const words = t.branches.card;
  const act = (action: 'merge' | 'pr' | 'discard' | 'dismiss') => { setPending(true); send({ t: 'branch', sessionId, action }); };
  const discard = confirming ? (
    <div className="cp-branch-card__confirm" role="alert">
      <p><b>{words.discardQuestion(worktree.branch)}</b> {words.discardText(session.name, folderName(worktree.home))}</p>
      <div className="cp-branch-card__actions">
        <button type="button" className="cp-button" data-size="small" autoFocus onClick={() => setConfirming(false)}>{words.cancel}</button>
        <button type="button" className="cp-button" data-size="small" data-variant="danger" disabled={pending} onClick={() => act('discard')}><RemoveIcon />{words.discardConfirm}</button>
      </div>
    </div>
  ) : null;

  if (card.kind === 'failed') {
    const problem = worktree.merge?.step === 'failed' ? worktree.merge.problem : null;
    return (
      <li className="cp-feed__item" data-kind="branch">
        <section className="cp-branch-card" data-tone="failed" aria-live="polite">
          <h3 className="cp-branch-card__title"><AlertIcon />{words.failed}</h3>
          {problem && <p className="cp-branch-card__text">{problemText(problem, session)}</p>}
          {discard ?? (
            <div className="cp-branch-card__actions">
              <button type="button" className="cp-button" data-size="small" data-variant="primary" disabled={pending} onClick={() => act('merge')}><RefreshIcon />{words.retry}</button>
              <button type="button" className="cp-button" data-size="small" data-variant="quiet" title={words.dismissTitle} disabled={pending} onClick={() => act('dismiss')}>{words.dismiss}</button>
              <CardMenu onDiscard={() => setConfirming(true)} />
            </div>
          )}
        </section>
      </li>
    );
  }

  const { status } = card;
  return (
    <li className="cp-feed__item" data-kind="branch">
      <section className="cp-branch-card" data-tone="ready" aria-live="polite">
        <h3 className="cp-branch-card__title"><MergeIcon />{words.ready(worktree.base)}</h3>
        <p className="cp-branch-card__facts">
          <BranchName name={worktree.branch} />
          {status.ahead > 0 && <Count text={words.commits(status.ahead)} />}
          <Count text={words.files(status.files)} />
          <span>{status.dirty ? words.dirty(status.dirty) : words.clean}</span>
        </p>
        {discard ?? (
          <div className="cp-branch-card__actions">
            <button type="button" className="cp-button" data-size="small" data-variant="primary" title={words.mergeTitle(session.name, worktree.base)} disabled={pending} onClick={() => act('merge')}><MergeIcon />{words.merge}</button>
            {worktree.canPr && <button type="button" className="cp-button" data-size="small" title={words.pullRequestTitle(session.name, worktree.base)} disabled={pending} onClick={() => act('pr')}><PullRequestIcon />{words.pullRequest}</button>}
            <CardMenu onLater={() => snooze(sessionId, branchSignature(status))} onDiscard={() => setConfirming(true)} />
          </div>
        )}
      </section>
    </li>
  );
}
