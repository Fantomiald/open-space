// The list of every session: who works, what waits for the user, who left something to finish, who is done, who rests
// (or the same by project, src/state/list-groups.ts). Each with its face (the crew member's look, as in the room), its
// state as a sign on the face, how long it has been so, and its tags (else its last words). A group folds away, and the
// whole list down to the faces (remembered in this browser). A project's + (on hover, or Alt+its digit, App.tsx) opens
// a new session in its folder, and to open that folder in the Finder (the Explorer on Windows).
// Two places: focus mode's list in place of the room (a click opens a session beside the open ones, or goes to it), and
// with `panel` the sessions' panel down the left of the rooms and focus mode (Preferences.sessionPanel): by project at
// first, a click opens a session or closes the one in use (toggleWindow), a row switches its session off on hover, and
// its foot reopens a switched-off conversation and sets how many windows open at most.
import { useCallback, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { t } from '../i18n/index.ts';
import { defaultFolder, formatAge, formatAgo } from '../lib/format.ts';
import { IS_WINDOWS, MODIFIER, OPTION } from '../lib/platform.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { sessionStatus } from '../room/cast.ts';
import { stateLabel } from '../state/labels.ts';
import { attentionKind, isWorking, type SeenSequences } from '../state/queue.ts';
import { LIST_GROUPINGS, listGroups, type Kept, type ListGrouping } from '../state/list-groups.ts';
import { usePendingLater } from '../state/pending-later.ts';
import { inProject, projectDigit, projectsOf } from '../state/projects.ts';
import { useSessions } from '../state/sessions.ts';
import { useProjects } from '../state/useProjects.ts';
import { MAX_WINDOWS, type SessionInfo } from '../../shared/protocol.ts';
import { BranchMark } from './BranchCard.tsx';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, FilterIcon, FolderOpenIcon, FoldListIcon, PlusIcon, PowerIcon, UnfoldListIcon } from './Icons.tsx';
import { SwitchOff } from './SwitchOffDialog.tsx';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';
import { SessionFace } from './SessionFace.tsx';
import { TagChips } from './TagChips.tsx';

export function SessionList({ panel = false }: { panel?: boolean }) {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const openIds = useSessions((s) => s.openIds);
  const selectedId = useSessions((s) => s.selectedId);
  const show = useSessions((s) => s.toggleWindow);
  const openNewSession = useSessions((s) => s.openNewSession);
  const [folded, setFolded] = useState(() => readPreference<string[]>('listFolded', []));
  const fold = (group: string) => {
    const next = folded.includes(group) ? folded.filter((other) => other !== group) : [...folded, group];
    writePreference('listFolded', next);
    setFolded(next);
  };
  const narrow = useSessions((s) => s.panelNarrow);
  const foldPanel = useSessions((s) => s.foldPanel);
  const toggleNarrow = () => foldPanel(!narrow);
  const { project } = useProjects();
  // the panel starts by project, focus mode's list by state; each keeps its own choice
  const groupingKey = panel ? 'panelGrouping' : 'listGrouping', firstGrouping: ListGrouping = panel ? 'project' : 'state';
  const [grouping, setGrouping] = useState<ListGrouping>(() => {
    const stored = readPreference<string>(groupingKey, firstGrouping);
    return LIST_GROUPINGS.find((each) => each === stored) ?? firstGrouping;
  });
  const groupBy = (next: ListGrouping) => { writePreference(groupingKey, next); setGrouping(next); };
  const [switchingOff, setSwitchingOff] = useState<string | null>(null);
  const switchedOff = switchingOff ? sessions[switchingOff] : undefined;
  // the one opened from the waiting group stays there while it is the one in front
  const [kept, setKept] = useState<Kept | null>(null);
  const keptNow = kept?.id === selectedId ? kept : null;
  const later = usePendingLater((s) => s.later);
  const groups = useMemo(
    () => listGroups(Object.values(sessions).filter((session) => inProject(session, project)), seen, grouping, keptNow, later),
    [sessions, seen, project, grouping, keptNow, later],
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

  const foldTitle = `${narrow ? words.unfold : words.fold}${panel ? ` (${MODIFIER}B)` : ''}`;

  return (
    <nav className="cp-list" aria-label={words.title} data-narrow={narrow} data-panel={panel || undefined}>
      <div className="cp-list__head">
        <h2 className="cp-list__heading">{words.title}</h2>
        <GroupingMenu grouping={grouping} onPick={groupBy} />
        <button type="button" className="cp-icon-button" aria-expanded={!narrow} aria-label={narrow ? words.unfold : words.fold} title={foldTitle} onClick={toggleNarrow}>
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
              {group.folder && (
                <span className="cp-list__actions">
                  <OpenProjectFolder folder={group.folder} label={titleOf(group)} />
                  <NewInProject folder={group.folder} label={titleOf(group)} digit={projectDigit(projects, group.folder)} onOpen={openNewSession} />
                </span>
              )}
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
                      title={narrow ? undefined : panel ? words.toggle : words.open} aria-label={narrow ? session.name : undefined}
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
                    {panel && !narrow && (
                      <button type="button" className="cp-list__off" aria-label={words.switchOff(session.name)} title={words.switchOff(session.name)} onClick={() => setSwitchingOff(session.id)}>
                        <PowerIcon />
                      </button>
                    )}
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
      {panel && !narrow && <PanelFoot />}
      {switchedOff && <SwitchOff session={switchedOff} onClose={() => setSwitchingOff(null)} onDone={() => closeIfOpen(switchedOff.id)} />}
    </nav>
  );
}

const closeIfOpen = (sessionId: string) => {
  const state = useSessions.getState();
  if (state.openIds.includes(sessionId)) state.closeOpen(sessionId);
};

/**
 * The panel's foot: the switched-off conversations of the project in sight (else the default folder), to take one up
 * again in the launcher (Reprendre), and how many sessions' windows open at most before one gives its place.
 */
function PanelFoot() {
  const words = t.session.list;
  const { project } = useProjects();
  const roots = useSessions((s) => s.roots);
  const fallback = useSessions((s) => s.preferences.defaultFolder);
  const setting = useSessions((s) => s.preferences.maxWindows ?? MAX_WINDOWS);
  const setPreferences = useSessions((s) => s.setPreferences);
  const openNewSession = useSessions((s) => s.openNewSession);
  const folder = defaultFolder(roots, project || fallback);
  return (
    <div className="cp-list__foot">
      <button type="button" className="cp-list__settled" title={words.switchedOffTitle} onClick={() => openNewSession({ resumeIn: folder })}>
        <span>{words.switchedOff}</span><ChevronRightIcon />
      </button>
      <div className="cp-list__windows">
        <span id="panel-windows">{words.windows}</span>
        <div className="cp-segmented" role="radiogroup" aria-labelledby="panel-windows">
          {Array.from({ length: MAX_WINDOWS }, (_, index) => index + 1).map((count) => (
            <button key={count} type="button" role="radio" aria-checked={count === setting} title={words.windowsTitle(count)} onClick={() => setPreferences({ maxWindows: count })}>{count}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A project's folder in the Finder: by the desktop app, which brings it to the front, else by the server (in a browser). */
const openFolder = (folder: string) => {
  if (window.openSpaceDesktop?.openFolder) void window.openSpaceDesktop.openFolder(folder);
  else useSessions.getState().send({ t: 'openFolder', path: folder });
};

/** A project's folder opened in the Finder (the Explorer on Windows, the file manager elsewhere), beside its +. */
function OpenProjectFolder({ folder, label }: { folder: string; label: string }) {
  const words = t.session.list;
  const title = IS_WINDOWS ? words.openFolderWindows(label) : words.openFolder(label);
  return (
    <button type="button" aria-label={title} title={title} onClick={() => openFolder(folder)}>
      <FolderOpenIcon />
    </button>
  );
}

/** A project's +, shown when its title is under the pointer (or focused): a new session in its folder, with its shortcut. */
function NewInProject({ folder, label, digit, onOpen }: { folder: string; label: string; digit: number | null; onOpen: (draft: { folder: string }) => void }) {
  const words = t.session.list;
  const keys = digit ? `${OPTION}+${digit}` : '';
  return (
    <button type="button" aria-label={words.newIn(label)} title={keys ? `${words.newIn(label)} (${keys})` : words.newIn(label)} onClick={() => onOpen({ folder })}>
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
