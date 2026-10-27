import { useEffect, useMemo, useRef, useState } from 'react';
import { BRANCH_PREFIX, workSlug } from '../../shared/worktrees.ts';
import type { Effort, PermissionMode, TuneChange } from '../../shared/protocol.ts';
import { defaultFolder, folderName, formatAgo, homeRelative } from '../lib/format.ts';
import { availability, stillFree } from '../state/availability.ts';
import { useProjects } from '../state/useProjects.ts';
import { useSessions } from '../state/sessions.ts';
import { branchPreview, isolationOffer, occupants } from '../state/worktrees.ts';
import { BranchName } from './BranchCard.tsx';
import { Switch } from './Switch.tsx';
import { AttachButton, AttachmentStrip, DropOverlay } from './Attachments.tsx';
import { CommandField } from './CommandField.tsx';
import { t } from '../i18n/index.ts';
import { useAttachments } from './useAttachments.ts';
import { BranchIcon, CleanIcon, CloseIcon, SendIcon } from './Icons.tsx';
import { FolderPicker } from './FolderPicker.tsx';
import { Snippet } from './Snippet.tsx';
import { PersonPicker } from './PersonPicker.tsx';
import { TuneMenu } from './TuneMenu.tsx';


/**
 * Where a session starts when none is open: a message field at the bottom, with its folder (the default one when left empty),
 * model, effort, permissions and ultracode; above it, the folder's Claude Code conversations when resuming one. Enter starts the session,
 * which opens in its place. N puts the focus here; Shift+N starts a session at once (see App.tsx). `onClose`: shown as
 * a window beside the open sessions (focus mode), it can be closed; `replacing`: the session the new one will take the
 * place of, when no room is left.
 */
export function Launcher({ onClose, replacing }: { onClose?: () => void; replacing?: string }) {
  const roots = useSessions((s) => s.roots);
  const directories = useSessions((s) => s.directories);
  const found = useSessions((s) => s.conversations);
  const draft = useSessions((s) => s.newSession);
  const openNewSession = useSessions((s) => s.openNewSession);
  const createSession = useSessions((s) => s.createSession);
  const send = useSessions((s) => s.send);
  const live = useSessions((s) => s.connection === 'live');
  const crew = useSessions((s) => s.crew);
  const sessions = useSessions((s) => s.sessions);
  const people = useMemo(() => availability(crew, Object.values(sessions)), [crew, sessions]);
  // someone asked for who got a session meanwhile is not asked for any more
  const [asked, setAsked] = useState<string | null>(null);
  const person = stillFree(asked, people);

  const [resuming, setResuming] = useState(false);
  const [folder, setFolder] = useState('');
  const preferences = useSessions((s) => s.preferences);
  const [model, setModel] = useState(preferences.model);
  const [effort, setEffort] = useState<Effort | undefined>(preferences.effort || undefined);
  const [ultracode, setUltracode] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(preferences.permissionMode);
  // the settings arrive with the server's hello, maybe after the launcher showed
  useEffect(() => { setModel(preferences.model); setEffort(preferences.effort || undefined); setPermissionMode(preferences.permissionMode); }, [preferences.model, preferences.effort, preferences.permissionMode]);
  const [text, setText] = useState('');
  const [resumeId, setResumeId] = useState<string | null>(null);
  // words to find in the folder's conversations (their messages, not only their titles)
  const [query, setQuery] = useState('');
  const wanted = query.trim();
  const field = useRef<HTMLTextAreaElement>(null);
  const attachments = useAttachments();
  // a project picked in the header is where a new session goes, while it is one the sessions may work in
  const { project } = useProjects();
  const startFolder = defaultFolder(roots, project || preferences.defaultFolder);
  const cwd = folder.trim() || startFolder;
  const conversations = found && found.cwd === cwd && found.query === wanted ? found.list : null;

  // the folder's repository, asked for once the user stops typing it: whether to offer a branch of its own
  const repo = useSessions((s) => s.folderRepos[cwd]);
  const openBranches = useSessions((s) => s.openBranches);
  useEffect(() => {
    if (!cwd || !live) return;
    const timer = window.setTimeout(() => send({ t: 'folderInfo', cwd }), 250);
    return () => window.clearTimeout(timer);
  }, [cwd, live, send]);
  const taken = useMemo(() => (repo ? occupants(Object.values(sessions), repo) : []), [repo, sessions]);
  const offer = isolationOffer(preferences.isolate, repo, taken.length);
  // the user's own choice for this folder (the line's switch or the panel's Shared / Isolated), else the setting's
  const [isolateChoice, setIsolateChoice] = useState<{ cwd: string; isolated: boolean } | null>(null);
  const [base, setBase] = useState<{ cwd: string; branch: string } | null>(null);
  const [choosingBase, setChoosingBase] = useState(false);
  const canIsolate = !resuming && !!repo?.branch;
  const isolated = canIsolate && (isolateChoice?.cwd === cwd ? isolateChoice.isolated : offer.checked);
  const startBase = base?.cwd === cwd && repo?.branches.includes(base.branch) ? base.branch : repo?.branch ?? '';
  const chooseIsolated = (next: boolean) => setIsolateChoice({ cwd, isolated: next });

  useEffect(() => { if (live) send({ t: 'directories' }); }, [live, send]);

  // a request for a new session (N, the palette, the room) lands here: the field takes the focus and the command asked for
  useEffect(() => {
    if (!draft) return;
    setResuming(draft.resumeIn !== undefined);
    if (draft.resumeIn) setFolder(draft.resumeIn);
    if (draft.command) setText(draft.command);
    if (draft.person) setAsked(draft.person);
    field.current?.focus();
    openNewSession(null);
  }, [draft, openNewSession]);

  // the folder's conversations, asked for once the user stops typing it or the words to find
  useEffect(() => {
    if (!resuming || !cwd || !live) return;
    setResumeId(null);
    const timer = window.setTimeout(() => send({ t: 'conversations', cwd, ...(wanted ? { query: wanted } : {}) }), 250);
    return () => window.clearTimeout(timer);
  }, [resuming, cwd, wanted, live, send]);

  const tune = (change: TuneChange) => {
    if (change.model !== undefined) setModel(change.model);
    if (change.effort !== undefined) setEffort(change.effort || undefined);
    if (change.ultracode !== undefined) setUltracode(change.ultracode);
    if (change.permissionMode !== undefined) setPermissionMode(change.permissionMode);
  };

  const ready = (resuming ? resumeId !== null : true) && !attachments.preparing;
  const start = () => {
    if (!ready || !cwd) return;
    const message = text.trim();
    const images = attachments.uploads;
    const files = attachments.files;
    const isolate = isolated ? { isolate: startBase && startBase !== repo?.branch ? { base: startBase } : {} } : {};
    createSession({ cwd, model, ...(effort ? { effort } : {}), ...(ultracode ? { ultracode } : {}), permissionMode, ...(person ? { name: person } : {}), ...(message ? { text: message } : {}), ...(images.length ? { images } : {}), ...(files.length ? { files } : {}), ...(resuming && resumeId ? { resumeId } : {}), ...isolate });
    setText('');
    attachments.clear();
    setResumeId(null);
    setAsked(null);
  };

  const words = t.composer.launcher;
  const branchWords = t.branches.launcher;
  // the branch it will get: with someone asked for, the name the server will give; else the work's part only
  const slug = workSlug(text);
  const preview = person ? branchPreview(person, text) : `${BRANCH_PREFIX}…${slug ? `-${slug}` : ''}`;
  const tidy = !resuming && repo && repo.merged >= 3;
  return (
    <aside className="cp-launcher" aria-label={words.label} {...attachments.dropTarget}>
      <DropOverlay attachments={attachments} />
      <div className="cp-launcher__head">
        <div className="cp-segmented" role="group" aria-label={words.conversation}>
          <button type="button" aria-pressed={!resuming} onClick={() => setResuming(false)}>{words.newConversation}</button>
          <button type="button" aria-pressed={resuming} onClick={() => setResuming(true)}>{words.resume}</button>
        </div>
        {onClose && <button type="button" className="cp-icon-button cp-launcher__close" aria-label={words.close} title={words.close} onClick={onClose}><CloseIcon /></button>}
      </div>

      <div className="cp-launcher__body">
        {!resuming ? (
          <div className="cp-launcher__intro">
            <h2>{words.title}</h2>
            <p>{replacing ? words.replaces(replacing) : words.intro}</p>
            <ul className="cp-launcher__keys">
              <li><kbd className="cp-kbd">N</kbd> {words.newRequest}</li>
              <li><kbd className="cp-kbd">{words.shiftN}</kbd> {words.startNow(homeRelative(startFolder))}</li>
              <li><kbd className="cp-kbd">/</kbd> {words.commandKey}</li>
            </ul>
          </div>
        ) : (
          <div className="cp-resume">
            {!conversations ? (
              <div className="cp-resume__loading" role="status">
                <span className="cp-resume__spinner" aria-hidden="true" />
                <p className="cp-muted">{wanted ? words.searchingWords(homeRelative(cwd)) : words.searching(homeRelative(cwd))}</p>
              </div>
            )
              : conversations.length === 0 ? <p className="cp-muted">{wanted ? words.noMatch(wanted, homeRelative(cwd)) : words.noConversation(homeRelative(cwd))}</p>
                : (
                  <ul className="cp-resume__list" aria-label={words.conversationsOf(homeRelative(cwd))}>
                    {conversations.map((conversation) => (
                      <li key={conversation.id}>
                        <button type="button" className="cp-resume__item" aria-pressed={resumeId === conversation.id} onClick={() => { setResumeId(conversation.id); if (conversation.name) setAsked(conversation.name); field.current?.focus(); }}>
                          <span className="cp-resume__title">{conversation.title}</span>
                          <span className="cp-resume__when">{formatAgo(Date.now() - conversation.updatedAt)}</span>
                          {conversation.match ? <span className="cp-resume__preview"><Snippet {...conversation.match} /></span>
                            : conversation.preview && conversation.preview !== conversation.title && <span className="cp-resume__preview">{conversation.preview}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            {/* last, so it sits right above the composer whatever the list's height */}
            <input
              className="cp-resume__search" type="search" value={query} placeholder={words.searchConversations} aria-label={words.searchConversations}
              autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <form className="cp-launcher__composer" onSubmit={(e) => { e.preventDefault(); start(); }}>
        {repo && canIsolate && (offer.shown || isolated) && (
          <section className="cp-isolate" data-on={isolated} aria-label={branchWords.title}>
            <span className="cp-isolate__icon" aria-hidden="true"><BranchIcon /></span>
            <div className="cp-isolate__text">
              <strong className="cp-isolate__title">{branchWords.title}</strong>
              <p>
                {taken.length ? branchWords.busy(taken[0].name, taken.length - 1, folderName(repo.root)) : branchWords.alone}
                {isolated && (
                  <> {branchWords.startsOn(person)} <BranchName name={preview} />{branchWords.from}{' '}
                    {choosingBase ? (
                      <span className="cp-chip" data-select>
                        <select aria-label={branchWords.base} value={startBase} autoFocus onChange={(e) => { setBase({ cwd, branch: e.target.value }); setChoosingBase(false); }} onBlur={() => setChoosingBase(false)}>
                          {repo.branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                        </select>
                      </span>
                    ) : <BranchName name={startBase} />}
                    .{repo.branches.length > 1 && !choosingBase && <> <button type="button" className="cp-link" title={branchWords.changeTitle} onClick={() => setChoosingBase(true)}>{branchWords.change}</button></>}
                  </>
                )}
              </p>
              {isolated && repo.dirty > 0 && <p className="cp-isolate__dirty">{branchWords.dirty(repo.dirty, folderName(repo.root))}</p>}
            </div>
            <Switch checked={isolated} onChange={chooseIsolated} label={branchWords.title} />
          </section>
        )}
        {tidy && (
          <p className="cp-launcher__tidy">
            <CleanIcon />{branchWords.tidy(repo.merged, folderName(repo.root))} <button type="button" className="cp-link" onClick={() => openBranches(cwd)}>{branchWords.tidyAction}</button>
          </p>
        )}
        <div className="cp-launcher__box">
        <AttachmentStrip attachments={attachments} />
        <CommandField
          ref={field} id="launcher-field" label={words.fieldLabel} value={text} onChange={setText} onSubmit={() => { if (text.trim() || attachments.items.length) start(); }}
          onPaste={attachments.onPaste}
          placeholder={resuming ? (resumeId ? words.placeholderResume : words.placeholderPickFirst) : words.placeholder}
        />
        <div className="cp-launcher__options">
          {people.length > 0 && <PersonPicker people={people} chosen={person} onChoose={setAsked} />}
          <FolderPicker directories={directories} value={folder} onChange={setFolder} placeholder={homeRelative(startFolder)} />
          <TuneMenu tuning={{ model, effort, ultracode, permissionMode }} cwd={cwd} onChange={tune} isolation={canIsolate ? { isolated, onChange: chooseIsolated } : undefined} />
          <AttachButton attachments={attachments} className="cp-icon-button cp-launcher__attach" />
          <button type="submit" className="cp-launcher__send" disabled={!ready}><span className="cp-launcher__send-label">{resuming ? words.resume : words.start}</span><SendIcon /></button>
        </div>
        </div>
      </form>
    </aside>
  );
}
