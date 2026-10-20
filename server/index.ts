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
import type { ClientMessage, ServerMessage, SessionInfo } from '../shared/protocol.ts';
import { createAsideRunner } from './aside.ts';
import { createCatalogProbe, createProcessFactory, findClaude } from './claude-process.ts';
import { loadConfig } from './config.ts';
import { Crew } from './crew.ts';
import { buildClaudeEnvironment } from './environment.ts';
import { createWebServer } from './http.ts';
import { parseClientMessage } from './messages.ts';
import { loopbackPolicy, readOrCreateSecret } from './security.ts';
import { suggestRoots } from './paths.ts';
import { SessionManager, TrustNeeded } from './sessions.ts';
import { prepareSounds, soundsFolder } from './sounds.ts';
import { attachmentsFolder } from './attachments.ts';
import { uploadsFolder } from './uploads.ts';
import { notify } from './notifier.ts';
import { setServerLanguage, st } from './i18n/index.ts';
import { Settings } from './settings.ts';
import { openTerminal, openWebPage } from './desktop.ts';
import { createShellRunner } from './shell.ts';
import { listNotes, readNote, writeNote } from './journal.ts';
import { metricsChangedAt, readMetrics } from './metrics.ts';
import { controlMusic, installedMusicApps, musicLibrary, nowPlaying } from './music.ts';
import { hasNewMetrics } from '../shared/metrics.ts';
import { saveAvatar } from './crew.ts';

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

function broadcast(message: ServerMessage) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState !== client.OPEN) continue;
    // a client that does not read (frozen tab) must not make the bridge accumulate memory
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) { client.terminate(); continue; }
    client.send(payload);
  }
}

const crew = new Crew(path.join(config.dataDir, 'crew.json'));
await crew.load();

const sessions = new SessionManager({
  config,
  spawnProcess: claude ? createProcessFactory(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  probeCatalog: claude ? createCatalogProbe(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  askAside: claude ? createAsideRunner(claude, buildClaudeEnvironment(process.env, config.passthrough)) : null,
  runShell: createShellRunner(buildClaudeEnvironment(process.env, config.passthrough)),
  identity: () => ({ user: crew.selfName ?? '', note: settings.preferences.agentNote }),
  broadcast,
  log,
  onAttention: (kind, session) => {
    if (settings.notifications && ![...presence.values()].some(Boolean)) notify(session, kind, log);
  },
});
await sessions.init();

const notesMessage = async (): Promise<ServerMessage> => ({ t: 'notes', folder: settings.preferences.journalFolder, files: await listNotes(settings.preferences.journalFolder) });
/** something new waits in the numbers file, as last told to the pages */
const musicApps = installedMusicApps();
let metricsUnread = hasNewMetrics(await metricsChangedAt(settings.preferences.metricsFile), settings.metricsSeenAt);
/** Tells every page when the badge of the numbers object comes or goes. */
async function checkMetrics() {
  const unread = hasNewMetrics(await metricsChangedAt(settings.preferences.metricsFile), settings.metricsSeenAt);
  if (unread === metricsUnread) return;
  metricsUnread = unread;
  broadcast({ t: 'metricsStatus', unread });
}
setInterval(() => { checkMetrics().catch((error: unknown) => log('numbers file', error)); }, METRICS_CHECK_MS).unref();
const preferencesMessage = (): ServerMessage => ({ t: 'preferences', preferences: settings.preferences, roots: config.roots, onboarded: settings.onboarded });
prepareSounds(config.dataDir, log);
const { server } = createWebServer({ policy, port: config.port, distDir: DIST, soundsDir: soundsFolder(config.dataDir), attachmentsDir: attachmentsFolder(config.dataDir), uploadsDir: uploadsFolder(config.dataDir), dev: DEV, devPort: DEV_PORT, log, onConnection });

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
    t: 'hello', claude: claude ? { found: true, version: claude.version, path: claude.path } : { found: false }, roots: config.roots,
    sessions: sessions.list(), commands: sessions.getCommands(), folderCommands: sessions.getFolderCommands(), models: sessions.getModels(), quota: sessions.getQuota(), build: BUILD, crew: crew.list(),
    preferences: settings.preferences, onboarded: settings.onboarded, rootsLocked: config.rootsLocked,
  });
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
    case 'interrupt': sessions.interrupt(message.sessionId); break;
    case 'unqueue': sessions.unqueue(message.sessionId, message.queueId); break;
    case 'sendNow': sessions.sendNow(message.sessionId); break;
    case 'aside': sessions.aside(message.sessionId, message.question); break;
    case 'asideClose': sessions.closeAside(message.sessionId); break;
    case 'preferences': {
      const { roots, ...rest } = message.preferences;
      await settings.update({ ...rest, ...(roots && !config.rootsLocked ? { roots } : {}) });
      setServerLanguage(settings.preferences.language ?? 'fr');
      applyRoots();
      broadcast(preferencesMessage());
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
    case 'suggestRoots': send({ t: 'rootSuggestions', suggestions: suggestRoots(os.homedir()) }); break;
    case 'avatar': await saveAvatar(path.join(config.dataDir, 'avatar.png'), Buffer.from(message.png, 'base64')); break;
    case 'presence': break;
    case 'close': await sessions.close(message.sessionId); break;
    case 'tune': await sessions.tune(message.sessionId, { model: message.model, effort: message.effort, ultracode: message.ultracode, permissionMode: message.permissionMode }); break;
    case 'rename': sessions.rename(message.sessionId, message.name); break;
    case 'tag': sessions.tag(message.sessionId, message.tag); break;
    case 'rest': await sessions.rest(message.sessionId); break;
    case 'forget': await sessions.forget(message.sessionId); break;
    case 'log': send({ t: 'log', sessionId: message.sessionId, ...sessions.logSince(message.sessionId, message.after) }); break;
    case 'directories': send({ t: 'directories', directories: sessions.directories() }); break;
    case 'changes': send({ t: 'changes', sessionId: message.sessionId, changes: await sessions.changes(message.sessionId) }); break;
    case 'conversations': send({ t: 'conversations', cwd: message.cwd, conversations: await sessions.conversations(message.cwd) }); break;
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
      const { saved, note } = await writeNote(settings.preferences.journalFolder, message.name, message.text, message.version);
      send({ t: 'note', note, outcome: saved ? 'saved' : 'conflict' });
      send(await notesMessage());
      break;
    }
    case 'metrics': {
      const metrics = await readMetrics(settings.preferences.metricsFile);
      send({ t: 'metrics', metrics });
      if (metrics && hasNewMetrics(metrics.mtime, settings.metricsSeenAt)) await settings.metricsSeen(metrics.mtime);
      await checkMetrics();
      break;
    }
    case 'music': send({ t: 'music', nowPlaying: message.action ? await controlMusic(message.app, message.action) : await nowPlaying(message.app) }); break;
    case 'musicLibrary': send({ t: 'musicLibrary', query: message.query, ...await musicLibrary(message.query) }); break;
    case 'openTerminal': await openTerminal(defaultFolder(config.roots, settings.preferences.defaultFolder) || os.homedir()); break;
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
  console.log(claude ? `  Claude Code ${claude.version} (${claude.path})` : st.console.claudeMissing);
  console.log(st.console.stopHint);
  console.log('');
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
  await sessions.shutdown();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => { void shutdown(); });
