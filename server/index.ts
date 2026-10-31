// The bridge between Open Space (the browser) and Claude Code. It serves the compiled UI and opens a
// WebSocket on /ws. It listens on 127.0.0.1 only, checks Host and Origin, and requires the session cookie
// that the /pair link printed at startup gives to a browser (once: the secret behind it is kept in OFFICE_DIR).
//
//   node server/index.ts            Open Space on http://127.0.0.1:4848
//   node server/index.ts --open     ... and opens it in the browser, unless a tab reconnects within a few seconds
//   node server/index.ts --dev      only the bridge (the UI is served by Vite, port 5174)
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import { defaultFolder } from '../shared/folders.ts';
import type { AppUpdate, ClaudeAccount, ClaudeInfo, ClientMessage, ServerMessage, SessionInfo } from '../shared/protocol.ts';
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
import { resolveAllowedDirectory, suggestRoots } from './paths.ts';
import { changeFiles, fileAt, listFolder, readSessionFile, revealFile, writeSessionFile } from './files.ts';
import { windowsKnownFolders } from './system-folders.ts';
import { SessionManager, TrustNeeded } from './sessions.ts';
import { UsageLedger } from './usage.ts';
import { prepareSounds, soundsFolder } from './sounds.ts';
import { attachmentsFolder } from './attachments.ts';
import { uploadsFolder } from './uploads.ts';
import { notify } from './notifier.ts';
import { setServerLanguage, st } from './i18n/index.ts';
import { Settings } from './settings.ts';
import { findTerminals, openTerminal, openWebPage } from './desktop.ts';
import { createShellRunner } from './shell.ts';
import { deleteNote, listNotes, readNote, renameNote, searchNotes, writeNote } from './journal.ts';
import { metricsChangedAt, readMetrics } from './metrics.ts';
import { controlMusic, installedMusicApps, musicLibrary, nowPlaying } from './music.ts';
import { hasNewMetrics } from '../shared/metrics.ts';
import { saveAvatar } from './crew.ts';
import { busySessions } from '../shared/app-update.ts';
import { appPort } from './app-port.ts';
import { answerSecrets, installScript, SecretStore, secretsKey } from './secrets.ts';
import { Browsers, browserKey, browserMcpConfig, findChrome, testerAgents, testerLane, userMcpServers } from './browser.ts';
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
const METRICS_CHECK_MS = 10_000;
/** how often the installed Claude Code is asked its version */
const CLAUDE_CHECK_MS = 10 * 60_000;
/** how often a downloaded Open Space looks for a moment without work to install itself */
const RESTART_CHECK_MS = 30_000;

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
/** set once a stop signal arrived: no new message is handled, no new process starts */
let stopping = false;

/** A new Open Space the Mac app found, as it last said. */
let appUpdate: AppUpdate | null = null;
appPort?.on('message', ({ data }) => {
  if (data.t !== 'update') return;
  appUpdate = data.update;
  broadcast({ t: 'appUpdate', update: appUpdate });
});
/**
 * The downloaded Open Space installs itself once no session has work under way, two checks in a row (a turn may
 * start between them): the app restarts and the sessions pick up where they were.
 */
let idleChecks = 0;
const restartWhenIdle = setInterval(() => {
  if (appUpdate?.state !== 'ready') return;
  idleChecks = busySessions(sessions.list()).length ? 0 : idleChecks + 1;
  if (idleChecks < 2) return;
  clearInterval(restartWhenIdle);
  appPort?.postMessage({ t: 'restart' });
}, RESTART_CHECK_MS);
restartWhenIdle.unref();

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
 * where a session's Playwright finds its browser: Open Space launches it on the first call (see server/browser.ts), and
 * the shared one, signed in to the user's own accounts, unless the session's folder was not trusted
 */
function browserMcp(sessionId: string, untrusted: boolean) {
  if (!browsers.available) return {};
  const endpoint = `http://${HOST}:${config.port}/browser/${sessionId}/cdp/${browserKey(secret, sessionId)}`;
  const shared = untrusted ? undefined : `http://${HOST}:${config.port}/browser/${sessionId}/shared/${sharedKey(sessionId)}`;
  return { mcpConfig: browserMcpConfig(endpoint, mcpServers(), shared), agents: testerAgents(endpoint, mcpServers(), st.prompt.tester, shared) };
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

const crew = new Crew(path.join(config.dataDir, 'crew.json'));
await crew.load();

const sessions = new SessionManager({
  config,
  spawnProcess: claude ? createProcessFactory(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  probeCatalog: claude ? createCatalogProbe(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  askAside: claude ? createAsideRunner(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  tagger: claude ? createTagger(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  autoTag: () => settings.preferences.autoTag,
  runShell: createShellRunner(buildClaudeEnvironment(process.env, config.passthrough)),
  identity: () => ({ user: crew.selfName ?? '', note: settings.preferences.agentNote }),
  claudeSettings: () => settings.preferences.claude,
  broadcast,
  log,
  onAttention: (kind, session) => {
    if (settings.notifications && ![...presence.values()].some(Boolean)) notify(session, kind, log);
  },
  browserMcp,
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
/** something new waits in the numbers file, as last told to the pages */
// on Windows, looking for the players takes PowerShell a few seconds: the page learns them once found
let musicApps: MusicApp[] = [];
void installedMusicApps().then((apps) => { musicApps = apps; broadcast({ t: 'musicApps', apps }); });
let metricsUnread = hasNewMetrics(await metricsChangedAt(settings.preferences.metricsFile), settings.metricsSeenAt);
/** Tells every page when the badge of the numbers object comes or goes. */
async function checkMetrics() {
  const unread = hasNewMetrics(await metricsChangedAt(settings.preferences.metricsFile), settings.metricsSeenAt);
  if (unread === metricsUnread) return;
  metricsUnread = unread;
  broadcast({ t: 'metricsStatus', unread });
}
setInterval(() => { checkMetrics().catch((error: unknown) => log('numbers file', error)); }, METRICS_CHECK_MS).unref();
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
const { server } = createWebServer({ policy, port: config.port, distDir: DIST, soundsDir: soundsFolder(config.dataDir), attachmentsDir: attachmentsFolder(config.dataDir), uploadsDir: uploadsFolder(config.dataDir), dev: DEV, devPort: DEV_PORT, log, onConnection,
  sessionFile: (sessionId, relative) => { try { return fileAt(filesRoot(sessionId), relative); } catch { return null; } },
  browser: { watch: (sessionId, lane, res) => browsers.watch(browserId(sessionId, lane), res), version: (sessionId, lane) => browsers.version(sessionId, lane), key: (sessionId) => browserKey(secret, sessionId), known: (sessionId) => sessions.list().some((session) => session.id === sessionId),
    shared: { key: sharedKey, version: () => browsers.sharedVersion(), socket: () => browsers.sharedSocket(), connect: (client, upstream, owner) => browsers.relay(client, upstream, owner) } },
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
    browsers: browsers.states(), browserAvailable: browsers.available,
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
  send({ t: 'metricsStatus', unread: metricsUnread });
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
  const root = resolveAllowedDirectory(cwd, config.roots);
  if (!root) throw new Error(st.files.outside);
  return root;
}

async function handle(message: ClientMessage, send: (message: ServerMessage) => void) {
  switch (message.t) {
    case 'create': {
      // unnamed sessions take someone of the crew without a session, whose job fits the first message if possible;
      // someone asked for by name who already has a session (at work or resting) is not free: another free one comes
      // instead, and once the crew is all taken, a stranger with a name drawn from the pool (and a look of their own)
      const taken = new Set(sessions.list().map((session) => session.name));
      const asked = message.options.name?.trim();
      const name = asked && !taken.has(asked) ? asked : crew.freeNameFor(message.options.text ?? '', taken);
      let session: SessionInfo;
      try {
        session = await sessions.create(name ? { ...message.options, name } : { ...message.options, name: undefined });
      } catch (error) {
        // the page asks the user, then asks again with their answer (SessionOptions.trust)
        if (error instanceof TrustNeeded) { send({ t: 'trustNeeded', cwd: error.cwd, code: error.code }); return; }
        throw error;
      }
      if (asked && taken.has(asked)) send({ t: 'toast', kind: 'info', text: st.server.nameTaken(asked, session.name) });
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
    case 'preferences': {
      const { roots, ...rest } = message.preferences;
      const before = settings.preferences.claude;
      await settings.update({ ...rest, ...(roots && !config.rootsLocked ? { roots } : {}) });
      setServerLanguage(settings.preferences.language ?? 'fr');
      applyRoots();
      broadcast(preferencesMessage());
      await sessions.applySettings(changedSettings(before, settings.preferences.claude));
      await checkMetrics();
      break;
    }
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
    case 'tag': sessions.tag(message.sessionId, message.tag); break;
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
    case 'metrics': {
      const metrics = await readMetrics(settings.preferences.metricsFile);
      send({ t: 'metrics', metrics });
      if (metrics && hasNewMetrics(metrics.mtime, settings.metricsSeenAt)) await settings.metricsSeen(metrics.mtime);
      await checkMetrics();
      break;
    }
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

server.listen(config.port, HOST, () => {
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
  await sessions.shutdown();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => { void shutdown(); });
// Windows has no signals: the app asks through its port
appPort?.on('message', ({ data }) => { if (data.t === 'shutdown') void shutdown(); });
