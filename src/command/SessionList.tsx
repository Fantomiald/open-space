// The list of every session: who works, what waits for the user, who left something to finish, who is done, who rests
// (or the same by project, src/state/list-groups.ts). Each with its face (the crew member's look, as in the room), its
// state as a sign on the face, how long it has been so, and its tags (else its last words). A group folds away, and the
// whole list down to the faces (remembered in this browser). A project's + (on hover, or Alt+its digit, App.tsx) opens
// a new session in its folder, and to open that folder in the Finder (the Explorer on Windows).
// Two places: focus mode's list in place of the room (a click opens a session beside the open ones, or goes to it), and
// with `panel` the sessions' panel down the left of the rooms and focus mode (Preferences.sessionPanel): by project at
// first, a click opens a session or closes the one in use (toggleWindow), a row switches its session off on hover, and
// its foot reopens a switched-off conversation and sets how many windows open at most. There, a row says its branch
// (its worktree's, tinted) and its model, a card beside it under the pointer says where it runs, and a project's mark
// (ProjectIcon.tsx) opens the dialog that chooses it.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { focusComposer } from '../lib/focus-composer.ts';
import { TOOLTIP_DELAY_MS } from '../design/Tooltip.tsx';
import { t } from '../i18n/index.ts';
import { defaultFolder, folderName, formatAge, formatAgo, homeRelative } from '../lib/format.ts';
import { IS_WINDOWS, MODIFIER, OPTION } from '../lib/platform.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { sessionStatus } from '../room/cast.ts';
import { sessionModel, stateLabel } from '../state/labels.ts';
import { attentionKind, isWorking, type SeenSequences } from '../state/queue.ts';
import { LIST_GROUPINGS, listGroups, type Kept, type ListGrouping } from '../state/list-groups.ts';
import { usePendingLater } from '../state/pending-later.ts';
import { inProject, projectDigit, projectOf, projectsOf } from '../state/projects.ts';
import { sessionBranch, worktreePlace } from '../state/worktrees.ts';
import { useSessions } from '../state/sessions.ts';
import { panelFloats } from '../state/chrome.ts';
import type { Edge } from '../state/windows.ts';
import { pullChrome, useChromePlace } from './Chrome.tsx';
import { FreeHandles } from './FreeHandles.tsx';
import { useProjects } from '../state/useProjects.ts';
import { MAX_WINDOWS, type SessionInfo } from '../../shared/protocol.ts';
import { BranchMark } from './BranchCard.tsx';
import { BranchIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, FilterIcon, FolderOpenIcon, FoldListIcon, MachineIcon, ModelIcon, PlusIcon, PowerIcon, UnfoldListIcon, WorktreeIcon } from './Icons.tsx';
import { ProjectIconDialog, ProjectMark } from './ProjectIcon.tsx';
import { SwitchOff } from './SwitchOffDialog.tsx';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';
import { SessionFace } from './SessionFace.tsx';
import { TagChips } from './TagChips.tsx';


/** the docked panel only widens; folded down to the faces, floating, it only grows taller */
const DOCKED_EDGES: readonly Edge[] = ['e'];
const FOLDED_EDGES: readonly Edge[] = ['n', 's'];
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
    if (useSessions.getState().openIds.includes(id)) focusComposer(id);
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
  // in the panel, unfolded, the same card after a short rest of the pointer, saying where it runs
  const [peek, setPeek] = useState<Peeked | null>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const peekAt = (id: string) => (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!narrow && !panel) return;
    const box = event.currentTarget.getBoundingClientRect();
    // beside the list, or on its other side when the panel floats against the right of the screen
    const left = box.right + PEEK_ROOM > window.innerWidth;
    const at = { id, x: left ? box.left - 8 : box.right + 8, y: box.top + box.height / 2, left };
    window.clearTimeout(peekTimer.current);
    if (narrow) setPeek(at);
    else peekTimer.current = window.setTimeout(() => setPeek(at), TOOLTIP_DELAY_MS);
  };
  const unpeek = () => { window.clearTimeout(peekTimer.current); setPeek(null); };
  const peeked = peek ? sessions[peek.id] : undefined;
  const [iconOf, setIconOf] = useState<{ folder: string; name: string } | null>(null);

  const foldTitle = `${narrow ? words.unfold : words.fold}${panel ? ` (${MODIFIER}B)` : ''}`;
  // the panel moves and widens like a window (Chrome.tsx): docked, only its right side pulls; folded, it keeps its width
  const place = useChromePlace('panel', panel);
  const floating = useSessions((s) => panelFloats(s.chrome));
  const edges = !panel ? null : narrow ? (floating ? FOLDED_EDGES : null) : floating ? undefined : DOCKED_EDGES;

  return (
    <nav className="cp-list" aria-label={words.title} data-narrow={narrow} data-panel={panel || undefined} {...place}>
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
            <h2 className="cp-list__title" data-marked={(panel && !!group.folder) || undefined}>
              {panel && group.folder && <ProjectMarkButton folder={group.folder} label={titleOf(group)} onPick={setIconOf} />}
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
                      title={narrow || panel ? undefined : words.open} aria-label={narrow ? session.name : undefined}
                      onClick={() => { unpeek(); open(session.id); }}
                      onMouseEnter={peekAt(session.id)} onFocus={peekAt(session.id)} onMouseLeave={unpeek} onBlur={unpeek}
                    >
                      <SessionFace session={session} resting={session.resting === true || group.state === 'resting'} />
                      <span className="cp-list__text">
                        <span className="cp-list__line">
                          <span className="cp-list__name">{session.name}</span>
                          {panel && session.tags?.length ? <span className="cp-list__tags"><TagChips tags={session.tags} className="cp-list__tag" /></span> : null}
                          {!panel && session.worktree && <BranchMark branch={session.worktree.branch} />}
                          {session.subagents.length > 0 && <span className="cp-list__agents">+{session.subagents.length}</span>}
                          <span className="cp-list__time">{working ? formatAge(elapsed) : formatAgo(elapsed)}</span>
                        </span>
                        {/* in the panel, its branch and its model; elsewhere its tags say what it is about at a glance; without any, its last words */}
                        {panel && (sessionBranch(session) || sessionModel(session)) ? <PlaceLine session={session} /> : (
                          <span className="cp-list__line" title={session.lastMessage || undefined}>
                            {!panel && session.tags?.length ? <span className="cp-list__tags"><TagChips tags={session.tags} className="cp-list__tag" /></span>
                              : <span className="cp-list__last">{session.lastMessage || stateLabel(session, kind)}</span>}
                          </span>
                        )}
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
      {/* on the page itself, over everything: the panel is a layer of its own, under the header and the hints */}
      {peek && peeked && createPortal(<Peek session={peeked} seen={seen} now={now} at={peek} panel={panel} narrow={narrow} />, document.body)}
      {iconOf && <ProjectIconDialog folder={iconOf.folder} name={iconOf.name} onClose={() => setIconOf(null)} />}
      <button
        type="button" className="cp-button cp-list__new" data-variant={openIds.length ? undefined : 'primary'} aria-label={narrow ? words.new : undefined} title={narrow ? `${words.new} (N)` : undefined}
        onClick={() => openNewSession({})}
      >
        <PlusIcon /> <span className="cp-list__new-label">{words.new}</span> <kbd className="cp-kbd">N</kbd>
      </button>
      {panel && !narrow && <PanelFoot />}
      {switchedOff && <SwitchOff session={switchedOff} onClose={() => setSwitchingOff(null)} onDone={() => closeIfOpen(switchedOff.id)} />}
      {edges !== null && <FreeHandles edges={edges} onPull={(edge, event) => pullChrome('panel', edge, event)} />}
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

/** Where the card beside a row goes: its point on the screen, and whether it opens to the left of it. */
interface Peeked { id: string; x: number; y: number; left: boolean }
/** The room the card needs beside a row (its widest, and the gap). */
const PEEK_ROOM = 20 * 16;

/**
 * Who a row is, beside it (as the room says what a click does): name, tags, state; folded down to the faces, its last
 * words; in the panel, where it runs: its project, this computer, its branch and worktree, its model.
 */
function Peek({ session, seen, now, at, panel, narrow }: { session: SessionInfo; seen: SeenSequences; now: number; at: Peeked; panel: boolean; narrow: boolean }) {
  const working = isWorking(session);
  const elapsed = now - (working ? session.busySince ?? session.stateSince : session.stateSince);
  const machine = useSessions((s) => s.machine);
  const words = t.session.list;
  const branch = sessionBranch(session), place = worktreePlace(session), model = sessionModel(session), project = projectOf(session);
  return (
    <div className="cp-list__peek" role="tooltip" data-side={at.left ? 'left' : undefined} style={{ '--x': `${at.x}px`, '--y': `${at.y}px` } as CSSProperties}>
      <span className="cp-list__line">
        <span className="cp-list__name">{session.name}</span>
        <TagChips tags={session.tags} className="cp-list__tag" />
        {!panel && session.worktree && <BranchMark branch={session.worktree.branch} />}
        {session.subagents.length > 0 && <span className="cp-list__agents">+{session.subagents.length}</span>}
      </span>
      <span className="cp-list__peek-state" data-status={sessionStatus(session, seen) ?? 'idle'}>
        {stateLabel(session, attentionKind(session, seen))} · {working ? formatAge(elapsed) : formatAgo(elapsed)}
      </span>
      {panel && (
        <span className="cp-list__facts">
          <span className="cp-list__fact"><ProjectMark folder={project} /><span>{folderName(project)}</span></span>
          {machine && <span className="cp-list__fact"><MachineIcon /><span>{words.machine(machine)}</span></span>}
          {branch && <span className="cp-list__fact"><BranchIcon /><span>{branch.name}</span></span>}
          {branch && <span className="cp-list__fact"><WorktreeIcon /><span>{place ? homeRelative(place) : words.mainCheckout}</span></span>}
          {model && <span className="cp-list__fact"><ModelIcon /><span>{model}</span></span>}
        </span>
      )}
      {panel && !narrow && <span className="cp-list__peek-hint">{words.toggle}</span>}
      {(narrow || !panel) && session.lastMessage && <span className="cp-list__peek-last">{session.lastMessage.replace(/\*\*|`/g, '')}</span>}
    </div>
  );
}

/** A row's second line in the panel: its branch (its worktree's, tinted), then its model, each cut short when long. */
function PlaceLine({ session }: { session: SessionInfo }) {
  const words = t.session.list;
  const branch = sessionBranch(session), model = sessionModel(session);
  return (
    <span className="cp-list__line cp-list__chips">
      {branch && (
        <span className="cp-list__chip" data-worktree={branch.worktree || undefined} title={branch.worktree ? words.worktree(branch.name) : words.branch(branch.name)}>
          {branch.worktree ? <WorktreeIcon /> : <BranchIcon />}<span>{branch.name}</span>
        </span>
      )}
      {model && <span className="cp-list__chip" title={words.model(model)}><ModelIcon /><span>{model}</span></span>}
    </span>
  );
}

/** A project's mark left of its name in the panel: a click opens the dialog that chooses it. */
function ProjectMarkButton({ folder, label, onPick }: { folder: string; label: string; onPick: (project: { folder: string; name: string }) => void }) {
  const title = t.session.list.projectIcon(label);
  return (
    <button type="button" className="cp-list__mark" aria-label={title} title={title} onClick={() => onPick({ folder, name: label })}>
      <ProjectMark folder={folder} />
    </button>
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
