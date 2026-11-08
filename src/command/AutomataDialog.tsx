import { useEffect, useMemo, useState } from 'react';
import { automatonPersonId, roleLabel, type AutomatonRun } from '../../shared/automata.ts';
import { t } from '../i18n/index.ts';
import { formatDuration, homeRelative } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { allRuns, childrenOf, roleOf, taskOf } from '../state/automata.ts';
import { buildFeed } from '../state/feed.ts';
import { useSessions } from '../state/sessions.ts';
import { Feed } from './Feed.tsx';
import { AutomatonIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

export function AutomataDialog() {
  const open = useSessions((s) => s.automataOpen);
  return open ? <Automata /> : null;
}

/** A run's role, as people read it. */
const roleName = (run: AutomatonRun) => roleLabel(run.role || run.id);

/**
 * The automatons, read only: the runs of the user's orchestrator at work and the last ended ones, and for the one
 * picked its role (from the catalogue), its task, the runs it started and its thread, read from its transcript. Nothing
 * here drives them: no field, no action.
 */
function Automata() {
  const state = useSessions((s) => s.automata);
  const picked = useSessions((s) => s.automatonId);
  const folder = useSessions((s) => s.preferences.automataFolder);
  const openAutomata = useSessions((s) => s.openAutomata);
  const words = t.automata;
  const runs = allRuns(state);
  const run = runs.find((candidate) => candidate.id === picked) ?? state.running[0] ?? state.recent[0] ?? null;
  // opened without a run: the first one is shown, its thread asked for
  useEffect(() => { if (run && run.id !== picked) openAutomata(true, run.id); }, [run, picked, openAutomata]);

  return (
    <Modal title={words.title} onClose={() => openAutomata(false)} wide>
      <p className="cp-automata__note">{words.readOnly}</p>
      {state.folder !== 'ok' ? (
        <p className="cp-empty-state">{state.folder === 'off' ? words.off : words.missing(homeRelative(folder))}</p>
      ) : (
        <div className="cp-automata">
          <nav className="cp-automata__runs" aria-label={words.title}>
            <h3>{words.running}</h3>
            {state.running.length ? <RunList runs={state.running} current={run?.id ?? null} /> : <p className="cp-muted">{words.noneRunning}</p>}
            <h3>{words.recent}</h3>
            {state.recent.length ? <RunList runs={state.recent} current={run?.id ?? null} /> : <p className="cp-muted">{words.none}</p>}
          </nav>
          {run ? <RunDetail key={run.id} run={run} /> : <p className="cp-muted">{words.pick}</p>}
        </div>
      )}
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={() => openAutomata(false)}>{t.settings.close}</button>
      </div>
    </Modal>
  );
}

function RunList({ runs, current }: { runs: readonly AutomatonRun[]; current: string | null }) {
  const state = useSessions((s) => s.automata);
  const openAutomata = useSessions((s) => s.openAutomata);
  const now = useNow(30_000);
  return (
    <ul>
      {runs.map((run) => (
        <li key={run.id}>
          <button type="button" className="cp-automata__run" aria-current={run.id === current || undefined} data-status={run.status} onClick={() => openAutomata(true, run.id)}>
            <span className="cp-automata__run-role"><AutomatonIcon />{roleName(run)}</span>
            <span className="cp-automata__run-task">{taskOf(state, run)?.title || run.task || run.project || run.id}</span>
            <span className="cp-automata__run-when">
              {t.automata.status[run.status]} · {formatDuration(now - (run.endedAt ?? run.startedAt))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RunDetail({ run }: { run: AutomatonRun }) {
  const state = useSessions((s) => s.automata);
  const log = useSessions((s) => s.automatonLogs[run.id]);
  const openAutomata = useSessions((s) => s.openAutomata);
  const [agent, setAgent] = useState<string | null>(null);
  const now = useNow(10_000);
  const words = t.automata;
  const role = roleOf(state, run.role);
  const task = taskOf(state, run);
  const helpers = childrenOf(state, run.id);
  const parent = run.parent ? allRuns(state).find((candidate) => candidate.id === run.parent) : undefined;
  const feed = useMemo(() => buildFeed(log?.events ?? []), [log]);
  const subagents = feed.items.filter((item) => item.kind === 'subagent');
  // a sub-agent is named after its role (server/automata.ts): the catalogue says what it is for
  const agentName = subagents.find((item) => item.agentId === agent)?.name;
  const agentRole = agentName ? state.roles.find((candidate) => roleLabel(candidate.name) === agentName) : undefined;
  const running = run.status === 'running';
  const hasTranscript = /^[0-9a-f-]{36}$/.test(run.sessionId) && run.cwd !== '';

  return (
    <section className="cp-automata__detail" aria-label={roleName(run)}>
      <header className="cp-automata__head">
        <h3><AutomatonIcon />{roleName(run)}</h3>
        <span className="cp-automata__status" data-status={run.status}>{words.status[run.status]}</span>
        <span className="cp-muted">{running ? words.started(formatDuration(now - run.startedAt)) : run.endedAt ? words.lasted(formatDuration(run.endedAt - run.startedAt)) : ''}</span>
      </header>
      <dl className="cp-automata__facts">
        <dt>{words.role}</dt>
        <dd>
          {role?.description || words.noRole}
          {role && (role.model || role.tools || role.authority) && (
            <span className="cp-automata__meta">{[role.model && words.model(role.model), role.tools && words.tools(role.tools), role.authority && words.authority(role.authority)].filter(Boolean).join(' · ')}</span>
          )}
        </dd>
        <dt>{words.task}</dt>
        <dd>
          {task ? <>{task.title || task.id} <span className="cp-automata__task-status" data-status={task.status}>{words.taskStatus[task.status]}</span></> : run.task || words.noTask}
          {(run.project || task?.ceiling) && (
            <span className="cp-automata__meta">{[run.project && words.project(run.project), task?.ceiling && words.ceiling(task.ceiling)].filter(Boolean).join(' · ')}</span>
          )}
        </dd>
        {parent && (
          <>
            <dt />
            <dd><button type="button" className="cp-link" onClick={() => openAutomata(true, parent.id)}>{words.parent(roleName(parent))}</button></dd>
          </>
        )}
        {helpers.length > 0 && (
          <>
            <dt>{words.helpers}</dt>
            <dd className="cp-automata__helpers">
              {helpers.map((helper) => (
                <button key={helper.id} type="button" className="cp-automata__chip" data-status={helper.status} onClick={() => openAutomata(true, helper.id)}>
                  {roleName(helper)} · {words.status[helper.status]}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>
      {log?.truncated && <p className="cp-automata__note">{words.truncated}</p>}
      {subagents.length > 0 && (
        <div className="cp-automata__tabs" role="tablist" aria-label={words.subagents}>
          <button type="button" role="tab" aria-selected={agent === null} onClick={() => setAgent(null)}>{words.conversation}</button>
          {subagents.map((item) => (
            <button key={item.agentId} type="button" role="tab" aria-selected={agent === item.agentId} data-status={item.status} title={item.task} onClick={() => setAgent(item.agentId)}>
              {item.name} · {item.task}
            </button>
          ))}
        </div>
      )}
      {agentRole?.description && <p className="cp-automata__note">{agentRole.description}</p>}
      <div className="cp-automata__thread">
        {hasTranscript ? (
          <Feed feed={feed} sessionId={automatonPersonId(run.id)} loading={!log} speaker={roleName(run)} working={running} drafts={{}} agent={agent} setAgent={setAgent} />
        ) : <p className="cp-muted">{words.noTranscript}</p>}
      </div>
    </section>
  );
}
