import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import { type PanelView, useSessions } from '../state/sessions.ts';
import { AgentFace, type Subagent } from './Feed.tsx';
import { AgentIcon, ChevronDownIcon, FolderIcon, GlobeIcon, MessageIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';

/** Long enough to cross the gap between the button and its menu without it closing. */
const LEAVE_DELAY_MS = 200;

/**
 * The views of a session's window, in tabs: its conversation, its files, its browser; then its sub-agents behind one
 * button, with how many are at work, whose menu opens on hover (a click on a touch screen) and opens one's thread.
 */
export function SessionTabs({ sessionId, view, driving, agents, agent, setAgent }: { sessionId: string; view: PanelView; driving: boolean; agents: readonly Subagent[]; agent: string | null; setAgent: (agentId: string | null) => void }) {
  const showPanel = useSessions((s) => s.showPanel);
  const browserAvailable = useSessions((s) => s.browserAvailable);
  const words = t.session.feed;
  const shownAgent = view === 'thread' ? agents.find((each) => each.agentId === agent) : undefined;
  const show = (target: PanelView) => { setAgent(null); showPanel(target); };
  return (
    <div className="cp-tabs">
      <div className="cp-tabs__list" role="tablist" aria-label={words.tabs}>
        <button type="button" role="tab" aria-selected={view === 'thread' && !shownAgent} aria-label={words.conversation} title={words.conversation} onClick={() => show('thread')}><MessageIcon /><span>{words.conversation}</span></button>
        <button type="button" role="tab" aria-selected={view === 'files'} aria-label={words.filesTab} title={words.filesTab} onClick={() => show('files')}><FolderIcon /><span>{words.filesTab}</span></button>
        {browserAvailable && <button type="button" role="tab" aria-selected={view === 'browser'} data-live={driving} aria-label={words.browserTab} title={driving ? words.browserLive : words.browserTab} onClick={() => show('browser')}><GlobeIcon /><span>{words.browserTab}</span></button>}
      </div>
      {agents.length > 0 && <AgentsMenu sessionId={sessionId} agents={agents} shown={shownAgent} onOpen={(agentId) => { showPanel('thread'); setAgent(agentId); }} />}
    </div>
  );
}

/** The sub-agents behind one button: those at work first, then the others, the last one first. */
function AgentsMenu({ sessionId, agents, shown, onOpen }: { sessionId: string; agents: readonly Subagent[]; shown: Subagent | undefined; onOpen: (agentId: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** what pressed the button: a mouse already opened the menu by passing over it */
  const pressedWith = useRef('');
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  useMenuBelow(open, box, menu);
  useEffect(() => () => clearTimeout(leaving.current), []);
  const working = agents.filter((each) => each.status === 'working');
  const listed = [...working, ...agents.filter((each) => each.status !== 'working').reverse()];
  const words = t.session.feed;
  // a mouse opens it by passing over it; a finger or a pen by a tap
  const hover = (entering: boolean, pointer: string) => {
    if (pointer !== 'mouse') return;
    clearTimeout(leaving.current);
    if (entering) setOpen(true);
    else leaving.current = setTimeout(close, LEAVE_DELAY_MS);
  };
  return (
    <div className="cp-tabs__agents" ref={box} onPointerEnter={(e) => hover(true, e.pointerType)} onPointerLeave={(e) => hover(false, e.pointerType)}>
      <button
        type="button" aria-expanded={open} aria-haspopup="menu" data-current={!!shown} aria-label={shown ? undefined : words.agents} title={words.agentsTitle(working.length, agents.length)}
        onPointerDown={(e) => { pressedWith.current = e.pointerType; }}
        onClick={() => { setOpen(pressedWith.current === 'mouse' || !open); pressedWith.current = ''; }}
      >
        {shown ? <><AgentFace sessionId={sessionId} agent={shown} /><span>{shown.name}</span></> : <AgentIcon />}
        {working.length > 0 && <span className="cp-tabs__count" aria-hidden="true">{working.length}</span>}
        <ChevronDownIcon />
      </button>
      {open && (
        <ul ref={menu} className="cp-detail__menu cp-tabs__menu" popover="manual" aria-label={words.agentsList}>
          {listed.map((each) => (
            <li key={each.agentId}>
              <button type="button" aria-current={shown?.agentId === each.agentId} onClick={() => { onOpen(each.agentId); close(); }}>
                <AgentFace sessionId={sessionId} agent={each} />
                <span className="cp-feed__agent-name">{each.name}</span>
                <span className="cp-feed__agent-task">{each.task}</span>
                <span className="cp-feed__agent-status">{words.subagentStatus[each.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
