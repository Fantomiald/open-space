// Open Space as a macOS app: a window on the bridge (server/index.ts), which runs inside the app as an Electron
// utility process and stops with it. When an Open Space already listens on the port (npm start), the window opens
// that one instead, and quitting the app leaves it running. Closing the window keeps the sessions going: the Dock
// icon brings it back, and the notifications still come.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Menu, Notification, app, nativeImage, nativeTheme, shell, utilityProcess, type NativeImage, type UtilityProcess } from 'electron';
import electronUpdater from 'electron-updater';
import type { AppMessage, AppNews } from '../server/app-port.ts';
import type { AppUpdate } from '../shared/protocol.ts';
import { loadConfig } from '../server/config.ts';
import { ROOM_PALETTE } from '../src/design/room-palette.ts';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE = path.join(OUT, 'server', 'index.js');
/** how often the app looks for a new Open Space, besides at launch */
const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** a bridge that stops sooner than this after it started is broken: it is not started again */
const STEADY_AFTER_MS = 10_000;
/** the room behind the page while it loads, so the window does not flash white */
const BACKGROUND = ROOM_PALETTE.icon.bottom;

const config = loadConfig(process.env, os.homedir());
const address = `http://127.0.0.1:${config.port}`;
const logFile = path.join(config.dataDir, 'server.log');
const boundsFile = path.join(app.getPath('userData'), 'window.json');

let window: BrowserWindow | null = null;
let bridge: UtilityProcess | null = null;
/** where the window goes: the /pair link, which sets the session cookie, then the page */
let page = '';
let quitting = false;
/** the new Open Space found, told to every bridge started */
let update: AppUpdate | null = null;
/** asked from the page: once the bridge has stopped, the app restarts on the new version */
let installing = false;
/** the notifications shown, kept so their click handler is not collected with them */
const shown = new Set<Notification>();

const log = (line: string) => {
  try { appendFileSync(logFile, `${line}\n`); } catch { /* no data folder yet */ }
};

/** An app opened from the Dock gets a bare PATH: the login shell's, so that claude, git and the MCP servers are found. */
function loginPath(): Promise<string | undefined> {
  const marker = '__OPEN_SPACE_PATH__';
  return new Promise((resolve) => {
    execFile(process.env.SHELL || '/bin/zsh', ['-ilc', `printf '${marker}%s${marker}' "$PATH"`], { timeout: 5000 }, (error, stdout) => {
      resolve(error ? undefined : stdout.split(marker)[1] || undefined);
    });
  });
}

/** Whether something already answers on the port: an Open Space started with npm start. */
async function alreadyRunning(): Promise<boolean> {
  try {
    await fetch(`${address}/`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/** Starts the bridge; resolves with its /pair link once it listens. It is started again if it stops on its own. */
function startBridge(environment: NodeJS.ProcessEnv): Promise<string> {
  const startedAt = Date.now();
  const child = utilityProcess.fork(BRIDGE, [], { env: environment, cwd: os.homedir(), stdio: 'pipe', serviceName: 'Open Space' });
  bridge = child;
  child.stdout?.on('data', (chunk: Buffer) => log(chunk.toString().trimEnd()));
  child.stderr?.on('data', (chunk: Buffer) => log(chunk.toString().trimEnd()));
  return new Promise((resolve, reject) => {
    child.on('message', (message: AppMessage) => {
      if (message.t === 'ready') { resolve(message.link); if (update) tell(update); }
      else if (message.t === 'notify') showNotification(message.title, message.body, message.sessionId);
      else if (message.t === 'restart' && update?.state === 'ready') { installing = true; quitting = true; child.kill(); }
      else if (message.t === 'check') checkNow();
    });
    child.once('exit', (code) => {
      bridge = null;
      // the sessions are saved: Squirrel replaces the app and opens the new one
      if (installing) { electronUpdater.autoUpdater.quitAndInstall(); return; }
      if (quitting) { app.quit(); return; }
      log(`  !  the bridge stopped (${code})`);
      if (Date.now() - startedAt < STEADY_AFTER_MS) { reject(new Error(`exit ${code}`)); return; }
      // the open page reconnects by itself
      startBridge(environment).catch(() => showBroken());
    });
  });
}

function showBroken() {
  const text = `<body style="background:${BACKGROUND};color:${ROOM_PALETTE.furniture.paper};font:15px -apple-system;padding:48px">`
    + `<h2>Open Space n’a pas pu démarrer</h2><p>Le détail est dans ${logFile}.</p></body>`;
  showWindow();
  void window?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(text)}`);
}

function readBounds(): Electron.Rectangle | undefined {
  try { return JSON.parse(readFileSync(boundsFile, 'utf8')) as Electron.Rectangle; } catch { return undefined; }
}

function showWindow() {
  if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); return; }
  window = new BrowserWindow({
    width: 1440, height: 900, ...readBounds(), minWidth: 380, minHeight: 520,
    title: 'Open Space', backgroundColor: BACKGROUND, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  const current = window;
  current.once('ready-to-show', () => current.show());
  current.on('close', () => {
    try { writeFileSync(boundsFile, JSON.stringify(current.getNormalBounds())); } catch { /* not kept */ }
  });
  current.on('closed', () => { window = null; });
  // "(2) Open Space": two sessions wait for the user, on the Dock icon too
  current.on('page-title-updated', (_event, title) => app.dock?.setBadge(/^\((\d+)\)/.exec(title)?.[1] ?? ''));
  // links (an MCP sign-in, a link in a message) open in the browser; the window stays on Open Space. A file a session sent
  // ("Open the original") opens in a window of the app: the browser has no session cookie to load it with.
  current.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${address}/attachments/`)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 800, backgroundColor: BACKGROUND } };
    openOutside(url);
    return { action: 'deny' };
  });
  current.webContents.on('did-create-window', (opened) => {
    opened.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
    opened.webContents.on('will-navigate', (event, url) => { event.preventDefault(); openOutside(url); });
  });
  current.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${address}/`) || url === address) return;
    event.preventDefault();
    openOutside(url);
  });
  if (page) void current.loadURL(page);
}

function openOutside(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

function showNotification(title: string, body: string, sessionId: string) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, silent: true });
  shown.add(notification);
  notification.on('click', () => { shown.delete(notification); openSession(sessionId); });
  notification.on('close', () => shown.delete(notification));
  notification.show();
}

/** The window, on that session (the page opens #session=<id>, see src/App.tsx); a new window once its page is loaded. */
function openSession(sessionId: string) {
  const fresh = !window;
  showWindow();
  const contents = window?.webContents;
  if (!contents || !/^[\w-]+$/.test(sessionId)) return;
  const open = () => { void contents.executeJavaScript(`location.hash = ${JSON.stringify(`session=${sessionId}`)}`); };
  if (fresh || contents.isLoading()) contents.once('did-finish-load', open);
  else open();
}

/**
 * The Dock icon: the user's bust (OFFICE_DIR/avatar.png, saved by the page from their look) on the squircle of the
 * room at night, as src/room/chibi.ts draws the favicon, at 18 screen pixels per art pixel so the pixels stay sharp.
 */
function dockIcon(avatar: string): NativeImage | null {
  const bust = nativeImage.createFromPath(avatar);
  if (bust.isEmpty()) return null;
  const { width, height } = bust.getSize();
  const pixels = bust.toBitmap();
  const grid = 28;
  const scale = 18;
  const size = grid * scale;
  const middle = (grid - 1) / 2;
  const inside = (x: number, y: number) => Math.abs(x - middle) ** 4 + Math.abs(y - middle) ** 4 <= 11.5 ** 4;
  const channels = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const [top, bottom] = [channels(ROOM_PALETTE.icon.top), channels(ROOM_PALETTE.icon.bottom)];
  const left = Math.floor((grid - width) / 2);
  const above = grid - height;
  const image = Buffer.alloc(size * size * 4);
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    if (!inside(x, y)) continue;
    // the bitmap is BGRA, like the bust's
    let colour = [2, 1, 0].map((channel) => Math.round(top[channel]! + (bottom[channel]! - top[channel]!) * y / (grid - 1)));
    const bx = x - left;
    const by = y - above;
    if (bx >= 0 && bx < width && by >= 0 && by < height && pixels[(by * width + bx) * 4 + 3]! > 0) {
      const at = (by * width + bx) * 4;
      colour = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!];
    }
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const at = ((y * scale + dy) * size + x * scale + dx) * 4;
      image[at] = colour[0]!; image[at + 1] = colour[1]!; image[at + 2] = colour[2]!; image[at + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(image, { width: size, height: size });
}

/** The Dock icon follows the user's look: the page saves a new bust whenever it changes. */
function followAvatar() {
  const avatar = path.join(config.dataDir, 'avatar.png');
  const apply = () => { const icon = existsSync(avatar) ? dockIcon(avatar) : null; if (icon) app.dock?.setIcon(icon); };
  apply();
  try {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    watch(config.dataDir, (_event, name) => { if (name === 'avatar.png') apply(); });
  } catch { /* the bundle's icon stays */ }
}

function tell(found: AppUpdate) {
  update = found;
  bridge?.postMessage({ t: 'update', update: found } satisfies AppNews);
}

const lookForUpdate = () => electronUpdater.autoUpdater.checkForUpdates();

/** Looks for a new Open Space when asked from the settings, and tells the page what came of it. */
function checkNow() {
  if (!app.isPackaged) { tell({ state: 'failed', text: 'dev build' }); return; }
  tell({ state: 'checking' });
  lookForUpdate().then(
    (found) => { if (!found?.isUpdateAvailable) tell({ state: 'upToDate' }); },
    (error: unknown) => tell({ state: 'failed', text: error instanceof Error ? error.message : String(error) }),
  );
}

/**
 * Looks for a new Open Space at launch and every hour, and downloads it: the bridge restarts the app on it once no
 * session has work under way, or the settings do at once. Quitting the app installs it too.
 */
function watchForUpdates() {
  if (!app.isPackaged) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.logger = null;
  autoUpdater.on('update-available', (info: { version: string }) => tell({ state: 'downloading', version: info.version, percent: 0 }));
  // told at each whole percent, not at every chunk
  autoUpdater.on('download-progress', (progress: { percent: number }) => {
    const percent = Math.floor(progress.percent);
    if (update?.state === 'downloading' && percent > update.percent) tell({ ...update, percent });
  });
  autoUpdater.on('update-downloaded', (info: { version: string }) => tell({ state: 'ready', version: info.version }));
  // an unsigned build cannot be updated in place: the error is only logged
  const check = () => lookForUpdate().catch((error: unknown) => log(`  !  update: ${error instanceof Error ? error.message : error}`));
  void check();
  setInterval(() => { if (update?.state !== 'ready') void check(); }, UPDATE_CHECK_MS);
}

async function start() {
  // the page is always dark: the title bar and the menus too
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  followAvatar();
  showWindow();
  if (await alreadyRunning()) {
    // the bridge started by npm start: same data folder, so same secret
    try {
      page = `${address}/pair?secret=${readFileSync(path.join(config.dataDir, 'secret'), 'utf8').trim()}`;
    } catch {
      showBroken();
      return;
    }
  } else {
    const found = await loginPath();
    try {
      page = await startBridge({ ...process.env, ...(found ? { PATH: found } : {}) });
    } catch {
      showBroken();
      return;
    }
  }
  void window?.loadURL(page);
  watchForUpdates();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWindow());
  // the sessions keep running without a window: the Dock icon brings it back
  app.on('window-all-closed', () => {});
  app.on('activate', () => showWindow());
  // SIGTERM: the bridge closes its sessions (they can be resumed) and saves, then the app quits (see startBridge)
  app.on('before-quit', (event) => {
    if (!bridge) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    bridge.kill();
  });
  app.whenReady().then(start).catch((error: unknown) => { log(`  !  ${error instanceof Error ? error.message : error}`); showBroken(); });
}
