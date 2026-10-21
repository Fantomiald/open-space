// What the page shows of the sessions on a branch of their own (worktrees): when the launcher offers to isolate a new
// one, the card at the end of an isolated session's thread, what switching it off asks, and the cleaning panel's rows.
// Pure functions, tested without a DOM (src/state/worktrees.test.ts).
import type { BranchRow, BranchStatus, FolderRepo, IsolateMode, SessionInfo } from '../../shared/protocol.ts';
import { isInside, worktreeNames } from '../../shared/worktrees.ts';
import { isWorking } from './queue.ts';

/** The sessions that work in a repository's main checkout (resting ones too: their folder is the same), the latest first. */
export function occupants(sessions: readonly SessionInfo[], repo: Pick<FolderRepo, 'root'>, except?: string): SessionInfo[] {
  return sessions
    .filter((session) => session.id !== except && !session.worktree && isInside(session.cwd, repo.root))
    .sort((a, b) => b.stateSince - a.stateSince);
}

/**
 * Whether the launcher shows the "isolate on a branch" line for a folder, and whether it starts checked: only in a git
 * repository on a branch; when another session works in its main checkout (checked, unless the setting says never),
 * or always when the setting says so.
 */
export function isolationOffer(mode: IsolateMode, repo: FolderRepo | null | undefined, taken: number): { shown: boolean; checked: boolean } {
  if (!repo?.branch) return { shown: false, checked: false };
  if (mode === 'always') return { shown: true, checked: true };
  return { shown: taken > 0, checked: taken > 0 && mode === 'busy' };
}

/** The branch a new session would get, as the server will name it (before a suffix if it is taken). */
export const branchPreview = (name: string, about: string) => worktreeNames(name, about).branch;

/** What an isolated session's branch has to show: news (commits or changes), or nothing. */
export const hasNews = (status: BranchStatus | undefined) => !!status && (status.ahead > 0 || status.dirty > 0);

/** What "Later" remembers of a branch: the card comes back once the branch changes. */
export const branchSignature = (status: BranchStatus) => `${status.head}:${status.ahead}:${status.dirty}:${status.files}`;

/**
 * The card at the end of an isolated session's thread: ready to merge (it waits, its branch has news, not put off
 * with "Later"), or a merge that failed (with Try again); none while it works or merges.
 */
export type BranchCard = { kind: 'ready'; status: BranchStatus } | { kind: 'failed' } | null;

export function branchCard(session: SessionInfo, snoozed: string | undefined): BranchCard {
  const worktree = session.worktree;
  if (!worktree) return null;
  if (worktree.merge?.step === 'failed') return { kind: 'failed' };
  if (worktree.merge || session.state !== 'wait' || isWorking(session) || session.queued?.length) return null;
  const { status } = worktree;
  if (!status || !hasNews(status) || snoozed === branchSignature(status)) return null;
  return { kind: 'ready', status };
}

/** Switching off an isolated session asks what becomes of its branch when it has work on it (or when that is not known yet). */
export const asksBeforeSwitchingOff = (session: SessionInfo) => !!session.worktree && (!session.worktree.status || hasNews(session.worktree.status));

/** Where a session's folder is for the user: the main checkout's folder for an isolated one, not its worktree. */
export const shownFolder = (session: SessionInfo) => session.worktree?.home ?? session.cwd;

/** How a session on a branch of the cleaning panel is doing: at work, waiting at its desk, resting, or switched off (none). */
export type RowSession = 'working' | 'ready' | 'resting' | 'off';

export interface BranchLine {
  row: BranchRow;
  session: SessionInfo | null;
  state: RowSession;
  /** who it is for: the session's name, or the one Open Space noted */
  name: string | null;
  /** a session at work, or a program still using the worktree (Claude Code in a terminal), keeps it: it cannot be checked */
  locked: boolean;
}

/** The rows of the cleaning panel, with the session on each (by its worktree, or the conversation noted on the branch). */
export function branchLines(rows: readonly BranchRow[], sessions: readonly SessionInfo[]): BranchLine[] {
  return rows.map((row) => {
    const session = sessions.find((candidate) => {
      const worktree = candidate.worktree;
      if (worktree) return (row.folder !== null && worktree.root === row.folder) || (!!row.branch && worktree.branch === row.branch);
      return false;
    }) ?? null;
    const state: RowSession = !session ? 'off' : isWorking(session) || session.state === 'perm' ? 'working' : session.resting ? 'resting' : 'ready';
    return { row, session, state, name: session?.name ?? row.name ?? null, locked: state === 'working' || !!row.inUse };
  }).sort((a, b) => b.row.at - a.row.at);
}

/** Checked when the panel opens: the merged branches no session is working on. */
export const checkedByDefault = (lines: readonly BranchLine[]) => new Set(lines.filter((line) => line.row.merged && !line.locked).map(keyOf));

export const keyOf = (line: BranchLine) => `${line.row.branch}\u0000${line.row.folder ?? ''}`;

/** What cleaning the checked lines would lose: commits not merged, files with changes not committed. */
export function loss(lines: readonly BranchLine[], checked: ReadonlySet<string>): { commits: number; files: number } {
  const chosen = lines.filter((line) => checked.has(keyOf(line)));
  return { commits: chosen.reduce((sum, line) => sum + line.row.ahead, 0), files: chosen.reduce((sum, line) => sum + line.row.dirty, 0) };
}
