import { memo, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { MAX_TAG, MAX_TAGS, parseTags, withoutTag } from '../../shared/tags.ts';
import { t } from '../i18n/index.ts';
import { shortcut } from '../lib/platform.ts';
import { drivesBrowser } from '../state/browser.ts';
import { buildFeed, publishedPages } from '../state/feed.ts';
import { backgroundWork, isRunning } from '../state/labels.ts';
import { attentionKind } from '../state/queue.ts';
import { projectOf } from '../state/projects.ts';
import { useProjects } from '../state/useProjects.ts';
import { defaultFolder } from '../../shared/folders.ts';
import { useSessions } from '../state/sessions.ts';
import { DropOverlay } from './Attachments.tsx';
import { AsidePanel } from './AsidePanel.tsx';
import { BrowserView } from './BrowserView.tsx';
import { ChangesView, LineCounts } from './Changes.tsx';
import { ContextChip, ContextView, McpView, UsageView } from './ClaudeViews.tsx';
import { Composer, RemoteButton } from './Composer.tsx';
import { INTERACTIVE, WindowDragContext } from './useWindowDrag.ts';
import { Feed, type Subagent } from './Feed.tsx';
import { FilesView } from './FilesView.tsx';
import { SessionTabs } from './SessionTabs.tsx';
import { BranchIcon, CloseIcon, DuplicateIcon, FolderIcon, MaximizeIcon, MinimizeIcon, MoreIcon, KeyIcon, PencilIcon, PhoneIcon, PlusIcon, PopOutIcon, PowerIcon, RestIcon, SearchIcon, TagIcon, TerminalIcon } from './Icons.tsx';
import { OutControls } from './OutControls.tsx';
import { Modal } from './Modal.tsx';
import { PermissionPrompt } from './PermissionPrompt.tsx';
import { PublishedPages } from './PublishedPages.tsx';
import { QuestionPrompt } from './QuestionPrompt.tsx';
import { SecretPrompt, SecretsDialog } from './SecretPrompt.tsx';
import { StateBadge } from './StateBadge.tsx';
import { SwitchOffDialog } from './SwitchOffDialog.tsx';
import { asksBeforeSwitchingOff } from '../state/worktrees.ts';
import { useAttachments } from './useAttachments.ts';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';
import { sessionTagHues } from '../design/tag-colors.ts';

const NO_EVENTS: never[] = [];

/**
 * What a session's head keeps out of sight, so it has room for its name: zoom (also a double click on the head), taking
 * it out, search, Remote Control, rest, switch off. `zoom` and `popOut` are absent where they do not apply.
 */
function SessionMenu({ session, searchOpen, onSearch, onKeys, onRest, onSwitchOff, onRename, zoom, popOut }: { session: SessionInfo; searchOpen: boolean; onSearch: () => void; onKeys: () => void; onRest: () => void; onSwitchOff: () => void; onRename: () => void; zoom?: { zoomed: boolean; toggle: () => void }; popOut?: () => void }) {
  const send = useSessions((s) => s.send);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  useMenuBelow(open, box, menu);
  const words = t.session.detail;
  const pick = (action: () => void) => () => { action(); close(); };
  return (
    <div className="cp-detail__more" ref={box}>
      <button type="button" className="cp-icon-button" data-variant="outlined" aria-expanded={open} aria-haspopup="menu" aria-label={words.more} title={words.more} onClick={() => setOpen(!open)}><MoreIcon /></button>
      {open && (
        <div ref={menu} className="cp-detail__menu" popover="manual" role="menu" aria-label={words.more}>
          <button type="button" role="menuitem" title={t.session.detail.renameHint} onClick={pick(onRename)}><PencilIcon />{t.session.detail.rename}</button>
          {zoom && <button type="button" role="menuitem" title={zoom.zoomed ? t.session.detail.unzoomTitle : t.session.detail.zoomTitle} onClick={pick(zoom.toggle)}>{zoom.zoomed ? <MinimizeIcon /> : <MaximizeIcon />}{zoom.zoomed ? t.session.detail.unzoom : t.session.detail.zoom}</button>}
          {popOut && <button type="button" role="menuitem" title={t.common.out.popOutTitle} onClick={pick(popOut)}><PopOutIcon />{t.common.out.popOut}</button>}
          <button type="button" role="menuitem" onClick={pick(onSearch)}><SearchIcon />{searchOpen ? words.searchClose : words.search}<kbd className="cp-kbd">{shortcut('F')}</kbd></button>
          {!session.remote && (
            <button type="button" role="menuitem" title={t.session.remote.off} onClick={pick(() => send({ t: 'remoteControl', sessionId: session.id, enabled: true }))}><PhoneIcon />{words.remote}</button>
          )}
          {session.resumable && (
            <button type="button" role="menuitem" title={words.duplicateTitle} onClick={pick(() => useSessions.getState().duplicateSession(session.id))}><DuplicateIcon />{words.duplicate}</button>
          )}
          <button type="button" role="menuitem" title={words.keysTitle} onClick={pick(onKeys)}><KeyIcon />{words.keys}</button>
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
/**
 * Kept from being drawn again while a window is carried or resized: only its own session changes it. `detached`: alone
 * in a window taken out of Open Space (OutApp), which closing it closes.
 */
export const Detail = memo(function Detail({ sessionId, detached = false }: { sessionId: string; detached?: boolean }) {
  const active = useSessions((s) => s.selectedId === sessionId);
  const session = useSessions((s) => s.sessions[sessionId]);
  const events = useSessions((s) => s.logs[sessionId]) ?? NO_EVENTS;
  const loaded = useSessions((s) => s.logLoaded[sessionId] === true);
  const drafts = useSessions((s) => s.partials[sessionId]) ?? NO_DRAFTS;
  const send = useSessions((s) => s.send);
  const focus = useSessions((s) => s.focus);
  const closeOpen = useSessions((s) => s.closeOpen);
  const popOut = useSessions((s) => s.popOut);
  const hide = detached ? () => window.close() : () => closeOpen(sessionId);
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
  const agents = useMemo(() => feed.items.filter((item): item is Subagent => item.kind === 'subagent'), [feed]);
  // its agent is at work in its browser: the chip says so, and the view shows who drives
  const running = !!session && isRunning(session);
  const driving = useMemo(() => running && drivesBrowser(feed.items), [feed, running]);
  const changes = useSessions((s) => s.changes[sessionId]);
  const live = useSessions((s) => s.connection === 'live');
  const panelView = useSessions((s) => (active ? s.panelView : (s.keptViews[sessionId] ?? 'thread')));
  const showPanel = useSessions((s) => s.showPanel);
  // what it changed, asked again at the end of each of its turns and when a sub-agent comes or goes
  const turns = session?.turns, helpers = session?.subagents.length, isolated = !!session?.worktree;
  useEffect(() => {
    if (live && turns !== undefined) send({ t: 'changes', sessionId });
    // a branch may change outside its turns too (a commit from the terminal): looked at again when the window opens
    if (live && isolated) send({ t: 'branch', sessionId, action: 'refresh' });
  }, [sessionId, live, turns, helpers, isolated, send]);
  const openBranches = useSessions((s) => s.openBranches);
  // its project beside its name, while the header shows them all (and they are several), unless it is the default folder
  const { projects, project } = useProjects();
  const usual = useSessions((s) => defaultFolder(s.roots, s.preferences.defaultFolder));
  const folder = session ? projectOf(session) : '';
  const projectChip = !project && projects.length > 1 && folder !== usual ? projects.find((each) => each.folder === folder)?.name : undefined;
  // the name; all the tags at once (the head's single pill, in a small window); or one tag (`tag`: null for a new one)
  const [editing, setEditing] = useState<'name' | 'tags' | { tag: string | null } | null>(null);
  const [switchingOff, setSwitchingOff] = useState(false);
  const [restAsked, setRestAsked] = useState(false);
  const secretsOpen = useSessions((s) => (s.secretsOpen?.sessionId === session.id ? s.secretsOpen : null));
  const openSecrets = useSessions((s) => s.openSecrets);
  const rest = () => { send({ t: 'rest', sessionId }); hide(); };
  // the sub-agent whose thread is shown, null for the conversation
  const [agent, setAgent] = useState<string | null>(null);
  // the pictures of the next message: dropped anywhere on the panel, pasted or picked in the composer (App keys the
  // panel by session, so another session starts without them)
  const attachments = useAttachments();
  if (!session) return null;

  const back = () => showPanel('thread');
  const [first, ...others] = session.permissions;
  const tags = session.tags ?? [];
  const hues = sessionTagHues(tags);
  const setTags = (next: string[]) => send({ t: 'tags', sessionId: session.id, tags: next });
  /**
   * The name, all the tags (separated by commas), or one tag, edited in place: Enter saves, Escape or leaving the field
   * cancels. One tag left empty is taken off; a new one joins the others.
   */
  const field = (kind: 'name' | 'tags' | 'tag', tag: string | null = null) => (
    <form className="cp-detail__edit" data-kind={kind} onSubmit={(e) => {
      e.preventDefault();
      const value = String(new FormData(e.currentTarget).get('value') ?? '').trim();
      if (kind === 'name' && value) send({ t: 'rename', sessionId: session.id, name: value });
      if (kind === 'tags') setTags(parseTags(value));
      if (kind === 'tag') {
        const typed = parseTags(value);
        setTags(tag === null ? parseTags([...tags, ...typed].join(',')) : tags.flatMap((each) => (each === tag ? typed : [each])));
      }
      setEditing(null);
    }}>
      <label className="cp-sr-only" htmlFor={`${kind}-field`}>{kind === 'name' ? t.session.detail.newName : t.session.detail.tag}</label>
      <input
        id={`${kind}-field`} name="value" autoFocus
        defaultValue={kind === 'name' ? session.name : kind === 'tags' ? (tags.length ? `${tags.join(', ')}, ` : '') : (tag ?? '')}
        maxLength={kind === 'name' ? 40 : kind === 'tag' ? MAX_TAG : (MAX_TAG + 2) * MAX_TAGS}
        size={kind === 'tag' ? Math.max(6, (tag ?? '').length + 2) : undefined}
        placeholder={kind === 'name' ? undefined : kind === 'tag' && tag === null ? t.session.detail.newTag : t.session.detail.tagPlaceholder}
        onBlur={() => setEditing(null)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
      />
    </form>
  );
  const editedTag = editing !== null && typeof editing === 'object' ? editing.tag : undefined;

  return (
    <aside
      className="cp-detail" data-active={active} data-view={panelView} data-attention={attentionKind(session, seen) ?? undefined} aria-label={t.session.detail.label(session.name)} {...attachments.dropTarget}
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
              {/* a double click on the name renames it (also in the menu) */}
              <span className="cp-detail__name" title={t.session.detail.renameHint} onDoubleClick={(e) => { e.stopPropagation(); setEditing('name'); }}>{session.name}</span>
              {/* shown only where the line under the title is hidden for room */}
              {tags.length
                ? <button type="button" className="cp-tag cp-detail__title-tag" data-hue={hues[0]} title={t.session.detail.changeTag} onClick={() => setEditing('tags')}><TagIcon /><span>{tags.join(', ')}</span></button>
                : <button type="button" className="cp-tag cp-detail__title-tag" data-empty="true" title={t.session.detail.addTag} onClick={() => setEditing('tags')}><TagIcon />{t.session.detail.tagShort}</button>}
            </h2>
          )}
          {projectChip && <span className="cp-detail__project" title={projectOf(session)}><FolderIcon />{projectChip}</span>}
          <StateBadge session={session} kind={attentionKind(session, seen)} />
          <div className="cp-detail__controls">
            {/* on, Remote Control stays in sight with its state; off, it waits in the menu */}
            {session.remote && <RemoteButton session={session} />}
            <SessionMenu session={session} searchOpen={searchOpen} onSearch={() => openSearch(!searchOpen)} onKeys={() => openSecrets(session.id)} onRest={() => (backgroundWork(session).length ? setRestAsked(true) : rest())} onSwitchOff={() => setSwitchingOff(true)} onRename={() => setEditing('name')}
              zoom={several ? { zoomed, toggle: toggleZoom } : undefined} popOut={detached ? undefined : () => popOut({ kind: 'session', sessionId: session.id })}
            />
            {detached ? <OutControls target={{ kind: 'session', sessionId: session.id }} variant="outlined" />
              : <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={t.session.detail.hide} title={t.session.detail.hideTitle} onClick={hide}><CloseIcon /></button>}
          </div>
        </div>
        <div className="cp-detail__line">
          {editing === 'tags' ? field('tags') : (
            <>
              {tags.map((tag, index) => (editedTag === tag ? <span key={tag}>{field('tag', tag)}</span> : (
                <span key={tag} className="cp-tag" data-hue={hues[index]} data-removable="true">
                  <button type="button" className="cp-tag__text" title={t.session.detail.changeTag} onClick={() => setEditing({ tag })}><TagIcon />{tag}</button>
                  <button type="button" className="cp-tag__remove" aria-label={t.session.detail.removeTag(tag)} title={t.session.detail.removeTag(tag)} onClick={() => setTags(withoutTag(tags, tag))}><CloseIcon /></button>
                </span>
              )))}
              {tags.length < MAX_TAGS && (editedTag === null ? field('tag') : (
                <button type="button" className="cp-tag" data-empty="true" title={t.session.detail.addTag} onClick={() => setEditing({ tag: null })}>{tags.length ? <PlusIcon /> : <TagIcon />}{tags.length ? t.session.detail.tagShort : t.session.detail.addTag}</button>
              ))}
            </>
          )}
          {session.worktree && (
            <button type="button" className="cp-branch-pill" title={t.branches.pill(session.worktree.branch, session.worktree.base)} onClick={() => openBranches(session.worktree?.home ?? session.cwd)}>
              <BranchIcon /><span className="cp-branch-pill__name">{session.worktree.branch}</span>
            </button>
          )}
          {session.secrets && (
            <button type="button" className="cp-tag" title={t.session.detail.keysTitle} onClick={() => openSecrets(session.id)}><KeyIcon />{t.session.detail.keysHeld(session.secrets.length)}</button>
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
          {pages.length > 0 && <PublishedPages pages={pages} />}
        </div>
        {session.untrusted && <p className="cp-detail__meta cp-detail__untrusted" title={t.session.detail.untrustedTitle}>{t.session.detail.untrusted}</p>}
        {switchingOff && asksBeforeSwitchingOff(session) && <SwitchOffDialog session={session} onClose={() => setSwitchingOff(false)} />}
        {switchingOff && !asksBeforeSwitchingOff(session) && (
          <Modal title={t.session.detail.switchOffQuestion(session.name)} onClose={() => setSwitchingOff(false)}>
            <p className="cp-muted">{t.session.detail.switchOffText}</p>
            {backgroundWork(session).length > 0 && <p className="cp-muted">{t.session.detail.stopsWith(backgroundWork(session).join(', '))}</p>}
            {session.worktree?.borrowed && <p className="cp-muted">{t.branches.switchOff.desktop}</p>}
            <div className="cp-form__actions">
              <button type="button" className="cp-button" onClick={() => setSwitchingOff(false)}>{t.session.detail.cancel}</button>
              <button type="button" className="cp-button" data-variant="danger" data-autofocus onClick={() => { send({ t: 'forget', sessionId: session.id }); setSwitchingOff(false); hide(); }}>{t.session.detail.switchOff}</button>
            </div>
          </Modal>
        )}
        {secretsOpen && <SecretsDialog session={session} name={secretsOpen.name} onClose={() => openSecrets(null)} />}
        {restAsked && (
          <Modal title={t.session.detail.restQuestion(session.name)} onClose={() => setRestAsked(false)}>
            <p className="cp-muted">{t.session.detail.stopsWith(backgroundWork(session).join(', '))}</p>
            <div className="cp-form__actions">
              <button type="button" className="cp-button" onClick={() => setRestAsked(false)}>{t.session.detail.cancel}</button>
              <button type="button" className="cp-button" data-variant="danger" data-autofocus onClick={() => { setRestAsked(false); rest(); }}>{t.session.detail.rest}</button>
            </div>
          </Modal>
        )}
        {session.error && <p className="cp-detail__error" role="alert">{session.error}</p>}
      </header>
      {feed.plan.length > 0 && (
        <details className="cp-plan">
          <summary>{t.session.detail.plan(feed.plan.filter((item) => item.status === 'completed').length, feed.plan.length)}</summary>
          <ul>{feed.plan.map((item) => <li key={item.text} data-status={item.status}>{item.text}</li>)}</ul>
        </details>
      )}
      <SessionTabs sessionId={session.id} view={panelView} driving={driving} agents={agents} agent={agent} setAgent={setAgent} />
      {panelView === 'browser' ? <BrowserView session={session} driving={driving} />
        : panelView === 'files' ? <FilesView session={session} />
        : panelView === 'changes' ? <ChangesView cwd={session.cwd} changes={changes} onBack={back} onRefresh={() => send({ t: 'changes', sessionId: session.id })} />
        : panelView === 'mcp' ? <McpView sessionId={session.id} cwd={session.cwd} onBack={back} />
          : panelView === 'context' ? <ContextView sessionId={session.id} onBack={back} />
            : panelView === 'usage' ? <UsageView sessionId={session.id} onBack={back} />
              : <Feed feed={feed} sessionId={session.id} loading={!loaded} speaker={session.name} working={isRunning(session) && session.state !== 'perm'} drafts={drafts} agent={agent} setAgent={setAgent} />}
      <AsidePanel session={session} />
      {/* at the bottom, by the field, as in Claude Code */}
      {first && (first.secrets ? <SecretPrompt key={first.requestId} sessionId={session.id} prompt={first} />
        : first.questions ? <QuestionPrompt key={first.requestId} sessionId={session.id} prompt={first} />
        : <PermissionPrompt key={first.requestId} sessionId={session.id} prompt={first} more={others.length} />)}
      <Composer key={session.id} session={session} attachments={attachments} />
    </aside>
  );
});
