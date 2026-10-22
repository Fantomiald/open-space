// Focus mode's list of every session, in place of the room: what waits for the user, who works, who is ready for a
// message, who rests. Each with its face (the crew member's look, as in the room), its state as a sign on the face, its
// tag, its last words and how long it has been so. A click opens it beside the open ones (or goes to it when open); a
// group folds away, and the whole list down to the faces (remembered in this browser).
import { useMemo, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { t } from '../i18n/index.ts';
import { formatAge, formatAgo } from '../lib/format.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { roomSessions, sessionStatus } from '../room/cast.ts';
import { stateLabel } from '../state/labels.ts';
import { attentionKind, isWorking, type SeenSequences } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { BranchMark } from './BranchCard.tsx';
import { ChevronDownIcon, FoldListIcon, PlusIcon, UnfoldListIcon } from './Icons.tsx';
import { SessionFace } from './SessionFace.tsx';

export function SessionList() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const openIds = useSessions((s) => s.openIds);
  const selectedId = useSessions((s) => s.selectedId);
  const show = useSessions((s) => s.show);
  const openNewSession = useSessions((s) => s.openNewSession);
  const [folded, setFolded] = useState(() => readPreference<string[]>('listFolded', []));
  const fold = (group: string) => {
    const next = folded.includes(group) ? folded.filter((other) => other !== group) : [...folded, group];
    writePreference('listFolded', next);
    setFolded(next);
  };
  const [narrow, setNarrow] = useState(() => readPreference('listNarrow', false));
  const toggleNarrow = () => {
    writePreference('listNarrow', !narrow);
    setNarrow(!narrow);
  };
  const groups = useMemo(() => {
    const all = Object.values(sessions);
    const [waiting, working, ready] = roomSessions(all, seen, 'office');
    const [resting] = roomSessions(all, seen, 'lounge');
    const latestFirst = (list: SessionInfo[]) => [...list].sort((a, b) => b.stateSince - a.stateSince);
    return ([['waiting', waiting], ['working', working], ['ready', latestFirst(ready)], ['resting', latestFirst(resting)]] as const).filter(([, list]) => list.length > 0);
  }, [sessions, seen]);
  // the times go on by the second while someone works, by the minute otherwise
  const now = useNow(15_000);
  const words = t.session.list;
  // folded down to the faces: the one under the pointer (or focused) says who it is beside the list
  const [peek, setPeek] = useState<{ id: string; x: number; y: number } | null>(null);
  const peekAt = (id: string) => (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!narrow) return;
    const box = event.currentTarget.getBoundingClientRect();
    setPeek({ id, x: box.right + 8, y: box.top + box.height / 2 });
  };
  const peeked = narrow && peek ? sessions[peek.id] : undefined;

  return (
    <nav className="cp-list" aria-label={words.title} data-narrow={narrow}>
      <div className="cp-list__head">
        <h2 className="cp-list__heading">{words.title}</h2>
        <button type="button" className="cp-icon-button" aria-expanded={!narrow} aria-label={narrow ? words.unfold : words.fold} title={narrow ? words.unfold : words.fold} onClick={toggleNarrow}>
          {narrow ? <UnfoldListIcon /> : <FoldListIcon />}
        </button>
      </div>
      <div className="cp-list__body">
        {groups.map(([group, list]) => (
          <section key={group} className="cp-list__group" data-group={group}>
            <h2 className="cp-list__title">
              <button type="button" aria-expanded={!folded.includes(group)} aria-controls={`list-${group}`} title={words.collapse(words.groups[group])} onClick={() => fold(group)}>
                <ChevronDownIcon /> <span>{words.groups[group]}</span>
                <span className="cp-list__hint">{folded.includes(group) && words.hints[group] ? `${words.hints[group]}, ${list.length}` : words.hints[group] || list.length}</span>
              </button>
            </h2>
            <ul className="cp-list__items" id={`list-${group}`} hidden={folded.includes(group)}>
              {list.map((session) => {
                const status = sessionStatus(session, seen);
                const kind = attentionKind(session, seen);
                const working = isWorking(session);
                const elapsed = now - (working ? session.busySince ?? session.stateSince : session.stateSince);
                return (
                  <li key={session.id}>
                    <button
                      type="button" className="cp-list__item" data-status={status ?? 'idle'} data-active={session.id === selectedId} aria-current={openIds.includes(session.id)}
                      title={narrow ? undefined : words.open} aria-label={narrow ? session.name : undefined}
                      onClick={() => show(session.id)}
                      onMouseEnter={peekAt(session.id)} onFocus={peekAt(session.id)} onMouseLeave={() => setPeek(null)} onBlur={() => setPeek(null)}
                    >
                      <SessionFace session={session} resting={group === 'resting'} />
                      <span className="cp-list__text">
                        <span className="cp-list__line">
                          <span className="cp-list__name">{session.name}</span>
                          {session.tag && <span className="cp-tag cp-list__tag">{session.tag}</span>}
                          {session.worktree && <BranchMark branch={session.worktree.branch} />}
                          {session.subagents.length > 0 && <span className="cp-list__agents">+{session.subagents.length}</span>}
                        </span>
                        <span className="cp-list__line">
                          <span className="cp-list__last">{session.lastMessage || stateLabel(session, kind)}</span>
                          <span className="cp-list__time">{working ? formatAge(elapsed) : formatAgo(elapsed)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && !narrow && <p className="cp-list__empty">{words.empty}</p>}
      </div>
      {peek && peeked && <Peek session={peeked} seen={seen} now={now} x={peek.x} y={peek.y} />}
      <button
        type="button" className="cp-button cp-list__new" data-variant={openIds.length ? undefined : 'primary'} aria-label={narrow ? words.new : undefined} title={narrow ? `${words.new} (N)` : undefined}
        onClick={() => openNewSession({})}
      >
        <PlusIcon /> <span className="cp-list__new-label">{words.new}</span> <kbd className="cp-kbd">N</kbd>
      </button>
    </nav>
  );
}

/** Who a face of the folded list is: name, tag, state and last words, beside it (as the room says what a click does). */
function Peek({ session, seen, now, x, y }: { session: SessionInfo; seen: SeenSequences; now: number; x: number; y: number }) {
  const working = isWorking(session);
  const elapsed = now - (working ? session.busySince ?? session.stateSince : session.stateSince);
  return (
    <div className="cp-list__peek" role="tooltip" style={{ '--x': `${x}px`, '--y': `${y}px` } as CSSProperties}>
      <span className="cp-list__line">
        <span className="cp-list__name">{session.name}</span>
        {session.tag && <span className="cp-tag cp-list__tag">{session.tag}</span>}
                          {session.worktree && <BranchMark branch={session.worktree.branch} />}
        {session.subagents.length > 0 && <span className="cp-list__agents">+{session.subagents.length}</span>}
      </span>
      <span className="cp-list__peek-state" data-status={sessionStatus(session, seen) ?? 'idle'}>
        {stateLabel(session, attentionKind(session, seen))} · {working ? formatAge(elapsed) : formatAgo(elapsed)}
      </span>
      {session.lastMessage && <span className="cp-list__peek-last">{session.lastMessage.replace(/\*\*|`/g, '')}</span>}
    </div>
  );
}
