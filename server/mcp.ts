// The open-space MCP server: lets an agent (or another program of this computer) drive Open Space. Served by Open Space
// itself over MCP's Streamable HTTP transport (JSON-RPC in a POST, the answer as JSON: no stream is needed), at
// /mcp/<session>/<key> for each session (given in its --mcp-config, like the browser's Playwright: the key, an HMAC of
// the secret, lets it in without a cookie) and at /mcp/external/<key> for another program, once the user turned that
// access on in the Automates panel (a random key kept in OFFICE_DIR/mcp-key, replaced when regenerated).
//
// What it can do: list, create, change and start triggers, start a session, add someone to the crew, read and change a
// short list of harmless settings. Never: keys, secrets, the allowed folders, security, the folders' trust. A session's
// calls go through Claude Code's permissions like any tool (its permission mode); the external program is the user's.
// The external program alone also answers the sessions (a bot that relays the permissions to a phone): a session never
// gets these tools, or it could approve its own requests. A messenger's agent (server/messengers.ts, at
// /mcp/messenger/<bot>/<key>) follows the sessions, writes to them, stops them and sends files to its chat, but never
// answers a permission: that stays the user's buttons. A request for keys (os-secret) is only answered from the page.
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Job } from '../shared/jobs.ts';
import type { PermissionDecision, PermissionPrompt, Preferences, SessionInfo } from '../shared/protocol.ts';
import type { AgentRole } from '../shared/automata.ts';
import { MAX_MOD_REQUEST, type ModInfo } from '../shared/mods.ts';
import { MCP_SERVER_NAME, type Trigger, type TriggerError, type TriggerRun } from '../shared/triggers.ts';
import { st } from './i18n/index.ts';
import { asArray, asJson, asString, isJson, type Json } from './json.ts';

/** The protocol versions known; another asked for gets the newest. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
/** The largest request taken. */
export const MAX_MCP_BODY = 256 * 1024;
/** The name of the server in a --mcp-config: its tools are mcp__open-space__<tool>. */
export const MCP_SERVER = MCP_SERVER_NAME;

/** The settings the MCP server reads and changes: how the office looks and behaves, nothing about access or safety. */
export const MCP_SETTINGS = [
  'language', 'theme', 'pet', 'festivals', 'officeLife', 'notifications', 'autoTag', 'remoteByDefault', 'model', 'effort',
  'idleCompact', 'timeFormat', 'timestamps', 'turnDuration', 'detailedActions', 'reduceMotion', 'glassOpacity', 'windowStyle', 'tagColors',
  'copyOnSelect', 'autoPip',
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

/** What the tools reach of Open Space (index.ts). */
export interface OpenSpaceApi {
  triggers: () => Trigger[];
  lastRuns: () => TriggerRun[];
  saveTrigger: (id: string | undefined, raw: Json) => Promise<{ trigger: Trigger } | { error: TriggerError }>;
  runTrigger: (id: string) => Promise<TriggerRun>;
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
  remote: (sessionId: string, enabled: boolean) => void;
  rename: (sessionId: string, name: string) => void;
  /** closes the session once its turn ends */
  finish: (sessionId: string) => void;
  /** the user's bots, to name in a trigger's `messengers` */
  bots: () => { id: string; name: string; username: string | null }[];
  mods: () => ModInfo[];
  /** a new mod's folder and the session that writes it, as the Mods panel makes them */
  createMod: (request: string) => Promise<{ mod: ModInfo; sessionId: string }>;
  /** the change asked of a mod, to its open session or a new one in its folder; null when there is no such mod */
  editMod: (id: string, request: string) => Promise<{ sessionId: string } | null>;
  /** puts the mod's folder in the Trash; false when there is no such mod */
  deleteMod: (id: string) => Promise<boolean>;
  /** sends a file of an allowed folder to a bot's chat */
  sendFile: (botId: string, file: string, caption: string) => Promise<void>;
}

/** `for`: who is given it (everyone when absent). */
interface Tool { name: string; description: string; inputSchema: Json; annotations: Json; for?: readonly Audience[] }

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
  allowedTools: { type: 'array', items: { type: 'string' }, description: 'Claude Code permission rules its runs use without asking, e.g. "Bash(git push *)". Only the external program sets them, never a session.' },
  messengers: { type: 'array', items: { type: 'string' }, description: 'Bots told what its runs wait for and the files they send, by name or @username (the user\'s bots, Connections page in Open Space); [] for none' },
  notifyDone: { type: 'boolean', description: 'Its bots are also told when a run finishes (default true)' },
  maxCost: { type: 'number', description: 'A run is stopped once it has spent this many dollars, estimated at list prices (0: no cap, the default)' },
  maxMinutes: { type: 'number', description: 'A run is stopped after this many minutes (0: no cap, the default)' },
};

const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const TOOLS: Tool[] = [
  { name: 'list_triggers', description: 'Lists Open Space triggers (scheduled or webhook-started sessions) and their latest runs.', inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'create_trigger', description: 'Creates a trigger that starts an Open Space session on a schedule (cron) or from a webhook.', inputSchema: { type: 'object', properties: triggerFields, required: ['name', 'prompt', 'kind'] }, annotations: write },
  { name: 'update_trigger', description: 'Changes an existing trigger; only the fields given change.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...triggerFields }, required: ['id'] }, annotations: write },
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
  { name: 'stop_session', for: FOLLOWERS, description: 'Interrupts what a session is doing (like Stop in Open Space); it stays open.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] }, annotations: write },
  { name: 'set_remote', for: FOLLOWERS, description: 'Turns Remote Control on or off for a session, to follow and answer it from the Claude app of the phone.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['sessionId', 'enabled'] }, annotations: write },
  // what a session does to itself only, nothing of the user's: read-only to Claude Code, so that a run in plan mode may too
  { name: 'rename_session', for: ['session'], description: 'Renames your own session in Open Space: a short name for what you work on, e.g. a ticket\'s key.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, annotations: read },
  { name: 'finish_run', for: ['session'], description: 'For an automaton\'s run only: says your task is done and nothing waits for the user; your session closes at the end of this turn (its conversation stays in Resume).', inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'send_file', for: ['messenger'], description: 'Sends a file to the user\'s chat (a screenshot, a video, a PDF): its absolute path, inside the folders Open Space allows or a file a session sent.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, caption: { type: 'string' } }, required: ['path'] }, annotations: write },
  { name: 'list_mods', description: 'Lists the Open Space mods: small windows the user\'s agents make (a page in a folder), with their id, name and folder.', inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'create_mod', description: 'Makes a new mod, like Mods > New mod: a session builds it in its own folder from what the user asked, e.g. "my Claude costs this week".', inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'What the mod should show or do, in the user\'s words' } }, required: ['request'] }, annotations: write },
  { name: 'update_mod', description: 'Asks for a change to a mod: its session (or a new one in its folder) makes it.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, request: { type: 'string', description: 'The change, in the user\'s words' } }, required: ['id', 'request'] }, annotations: write },
  { name: 'delete_mod', description: 'Deletes a mod (its folder goes to the Trash).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { ...write, destructiveHint: true } },
  { name: 'get_settings', description: `Reads Open Space settings that are safe to change: ${MCP_SETTINGS.join(', ')}.`, inputSchema: { type: 'object', properties: {} }, annotations: read },
  { name: 'update_settings', description: `Changes some of these Open Space settings: ${MCP_SETTINGS.join(', ')}. Others are refused.`, inputSchema: { type: 'object', properties: { settings: { type: 'object' } }, required: ['settings'] }, annotations: write },
];

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

const givenTo = (tool: Tool, caller: Caller) => !tool.for || tool.for.includes(audienceOf(caller));

/** The tools a caller is given: a session never gets those that follow or answer the sessions. */
export const toolsFor = (caller: Caller) => TOOLS.filter((each) => givenTo(each, caller)).map(({ for: _for, ...each }) => each);

/** A wait as the external program sees it; a request for keys only says so, it is answered from the page. */
const shownWait = ({ requestId, tool, detail, canAlways, questions, secrets }: PermissionPrompt) => (secrets
  ? { requestId, kind: 'keys', note: st.triggers.mcp.keysInPage }
  : questions ? { requestId, kind: 'question', questions: questions.map(({ question, options, multiSelect }) => ({ question, options: options.map((option) => option.label), multiSelect })) }
  : { requestId, kind: 'permission', tool, detail, canAlways });

const text = (value: unknown) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ ...text(message), isError: true });

/** Runs a tool. Errors a tool meets are answered as a tool result with isError, as MCP wants. */
export async function callTool(api: OpenSpaceApi, caller: Caller, name: string, args: Json): Promise<Json> {
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
    case 'stop_session': api.interrupt(session().id); return text('stopped');
    case 'set_remote': api.remote(session().id, args.enabled === true); return text(args.enabled === true ? 'on' : 'off');
    case 'rename_session': case 'finish_run': {
      if (!('session' in caller)) return failure(st.triggers.mcp.unknownTool(name));
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
    case 'send_file': {
      if (!('messenger' in caller)) return failure(st.triggers.mcp.unknownTool(name));
      await api.sendFile(caller.messenger, asString(args.path), asString(args.caption).slice(0, 1000));
      return text('sent');
    }
    case 'list_triggers': return text(api.triggers().map((trigger) => shown(api, trigger, api.lastRuns())));
    case 'create_trigger': case 'update_trigger': {
      const id = name === 'update_trigger' ? asString(args.id) : undefined;
      const { id: _id, ...given } = args;
      const fields: Record<string, unknown> = { ...given };
      // an agent would widen its own rights through a trigger it starts
      if (!('external' in caller) && fields.allowedTools !== undefined) return failure(st.triggers.mcp.rulesFromPage);
      if (fields.messengers !== undefined) {
        const bots = botIds(api, fields.messengers);
        if ('unknown' in bots) return failure(st.triggers.mcp.unknownBot(bots.unknown, api.bots().map((bot) => bot.name)));
        fields.messengers = bots.ids;
      }
      const saved = await api.saveTrigger(id, name === 'create_trigger' ? { ...fields, cwd: folder() } : fields);
      return 'error' in saved ? failure(st.triggers.errors[saved.error]) : text(shown(api, saved.trigger, []));
    }
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
      const { mod, sessionId } = await api.createMod(request);
      return text({ id: mod.id, folder: mod.folder, sessionId });
    }
    case 'update_mod': {
      const request = asString(args.request).trim().slice(0, MAX_MOD_REQUEST);
      if (!request) return failure(st.mods.mcp.noRequest);
      const edited = await api.editMod(asString(args.id), request);
      return edited ? text(edited) : failure(st.mods.mcp.unknown(api.mods().map((mod) => mod.id)));
    }
    case 'delete_mod': return (await api.deleteMod(asString(args.id))) ? text('deleted') : failure(st.mods.mcp.unknown(api.mods().map((mod) => mod.id)));
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
async function answer(api: OpenSpaceApi, caller: Caller, message: unknown, version: string): Promise<Json | null> {
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
        instructions: 'Drives Open Space, the app the sessions run in: triggers (sessions started on a schedule or by a webhook), new sessions, the crew, and a few display settings.',
      });
    }
    case 'ping': return result(message.id, {});
    case 'tools/list': return result(message.id, { tools: toolsFor(caller) });
    case 'tools/call': {
      try {
        return result(message.id, await callTool(api, caller, asString(params.name), asJson(params.arguments)));
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
  if (Array.isArray(parsed)) {
    const answers = (await Promise.all(parsed.map((message) => answer(api, caller, message, version)))).filter((each) => each !== null);
    return answers.length ? { status: 200, json: answers } : { status: 202, json: null };
  }
  const one = await answer(api, caller, parsed, version);
  return one ? { status: 200, json: one } : { status: 202, json: null };
}
