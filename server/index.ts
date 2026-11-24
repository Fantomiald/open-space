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
import { pmSettings } from '../shared/pm.ts';
import type { PhoneProblem } from '../shared/triggers.ts';
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
import { allowPhone, forgetPhone, loopbackPolicy, readOrCreateSecret } from './security.ts';
import { findTailscale, readTailscaleName, serveBridge, serveMods, stopServing } from './tailscale.ts';
import { listProjectDirectories, resolveAllowedDirectory, resolveInside, suggestRoots } from './paths.ts';
import { changeFiles, fileAt, listFolder, readSessionFile, revealFile, writeSessionFile } from './files.ts';
import { pathFinder } from './file-mentions.ts';
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
import { KeyFile } from './key-file.ts';
import { migrateShelf, pruneShelf, readVaultOwners, Vault, VaultShelf, writeVaultOwners, type KeyShelf } from './vault.ts';
import { projectOf } from './worktrees.ts';
import { ExternalKey, handleMcp, MCP_SETTINGS, messengerMcpKey, openSpaceMcpConfig, sessionMcpKey, type OpenSpaceApi, type PmApi } from './mcp.ts';
import { PmBook } from './pm.ts';
import { resolveWorker } from './pm-ops.ts';
import { actsAsPm, workerOptions } from './pm-guards.ts';
import { PmWatch } from './pm-watch.ts';
import { parseTriggerInput, ROLE_NAME, type TriggersState } from '../shared/triggers.ts';
import { parsePreferences } from './settings.ts';
import { controlMusic, installedMusicApps, musicLibrary, nowPlaying } from './music.ts';
import { modKey, Mods, modsFolder } from './mods.ts';
import { saveAvatar } from './crew.ts';
import { appCipher, appPort, vaultPlace } from './app-port.ts';
import { installFilter } from './playwright-filter.ts';
import { answerSecrets, installScript, SecretStore, secretsKey } from './secrets.ts';
import { accountsBrowserOf, Browsers, browserKey, browserMcpConfig, findChrome, openUserChrome, testerAgents, testerLane, userMcpServers } from './browser.ts';
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
  return { ...chrome, mcpConfig: browserMcpConfig(endpoint, mcpServers(), shared, playwrightFilter), agents: testerAgents(endpoint, mcpServers(), st.prompt.tester, shared, accounts === 'chrome', playwrightFilter) };
}

/** the keys kept beyond a session (server/vault.ts): only inside the desktop app, with a real keyring; otherwise every key stays in memory */
const vaultAt = vaultPlace(process.env);
const vault = vaultAt && appPort ? await Vault.open(vaultAt.file, appCipher(appPort), vaultAt.storage) : null;
/** the keys the user gives the sessions, and the os-secret command that uses them (server/secrets.ts) */
const secretStore = new SecretStore((sessionId) => sessions.secretsChanged(sessionId), Date.now, {
  vault,
  place: (sessionId) => {
    const place = sessions.placeOf(sessionId);
    // a session an agent or a program started gets the box every time, like one of a folder not trusted
    return place && { name: place.name, project: place.project ?? projectOf(place.cwd), trigger: place.trigger, untrusted: place.untrusted || place.spawned };
  },
});
setInterval(() => secretStore.sweep(), 60_000).unref();
/** Where the keys of each trigger or each mod live: the vault, once the file they were in is moved there; else that file. */
async function keyShelf(kind: 'trigger' | 'mod', file: string): Promise<KeyShelf> {
  const own = new KeyFile(path.join(config.dataDir, file));
  if (!vault) return own;
  try {
    await migrateShelf(path.join(config.dataDir, file), own, new VaultShelf(vault, kind), vault);
  } catch (error) {
    // the file stays the keys' home for this start: the next one tries again, never over a value the vault holds
    log(`cannot move ${file} into the keys vault`, error);
    return own;
  }
  return new VaultShelf(vault, kind);
}
/** the names of the vault's trigger and mod keys, for Open Space started without its app (server/vault.ts VaultOwners) */
const VAULT_OWNERS = path.join(config.dataDir, 'vault-keys.json');
const vaultElsewhere = vault ? null : readVaultOwners(VAULT_OWNERS);
/** Whether a JSON file reads, or is not there yet. */
function readableOrMissing(file: string) {
  try { JSON.parse(readFileSync(file, 'utf8')); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
}
const keysMessage = (): ServerMessage => ({ t: 'keys', state: { storage: vault?.storage ?? 'memory', keys: vault?.list() ?? [], trashedMods: mods.inTrash(), ...(vaultElsewhere ? { unreachable: vaultElsewhere } : {}) } });
const secretsBin = installScript(config.dataDir);
/** the filter around the sessions' Playwright servers, which hides their keys in what those answer (server/playwright-filter.ts) */
const playwrightFilter = installFilter(config.dataDir);
function secretsEnv(sessionId: string): Record<string, string> {
  const searchPath = buildClaudeEnvironment(process.env, config.passthrough).PATH;
  return {
    OPEN_SPACE_SECRETS: `http://${HOST}:${config.port}/secrets/${sessionId}/${secretsKey(secret, sessionId)}`,
    PATH: searchPath ? `${secretsBin}${path.delimiter}${searchPath}` : secretsBin,
  };
}

/** Open Space's keys: no session's file tools reach them (claude-process.ts hiddenRules) */
const HIDDEN_FILES = [...['secret', 'mcp-key', 'trigger-keys.json', 'mods-env.json', 'messengers.json'].map((file) => path.join(config.dataDir, file)), ...(vaultAt ? [vaultAt.file] : [])];

const crew = new Crew(path.join(config.dataDir, 'crew.json'));
await crew.load();

const sessions = new SessionManager({
  config,
  spawnProcess: claude ? createProcessFactory(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  probeCatalog: claude ? createCatalogProbe(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  askAside: claude ? createAsideRunner(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  tagger: claude ? createTagger(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  autoTag: () => settings.preferences.autoTag,
  tagRule: () => settings.preferences.autoTagRule,
  remoteByDefault: () => settings.preferences.remoteByDefault,
  accountsBrowser: () => settings.preferences.accountsBrowser,
  openUserChrome: () => openUserChrome(),
  runShell: createShellRunner(buildClaudeEnvironment(process.env, config.passthrough)),
  identity: () => ({ user: crew.selfName ?? '', note: settings.preferences.agentNote }),
  claudeSettings: () => settings.preferences.claude,
  hidden: HIDDEN_FILES,
  promptSuggestions: () => settings.preferences.promptSuggestions,
  pmEnabled: () => pmSettings(settings.preferences).enabled,
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

/** The model asked for, else the settings' ('' : Claude Code's default). */
const modelOr = (model?: string) => model || settings.preferences.model;

/**
 * Starts a session the way the page does, for someone who cannot answer the trust question (a trigger's run, a session
 * an agent starts, a PM and its workers): a folder that runs code of its own must have been approved once from the page.
 */
async function startUnasked(options: SessionOptions, started: Parameters<typeof sessions.create>[1] = {}, refused = (cwd: string) => st.triggers.trustNeeded(cwd)) {
  try {
    return (await startSession(options, started)).session;
  } catch (error) {
    if (error instanceof TrustNeeded) throw new Error(refused(error.cwd));
    throw error;
  }
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
  // the same path as the box in Open Space (the page's `secrets` message)
  giveSecrets: (sessionId, requestId, entries) => sessions.giveSecrets(sessionId, requestId, entries),
  onChange: () => broadcast(triggersMessage()),
  log,
});

/** the keys each trigger hands its runs: in the vault, else in a file (server/key-file.ts) */
const triggerKeys = await keyShelf('trigger', 'trigger-keys.json');

/** The triggers (server/triggers.ts): their runs are sessions started by startSession, in Remote Control when they say so, with their trigger's keys. */
const triggers = new Triggers({
  file: path.join(config.dataDir, 'triggers.json'),
  start: async (trigger, prompt) => {
    // its keys are in the app's vault, out of reach: no run without them
    if (vaultElsewhere?.triggers[trigger.id]?.some((name) => !triggerKeys.names(trigger.id).includes(name))) throw new Error(st.triggers.keysElsewhere);
    const session = await startUnasked(
      { cwd: trigger.cwd, text: prompt, name: trigger.name, ...(trigger.model ? { model: trigger.model } : {}), permissionMode: trigger.permissionMode },
      { trigger: { id: trigger.id, name: trigger.name, ...(trigger.role ? { role: trigger.role } : {}) }, ...(trigger.role ? { role: trigger.role } : {}), allowedTools: trigger.allowedTools, restrict: trigger.restrict, remote: trigger.remote, caps: { cost: trigger.maxCost, minutes: trigger.maxMinutes }, ...(trigger.browser ? { accountsBrowser: trigger.browser } : {}) },
    );
    const keys = triggerKeys.entries(trigger.id);
    if (keys.length) { sessions.giveSecrets(session.id, undefined, keys); vault?.touchOwner({ kind: 'trigger', id: trigger.id }, trigger.name); }
    return session;
  },
  sessionState: (sessionId) => sessions.list().find((session) => session.id === sessionId)?.state ?? null,
  waitsOnAnswer: (sessionId) => {
    const session = sessions.list().find((each) => each.id === sessionId);
    return session?.state === 'perm' && session.permissions.length > 0 && session.permissions.every((prompt) => !!prompt.questions?.length && !prompt.declinable);
  },
  allowedFolder: (cwd) => resolveAllowedDirectory(cwd, config.roots),
  onChange: () => broadcast(triggersMessage()),
  log,
});
await triggers.load();
// keys of triggers deleted before their keys went with them; not when triggers.json could not be read (its triggers are unknown)
if (readableOrMissing(path.join(config.dataDir, 'triggers.json'))) pruneShelf(triggerKeys, (id) => !!triggers.get(id));
triggers.start();
messengers.start();
/** the open-space MCP access of another program of this computer (server/mcp.ts) */
const externalKey = new ExternalKey(path.join(config.dataDir, 'mcp-key'));
/** the port that only answers webhooks, once it listens (config.hooksPort) */
let hooksPort: number | null = null;
/** this computer's Tailscale name the bridge is served under, for the phone (applyPhoneAccess); null while that access is off */
let phoneName: string | null = null;
const phone: { problem: PhoneProblem | null } = { problem: null };
let phoneChange = Promise.resolve();
const triggersMessage = (): ServerMessage => {
  const state: TriggersState = {
    triggers: triggers.list(), runs: triggers.recentRuns(), messengers: messengers.list(), keys: triggerKeys.all(), hookBase: `http://${HOST}:${config.port}/hooks`, hooksPort,
    externalMcp: externalKey.current ? `http://${HOST}:${config.port}/mcp/external/${externalKey.current}` : null,
    phone: { address: phoneName && `https://${phoneName}`, link: phoneName && `https://${phoneName}/pair?secret=${secret}`, problem: phone.problem },
  };
  return { t: 'triggers', state };
};

/** Changes settings the page or the MCP server sent (already checked), and tells every page. */
async function applyPreferences(changes: Partial<typeof settings.preferences>) {
  const { roots, ...rest } = changes;
  const before = settings.preferences.claude;
  const accountsBefore = settings.preferences.accountsBrowser;
  const pmBefore = pmSettings(settings.preferences).enabled;
  await settings.update({ ...rest, ...(roots && !config.rootsLocked ? { roots } : {}) });
  setServerLanguage(settings.preferences.language ?? 'fr');
  applyRoots();
  broadcast(preferencesMessage());
  await sessions.applySettings(changedSettings(before, settings.preferences.claude));
  if (settings.preferences.accountsBrowser !== accountsBefore) sessions.accountsBrowserChanged();
  // the PMs started while it was off run as PMs from their next idle moment
  if (!pmBefore && pmSettings(settings.preferences).enabled) sessions.pmSettingChanged();
  await applyPhoneAccess();
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

/** The project managers' files (server/pm.ts); a session forgotten takes its own with it, a PM made ordinary keeps it. */
const pmBook = new PmBook(path.join(config.dataDir, 'pm'));
sessions.onSessionForgotten((session) => { pmBook.remove(session.id).catch((error: unknown) => log(`cannot remove the PM file of ${session.name}`, error)); });
const findSession = (sessionId: string) => sessions.list().find((session) => session.id === sessionId);
/** The page's PM requests are refused while the setting is off. */
function checkPmOn() {
  if (!pmSettings(settings.preferences).enabled) throw new Error(st.pm.disabled);
}

/** What the pm_* tools reach (server/pm-tools.ts). */
const pmApi: PmApi = {
  // a session of a folder not trusted has no open-space MCP server (see openSpaceMcp above), so no PM tools
  isPm: (sessionId) => actsAsPm(findSession(sessionId), pmSettings(settings.preferences).enabled),
  book: pmBook,
  now: Date.now,
  // a worker takes its PM's permission mode, never another, and the folder's trust rules like a trigger's run
  startWorker: async (pm, ask) => {
    const { model, effort } = settings.preferences;
    return startUnasked(workerOptions(findSession(pm), pm, ask, { roots: config.roots, model, effort }), { pmOf: pm });
  },
  stopWorker: (worker) => sessions.interrupt(worker),
  claimWorker: (session, pm) => sessions.claimWorker(session, pm),
  releaseWorker: (session, pm) => sessions.releaseWorker(session, pm),
};

const mcpApi: OpenSpaceApi = {
  triggers: () => triggers.list(),
  mods: () => mods.list(),
  createMod: async (request, bySession) => (bySession ? makeMod(request) : { mod: mods.create(request), sessionId: null }),
  modGuide: () => mods.guide(),
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
  deleteTrigger: async (id) => {
    if (!triggers.get(id)) return false;
    await triggers.remove(id);
    triggerKeys.drop(id);
    return true;
  },
  startSession: async ({ cwd, prompt, name, model, permissionMode, role, remote }) => {
    const mode = permissionMode === undefined ? settings.preferences.permissionMode : isPermissionMode(permissionMode) ? permissionMode : null;
    if (!mode) throw new Error(st.triggers.errors.mode);
    if (role && !ROLE_NAME.test(role)) throw new Error(st.triggers.errors.role);
    return startUnasked({ cwd, text: prompt, permissionMode: mode, ...(name ? { name } : {}), ...(modelOr(model) ? { model: modelOr(model) } : {}) }, { ...(role ? { role } : {}), remote, spawned: true });
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
  saveDashboards: (dashboards) => applyPreferences({ dashboards }),
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
  rest: async (sessionId) => { await sessions.rest(sessionId); await browsers.stopSession(sessionId); },
  remote: (sessionId, enabled) => { void sessions.remoteControl(sessionId, enabled); },
  rename: (sessionId, name) => sessions.rename(sessionId, name),
  setPending: (sessionId, items) => sessions.setPending(sessionId, items),
  finish: (sessionId) => sessions.finishAfterTurn(sessionId),
  switchBrowser: (sessionId, browser) => sessions.switchBrowserOnRequest(sessionId, browser),
  sendFile: async (botId, file, caption) => {
    const allowed = [...config.roots, attachmentsFolder(config.dataDir), uploadsFolder(config.dataDir)];
    const found = path.isAbsolute(file) ? allowed.map((root) => resolveInside(root, file)).find(Boolean) : null;
    if (!found || HIDDEN_FILES.includes(found) || !statSync(found).isFile()) throw new Error(st.messengers.fileRefused);
    await messengers.sendFile(botId, found, caption);
  },
  pm: pmApi,
};

/**
 * The workers' reports to their PM (server/pm-watch.ts), each sent once; silences looked at every 30 s, what was missed
 * caught up now (sessions are loaded) and on the first sweep after the setting is back on.
 */
const pmWatch = new PmWatch({
  now: Date.now,
  sessions: () => sessions.list(),
  book: pmBook,
  enabled: () => pmSettings(settings.preferences).enabled && !stopping,
  quietMs: () => pmSettings(settings.preferences).quietMinutes * 60_000,
  lastWords: (sessionId) => mcpApi.lastWords(sessionId),
  lastEventAt: (sessionId) => {
    const info = findSession(sessionId);
    return (info && sessions.logSince(sessionId, info.lastSeq - 1).events.at(-1)?.at) || info?.stateSince || 0;
  },
  deliver: (pm, text, tag) => sessions.send(pm, text, [], [], tag),
  roleChanged: (sessionId) => sessions.roleChanged(sessionId),
  releaseWorker: (session, pm) => sessions.releaseWorker(session, pm),
  log,
});
sessions.onSessionTurnEnd((session, how) => pmWatch.turnEnded(session, how));
sessions.onSessionAttention((kind, session) => pmWatch.attention(kind, session));
sessions.onSessionPaused((session) => pmWatch.paused(session));
sessions.onSessionForgotten((session) => pmWatch.forgotten(session));
setInterval(() => { pmWatch.sweep().catch((error: unknown) => log('cannot look at the PM workers', error)); }, 30_000).unref();
pmWatch.reconcile().catch((error: unknown) => log('cannot catch up with the PM reports', error));


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
const mods = new Mods({ folder: modsFolder(config.dataDir), kitDir: MOD_KIT, seenFile: path.join(config.dataDir, 'mods-seen.json'), keys: await keyShelf('mod', 'mods-env.json'), trashFile: path.join(config.dataDir, 'mods-trashed.json'), secret, port: config.modsPort, onChange: (list) => broadcast({ t: 'mods', mods: list }), log });
await mods.prepare();
// a key of the vault changed: the sessions it was handed to, Settings > Keys, the triggers' and the mods' names
if (vault) writeVaultOwners(VAULT_OWNERS, vault);
vault?.watch(() => {
  writeVaultOwners(VAULT_OWNERS, vault);
  secretStore.vaultChanged();
  broadcast(keysMessage());
  broadcast(triggersMessage());
  broadcast({ t: 'mods', mods: mods.list() });
});
/** Checks a session may use its browser for `os-secret` (the shared one: only if it was given it). */
function browserOf(sessionId: string, shared: boolean) {
  if (!browsers.available) throw new Error(st.sessions.noBrowser);
  if (shared && !sessions.hasSharedBrowser(sessionId)) throw new Error('this session has no shared browser');
}

const { server, hooksServer, modsServer } = createWebServer({ policy, distDir: DIST, soundsDir: soundsFolder(config.dataDir), attachmentsDir: attachmentsFolder(config.dataDir), uploadsDir: uploadsFolder(config.dataDir), dev: DEV, devPort: DEV_PORT, log, onConnection,
  sessionFile: (sessionId, relative) => { try { return fileAt(filesRoot(sessionId), relative); } catch { return null; } },
  browser: { watch: (sessionId, lane, res) => browsers.watch(browserId(sessionId, lane), res), version: (sessionId, lane) => browsers.version(sessionId, lane), key: (sessionId) => browserKey(secret, sessionId), known: (sessionId) => sessions.list().some((session) => session.id === sessionId),
    socket: (sessionId, lane) => browsers.socket(sessionId, lane), connect: (client, upstream, sessionId, lane) => browsers.connect(client, upstream, browserId(sessionId, lane)),
    shared: { key: sharedKey, version: () => browsers.sharedVersion(), socket: () => browsers.sharedSocket(), connect: (client, upstream, owner) => browsers.relay(client, upstream, owner) } },
  mods: { kitDir: MOD_KIT, port: config.modsPort, key: (id) => modKey(secret, id), file: (id, relative) => mods.file(id, relative) },
  secrets: {
    key: (sessionId) => secretsKey(secret, sessionId),
    known: (sessionId) => sessions.list().some((session) => session.id === sessionId),
    answer: (sessionId, action, form) => answerSecrets({ sessionId, action, form }, {
      store: secretStore, roots: () => config.roots,
      ask: (id, names, why, card) => sessions.askSecrets(id, names, why, card),
      // a run nobody follows on a chat bot cannot wait for an answer in the page
      unattended: (id) => !!sessions.placeOf(id)?.trigger && !messengers.followedSession(id),
      setCookie: (id, cookie, shared) => { browserOf(id, shared); return browsers.setCookie(id, cookie, shared); },
      signIn: (id, { url, username, password }) => { browserOf(id, false); return browsers.signIn(id, url, { username, password }); },
      type: (id, { value, url, shared, anyField }) => { browserOf(id, shared); return browsers.typeInto(id, value, url, shared, anyField); },
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
  send(keysMessage());
  send({ t: 'musicApps', apps: musicApps });
  socket.on('message', (data) => {
    let message: ClientMessage | null = null;
    try { message = parseClientMessage(JSON.parse(String(data))); } catch { /* not JSON */ }
    if (!message) return;
    if (message.t === 'presence') { presence.set(socket, message.active); return; }
    // a request for a new session that fails says so to its page, which then stops waiting for that session to open it
    const refused = NEW_SESSION_REQUESTS.has(message.t) ? { refused: 'new' as const } : {};
    if (stopping) { send({ t: 'toast', kind: 'error', text: st.server.stoppingRetry, ...refused }); return; }
    handle(message, send).catch((error: unknown) => send({ t: 'toast', kind: 'error', text: error instanceof Error ? error.message : String(error), ...refused }));
  });
}

/** The files and folders "@" offers in the message field, its folder's list kept for the keystrokes that follow. */
const findPaths = pathFinder();

/**
 * Where "@" looks for paths: a session's folder (filesRoot), or a folder of the launcher inside the allowed ones; null
 * when it is neither (a session gone, a folder outside): the field then offers no path, without a word.
 */
function mentionRoot(message: { sessionId: string } | { cwd: string }): string | null {
  if ('cwd' in message) return resolveAllowedDirectory(message.cwd, config.roots);
  try { return filesRoot(message.sessionId); } catch { return null; }
}

/** The real folder a session's explorer works in: its own, as long as it stays among the allowed ones. */
function filesRoot(sessionId: string): string {
  const cwd = sessions.folderOf(sessionId);
  if (!cwd) throw new Error(st.sessions.notFound);
  const root = resolveAllowedDirectory(cwd, [...config.roots, ...(config.ownRoots ?? [])]);
  if (!root) throw new Error(st.files.outside);
  return root;
}

/** The page's requests that end with a new session, which the page waits for to open it (awaitingNew). */
const NEW_SESSION_REQUESTS: ReadonlySet<ClientMessage['t']> = new Set(['create', 'duplicate', 'pmCreate', 'createMod']);

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
    case 'secrets': sessions.giveSecrets(message.sessionId, message.requestId, message.entries, { stored: message.stored ?? [], always: message.always === true }); break;
    case 'forgetSecrets': sessions.forgetSecrets(message.sessionId, message.names); break;
    case 'interrupt': sessions.interrupt(message.sessionId); break;
    case 'unqueue': sessions.unqueue(message.sessionId, message.queueId); break;
    case 'sendNow': sessions.sendNow(message.sessionId); break;
    case 'resumeNow': sessions.resumeNow(message.sessionId); break;
    case 'aside': sessions.aside(message.sessionId, message.question, message.follow); break;
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
    // a worker the user closes is done with: resolved in its PM's plan
    case 'close': await sessions.close(message.sessionId); await pmWatch.closedByUser(message.sessionId); break;
    case 'tune': await sessions.tune(message.sessionId, { model: message.model, effort: message.effort, ultracode: message.ultracode, fastMode: message.fastMode, permissionMode: message.permissionMode }); break;
    case 'rename': sessions.rename(message.sessionId, message.name); break;
    case 'tags': sessions.setTags(message.sessionId, message.tags); break;
    case 'dismissPending': sessions.dismissPending(message.sessionId, message.id); break;
    case 'accountsBrowser': sessions.setAccountsBrowser(message.sessionId, message.browser); break;
    case 'rest': await sessions.rest(message.sessionId); browsers.stopSession(message.sessionId); break;
    case 'forget': await sessions.forget(message.sessionId, message.branch); await browsers.forget(message.sessionId); break;
    case 'pmCreate': {
      checkPmOn();
      const pm = pmSettings(settings.preferences);
      const model = modelOr(message.model || pm.lastModel);
      const { effort, permissionMode } = settings.preferences;
      // no trust question here: the page asks it with a plain create, so the folder must have been approved before
      const session = await startUnasked({ cwd: message.cwd, name: st.pm.newName, permissionMode, ...(model ? { model } : {}), ...(effort ? { effort } : {}) }, { pm: true }, st.pm.untrustedFolder);
      sessions.send(session.id, st.prompt.pmSetup, [], [], { setup: true });
      // the model chosen for a PM is the next one's (settings.update replaces `pm` whole)
      if (message.model && message.model !== pm.lastModel) {
        await settings.update({ pm: { ...pmSettings(settings.preferences), lastModel: message.model } });
        broadcast(preferencesMessage());
      }
      break;
    }
    case 'pmConvert': {
      checkPmOn();
      const info = findSession(message.sessionId);
      if (!info) throw new Error(st.sessions.notFound);
      if (info.untrusted) throw new Error(st.pm.untrusted(info.name));
      sessions.setPm(info.id, true);
      // a worker made a PM is its former PM's no longer: let go, and its job closed in that PM's plan
      if (info.pmOf) {
        sessions.releaseWorker(info.id, info.pmOf);
        await pmBook.change(info.pmOf, (file) => resolveWorker(file, info.id, Date.now()));
      }
      break;
    }
    case 'pmRevert': checkPmOn(); sessions.setPm(message.sessionId, false); break;
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
    case 'findPaths': {
      const root = mentionRoot(message);
      send({ t: 'paths', id: message.id, query: message.query, paths: root ? await findPaths(root, message.query) : [] });
      break;
    }
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
    case 'modEnv':
      send({ t: 'modEnv', id: message.id, env: mods.envOf(message.id) });
      vault?.touchOwner({ kind: 'mod', id: message.id }, mods.list().find((mod) => mod.id === message.id)?.name ?? message.id);
      break;
    case 'modStoreGet': send({ t: 'modStore', id: message.id, name: message.name, value: await mods.stored(message.id, message.name) }); break;
    case 'modStoreSet': if (mods.store(message.id, message.name, message.value)) broadcast({ t: 'modStore', id: message.id, name: message.name, value: message.value }); break;
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
    case 'saveKey': {
      if (!vault) break;
      const folder = message.scope.kind === 'project' ? resolveAllowedDirectory(message.scope.path, config.roots) : null;
      if (message.scope.kind === 'project' && !folder) break;
      vault.set(message.name, folder ? { kind: 'project', path: projectOf(folder) } : { kind: 'all' }, message.value);
      break;
    }
    case 'replaceKey': vault?.replace(message.id, message.value); break;
    case 'deleteKey': vault?.remove(message.id); break;
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
// and one taken there only leaves the mods' windows empty
modsServer.on('error', (error) => log(`mods port ${config.modsPort}`, error));

/** Opens or closes the phone's https address to match the setting and Tailscale (which can stop, sign out or come back). */
function applyPhoneAccess(): Promise<void> {
  phoneChange = phoneChange.then(async () => {
    const cli = settings.preferences.phoneAccess ? findTailscale() : null;
    const wanted = cli ? await readTailscaleName(cli) : null;
    const problem: PhoneProblem | null = !settings.preferences.phoneAccess ? null : !cli ? 'noTailscale' : !wanted ? 'signedOut' : null;
    if (wanted === phoneName && problem === phone.problem) return;
    if (phoneName && wanted !== phoneName) {
      forgetPhone(policy, phoneName);
      phoneName = null;
      const stopper = findTailscale();
      if (stopper) await stopServing(stopper).catch((error: unknown) => log('cannot stop tailscale serve', error));
    }
    phone.problem = problem;
    if (cli && wanted && wanted !== phoneName) {
      try {
        await serveBridge(cli, config.port);
        await serveMods(cli, config.modsPort).catch((error: unknown) => log('cannot serve the mods to the phone', error));
        allowPhone(policy, wanted);
        phoneName = wanted;
      } catch (error) {
        log('cannot start tailscale serve', error);
        phone.problem = 'serveFailed';
      }
    }
    broadcast(triggersMessage());
  });
  return phoneChange;
}
setInterval(() => { if (settings.preferences.phoneAccess || phoneName) applyPhoneAccess().catch((error: unknown) => log('phone access', error)); }, 30_000).unref();

server.listen(config.port, HOST, () => {
  applyPhoneAccess().catch((error: unknown) => log('phone access', error));
  hooksServer.listen(config.hooksPort, HOST, () => {
    hooksPort = config.hooksPort;
    broadcast(triggersMessage());
  });
  modsServer.listen(config.modsPort, HOST);
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
