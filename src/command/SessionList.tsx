// Focus mode's list of every session, in place of the room: what waits for the user, who works, who is ready for a
// message, who rests. Each with its face (the crew member's look, as in the room), its state as a sign on the face, its
// tag, its last words and how long it has been so. A click opens it beside the open ones (or goes to it when open); a
// group folds away, and the whole list down to the faces (remembered in this browser).
import { useMemo, useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { t } from '../i18n/index.ts';
import { formatDuration } from '../lib/format.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { roomSessions, sessionStatus, type Status } from '../room/cast.ts';
import { chibiHead, lookOfStranger } from '../room/chibi.ts';
import { stateLabel } from '../state/labels.ts';
import { attentionKind, isWorking } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronDownIcon, FoldListIcon, PlusIcon, UnfoldListIcon } from './Icons.tsx';

/** The sign on a face, the same as over a head in the room; none for a session that is ready or resting. */
const SIGNS: Readonly<Record<Exclude<Status, null>, string>> = { permission: '!', question: '?', finished: '✓', error: '×', working: '…' };

export function SessionList() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const crew = useSessions((s) => s.crew);
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
    const readyLatestFirst = [...ready].sort((a, b) => b.stateSince - a.stateSince);
    return ([['waiting', waiting], ['working', working], ['ready', readyLatestFirst], ['resting', resting]] as const).filter(([, list]) => list.length > 0);
  }, [sessions, seen]);
  // the times go on by the second while someone works, by the minute otherwise
  const now = useNow(groups.some(([group]) => group === 'working') ? 1000 : 30_000);
  // a session named like a crew member wears that member's look, as in the room
  const faceOf = (session: SessionInfo) => {
    const member = crew.find((candidate) => !candidate.self && candidate.name === session.name);
    return chibiHead(member ? member.look ?? DEFAULT_LOOK : lookOfStranger(session.id));
  };
  const words = t.session.list;

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
                const since = formatDuration(now - (working ? session.busySince ?? session.stateSince : session.stateSince));
                return (
                  <li key={session.id}>
                    <button
                      type="button" className="cp-list__item" data-status={status ?? 'idle'} data-active={session.id === selectedId} aria-current={openIds.includes(session.id)}
                      title={narrow ? session.name : words.open} aria-label={narrow ? session.name : undefined}
                      onClick={() => show(session.id)}
                    >
                      <span className="cp-list__face">
                        <img src={faceOf(session)} alt="" width={36} height={36} />
                        {status && <span className="cp-list__sign" aria-hidden="true">{SIGNS[status]}</span>}
                      </span>
                      <span className="cp-list__text">
                        <span className="cp-list__line">
                          <span className="cp-list__name">{session.name}</span>
                          {session.tag && <span className="cp-tag cp-list__tag">{session.tag}</span>}
                          {session.subagents.length > 0 && <span className="cp-list__agents">+{session.subagents.length}</span>}
                        </span>
                        <span className="cp-list__line">
                          <span className="cp-list__last">{session.lastMessage || stateLabel(session, kind)}</span>
                          <span className="cp-list__time">{working ? since : words.ago(since)}</span>
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
      <button
        type="button" className="cp-button cp-list__new" data-variant={openIds.length ? undefined : 'primary'} aria-label={narrow ? words.new : undefined} title={narrow ? `${words.new} (N)` : undefined}
        onClick={() => openNewSession({})}
      >
        <PlusIcon /> <span className="cp-list__new-label">{words.new}</span> <kbd className="cp-kbd">N</kbd>
      </button>
    </nav>
  );
}
