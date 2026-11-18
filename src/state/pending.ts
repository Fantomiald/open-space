// What the sessions leave pending, for the Status panel: what each agent said (set_pending), then what git says of its
// folder (files not committed, commits not pushed). Pure functions.
import type { GitPending, PendingItem, SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';

/** A session with something pending: what it said, oldest first, and `git`, what git says of its folder in a few words. */
export interface PendingEntry { session: SessionInfo; items: PendingItem[]; git: string | null }

export function gitSummary(git: GitPending): string | null {
  const words = t.session.pending;
  const parts = [
    ...(git.dirty > 0 ? [words.dirty(git.dirty)] : []),
    ...(git.unpushed > 0 ? [git.noUpstream ? words.neverPushed : words.unpushed(git.unpushed)] : []),
  ];
  return parts.length ? parts.join(' · ') : null;
}

const oldest = (session: SessionInfo) => session.pending?.[0]?.since ?? Number.POSITIVE_INFINITY;

/**
 * Every open session with something pending: the one that has waited longest first, the sessions where only git has
 * something to say after them. What git says of a folder comes once, with the first of its sessions.
 */
export function pendingEntries(sessions: readonly SessionInfo[]): PendingEntry[] {
  const toldFolders = new Set<string>();
  return sessions
    .filter((session) => session.state !== 'closed' && (session.pending?.length || session.git))
    .sort((a, b) => oldest(a) - oldest(b) || a.name.localeCompare(b.name))
    .map((session) => {
      const tellsGit = !!session.git && !toldFolders.has(session.cwd);
      if (tellsGit) toldFolders.add(session.cwd);
      const items = [...(session.pending ?? [])].sort((a, b) => a.since - b.since);
      return { session, items, git: tellsGit && session.git ? gitSummary(session.git) : null };
    })
    .filter((entry) => entry.items.length || entry.git);
}
