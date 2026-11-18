// Where every session is at, pinned to the bottom left corner of the screen in both views: who is at work and for how
// long, then what waits for the user (to answer, allow, read or check, the most urgent first, with how long it has
// waited), then the read sessions that left something to do (src/state/pending.ts), then the finished ones (read,
// nothing left or put off for later), and last, apart, the runs a trigger started, finished to read or at work
// (one asking the user something stays with the others, marked as one). A click opens the session; the title folds
// the panel down to its counts, a group's title folds that group away (both remembered in this browser).
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useMemo, useState } from 'react';
import { t } from '../i18n/index.ts';
import { formatAge } from '../lib/format.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useNow } from '../lib/useNow.ts';
import { roomSessions } from '../room/cast.ts';
import { backgroundLabel, pauseLabel, todoLabel } from '../state/labels.ts';
import { attentionQueue, isPaused, otherSessions } from '../state/queue.ts';
import { inProject } from '../state/projects.ts';
import { useSessions } from '../state/sessions.ts';
import { useProjects } from '../state/useProjects.ts';
import { pendingEntries, type PendingEntry } from '../state/pending.ts';
import { isPutOff, usePendingLater } from '../state/pending-later.ts';
import { AutomatonIcon, BranchIcon, ChevronDownIcon, ChevronUpIcon, CompactIcon, PauseIcon, PlusIcon } from './Icons.tsx';
import type { SessionInfo } from '../../shared/protocol.ts';
import { BranchMark } from './BranchCard.tsx';
import { Marquee } from './Marquee.tsx';
import { TagChips } from './TagChips.tsx';

const FOLDED_KEY = 'poste:status-folded';
const readFolded = () => { try { return localStorage.getItem(FOLDED_KEY) === 'true'; } catch { return false; } };
const writeFolded = (folded: boolean) => { try { localStorage.setItem(FOLDED_KEY, String(folded)); } catch { /* not kept: it folds for this visit only */ } };

type Group = 'waiting' | 'working' | 'finish' | 'ready' | 'automata';

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

/** What a row says first: the label (the name, or what to do for whom), then the session's tag and branch, and `marked`, a mark for a trigger's run. */
function RowName({ session, label, marked = false }: { session: SessionInfo; label: string; marked?: boolean }) {
  return (
    <>
      <span className="cp-status__name">{label}</span>
      <TagChips tags={session.tags} className="cp-status__tag" short />
      {session.worktree && <BranchMark branch={session.worktree.branch} />}
      {marked && session.trigger && <span className="cp-status__automaton" title={t.session.status.automata}><AutomatonIcon /></span>}
    </>
  );
}

/**
 * A read session that left something to do: its name, then one short line per thing the agent said, and what git says
 * of its folder; the age is the oldest line's. A click opens the session, where these lines can be seen to (PendingStrip).
 */
function PendingCard({ entry, now, current }: { entry: PendingEntry; now: number; current: boolean }) {
  const show = useSessions((s) => s.show);
  const { session, items, git } = entry;
  return (
    <li className="cp-status__pending" data-current={current}>
      <button type="button" className="cp-status__item" data-kind="pending" aria-current={current} onClick={() => show(session.id)}>
        <span className="cp-status__dot" aria-hidden="true" />
        <span className="cp-status__label"><RowName session={session} label={session.name} /></span>
        <span className="cp-status__time">{formatAge(now - (items[0]?.since ?? session.stateSince))}</span>
      </button>
      <ul className="cp-status__tasks">
        {[...items.map((item) => item.text), ...(git ? [git] : [])].map((line) => (
          <li key={line} className="cp-status__task"><span className="cp-status__task-text" title={line}>{line}</span></li>
        ))}
      </ul>
    </li>
  );
}

/** What a ready session still holds, in a few muted words: what git says of its folder, and the lines put off for later. */
function ReadyNote({ pending }: { pending: PendingEntry }) {
  const words = t.session.pending;
  const note = [pending.git, pending.items.length > 0 && words.putOff(pending.items.length)].filter((part) => typeof part === 'string').join(' · ');
  if (!note) return null;
  return <span className="cp-status__git" title={note}>{pending.git && <BranchIcon />}<span className="cp-status__git-text">{note}</span></span>;
}

export function StatusPanel() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const show = useSessions((s) => s.show);
  const openIds = useSessions((s) => s.openIds);
  const openNewSession = useSessions((s) => s.openNewSession);
  // pulled by its top right corner: wider, and taller for its list (a double click gives it back its own size)
  const [size, setSize] = useState(() => readPreference<{ width: number; height: number } | null>('statusSize', null));
  const resize = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const card = event.currentTarget.parentElement!;
    const body = card.querySelector<HTMLElement>('.cp-status__body');
    const start = { x: event.clientX, y: event.clientY, width: card.offsetWidth, height: body?.offsetHeight ?? 288 };
    let next = { width: start.width, height: start.height };
    const move = (moved: PointerEvent) => {
      next = {
        width: Math.round(Math.min(Math.max(start.width + moved.clientX - start.x, 240), window.innerWidth * 0.6)),
        height: Math.round(Math.min(Math.max(start.height - (moved.clientY - start.y), 120), window.innerHeight * 0.7)),
      };
      setSize(next);
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); writePreference('statusSize', next); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const [folded, setFolded] = useState(readFolded);
  const [foldedGroups, setFoldedGroups] = useState(() => readPreference<Group[]>('statusFolded', []));
  const later = usePendingLater((s) => s.later);
  const foldGroup = (group: Group) => {
    const next = foldedGroups.includes(group) ? foldedGroups.filter((other) => other !== group) : [...foldedGroups, group];
    writePreference('statusFolded', next);
    setFoldedGroups(next);
  };
  const groupProps = (group: Group, count: number) => ({ group, count, folded: foldedGroups.includes(group), onFold: () => foldGroup(group) });
  const { project } = useProjects();
  const shown = useMemo(() => Object.values(sessions).filter((session) => inProject(session, project)), [sessions, project]);
  const [waiting, toRead] = useMemo(() => {
    const all = attentionQueue(shown, seen);
    const done = ({ session, kind }: (typeof all)[number]) => !!session.trigger && kind === 'finished';
    return [all.filter((entry) => !done(entry)), all.filter(done)];
  }, [shown, seen]);
  const [working, atWork] = useMemo(() => {
    const all = otherSessions(shown, seen).working;
    return [all.filter((session) => !session.trigger), all.filter((session) => session.trigger)];
  }, [shown, seen]);
  const automata = toRead.length + atWork.length;
  // the office's idle ones (not the resting ones, in the break room), the most recently ready first
  const idle = useMemo(() => [...roomSessions(shown, seen, 'office')[2]].sort((a, b) => b.stateSince - a.stateSince), [shown, seen]);
  // a read session that left something to do (its own lines, or files git says are not committed or pushed) waits for
  // the user, under the rest, until put off for later
  const [toFinish, ready] = useMemo(() => {
    const entries = pendingEntries(idle);
    const finish = entries.filter((entry) => !isPutOff(later, entry.session));
    const finishing = new Set(finish.map((entry) => entry.session.id));
    const byId = new Map(entries.map((entry) => [entry.session.id, entry]));
    return [finish, idle.filter((session) => !finishing.has(session.id)).map((session) => ({ session, pending: byId.get(session.id) }))];
  }, [idle, later]);
  // the times go on by the second while someone works, by the minute otherwise
  const now = useNow(15_000);
  if (!waiting.length && !toFinish.length && !working.length && !ready.length && !automata) return null;
  const words = t.session.status;
  const waitingRow = ({ session, kind }: (typeof waiting)[number], marked: boolean) => (
    <li key={session.id}>
      <button type="button" className="cp-status__item" data-kind={kind} aria-current={openIds.includes(session.id)} onClick={() => show(session.id)}>
        <span className="cp-status__dot" aria-hidden="true" />
        <span className="cp-status__label"><RowName session={session} label={todoLabel(session, kind)} marked={marked} /></span>
        <span className="cp-status__time">{formatAge(now - session.stateSince)}</span>
      </button>
    </li>
  );
  const workingRow = (session: SessionInfo) => {
    const paused = isPaused(session);
    const notes = [
      paused && pauseLabel(session.pausedUntil!, new Date(now)),
      session.compacting && words.compacting[session.compacting],
      session.state === 'starting' && words.starting,
      session.subagents.length > 0 && words.subagents(session.subagents.length),
      session.background && backgroundLabel(session.background),
    ].filter((note) => typeof note === 'string');
    return (
    <li key={session.id}>
      <button type="button" className="cp-status__item" data-kind={paused ? 'paused' : session.compacting ? 'compacting' : 'working'} aria-current={openIds.includes(session.id)} onClick={() => show(session.id)}>
        {paused ? <span className="cp-status__paused" aria-hidden="true"><PauseIcon /></span>
          : session.compacting ? <span className="cp-status__compact" aria-hidden="true"><CompactIcon /></span>
          : <span className="cp-status__dot" aria-hidden="true" />}
        <span className="cp-status__label">
          <RowName session={session} label={session.name} />
          {notes.length > 0 && <Marquee className="cp-status__notes">{notes.join(' · ')}</Marquee>}
        </span>
        <span className="cp-status__time">{formatAge(now - (session.busySince ?? session.stateSince))}</span>
      </button>
    </li>
    );
  };
  const fold = () => { setFolded(!folded); writeFolded(!folded); };
  return (
    <section className="cp-status" aria-label={words.title} data-folded={folded} style={size ? ({ '--status-width': `${size.width}px`, '--status-height': `${size.height}px` } as CSSProperties) : undefined}>
      {!folded && <span className="cp-status__resize" aria-hidden="true" title={words.resize} onPointerDown={resize} onDoubleClick={() => { writePreference('statusSize', null); setSize(null); }} />}
      <button type="button" className="cp-status__head" aria-expanded={!folded} title={folded ? words.unfold : words.fold} onClick={fold}>
        <span className="cp-status__title">{words.title}</span>
        {working.length > 0 && <span className="cp-status__count" data-kind="working" title={words.working}>{working.length}</span>}
        {waiting.length > 0 && <span className="cp-status__count" data-kind="waiting" title={words.waiting}>{waiting.length}</span>}
        {toFinish.length > 0 && <span className="cp-status__count" data-kind="finish" title={words.finish}>{toFinish.length}</span>}
        {ready.length > 0 && <span className="cp-status__count" data-kind="ready" title={words.ready}>{ready.length}</span>}
        {automata > 0 && <span className="cp-status__count" data-kind="automata" title={words.automata}><AutomatonIcon />{automata}</span>}
        {folded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </button>
      {!folded && (
        <div className="cp-status__body">
          {working.length > 0 && (
            <StatusGroup {...groupProps('working', working.length)}>
                {working.map(workingRow)}
            </StatusGroup>
          )}
          {waiting.length > 0 && (
            <StatusGroup {...groupProps('waiting', waiting.length)}>
                {waiting.map((entry) => waitingRow(entry, true))}
            </StatusGroup>
          )}
          {toFinish.length > 0 && (
            <StatusGroup {...groupProps('finish', toFinish.length)}>
                {toFinish.map((entry) => <PendingCard key={entry.session.id} entry={entry} now={now} current={openIds.includes(entry.session.id)} />)}
            </StatusGroup>
          )}
          {ready.length > 0 && (
            <StatusGroup {...groupProps('ready', ready.length)}>
                {ready.map(({ session, pending }) => (
                  <li key={session.id}>
                    <button type="button" className="cp-status__item" data-kind="ready" aria-current={openIds.includes(session.id)} onClick={() => show(session.id)}>
                      <span className="cp-status__dot" aria-hidden="true" />
                      <span className="cp-status__label">
                        <RowName session={session} label={session.name} />
                        {pending && <ReadyNote pending={pending} />}
                      </span>
                      <span className="cp-status__time">{formatAge(now - session.stateSince)}</span>
                    </button>
                  </li>
                ))}
            </StatusGroup>
          )}
          {automata > 0 && (
            <StatusGroup {...groupProps('automata', automata)}>
                {toRead.map((entry) => waitingRow(entry, false))}
                {atWork.map(workingRow)}
            </StatusGroup>
          )}
        </div>
      )}
      {/* once a window is open the launcher steps aside: a new session starts from here (or N) */}
      {!folded && openIds.length > 0 && (
        <button type="button" className="cp-button cp-status__new" onClick={() => openNewSession({})}>
          <PlusIcon /> {t.session.list.new} <kbd className="cp-kbd">N</kbd>
        </button>
      )}
    </section>
  );
}
