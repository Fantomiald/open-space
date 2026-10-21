// Claude Code's own settings (its /config) that Open Space can set for its sessions only: kept in Open Space's
// settings, handed to each `claude` as --settings, so the terminal's Claude Code keeps its own. A key left out runs
// as Claude Code's settings files say (what the page shows as "as in Claude Code").

/** The on/off settings, by their settings.json key. */
export const CLAUDE_SWITCHES = [
  'alwaysThinkingEnabled', 'autoCompactEnabled', 'autoContinueAtUsageLimit', 'enableWorkflows', 'workflowKeywordTriggerEnabled',
  'enableArtifact', 'useAutoModeDuringPlan',
] as const;
export type ClaudeSwitch = (typeof CLAUDE_SWITCHES)[number];

export const WORKFLOW_SIZES = ['small', 'medium', 'large', 'unrestricted'] as const;
export type WorkflowSize = (typeof WORKFLOW_SIZES)[number];

/** What a session does with a message from another Claude Code session of the machine. */
export const INBOUND_POLICIES = ['accept', 'hold', 'refuse'] as const;
export type InboundPolicy = (typeof INBOUND_POLICIES)[number];

export type ClaudeSettings = Partial<Record<ClaudeSwitch, boolean>> & {
  outputStyle?: string;
  /** the language Claude answers in, as Claude Code takes it ("french", "ja") */
  language?: string;
  workflowSizeGuideline?: WorkflowSize;
  crossSessionInbound?: InboundPolicy;
};

/** Claude Code's own output styles; the user's are the files of ~/.claude/output-styles. */
export const BUILT_IN_STYLES = ['default', 'Explanatory', 'Learning'] as const;

/** What Claude Code runs with when Open Space sets nothing, and the output styles there are to pick from. */
export interface ClaudeDefaults { current: ClaudeSettings; outputStyles: string[] }

const isJson = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const STYLE = /^[\p{L}\p{N} _.:-]{1,60}$/u;
const LANGUAGE = /^[\p{L} _-]{1,40}$/u;
const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T => values.some((option) => option === value);

/** The settings found in untrusted JSON: what is valid is kept, the rest left out. */
export function parseClaudeSettings(raw: unknown): ClaudeSettings {
  if (!isJson(raw)) return {};
  const found: ClaudeSettings = {};
  for (const key of CLAUDE_SWITCHES) if (typeof raw[key] === 'boolean') found[key] = raw[key];
  if (typeof raw.outputStyle === 'string' && STYLE.test(raw.outputStyle)) found.outputStyle = raw.outputStyle;
  if (typeof raw.language === 'string' && LANGUAGE.test(raw.language.trim())) found.language = raw.language.trim();
  if (isOneOf(WORKFLOW_SIZES, raw.workflowSizeGuideline)) found.workflowSizeGuideline = raw.workflowSizeGuideline;
  if (isOneOf(INBOUND_POLICIES, raw.crossSessionInbound)) found.crossSessionInbound = raw.crossSessionInbound;
  return found;
}

/**
 * What a running session is told when the settings change: each changed key, null for one given back to Claude Code
 * (as `apply_flag_settings` takes it).
 */
export function changedSettings(before: ClaudeSettings, after: ClaudeSettings): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof ClaudeSettings>) {
    if (before[key] !== after[key]) changes[key] = after[key] ?? null;
  }
  return changes;
}
