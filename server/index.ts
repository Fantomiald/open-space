// The bridge between Open Space (the browser) and Claude Code. It serves the compiled UI and opens a
// WebSocket on /ws. It listens on 127.0.0.1 only, checks Host and Origin, and requires the session cookie
// that the /pair link printed at startup gives to a browser (once: the secret behind it is kept in OFFICE_DIR).
//
//   node server/index.ts            Open Space on http://127.0.0.1:4848
//   node server/index.ts --open     ... and opens it in the browser, unless a tab reconnects within a few seconds
//   node server/index.ts --dev      only the bridge (the UI is served by Vite, port 5174)
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import { defaultFolder } from '../shared/folders.ts';
import { isPermissionMode, type AccountsBrowser, type AppUpdate, type ClaudeAccount, type ClaudeInfo, type ClientMessage, type ServerMessage, type SessionOptions } from '../shared/protocol.ts';
import type { MusicApp } from '../shared/music.ts';
import { createAsideRunner } from './aside.ts';
import { createTagger } from './auto-tag.ts';
import { createCatalogProbe, createProcessFactory, findClaude, readAccount, readVersion, runAuth, runUpdate } from './claude-process.ts';
import { loadConfig } from './config.ts';
import { Crew } from './crew.ts';
import { changedSettings } from '../shared/claude-settings.ts';
import { readClaudeDefaults } from './claude-settings.ts';
import { buildClaudeEnvironment } from './environment.ts';
import { createWebServer } from './http.ts';
import { parseClientMessage } from './messages.ts';
import { loopbackPolicy, readOrCreateSecret } from './security.ts';
import { listProjectDirectories, resolveAllowedDirectory, resolveInside, suggestRoots } from './paths.ts';
import { changeFiles, fileAt, listFolder, readSessionFile, revealFile, writeSessionFile } from './files.ts';
import { windowsKnownFolders } from './system-folders.ts';
import { SessionManager, TrustNeeded } from './sessions.ts';
import { UsageLedger } from './usage.ts';
import { prepareSounds, soundsFolder } from './sounds.ts';
import { attachmentsFolder } from './attachments.ts';
import { saveUpload, uploadsFolder } from './uploads.ts';
import { Messengers } from './messengers.ts';
import { createMessengerAgent } from './messenger-agent.ts';
import { notify } from './notifier.ts';
import { setServerLanguage, st } from './i18n/index.ts';
import { Settings } from './settings.ts';
import { findTerminals, openTerminal, openWebPage } from './desktop.ts';
import { createShellRunner } from './shell.ts';
import { deleteNote, listNotes, readNote, renameNote, searchNotes, writeNote } from './journal.ts';
import { AutomataWatch } from './automata-watch.ts';
import { rolesFor } from './agent-roles.ts';
import { Triggers } from './triggers.ts';
import { TriggerKeys } from './trigger-keys.ts';
import { ExternalKey, handleMcp, MCP_SETTINGS, messengerMcpKey, openSpaceMcpConfig, sessionMcpKey, type OpenSpaceApi } from './mcp.ts';
import { parseTriggerInput, ROLE_NAME, type TriggersState } from '../shared/triggers.ts';
import { parsePreferences } from './settings.ts';
import { controlMusic, installedMusicApps, musicLibrary, nowPlaying } from './music.ts';
import { modKey, Mods, modsFolder } from './mods.ts';
import { saveAvatar } from './crew.ts';
import { appPort } from './app-port.ts';
import { answerSecrets, installScript, SecretStore, secretsKey } from './secrets.ts';
import { accountsBrowserOf, Browsers, browserKey, browserMcpConfig, findChrome, testerAgents, testerLane, userMcpServers } from './browser.ts';
import { browserId, laneOf, sessionOfBrowser } from '../shared/browser.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const HOST = '127.0.0.1';
const DEV_PORT = 5174;
const DEV = process.argv.includes('--dev');
const ARC = '/Applications/Arc.app';
const PING_INTERVAL_MS = 25_000;
const MAX_BUFFERED_BYTES = 8_000_000;
/** an open tab retries every 2 s at most, so it is back within this delay; only then does --open open a new one */
const OPEN_IF_ALONE_AFTER_MS = 3000;
/** how often the numbers file is looked at, for the badge on the numbers object (scripts or sessions rewrite it now and then) */
/** how often the installed Claude Code is asked its version */
const CLAUDE_CHECK_MS = 10 * 60_000;

// An unexpected error is logged, never fatal: one bad request must not kill running sessions.
const log = (message: string, error?: unknown) => console.error(`  !  ${message}`, error instanceof Error ? error.message : (error ?? ''));
process.on('unhandledRejection', (reason) => log('unhandled rejection', reason));
process.on('uncaughtException', (error) => log('uncaught exception', error));

const config = loadConfig(process.env, os.homedir());
const secret = readOrCreateSecret(path.join(config.dataDir, 'secret'));
const policy = loopbackPolicy(DEV ? [config.port, DEV_PORT] : [config.port], secret);
const claude = await findClaude();
// the compiled UI's version: an open tab reloads itself when it changes
const BUILD = (() => { try { return String(Math.round(statSync(path.join(DIST, 'index.html')).mtimeMs)); } catch { return 'dev'; } })();

const clients = new Set<WebSocket>();
/** per tab: whether it is in front; no macOS notification while one is (the page rings instead) */
const presence = new Map<WebSocket, boolean>();
const settings = new Settings(path.join(config.dataDir, 'settings.json'));
await settings.load();
setServerLanguage(settings.preferences.language ?? 'fr');
// the folders sessions may run in: OFFICE_ROOTS when set, else the user's choice (the session manager reads config.roots)
const applyRoots = () => { if (!config.rootsLocked) config.roots = settings.preferences.roots.filter((root) => existsSync(root)); };
applyRoots();
// the mods' folder, where sessions run too (server/mods.ts), by its real path: what a session running there has as its own
mkdirSync(modsFolder(config.dataDir), { recursive: true, mode: 0o700 });
config.ownRoots = [realpathSync(modsFolder(config.dataDir))];
/** set once a stop signal arrived: no new message is handled, no new process starts */
let stopping = false;

/** A new Open Space the Mac app found, as it last said. */
let appUpdate: AppUpdate | null = null;
appPort?.on('message', ({ data }) => {
  if (data.t !== 'update') return;
  appUpdate = data.update;
  broadcast({ t: 'appUpdate', update: appUpdate });
});

function broadcast(message: ServerMessage) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState !== client.OPEN) continue;
    // a client that does not read (frozen tab) must not make the bridge accumulate memory
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) { client.terminate(); continue; }
    client.send(payload);
  }
}

const browsers = new Browsers({
  chrome: findChrome(process.env),
  folder: path.join(config.dataDir, 'browsers'),
  sessionAlive: (sessionId) => sessions.isAlive(sessionId),
  onState: (id, browser) => broadcast({ t: 'browser', sessionId: sessionOfBrowser(id), lane: laneOf(id), browser }),
  log,
});
const mcpServers = userMcpServers(path.join(os.homedir(), '.claude.json'));
/** the key to the shared browser (server/shared-browser.ts), apart from the session's own: a restricted session never gets it */
const sharedKey = (sessionId: string) => browserKey(secret, `shared:${sessionId}`);
/**
 * where a session's Playwright finds its browser: Open Space launches it on the first call (see server/browser.ts); and
 * the browser of the user's own accounts chosen in the settings, the shared one or their Chrome through Claude in Chrome,
 * unless the session's folder was not trusted
 */
function browserMcp(sessionId: string, untrusted: boolean, chosen: AccountsBrowser) {
  const accounts = accountsBrowserOf(chosen, untrusted);
  const chrome = accounts === 'chrome' ? { chrome: true } : {};
  if (!browsers.available) return chrome;
  const endpoint = `http://${HOST}:${config.port}/browser/${sessionId}/cdp/${browserKey(secret, sessionId)}`;
  const shared = accounts === 'shared' ? `http://${HOST}:${config.port}/browser/${sessionId}/shared/${sharedKey(sessionId)}` : undefined;
  return { ...chrome, mcpConfig: browserMcpConfig(endpoint, mcpServers(), shared), agents: testerAgents(endpoint, mcpServers(), st.prompt.tester, shared, accounts === 'chrome') };
}

/** the keys the user gives the sessions, and the os-secret command that uses them (server/secrets.ts) */
const secretStore = new SecretStore((sessionId) => sessions.secretsChanged(sessionId));
setInterval(() => secretStore.sweep(), 60_000).unref();
const secretsBin = installScript(config.dataDir);
function secretsEnv(sessionId: string): Record<string, string> {
  const searchPath = buildClaudeEnvironment(process.env, config.passthrough).PATH;
  return {
    OPEN_SPACE_SECRETS: `http://${HOST}:${config.port}/secrets/${sessionId}/${secretsKey(secret, sessionId)}`,
    PATH: searchPath ? `${secretsBin}${path.delimiter}${searchPath}` : secretsBin,
  };
}

/** Open Space's keys: no session's file tools reach them (claude-process.ts hiddenRules) */
const HIDDEN_FILES = ['secret', 'mcp-key', 'trigger-keys.json', 'messengers.json'].map((file) => path.join(config.dataDir, file));

const crew = new Crew(path.join(config.dataDir, 'crew.json'));
await crew.load();

const sessions = new SessionManager({
  config,
  spawnProcess: claude ? createProcessFactory(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  probeCatalog: claude ? createCatalogProbe(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  askAside: claude ? createAsideRunner(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  tagger: claude ? createTagger(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  autoTag: () => settings.preferences.autoTag,
  remoteByDefault: () => settings.preferences.remoteByDefault,
  accountsBrowser: () => settings.preferences.accountsBrowser,
  runShell: createShellRunner(buildClaudeEnvironment(process.env, config.passthrough)),
  identity: () => ({ user: crew.selfName ?? '', note: settings.preferences.agentNote }),
  claudeSettings: () => settings.preferences.claude,
  hidden: HIDDEN_FILES,
  promptSuggestions: () => settings.preferences.promptSuggestions,
  broadcast,
  log,
  onAttention: (kind, session) => {
    if (settings.notifications && ![...presence.values()].some(Boolean)) notify(session, kind, log);
  },
  browserMcp,
  // the open-space MCP server (server/mcp.ts), for the sessions whose folder was trusted: a restricted one could
  // otherwise start sessions or triggers elsewhere
  openSpaceMcp: (sessionId, untrusted) => (untrusted ? undefined : openSpaceMcpConfig(`http://${HOST}:${config.port}/mcp/${sessionId}/${sessionMcpKey(secret, sessionId)}`)),
  secrets: { store: secretStore, env: secretsEnv },
  // a tester is done (its report given, or stopped): its browser goes with it, rather than staying in the views
  onSubagentLeft: (sessionId, type) => {
    const lane = testerLane(type);
    if (lane) browsers.stop(browserId(sessionId, lane));
  },
});
await sessions.init();
browsers.sweepProfiles(new Set(sessions.list().map((session) => session.id))).catch((error: unknown) => log('cannot sweep the browser profiles', error));
const usage = new UsageLedger({ home: os.homedir(), cacheFile: path.join(config.dataDir, 'usage-cache.json'), log });

/** Writes, renames and deletes of notes one after the other: a save sent just before a rename lands on the old name first. */
let noteChanges: Promise<unknown> = Promise.resolve();
function changeNotes<T>(change: () => Promise<T>): Promise<T> {
  const run = noteChanges.then(change);
  noteChanges = run.catch(() => undefined);
  return run;
}
const notesMessage = async (): Promise<ServerMessage> => ({ t: 'notes', folder: settings.preferences.journalFolder, files: await listNotes(settings.preferences.journalFolder) });
// on Windows, looking for the players takes PowerShell a few seconds: the page learns them once found
let musicApps: MusicApp[] = [];
void installedMusicApps().then((apps) => { musicApps = apps; broadcast({ t: 'musicApps', apps }); });
/** the user's automatons, watched read-only from the folder of the settings (server/automata-watch.ts) */
const automata = new AutomataWatch({ folder: () => settings.preferences.automataFolder, broadcast, log });
automata.start();

/**
 * Starts a session the way the page does: someone of the crew without a session (the one asked for when free, else one
 * whose job fits the first message, else a name of the pool), in an allowed folder, under the folder's trust rules
 * (sessions.create). `started`: what a trigger adds (server/triggers.ts). Returns the session and the name asked for
 * when it was taken.
 */
async function startSession(options: SessionOptions, started: Parameters<typeof sessions.create>[1] = {}) {
  const taken = new Set(sessions.list().map((session) => session.name));
  const asked = options.name?.trim();
  // a name asked for and taken (a second run of the same trigger) gets a number: "Chiffres 2"
  const free = (base: string) => { for (let count = 1; ; count++) { const name = count === 1 ? base : `${base} ${count}`; if (!taken.has(name)) return name; } };
  const name = asked ? free(asked) : crew.freeNameFor(options.text ?? '', taken);
  const session = await sessions.create({ ...options, name: name || undefined }, started);
  return { session, takenName: asked && taken.has(asked) ? asked : null };
}

/** The user's chat bots (server/messengers.ts): Open Space's only outgoing connection, to Telegram, once one is added. */
const messengers = new Messengers({
  file: path.join(config.dataDir, 'messengers.json'),
  sessions: () => sessions.list(),
  events: (sessionId, after) => sessions.logSince(sessionId, after).events,
  lastWords: (sessionId) => mcpApi.lastWords(sessionId).slice(0, 3000),
  triggers: () => triggers.list(),
  answer: (sessionId, requestId, decision) => sessions.answer(sessionId, requestId, decision),
  reply: (sessionId, requestId, answers) => sessions.reply(sessionId, requestId, answers),
  send: (sessionId, text, files) => sessions.send(sessionId, text, [], files),
  interrupt: (sessionId) => sessions.interrupt(sessionId),
  remote: (sessionId, enabled) => mcpApi.remote(sessionId, enabled),
  fire: (triggerId, payload) => triggers.fire(triggerId, 'manual', payload),
  startSession: (cwd, prompt) => mcpApi.startSession({ cwd, prompt, remote: true }),
  folders: () => listProjectDirectories(config.roots),
  saveUpload: (name, bytes) => saveUpload(uploadsFolder(config.dataDir), name, bytes),
  attachment: (stored) => resolveInside(attachmentsFolder(config.dataDir), path.basename(stored)),
  agent: claude
    ? createMessengerAgent(claude, buildClaudeEnvironment(process.env, config.passthrough), {
      folder: path.join(config.dataDir, 'messenger-agent'), hidden: HIDDEN_FILES, failed: st.messengers.agentFailed,
      mcpUrl: (botId) => `http://${HOST}:${config.port}/mcp/messenger/${botId}/${messengerMcpKey(secret, botId)}`,
    })
    : async (_bot, _text, conversation) => ({ text: st.messengers.agentFailed, conversation }),
  onChange: () => broadcast(triggersMessage()),
  log,
});

/** the keys each trigger hands its runs (server/trigger-keys.ts) */
const triggerKeys = new TriggerKeys(path.join(config.dataDir, 'trigger-keys.json'));

/** The triggers (server/triggers.ts): their runs are sessions started by startSession, in Remote Control when they say so, with their trigger's keys. */
const triggers = new Triggers({
  file: path.join(config.dataDir, 'triggers.json'),
  start: async (trigger, prompt) => {
    try {
      const { session } = await startSession(
        { cwd: trigger.cwd, text: prompt, name: trigger.name, ...(trigger.model ? { model: trigger.model } : {}), permissionMode: trigger.permissionMode },
        { trigger: { id: trigger.id, name: trigger.name, ...(trigger.role ? { role: trigger.role } : {}) }, ...(trigger.role ? { role: trigger.role } : {}), allowedTools: trigger.allowedTools, remote: trigger.remote, caps: { cost: trigger.maxCost, minutes: trigger.maxMinutes } },
      );
      const keys = triggerKeys.entries(trigger.id);
      if (keys.length) sessions.giveSecrets(session.id, undefined, keys);
      return session;
    } catch (error) {
      // nobody is there to answer the trust question: the folder must be approved once from the page
      if (error instanceof TrustNeeded) throw new Error(st.triggers.trustNeeded(error.cwd));
      throw error;
    }
  },
  sessionState: (sessionId) => sessions.list().find((session) => session.id === sessionId)?.state ?? null,
  allowedFolder: (cwd) => resolveAllowedDirectory(cwd, config.roots),
  onChange: () => broadcast(triggersMessage()),
  log,
});
await triggers.load();
triggers.start();
messengers.start();
/** the open-space MCP access of another program of this computer (server/mcp.ts) */
const externalKey = new ExternalKey(path.join(config.dataDir, 'mcp-key'));
/** the port that only answers webhooks, once it listens (config.hooksPort) */
let hooksPort: number | null = null;
const triggersMessage = (): ServerMessage => {
  const state: TriggersState = {
    triggers: triggers.list(), runs: triggers.recentRuns(), messengers: messengers.list(), keys: triggerKeys.all(), hookBase: `http://${HOST}:${config.port}/hooks`, hooksPort,
    externalMcp: externalKey.current ? `http://${HOST}:${config.port}/mcp/external/${externalKey.current}` : null,
  };
  return { t: 'triggers', state };
};

/** Changes settings the page or the MCP server sent (already checked), and tells every page. */
async function applyPreferences(changes: Partial<typeof settings.preferences>) {
  const { roots, ...rest } = changes;
  const before = settings.preferences.claude;
  const accountsBefore = settings.preferences.accountsBrowser;
  await settings.update({ ...rest, ...(roots && !config.rootsLocked ? { roots } : {}) });
  setServerLanguage(settings.preferences.language ?? 'fr');
  applyRoots();
  broadcast(preferencesMessage());
  await sessions.applySettings(changedSettings(before, settings.preferences.claude));
  if (settings.preferences.accountsBrowser !== accountsBefore) sessions.accountsBrowserChanged();
  await automata.poll();
}

const VERSION = (() => { try { return String(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version); } catch { return '0'; } })();
/** What the open-space MCP server reaches (server/mcp.ts). */
/** A new mod's folder, and the session that writes it in there. */
async function makeMod(request: string) {
  const mod = mods.create(request);
  const taken = new Set(sessions.list().map((session) => session.name));
  const session = await sessions.create({ cwd: mod.folder, name: crew.freeNameFor(request, taken), text: st.mods.request(request) });
  return { mod, sessionId: session.id };
}

const mcpApi: OpenSpaceApi = {
  triggers: () => triggers.list(),
  mods: () => mods.list(),
  createMod: makeMod,
  editMod: async (id, request) => {
    const mod = mods.list().find((each) => each.id === id);
    if (!mod) return null;
    const open = sessions.list().find((session) => session.cwd === mod.folder && session.state !== 'closed');
    if (open) {
      sessions.send(open.id, st.mods.change(request));
      return { sessionId: open.id };
    }
    const taken = new Set(sessions.list().map((session) => session.name));
    const session = await sessions.create({ cwd: mod.folder, name: crew.freeNameFor(mod.name, taken), text: st.mods.change(request) });
    return { sessionId: session.id };
  },
  deleteMod: async (id) => {
    if (!mods.list().some((mod) => mod.id === id)) return false;
    await mods.remove(id);
    return true;
  },
  bots: () => messengers.list().map(({ id, name, username }) => ({ id, name, username })),
  lastRuns: () => triggers.recentRuns(),
  saveTrigger: async (id, raw) => {
    const base = id ? triggers.get(id) : undefined;
    if (id && !base) return { error: 'unknown' };
    const parsed = parseTriggerInput(raw, base);
    if ('error' in parsed) return parsed;
    // an agent never sets bypassPermissions or dontAsk: parseTriggerInput only knows the modes Open Space offers
    return triggers.save(id, parsed.input);
  },
  runTrigger: (id) => triggers.fire(id, 'agent'),
  startSession: async ({ cwd, prompt, name, model, permissionMode, role, remote }) => {
    const mode = permissionMode === undefined ? settings.preferences.permissionMode : isPermissionMode(permissionMode) ? permissionMode : null;
    if (!mode) throw new Error(st.triggers.errors.mode);
    if (role && !ROLE_NAME.test(role)) throw new Error(st.triggers.errors.role);
    try {
      const { session } = await startSession({ cwd, text: prompt, permissionMode: mode, ...(name ? { name } : {}), ...(model || settings.preferences.model ? { model: model || settings.preferences.model } : {}) }, { ...(role ? { role } : {}), remote });
      return session;
    } catch (error) {
      if (error instanceof TrustNeeded) throw new Error(st.triggers.trustNeeded(error.cwd));
      throw error;
    }
  },
  addMember: async (name, jobs) => {
    await crew.save(null, name, null, undefined, jobs);
    broadcast({ t: 'crew', crew: crew.list() });
  },
  crew: () => crew.list().filter((member) => !member.self).map((member) => ({ name: member.name, jobs: member.jobs ?? [] })),
  roles: async (cwd) => {
    const folder = resolveAllowedDirectory(cwd, config.roots);
    return folder ? rolesFor(folder) : [];
  },
  settings: () => settings.preferences,
  changeSettings: async (changes) => {
    const allowed = Object.fromEntries(Object.entries(changes).filter(([key]) => (MCP_SETTINGS as readonly string[]).includes(key)));
    await applyPreferences(parsePreferences(allowed));
  },
  callerFolder: (caller) => ('session' in caller ? sessions.folderOf(caller.session) ?? null : null),
  sessions: () => sessions.list(),
  lastWords: (sessionId) => {
    const said = sessions.logSince(sessionId, 0).events.findLast(({ ev }) => ev.k === 'say');
    return said?.ev.k === 'say' ? said.ev.text : '';
  },
  send: (sessionId, text) => sessions.send(sessionId, text),
  answer: (sessionId, requestId, decision) => sessions.answer(sessionId, requestId, decision),
  reply: (sessionId, requestId, answers) => sessions.reply(sessionId, requestId, answers),
  interrupt: (sessionId) => sessions.interrupt(sessionId),
  remote: (sessionId, enabled) => { void sessions.remoteControl(sessionId, enabled); },
  rename: (sessionId, name) => sessions.rename(sessionId, name),
  finish: (sessionId) => sessions.finishAfterTurn(sessionId),
  sendFile: async (botId, file, caption) => {
    const allowed = [...config.roots, attachmentsFolder(config.dataDir), uploadsFolder(config.dataDir)];
    const found = path.isAbsolute(file) ? allowed.map((root) => resolveInside(root, file)).find(Boolean) : null;
    if (!found || HIDDEN_FILES.includes(found) || !statSync(found).isFile()) throw new Error(st.messengers.fileRefused);
    await messengers.sendFile(botId, found, caption);
  },
};


/** The Claude Code installed now: its updater replaces it in the background, the next launches start the new one */
let installedClaude = claude?.version ?? '';
/** a `claude update` is running: a second click waits for it */
let updating = false;
const claudeInfo = (): ClaudeInfo => (claude ? { found: true, version: installedClaude, path: claude.path } : { found: false });
/** Reads the installed version again (no network: the executable answers); tells the pages when it changed. */
async function checkClaudeVersion() {
  const version = claude && await readVersion(claude.path);
  if (!version || version === installedClaude) return;
  installedClaude = version;
  broadcast({ t: 'claude', claude: claudeInfo() });
}
/** who Claude Code is signed in as, as last told to the pages; read again when a page connects (a terminal login changes it too) */
let account: ClaudeAccount | null = null;
/** a `claude auth login` or `logout` is running: another click waits for it */
let signing = false;
/** Reads the account again and tells the pages when it changed, or always after a login or logout (`failed`: why it did not work). */
async function checkAccount(after?: { failed?: string }) {
  const found = claude && await readAccount(claude.path, buildClaudeEnvironment(process.env, config.passthrough));
  const next = found ?? account ?? { loggedIn: false };
  const changed = JSON.stringify(next) !== JSON.stringify(account);
  account = next;
  if (changed || after) broadcast({ t: 'claudeAccount', account: after?.failed ? { ...next, failed: after.failed } : next });
}
// the conversations left alone long enough are compacted, one at a time (Preferences.idleCompact)
setInterval(() => sessions.compactIdle(settings.preferences.idleCompact), 60_000).unref();
setInterval(() => { checkClaudeVersion().catch((error: unknown) => log('cannot read the Claude Code version', error)); }, CLAUDE_CHECK_MS).unref();

/** Claude Code's own settings, read again whenever a page connects (the user may have changed them in its /config) */
let claudeDefaults = await readClaudeDefaults(os.homedir());
const preferencesMessage = (): ServerMessage => ({ t: 'preferences', preferences: settings.preferences, roots: config.roots, onboarded: settings.onboarded, claudeDefaults });
prepareSounds(config.dataDir, log);
/** the kit the mods load, and the guide their sessions read: beside the page once built, in public/ while developing */
const MOD_KIT = path.join(DEV ? path.join(ROOT, 'public') : DIST, 'mod-kit');
const mods = new Mods({ folder: modsFolder(config.dataDir), kitDir: MOD_KIT, seenFile: path.join(config.dataDir, 'mods-seen.json'), envFile: path.join(config.dataDir, 'mods-env.json'), secret, origin: `http://${HOST}:${config.port}`, onChange: (list) => broadcast({ t: 'mods', mods: list }), log });
await mods.prepare();
const { server, hooksServer } = createWebServer({ policy, port: config.port, distDir: DIST, soundsDir: soundsFolder(config.dataDir), attachmentsDir: attachmentsFolder(config.dataDir), uploadsDir: uploadsFolder(config.dataDir), dev: DEV, devPort: DEV_PORT, log, onConnection,
  sessionFile: (sessionId, relative) => { try { return fileAt(filesRoot(sessionId), relative); } catch { return null; } },
  browser: { watch: (sessionId, lane, res) => browsers.watch(browserId(sessionId, lane), res), version: (sessionId, lane) => browsers.version(sessionId, lane), key: (sessionId) => browserKey(secret, sessionId), known: (sessionId) => sessions.list().some((session) => session.id === sessionId),
    shared: { key: sharedKey, version: () => browsers.sharedVersion(), socket: () => browsers.sharedSocket(), connect: (client, upstream, owner) => browsers.relay(client, upstream, owner) } },
  mods: { kitDir: MOD_KIT, key: (id) => modKey(secret, id), file: (id, relative) => mods.file(id, relative) },
  secrets: {
    key: (sessionId) => secretsKey(secret, sessionId),
    known: (sessionId) => sessions.list().some((session) => session.id === sessionId),
    answer: (sessionId, action, form) => answerSecrets({ sessionId, action, form }, {
      store: secretStore, roots: () => config.roots,
      ask: (id, names, why) => sessions.askSecrets(id, names, why),
      setCookie: (id, cookie) => {
        if (!browsers.available) throw new Error(st.sessions.noBrowser);
        return browsers.setCookie(id, cookie);
      },
    }),
  },
  hooks: async (id, token, body) => {
    const trigger = triggers.hook(id, token);
    if (!trigger) return 'unknown';
    return (await triggers.fire(trigger.id, 'webhook', body)).outcome;
  },
  mcp: {
    key: (sessionId) => sessionMcpKey(secret, sessionId),
    known: (sessionId) => sessions.list().some((session) => session.id === sessionId && !session.untrusted),
    external: () => externalKey.current,
    messenger: (botId) => (messengers.has(botId) ? messengerMcpKey(secret, botId) : null),
    handle: (caller, body) => handleMcp(mcpApi, caller, body, VERSION),
  },
});

function onConnection(socket: WebSocket) {
  clients.add(socket);
  const send = (message: ServerMessage) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };
  let alive = true;
  socket.on('pong', () => { alive = true; });
  const heartbeat = setInterval(() => {
    if (!alive) { socket.terminate(); return; }
    alive = false;
    socket.ping();
  }, PING_INTERVAL_MS);
  socket.on('close', () => { clients.delete(socket); presence.delete(socket); clearInterval(heartbeat); });
  socket.on('error', (error) => log('websocket error', error));

  send({
    t: 'hello', claude: claudeInfo(), roots: config.roots,
    sessions: sessions.list(), commands: sessions.getCommands(), folderCommands: sessions.getFolderCommands(), models: sessions.getModels(), quota: sessions.getQuota(), build: BUILD, crew: crew.list(),
    preferences: settings.preferences, onboarded: settings.onboarded, rootsLocked: config.rootsLocked, claudeDefaults, appUpdate,
    browsers: browsers.states(), browserAvailable: browsers.available, mods: mods.list(),
  });
  checkClaudeVersion().catch((error: unknown) => log('cannot read the Claude Code version', error));
  if (account) send({ t: 'claudeAccount', account });
  if (process.platform === 'win32') send({ t: 'terminals', choices: findTerminals() });
  if (!signing) checkAccount().catch((error: unknown) => log('cannot read the Claude Code account', error));
  readClaudeDefaults(os.homedir()).then((found) => {
    if (JSON.stringify(found) === JSON.stringify(claudeDefaults)) return;
    claudeDefaults = found;
    broadcast(preferencesMessage());
  }).catch((error: unknown) => log('cannot read the Claude Code settings', error));
  send({ t: 'automata', state: automata.state });
  send(triggersMessage());
  send({ t: 'musicApps', apps: musicApps });
  socket.on('message', (data) => {
    if (stopping) { send({ t: 'toast', kind: 'error', text: st.server.stoppingRetry }); return; }
    let message: ClientMessage | null = null;
    try { message = parseClientMessage(JSON.parse(String(data))); } catch { /* not JSON */ }
    if (!message) return;
    if (message.t === 'presence') { presence.set(socket, message.active); return; }
    handle(message, send).catch((error: unknown) => send({ t: 'toast', kind: 'error', text: error instanceof Error ? error.message : String(error) }));
  });
}

/** The real folder a session's explorer works in: its own, as long as it stays among the allowed ones. */
function filesRoot(sessionId: string): string {
  const cwd = sessions.folderOf(sessionId);
  if (!cwd) throw new Error(st.sessions.notFound);
  const root = resolveAllowedDirectory(cwd, [...config.roots, ...(config.ownRoots ?? [])]);
  if (!root) throw new Error(st.files.outside);
  return root;
}

async function handle(message: ClientMessage, send: (message: ServerMessage) => void) {
  switch (message.t) {
    case 'create': {
      // unnamed sessions take someone of the crew without a session, whose job fits the first message if possible;
      // someone asked for by name who already has a session (at work or resting) is not free: another free one comes
      // instead, and once the crew is all taken, a stranger with a name drawn from the pool (and a look of their own)
      try {
        const { session, takenName } = await startSession(message.options);
        if (takenName) send({ t: 'toast', kind: 'info', text: st.server.nameTaken(takenName, session.name) });
      } catch (error) {
        // the page asks the user, then asks again with their answer (SessionOptions.trust)
        if (error instanceof TrustNeeded) { send({ t: 'trustNeeded', cwd: error.cwd, code: error.code }); return; }
        throw error;
      }
      break;
    }
    case 'send': sessions.send(message.sessionId, message.text, message.images, message.files); break;
    case 'answer': sessions.answer(message.sessionId, message.requestId, message.decision); break;
    case 'reply': sessions.reply(message.sessionId, message.requestId, message.answers); break;
    case 'secrets': sessions.giveSecrets(message.sessionId, message.requestId, message.entries); break;
    case 'forgetSecrets': sessions.forgetSecrets(message.sessionId, message.names); break;
    case 'interrupt': sessions.interrupt(message.sessionId); break;
    case 'unqueue': sessions.unqueue(message.sessionId, message.queueId); break;
    case 'sendNow': sessions.sendNow(message.sessionId); break;
    case 'aside': sessions.aside(message.sessionId, message.question); break;
    case 'asideClose': sessions.closeAside(message.sessionId); break;
    case 'preferences': await applyPreferences(message.preferences); break;
    case 'onboard': {
      await crew.setSelf(message.self.name, message.self.look, message.self.birthday);
      const { roots, ...rest } = message.preferences;
      await settings.update({ ...rest, ...(!config.rootsLocked ? { roots } : {}) }, true);
      setServerLanguage(settings.preferences.language ?? 'fr');
      applyRoots();
      broadcast({ t: 'crew', crew: crew.list() });
      broadcast(preferencesMessage());
      break;
    }
    case 'suggestRoots': send({ t: 'rootSuggestions', suggestions: suggestRoots(os.homedir(), process.platform === 'win32' ? await windowsKnownFolders(os.homedir(), process.env.OPEN_SPACE_KNOWN_FOLDERS) : undefined) }); break;
    case 'avatar': await saveAvatar(path.join(config.dataDir, 'avatar.png'), Buffer.from(message.png, 'base64')); break;
    case 'presence': break;
    case 'close': await sessions.close(message.sessionId); break;
    case 'tune': await sessions.tune(message.sessionId, { model: message.model, effort: message.effort, ultracode: message.ultracode, permissionMode: message.permissionMode }); break;
    case 'rename': sessions.rename(message.sessionId, message.name); break;
    case 'tags': sessions.setTags(message.sessionId, message.tags); break;
    case 'accountsBrowser': sessions.setAccountsBrowser(message.sessionId, message.browser); break;
    case 'rest': await sessions.rest(message.sessionId); browsers.stopSession(message.sessionId); break;
    case 'forget': await sessions.forget(message.sessionId, message.branch); await browsers.forget(message.sessionId); break;
    case 'browser':
      if (sessions.list().some((session) => session.id === message.sessionId)) await browsers.act(browserId(message.sessionId, message.lane), message.action).catch((error: unknown) => log('browser', error));
      break;
    // a click lost while a tab closes is not worth telling
    case 'browserInput': await browsers.input(browserId(message.sessionId, message.lane), message.input).catch(() => {}); break;
    case 'folderInfo': send({ t: 'folderInfo', cwd: message.cwd, repo: await sessions.folderInfo(message.cwd) }); break;
    case 'branch':
      switch (message.action) {
        case 'merge': await sessions.mergeBranch(message.sessionId); break;
        case 'pr': sessions.pullRequest(message.sessionId); break;
        case 'discard': await sessions.discardBranch(message.sessionId); break;
        case 'refresh': await sessions.refreshBranch(message.sessionId); break;
        case 'dismiss': sessions.dismissMerge(message.sessionId); break;
      }
      break;
    case 'branches': send({ t: 'branches', cwd: message.cwd, ...await sessions.branches(message.cwd) }); break;
    case 'cleanBranches': {
      // the panel waits for this answer: it comes even when the cleaning failed as a whole (the error then shows as a toast)
      const failed = await sessions.cleanBranches(message.cwd, message.branches).catch((error: unknown) => {
        send({ t: 'toast', kind: 'error', text: error instanceof Error ? error.message : String(error) });
        return message.branches.map((row) => row.branch || row.folder || '');
      });
      send({ t: 'branches', cwd: message.cwd, ...await sessions.branches(message.cwd), ...(failed.length ? { failed } : {}) });
      break;
    }
    case 'log': send({ t: 'log', sessionId: message.sessionId, ...sessions.logSince(message.sessionId, message.after) }); break;
    case 'directories': send({ t: 'directories', directories: sessions.directories() }); break;
    case 'duplicate': {
      const taken = new Set(sessions.list().map((session) => session.name));
      await sessions.duplicate(message.sessionId, crew.freeNameFor('', taken));
      break;
    }
    case 'updateClaude': {
      if (!claude || updating) break;
      updating = true;
      broadcast({ t: 'claudeUpdate', update: { state: 'checking' } });
      const from = installedClaude;
      try {
        await runUpdate(claude.path, buildClaudeEnvironment(process.env, config.passthrough));
        await checkClaudeVersion();
        broadcast({ t: 'claudeUpdate', update: installedClaude === from ? { state: 'upToDate', version: from } : { state: 'updated', from, version: installedClaude } });
      } catch (error) {
        broadcast({ t: 'claudeUpdate', update: { state: 'failed', text: error instanceof Error ? error.message : String(error) } });
      } finally {
        updating = false;
      }
      break;
    }
    case 'claudeLogin':
    case 'claudeLogout': {
      if (!claude || signing) break;
      signing = true;
      const action = message.t === 'claudeLogin' ? 'login' : 'logout';
      broadcast({ t: 'claudeAccount', account: { ...(account ?? { loggedIn: false }), busy: action } });
      let failed: string | undefined;
      try {
        await runAuth(claude.path, buildClaudeEnvironment(process.env, config.passthrough), action);
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error);
      } finally {
        signing = false;
      }
      await checkAccount({ failed });
      break;
    }
    case 'restartOutdated': if (installedClaude) sessions.releaseOutdated(installedClaude); break;
    case 'restartApp': if (appUpdate?.state === 'ready') appPort?.postMessage({ t: 'restart' }); break;
    case 'checkApp': if (appUpdate?.state !== 'downloading' && appUpdate?.state !== 'ready') appPort?.postMessage({ t: 'check' }); break;
    case 'changes': send({ t: 'changes', sessionId: message.sessionId, changes: await sessions.changes(message.sessionId) }); break;
    case 'listFolder': send({ t: 'folder', sessionId: message.sessionId, folder: message.folder, entries: await listFolder(filesRoot(message.sessionId), message.folder) }); break;
    case 'revealFile': revealFile(filesRoot(message.sessionId), message.path); break;
    case 'readFile': send({ t: 'file', sessionId: message.sessionId, file: await readSessionFile(filesRoot(message.sessionId), message.path), outcome: 'read' }); break;
    case 'writeFile': {
      const { saved, file } = await writeSessionFile(filesRoot(message.sessionId), message.path, message.text, message.version);
      send({ t: 'file', sessionId: message.sessionId, file, outcome: saved ? 'saved' : 'conflict' });
      break;
    }
    case 'fileAction': {
      const root = filesRoot(message.sessionId);
      const { action } = message;
      for (const folder of await changeFiles(root, action)) send({ t: 'folder', sessionId: message.sessionId, folder, entries: await listFolder(root, folder) });
      // the page opens a new file at once: it is read here, once made (a read of its own could arrive first)
      if (action.kind === 'newFile') send({ t: 'file', sessionId: message.sessionId, file: await readSessionFile(root, action.folder ? `${action.folder}/${action.name}` : action.name), outcome: 'read' });
      break;
    }
    case 'conversations': send({ t: 'conversations', cwd: message.cwd, ...(message.query ? { query: message.query } : {}), conversations: await sessions.conversations(message.cwd, message.query) }); break;
    case 'saveMember':
      await crew.save(message.previousName, message.name, message.look, message.birthday, message.jobs);
      broadcast({ t: 'crew', crew: crew.list() });
      break;
    case 'removeMember':
      await crew.remove(message.name);
      broadcast({ t: 'crew', crew: crew.list() });
      break;
    case 'becomeSelf':
      await crew.becomeSelf(message.name);
      broadcast({ t: 'crew', crew: crew.list() });
      break;
    case 'remoteControl': await sessions.remoteControl(message.sessionId, message.enabled); break;
    case 'shell': await sessions.shell(message.sessionId, message.command); break;
    case 'stopShell': sessions.stopShell(message.sessionId, message.shellId); break;
    case 'stopTask': await sessions.stopTask(message.sessionId, message.taskId); break;
    case 'inspect': send({ t: 'inspection', sessionId: message.sessionId, inspection: await sessions.inspect(message.sessionId, message.view) }); break;
    case 'mcpAction':
      try {
        const signIn = await sessions.mcpAction(message.sessionId, message.server, message.action);
        if (signIn) openWebPage(signIn);
      } finally {
        // the list again, the action done or refused (its error then shows as a toast)
        send({ t: 'inspection', sessionId: message.sessionId, inspection: await sessions.inspect(message.sessionId, 'mcp') });
      }
      break;
    case 'notes': send(await notesMessage()); break;
    case 'readNote': send({ t: 'note', note: await readNote(settings.preferences.journalFolder, message.name), outcome: 'read' }); break;
    case 'writeNote': {
      const { saved, note } = await changeNotes(() => writeNote(settings.preferences.journalFolder, message.name, message.text, message.version));
      send({ t: 'note', note, outcome: saved ? 'saved' : 'conflict' });
      send(await notesMessage());
      break;
    }
    case 'renameNote':
    case 'deleteNote': {
      const folder = settings.preferences.journalFolder;
      await changeNotes(() => (message.t === 'renameNote' ? renameNote(folder, message.name, message.newName) : deleteNote(folder, message.name)));
      // a starred note keeps its star under its new name, and loses it once deleted
      const favorites = settings.preferences.favoriteNotes;
      if (favorites.includes(message.name)) {
        await settings.update({ favoriteNotes: favorites.flatMap((name) => (name !== message.name ? [name] : message.t === 'renameNote' ? [message.newName] : [])) });
        broadcast(preferencesMessage());
      }
      send(await notesMessage());
      break;
    }
    case 'searchNotes': send({ t: 'noteMatches', query: message.query, matches: await searchNotes(settings.preferences.journalFolder, message.query) }); break;
    case 'createMod': {
      const { mod, sessionId } = await makeMod(message.text);
      send({ t: 'modCreated', id: mod.id, sessionId });
      break;
    }
    case 'deleteMod': await mods.remove(message.id); break;
    case 'modSeen': await mods.markSeen(message.id); break;
    case 'configureMod': await mods.configure(message.id, message.settings); break;
    case 'modEnv': send({ t: 'modEnv', id: message.id, env: mods.envOf(message.id) }); break;
    case 'automatonLog': send({ t: 'automatonLog', runId: message.runId, ...await automata.thread(message.runId) }); break;
    case 'saveTrigger': {
      const saved = await triggers.save(message.id, message.trigger);
      if ('error' in saved) send({ t: 'triggerError', error: saved.error });
      break;
    }
    case 'deleteTrigger':
      await triggers.remove(message.id);
      triggerKeys.drop(message.id);
      break;
    case 'triggerKeys':
      if (!triggers.list().some((trigger) => trigger.id === message.id)) break;
      triggerKeys.set(message.id, message.entries);
      broadcast(triggersMessage());
      break;
    case 'saveMessenger': messengers.save(message.id, message.messenger); break;
    case 'deleteMessenger': messengers.remove(message.id); break;
    case 'testMessenger': await messengers.test(message.id); break;
    case 'relinkMessenger': messengers.relink(message.id); break;
    case 'forgetTriggerKey':
      triggerKeys.drop(message.id, message.name);
      broadcast(triggersMessage());
      break;
    case 'runTrigger': await triggers.fire(message.id, message.test ? 'test' : 'manual', message.body ?? null); break;
    case 'cancelTriggerRun': await triggers.cancel(message.id); break;
    case 'agentRoles': {
      const folder = resolveAllowedDirectory(message.cwd, config.roots);
      send({ t: 'agentRoles', cwd: message.cwd, roles: folder ? await rolesFor(folder) : [] });
      break;
    }
    case 'externalMcp':
      if (message.enabled) externalKey.renew();
      else externalKey.disable();
      broadcast(triggersMessage());
      break;
    case 'search': send({ t: 'searchResults', id: message.id, query: message.query, hits: sessions.search(message.query) }); break;
    case 'costs': {
      // the first reading of the transcripts is long: what is known goes out at once, the finished report follows
      if (usage.needsScan(message.fresh === true)) {
        const known = usage.current();
        if (known) send({ t: 'costs', report: { ...known, scanning: true } });
      }
      send({ t: 'costs', report: await usage.report(message.fresh === true) });
      break;
    }
    case 'music': send({ t: 'music', nowPlaying: message.action ? await controlMusic(message.app, message.action) : await nowPlaying(message.app) }); break;
    case 'musicLibrary': send({ t: 'musicLibrary', query: message.query, ...await musicLibrary(message.query) }); break;
    case 'openTerminal': {
      const folder = (message.sessionId && sessions.folderOf(message.sessionId)) || defaultFolder(config.roots, settings.preferences.defaultFolder) || os.homedir();
      await openTerminal(folder, settings.preferences.terminal);
      break;
    }
  }
}

server.once('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(st.console.portTaken(config.port));
  else console.error(st.console.cannotStart, error.message);
  process.exit(1);
});

// a port taken there only leaves the webhooks without their tunnel's door: Open Space runs on
hooksServer.on('error', (error) => log(`webhooks port ${config.hooksPort}`, error));

server.listen(config.port, HOST, () => {
  hooksServer.listen(config.hooksPort, HOST, () => {
    hooksPort = config.hooksPort;
    broadcast(triggersMessage());
  });
  const address = `http://${HOST}:${DEV ? DEV_PORT : config.port}`;
  const pairLink = `${address}/pair?secret=${secret}`;
  console.log('');
  console.log('  Open Space');
  console.log(`  ->  ${address}${DEV ? st.console.devBridge : st.console.bookmark}`);
  console.log(st.console.pair(pairLink));
  console.log(st.console.folders(config.roots.join(path.delimiter)));
  console.log(st.console.data(config.dataDir));
  console.log(claude ? `  Claude Code ${installedClaude} (${claude.path})` : st.console.claudeMissing);
  console.log(st.console.stopHint);
  console.log('');
  appPort?.postMessage({ t: 'ready', link: pairLink });
  // read the transcripts now, so that the first opening of the usage view is quick
  usage.report().catch((error: unknown) => log('usage', error));
  if (process.argv.includes('--open') && !DEV) {
    // open tabs reconnect on their own: a new one only when none came back
    setTimeout(() => {
      if (clients.size > 0 || stopping) return;
      openPage(pairLink);
    }, OPEN_IF_ALONE_AFTER_MS).unref();
  }
});

/**
 * Opens the page: with Arc installed, in its front window, reusing Open Space's tab (scripts/open-in-arc.applescript;
 * macOS asks once to let the server control Arc); otherwise, or if that fails, in the default browser.
 */
function openPage(link: string) {
  const inBrowser = () => {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    execFile(opener, [link], () => {});
  };
  if (process.platform !== 'darwin' || !existsSync(ARC)) { inBrowser(); return; }
  execFile('/usr/bin/osascript', [path.join(ROOT, 'scripts', 'open-in-arc.applescript'), link, `http://127.0.0.1:${config.port}`], (error) => { if (error) inBrowser(); });
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  browsers.shutdown();
  automata.stop();
  triggers.stop();
  await sessions.shutdown();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => { void shutdown(); });
// Windows has no signals: the app asks through its port
appPort?.on('message', ({ data }) => { if (data.t === 'shutdown') void shutdown(); });
