// What the sessions leave pending, for the Status panel: what each agent said (set_pending), then what git says of its
// folder (files not committed, commits not pushed). Pure functions.
import type { GitPending, SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';

/** One line of the section: `since` is when the agent first said it, null for what git says (no age); `itemId`, the line the agent said (to set it aside). */
export interface PendingRow { session: SessionInfo; key: string; text: string; since: number | null; declared: boolean; itemId?: string }

function gitRows(session: SessionInfo, git: GitPending): PendingRow[] {
  const words = t.session.pending;
  const rows: PendingRow[] = [];
  const add = (kind: string, text: string) => rows.push({ session, key: `${session.id}:git:${kind}`, text, since: null, declared: false });
  if (git.dirty > 0) add('dirty', words.dirty(git.dirty));
  if (git.unpushed > 0) add('unpushed', git.noUpstream ? words.neverPushed : words.unpushed(git.unpushed));
  return rows;
}

const oldest = (session: SessionInfo) => session.pending?.[0]?.since ?? Number.POSITIVE_INFINITY;

/**
 * The lines of every open session, grouped by session: the one that has waited longest first (what it said, oldest
 * first), the sessions where only git has something to say after them. What git says of a folder comes once, under
 * the first of its sessions.
 */
export function pendingRows(sessions: readonly SessionInfo[]): PendingRow[] {
  const toldFolders = new Set<string>();
  return sessions
    .filter((session) => session.state !== 'closed' && (session.pending?.length || session.git))
    .sort((a, b) => oldest(a) - oldest(b) || a.name.localeCompare(b.name))
    .flatMap((session) => {
      const tellsGit = !!session.git && !toldFolders.has(session.cwd);
      if (tellsGit) toldFolders.add(session.cwd);
      return [
        ...[...(session.pending ?? [])].sort((a, b) => a.since - b.since).map((item) => ({ session, key: `${session.id}:${item.id}`, text: item.text, since: item.since, declared: true, itemId: item.id })),
        ...(tellsGit && session.git ? gitRows(session, session.git) : []),
      ];
    });
}
