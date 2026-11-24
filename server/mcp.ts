// The open-space MCP server: lets an agent (or another program of this computer) drive Open Space. Served by Open Space
// itself over MCP's Streamable HTTP transport (JSON-RPC in a POST, the answer as JSON: no stream is needed), at
// /mcp/<session>/<key> for each session (given in its --mcp-config, like the browser's Playwright: the key, an HMAC of
// the secret, lets it in without a cookie) and at /mcp/external/<key> for another program, once the user turned that
// access on in the Automates panel (a random key kept in OFFICE_DIR/mcp-key, replaced when regenerated).
//
// What it can do: list, create, change, start and delete triggers, start a session, add someone to the crew, read and change a
// short list of harmless settings. Never: keys, secrets, the allowed folders, security, the folders' trust. A session's
// calls go through Claude Code's permissions like any tool (its permission mode); the external program is the user's.
// The external program alone also answers the sessions (a bot that relays the permissions to a phone): a session never
// gets these tools, or it could approve its own requests. A messenger's agent (server/messengers.ts, at
// /mcp/messenger/<bot>/<key>) follows the sessions, writes to them, stops them and sends files to its chat, but never
// answers a permission: that stays the user's buttons. A request for keys (os-secret) is only answered from the page.
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Job } from '../shared/jobs.ts';
import { ACCOUNTS_BROWSERS, type AccountsBrowser, type PermissionDecision, type PermissionPrompt, type Preferences, type SessionInfo } from '../shared/protocol.ts';
import type { AgentRole } from '../shared/automata.ts';
import { MAX_MOD_REQUEST, type ModInfo } from '../shared/mods.ts';
import { arrangeTiles, tileSizeOf, type AskedTile } from '../shared/dashboard-grid.ts';
import { DASHBOARD_COLUMNS, DASHBOARD_ROW, MAX_DASHBOARD_NAME, MAX_DASHBOARDS, type Dashboard } from '../shared/dashboards.ts';
import { MCP_SERVER_NAME, SWITCH_BROWSER, type Trigger, type TriggerError, type TriggerRun } from '../shared/triggers.ts';
import { st } from './i18n/index.ts';
import { MAX_PENDING } from '../shared/pending.ts';
import { asArray, asJson, asString, isJson, type Json } from './json.ts';
import type { PmBook } from './pm.ts';
import { callPmTool, isPmTool, PM_TOOLS } from './pm-tools.ts';

/** The protocol versions known; another asked for gets the newest. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
/** The largest request taken. */
export const MAX_MCP_BODY = 256 * 1024;
/** The name of the server in a --mcp-config: its tools are mcp__open-space__<tool>. */
export const MCP_SERVER = MCP_SERVER_NAME;

/** The settings the MCP server reads and changes: how the office looks and behaves, nothing about access or safety. */
export const MCP_SETTINGS = [
  'language', 'theme', 'pet', 'festivals', 'officeLife', 'notifications', 'autoTag', 'autoTagRule', 'remoteByDefault', 'model', 'effort',
  'idleCompact', 'timeFormat', 'timestamps', 'turnDuration', 'detailedActions', 'reduceMotion', 'glassOpacity', 'windowStyle', 'tagColors',
  'copyOnSelect', 'autoPip', 'agentCursor',
] as const satisfies readonly (keyof Preferences)[];

/** A session's key to the MCP server, from Open Space's secret. */
export const sessionMcpKey = (secret: string, sessionId: string) => createHmac('sha256', secret).update(`mcp:${sessionId}`).digest('base64url');
/** A messenger's agent's key to the MCP server. */
export const messengerMcpKey = (secret: string, botId: string) => createHmac('sha256', secret).update(`mcp-messenger:${botId}`).digest('base64url');

/** The --mcp-config that gives a session the open-space server. */
export const openSpaceMcpConfig = (url: string) => JSON.stringify({ mcpServers: { [MCP_SERVER]: { type: 'http', url } } });

/** The external key (OFFICE_DIR/mcp-key, 0600): read, made anew, or removed (the access is then off). */
export class ExternalKey {
  private readonly file: string;
  private key: string | null = null;
  constructor(file: string) {
    this.file = file;
    try {
      const stored = readFileSync(file, 'utf8').trim();
      this.key = /^[\w-]{43,}$/.test(stored) ? stored : null;
    } catch { /* off */ }
  }
  get current() { return this.key; }
  /** A new key; the one before stops working. */
  renew() {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    this.key = randomBytes(32).toString('base64url');
    writeFileSync(this.file, `${this.key}\n`, { mode: 0o600 });
    return this.key;
  }
  disable() {
    this.key = null;
    rmSync(this.file, { force: true });
  }
}

/** Who calls: a session (its id), the external program, or a messenger's agent (its bot's id). */
export type Caller = { session: string } | { external: true } | { messenger: string };
type Audience = 'session' | 'external' | 'messenger';
const audienceOf = (caller: Caller): Audience => ('session' in caller ? 'session' : 'external' in caller ? 'external' : 'messenger');

/** What the pm_* tools reach of Open Space (index.ts, server/pm-tools.ts). */
export interface PmApi {
  /** the session is a PM (SessionInfo.pm), the setting is on and its folder approved */
  isPm: (sessionId: string) => boolean;
  book: PmBook;
  now: () => number;
  /** starts a worker of `pm` in its permission mode; throws when the folder is not allowed, or runs code and was never approved */
  startWorker: (pm: string, options: { brief: string; cwd?: string; model?: string; effort?: string; isolate?: boolean }) => Promise<SessionInfo>;
  stopWorker: (worker: string) => void;
  /**
   * marks the session as a worker of `pm` (SessionInfo.pmOf) unless it is another PM's: false then. Synchronous, so that of
   * two PMs adopting the same session at once only one gets it.
   */
  claimWorker: (session: string, pm: string) => boolean;
  /** the session is no longer a worker of `pm` (its pmOf cleared, only if it is `pm`) */
  releaseWorker: (session: string, pm: string) => void;
}

/** What the tools reach of Open Space (index.ts). */
export interface OpenSpaceApi {
  triggers: () => Trigger[];
  lastRuns: () => TriggerRun[];
  saveTrigger: (id: string | undefined, raw: Json) => Promise<{ trigger: Trigger } | { error: TriggerError }>;
  runTrigger: (id: string) => Promise<TriggerRun>;
  /** removes the trigger and its keys; false when there is no such trigger */
  deleteTrigger: (id: string) => Promise<boolean>;
  /** starts a session like the page (crew name, trust rules); `remote`: Remote Control on */
  startSession: (options: { cwd: string; prompt: string; name?: string; model?: string; permissionMode?: string; role?: string; remote: boolean }) => Promise<SessionInfo>;
  addMember: (name: string, jobs: Job[]) => Promise<void>;
  crew: () => { name: string; jobs: Job[] }[];
  roles: (cwd: string) => Promise<AgentRole[]>;
  settings: () => Preferences;
  changeSettings: (changes: Json) => Promise<void>;
  /** the folder of the calling session, for what is created without one */
  callerFolder: (caller: Caller) => string | null;
  sessions: () => SessionInfo[];
  /** what the session said last, '' when nothing yet */
  lastWords: (sessionId: string) => string;
  /** these throw when the session is unknown */
  send: (sessionId: string, text: string) => void;
  answer: (sessionId: string, requestId: string, decision: PermissionDecision) => void;
  reply: (sessionId: string, requestId: string, answers: Record<string, string>) => void;
  interrupt: (sessionId: string) => void;
  /** puts the session to rest (like Rest in Open Space): its process and browser go, it no longer counts among the live ones */
  rest: (sessionId: string) => Promise<void>;
  remote: (sessionId: string, enabled: boolean) => void;
  rename: (sessionId: string, name: string) => void;
  /** replaces what the session leaves pending with these lines, untrusted (shared/pending.ts tidies them); returns those the user removed before, left out */
  setPending: (sessionId: string, items: unknown[]) => string[];
  /** closes the session once its turn ends */
  finish: (sessionId: string) => void;
  /** switch_browser, the user's yes given: the session goes on with that browser once its turn ends ('same': it has it) */
  switchBrowser: (sessionId: string, browser: AccountsBrowser) => 'switching' | 'same';
  /** the user's bots, to name in a trigger's `messengers` */
  bots: () => { id: string; name: string; username: string | null }[];
  mods: () => ModInfo[];
  /** a new mod's folder, and the session that writes it as the Mods panel makes them unless `bySession` is false (the caller writes it) */
  createMod: (request: string, bySession: boolean) => Promise<{ mod: ModInfo; sessionId: string | null }>;
  /** the rules for writing a mod (the mods folder's CLAUDE.md) */
  modGuide: () => string;
  /** the change asked of a mod, to its open session or a new one in its folder; null when there is no such mod */
  editMod: (id: string, request: string) => Promise<{ sessionId: string } | null>;
  /** keeps these dashboards of mods (Preferences.dashboards), every page shown them at once */
  saveDashboards: (dashboards: Dashboard[]) => Promise<void>;
  /** puts the mod's folder in the Trash; false when there is no such mod */
  deleteMod: (id: string) => Promise<boolean>;
  /** sends a file of an allowed folder to a bot's chat */
  sendFile: (botId: string, file: string, caption: string) => Promise<void>;
  /** the project managers' tools; none: no session gets them */
  pm?: PmApi;
}

/** `for`: who is given it (everyone when absent). */
export interface Tool { name: string; description: string; inputSchema: Json; annotations: Json; for?: readonly Audience[] }

const FOLLOWERS: readonly Audience[] = ['external', 'messenger'];

const triggerFields: Json = {
  name: { type: 'string', description: 'Short name shown in Open Space' },
  cwd: { type: 'string', description: 'Absolute project folder, inside the folders Open Space allows (default: the calling session\'s folder)' },
  prompt: { type: 'string', description: 'First message of each run' },
  kind: { type: 'string', enum: ['cron', 'webhook'] },
  cron: { type: 'string', description: 'For kind cron: 5 fields, local time, e.g. "0 8 * * 1-5"' },
  enabled: { type: 'boolean' },
  role: { type: 'string', description: 'Claude Code role (.claude/agents/<role>.md) the run uses as --agent (optional)' },
  model: { type: 'string', description: 'Model alias or name (optional)' },
  permissionMode: { type: 'string', enum: ['auto', 'acceptEdits', 'manual', 'plan'] },
  remote: { type: 'boolean', description: 'Remote Control on for each run (default true)' },
  browser: { type: 'string', enum: ['', ...ACCOUNTS_BROWSERS], description: 'The browser of the user\'s accounts its runs use: "chrome" (their own Chrome), "shared", or "" for the setting\'s. Only the external program sets it, never a session.' },
  allowedTools: { type: 'array', items: { type: 'string' }, description: 'Claude Code permission rules its runs use without asking, e.g. "Bash(git push *)". Only the external program sets them, never a session.' },
  messengers: { type: 'array', items: { type: 'string' }, description: 'Bots told what its runs wait for and the files they send, by name or @username (the user\'s bots, Connections page in Open Space); [] for none' },
  notifyDone: { type: 'boolean', description: 'Its bots are also told when a run finishes (default true)' },
  maxCost: { type: 'number', description: 'A run is stopped once it has spent this many dollars, estimated at list prices (0: no cap, the default)' },
  maxMinutes: { type: 'number', description: 'A run is stopped after this many minutes (0: no cap, the default)' },
  restrict: {
    type: 'object', additionalProperties: false,
    description: 'What its runs start without, for a lighter start. Each key only turns something off; the keys left out stay as they were.',
    properties: {
      plugins: { type: 'array', items: { type: 'string' }, description: 'Plugins turned off, as "name@marketplace"; "*" for every plugin turned on in the user\'s ~/.claude/settings.json' },
      mcpServers: { type: 'array', items: { type: 'string' }, description: 'MCP servers turned off, by name; never open-space nor the browser servers Open Space adds' },
      claudeMd: { type: 'array', items: { type: 'string' }, description: 'CLAUDE.md files not loaded at start: absolute paths or globs, e.g. "/path/to/repo/CLAUDE.md", "/path/to/notes/**", "**/legacy/CLAUDE.md". From a session: project files by absolute path only, never the user\'s ~/.claude ones nor a glob' },
      autoMemoryOff: { type: 'boolean', description: 'true: auto memory off' },
    },
  },
};

const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const TOOLS: Tool[] = [
  { name: 'list_triggers', description: 'Lists Open Space triggers (scheduled or webhook-started sessions) and their latest runs.', inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'create_trigger', description: 'Creates a trigger that starts an Open Space session on a schedule (cron) or from a webhook: for a task that comes back, never for a one-off one (to send the user a file now, send_file).', inputSchema: { type: 'object', properties: triggerFields, required: ['name', 'prompt', 'kind'] }, annotations: write },
  { name: 'update_trigger', description: 'Changes an existing trigger; only the fields given change.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...triggerFields }, required: ['id'] }, annotations: write },
  { name: 'delete_trigger', description: 'Deletes a trigger for good (its past runs stay in their sessions).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { ...write, destructiveHint: true } },
  { name: 'run_trigger', description: 'Starts a trigger\'s run now (a new session). A webhook trigger already running 3 queues it; a cron trigger whose previous run still works skips it.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: write },
  {
    name: 'create_session', description: 'Starts a new Open Space session in a project folder with a first message.',
    inputSchema: { type: 'object', properties: {
      cwd: triggerFields.cwd, prompt: { type: 'string', description: 'First message' }, name: { type: 'string', description: 'Crew member or name (optional)' },
      model: triggerFields.model, permissionMode: triggerFields.permissionMode, role: triggerFields.role,
      remote: { type: 'boolean', description: 'Remote Control on, to follow and answer it from the Claude app (default false)' },
    }, required: ['prompt'] },
    annotations: write,
  },
  { name: 'list_roles', description: 'Lists the Claude Code roles (.claude/agents) a session of a folder can use.', inputSchema: { type: 'object', properties: { cwd: triggerFields.cwd } }, annotations: read },
  { name: 'list_crew', description: 'Lists the Open Space crew: the names sessions are given, and their jobs.', inputSchema: { type: 'object', properties: {} }, annotations: read },
  {
    name: 'create_agent', description: 'Adds someone to the Open Space crew (like Crew > Add): a first name sessions can be given, and optionally their jobs, so that requests about them go to this agent.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, jobs: { type: 'array', items: { type: 'string', enum: ['cyber', 'devops', 'tech', 'product', 'design', 'data', 'marketing', 'hr'] } } }, required: ['name'] },
    annotations: write,
  },
  { name: 'list_sessions', for: FOLLOWERS, description: 'Lists the Open Space sessions: state (work, perm = waits for an answer, wait = done with its turn), what they wait for (permissions and questions, with their requestId) and what they said last. Poll it to relay permissions.', inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'send_message', for: FOLLOWERS, description: 'Sends a message to a session, as if typed in Open Space (it waits for the end of a turn under way).', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, text: { type: 'string' } }, required: ['sessionId', 'text'] }, annotations: write },
  {
    name: 'answer_permission', for: ['external'],
    description: 'Answers what a session waits for (list_sessions): a permission with decision allow, deny or always (when canAlways), or a question with answers (question text to the label of the option chosen).',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, requestId: { type: 'string' }, decision: { type: 'string', enum: ['allow', 'deny', 'always'] }, answers: { type: 'object' } }, required: ['sessionId', 'requestId'] },
    annotations: write,
  },
  { name: 'stop_session', for: FOLLOWERS, description: 'Interrupts what a session is doing (like Stop in Open Space); it stays open and keeps its process, so its place among the live sessions too (rest_session frees it).', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] }, annotations: write },
  { name: 'rest_session', for: FOLLOWERS, description: 'Puts a session to rest (like Rest in Open Space): its process and browser stop, which frees its place among the live sessions; a turn under way is cut short. Its conversation stays, and its next message wakes it up.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] }, annotations: write },
  { name: 'set_remote', for: FOLLOWERS, description: 'Turns Remote Control on or off for a session, to follow and answer it from the Claude app of the phone.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['sessionId', 'enabled'] }, annotations: write },
  // what a session does to itself only, nothing of the user's: read-only to Claude Code, so that a run in plan mode may too
  { name: 'rename_session', for: ['session'], description: 'Renames your own session in Open Space: a short name for what you work on, e.g. a ticket\'s key.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, annotations: read },
  {
    name: 'set_pending', for: ['session'],
    description: 'Sets what only the user can still settle for your task, replacing the previous list: a key or an access to give, a step to do by hand, a decision to make. Not the state of git (Open Space reads it itself), not what you could do next, not suggestions: when in doubt, leave it out. Call it with an empty list once all is settled. One short line per item.',
    inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' }, description: 'One short line per item, at most 8' } }, required: ['items'] },
    annotations: read,
  },
  {
    name: SWITCH_BROWSER, for: ['session'],
    description: 'Switches the browser of the user\'s accounts your session uses: "chrome" (the user\'s own Chrome, through Claude in Chrome, the default) or "shared" (Open Space\'s shared browser). Only when the user asked for it in this conversation or in your task, never on your own. The user confirms it in Open Space, Telegram or the Claude app; once it is done, end your turn: Open Space relaunches your session with that browser and tells you to go on.',
    inputSchema: { type: 'object', properties: { browser: { type: 'string', enum: [...ACCOUNTS_BROWSERS] }, reason: { type: 'string', description: 'What the user asked for, in a few words (shown to them with the confirmation)' } }, },
    annotations: write,
  },
  { name: 'finish_run', for: ['session'], description: 'For an automaton\'s run only: says your task is done and nothing waits for the user; your session closes at the end of this turn (its conversation stays in Resume).', inputSchema: { type: 'object', properties: {} }, annotations: read },
  {
    name: 'send_file', for: ['session', 'messenger'],
    description: 'Sends a file to the user\'s chat (a screenshot, a video, a PDF) right now: its absolute path, inside the folders Open Space allows or a file a session sent. For a one-off "send me this on Telegram"; never make a trigger for it.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, caption: { type: 'string' }, bot: { type: 'string', description: 'From a session: the bot, by name or @username (the user\'s bots, Connections page in Open Space); optional when there is only one; with several and none given by the user, ask them which' } }, required: ['path'] },
    annotations: write,
  },
  { name: 'list_mods', description: 'Lists the Open Space mods: small windows the user\'s agents make (a page in a folder), with their id, name and folder.', inputSchema: { type: 'object', properties: {} }, annotations: read },
  {
    name: 'create_mod',
    description: 'Makes a new mod, e.g. "my Claude costs this week". From a session: makes its folder (a draft from the starter) and gives you its path and the rules; you then write the mod yourself, there. build: "session" instead hands it to a new session that builds it in the background, like Mods > New mod (always the case from outside a session).',
    inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'What the mod should show or do, in the user\'s words' }, build: { type: 'string', enum: ['self', 'session'] } }, required: ['request'] },
    annotations: write,
  },
  { name: 'update_mod', description: 'Asks for a change to a mod: its session (or a new one in its folder) makes it.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, request: { type: 'string', description: 'The change, in the user\'s words' } }, required: ['id', 'request'] }, annotations: write },
  { name: 'delete_mod', description: 'Deletes a mod (its folder goes to the Trash).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { ...write, destructiveHint: true } },
  { name: 'list_dashboards', description: 'Lists the dashboards of Open Space\'s Dashboards view: grids of mods, with each tile\'s mod and place (x, w in columns of 12; y, h in rows).', inputSchema: { type: 'object', properties: {} }, annotations: read },
  {
    name: 'save_dashboard',
    description: `Makes a dashboard of mods in Open Space's Dashboards view, or replaces the tiles of one (give its id). The grid has ${DASHBOARD_COLUMNS} columns and rows of ${DASHBOARD_ROW} px (a row and its gap: 44 px, so h 8 is about 340 px high). Each tile is a mod id from list_mods; x (0 to 11) and w (2 to 12) count in columns, y and h in rows. Leave x and y out to fill the first free spot in the order given (left to right, then the next row); leave w and h out for the size of the mod's own window. Tiles in the way are pushed down and every tile moves up as far as it can, like Grafana. A mod at most once per dashboard. To lay out well: related mods side by side, wide charts w 12, small cards w 3 or 4, same height on a row.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The dashboard to change (list_dashboards); none to make a new one' },
        name: { type: 'string', description: 'Its name, shown on its tab (needed for a new one)' },
        tiles: { type: 'array', items: { type: 'object', properties: { mod: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' } }, required: ['mod'] } },
      },
      required: ['tiles'],
    },
    annotations: write,
  },
  { name: 'delete_dashboard', description: 'Deletes a dashboard (its mods stay).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { ...write, destructiveHint: true } },
  { name: 'get_settings', description: `Reads Open Space settings that are safe to change: ${MCP_SETTINGS.join(', ')}.`, inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'update_settings', description: `Changes some of these Open Space settings: ${MCP_SETTINGS.join(', ')}. Others are refused.`, inputSchema: { type: 'object', properties: { settings: { type: 'object' } }, required: ['settings'] }, annotations: write },
];

const BUILD_IT_YOURSELF = 'Write the mod yourself in `folder`, following `guide` (the CLAUDE.md of the mods folder): mod.json, index.html, then draft: false. ' +
  'Its address, to test it in your browser, is in `.address` there. If you cannot write in that folder, ask the user to allow it.';

/** A trigger as an agent sees it: never its webhook token. */
const shown = (api: OpenSpaceApi, { token: _token, ...trigger }: Trigger, runs: TriggerRun[]) => {
  const bots = api.bots();
  const messengers = trigger.messengers.map((id) => bots.find((bot) => bot.id === id)?.name ?? id);
  return { ...trigger, messengers, lastRuns: runs.filter((run) => run.triggerId === trigger.id).slice(0, 3) };
};

/** A trigger's bots, named as the user knows them (name, @username) or by id. */
function botIds(api: OpenSpaceApi, names: unknown): { ids: unknown } | { unknown: string } {
  if (!Array.isArray(names)) return { ids: names };
  const bots = api.bots();
  const ids: string[] = [];
  for (const name of names) {
    const wanted = typeof name === 'string' ? name.trim().replace(/^@/, '').toLowerCase() : '';
    const bot = bots.find((each) => each.id === name || each.name.toLowerCase() === wanted || each.username?.toLowerCase() === wanted);
    if (!bot) return { unknown: String(name) };
    ids.push(bot.id);
  }
  return { ids };
}

/** The bot a session sends a file to: the one named, or the only one. */
function chosenBot(api: OpenSpaceApi, name: unknown): { id: string } | { error: string } {
  const known = api.bots().map((bot) => bot.name);
  if (!asString(name)) return known.length === 1 ? { id: api.bots()[0].id } : { error: known.length ? st.triggers.mcp.whichBot(known) : st.triggers.mcp.noBot };
  const found = botIds(api, [name]);
  return 'unknown' in found ? { error: st.triggers.mcp.unknownBot(found.unknown, known) } : { id: (found.ids as string[])[0] };
}

const givenTo = (tool: Tool, caller: Caller) => !tool.for || tool.for.includes(audienceOf(caller));

/** The tools a caller is given: a session never gets those that follow or answer the sessions; a PM session also gets the pm_* ones. */
export const toolsFor = (caller: Caller, isPm = false) =>
  [...TOOLS.filter((each) => givenTo(each, caller)), ...(isPm && 'session' in caller ? PM_TOOLS : [])].map(({ for: _for, ...each }) => each);

/** A wait as the external program sees it; a request for keys only says so, it is answered from the page. */
export const shownWait = ({ requestId, tool, detail, canAlways, questions, secrets }: PermissionPrompt) => (secrets
  ? { requestId, kind: 'keys', note: st.triggers.mcp.keysInPage }
  : questions ? { requestId, kind: 'question', questions: questions.map(({ question, options, multiSelect }) => ({ question, options: options.map((option) => option.label), multiSelect })) }
  : { requestId, kind: 'permission', tool, detail, canAlways });

export const text = (value: unknown) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
export const failure = (message: string) => ({ ...text(message), isError: true });

/** Runs a tool. Errors a tool meets are answered as a tool result with isError, as MCP wants. `isPm`: the caller is a PM session. */
export async function callTool(api: OpenSpaceApi, caller: Caller, name: string, args: Json, isPm = false): Promise<Json> {
  // refused at once when the caller is no PM (any more): nothing read nor written
  if (isPmTool(name)) return isPm && 'session' in caller ? callPmTool(api, caller.session, name, args) : failure(st.pm.notPm);
  const folder = () => asString(args.cwd) || api.callerFolder(caller) || '';
  const tool = TOOLS.find((each) => each.name === name);
  if (!tool || !givenTo(tool, caller)) return failure(st.triggers.mcp.unknownTool(name));
  const sessionId = asString(args.sessionId);
  const session = () => {
    const found = api.sessions().find((each) => each.id === sessionId);
    if (!found) throw new Error(st.triggers.mcp.noSession(sessionId));
    return found;
  };
  switch (name) {
    case 'list_sessions': return text(api.sessions().filter((each) => each.state !== 'closed').map((each) => ({
      id: each.id, name: each.name, cwd: each.cwd, state: each.state, since: new Date(each.stateSince).toISOString(),
      ...(each.trigger ? { trigger: each.trigger.name } : {}), remote: Boolean(each.remoteSession),
      waitsFor: each.permissions.map(shownWait), lastWords: api.lastWords(each.id).slice(0, 2000),
    })));
    case 'send_message': {
      const words = asString(args.text).trim();
      if (!words) return failure(st.triggers.mcp.noText);
      api.send(session().id, words);
      return text('sent');
    }
    case 'answer_permission': {
      const wait = session().permissions.find((each) => each.requestId === asString(args.requestId));
      if (!wait) return failure(st.triggers.mcp.noWait);
      if (wait.secrets) return failure(st.triggers.mcp.keysInPage);
      if (wait.questions) {
        const answers = Object.fromEntries(Object.entries(asJson(args.answers)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
        if (!Object.keys(answers).length) return failure(st.triggers.mcp.noAnswers);
        api.reply(sessionId, wait.requestId, answers);
        return text('answered');
      }
      const decision = args.decision === 'allow' || args.decision === 'deny' || (args.decision === 'always' && wait.canAlways) ? args.decision : null;
      if (!decision) return failure(st.triggers.mcp.noDecision);
      api.answer(sessionId, wait.requestId, decision);
      return text(decision);
    }
    case 'stop_session': api.interrupt(session().id); return text('stopped: the session keeps its place among the live ones (rest_session frees it)');
    case 'rest_session': await api.rest(session().id); return text('resting');
    case 'set_remote': api.remote(session().id, args.enabled === true); return text(args.enabled === true ? 'on' : 'off');
    case 'rename_session': case 'finish_run': case 'set_pending': {
      if (!('session' in caller)) return failure(st.triggers.mcp.unknownTool(name));
      if (name === 'set_pending') {
        // a call made before Claude Code has the tool's schema comes without arguments: never read that as clearing the list
        if (!Array.isArray(args.items)) return failure(st.triggers.mcp.noItems);
        const removed = api.setPending(caller.session, args.items);
        const saved = args.items.length > MAX_PENDING ? `saved the first ${MAX_PENDING} lines` : 'saved';
        return text(removed.length ? `${saved}; left out, the user removed them and does not want them again: ${removed.join(' | ')}` : saved);
      }
      if (name === 'rename_session') {
        const named = asString(args.name).trim();
        if (!named) return failure(st.triggers.mcp.noName);
        api.rename(caller.session, named);
        return text('renamed');
      }
      if (!api.sessions().find((each) => each.id === caller.session)?.trigger) return failure(st.triggers.mcp.notARun);
      api.finish(caller.session);
      return text(st.triggers.mcp.finishing);
    }
    case SWITCH_BROWSER: {
      if (!('session' in caller)) return failure(st.triggers.mcp.unknownTool(name));
      // a call made before its schema was loaded comes without arguments (seen with 2.1.325): the user's Chrome, what it is for
      const browser = args.browser === undefined ? 'chrome' : ACCOUNTS_BROWSERS.find((known) => known === args.browser);
      if (!browser) return failure(st.triggers.mcp.unknownBrowser);
      return text(api.switchBrowser(caller.session, browser) === 'same' ? st.triggers.mcp.sameBrowser : st.triggers.mcp.switchingBrowser);
    }
    case 'send_file': {
      const bot = 'messenger' in caller ? { id: caller.messenger } : chosenBot(api, args.bot);
      if ('error' in bot) return failure(bot.error);
      await api.sendFile(bot.id, asString(args.path), asString(args.caption).slice(0, 1000));
      return text('sent');
    }
    case 'list_triggers': return text(api.triggers().map((trigger) => shown(api, trigger, api.lastRuns())));
    case 'create_trigger': case 'update_trigger': {
      const id = name === 'update_trigger' ? asString(args.id) : undefined;
      const { id: _id, ...given } = args;
      const fields: Record<string, unknown> = { ...given };
      // an agent would widen its own rights through a trigger it starts
      if (!('external' in caller) && fields.allowedTools !== undefined) return failure(st.triggers.mcp.rulesFromPage);
      // nor reach the user's Chrome without the yes switch_browser asks for; its restrictions only take away, so a session may set them
      if (!('external' in caller) && fields.browser !== undefined) return failure(st.triggers.mcp.browserFromPage);
      // and the user's own CLAUDE.md files stay loaded: a run would otherwise drop the rules they set for every session
      if (!('external' in caller) && dropsUserRules(fields.restrict)) return failure(st.triggers.mcp.claudeMdFromPage);
      if (fields.messengers !== undefined) {
        const bots = botIds(api, fields.messengers);
        if ('unknown' in bots) return failure(st.triggers.mcp.unknownBot(bots.unknown, api.bots().map((bot) => bot.name)));
        fields.messengers = bots.ids;
      }
      const saved = await api.saveTrigger(id, name === 'create_trigger' ? { ...fields, cwd: folder() } : fields);
      return 'error' in saved ? failure(st.triggers.errors[saved.error]) : text(shown(api, saved.trigger, []));
    }
    case 'delete_trigger': return (await api.deleteTrigger(asString(args.id))) ? text('deleted') : failure(st.triggers.errors.unknown);
    case 'run_trigger': {
      const run = await api.runTrigger(asString(args.id));
      return run.outcome === 'started' || run.outcome === 'queued' ? text(run) : failure(run.error ?? run.outcome);
    }
    case 'create_session': {
      const session = await api.startSession({
        cwd: folder(), prompt: asString(args.prompt), remote: args.remote === true,
        ...(asString(args.name) ? { name: asString(args.name) } : {}), ...(asString(args.model) ? { model: asString(args.model) } : {}),
        ...(asString(args.permissionMode) ? { permissionMode: asString(args.permissionMode) } : {}), ...(asString(args.role) ? { role: asString(args.role) } : {}),
      });
      return text({ id: session.id, name: session.name, cwd: session.cwd, permissionMode: session.permissionMode });
    }
    case 'list_roles': return text(await api.roles(folder()));
    case 'list_crew': return text(api.crew());
    case 'create_agent': {
      const member = asString(args.name).trim();
      if (!member) return failure(st.triggers.mcp.noMember);
      await api.addMember(member, asArray(args.jobs).filter((job): job is Job => typeof job === 'string') as Job[]);
      return text(api.crew().find((each) => each.name === member) ?? member);
    }
    case 'list_mods': return text(api.mods().map(({ id, name, description, icon, folder, draft }) => ({ id, name, description, icon, folder, draft })));
    case 'create_mod': {
      const request = asString(args.request).trim().slice(0, MAX_MOD_REQUEST);
      if (!request) return failure(st.mods.mcp.noRequest);
      const self = 'session' in caller && args.build !== 'session';
      const { mod, sessionId } = await api.createMod(request, !self);
      if (!self) return text({ id: mod.id, folder: mod.folder, sessionId });
      return text({ id: mod.id, folder: mod.folder, next: BUILD_IT_YOURSELF, guide: api.modGuide() });
    }
    case 'update_mod': {
      const request = asString(args.request).trim().slice(0, MAX_MOD_REQUEST);
      if (!request) return failure(st.mods.mcp.noRequest);
      const edited = await api.editMod(asString(args.id), request);
      return edited ? text(edited) : failure(st.mods.mcp.unknown(api.mods().map((mod) => mod.id)));
    }
    case 'delete_mod': return (await api.deleteMod(asString(args.id))) ? text('deleted') : failure(st.mods.mcp.unknown(api.mods().map((mod) => mod.id)));
    case 'list_dashboards': {
      const names = new Map(api.mods().map((mod) => [mod.id, mod.name]));
      return text((api.settings().dashboards ?? []).map(({ id, name, tiles }) => ({ id, name, tiles: tiles.map((tile) => ({ ...tile, name: names.get(tile.mod) ?? null })) })));
    }
    case 'save_dashboard': {
      const dashboards = api.settings().dashboards ?? [];
      const id = asString(args.id);
      const before = id ? dashboards.find((each) => each.id === id) : undefined;
      if (id && !before) return failure(st.mods.mcp.unknownDashboard(dashboards.map((each) => `${each.id} (${each.name})`)));
      if (!before && dashboards.length >= MAX_DASHBOARDS) return failure(st.mods.mcp.tooManyDashboards(MAX_DASHBOARDS));
      const name = asString(args.name).replace(/\s+/g, ' ').trim().slice(0, MAX_DASHBOARD_NAME) || before?.name || '';
      if (!name) return failure(st.mods.mcp.noDashboardName);
      const mods = api.mods();
      const cell = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
      const asked = asArray(args.tiles).filter(isJson).map((raw): AskedTile => ({ mod: asString(raw.mod), x: cell(raw.x), y: cell(raw.y), w: cell(raw.w), h: cell(raw.h) }));
      const unknown = asked.filter((tile) => !mods.some((mod) => mod.id === tile.mod)).map((tile) => tile.mod || '?');
      if (unknown.length) return failure(st.mods.mcp.unknownTiles(unknown, mods.map((mod) => mod.id)));
      const tiles = arrangeTiles(asked, (mod) => { const found = mods.find((each) => each.id === mod); return tileSizeOf(found?.width ?? 380, found?.height ?? 320); });
      const saved: Dashboard = { id: before?.id ?? `d${randomBytes(5).toString('hex')}`, name, tiles };
      await api.saveDashboards(before ? dashboards.map((each) => (each.id === saved.id ? saved : each)) : [...dashboards, saved]);
      return text(saved);
    }
    case 'delete_dashboard': {
      const dashboards = api.settings().dashboards ?? [];
      const id = asString(args.id);
      if (!dashboards.some((each) => each.id === id)) return failure(st.mods.mcp.unknownDashboard(dashboards.map((each) => `${each.id} (${each.name})`)));
      await api.saveDashboards(dashboards.filter((each) => each.id !== id));
      return text('deleted');
    }
    case 'get_settings': {
      const settings = api.settings();
      return text(Object.fromEntries(MCP_SETTINGS.map((key) => [key, settings[key]])));
    }
    case 'update_settings': {
      const asked = asJson(args.settings);
      const refused = Object.keys(asked).filter((key) => !(MCP_SETTINGS as readonly string[]).includes(key));
      if (refused.length) return failure(refused.map((key) => st.triggers.mcp.settingRefused(key)).join('\n'));
      await api.changeSettings(asked);
      const settings = api.settings();
      return text(Object.fromEntries(Object.keys(asked).map((key) => [key, settings[key as keyof Preferences]])));
    }
    default: return failure(st.triggers.mcp.unknownTool(name));
  }
}

const result = (id: unknown, value: Json) => ({ jsonrpc: '2.0', id, result: value });
const error = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** One JSON-RPC message; null for a notification (nothing to answer). */
async function answer(api: OpenSpaceApi, caller: Caller, message: unknown, version: string, isPm: boolean): Promise<Json | null> {
  if (!isJson(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(isJson(message) ? message.id : null, -32600, 'Invalid request');
  if (message.id === undefined) return null;
  const params = asJson(message.params);
  switch (message.method) {
    case 'initialize': {
      const asked = asString(params.protocolVersion);
      return result(message.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: MCP_SERVER, version },
        instructions: 'Drives Open Space, the app the sessions run in: triggers (sessions started on a schedule or by a webhook), new sessions, the crew, the mods and their dashboards, and a few display settings.',
      });
    }
    case 'ping': return result(message.id, {});
    case 'tools/list': return result(message.id, { tools: toolsFor(caller, isPm) });
    case 'tools/call': {
      try {
        return result(message.id, await callTool(api, caller, asString(params.name), asJson(params.arguments), isPm));
      } catch (problem) {
        return result(message.id, failure(problem instanceof Error ? problem.message : String(problem)));
      }
    }
    default: return error(message.id, -32601, `Method not found: ${message.method}`);
  }
}

/** A POST to the MCP address: the JSON-RPC answer, or null when there is nothing to answer (202). */
export async function handleMcp(api: OpenSpaceApi, caller: Caller, body: string, version: string): Promise<{ status: number; json: unknown }> {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { status: 400, json: error(null, -32700, 'Parse error') }; }
  // asked once per request: whether the calling session is a PM now (its tools listed and callable)
  const isPm = 'session' in caller && api.pm?.isPm(caller.session) === true;
  if (Array.isArray(parsed)) {
    const answers = (await Promise.all(parsed.map((message) => answer(api, caller, message, version, isPm)))).filter((each) => each !== null);
    return answers.length ? { status: 200, json: answers } : { status: 202, json: null };
  }
  const one = await answer(api, caller, parsed, version, isPm);
  return one ? { status: 200, json: one } : { status: 202, json: null };
}

/**
 * Whether restrictions a session gives would leave out a CLAUDE.md of the user's ~/.claude, or any file through a glob
 * (a glob may match those too). The page and the external program may still; a session names project files one by one.
 */
function dropsUserRules(restrict: unknown): boolean {
  const claudeMd = restrict && typeof restrict === 'object' && 'claudeMd' in restrict ? restrict.claudeMd : undefined;
  if (!Array.isArray(claudeMd)) return false;
  const userDir = path.join(os.homedir(), '.claude');
  return claudeMd.some((entry) => typeof entry === 'string' && (/[*?[{]/.test(entry) || path.resolve(entry) === userDir || path.resolve(entry).startsWith(userDir + path.sep)));
}
