import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { formatDuration } from '../lib/format.ts';
import { chibiHead } from '../room/chibi.ts';
import { PeerIcon, SendIcon } from './Icons.tsx';
import { Prose } from './Prose.tsx';
import { threadOf, toolSummary, type Feed as FeedData, type FeedItem, type ThreadEntry, type ToolRun } from '../state/feed.ts';
import { useSessions } from '../state/sessions.ts';
import { FeedSearch } from './FeedSearch.tsx';

/** Copies the code block whose copy button was clicked (see mdToHtml), and shows a tick for a moment. */
export function copyCodeOnClick(target: EventTarget | null) {
  const button = target instanceof Element ? target.closest<HTMLElement>('[data-copy]') : null;
  const code = button?.closest('.cp-code')?.querySelector('pre');
  if (!button || !code) return;
  void navigator.clipboard.writeText((code.textContent ?? '').replace(/\n$/, '')).then(() => {
    button.dataset.copied = 'true';
    window.setTimeout(() => { delete button.dataset.copied; }, 1500);
  }, () => { /* refused: nothing copied, the button stays as it is */ });
}

const PERMISSION_STATUS = { pending: 'en attente', allowed: 'autorisé', denied: 'refusé', cancelled: 'annulé' } as const;
const QUESTION_STATUS = { pending: 'en attente', allowed: 'répondu', denied: 'refusé', cancelled: 'annulé' } as const;
const SUBAGENT_STATUS = { working: 'au travail', done: 'terminé', failed: 'échec' } as const;

/** A run of tool calls as one line ("8 actions · Read ×3, Bash ×2"), opening on the calls themselves. */
function Tools({ run }: { run: ToolRun }) {
  const running = run.tools.find((tool) => tool.ok === null);
  const failed = run.tools.filter((tool) => tool.ok === false).length;
  return (
    <li className="cp-feed__item" data-kind="tools">
      <details>
        <summary>
          <span className="cp-feed__count">{run.tools.length === 1 ? '1 action' : `${run.tools.length} actions`}</span>
          <span className="cp-feed__detail">{running ? `en cours : ${running.tool} ${running.detail}` : toolSummary(run.tools)}</span>
          {failed > 0 && <span className="cp-feed__flag">{failed === 1 ? '1 échec' : `${failed} échecs`}</span>}
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
function Item({ item, speaker, openAgent }: { item: ThreadEntry; speaker: string; openAgent: (agentId: string) => void }) {
  switch (item.kind) {
    case 'tools':
      return <Tools run={item} />;
    case 'user':
      return (
        <li className="cp-feed__item" data-kind="user">
          <span className="cp-feed__who">Toi</span>
          {item.images.length > 0 && (
            <div className="cp-feed__images">
              {item.images.map((name) => (
                <a key={name} href={`/attachments/${name}`} target="_blank" rel="noopener noreferrer" title="Voir l’image en grand">
                  <img src={`/attachments/${name}`} alt="Jointe à ton message" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {item.text && <div className="cp-feed__text">{item.text}</div>}
        </li>
      );
    case 'assistant':
      return (
        <li className="cp-feed__item" data-kind="assistant">
          <span className="cp-feed__who">{item.author ?? speaker}</span>
          <Prose className="cp-feed__text" text={item.text} />
        </li>
      );
    case 'subagent':
      return (
        <li className="cp-feed__item" data-kind="subagent" data-status={item.status}>
          <button type="button" className="cp-feed__agent" onClick={() => openAgent(item.agentId)}>
            <span className="cp-feed__agent-dot" aria-hidden="true" />
            <span className="cp-feed__agent-name">{item.name}</span>
            <span className="cp-feed__agent-task">{item.task}</span>
            <span className="cp-feed__agent-status">{SUBAGENT_STATUS[item.status]}</span>
          </button>
        </li>
      );
    case 'permission':
      return (
        <li className="cp-feed__item" data-kind="permission" data-status={item.status}>
          <code>{item.author ? `${item.author} · ` : ''}{item.question ? 'Question' : item.tool}</code>
          <span className="cp-feed__detail">{item.detail}</span>
          <span className="cp-feed__flag">{(item.question ? QUESTION_STATUS : PERMISSION_STATUS)[item.status]}</span>
        </li>
      );
    case 'peer':
      return <PeerMessage item={item} speaker={speaker} />;
    case 'turn':
      return <li className="cp-feed__item" data-kind="turn">{item.stopped ? 'Tour interrompu' : item.ok ? 'Tour terminé' : 'Tour en échec'} · {formatDuration(item.ms)}</li>;
    case 'notice':
      return <li className="cp-feed__item" data-kind="notice">{item.text}</li>;
  }
}

/** A message another session sent this one: the sender's face when they are of the crew, and who it went to. */
function PeerMessage({ item, speaker }: { item: FeedItem & { kind: 'peer' }; speaker: string }) {
  const member = useSessions((s) => s.crew.find((candidate) => candidate.name === item.from));
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

/**
 * The thread, in tabs: the conversation (the user, the session's own agent, every question and permission, one line
 * per sub-agent), then one tab per sub-agent with what it said and did. It sticks to the bottom while the user has not
 * scrolled up.
 */
/**
 * `working`: the session is at it, so its thread ends on a typing indicator until something arrives. `drafts`: the
 * messages still being written, by who writes them ("chef" or a sub-agent id), shown as they grow.
 */
export function Feed({ feed, loading, speaker, working, drafts }: { feed: FeedData; loading: boolean; speaker: string; working: boolean; drafts: Readonly<Record<string, string>> }) {
  const [agent, setAgent] = useState<string | null>(null);
  const agents = useMemo(() => feed.items.filter((item): item is FeedItem & { kind: 'subagent' } => item.kind === 'subagent'), [feed.items]);
  const shownAgent = agents.find((candidate) => candidate.agentId === agent);
  const entries = useMemo(() => threadOf(feed.items, shownAgent ? shownAgent.agentId : null), [feed.items, shownAgent]);
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const searching = useSessions((s) => s.searchOpen);
  const draft = drafts[shownAgent ? shownAgent.agentId : 'chef'];
  useEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [entries.length, agent, working, draft]);
  return (
    <div className="cp-thread">
      {searching && <FeedSearch thread={scroller} version={entries} />}
      {agents.length > 0 && (
        <div className="cp-thread__tabs" role="tablist" aria-label="Fil">
          <button type="button" role="tab" aria-selected={!shownAgent} onClick={() => setAgent(null)}>Conversation</button>
          {agents.map((item) => (
            <button key={item.agentId} type="button" role="tab" aria-selected={shownAgent === item} data-status={item.status} onClick={() => setAgent(item.agentId)}>
              <span className="cp-feed__agent-dot" aria-hidden="true" />{item.name}
            </button>
          ))}
        </div>
      )}
      <div className="cp-feed" ref={scroller} onClick={(e) => copyCodeOnClick(e.target)} onScroll={(e) => { const el = e.currentTarget; stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} tabIndex={0} role="region" aria-label="Fil de la session">
        {loading ? <p className="cp-muted">Chargement…</p> : entries.length === 0 && !shownAgent ? <p className="cp-muted">Rien pour l'instant. Envoie un premier message.</p> : (
          <ul>
            {shownAgent && (
              <li className="cp-feed__item" data-kind="brief"><span className="cp-feed__who">Sa mission</span><p>{shownAgent.task}</p></li>
            )}
            {/* the last 300 entries, all of them while searching so nothing escapes the search */}
            {(searching ? entries : entries.slice(-300)).map((item) => <Item key={item.id} item={item} speaker={speaker} openAgent={setAgent} />)}
            {draft ? (
              <li className="cp-feed__item" data-kind="assistant" data-draft="true">
                <span className="cp-feed__who">{shownAgent ? shownAgent.name : speaker}</span>
                <Prose className="cp-feed__text" text={draft} />
              </li>
            ) : working && !shownAgent && (
              <li className="cp-feed__item" data-kind="typing" aria-live="polite">
                <span className="cp-feed__who">{speaker}</span>
                <span className="cp-feed__typing" role="img" aria-label={`${speaker} réfléchit`}><span /><span /><span /></span>
              </li>
            )}
            {shownAgent?.report && (
              <li className="cp-feed__item" data-kind="assistant">
                <span className="cp-feed__who">Son rapport</span>
                <Prose className="cp-feed__text" text={shownAgent.report} />
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
