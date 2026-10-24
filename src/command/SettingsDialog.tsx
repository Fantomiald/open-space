import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LANGUAGES, type Language } from '../../shared/i18n.ts';
import { isMetricsPath } from '../../shared/metrics.ts';
import { isFullPath } from '../../shared/paths.ts';
import type { TerminalKind } from '../../shared/terminal.ts';
import { IS_MAC, IS_WINDOWS } from '../lib/platform.ts';
import { INBOUND_POLICIES, WORKFLOW_SIZES, type ClaudeSettings, type ClaudeSwitch } from '../../shared/claude-settings.ts';
import { EFFORTS, IDLE_COMPACT_MINUTES, ISOLATE_MODES, PERMISSION_MODES, TIME_FORMATS, type Preferences } from '../../shared/protocol.ts';
import { ROOM_THEMES, type RoomTheme } from '../../shared/room-themes.ts';
import { matchesAll } from '../../shared/search.ts';
import { t } from '../i18n/index.ts';
import { homeRelative } from '../lib/format.ts';
import { modeLabel, models } from '../state/labels.ts';
import { outdatedSessions, SETTINGS_SECTIONS, useSessions, type SettingsSection } from '../state/sessions.ts';
import { CONFIG_LABELS, settingEntries, type SettingRow } from '../state/settings-index.ts';
import {
  ActivityIcon, AgentIcon, BellIcon, BranchIcon, PipIcon, DownloadIcon, CalendarIcon, ChangelogIcon, ChartIcon, ClockIcon, CloseIcon, CoffeeIcon, CopyIcon, CrewIcon, DeskIcon, ExternalLinkIcon, FestivalIcon, FolderIcon,
  CompactIcon, FreeWindowsIcon, GaugeIcon, InboxIcon, InfoIcon, ItsMeIcon, KeyboardIcon, LanguageIcon, MessageIcon, NotesIcon, PlanIcon, RefreshIcon, SearchIcon, SettingsIcon, SoundIcon,
  PaletteIcon, SparklesIcon, TerminalIcon, ThinkingIcon, TimerIcon, TuneIcon, UltracodeIcon, WorkflowIcon,
} from './Icons.tsx';
import { AccountAction } from './AccountAction.tsx';
import { AppUpdateAction, CheckButton } from './AppUpdateAction.tsx';
import { Modal } from './Modal.tsx';
import { FoldersPicker, LANGUAGE_NAMES } from './PreferenceFields.tsx';
import { PreviewFestival, PreviewHour } from './PreviewFields.tsx';
import { SaveNote } from './SaveNote.tsx';
import { Shortcuts } from './Shortcuts.tsx';
import { Switch } from './Switch.tsx';
import { UsagePanel } from './UsagePanel.tsx';
import { useAutosave } from './useAutosave.ts';

const REPOSITORY = 'https://github.com/Fantomiald/open-space';
/** The page runs in the Mac app (its window is Electron's), not in a browser. */
const IN_APP = /Electron/.test(navigator.userAgent);

const SECTION_ICONS: Record<SettingsSection, () => ReactNode> = {
  general: SettingsIcon, sessions: TuneIcon, claude: TerminalIcon, folders: FolderIcon, office: DeskIcon, notes: NotesIcon, usage: ChartIcon, shortcuts: KeyboardIcon, about: InfoIcon,
};

type Group = keyof typeof t.settings.prefs.groups;
/** The rows of each section, by group, in the order shown. */
const LAYOUT: Readonly<Partial<Record<SettingsSection, readonly (readonly [Group, readonly SettingRow[]])[]>>> = {
  general: [['appearance', ['language', 'timeFormat', 'reduceMotion']], ...(IS_WINDOWS ? [['system', ['terminal']] as const] : []), ['text', ['timestamps', 'turnDuration', 'copyOnSelect']], ['alerts', ['sound', 'notifications']]],
  sessions: [['defaults', ['model', 'effort', 'permissions']], ['agents', ['agentNote']], ['branches', ['isolate']], ['browser', ['autoPip']]],
  claude: [
    ['reasoning', ['thinking', 'outputStyle', 'responseLanguage']], ['autonomy', ['autoCompact', 'idleCompact', 'autoContinue', 'autoModeInPlan']],
    ['workflows', ['workflows', 'ultracodeKeyword', 'workflowSize']], ['together', ['inbound', 'artifacts']],
  ],
  folders: [['places', ['roots', 'defaultFolder']]],
  office: [['life', ['theme', 'festivals', 'officeLife', 'previewFestival', 'previewHour']], ['crew', ['crew']]],
  notes: [['files', ['journalFolder', 'metricsFile']]],
  about: [['appearance', ['version', 'claude', 'account', 'links', 'dockApp']]],
};

/** At the top of the settings while the Mac app downloads a new Open Space, then to restart on it. */
function AppUpdateBanner() {
  const update = useSessions((s) => s.appUpdate);
  const words = t.settings.prefs.update;
  if (update?.state !== 'downloading' && update?.state !== 'ready') return null;
  const ready = update.state === 'ready';
  return (
    <div className="cp-prefs__banner" role="status">
      <span className="cp-prefs__banner-icon"><DownloadIcon /></span>
      <div className="cp-prefs__row-text">
        <strong>{ready ? words.appReady(update.version) : words.appDownloading(update.version)}</strong>
        <span className="cp-prefs__row-hint">{ready ? words.appReadyHint : words.appDownloadingHint}</span>
      </div>
      <AppUpdateAction />
    </div>
  );
}

/** At the top of the settings while sessions still run an older Claude Code than the one installed. */
function UpdateBanner() {
  const version = useSessions((s) => s.claude?.version);
  const sessions = useSessions((s) => s.sessions);
  const outdated = useMemo(() => outdatedSessions(Object.values(sessions), version), [sessions, version]);
  const words = t.settings.prefs.update;
  if (!version || !outdated.length) return null;
  const waiting = outdated.some((session) => session.state === 'wait');
  return (
    <div className="cp-prefs__banner" role="status">
      <span className="cp-prefs__banner-icon"><SparklesIcon /></span>
      <div className="cp-prefs__row-text">
        <strong>{words.installed(version)}</strong>
        <span className="cp-prefs__row-hint">{words.outdated(outdated.length, outdated[0].claudeVersion ?? '')}</span>
      </div>
      {waiting && <button type="button" className="cp-button" data-variant="primary" onClick={() => useSessions.getState().restartOutdated()}>{words.restart}</button>}
    </div>
  );
}

export function SettingsDialog() {
  const open = useSessions((s) => s.settingsOpen);
  return open ? <SettingsEditor /> : null;
}

/** Each row of the Claude Code section, by the settings key it sets. */
const CLAUDE_SWITCH_ROWS: Readonly<Partial<Record<SettingRow, readonly [ClaudeSwitch, () => ReactNode]>>> = {
  thinking: ['alwaysThinkingEnabled', ThinkingIcon], autoCompact: ['autoCompactEnabled', CompactIcon], autoContinue: ['autoContinueAtUsageLimit', RefreshIcon],
  autoModeInPlan: ['useAutoModeDuringPlan', PlanIcon], workflows: ['enableWorkflows', WorkflowIcon], ultracodeKeyword: ['workflowKeywordTriggerEnabled', UltracodeIcon],
  artifacts: ['enableArtifact', FreeWindowsIcon],
};

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** The Claude Code settings with `key` set to `value`, or left to Claude Code when that is what it does anyway. */
function withSetting<K extends keyof ClaudeSettings>(settings: ClaudeSettings, key: K, value: ClaudeSettings[K], inherited: ClaudeSettings[K]): ClaudeSettings {
  const { [key]: _, ...rest } = settings;
  return value === undefined || value === inherited ? rest : { ...rest, [key]: value };
}

/** One setting: its icon, title and what it does, and its control on the right (below it for a wide one). `config`: its name in Claude Code's /config. */
function Row({ id, icon, title, hint, config, extra, wide, flash, children }: {
  id: string; icon: ReactNode; title: string; hint?: ReactNode; config?: string; extra?: ReactNode; wide?: boolean; flash?: boolean; children: ReactNode;
}) {
  return (
    <div className="cp-prefs__row" id={`setting-${id}`} data-wide={wide} data-flash={flash}>
      <span className="cp-prefs__row-icon">{icon}</span>
      <div className="cp-prefs__row-text">
        <span className="cp-prefs__row-title" id={`setting-${id}-title`}>{title}{config && <code className="cp-prefs__config" title="/config">{config}</code>}</span>
        {hint && <span className="cp-prefs__row-hint">{hint}</span>}
        {extra}
      </div>
      <div className="cp-prefs__row-control">{children}</div>
    </div>
  );
}

/** The settings, in sections: changes are saved as they are made. */
function SettingsEditor() {
  const preferences = useSessions((s) => s.preferences);
  const rootsLocked = useSessions((s) => s.rootsLocked);
  const roots = useSessions((s) => s.roots);
  const suggestions = useSessions((s) => s.rootSuggestions);
  const claude = useSessions((s) => s.claude);
  const claudeUpdate = useSessions((s) => s.claudeUpdate);
  const account = useSessions((s) => s.claudeAccount);
  const claudeDefaults = useSessions((s) => s.claudeDefaults.current);
  const outputStyles = useSessions((s) => s.claudeDefaults.outputStyles);
  const sound = useSessions((s) => s.sound);
  const section = useSessions((s) => s.settingsSection);
  const flashRow = useSessions((s) => s.settingsRow);
  const language = useSessions((s) => s.language);
  const terminals = useSessions((s) => s.terminals);
  const store = useSessions.getState;
  const [query, setQuery] = useState('');
  const content = useRef<HTMLDivElement>(null);
  // the notes folder and the numbers file as the page shows paths ("~/Journal"): the server expands "~"
  const [draft, setDraft] = useState<Preferences>(() => ({
    ...preferences, roots: rootsLocked ? roots : preferences.roots, journalFolder: homeRelative(preferences.journalFolder), metricsFile: homeRelative(preferences.metricsFile),
  }));
  const terminal = draft.terminal ?? 'cmd';
  const change = (changes: Partial<Preferences>) => setDraft((current) => ({ ...current, ...changes }));

  useEffect(() => { store().send({ t: 'suggestRoots' }); }, [store]);

  const close = () => store().openSettings(false);
  const words = t.settings.prefs;
  const { status } = useAutosave(draft, (next) => {
    if (!next.roots.length) return t.settings.dialog.noFolder;
    if (!isFullPath(next.journalFolder.trim())) return t.settings.dialog.journalFolderInvalid;
    if (!isMetricsPath(next.metricsFile)) return t.settings.dialog.metricsFileInvalid;
    return store().setPreferences(next) ? null : t.settings.noServer;
  });

  // a row picked in the search palette comes into view, lit for a moment
  useEffect(() => {
    if (flashRow) document.getElementById(`setting-${flashRow}`)?.scrollIntoView({ block: 'center' });
    else content.current?.scrollTo({ top: 0 });
  }, [section, flashRow]);

  const goTo = (next: SettingsSection) => { setQuery(''); store().openSettings(true, next); };

  const matches = useMemo(() => (query.trim() ? settingEntries().filter((entry) => matchesAll(`${entry.label} ${entry.sectionLabel} ${entry.words}`, query)) : null), [query]);

  const setClaude = <K extends keyof ClaudeSettings>(key: K, value: ClaudeSettings[K]) => change({ claude: withSetting(draft.claude, key, value, claudeDefaults[key]) });
  /** Under a Claude Code row that Open Space sets: Claude Code's own value, and the way back to it. */
  const inheritButton = (key: keyof ClaudeSettings, shown: string) => draft.claude[key] !== undefined && (
    <button type="button" className="cp-prefs__inherit" title={words.inheritTitle} onClick={() => setClaude(key, undefined)}>{words.inherit(shown)}</button>
  );
  const onOff = (value: boolean | undefined) => (value === false ? words.off : words.on);

  const row = (id: SettingRow): ReactNode => {
    const rows = words.rows;
    const flash = flashRow === id;
    const config = CONFIG_LABELS[id];
    const claudeSwitch = CLAUDE_SWITCH_ROWS[id];
    if (claudeSwitch) {
      const [key, Icon] = claudeSwitch;
      const { title, hint } = rows[id as keyof typeof rows] as { title: string; hint: string };
      const value = draft.claude[key] ?? claudeDefaults[key] ?? true;
      return (
        <Row key={id} id={id} flash={flash} icon={<Icon />} title={title} hint={hint} config={config} extra={inheritButton(key, onOff(claudeDefaults[key]))}>
          <Switch checked={value} onChange={(next) => setClaude(key, next)} label={title} />
        </Row>
      );
    }
    switch (id) {
      case 'terminal': return !IS_WINDOWS ? null : (
        <Row key={id} id={id} flash={flash} icon={<TerminalIcon />} title={rows.terminal.title} hint={rows.terminal.hint}>
          <select aria-labelledby={`setting-${id}-title`} title={terminals.find((choice) => choice.id === terminal)?.path} value={terminal} disabled={!terminals.length} onChange={(e) => change({ terminal: e.target.value as TerminalKind })}>
            {!terminals.some((choice) => choice.id === terminal) && <option value={terminal} disabled>{rows.terminal.unavailable}</option>}
            {terminals.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
          </select>
        </Row>
      );
      case 'language': return (
        <Row key={id} id={id} flash={flash} icon={<LanguageIcon />} title={rows.language.title} hint={rows.language.hint}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.language ?? language} onChange={(e) => change({ language: e.target.value as Language })}>
            {LANGUAGES.map((option) => <option key={option} value={option} lang={option}>{LANGUAGE_NAMES[option]}</option>)}
          </select>
        </Row>
      );
      case 'timeFormat': return (
        <Row key={id} id={id} flash={flash} icon={<ClockIcon />} title={rows.timeFormat.title} hint={rows.timeFormat.hint} config={config}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.timeFormat} onChange={(e) => change({ timeFormat: e.target.value as Preferences['timeFormat'] })}>
            {TIME_FORMATS.map((format) => <option key={format} value={format}>{rows.timeFormat.options[format]}</option>)}
          </select>
        </Row>
      );
      case 'reduceMotion': return (
        <Row key={id} id={id} flash={flash} icon={<ActivityIcon />} title={rows.reduceMotion.title} hint={rows.reduceMotion.hint} config={config}>
          <Switch checked={draft.reduceMotion} onChange={(reduceMotion) => change({ reduceMotion })} label={rows.reduceMotion.title} />
        </Row>
      );
      case 'timestamps': return (
        <Row key={id} id={id} flash={flash} icon={<MessageIcon />} title={rows.timestamps.title} hint={rows.timestamps.hint} config={config}>
          <Switch checked={draft.timestamps} onChange={(timestamps) => change({ timestamps })} label={rows.timestamps.title} />
        </Row>
      );
      case 'turnDuration': return (
        <Row key={id} id={id} flash={flash} icon={<TimerIcon />} title={rows.turnDuration.title} hint={rows.turnDuration.hint} config={config}>
          <Switch checked={draft.turnDuration} onChange={(turnDuration) => change({ turnDuration })} label={rows.turnDuration.title} />
        </Row>
      );
      case 'effort': return (
        <Row key={id} id={id} flash={flash} icon={<GaugeIcon />} title={rows.effort.title} hint={rows.effort.hint}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.effort} onChange={(e) => change({ effort: e.target.value as Preferences['effort'] })}>
            <option value="">{rows.effort.auto}</option>
            {EFFORTS.map((effort) => <option key={effort} value={effort}>{capitalized(t.composer.tune.efforts[effort])}</option>)}
          </select>
        </Row>
      );
      case 'outputStyle': {
        const styleName = (style: string | undefined) => (!style || style === 'default' ? rows.outputStyle.default : style);
        const styles = draft.claude.outputStyle && !outputStyles.includes(draft.claude.outputStyle) ? [...outputStyles, draft.claude.outputStyle] : outputStyles;
        return (
          <Row key={id} id={id} flash={flash} icon={<NotesIcon />} title={rows.outputStyle.title} hint={rows.outputStyle.hint} config={config}>
            <select aria-labelledby={`setting-${id}-title`} value={draft.claude.outputStyle ?? ''} onChange={(e) => setClaude('outputStyle', e.target.value || undefined)}>
              <option value="">{words.inherit(styleName(claudeDefaults.outputStyle))}</option>
              {styles.map((style) => <option key={style} value={style}>{styleName(style)}</option>)}
            </select>
          </Row>
        );
      }
      case 'responseLanguage': return (
        <Row key={id} id={id} flash={flash} icon={<LanguageIcon />} title={rows.responseLanguage.title} hint={rows.responseLanguage.hint} config={config}>
          <input
            aria-labelledby={`setting-${id}-title`} value={draft.claude.language ?? ''} maxLength={40} spellCheck={false}
            onChange={(e) => change({ claude: withSetting(draft.claude, 'language', e.target.value.trim() ? e.target.value : undefined, undefined) })}
            placeholder={claudeDefaults.language ?? rows.responseLanguage.english}
          />
        </Row>
      );
      case 'idleCompact': return (
        <Row key={id} id={id} flash={flash} icon={<TimerIcon />} title={rows.idleCompact.title} hint={rows.idleCompact.hint} config={config}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.idleCompact} onChange={(e) => change({ idleCompact: Number(e.target.value) })}>
            {IDLE_COMPACT_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes ? rows.idleCompact.after(minutes) : rows.idleCompact.off}</option>)}
          </select>
        </Row>
      );
      case 'workflowSize': return (
        <Row key={id} id={id} flash={flash} icon={<CrewIcon />} title={rows.workflowSize.title} hint={rows.workflowSize.hint} config={config}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.claude.workflowSizeGuideline ?? ''} onChange={(e) => setClaude('workflowSizeGuideline', (e.target.value || undefined) as ClaudeSettings['workflowSizeGuideline'])}>
            <option value="">{words.inherit(rows.workflowSize.options[claudeDefaults.workflowSizeGuideline ?? 'medium'])}</option>
            {WORKFLOW_SIZES.map((size) => <option key={size} value={size}>{rows.workflowSize.options[size]}</option>)}
          </select>
        </Row>
      );
      case 'inbound': return (
        <Row key={id} id={id} flash={flash} icon={<InboxIcon />} title={rows.inbound.title} hint={rows.inbound.hint} config={config}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.claude.crossSessionInbound ?? ''} onChange={(e) => setClaude('crossSessionInbound', (e.target.value || undefined) as ClaudeSettings['crossSessionInbound'])}>
            <option value="">{words.inherit(rows.inbound.options[claudeDefaults.crossSessionInbound ?? 'default'])}</option>
            {INBOUND_POLICIES.map((policy) => <option key={policy} value={policy}>{rows.inbound.options[policy]}</option>)}
          </select>
        </Row>
      );
      case 'sound': return (
        <Row key={id} id={id} flash={flash} icon={<SoundIcon muted={!sound} />} title={rows.sound.title} hint={rows.sound.hint}>
          <Switch checked={sound} onChange={() => store().toggleSound()} label={rows.sound.title} />
        </Row>
      );
      case 'notifications': return (
        <Row key={id} id={id} flash={flash} icon={<BellIcon muted={!draft.notifications} />} title={rows.notifications.title} hint={rows.notifications.hint} config={config}>
          <Switch checked={draft.notifications} onChange={(notifications) => change({ notifications })} label={rows.notifications.title} />
        </Row>
      );
      case 'copyOnSelect': return (
        <Row key={id} id={id} flash={flash} icon={<CopyIcon />} title={rows.copyOnSelect.title} hint={rows.copyOnSelect.hint} config={config}>
          <Switch checked={draft.copyOnSelect} onChange={(copyOnSelect) => change({ copyOnSelect })} label={rows.copyOnSelect.title} />
        </Row>
      );
      case 'model': return (
        <Row key={id} id={id} flash={flash} icon={<SparklesIcon />} title={rows.model.title} hint={rows.model.hint} config={config}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.model} onChange={(e) => change({ model: e.target.value })}>
            {models().map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Row>
      );
      case 'permissions': return (
        <Row key={id} id={id} flash={flash} icon={<TuneIcon />} title={rows.permissions.title} hint={rows.permissions.hint} config={config}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.permissionMode} onChange={(e) => change({ permissionMode: e.target.value as Preferences['permissionMode'] })}>
            {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}
          </select>
        </Row>
      );
      case 'agentNote': return (
        <Row key={id} id={id} flash={flash} wide icon={<AgentIcon />} title={rows.agentNote.title} hint={rows.agentNote.hint}>
          <textarea aria-labelledby={`setting-${id}-title`} rows={3} maxLength={600} value={draft.agentNote} onChange={(e) => change({ agentNote: e.target.value })} placeholder={t.settings.habits.agentNotePlaceholder} />
        </Row>
      );
      case 'isolate': return (
        <Row key={id} id={id} flash={flash} icon={<BranchIcon />} title={rows.isolate.title} hint={rows.isolate.hint}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.isolate} onChange={(e) => change({ isolate: e.target.value as Preferences['isolate'] })}>
            {ISOLATE_MODES.map((mode) => <option key={mode} value={mode}>{rows.isolate.options[mode]}</option>)}
          </select>
        </Row>
      );
      case 'autoPip': return (
        <Row key={id} id={id} flash={flash} icon={<PipIcon />} title={rows.autoPip.title} hint={rows.autoPip.hint}>
          <Switch checked={draft.autoPip} onChange={(autoPip) => change({ autoPip })} label={rows.autoPip.title} />
        </Row>
      );
      case 'roots': return (
        <Row key={id} id={id} flash={flash} wide icon={<FolderIcon />} title={rows.roots.title} hint={rows.roots.hint}>
          <FoldersPicker
            roots={draft.roots} onRoots={(next) => change({ roots: next })} defaultFolder={draft.defaultFolder}
            onDefaultFolder={(defaultFolder) => change({ defaultFolder })} suggestions={suggestions} locked={rootsLocked} withDefault={false}
          />
        </Row>
      );
      case 'defaultFolder': return (
        <Row key={id} id={id} flash={flash} icon={<TerminalIcon />} title={rows.defaultFolder.title} hint={rows.defaultFolder.hint}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.roots.includes(draft.defaultFolder) ? draft.defaultFolder : draft.roots[0]} onChange={(e) => change({ defaultFolder: e.target.value })} disabled={draft.roots.length < 2}>
            {draft.roots.map((root) => <option key={root} value={root}>{homeRelative(root)}</option>)}
          </select>
        </Row>
      );
      case 'theme': return (
        <Row key={id} id={id} flash={flash} icon={<PaletteIcon />} title={rows.theme.title} hint={rows.theme.hint}>
          <select aria-labelledby={`setting-${id}-title`} value={draft.theme} onChange={(e) => change({ theme: e.target.value as RoomTheme })}>
            {ROOM_THEMES.map((theme) => <option key={theme} value={theme}>{rows.theme.options[theme]}</option>)}
          </select>
        </Row>
      );
      case 'festivals': return (
        <Row key={id} id={id} flash={flash} icon={<FestivalIcon />} title={rows.festivals.title} hint={rows.festivals.hint}>
          <Switch checked={draft.festivals} onChange={(festivals) => change({ festivals })} label={rows.festivals.title} />
        </Row>
      );
      case 'officeLife': return (
        <Row key={id} id={id} flash={flash} icon={<CoffeeIcon />} title={rows.officeLife.title} hint={rows.officeLife.hint}>
          <Switch checked={draft.officeLife} onChange={(officeLife) => change({ officeLife })} label={rows.officeLife.title} />
        </Row>
      );
      case 'previewFestival': return (
        <Row key={id} id={id} flash={flash} icon={<CalendarIcon />} title={rows.previewFestival.title} hint={rows.previewFestival.hint}>
          <PreviewFestival labelledBy={`setting-${id}-title`} />
        </Row>
      );
      case 'previewHour': return (
        <Row key={id} id={id} flash={flash} icon={<ClockIcon />} title={rows.previewHour.title} hint={rows.previewHour.hint}>
          <PreviewHour labelledBy={`setting-${id}-title`} />
        </Row>
      );
      case 'crew': return (
        <Row key={id} id={id} flash={flash} icon={<CrewIcon />} title={rows.crew.title} hint={rows.crew.hint}>
          <button type="button" className="cp-button" onClick={() => { close(); store().openCrew(true); }}>{rows.crew.action}</button>
        </Row>
      );
      case 'journalFolder': return (
        <Row key={id} id={id} flash={flash} wide icon={<NotesIcon />} title={rows.journalFolder.title} hint={rows.journalFolder.hint}>
          <input aria-labelledby={`setting-${id}-title`} title={preferences.journalFolder} value={draft.journalFolder} onChange={(e) => change({ journalFolder: e.target.value })} spellCheck={false} />
        </Row>
      );
      case 'metricsFile': return (
        <Row key={id} id={id} flash={flash} wide icon={<ChartIcon />} title={rows.metricsFile.title} hint={rows.metricsFile.hint}>
          <input aria-labelledby={`setting-${id}-title`} title={preferences.metricsFile || undefined} value={draft.metricsFile} onChange={(e) => change({ metricsFile: e.target.value })} placeholder={t.settings.dialog.metricsFilePlaceholder} spellCheck={false} />
        </Row>
      );
      case 'version': return (
        <Row key={id} id={id} flash={flash} icon={<SparklesIcon />} title={rows.version.title} hint={rows.version.hint}>
          <span className="cp-prefs__value">{__APP_VERSION__}</span>
          {IN_APP && <AppUpdateAction />}
        </Row>
      );
      case 'claude': return (
        <Row key={id} id={id} flash={flash} icon={<TerminalIcon />} title={rows.claude.title} hint={claude?.found ? claude.path && homeRelative(claude.path) : rows.claude.missing}>
          <span className="cp-prefs__value">{claude?.found ? rows.claude.found(claude.version ?? '') : '-'}</span>
          {claude?.found && (
            <CheckButton
              busy={claudeUpdate?.state === 'checking'}
              done={claudeUpdate?.state === 'upToDate' ? words.update.upToDate : claudeUpdate?.state === 'updated' ? words.update.updated : undefined}
              failure={claudeUpdate?.state === 'failed' ? claudeUpdate.text : undefined} onClick={() => store().updateClaude()}
            />
          )}
        </Row>
      );
      case 'account': return (
        <Row
          key={id} id={id} flash={flash} icon={<ItsMeIcon />} title={rows.account.title}
          hint={account?.failed ? rows.account.failed(account.failed) : account?.loggedIn ? [account.org, account.plan, account.via && rows.account.via(account.via)].filter(Boolean).join(' · ') : rows.account.hint}
        >
          <span className="cp-prefs__value">{account ? (account.loggedIn ? account.email : rows.account.signedOut) : '-'}</span>
          {claude?.found && <AccountAction />}
        </Row>
      );
      case 'links': return (
        <Row key={id} id={id} flash={flash} icon={<ChangelogIcon />} title={rows.links.title}>
          <span className="cp-prefs__links">
            <a className="cp-button" href={`${REPOSITORY}/releases`} target="_blank" rel="noreferrer">{rows.links.changelog} <ExternalLinkIcon /></a>
            <a className="cp-button" href={REPOSITORY} target="_blank" rel="noreferrer">{rows.links.source} <ExternalLinkIcon /></a>
          </span>
        </Row>
      );
      case 'dockApp': return IN_APP || !IS_MAC ? null : (
        <Row key={id} id={id} flash={flash} icon={<DeskIcon />} title={rows.dockApp.title} hint={rows.dockApp.hint}>{null}</Row>
      );
    }
  };

  /** What a section shows: its groups of rows, or the usage view, or the shortcuts. */
  const body = (shown: SettingsSection) => {
    if (shown === 'usage') return <UsagePanel />;
    if (shown === 'shortcuts') return <Shortcuts />;
    return (LAYOUT[shown] ?? []).map(([group, rows]) => (
      <section key={group} className="cp-prefs__group" aria-label={words.groups[group]}>
        {(LAYOUT[shown]?.length ?? 0) > 1 && <h4 className="cp-prefs__group-title">{words.groups[group]}</h4>}
        <div className="cp-prefs__card">{rows.map(row)}</div>
      </section>
    ));
  };

  const SectionIcon = SECTION_ICONS[section];
  return (
    <Modal title={t.settings.dialog.title} onClose={close} look="panel">
      <div className="cp-prefs">
        <aside className="cp-prefs__side">
          <div className="cp-prefs__brand"><SettingsIcon /><span>{t.settings.dialog.title}</span></div>
          <label className="cp-prefs__search">
            <SearchIcon />
            <span className="cp-sr-only">{words.search}</span>
            <input id="settings-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={words.search} spellCheck={false} />
          </label>
          <nav className="cp-prefs__menu" aria-label={words.menu}>
            {SETTINGS_SECTIONS.map((id) => {
              const Icon = SECTION_ICONS[id];
              return (
                <button key={id} type="button" aria-current={!matches && id === section ? 'page' : undefined} onClick={() => goTo(id)}>
                  <Icon /><span>{words.sections[id]}</span>
                </button>
              );
            })}
          </nav>
          <div className="cp-prefs__foot">
            <SaveNote status={status} />
            <span className="cp-prefs__version">Open Space {__APP_VERSION__}</span>
          </div>
        </aside>
        <div className="cp-prefs__main">
          <header className="cp-prefs__head">
            {matches ? (
              <div><h3>{words.search}</h3></div>
            ) : (
              <>
                <span className="cp-prefs__head-icon"><SectionIcon /></span>
                <div><h3>{words.sections[section]}</h3><p>{words.intros[section]}</p></div>
              </>
            )}
            <button type="button" className="cp-icon-button" aria-label={t.settings.close} title={t.settings.close} onClick={close}><CloseIcon /></button>
          </header>
          <div className="cp-prefs__content" ref={content} data-section={matches ? 'search' : section}>
            {!matches && <>{section !== 'about' && <AppUpdateBanner />}<UpdateBanner /></>}
            {matches ? (
              matches.length ? SETTINGS_SECTIONS.filter((id) => matches.some((entry) => entry.section === id)).map((id) => {
                const found = matches.filter((entry) => entry.section === id);
                const whole = found.some((entry) => entry.row === id);
                return (
                  <section key={id} className="cp-prefs__group" aria-label={words.sections[id]}>
                    <h4 className="cp-prefs__group-title">{words.sections[id]}</h4>
                    {whole ? (
                      <div className="cp-prefs__card">
                        <Row id={id} icon={(() => { const Icon = SECTION_ICONS[id]; return <Icon />; })()} title={words.sections[id]} hint={words.intros[id]}>
                          <button type="button" className="cp-button" onClick={() => goTo(id)}>{words.open}</button>
                        </Row>
                      </div>
                    ) : <div className="cp-prefs__card">{found.map((entry) => row(entry.row as SettingRow))}</div>}
                  </section>
                );
              }) : <p className="cp-prefs__empty">{words.noMatch(query.trim())}</p>
            ) : body(section)}
          </div>
        </div>
      </div>
    </Modal>
  );
}
