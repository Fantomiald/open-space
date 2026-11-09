// The triggers: what starts a session on its own, at a time (cron) or when another program calls Open Space (webhook).
// A trigger's run is an ordinary Open Space session, started the same way as from the page (server/triggers.ts), that
// stands in the server room as a robot. Shared by the server, the page and the open-space MCP server.
import { isCron } from './cron.ts';
import { parseMessengerIds, type Messenger } from './messengers.ts';
import { isPermissionMode, type PermissionMode } from './protocol.ts';

export const TRIGGER_KINDS = ['cron', 'webhook'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** What the user (or an agent, through the MCP server) says of a trigger. */
export interface TriggerInput {
  name: string;
  /** the project's folder, inside the allowed roots (checked by the server with server/paths.ts) */
  cwd: string;
  /** the first message of each run */
  prompt: string;
  kind: TriggerKind;
  /** five fields in local time, for a `cron` trigger ('' for a webhook) */
  cron: string;
  enabled: boolean;
  /** a role of Claude Code (.claude/agents/<role>.md of the project or of ~/.claude), run with --agent ('' : none) */
  role: string;
  /** '' : the model of the settings */
  model: string;
  /** never bypassPermissions nor dontAsk (they are not PermissionModes) */
  permissionMode: PermissionMode;
  /** Remote Control turned on for each run (validate from the phone) */
  remote: boolean;
  /**
   * what its runs do without asking, on top of their mode: Claude Code permission rules ("Edit", "Bash(git push *)"),
   * given with --allowedTools. Set from the page or the external program, never by a session (it would widen its own rights).
   */
  allowedTools: string[];
  /** the bots (shared/messengers.ts) told what its runs wait for, the files they send, and with `notifyDone` when they finish */
  messengers: string[];
  notifyDone: boolean;
}

/** A trigger as kept: its input, its id, and for a webhook its token (the page shows it in the URL; the MCP server never). */
export interface Trigger extends TriggerInput {
  id: string;
  token: string;
  createdAt: number;
}

export const RUN_SOURCES = ['cron', 'webhook', 'manual', 'agent', 'test'] as const;
export type TriggerRunSource = (typeof RUN_SOURCES)[number];

/**
 * Whether a firing started a session, waits its turn (a webhook trigger's runs all busy), was cancelled while waiting,
 * was skipped (a cron trigger's previous run still works, or the queue is full), or failed (the reason in `error`).
 */
export const RUN_OUTCOMES = ['started', 'queued', 'cancelled', 'skipped', 'failed'] as const;
export type TriggerRunOutcome = (typeof RUN_OUTCOMES)[number];

/** One firing of a trigger. `at`: when it was asked for. `sessionId`: the session it started, when it did. */
export interface TriggerRun {
  id: string;
  triggerId: string;
  at: number;
  source: TriggerRunSource;
  outcome: TriggerRunOutcome;
  sessionId?: string;
  error?: string;
}

/** What a session started by a trigger keeps of it (SessionInfo.trigger): its robot's colour and its link back. */
export interface TriggerTag { id: string; name: string; role?: string }

/** What the page is told: the triggers, the last firings (newest first), and the open-space MCP access for other programs. */
export interface TriggersState {
  triggers: Trigger[];
  runs: TriggerRun[];
  /** the bots of the chat apps (their tokens never leave the server) */
  messengers: Messenger[];
  /** the names of each trigger's keys, by trigger id (their values never leave the server) */
  keys: Record<string, string[]>;
  /** the address webhooks are posted to, without the trigger's id and token: http://127.0.0.1:<port>/hooks */
  hookBase: string;
  /** the port that only answers webhooks, for a tunnel to point at (null when it could not be opened) */
  hooksPort: number | null;
  /** the MCP address another program of this computer uses, with its key; null while that access is off */
  externalMcp: string | null;
}

export const NO_TRIGGERS: TriggersState = { triggers: [], runs: [], messengers: [], keys: {}, hookBase: '', hooksPort: null, externalMcp: null };

export const MAX_TRIGGERS = 50;
export const MAX_TRIGGER_NAME = 60;
export const MAX_TRIGGER_PROMPT = 20_000;
/** The firings kept, all triggers together. */
export const KEPT_RUNS = 100;
/** The runs of a webhook trigger that work at once (one call, one session); the calls beyond wait their turn. A cron trigger has one. */
export const PARALLEL_HOOK_RUNS = 3;
/** The calls a webhook trigger keeps waiting; one more is skipped. */
export const MAX_QUEUED = 20;
/** The largest webhook body taken; a bigger one is refused (413). */
export const MAX_HOOK_BODY = 64 * 1024;

export const TRIGGER_ID = /^[a-z0-9]{8,32}$/;
/** A role's name as Claude Code names its file: letters, digits, "-", "_", "." (nothing that leaves the folder). */
export const ROLE_NAME = /^[\w][\w.-]{0,63}$/;
/** A Claude Code permission rule: a tool, and what it applies to between brackets. */
export const ALLOW_RULE = /^[A-Za-z][\w-]{0,99}(\([^()\n]{1,200}\))?$/;
export const MAX_ALLOW_RULES = 40;

/** Ready-made sets of rules the page offers; the rules stay editable one by one. */
export const ALLOW_PRESETS = {
  read: ['Read', 'Grep', 'Glob'],
  edit: ['Edit', 'Write'],
  test: ['Bash(npm test *)', 'Bash(npm run *)'],
  commit: ['Bash(git add *)', 'Bash(git commit *)'],
  push: ['Bash(git push *)'],
  pullRequest: ['Bash(gh pr create *)'],
} as const satisfies Record<string, readonly string[]>;
export type AllowPreset = keyof typeof ALLOW_PRESETS;

/** The rules from a list or from text (one per line or separated by commas), without repeats; null when one does not fit. */
export function parseAllowRules(raw: unknown): string[] | null {
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\n|,(?![^(]*\))/) : null;
  if (!items) return null;
  const rules = [...new Set(items.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
  return rules.length <= MAX_ALLOW_RULES && rules.every((rule) => ALLOW_RULE.test(rule)) ? rules : null;
}

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,79}$/;

export const DEFAULT_TRIGGER: TriggerInput = {
  name: '', cwd: '', prompt: '', kind: 'cron', cron: '0 8 * * 1-5', enabled: true, role: '', model: '', permissionMode: 'auto', remote: true, allowedTools: [], messengers: [], notifyDone: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A trigger's input from outside (the page, the MCP server, the file), over `base` for what is left out: null with the
 * reason's key when something does not fit. The folder is checked against the roots by the server, not here.
 */
export function parseTriggerInput(raw: unknown, base: TriggerInput = DEFAULT_TRIGGER): { input: TriggerInput } | { error: TriggerError } {
  if (!isRecord(raw)) return { error: 'invalid' };
  const text = (key: string, fallback: string, max: number) => (typeof raw[key] === 'string' ? (raw[key] as string).trim().slice(0, max) : fallback);
  const flag = (key: string, fallback: boolean) => (typeof raw[key] === 'boolean' ? (raw[key] as boolean) : fallback);
  const kind = TRIGGER_KINDS.find((known) => known === raw.kind) ?? base.kind;
  const permissionMode = raw.permissionMode === undefined ? base.permissionMode : raw.permissionMode;
  if (!isPermissionMode(permissionMode)) return { error: 'mode' };
  const allowedTools = raw.allowedTools === undefined ? base.allowedTools : parseAllowRules(raw.allowedTools);
  if (!allowedTools) return { error: 'rules' };
  const messengers = raw.messengers === undefined ? base.messengers : parseMessengerIds(raw.messengers);
  if (!messengers) return { error: 'invalid' };
  const input: TriggerInput = {
    name: text('name', base.name, MAX_TRIGGER_NAME),
    cwd: text('cwd', base.cwd, 1000),
    prompt: typeof raw.prompt === 'string' ? raw.prompt.slice(0, MAX_TRIGGER_PROMPT) : base.prompt,
    kind,
    cron: kind === 'webhook' ? '' : text('cron', base.cron || DEFAULT_TRIGGER.cron, 100).replace(/\s+/g, ' '),
    enabled: flag('enabled', base.enabled),
    role: text('role', base.role, 64),
    model: text('model', base.model, 80),
    permissionMode,
    remote: flag('remote', base.remote),
    allowedTools,
    messengers,
    notifyDone: flag('notifyDone', base.notifyDone),
  };
  if (!input.name) return { error: 'name' };
  if (!input.cwd) return { error: 'folder' };
  if (!input.prompt.trim()) return { error: 'prompt' };
  if (input.kind === 'cron' && !isCron(input.cron)) return { error: 'cron' };
  if (input.role && !ROLE_NAME.test(input.role)) return { error: 'role' };
  if (input.model && !MODEL_NAME.test(input.model)) return { error: 'model' };
  return { input };
}

export type TriggerError = 'invalid' | 'name' | 'folder' | 'prompt' | 'cron' | 'role' | 'model' | 'mode' | 'rules' | 'unknown' | 'tooMany';

/** The input part of a trigger (to edit it). */
export const inputOf = ({ id: _id, token: _token, createdAt: _createdAt, ...input }: Trigger): TriggerInput => input;

/**
 * The public address of the webhooks (Preferences.hooksAddress) as typed: '' (none), or an http(s) address without
 * query, fragment or trailing slash; null when it is not one.
 */
export function hooksAddressOf(value: string): string | null {
  const typed = value.trim();
  if (!typed) return '';
  if (typed.length > 300 || !/^https?:\/\//i.test(typed)) return null;
  try {
    const url = new URL(typed);
    return url.search || url.hash || url.username || url.password ? null : `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return null; }
}

/** The webhook address of a trigger. */
export const hookUrl = (base: string, trigger: Pick<Trigger, 'id' | 'token'>) => `${base}/${trigger.id}/${trigger.token}`;

/** The last firing of each trigger, by trigger id. */
export function lastRuns(runs: readonly TriggerRun[]): Map<string, TriggerRun> {
  const last = new Map<string, TriggerRun>();
  for (const run of runs) if (!last.has(run.triggerId) || last.get(run.triggerId)!.at < run.at) last.set(run.triggerId, run);
  return last;
}

/** The name of Open Space's own MCP server in a configuration: its tools are mcp__open-space__<tool> (server/mcp.ts). */
export const MCP_SERVER_NAME = 'open-space';
