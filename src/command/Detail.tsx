import { memo, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { lanesOf } from '../../shared/browser.ts';
import { drivesBrowser } from '../state/browser.ts';
import { buildFeed, publishedPages } from '../state/feed.ts';
import { backgroundWork, isRunning } from '../state/labels.ts';
import { attentionKind } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { DropOverlay } from './Attachments.tsx';
import { AsidePanel } from './AsidePanel.tsx';
import { BrowserView } from './BrowserView.tsx';
import { ChangesView, LineCounts } from './Changes.tsx';
import { ContextChip, ContextView, McpView, UsageView } from './ClaudeViews.tsx';
import { Composer, RemoteButton } from './Composer.tsx';
import { INTERACTIVE, WindowDragContext } from './useWindowDrag.ts';
import { AgentBack, Feed } from './Feed.tsx';
import { BranchIcon, CloseIcon, DuplicateIcon, GlobeIcon, MaximizeIcon, MinimizeIcon, MoreIcon, PauseIcon, PencilIcon, PhoneIcon, PowerIcon, RestIcon, SearchIcon, TagIcon, TerminalIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { PermissionPrompt } from './PermissionPrompt.tsx';
import { PublishedPages } from './PublishedPages.tsx';
import { QuestionPrompt } from './QuestionPrompt.tsx';
import { StateBadge } from './StateBadge.tsx';
import { SwitchOffDialog } from './SwitchOffDialog.tsx';
import { asksBeforeSwitchingOff } from '../state/worktrees.ts';
import { useAttachments } from './useAttachments.ts';
import { useDismiss } from './useDismiss.ts';

const NO_EVENTS: never[] = [];

/** What a session's head keeps out of sight, so it has room for its name: search, Remote Control, rest, switch off. */
function SessionMenu({ session, searchOpen, onSearch, onBrowser, onRest, onSwitchOff }: { session: SessionInfo; searchOpen: boolean; onSearch: () => void; onBrowser: () => void; onRest: () => void; onSwitchOff: () => void }) {
  const send = useSessions((s) => s.send);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const words = t.session.detail;
  const pick = (action: () => void) => () => { action(); close(); };
  return (
    <div className="cp-detail__more" ref={box}>
      <button type="button" className="cp-icon-button" data-variant="outlined" aria-expanded={open} aria-haspopup="menu" aria-label={words.more} title={words.more} onClick={() => setOpen(!open)}><MoreIcon /></button>
      {open && (
        <div className="cp-detail__menu" role="menu" aria-label={words.more}>
          <button type="button" role="menuitem" onClick={pick(onSearch)}><SearchIcon />{searchOpen ? words.searchClose : words.search}<kbd className="cp-kbd">⌘F</kbd></button>
          {!session.remote && (
            <button type="button" role="menuitem" title={t.session.remote.off} onClick={pick(() => send({ t: 'remoteControl', sessionId: session.id, enabled: true }))}><PhoneIcon />{words.remote}</button>
          )}
          {session.resumable && (
            <button type="button" role="menuitem" title={words.duplicateTitle} onClick={pick(() => useSessions.getState().duplicateSession(session.id))}><DuplicateIcon />{words.duplicate}</button>
          )}
          <button type="button" role="menuitem" title={t.session.browser.openTitle} onClick={pick(onBrowser)}><GlobeIcon />{t.session.browser.open}</button>
          <button type="button" role="menuitem" title={words.terminalHereTitle} onClick={pick(() => useSessions.getState().openTerminal(session.id))}><TerminalIcon />{words.terminalHere}</button>
          {!session.resting && <button type="button" role="menuitem" title={words.restTitle} onClick={pick(onRest)}><RestIcon />{words.rest}</button>}
          <button type="button" role="menuitem" data-variant="danger" title={words.switchOffTitle} onClick={pick(onSwitchOff)}><PowerIcon />{words.switchOff}</button>
        </div>
      )}
    </div>
  );
}
const NO_DRAFTS: Readonly<Record<string, string>> = {};

/**
 * One open session over the room. Several can be open side by side (see Stack): the one the user is in
 * (`selectedId`) is `active`, and only it shows the search bar and the views other than the thread; one can be zoomed.
 */
/** Kept from being drawn again while a window is carried or resized: only its own session changes it. */
export const Detail = memo(function Detail({ sessionId }: { sessionId: string }) {
  const active = useSessions((s) => s.selectedId === sessionId);
  const session = useSessions((s) => s.sessions[sessionId]);
  const events = useSessions((s) => s.logs[sessionId]) ?? NO_EVENTS;
  const loaded = useSessions((s) => s.logLoaded[sessionId] === true);
  const drafts = useSessions((s) => s.partials[sessionId]) ?? NO_DRAFTS;
  const send = useSessions((s) => s.send);
  const focus = useSessions((s) => s.focus);
  const closeOpen = useSessions((s) => s.closeOpen);
  const several = useSessions((s) => s.openIds.length > 1);
  const zoomed = useSessions((s) => s.zoomedId === sessionId);
  const zoom = useSessions((s) => s.zoom);
  const toggleZoom = () => zoom(zoomed ? null : sessionId);
  // its title bar carries it elsewhere in the stack
  const carry = use(WindowDragContext);
  const searchOpen = useSessions((s) => s.searchOpen) && active;
  const openSearch = useSessions((s) => s.openSearch);
  const seen = useSessions((s) => s.seen);
  const feed = useMemo(() => buildFeed(events), [events]);
  const pages = useMemo(() => publishedPages(feed.items), [feed]);
  const browser = useSessions((s) => lanesOf(Object.keys(s.browsers), sessionId).length > 0);
  // its agent is at work in its browser: the chip says so, and the view shows who drives
  const running = !!session && isRunning(session);
  const driving = useMemo(() => running && drivesBrowser(feed.items), [feed, running]);
  const changes = useSessions((s) => s.changes[sessionId]);
  const live = useSessions((s) => s.connection === 'live');
  const panelView = useSessions((s) => (active ? s.panelView : 'thread'));
  const showPanel = useSessions((s) => s.showPanel);
  // what it changed, asked again at the end of each of its turns and when a sub-agent comes or goes
  const turns = session?.turns, helpers = session?.subagents.length, isolated = !!session?.worktree;
  useEffect(() => {
    if (live && turns !== undefined) send({ t: 'changes', sessionId });
    // a branch may change outside its turns too (a commit from the terminal): looked at again when the window opens
    if (live && isolated) send({ t: 'branch', sessionId, action: 'refresh' });
  }, [sessionId, live, turns, helpers, isolated, send]);
  const openBranches = useSessions((s) => s.openBranches);
  const [editing, setEditing] = useState<'name' | 'tag' | null>(null);
  const [switchingOff, setSwitchingOff] = useState(false);
  const [restAsked, setRestAsked] = useState(false);
  const rest = () => { send({ t: 'rest', sessionId }); closeOpen(sessionId); };
  // the sub-agent whose thread is shown, null for the conversation
  const [agent, setAgent] = useState<string | null>(null);
  // the pictures of the next message: dropped anywhere on the panel, pasted or picked in the composer (App keys the
  // panel by session, so another session starts without them)
  const attachments = useAttachments();
  if (!session) return null;

  const back = () => showPanel('thread');
  const [first, ...others] = session.permissions;
  /** The name or the tag, edited in place: Enter saves, Escape or leaving the field cancels. */
  const field = (kind: 'name' | 'tag') => (
    <form className="cp-detail__edit" onSubmit={(e) => {
      e.preventDefault();
      const value = String(new FormData(e.currentTarget).get('value') ?? '').trim();
      if (kind === 'name' && value) send({ t: 'rename', sessionId: session.id, name: value });
      if (kind === 'tag') send({ t: 'tag', sessionId: session.id, tag: value });
      setEditing(null);
    }}>
      <label className="cp-sr-only" htmlFor={`${kind}-field`}>{kind === 'name' ? t.session.detail.newName : t.session.detail.tag}</label>
      <input
        id={`${kind}-field`} name="value" defaultValue={kind === 'name' ? session.name : session.tag ?? ''} maxLength={kind === 'name' ? 40 : 24} autoFocus
        placeholder={kind === 'tag' ? t.session.detail.tagPlaceholder : undefined}
        onBlur={() => setEditing(null)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
      />
    </form>
  );

  return (
    <aside
      className="cp-detail" data-active={active} data-attention={attentionKind(session, seen) ?? undefined} aria-label={t.session.detail.label(session.name)} {...attachments.dropTarget}
      onPointerDownCapture={() => focus(session.id)} onFocusCapture={() => focus(session.id)}
    >
      <DropOverlay attachments={attachments} />
      {/* a double click on the head, outside its buttons, zooms it (as on a window's title bar) */}
      <header
        className="cp-detail__head" onPointerDown={(e) => { if (carry && !(e.target as Element).closest(INTERACTIVE)) carry(session.id, e); }}
        onDoubleClick={(e) => { if (several && !(e.target as Element).closest('button, input, form')) toggleZoom(); }}>
        <div className="cp-detail__title">
          {editing === 'name' ? field('name') : (
            <h2>
              <span className="cp-detail__name">{session.name}</span>
              <button type="button" className="cp-icon-button" data-size="small" aria-label={t.session.detail.renameLabel(session.name)} title={t.session.detail.rename} onClick={() => setEditing('name')}><PencilIcon /></button>
            </h2>
          )}
          <StateBadge session={session} kind={attentionKind(session, seen)} />
          <AgentBack sessionId={session.id} items={feed.items} agent={agent} setAgent={setAgent} />
          <div className="cp-detail__controls">
            {several && (
              <button
                type="button" className="cp-icon-button" data-variant="outlined" aria-pressed={zoomed}
                aria-label={zoomed ? t.session.detail.unzoom : t.session.detail.zoom} title={zoomed ? t.session.detail.unzoomTitle : t.session.detail.zoomTitle} onClick={toggleZoom}
              >{zoomed ? <MinimizeIcon /> : <MaximizeIcon />}</button>
            )}
            {isRunning(session) && (
              <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={t.session.detail.interrupt} title={t.session.detail.interruptTitle} disabled={session.state === 'starting'} onClick={() => send({ t: 'interrupt', sessionId: session.id })}><PauseIcon /></button>
            )}
            {/* on, Remote Control stays in sight with its state; off, it waits in the menu */}
            {session.remote && <RemoteButton session={session} />}
            <SessionMenu session={session} searchOpen={searchOpen} onSearch={() => openSearch(!searchOpen)} onBrowser={() => showPanel('browser')} onRest={() => (backgroundWork(session).length ? setRestAsked(true) : rest())} onSwitchOff={() => setSwitchingOff(true)} />
            <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={t.session.detail.hide} title={t.session.detail.hideTitle} onClick={() => closeOpen(session.id)}><CloseIcon /></button>
          </div>
        </div>
        <div className="cp-detail__line">
          {editing === 'tag' ? field('tag') : session.tag
            ? <button type="button" className="cp-tag" title={t.session.detail.changeTag} onClick={() => setEditing('tag')}><TagIcon />{session.tag}</button>
            : <button type="button" className="cp-tag" data-empty="true" onClick={() => setEditing('tag')}><TagIcon />{t.session.detail.addTag}</button>}
          {session.worktree && (
            <button type="button" className="cp-branch-pill" title={t.branches.pill(session.worktree.branch, session.worktree.base)} onClick={() => openBranches(session.worktree?.home ?? session.cwd)}>
              <BranchIcon /><span className="cp-branch-pill__name">{session.worktree.branch}</span>
            </button>
          )}
          {session.context && <ContextChip context={session.context} onOpen={() => showPanel('context')} />}
          {changes && changes.files.length > 0 && (
            <button
              type="button" className="cp-changes-chip" aria-pressed={panelView === 'changes'} title={t.session.detail.changesTitle}
              onClick={() => showPanel(panelView === 'changes' ? 'thread' : 'changes')}
            >
              <LineCounts added={changes.added} removed={changes.removed} />
              <span>{t.session.files(changes.files.length)}</span>
            </button>
          )}
          {(browser || driving) && (
            <button
              type="button" className="cp-changes-chip cp-browser-chip" data-live={driving} aria-pressed={panelView === 'browser'} aria-label={t.session.browser.chip} title={t.session.browser.chipTitle}
              onClick={() => showPanel(panelView === 'browser' ? 'thread' : 'browser')}
            ><GlobeIcon /></button>
          )}
          {pages.length > 0 && <PublishedPages pages={pages} />}
          {session.untrusted && <p className="cp-detail__meta cp-detail__untrusted" title={t.session.detail.untrustedTitle}>{t.session.detail.untrusted}</p>}
        </div>
        {switchingOff && asksBeforeSwitchingOff(session) && <SwitchOffDialog session={session} onClose={() => setSwitchingOff(false)} />}
        {switchingOff && !asksBeforeSwitchingOff(session) && (
          <Modal title={t.session.detail.switchOffQuestion(session.name)} onClose={() => setSwitchingOff(false)}>
            <p className="cp-muted">{t.session.detail.switchOffText}</p>
            {backgroundWork(session).length > 0 && <p className="cp-muted">{t.session.detail.stopsWith(backgroundWork(session).join(', '))}</p>}
            <div className="cp-form__actions">
              <button type="button" className="cp-button" autoFocus onClick={() => setSwitchingOff(false)}>{t.session.detail.cancel}</button>
              <button type="button" className="cp-button" data-variant="danger" onClick={() => { send({ t: 'forget', sessionId: session.id }); setSwitchingOff(false); closeOpen(session.id); }}>{t.session.detail.switchOff}</button>
            </div>
          </Modal>
        )}
        {restAsked && (
          <Modal title={t.session.detail.restQuestion(session.name)} onClose={() => setRestAsked(false)}>
            <p className="cp-muted">{t.session.detail.stopsWith(backgroundWork(session).join(', '))}</p>
            <div className="cp-form__actions">
              <button type="button" className="cp-button" autoFocus onClick={() => setRestAsked(false)}>{t.session.detail.cancel}</button>
              <button type="button" className="cp-button" data-variant="danger" onClick={() => { setRestAsked(false); rest(); }}>{t.session.detail.rest}</button>
            </div>
          </Modal>
        )}
        {session.error && <p className="cp-detail__error" role="alert">{session.error}</p>}
      </header>
      {first && (first.questions
        ? <QuestionPrompt key={first.requestId} sessionId={session.id} prompt={first} />
        : <PermissionPrompt key={first.requestId} sessionId={session.id} prompt={first} more={others.length} />)}
      {feed.plan.length > 0 && (
        <details className="cp-plan">
          <summary>{t.session.detail.plan(feed.plan.filter((item) => item.status === 'completed').length, feed.plan.length)}</summary>
          <ul>{feed.plan.map((item) => <li key={item.text} data-status={item.status}>{item.text}</li>)}</ul>
        </details>
      )}
      {panelView === 'browser' ? <BrowserView session={session} driving={driving} onBack={back} />
        : panelView === 'changes' ? <ChangesView cwd={session.cwd} changes={changes} onBack={back} onRefresh={() => send({ t: 'changes', sessionId: session.id })} />
        : panelView === 'mcp' ? <McpView sessionId={session.id} cwd={session.cwd} onBack={back} />
          : panelView === 'context' ? <ContextView sessionId={session.id} onBack={back} />
            : panelView === 'usage' ? <UsageView sessionId={session.id} onBack={back} />
              : <Feed feed={feed} sessionId={session.id} loading={!loaded} speaker={session.name} working={isRunning(session) && session.state !== 'perm'} drafts={drafts} agent={agent} setAgent={setAgent} />}
      <AsidePanel session={session} />
      <Composer key={session.id} session={session} attachments={attachments} />
    </aside>
  );
});
