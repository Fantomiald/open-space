// Where every session is at, pinned to the bottom left corner of the screen in both views: what waits for the user
// (to answer, allow, read or check, the most urgent first, with how long it has waited), then who is at work and for
// how long, then who is ready for a message (read, not stopped). A click opens the session; the title folds the panel
// down to its counts, a group's title folds that group away (both remembered in this browser).
import { type ReactNode, useMemo, useState } from 'react';
import { t } from '../i18n/index.ts';
import { formatAge } from '../lib/format.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { roomSessions } from '../room/cast.ts';
import { todoLabel } from '../state/labels.ts';
import { attentionQueue, otherSessions } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronDownIcon, ChevronUpIcon, CompactIcon } from './Icons.tsx';
import { BranchMark } from './BranchCard.tsx';

const FOLDED_KEY = 'poste:status-folded';
const readFolded = () => { try { return localStorage.getItem(FOLDED_KEY) === 'true'; } catch { return false; } };
const writeFolded = (folded: boolean) => { try { localStorage.setItem(FOLDED_KEY, String(folded)); } catch { /* not kept: it folds for this visit only */ } };

type Group = 'waiting' | 'working' | 'ready';

function StatusGroup({ group, count, folded, onFold, children }: { group: Group; count: number; folded: boolean; onFold: () => void; children: ReactNode }) {
  const words = t.session.status;
  return (
    <div className="cp-status__group">
      <h2 className="cp-status__group-title">
        <button type="button" aria-expanded={!folded} aria-controls={`status-${group}`} title={t.session.list.collapse(words[group])} onClick={onFold}>
          <ChevronDownIcon /> {words[group]}{folded && <span className="cp-status__note">{count}</span>}
        </button>
      </h2>
      <ul className="cp-status__list" id={`status-${group}`} hidden={folded}>{children}</ul>
    </div>
  );
}

export function StatusPanel() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const show = useSessions((s) => s.show);
  const openIds = useSessions((s) => s.openIds);
  const [folded, setFolded] = useState(readFolded);
  const [foldedGroups, setFoldedGroups] = useState(() => readPreference<Group[]>('statusFolded', []));
  const foldGroup = (group: Group) => {
    const next = foldedGroups.includes(group) ? foldedGroups.filter((other) => other !== group) : [...foldedGroups, group];
    writePreference('statusFolded', next);
    setFoldedGroups(next);
  };
  const groupProps = (group: Group, count: number) => ({ group, count, folded: foldedGroups.includes(group), onFold: () => foldGroup(group) });
  const waiting = useMemo(() => attentionQueue(Object.values(sessions), seen), [sessions, seen]);
  const working = useMemo(() => otherSessions(Object.values(sessions), seen).working, [sessions, seen]);
  // the office's idle ones (not the resting ones, in the break room), the most recently ready first
  const ready = useMemo(() => [...roomSessions(Object.values(sessions), seen, 'office')[2]].sort((a, b) => b.stateSince - a.stateSince), [sessions, seen]);
  // the times go on by the second while someone works, by the minute otherwise
  const now = useNow(15_000);
  if (!waiting.length && !working.length && !ready.length) return null;
  const words = t.session.status;
  const fold = () => { setFolded(!folded); writeFolded(!folded); };
  return (
    <section className="cp-status" aria-label={words.title} data-folded={folded}>
      <button type="button" className="cp-status__head" aria-expanded={!folded} title={folded ? words.unfold : words.fold} onClick={fold}>
        <span className="cp-status__title">{words.title}</span>
        {waiting.length > 0 && <span className="cp-status__count" data-kind="waiting" title={words.waiting}>{waiting.length}</span>}
        {working.length > 0 && <span className="cp-status__count" data-kind="working" title={words.working}>{working.length}</span>}
        {ready.length > 0 && <span className="cp-status__count" data-kind="ready" title={words.ready}>{ready.length}</span>}
        {folded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </button>
      {!folded && (
        <div className="cp-status__body">
          {waiting.length > 0 && (
            <StatusGroup {...groupProps('waiting', waiting.length)}>
                {waiting.map(({ session, kind }) => (
                  <li key={session.id}>
                    <button type="button" className="cp-status__item" data-kind={kind} aria-current={openIds.includes(session.id)} onClick={() => show(session.id)}>
                      <span className="cp-status__dot" aria-hidden="true" />
                      <span className="cp-status__label">{todoLabel(session, kind)}{session.worktree && <BranchMark branch={session.worktree.branch} />}</span>
                      <span className="cp-status__time">{formatAge(now - session.stateSince)}</span>
                    </button>
                  </li>
                ))}
            </StatusGroup>
          )}
          {working.length > 0 && (
            <StatusGroup {...groupProps('working', working.length)}>
                {working.map((session) => (
                  <li key={session.id}>
                    <button type="button" className="cp-status__item" data-kind={session.compacting ? 'compacting' : 'working'} aria-current={openIds.includes(session.id)} onClick={() => show(session.id)}>
                      {session.compacting ? <span className="cp-status__compact" aria-hidden="true"><CompactIcon /></span> : <span className="cp-status__dot" aria-hidden="true" />}
                      <span className="cp-status__label">
                        {session.name}
                        {session.worktree && <BranchMark branch={session.worktree.branch} />}
                        {session.compacting && <span className="cp-status__note">{words.compacting[session.compacting]}</span>}
                        {session.state === 'starting' && <span className="cp-status__note">{words.starting}</span>}
                        {session.subagents.length > 0 && <span className="cp-status__note">{words.subagents(session.subagents.length)}</span>}
                        {session.background && <span className="cp-status__note">{words.background(session.background.length)}</span>}
                      </span>
                      <span className="cp-status__time">{formatAge(now - (session.busySince ?? session.stateSince))}</span>
                    </button>
                  </li>
                ))}
            </StatusGroup>
          )}
          {ready.length > 0 && (
            <StatusGroup {...groupProps('ready', ready.length)}>
                {ready.map((session) => (
                  <li key={session.id}>
                    <button type="button" className="cp-status__item" data-kind="ready" aria-current={openIds.includes(session.id)} onClick={() => show(session.id)}>
                      <span className="cp-status__dot" aria-hidden="true" />
                      <span className="cp-status__label">{session.name}{session.worktree && <BranchMark branch={session.worktree.branch} />}</span>
                      <span className="cp-status__time">{formatAge(now - session.stateSince)}</span>
                    </button>
                  </li>
                ))}
            </StatusGroup>
          )}
        </div>
      )}
    </section>
  );
}
