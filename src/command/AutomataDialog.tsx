import { useEffect, useMemo, useRef, useState } from 'react';
import { automatonPersonId, roleLabel, type AutomatonRun } from '../../shared/automata.ts';
import { PERMISSION_MODES, type PermissionMode } from '../../shared/protocol.ts';
import { ALLOW_PRESETS, DEFAULT_TRIGGER, hookUrl, inputOf, lastRuns, parseTriggerInput, type AllowPreset, type Trigger, type TriggerInput } from '../../shared/triggers.ts';
import { t } from '../i18n/index.ts';
import { formatAgo, formatClock, formatDuration, homeRelative } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { allRuns, roleOf } from '../state/automata.ts';
import { buildFeed } from '../state/feed.ts';
import { modeLabel, models } from '../state/labels.ts';
import { isWorking } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { claudeMcpCommand, externalMcpConfig, folderChoices, nextStart, runsOf } from '../state/triggers.ts';
import { Copyable } from './Copyable.tsx';
import { ConnectionsPage } from './ConnectionsPage.tsx';
import { Feed } from './Feed.tsx';
import {
  AutomatonIcon, BrandIcon, ClockIcon, FileCodeIcon, FolderIcon, KeyIcon, LinkIcon, MessageIcon, PauseIcon, PhoneIcon, PlanIcon, PlayIcon, PlusIcon,
  PowerIcon, RemoveIcon, RulesIcon, SparklesIcon, StopIcon, TagIcon, TuneIcon, WebhookIcon,
} from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { PageHead } from './PageHead.tsx';
import { TriggerKeys } from './SecretPrompt.tsx';
import { Row } from './PrefsRow.tsx';
import { SaveNote } from './SaveNote.tsx';
import { ScheduleField } from './ScheduleField.tsx';
import { Switch } from './Switch.tsx';
import { useAutosave } from './useAutosave.ts';

/** What the panel shows: a trigger (null: a new one), the external runs, the chat apps, or the external access. */
type Page = { trigger: string | null } | 'runs' | 'connections' | 'access';

export function AutomataDialog() {
  const open = useSessions((s) => s.automataOpen);
  return open ? <Automata /> : null;
}

const KindIcon = ({ trigger }: { trigger: Pick<Trigger, 'kind'> }) => (trigger.kind === 'webhook' ? <WebhookIcon /> : <ClockIcon />);

/**
 * The Automates panel, laid out like the settings: the triggers down the side (made, changed, started here), then the
 * external runs other programs start (read only, when their folder is set) and the open-space MCP access.
 */
function Automata() {
  const openAutomata = useSessions((s) => s.openAutomata);
  const picked = useSessions((s) => s.automatonId);
  const state = useSessions((s) => s.triggers);
  const external = useSessions((s) => s.preferences.automataFolder !== '' || s.automata.running.length + s.automata.recent.length > 0);
  // a robot of an external run clicked in the room opens on its run
  const fresh = useSessions((s) => s.automataFresh);
  const [page, setPage] = useState<Page>(() => (picked ? 'runs' : { trigger: fresh ? null : state.triggers[0]?.id ?? null }));
  const words = t.automata;
  const close = () => openAutomata(false);
  const last = useMemo(() => lastRuns(state.runs), [state.runs]);
  const shown = typeof page === 'string' ? undefined : page.trigger;
  const trigger = shown ? state.triggers.find((each) => each.id === shown) ?? null : null;

  // a trigger just made shows once the server tells it; one removed gives way to the first left
  const known = useRef(new Set(state.triggers.map((each) => each.id)));
  useEffect(() => {
    const added = state.triggers.find((each) => !known.current.has(each.id));
    known.current = new Set(state.triggers.map((each) => each.id));
    if (added) setPage({ trigger: added.id });
    else if (shown && !state.triggers.some((each) => each.id === shown)) setPage({ trigger: state.triggers[0]?.id ?? null });
  }, [state.triggers, shown]);

  return (
    <Modal title={words.title} onClose={close} look="panel">
      <div className="cp-prefs cp-team">
        <aside className="cp-prefs__side">
          <div className="cp-prefs__brand"><AutomatonIcon /><span>{words.title}</span></div>
          <button type="button" className="cp-button cp-team__add" aria-pressed={shown === null} onClick={() => setPage({ trigger: null })}>
            <PlusIcon /><span className="cp-team__label">{words.triggers.add}</span>
          </button>
          <nav className="cp-prefs__menu cp-automata__menu" aria-label={words.tabs.triggers}>
            {state.triggers.map((each) => {
              const run = last.get(each.id);
              return (
                <button key={each.id} type="button" aria-current={shown === each.id ? 'page' : undefined} data-off={!each.enabled || undefined} onClick={() => setPage({ trigger: each.id })}>
                  <KindIcon trigger={each} />
                  <span>{each.name}</span>
                  {!each.enabled
                    ? <small className="cp-automata__flag">{words.triggers.off}</small>
                    : run && <span className="cp-automata__dot" data-outcome={run.outcome} title={words.triggers.outcome[run.outcome]} />}
                </button>
              );
            })}
          </nav>
          <nav className="cp-prefs__menu cp-team__pet" aria-label={words.title}>
            {external && <button type="button" aria-current={page === 'runs' ? 'page' : undefined} onClick={() => setPage('runs')}><AutomatonIcon /><span>{words.tabs.runs}</span></button>}
            <button type="button" aria-current={page === 'connections' ? 'page' : undefined} onClick={() => setPage('connections')}><MessageIcon /><span>{words.tabs.connections}</span></button>
            <button type="button" aria-current={page === 'access' ? 'page' : undefined} onClick={() => setPage('access')}><KeyIcon /><span>{words.tabs.access}</span></button>
          </nav>
        </aside>
        <div className="cp-prefs__main">
          {page === 'runs' ? <RunsPage close={close} />
            : page === 'connections' ? <ConnectionsPage close={close} />
            : page === 'access' ? <AccessPage close={close} />
            : <TriggerPage key={trigger?.id ?? 'new'} trigger={trigger} close={close} />}
        </div>
      </div>
    </Modal>
  );
}

/** A trigger's page (a new one when `trigger` is null): what it does, when, how it works, and its last runs. A trigger saves itself as it changes; a new one is made by its button. */
function TriggerPage({ trigger, close }: { trigger: Trigger | null; close: () => void }) {
  const sessions = useSessions((s) => s.sessions);
  const roots = useSessions((s) => s.roots);
  const defaults = useSessions((s) => s.preferences);
  const triggers = useSessions((s) => s.triggers);
  const serverError = useSessions((s) => s.triggerError);
  const agentRoles = useSessions((s) => s.agentRoles);
  const { saveTrigger, deleteTrigger, runTrigger, cancelTriggerRun, askAgentRoles, show, openAutomata, send: sendMessage } = useSessions.getState();
  const [draft, setDraft] = useState<TriggerInput>(() => trigger ? inputOf(trigger) : { ...DEFAULT_TRIGGER, cwd: defaults.defaultFolder || roots[0] || '', model: defaults.model, permissionMode: defaults.permissionMode });
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testBody, setTestBody] = useState(t.automata.triggers.testBodyDefault);
  // typed as is (a line being written stays), sent as the list of its rules
  const [rulesText, setRulesText] = useState(draft.allowedTools.join('\n'));
  const now = useNow(30_000);
  const words = t.automata.triggers;
  const fields = words.fields;
  const change = (next: Partial<TriggerInput>) => { setDraft((before) => ({ ...before, ...next })); setProblem(null); };
  const folders = useMemo(() => folderChoices(Object.values(sessions), roots), [sessions, roots]);
  // the roles of the folder, asked again when it changes (a little after typing stops)
  useEffect(() => {
    if (!draft.cwd.trim()) return;
    const timer = setTimeout(() => askAgentRoles(draft.cwd.trim()), 400);
    return () => clearTimeout(timer);
  }, [draft.cwd, askAgentRoles]);
  const roles = agentRoles?.cwd === draft.cwd.trim() ? agentRoles.roles : [];
  const next = nextStart(draft, now);
  const runs = trigger ? runsOf(triggers.runs, trigger.id) : [];
  // the sessions of its runs that still work or wait for a go, newest first: the newest can be stopped from here
  const working = runs.flatMap((run) => {
    const session = run.outcome === 'started' ? sessions[run.sessionId ?? ''] : undefined;
    return session && (isWorking(session) || session.state === 'perm') ? [session] : [];
  });
  const busy = working.find((session) => session.state === 'perm') ?? working[0] ?? null;
  const test = () => trigger && runTrigger(trigger.id, { test: true, body: testBody });

  const send = (input: TriggerInput) => {
    const parsed = parseTriggerInput(input);
    if ('error' in parsed) return words.errors[parsed.error];
    return saveTrigger(trigger?.id ?? null, parsed.input) ? null : t.settings.noServer;
  };
  // a new trigger is only sent by its button: saving as it is typed would make one per pause
  const { status } = useAutosave(draft, (input) => (trigger ? send(input) : null));
  const create = () => setProblem(send(draft));
  const typeRules = (text: string) => { setRulesText(text); change({ allowedTools: text.split('\n').map((line) => line.trim()).filter(Boolean) }); };
  const presetOn = (preset: AllowPreset) => ALLOW_PRESETS[preset].every((rule) => draft.allowedTools.includes(rule));
  const togglePreset = (preset: AllowPreset) => {
    const rules: readonly string[] = ALLOW_PRESETS[preset];
    const next = presetOn(preset) ? draft.allowedTools.filter((rule) => !rules.includes(rule)) : [...new Set([...draft.allowedTools, ...rules])];
    setRulesText(next.join('\n'));
    change({ allowedTools: next });
  };
  const shownError = problem ?? (serverError ? words.errors[serverError] : null);
  const nextLabel = next === undefined ? fields.scheduleHint
    : next === null ? fields.noNext
    : fields.next(`${new Date(next).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} ${formatClock(next)}`);

  return (
    <>
      <PageHead
        picture={trigger ? <KindIcon trigger={trigger} /> : <PlusIcon />}
        title={draft.name.trim() || words.add}
        intro={!trigger ? words.newIntro : !draft.enabled ? words.paused : trigger.kind === 'webhook' ? words.byHook : nextLabel}
        close={close}
      >
        {trigger ? (
          <>
            <SaveNote status={status} />
            {confirmRemove
              ? <button type="button" className="cp-button" data-variant="danger" onClick={() => deleteTrigger(trigger.id)} onBlur={() => setConfirmRemove(false)}><RemoveIcon />{words.confirmRemove}</button>
              : <button type="button" className="cp-icon-button" aria-label={words.remove} title={words.remove} onClick={() => setConfirmRemove(true)}><RemoveIcon /></button>}
          </>
        ) : <button type="button" className="cp-button" data-variant="primary" onClick={create}>{words.create}</button>}
      </PageHead>
      {trigger && (
        <div className="cp-trigger__bar">
          <span className="cp-trigger__state" data-state={busy?.state === 'perm' ? 'perm' : busy ? 'busy' : draft.enabled ? 'on' : 'off'}>
            <span className="cp-automata__dot" aria-hidden="true" />
            <span className="cp-trigger__state-text">{busy?.state === 'perm' ? words.asking(busy.name) : working.length > 1 ? words.workingMany(working.length) : busy ? words.working(busy.name) : draft.enabled ? words.waiting : words.pausedShort}</span>
          </span>
          {busy && (
            <button type="button" className="cp-icon-button" data-variant="outlined" data-tone="danger" aria-label={words.stopHint(busy.name)} title={words.stopHint(busy.name)} disabled={busy.state === 'starting'} onClick={() => sendMessage({ t: 'interrupt', sessionId: busy.id })}>
              <StopIcon />
            </button>
          )}
          <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={draft.enabled ? words.pause : words.resume} title={draft.enabled ? words.pause : words.resume} aria-pressed={!draft.enabled} onClick={() => change({ enabled: !draft.enabled })}>
            {draft.enabled ? <PauseIcon /> : <PowerIcon />}
          </button>
          <button type="button" className="cp-button" data-variant="primary" title={words.runNowHint} onClick={() => runTrigger(trigger.id)}><PlayIcon /><span className="cp-team__label">{words.runNow}</span></button>
        </div>
      )}
      <div className="cp-prefs__content">
        {shownError && <p className="cp-trigger__error" role="alert">{shownError}</p>}
        <section className="cp-prefs__group" aria-label={words.groups.what}>
          <h4 className="cp-prefs__group-title">{words.groups.what}</h4>
          <div className="cp-prefs__card">
            <Row id="trigger-name" icon={<TagIcon />} title={fields.name} hint={fields.nameHint}>
              <input value={draft.name} maxLength={60} placeholder={fields.namePlaceholder} aria-label={fields.name} onChange={(e) => change({ name: e.target.value })} />
            </Row>
            <Row id="trigger-folder" wide icon={<FolderIcon />} title={fields.folder} hint={fields.folderHint}>
              <input value={draft.cwd} list="cp-trigger-folders" spellCheck={false} aria-label={fields.folder} onChange={(e) => change({ cwd: e.target.value })} />
              <datalist id="cp-trigger-folders">{folders.map((folder) => <option key={folder} value={folder}>{homeRelative(folder)}</option>)}</datalist>
            </Row>
            <Row id="trigger-prompt" wide icon={<MessageIcon />} title={fields.prompt} hint={fields.promptHint}>
              <textarea rows={3} value={draft.prompt} placeholder={fields.promptPlaceholder} aria-label={fields.prompt} onChange={(e) => change({ prompt: e.target.value })} />
            </Row>
          </div>
        </section>
        <section className="cp-prefs__group" aria-label={words.groups.when}>
          <h4 className="cp-prefs__group-title">{words.groups.when}</h4>
          <div className="cp-prefs__card">
            <Row id="trigger-kind" icon={<KindIcon trigger={draft} />} title={fields.kind} hint={fields.kindHint}>
              <div className="cp-segmented" data-icons="" role="radiogroup" aria-label={fields.kind}>
                <button type="button" role="radio" aria-checked={draft.kind === 'cron'} onClick={() => change({ kind: 'cron', cron: draft.cron || DEFAULT_TRIGGER.cron })}><ClockIcon />{fields.cron}</button>
                <button type="button" role="radio" aria-checked={draft.kind === 'webhook'} onClick={() => change({ kind: 'webhook' })}><WebhookIcon />{fields.webhook}</button>
              </div>
            </Row>
            {draft.kind === 'cron' && (
              <Row id="trigger-schedule" wide icon={<ClockIcon />} title={fields.schedule} hint={nextLabel}>
                <ScheduleField cron={draft.cron} onCron={(cron) => change({ cron })} />
              </Row>
            )}
            {/* its address comes with its key, made by the server once the trigger is saved as a webhook */}
            {draft.kind === 'webhook' && trigger?.kind !== 'webhook' && (
              <Row id="trigger-hook" wide icon={<LinkIcon />} title={words.hookUrl}>
                <p className="cp-trigger__note">{trigger ? words.hookSaving : words.hookAfterCreate}</p>
              </Row>
            )}
            {draft.kind === 'webhook' && trigger?.kind === 'webhook' && (
              <Row id="trigger-hook" wide icon={<LinkIcon />} title={words.hookUrl} hint={words.hookHint}>
                <Copyable text={hookUrl(triggers.hookBase, trigger)} />
              </Row>
            )}
            {draft.kind === 'webhook' && trigger?.kind === 'webhook' && (
              <Row id="trigger-test-body" wide icon={<FileCodeIcon />} title={words.testBody} hint={words.testBodyHint}>
                <div className="cp-trigger__test">
                  <textarea className="cp-trigger__body" rows={3} spellCheck={false} value={testBody} aria-label={words.testBody} onChange={(e) => setTestBody(e.target.value)} />
                  <button type="button" className="cp-button" title={words.testHint} onClick={test}><PlanIcon />{words.test}</button>
                </div>
              </Row>
            )}
          </div>
        </section>
        <section className="cp-prefs__group" aria-label={words.groups.how}>
          <h4 className="cp-prefs__group-title">{words.groups.how}</h4>
          <div className="cp-prefs__card">
            <Row id="trigger-role" icon={<AutomatonIcon />} title={fields.role} hint={fields.roleHint}>
              <select value={draft.role} aria-label={fields.role} onChange={(e) => change({ role: e.target.value })}>
                <option value="">{fields.noRole}</option>
                {draft.role && !roles.some((role) => role.name === draft.role) && <option value={draft.role}>{draft.role}</option>}
                {roles.map((role) => <option key={role.name} value={role.name} title={role.description}>{roleLabel(role.name)}</option>)}
              </select>
            </Row>
            <Row id="trigger-model" icon={<SparklesIcon />} title={fields.model} hint={fields.modelHint}>
              <select value={draft.model} aria-label={fields.model} onChange={(e) => change({ model: e.target.value })}>
                {models().map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Row>
            <Row id="trigger-mode" icon={<TuneIcon />} title={fields.mode} hint={fields.modeHint}>
              <select value={draft.permissionMode} aria-label={fields.mode} onChange={(e) => change({ permissionMode: e.target.value as PermissionMode })}>
                {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode, 'short')}</option>)}
              </select>
            </Row>
          </div>
        </section>
        <section className="cp-prefs__group" aria-label={words.groups.rules}>
          <h4 className="cp-prefs__group-title">{words.groups.rules}</h4>
          <div className="cp-prefs__card">
            <Row id="trigger-rules" wide icon={<RulesIcon />} title={fields.rules} hint={fields.rulesHint}>
              <div className="cp-trigger__rules">
                <div className="cp-trigger__presets" role="group" aria-label={fields.presets}>
                  {(Object.keys(ALLOW_PRESETS) as AllowPreset[]).map((preset) => (
                    <button key={preset} type="button" className="cp-button" data-size="small" aria-pressed={presetOn(preset)} title={ALLOW_PRESETS[preset].join(', ')} onClick={() => togglePreset(preset)}>
                      {fields.preset[preset]}
                    </button>
                  ))}
                </div>
                <textarea className="cp-trigger__body" rows={Math.min(Math.max(rulesText.split('\n').length, 3), 12)} spellCheck={false} value={rulesText} placeholder={fields.rulesPlaceholder} aria-label={fields.rules} onChange={(e) => typeRules(e.target.value)} />
              </div>
            </Row>
            {trigger && (
              <Row id="trigger-keys" wide icon={<KeyIcon />} title={fields.keys} hint={fields.keysHint}>
                <TriggerKeys triggerId={trigger.id} />
              </Row>
            )}
          </div>
        </section>
        <section className="cp-prefs__group" aria-label={words.groups.options}>
          <h4 className="cp-prefs__group-title">{words.groups.options}</h4>
          <div className="cp-prefs__card">
            {triggers.messengers.length > 0 && (
              <>
                <Row id="trigger-messengers" wide icon={<MessageIcon />} title={fields.messengers} hint={fields.messengersHint}>
                  <div className="cp-trigger__presets">
                    {triggers.messengers.map((bot) => {
                      const on = draft.messengers.includes(bot.id);
                      return (
                        <button key={bot.id} type="button" className="cp-button" data-size="small" aria-pressed={on} onClick={() => change({ messengers: on ? draft.messengers.filter((id) => id !== bot.id) : [...draft.messengers, bot.id] })}>
                          <BrandIcon brand={bot.kind} />{bot.name}
                        </button>
                      );
                    })}
                  </div>
                </Row>
                {draft.messengers.length > 0 && (
                  <Row id="trigger-notify-done" icon={<MessageIcon />} title={fields.notifyDone} hint={fields.notifyDoneHint}>
                    <Switch checked={draft.notifyDone} label={fields.notifyDone} onChange={(notifyDone) => change({ notifyDone })} />
                  </Row>
                )}
              </>
            )}
            <Row id="trigger-remote" icon={<PhoneIcon />} title={fields.remote} hint={fields.remoteHint}>
              <Switch checked={draft.remote} label={fields.remote} onChange={(remote) => change({ remote })} />
            </Row>
          </div>
        </section>
        {trigger && (
          <section className="cp-prefs__group" aria-label={words.runs}>
            <h4 className="cp-prefs__group-title">{words.runs}</h4>
            {runs.length ? (
              <ul className="cp-prefs__card cp-trigger__runs">
                {runs.map((run) => (
                  <li key={run.id} data-outcome={run.outcome}>
                    <span className="cp-automata__dot" data-outcome={run.outcome} aria-hidden="true" />
                    <span className="cp-trigger__run-text">
                      <span className="cp-trigger__outcome">{words.outcome[run.outcome]}</span>
                      <span className="cp-trigger__run-meta">{words.source[run.source]} · {formatAgo(now - run.at)}{run.error ? ` · ${run.error}` : ''}</span>
                    </span>
                    {run.outcome === 'queued' && (
                      <button type="button" className="cp-button" data-size="small" onClick={() => cancelTriggerRun(run.id)}>{words.cancelQueued}</button>
                    )}
                    {run.sessionId && sessions[run.sessionId] && (
                      <button type="button" className="cp-button" data-size="small" onClick={() => { openAutomata(false); show(run.sessionId!); }}>{sessions[run.sessionId].name} · {words.openSession}</button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="cp-prefs__empty">{words.noRuns}</p>}
            <p className="cp-trigger__note">{words.busyRule(draft.kind === 'webhook')}</p>
          </section>
        )}
      </div>
    </>
  );
}

function AccessPage({ close }: { close: () => void }) {
  const url = useSessions((s) => s.triggers.externalMcp);
  const setExternalMcp = useSessions((s) => s.setExternalMcp);
  const words = t.automata.access;
  return (
    <>
      <PageHead picture={<KeyIcon />} title={t.automata.tabs.access} intro={words.head} close={close}>
        {url && <button type="button" className="cp-button" title={words.regenerateHint} onClick={() => setExternalMcp(true)}><KeyIcon /><span className="cp-team__label">{words.regenerate}</span></button>}
      </PageHead>
      <div className="cp-prefs__content">
        <p className="cp-trigger__note">{words.intro}</p>
        <div className="cp-prefs__card">
          <Row id="access-enabled" icon={<PowerIcon />} title={url ? t.automata.triggers.fields.enabled : words.off} hint={words.local}>
            <Switch checked={!!url} label={words.enable} onChange={(on) => setExternalMcp(on)} />
          </Row>
          {url && (
            <>
              <Row id="access-url" wide icon={<LinkIcon />} title={words.url}><Copyable text={url} /></Row>
              <Row id="access-config" wide icon={<TuneIcon />} title={words.config}><Copyable text={externalMcpConfig(url)} block /></Row>
              <Row id="access-command" wide icon={<SparklesIcon />} title={words.command}><Copyable text={claudeMcpCommand(url)} /></Row>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** A run's role, as people read it. */
const roleName = (run: AutomatonRun) => roleLabel(run.role || run.task || run.id);

/** The external runs, read only: those at work and the last ended, and for the one picked its role, task and thread. */
function RunsPage({ close }: { close: () => void }) {
  const state = useSessions((s) => s.automata);
  const picked = useSessions((s) => s.automatonId);
  const pickedAgent = useSessions((s) => s.automatonAgent);
  const folder = useSessions((s) => s.preferences.automataFolder);
  const openAutomata = useSessions((s) => s.openAutomata);
  const words = t.automata.runs;
  const runs = allRuns(state);
  const run = runs.find((candidate) => candidate.id === picked) ?? state.running[0] ?? state.recent[0] ?? null;
  // opened without a run: the first one is shown, its thread asked for
  useEffect(() => { if (run && run.id !== picked) openAutomata(true, run.id); }, [run, picked, openAutomata]);
  return (
    <>
      <PageHead picture={<AutomatonIcon />} title={t.automata.tabs.runs} intro={words.head} close={close} />
      {state.folder !== 'ok' ? (
        <div className="cp-prefs__content"><p className="cp-prefs__empty">{state.folder === 'off' ? words.off : words.missing(homeRelative(folder))}</p></div>
      ) : (
        <div className="cp-automata">
          <nav className="cp-automata__runs" aria-label={t.automata.tabs.runs}>
            <h3>{words.running}</h3>
            {state.running.length ? <RunList runs={state.running} current={run?.id ?? null} /> : <p className="cp-muted">{words.noneRunning}</p>}
            <h3>{words.recent}</h3>
            {state.recent.length ? <RunList runs={state.recent} current={run?.id ?? null} /> : <p className="cp-muted">{words.none}</p>}
          </nav>
          {run ? <RunDetail key={`${run.id}/${pickedAgent ?? ''}`} run={run} /> : <p className="cp-muted">{words.pick}</p>}
        </div>
      )}
    </>
  );
}

function RunList({ runs, current }: { runs: readonly AutomatonRun[]; current: string | null }) {
  const openAutomata = useSessions((s) => s.openAutomata);
  const now = useNow(30_000);
  return (
    <ul>
      {runs.map((run) => (
        <li key={run.id}>
          <button type="button" className="cp-automata__run" aria-current={run.id === current || undefined} data-status={run.status} onClick={() => openAutomata(true, run.id)}>
            <span className="cp-automata__run-role"><AutomatonIcon />{roleName(run)}</span>
            <span className="cp-automata__run-task">{run.task || homeRelative(run.cwd) || run.id}</span>
            <span className="cp-automata__run-when">{t.automata.runs.status[run.status]} · {formatDuration(now - (run.endedAt ?? run.startedAt))}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RunDetail({ run }: { run: AutomatonRun }) {
  const state = useSessions((s) => s.automata);
  const log = useSessions((s) => s.automatonLogs[run.id]);
  // a click on a sub-agent in the room opens its run on its thread
  const [agent, setAgent] = useState<string | null>(() => useSessions.getState().automatonAgent);
  const now = useNow(10_000);
  const words = t.automata.runs;
  const role = roleOf(state, run.role);
  const feed = useMemo(() => buildFeed(log?.events ?? []), [log]);
  const subagents = feed.items.filter((item) => item.kind === 'subagent');
  // a sub-agent is named after its role (server/automata.ts): .claude/agents says what it is for
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
        {run.role && (
          <>
            <dt>{words.role}</dt>
            <dd>
              {role?.description || words.noRole}
              {role?.model && <span className="cp-automata__meta">{words.model(role.model)}</span>}
            </dd>
          </>
        )}
        <dt>{words.task}</dt>
        <dd>{run.task || words.noTask}</dd>
        {run.cwd && (
          <>
            <dt>{words.folder}</dt>
            <dd>{homeRelative(run.cwd)}</dd>
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
