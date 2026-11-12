// Focus mode's list of every session, in place of the room: what waits for the user, who works, who is ready for a
// message, who rests (or the same by project, src/state/list-groups.ts). Each with its face (the crew member's
// look, as in the room), its state as a sign on the face, how long it has been so, and its tags (else its last words). A click opens it beside the open ones (or goes to it when open); a
// group folds away, and the whole list down to the faces (remembered in this browser). A project's + (on hover, or
// Alt+its digit, App.tsx) opens a new session in its folder.
import { useCallback, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { t } from '../i18n/index.ts';
import { formatAge, formatAgo } from '../lib/format.ts';
import { OPTION } from '../lib/platform.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { sessionStatus } from '../room/cast.ts';
import { stateLabel } from '../state/labels.ts';
import { attentionKind, isWorking, type SeenSequences } from '../state/queue.ts';
import { LIST_GROUPINGS, listGroups, type Kept, type ListGrouping } from '../state/list-groups.ts';
import { inProject, projectDigit, projectsOf } from '../state/projects.ts';
import { useSessions } from '../state/sessions.ts';
import { useProjects } from '../state/useProjects.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { BranchMark } from './BranchCard.tsx';
import { CheckIcon, ChevronDownIcon, FilterIcon, FoldListIcon, PlusIcon, UnfoldListIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';
import { SessionFace } from './SessionFace.tsx';
import { TagChips } from './TagChips.tsx';

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
  const { project } = useProjects();
  const [grouping, setGrouping] = useState<ListGrouping>(() => {
    const stored = readPreference<string>('listGrouping', 'state');
    return LIST_GROUPINGS.find((each) => each === stored) ?? 'state';
  });
  const groupBy = (next: ListGrouping) => { writePreference('listGrouping', next); setGrouping(next); };
  // the one opened from the waiting group stays there while it is the one in front
  const [kept, setKept] = useState<Kept | null>(null);
  const keptNow = kept?.id === selectedId ? kept : null;
  const groups = useMemo(
    () => listGroups(Object.values(sessions).filter((session) => inProject(session, project)), seen, grouping, keptNow),
    [sessions, seen, project, grouping, keptNow],
  );
  // the digits of Alt+1…9 follow the header's projects (by name), not the list's order, which moves with who waits
  const projects = useMemo(() => projectsOf(Object.values(sessions), seen), [sessions, seen]);
  const open = (id: string) => {
    const waiting = groups.find((group) => group.state === 'waiting')?.sessions ?? [];
    const index = waiting.findIndex((session) => session.id === id);
    setKept(index >= 0 ? { id, index } : null);
    show(id);
  };
  const titleOf = (group: (typeof groups)[number]) => (group.state ? words.groups[group.state] : (group.label ?? ''));
  const hintOf = (group: (typeof groups)[number]) => {
    const hint = group.state ? words.hints[group.state] : '';
    return folded.includes(group.key) && hint ? `${hint}, ${group.sessions.length}` : hint || group.sessions.length;
  };
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
        <GroupingMenu grouping={grouping} onPick={groupBy} />
        <button type="button" className="cp-icon-button" aria-expanded={!narrow} aria-label={narrow ? words.unfold : words.fold} title={narrow ? words.unfold : words.fold} onClick={toggleNarrow}>
          {narrow ? <UnfoldListIcon /> : <FoldListIcon />}
        </button>
      </div>
      <div className="cp-list__body">
        {groups.map((group) => (
          <section key={group.key} className="cp-list__group" data-group={group.state ?? 'project'}>
            <h2 className="cp-list__title">
              <button type="button" aria-expanded={!folded.includes(group.key)} aria-controls={`list-${group.key}`} title={words.collapse(titleOf(group))} onClick={() => fold(group.key)}>
                <ChevronDownIcon /> <span>{titleOf(group)}</span>
                <span className="cp-list__hint">{hintOf(group)}</span>
                {!group.state && group.waiting > 0 && <span className="cp-list__waiting" title={words.waitingCount(group.waiting)}>{group.waiting}</span>}
              </button>
              {group.folder && <NewInProject folder={group.folder} label={titleOf(group)} digit={projectDigit(projects, group.folder)} onOpen={openNewSession} />}
            </h2>
            <ul className="cp-list__items" id={`list-${group.key}`} hidden={folded.includes(group.key)}>
              {group.sessions.map((session) => {
                const status = sessionStatus(session, seen);
                const kind = attentionKind(session, seen);
                const working = isWorking(session);
                const elapsed = now - (working ? session.busySince ?? session.stateSince : session.stateSince);
                return (
                  <li key={session.id}>
                    <button
                      type="button" className="cp-list__item" data-status={status ?? 'idle'} data-active={session.id === selectedId} aria-current={openIds.includes(session.id)}
                      title={narrow ? undefined : words.open} aria-label={narrow ? session.name : undefined}
                      onClick={() => open(session.id)}
                      onMouseEnter={peekAt(session.id)} onFocus={peekAt(session.id)} onMouseLeave={() => setPeek(null)} onBlur={() => setPeek(null)}
                    >
                      <SessionFace session={session} resting={session.resting === true || group.state === 'resting'} />
                      <span className="cp-list__text">
                        <span className="cp-list__line">
                          <span className="cp-list__name">{session.name}</span>
                          {session.worktree && <BranchMark branch={session.worktree.branch} />}
                          {session.subagents.length > 0 && <span className="cp-list__agents">+{session.subagents.length}</span>}
                          <span className="cp-list__time">{working ? formatAge(elapsed) : formatAgo(elapsed)}</span>
                        </span>
                        {/* its tags say what it is about at a glance; without any, its last words */}
                        <span className="cp-list__line" title={session.lastMessage || undefined}>
                          {session.tags?.length ? <span className="cp-list__tags"><TagChips tags={session.tags} className="cp-list__tag" /></span>
                            : <span className="cp-list__last">{session.lastMessage || stateLabel(session, kind)}</span>}
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

/** A project's +, shown when its title is under the pointer (or focused): a new session in its folder, with its shortcut. */
function NewInProject({ folder, label, digit, onOpen }: { folder: string; label: string; digit: number | null; onOpen: (draft: { folder: string }) => void }) {
  const words = t.session.list;
  const keys = digit ? `${OPTION}+${digit}` : '';
  return (
    <button type="button" className="cp-list__add" aria-label={words.newIn(label)} title={keys ? `${words.newIn(label)} (${keys})` : words.newIn(label)} onClick={() => onOpen({ folder })}>
      {keys && <kbd className="cp-kbd">{keys}</kbd>}<PlusIcon />
    </button>
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
        <TagChips tags={session.tags} className="cp-list__tag" />
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

/** How the list is grouped, behind a filter button: by state or by project. */
function GroupingMenu({ grouping, onPick }: { grouping: ListGrouping; onPick: (grouping: ListGrouping) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  useMenuBelow(open, box, menu);
  const words = t.session.list;
  return (
    <div className="cp-list__grouping" ref={box}>
      <button
        type="button" className="cp-icon-button" data-pressed={grouping !== 'state' || undefined} aria-expanded={open} aria-haspopup="menu"
        aria-label={words.groupBy} title={`${words.groupBy} : ${words.groupings[grouping]}`} onClick={() => setOpen(!open)}
      ><FilterIcon /></button>
      {open && (
        <div ref={menu} className="cp-detail__menu" popover="manual" role="menu" aria-label={words.groupBy}>
          {LIST_GROUPINGS.map((each) => (
            <button key={each} type="button" role="menuitemradio" aria-checked={grouping === each} onClick={() => { onPick(each); close(); }}>
              <span className="cp-list__check">{grouping === each && <CheckIcon />}</span>{words.groupByTitle(words.groupings[each])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
