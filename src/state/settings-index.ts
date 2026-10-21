// Every setting by its row, in its part of the settings dialog: the dialog's own search and the search palette find
// them here by their words.
import { t } from '../i18n/index.ts';
import type { SettingEntry } from './search.ts';
import type { SettingsSection } from './sessions.ts';

export type SettingRow = keyof typeof t.settings.prefs.rows;

/** Where each row lives. A section without rows (usage, shortcuts) is found by its own name. */
export const ROWS: Readonly<Record<SettingRow, SettingsSection>> = {
  language: 'general', timeFormat: 'general', reduceMotion: 'general', sound: 'general', notifications: 'general',
  timestamps: 'general', turnDuration: 'general', copyOnSelect: 'general',
  model: 'sessions', effort: 'sessions', permissions: 'sessions', agentNote: 'sessions',
  thinking: 'claude', outputStyle: 'claude', responseLanguage: 'claude', autoCompact: 'claude', idleCompact: 'claude', autoContinue: 'claude', autoModeInPlan: 'claude',
  workflows: 'claude', ultracodeKeyword: 'claude', workflowSize: 'claude', inbound: 'claude', artifacts: 'claude',
  roots: 'folders', defaultFolder: 'folders',
  festivals: 'office', officeLife: 'office', previewFestival: 'office', previewHour: 'office', crew: 'office',
  journalFolder: 'notes', metricsFile: 'notes',
  version: 'about', claude: 'about', links: 'about', dockApp: 'about',
};

/** The rows that are also in Claude Code's /config, by their name there: shown on the row, and found by it. */
export const CONFIG_LABELS: Readonly<Partial<Record<SettingRow, string>>> = {
  timeFormat: 'Time format', reduceMotion: 'Reduce motion', notifications: 'Notifications', timestamps: 'Show message timestamps',
  turnDuration: 'Show turn duration', copyOnSelect: 'Copy on select', model: 'Model', permissions: 'Default permission mode',
  thinking: 'Thinking mode', outputStyle: 'Output style', responseLanguage: 'Language', autoCompact: 'Auto-compact', idleCompact: 'Idle compaction',
  autoContinue: 'Continue automatically at usage limit', autoModeInPlan: 'Use auto mode during plan', workflows: 'Dynamic workflows',
  ultracodeKeyword: 'Ultracode keyword trigger', workflowSize: 'Dynamic workflow size', inbound: 'Messages from your other sessions', artifacts: 'Artifacts',
};

/** The rows and the sections without rows, with the words they answer to (their title, hint and section). */
export function settingEntries(): SettingEntry[] {
  const words = t.settings.prefs;
  const rows = (Object.keys(ROWS) as SettingRow[]).map((row) => {
    const { title, hint } = words.rows[row] as { title: string; hint?: string };
    return { section: ROWS[row], row, label: title, sectionLabel: words.sections[ROWS[row]], words: `${hint ?? ''} ${CONFIG_LABELS[row] ? `${CONFIG_LABELS[row]} /config` : ''}` };
  });
  const whole = (['usage', 'shortcuts'] as const).map((section) => ({ section, row: section, label: words.sections[section], sectionLabel: words.sections[section], words: words.intros[section] }));
  return [...whole, ...rows];
}
