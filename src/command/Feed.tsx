import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEXT_EXTENSIONS, type SentFile } from '../../shared/protocol.ts';
import { findMentions } from '../../shared/mentions.ts';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { locale, t } from '../i18n/index.ts';
import { formatClock, formatDuration } from '../lib/format.ts';
import { copyCodeOnClick } from './copyCode.ts';
import { useNow } from '../lib/useNow.ts';
import { chibiHead, lookOfStranger } from '../room/chibi.ts';
import { BackIcon, ChevronDownIcon, CompactIcon, DownloadIcon, ExternalLinkIcon, FileIcon, FileTextIcon, PauseIcon, PeerIcon, PlayIcon, SendIcon } from './Icons.tsx';
import { Viewer, type Viewed } from './Viewer.tsx';
import { useDismiss } from './useDismiss.ts';
import { Prose } from './Prose.tsx';
import { currentTurn, threadOf, toolSummary, turnPhase, turnWord, type Feed as FeedData, type FeedItem, type ThreadEntry, type ToolRun } from '../state/feed.ts';
import { useSessions } from '../state/sessions.ts';
import { FeedSearch } from './FeedSearch.tsx';
import { BranchCardView, BranchNewsItem } from './BranchCard.tsx';

type Subagent = FeedItem & { kind: 'subagent' };

/** A sub-agent's face, the one it has in the room (next to its session's name), with how it is doing. */
function AgentFace({ sessionId, agent }: { sessionId: string; agent: Subagent }) {
  const head = useMemo(() => chibiHead(lookOfStranger(`${sessionId}/${agent.agentId}`)), [sessionId, agent.agentId]);
  return (
    <span className="cp-agent-face" data-status={agent.status}>
      <img src={head} alt="" width={22} height={22} />
      <span className="cp-feed__agent-dot" aria-hidden="true" />
    </span>
  );
}

/**
 * A small window has no room for the thread's tabs: while a sub-agent's thread is shown, its face sits in the head,
 * and a click goes back to the conversation (the sub-agents stay one click away on their lines in it).
 */
export function AgentBack({ sessionId, items, agent, setAgent }: { sessionId: string; items: readonly FeedItem[]; agent: string | null; setAgent: (agentId: string | null) => void }) {
  const shown = items.find((item): item is Subagent => item.kind === 'subagent' && item.agentId === agent);
  if (!shown) return null;
  return (
    <button type="button" className="cp-detail__agent-back" aria-label={t.session.feed.backFrom(shown.name)} title={t.session.feed.backFrom(shown.name)} onClick={() => setAgent(null)}>
      <BackIcon /><AgentFace sessionId={sessionId} agent={shown} />
    </button>
  );
}

/** The sub-agents done with their work, out of the tabs: in a menu at their end, the last one first. */
function FinishedAgents({ sessionId, agents, shown, onOpen }: { sessionId: string; agents: readonly Subagent[]; shown: string | null; onOpen: (agentId: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  return (
    <div className="cp-thread__finished" ref={box}>
      <button type="button" aria-expanded={open} aria-controls="finished-agents" onClick={() => setOpen(!open)}>
        {t.session.feed.finished(agents.length)}<ChevronDownIcon />
      </button>
      {open && (
        <ul className="cp-thread__finished-list" id="finished-agents" aria-label={t.session.feed.finishedList}>
          {[...agents].reverse().map((agent) => (
            <li key={agent.agentId}>
              <button type="button" aria-current={shown === agent.agentId} onClick={() => { onOpen(agent.agentId); close(); }}>
                <AgentFace sessionId={sessionId} agent={agent} />
                <span className="cp-feed__agent-name">{agent.name}</span>
                <span className="cp-feed__agent-task">{agent.task}</span>
                <span className="cp-feed__agent-status">{t.session.feed.subagentStatus[agent.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A run of tool calls as one line ("8 actions · Read ×3, Bash ×2"), opening on the calls themselves. */
function Tools({ run }: { run: ToolRun }) {
  const running = run.tools.find((tool) => tool.ok === null);
  const failed = run.tools.filter((tool) => tool.ok === false).length;
  return (
    <li className="cp-feed__item" data-kind="tools">
      <details>
        <summary>
          <span className="cp-feed__count">{t.session.feed.actions(run.tools.length)}</span>
          <span className="cp-feed__detail">{running ? t.session.feed.running(running.tool, running.detail) : toolSummary(run.tools)}</span>
          {failed > 0 && <span className="cp-feed__flag">{t.session.feed.failures(failed)}</span>}
        </summary>
        <ul>
          {run.tools.map((tool) => (
            <li key={tool.id} className="cp-feed__tool" data-ok={tool.ok === null ? 'pending' : tool.ok ? 'yes' : 'no'}>
              <code>{tool.tool}</code><span className="cp-feed__detail">{tool.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/** `speaker`: the session's name, shown on what its main agent says. `openAgent`: shows a sub-agent's own thread. */
/** A text file bigger than this is only offered for download: the viewer would choke on it. */
const MAX_READ_BYTES = 5_000_000;

/** A file a session sent: a picture or a text to open in large, any other file to download (its own name kept). */
function SentFileView({ file, onView, caption }: { file: SentFile; onView: (image: Viewed) => void; caption: string }) {
  const words = t.session.feed.files;
  if (!file.stored) return <span className="cp-file" data-missing="true" title={words.missing}>{file.title}<span className="cp-file__size">{words.missing}</span></span>;
  const src = `/attachments/${file.stored}`;
  // older threads have no `video` mark: their stored name tells
  if (file.video || /\.(mp4|m4v|webm|mov)$/.test(file.stored)) return <SentVideo src={src} title={file.title} size={file.size} caption={caption} onView={onView} />;
  if (file.page) {
    const download = `${src}?name=${encodeURIComponent(file.title)}`;
    return (
      <div className="cp-artifact">
        <PagePreview src={src} title={file.title} onOpen={() => onView({ src, alt: file.title, caption: caption || file.title, kind: 'page', link: { href: download, label: words.download, download: file.title } })} />
        <p className="cp-artifact__bar">
          <span className="cp-artifact__title">{file.title}</span>
          <a className="cp-icon-button" href={download} download={file.title} aria-label={words.download} title={words.download}><DownloadIcon /></a>
        </p>
      </div>
    );
  }
  if (file.image) {
    return (
      <button type="button" className="cp-file__image" title={words.open} onClick={() => onView({ src, alt: file.title, caption: caption || file.title, kind: 'image' })}>
        <img src={src} alt={file.title} loading="lazy" />
      </button>
    );
  }
  const extension = file.stored.split('.').pop() ?? '';
  if (TEXT_EXTENSIONS.has(extension) && file.size <= MAX_READ_BYTES) {
    const kind = extension === 'md' || extension === 'markdown' ? 'markdown' : 'text';
    const download = `${src}?name=${encodeURIComponent(file.title)}`;
    return (
      <button type="button" className="cp-file" title={words.read} onClick={() => onView({ src, alt: file.title, caption: caption || file.title, kind, link: { href: download, label: words.download, download: file.title } })}>
        <FileTextIcon />{file.title}<span className="cp-file__size">{bytes(file.size)}</span>
      </button>
    );
  }
  return (
    <a className="cp-file" href={`${src}?name=${encodeURIComponent(file.title)}`} download={file.title} title={words.download}>
      <DownloadIcon />{file.title}<span className="cp-file__size">{bytes(file.size)}</span>
    </a>
  );
}

/** A live preview of a page (a sandboxed copy, laid out wide and scaled down): a click shows it large. */
function PagePreview({ src, title, onOpen }: { src: string; title: string; onOpen: () => void }) {
  const words = t.session.feed.artifact;
  return (
    <div className="cp-artifact__preview">
      <iframe src={src} title={title} sandbox="allow-scripts" loading="lazy" tabIndex={-1} />
      <button type="button" className="cp-artifact__open" aria-label={words.open(title)} title={words.enlarge} onClick={onOpen} />
    </div>
  );
}

/** A page a session published on claude.ai: its preview (claude.ai cannot be framed elsewhere), and its address there. */
function ArtifactCard({ item, speaker, onView }: { item: FeedItem & { kind: 'artifact' }; speaker: string; onView: (viewed: Viewed) => void }) {
  const words = t.session.feed.artifact;
  // with its pictures and files, when Open Space has them (see servePage in server/http.ts)
  const src = item.bundle ? `/pages/${item.bundle.split('.')[0]}/` : item.stored ? `/attachments/${item.stored}` : null;
  return (
    <li className="cp-feed__item" data-kind="artifact">
      <span className="cp-feed__who">{item.author ?? speaker}</span>
      <div className="cp-artifact">
        {src && <PagePreview src={src} title={item.title} onOpen={() => onView({ src, alt: item.title, caption: item.title, kind: 'page', link: { href: item.url, label: t.session.feed.viewer.onClaude } })} />}
        <p className="cp-artifact__bar">
          <span className="cp-artifact__title">{item.title}</span>
          <a className="cp-icon-button" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={words.onClaude} title={words.onClaude}><ExternalLinkIcon /></a>
        </p>
      </div>
    </li>
  );
}

/**
 * A video a session sent: its first frame with a play mark, a click plays it large; its name and a download button
 * under it. One the browser cannot play (a codec it lacks) is only offered for download.
 */
function SentVideo({ src, title, size, caption, onView }: { src: string; title: string; size: number; caption: string; onView: (viewed: Viewed) => void }) {
  const words = t.session.feed.files;
  const [playable, setPlayable] = useState(true);
  const download = `${src}?name=${encodeURIComponent(title)}`;
  return (
    <div className="cp-video">
      {playable && (
        <button type="button" className="cp-video__open" title={words.play} onClick={() => onView({ src, alt: title, caption: caption || title, kind: 'video', link: { href: download, label: words.download, download: title } })}>
          {/* "#t=0.1": a first frame to show, rather than a black one */}
          <video src={`${src}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} onError={() => setPlayable(false)} />
          <span className="cp-video__play" aria-hidden="true"><PlayIcon /></span>
        </button>
      )}
      <p className="cp-artifact__bar">
        <span className="cp-artifact__title">{title}</span>
        <span className="cp-file__size">{bytes(size)}</span>
        <a className="cp-icon-button" href={download} download={title} aria-label={words.download} title={words.download}><DownloadIcon /></a>
      </p>
    </div>
  );
}

const bytes = (size: number) => new Intl.NumberFormat(locale(), { style: 'unit', unit: size >= 1_000_000 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(size >= 1_000_000 ? size / 1_000_000 : Math.max(0.1, size / 1000));

/** The time a message was written, when the settings show it (Preferences.timestamps). */
function Stamp({ at }: { at: number }) {
  const shown = useSessions((s) => s.preferences.timestamps);
  return shown ? <time className="cp-feed__time" dateTime={new Date(at).toISOString()}>{formatClock(at)}</time> : null;
}

/** A sent message, the sessions it names with "@" in color as in the field. */
function Mentioned({ text }: { text: string }) {
  const sessions = useSessions((s) => s.sessions);
  const marks = useMemo(() => findMentions(text, Object.values(sessions).map((session) => session.name)), [text, sessions]);
  if (!marks.length) return text;
  return (
    <>
      {marks.map((mark, index) => (
        <Fragment key={mark.start}>
          {text.slice(index ? marks[index - 1].end : 0, mark.start)}
          <span className="cp-mention"><span className="cp-at">@</span>{text.slice(mark.start + 1, mark.end)}</span>
        </Fragment>
      ))}
      {text.slice(marks.at(-1)!.end)}
    </>
  );
}

function Item({ item, sessionId, speaker, openAgent, onView }: { item: ThreadEntry; sessionId: string; speaker: string; openAgent: (agentId: string) => void; onView: (image: Viewed) => void }) {
  const turnDuration = useSessions((s) => s.preferences.turnDuration);
  switch (item.kind) {
    case 'tools':
      return <Tools run={item} />;
    case 'user':
      return (
        <li className="cp-feed__item" data-kind="user">
          <span className="cp-feed__who">{t.session.feed.you}<Stamp at={item.at} /></span>
          {item.images.length > 0 && (
            <div className="cp-feed__images">
              {item.images.map((name) => (
                <button key={name} type="button" title={t.session.feed.imageTitle} onClick={() => onView({ src: `/attachments/${name}`, alt: t.session.feed.imageAlt, kind: 'image' })}>
                  <img src={`/attachments/${name}`} alt={t.session.feed.imageAlt} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {item.files.length > 0 && (
            <div className="cp-feed__files">
              {item.files.map((file) => <span key={file.id} className="cp-file" title={file.name}><FileIcon />{file.name}<span className="cp-file__size">{bytes(file.size)}</span></span>)}
            </div>
          )}
          {item.text && <div className="cp-feed__text"><Mentioned text={item.text} /></div>}
        </li>
      );
    case 'assistant':
      return (
        <li className="cp-feed__item" data-kind="assistant">
          <span className="cp-feed__who">{item.author ?? speaker}<Stamp at={item.at} /></span>
          <Prose className="cp-feed__text" text={item.text} />
        </li>
      );
    case 'subagent':
      return (
        <li className="cp-feed__item" data-kind="subagent" data-status={item.status}>
          <button type="button" className="cp-feed__agent" onClick={() => openAgent(item.agentId)}>
            <AgentFace sessionId={sessionId} agent={item} />
            <span className="cp-feed__agent-name">{item.name}</span>
            <span className="cp-feed__agent-task">{item.task}</span>
            <span className="cp-feed__agent-status">{t.session.feed.subagentStatus[item.status]}</span>
          </button>
          {item.report && (
            <details className="cp-fold">
              <summary className="cp-fold__summary">{t.session.feed.report}</summary>
              <Prose className="cp-feed__text" text={item.report} />
            </details>
          )}
        </li>
      );
    case 'permission':
      return (
        <li className="cp-feed__item" data-kind="permission" data-status={item.status}>
          <code>{item.author ? `${item.author} · ` : ''}{item.question ? t.session.feed.question : item.tool}</code>
          <span className="cp-feed__detail">{item.detail}</span>
          <span className="cp-feed__flag">{(item.question ? t.session.feed.questionStatus : t.session.feed.permissionStatus)[item.status]}</span>
        </li>
      );
    case 'peer':
      return <PeerMessage item={item} speaker={speaker} />;
    case 'turn':
      return turnDuration ? <li className="cp-feed__item" data-kind="turn">{turnLine(item)}</li> : null;
    case 'notice':
      return <li className="cp-feed__item" data-kind="notice">{item.text}</li>;
    case 'branch':
      return <BranchNewsItem item={item} sessionId={sessionId} speaker={speaker} />;
    case 'files':
      return (
        <li className="cp-feed__item" data-kind="files">
          <span className="cp-feed__who">{item.author ?? speaker}</span>
          {item.caption && <p className="cp-feed__caption">{item.caption}</p>}
          <div className="cp-feed__files">{item.files.map((file) => <SentFileView key={`${file.title}:${file.stored ?? ''}`} file={file} caption={item.caption} onView={onView} />)}</div>
        </li>
      );
    case 'artifact':
      return <ArtifactCard item={item} speaker={speaker} onView={onView} />;
    case 'shell': {
      const words = t.session.feed.shell;
      const status = !item.done ? words.running : item.code === null ? (item.byUser ? words.stoppedByUser : words.stopped) : item.code === 0 ? formatDuration(item.ms) : words.exit(item.code);
      return (
        <li className="cp-feed__item" data-kind="shell" data-status={!item.done ? 'running' : item.code === 0 ? 'ok' : 'failed'}>
          <p className="cp-shell__command">
            <span className="cp-shell__prompt" aria-hidden="true">!</span><code>{item.command}</code><span className="cp-shell__status">{status}</span>
            {!item.done && (
              <button type="button" className="cp-icon-button cp-shell__stop" aria-label={words.stop} title={words.stop} onClick={() => useSessions.getState().send({ t: 'stopShell', sessionId, shellId: item.shellId })}><PauseIcon /></button>
            )}
          </p>
          {item.done && <pre className="cp-shell__output">{item.output || words.empty}</pre>}
          {item.done && <p className="cp-shell__note">{words.note}</p>}
        </li>
      );
    }
  }
}

/** A message another session sent this one: the sender's face when they are of the crew, and who it went to. */
function PeerMessage({ item, speaker }: { item: FeedItem & { kind: 'peer' }; speaker: string }) {
  const member = useSessions((s) => s.crew.find((candidate) => candidate.name === item.from));
  // a sub-agent telling how far it got: folded, the user unfolds it if they want to read it
  if (item.subagent) {
    return (
      <li className="cp-feed__item" data-kind="peer" data-subagent="true">
        <details className="cp-fold">
          <summary className="cp-fold__summary">{t.session.feed.subagentMessage(item.subagent.name)}<span className="cp-fold__preview">{item.text.split('\n')[0]}</span></summary>
          <Prose className="cp-feed__text" text={item.text} />
        </details>
      </li>
    );
  }
  return (
    <li className="cp-feed__item" data-kind="peer">
      <span className="cp-feed__peer">
        {member ? <img src={chibiHead(member.look ?? DEFAULT_LOOK)} alt="" /> : <PeerIcon />}
        {item.from}<SendIcon /><span className="cp-feed__peer-to">{speaker}</span>
      </span>
      <Prose className="cp-feed__text" text={item.text} />
    </li>
  );
}

/** What the pill counts as new while the user reads higher up: what was said or asked, not the tool calls. */
const UNREAD_KINDS: ReadonlySet<ThreadEntry['kind']> = new Set(['assistant', 'peer', 'permission', 'subagent', 'notice', 'files', 'artifact', 'branch']);

/** "Brewed for 10 s · done 22:53": how long the turn took and when it ended, like Claude Code's own line. */
function turnLine(item: FeedItem & { kind: 'turn' }) {
  const words = t.session.feed;
  const duration = formatDuration(item.ms);
  const time = formatClock(item.at);
  if (item.stopped) return words.turnStopped(duration, time);
  return item.ok ? words.turnDone(turnWord(item.startId, words.turnWords).done, duration, time) : words.turnFailed(duration, time);
}

/** The end of a working session's thread: its word of the turn, how long it has been at it, and what it is doing. */
function Working({ items, speaker, sessionId }: { items: readonly FeedItem[]; speaker: string; sessionId: string }) {
  const now = useNow(1000);
  const words = t.session.feed;
  const compacting = useSessions((s) => s.sessions[sessionId]?.compacting);
  if (compacting) {
    return (
      <li className="cp-feed__item" data-kind="typing">
        <span className="cp-feed__who">{speaker}</span>
        <span className="cp-feed__compacting"><CompactIcon />{words.compacting[compacting]}</span>
      </li>
    );
  }
  const turn = currentTurn(items);
  const phase = turnPhase(items);
  const doing = phase === 'thinking' ? words.phases.thinking : phase.tool;
  return (
    <li className="cp-feed__item" data-kind="typing">
      <span className="cp-feed__who">{speaker}</span>
      <span className="cp-feed__working">
        <span className="cp-feed__typing" role="img" aria-label={words.thinking(speaker)}><span /><span /><span /></span>
        {turn && <span className="cp-feed__working-text">{words.working(turnWord(turn.startId, words.turnWords).doing, formatDuration(now - turn.at), doing)}</span>}
      </span>
    </li>
  );
}

/**
 * The thread, in tabs: the conversation (the user, the session's own agent, every question and permission, one line
 * per sub-agent), then one tab per sub-agent with what it said and did. It sticks to the bottom while the user has not
 * scrolled up.
 */
/**
 * `working`: the session is at it, so its thread ends on a typing indicator until something arrives. `drafts`: the
 * messages still being written, by who writes them ("chef" or a sub-agent id), shown as they grow.
 */
export function Feed({ feed, sessionId, loading, speaker, working, drafts, agent, setAgent }: {
  feed: FeedData; sessionId: string; loading: boolean; speaker: string; working: boolean; drafts: Readonly<Record<string, string>>;
  agent: string | null; setAgent: (agentId: string | null) => void;
}) {
  // a picture, a page, a video or a text of the thread opened in large
  const [viewing, setViewing] = useState<Viewed | null>(null);
  const agents = useMemo(() => feed.items.filter((item): item is Subagent => item.kind === 'subagent'), [feed.items]);
  // the tabs: those at work, and one done while it is open; the others wait in the menu
  const finished = agents.filter((item) => item.status !== 'working');
  const tabs = agents.filter((item) => item.status === 'working' || item.agentId === agent);
  const shownAgent = agents.find((candidate) => candidate.agentId === agent);
  const entries = useMemo(() => threadOf(feed.items, shownAgent ? shownAgent.agentId : null), [feed.items, shownAgent]);
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  /** the user's last message, once the thread went down for it */
  const sentSeen = useRef<number | null>(null);
  const searching = useSessions((s) => s.searchOpen && s.selectedId === sessionId);
  const searchSeed = useSessions((s) => s.searchSeed);
  const draft = drafts[shownAgent ? shownAgent.agentId : 'chef'];
  // a message of the user's own brings the thread back down, like Claude Code
  const lastEntry = entries.at(-1);
  if (lastEntry?.kind === 'user' && lastEntry.id !== sentSeen.current) { sentSeen.current = lastEntry.id; stuck.current = true; }
  useEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [entries.length, agent, working]);
  // the window resized (another view tiles the sessions differently): a thread at the bottom stays there
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => { if (stuck.current) el.scrollTop = el.scrollHeight; });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // scrolled up: how many entries the thread had then; what came since shows in a pill that brings the user down
  const [awayFrom, setAwayFrom] = useState<number | null>(null);
  // a message starts being written: the thread stops following, so it reads at the user's pace as it grows (the
  // user going back down, or sending, follows again); the pill counts what comes after it
  const writing = !!draft;
  const count = useRef(entries.length);
  count.current = entries.length;
  useEffect(() => {
    if (!writing || !stuck.current) return;
    stuck.current = false;
    setAwayFrom(count.current + 1);
  }, [writing]);
  useEffect(() => { setAwayFrom(null); stuck.current = true; }, [agent]);
  const unread = awayFrom === null || stuck.current ? 0 : entries.slice(awayFrom).filter((entry) => UNREAD_KINDS.has(entry.kind)).length;
  // only the user's own scrolling counts: the thread's height changing (a message replacing its draft) scrolls it too
  const gesture = useRef(0);
  const onGesture = () => { gesture.current = Date.now(); };
  const onScroll = (el: HTMLDivElement) => {
    if (Date.now() - gesture.current > 1000) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (stuck.current) setAwayFrom(null);
    else if (awayFrom === null) setAwayFrom(entries.length);
  };
  const toBottom = () => {
    stuck.current = true;
    setAwayFrom(null);
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <div className="cp-thread">
      {searching && <FeedSearch key={searchSeed} thread={scroller} version={entries} />}
      {agents.length > 0 && (
        <div className="cp-thread__bar">
          <div className="cp-thread__tabs" role="tablist" aria-label={t.session.feed.tabs}>
            <button type="button" role="tab" aria-selected={!shownAgent} onClick={() => setAgent(null)}>{t.session.feed.conversation}</button>
            {tabs.map((item) => (
              <button key={item.agentId} type="button" role="tab" aria-selected={shownAgent === item} onClick={() => setAgent(item.agentId)}>
                <AgentFace sessionId={sessionId} agent={item} />{item.name}
              </button>
            ))}
          </div>
          {finished.length > 0 && <FinishedAgents sessionId={sessionId} agents={finished} shown={agent} onOpen={setAgent} />}
        </div>
      )}
      <div className="cp-feed" ref={scroller} onClick={(e) => copyCodeOnClick(e.target)} onScroll={(e) => onScroll(e.currentTarget)} onWheel={onGesture} onTouchMove={onGesture} onKeyDown={onGesture} onPointerDown={onGesture} tabIndex={0} role="region" aria-label={t.session.feed.region}>
        {loading ? <p className="cp-muted">{t.session.feed.loading}</p> : entries.length === 0 && !shownAgent ? <p className="cp-muted">{t.session.feed.empty}</p> : (
          <ul>
            {shownAgent && (
              <li className="cp-feed__item" data-kind="brief"><span className="cp-feed__who">{t.session.feed.mission}</span><p>{shownAgent.task}</p></li>
            )}
            {/* the last 300 entries, all of them while searching so nothing escapes the search */}
            {(searching ? entries : entries.slice(-300)).map((item) => <Item key={item.id} item={item} sessionId={sessionId} speaker={speaker} openAgent={setAgent} onView={setViewing} />)}
            {draft ? (
              <li className="cp-feed__item" data-kind="assistant" data-draft="true">
                <span className="cp-feed__who">{shownAgent ? shownAgent.name : speaker}</span>
                <Prose className="cp-feed__text" text={draft} />
              </li>
            ) : working && !shownAgent && <Working items={feed.items} speaker={speaker} sessionId={sessionId} />}
            {!shownAgent && !draft && <BranchCardView sessionId={sessionId} />}
            {shownAgent?.report && (
              <li className="cp-feed__item" data-kind="assistant">
                <span className="cp-feed__who">{t.session.feed.report}</span>
                <Prose className="cp-feed__text" text={shownAgent.report} />
              </li>
            )}
          </ul>
        )}
      </div>
      {viewing && <Viewer viewed={viewing} onClose={() => setViewing(null)} />}
      {unread > 0 && (
        <button type="button" className="cp-thread__unread" onClick={toBottom}>
          {t.session.feed.unread(unread)}<ChevronDownIcon />
        </button>
      )}
    </div>
  );
}
