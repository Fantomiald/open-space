// The session panel's own views of what its Claude Code knows, opened by /mcp, /context and /usage: Claude Code only
// answers them with a line of text in -p (or not at all for /mcp), so Open Space asks it directly (server/inspect.ts).
import { useEffect, useRef, useState } from 'react';
import type { ContextCategory, ContextUsage, McpAction, McpServer, McpState, UsageLimit, UsageReport, UsageShare } from '../../shared/protocol.ts';
import { locale, t } from '../i18n/index.ts';
import { formatDuration, homeRelative, resetLabel, usageLevel } from '../lib/format.ts';
import { contextLevel } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';
import { LineCounts } from './Changes.tsx';
import { AlertIcon } from './Icons.tsx';
import { PanelFrame } from './PanelFrame.tsx';

interface ViewProps { sessionId: string; onBack: () => void }

const tokens = (count: number) => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(count);
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
const percentOf = (part: number, whole: number) => new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: part / whole < 0.01 ? 1 : 0 }).format(share(part, whole));

/** The panel's answer for this session, asked again at the end of each of its turns, and how to ask for it at once. */
function useInspection<K extends 'mcp' | 'context' | 'usage'>(sessionId: string, view: K) {
  const answer = useSessions((s) => s.inspections[sessionId]?.[view]);
  const send = useSessions((s) => s.send);
  const turns = useSessions((s) => s.sessions[sessionId]?.turns);
  const refresh = () => send({ t: 'inspect', sessionId, view });
  const asked = useRef(turns);
  useEffect(() => {
    if (asked.current === turns) return;
    asked.current = turns;
    send({ t: 'inspect', sessionId, view });
  }, [turns, send, sessionId, view]);
  return { answer, refresh };
}

/* MCP */

/** In this order: what needs the user, what is on its way, what works, what is off. */
const MCP_ORDER: readonly McpState[] = ['failed', 'needs-auth', 'pending', 'connected', 'disabled'];
const MCP_GROUPS: readonly (readonly McpState[])[] = [['failed', 'needs-auth'], ['pending'], ['connected'], ['disabled']];
/** How often the view asks again while a server connects or waits for a sign-in, and for how long at most. */
const POLL_MS = 2000;
const POLL_FOR_MS = 120_000;

/** A server's name as the user knows it: a plugin's ("plugin:context7:context7") and claude.ai's ("claude.ai Gmail") without their prefix. */
function serverName(server: McpServer): { name: string; origin: string | null } {
  const plugin = /^plugin:([^:]+):(.+)$/.exec(server.name);
  if (plugin) return { name: plugin[2], origin: plugin[1] };
  const connector = /^claude\.ai (.+)$/.exec(server.name);
  return connector ? { name: connector[1], origin: null } : { name: server.name, origin: null };
}

export function McpView({ sessionId, cwd, onBack }: ViewProps & { cwd: string }) {
  const { answer: servers, refresh } = useInspection(sessionId, 'mcp');
  const send = useSessions((s) => s.send);
  const words = t.session.mcp;
  // the server an action was asked for, until the next answer; the servers a sign-in was opened for
  const [working, setWorking] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setWorking(null); }, [servers]);

  // asked again while a server is connecting or a sign-in is under way, for two minutes at most
  const waiting = !!servers?.some((server) => server.state === 'pending' || (signingIn.has(server.name) && server.state === 'needs-auth'));
  const since = useRef(0);
  useEffect(() => {
    if (!waiting) { since.current = 0; return; }
    since.current ||= Date.now();
    const timer = window.setInterval(() => { if (Date.now() - since.current < POLL_FOR_MS) send({ t: 'inspect', sessionId, view: 'mcp' }); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, send, sessionId]);

  const act = (server: McpServer, action: McpAction) => {
    if (!send({ t: 'mcpAction', sessionId, server: server.name, action })) return;
    setWorking(server.name);
    if (action === 'authenticate') setSigningIn((names) => new Set([...names, server.name]));
  };

  const sorted = [...(servers ?? [])].sort((a, b) => MCP_ORDER.indexOf(a.state) - MCP_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
  const count = (states: readonly McpState[]) => sorted.filter((server) => states.includes(server.state)).length;
  const summary = !servers ? words.asking : servers.length === 0 ? words.none
    : [words.servers(servers.length), count(['connected']) && words.connected(count(['connected'])), count(['failed', 'needs-auth']) && words.toFix(count(['failed', 'needs-auth']))].filter(Boolean).join(' · ');

  return (
    <PanelFrame label={words.label} summary={summary} onBack={onBack} onRefresh={refresh} refreshTitle={t.session.panel.askAgain}>
      {servers && servers.length === 0 && <p className="cp-muted">{words.empty}</p>}
      {MCP_GROUPS.map((states) => {
        const group = sorted.filter((server) => states.includes(server.state));
        if (!group.length) return null;
        return (
          <section key={states[0]} className="cp-mcp" aria-labelledby={`mcp-${states[0]}`}>
            <h3 id={`mcp-${states[0]}`} className="cp-panel-view__heading">{words.groups[states[0] as 'failed' | 'pending' | 'connected' | 'disabled']}</h3>
            <ul className="cp-mcp__list">
              {group.map((server) => {
                const { name, origin } = serverName(server);
                const busy = working === server.name;
                return (
                  <li key={server.name} className="cp-mcp__server" data-state={server.state} aria-busy={busy || undefined}>
                    <span className="cp-mcp__dot" aria-hidden="true" />
                    <div className="cp-mcp__about">
                      <p className="cp-mcp__name">{name}<span className="cp-sr-only">, {words.states[server.state]}</span></p>
                      <p className="cp-mcp__meta">
                        {[origin ? words.fromPlugin(origin) : words.sources[server.source], words.transport(server.transport), server.state === 'connected' ? words.tools(server.tools) : words.states[server.state]].filter(Boolean).join(' · ')}
                      </p>
                      {server.error && <p className="cp-mcp__error">{server.error}</p>}
                      {signingIn.has(server.name) && server.state === 'needs-auth' && <p className="cp-mcp__hint">{words.signingIn}</p>}
                    </div>
                    <div className="cp-mcp__actions">
                      {server.state === 'failed' && <button type="button" className="cp-button" data-size="small" disabled={busy} onClick={() => act(server, 'reconnect')}>{words.reconnect}</button>}
                      {/* once the sign-in page is open: claude.ai's connectors only connect when asked again */}
                      {server.state === 'needs-auth' && (signingIn.has(server.name)
                        ? <button type="button" className="cp-button" data-size="small" disabled={busy} onClick={() => act(server, 'reconnect')}>{words.check}</button>
                        : <button type="button" className="cp-button" data-size="small" disabled={busy} onClick={() => act(server, 'authenticate')}>{words.signIn}</button>)}
                      {server.state === 'disabled'
                        ? <button type="button" className="cp-button" data-size="small" disabled={busy} onClick={() => act(server, 'enable')}>{words.enable}</button>
                        : server.state !== 'pending' && <button type="button" className="cp-button" data-size="small" data-variant="quiet" disabled={busy} title={words.disableTitle} onClick={() => act(server, 'disable')}>{words.disable}</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {servers && servers.length > 0 && <p className="cp-panel-view__note">{words.note(homeRelative(cwd))}</p>}
    </PanelFrame>
  );
}

/* Context */

/**
 * How full the session's context is, in its header: a meter that turns orange then red with a "!", what to do in its
 * tooltip; a click opens the /context view.
 */
export function ContextChip({ context, onOpen }: { context: { used: number; max: number }; onOpen: () => void }) {
  const level = contextLevel(context);
  if (!level) return null;
  const words = t.session.context;
  const percent = Math.min(100, Math.round(share(context.used, context.max) * 100));
  return (
    <button type="button" className="cp-context-chip" data-level={level} title={words.advice[level]} onClick={onOpen}>
      {level === 'high' && <AlertIcon />}
      <progress className="cp-meter" data-level={level} value={percent} max={100} aria-hidden="true" />
      <span>{words.chip(t.common.percent(percent))}</span>
    </button>
  );
}

/** The colour of a category of the context, by its place among those that count (data-chart, see --chart-* in tokens.css). */
const chart = (index: number) => String((index % 8) + 1);
/** The window's bar is drawn on this many units, whatever its width on screen. */
const BAR = 1000;

export function ContextView({ sessionId, onBack }: ViewProps) {
  const { answer: usage, refresh } = useInspection(sessionId, 'context');
  const sendText = useSessions((s) => s.sendText);
  const words = t.session.context;
  const summary = !usage ? words.asking : words.summary(tokens(usage.used), tokens(usage.max), percentOf(usage.used, usage.max));
  const level = usage ? contextLevel({ used: usage.used, max: usage.max }) : null;
  // the commands that free the context, sent to the session, back to its conversation to see them work
  const run = (command: string) => { if (sendText(sessionId, command)) onBack(); };
  return (
    <PanelFrame label={words.label} summary={summary} onBack={onBack} onRefresh={refresh} refreshTitle={t.session.panel.askAgain}>
      {(level === 'rising' || level === 'high') && (
        <div className="cp-context__advice" data-level={level} role="note">
          <p>{words.advice[level]}</p>
          <div className="cp-context__actions">
            <button type="button" className="cp-button" data-size="small" title={words.compactTitle} onClick={() => run(words.compactCommand)}>{words.compact}</button>
            <button type="button" className="cp-button" data-size="small" data-variant="quiet" onClick={() => run('/clear')}>{words.clear}</button>
          </div>
        </div>
      )}
      {usage && <ContextBody usage={usage} />}
    </PanelFrame>
  );
}

function ContextBody({ usage }: { usage: ContextUsage }) {
  const words = t.session.context;
  const counted = usage.categories.filter((category) => category.kind === 'used' && category.tokens > 0);
  const deferred = usage.categories.filter((category) => category.kind === 'deferred' && category.tokens > 0);
  const buffer = usage.categories.find((category) => category.kind === 'buffer');
  const label = (category: ContextCategory) => (words.categories as Readonly<Record<string, string | undefined>>)[category.name] ?? category.name;
  return (
    <>
      {/* the whole window, to scale: what fills it from the left, the room kept for the automatic summary at its end */}
      <svg className="cp-context__window" viewBox={`0 0 ${BAR} 10`} preserveAspectRatio="none" role="img" aria-label={words.windowLabel(percentOf(usage.used, usage.max))}>
        {counted.map((category, index) => {
          const before = counted.slice(0, index).reduce((sum, previous) => sum + previous.tokens, 0);
          // at least a sliver, so a small category still shows
          return <rect key={category.name} data-chart={chart(index)} x={share(before, usage.max) * BAR} y={0} width={Math.max(2, share(category.tokens, usage.max) * BAR)} height={10} />;
        })}
        {buffer && buffer.tokens > 0 && <rect className="cp-context__buffer" x={(1 - share(buffer.tokens, usage.max)) * BAR} y={0} width={share(buffer.tokens, usage.max) * BAR} height={10} />}
      </svg>
      <table className="cp-context__table">
        <caption className="cp-sr-only">{words.label}</caption>
        <tbody>
          {counted.map((category, index) => (
            <tr key={category.name}>
              <th scope="row"><span className="cp-context__swatch" data-chart={chart(index)} aria-hidden="true" />{label(category)}</th>
              <td>{tokens(category.tokens)}</td>
              <td className="cp-muted">{percentOf(category.tokens, usage.max)}</td>
            </tr>
          ))}
          {buffer && buffer.tokens > 0 && (
            <tr className="cp-muted">
              <th scope="row"><span className="cp-context__swatch cp-context__buffer" aria-hidden="true" />{label(buffer)}</th>
              <td>{tokens(buffer.tokens)}</td>
              <td>{percentOf(buffer.tokens, usage.max)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {usage.autoCompactAt !== null && <p className="cp-panel-view__note">{words.autoCompact(tokens(usage.autoCompactAt))}</p>}
      {deferred.length > 0 && (
        <section aria-labelledby="context-deferred">
          <h3 id="context-deferred" className="cp-panel-view__heading">{words.deferred}</h3>
          <ul className="cp-context__plain">
            {deferred.map((category) => <li key={category.name}><span>{label(category)}</span><span>{tokens(category.tokens)}</span></li>)}
          </ul>
          <p className="cp-panel-view__note">{words.deferredNote}</p>
        </section>
      )}
      {usage.memoryFiles.length > 0 && (
        <section aria-labelledby="context-memory">
          <h3 id="context-memory" className="cp-panel-view__heading">{words.memory}</h3>
          <ul className="cp-context__plain">
            {usage.memoryFiles.map((file) => (
              <li key={file.path}><span className="cp-context__path" title={file.path}>{homeRelative(file.path)}</span><span>{tokens(file.tokens)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* Usage */

export function UsageView({ sessionId, onBack }: ViewProps) {
  const { answer: report, refresh } = useInspection(sessionId, 'usage');
  const words = t.session.usage;
  const summary = !report ? words.asking : report.plan ? words.plan(report.plan.charAt(0).toUpperCase() + report.plan.slice(1)) : words.noPlan;
  return (
    <PanelFrame label={words.label} summary={summary} onBack={onBack} onRefresh={refresh} refreshTitle={t.session.panel.askAgain}>
      {report && <UsageBody report={report} />}
    </PanelFrame>
  );
}

function UsageBody({ report }: { report: UsageReport }) {
  const words = t.session.usage;
  const now = new Date();
  const limitName = (limit: UsageLimit) => (limit.kind === 'weeklyModel' ? words.limits.weeklyModel(limit.model ?? '') : words.limits[limit.kind]);
  const money = new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const shares: readonly [string, readonly UsageShare[]][] = report.week
    ? [[words.skills, report.week.skills], [words.agents, report.week.agents], [words.mcpServers, report.week.mcpServers]] : [];
  return (
    <>
      {report.limits.length > 0 && (
        <ul className="cp-usage__limits">
          {report.limits.map((limit) => (
            <li key={`${limit.kind}${limit.model ?? ''}`}>
              <span className="cp-usage__name">{limitName(limit)}</span>
              <span className="cp-usage__percent">{t.common.percent(Math.round(limit.percent))}</span>
              <progress className="cp-meter" data-level={usageLevel(limit.percent / 100)} value={limit.percent} max={100} />
              <span className="cp-usage__reset">{limit.resetsAt ? t.common.quota.resetsAt(resetLabel(limit.resetsAt, now)) : t.common.quota.resetUnknown}</span>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="usage-session">
        <h3 id="usage-session" className="cp-panel-view__heading">{words.session}</h3>
        <dl className="cp-usage__facts">
          <div><dt>{words.cost}</dt><dd>{money.format(report.session.costUsd)}</dd></div>
          <div><dt>{words.duration}</dt><dd>{formatDuration(report.session.durationMs)}</dd></div>
          <div><dt>{words.apiTime}</dt><dd>{formatDuration(report.session.apiMs)}</dd></div>
          <div><dt>{words.lines}</dt><dd><LineCounts added={report.session.linesAdded} removed={report.session.linesRemoved} /></dd></div>
        </dl>
        {report.plan && <p className="cp-panel-view__note">{words.costNote}</p>}
      </section>
      {report.week && shares.some(([, items]) => items.length) && (
        <section aria-labelledby="usage-week">
          <h3 id="usage-week" className="cp-panel-view__heading">{words.week}</h3>
          <p className="cp-panel-view__note">{words.weekCounts(report.week.requests, report.week.sessions)}</p>
          <div className="cp-usage__shares">
            {shares.filter(([, items]) => items.length).map(([title, items]) => (
              <div key={title}>
                <h4>{title}</h4>
                <ul>
                  {items.map((item) => (
                    <li key={item.name}>
                      <span className="cp-usage__share-name" title={item.name}>{item.name}</span>
                      <progress className="cp-usage__share-bar" value={Math.max(2, item.percent)} max={100} aria-hidden="true" />
                      <span className="cp-usage__share-percent">{t.common.percent(item.percent)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="cp-panel-view__note">{words.weekNote}</p>
        </section>
      )}
    </>
  );
}
