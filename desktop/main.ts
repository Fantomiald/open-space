// Open Space as a desktop app: a window on the bridge (server/index.ts), which runs inside the app as an Electron
// utility process and stops with it. When an Open Space already listens on the port (npm start), the window opens
// that one instead, and quitting the app leaves it running. Closing the window keeps the sessions going: the Dock
// or Windows tray icon brings it back, and the notifications still come.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage, nativeTheme, shell, utilityProcess, type NativeImage, type UtilityProcess } from 'electron';
import electronUpdater from 'electron-updater';
import type { AppMessage, AppNews } from '../server/app-port.ts';
import type { AppUpdate } from '../shared/protocol.ts';
import { loadConfig } from '../server/config.ts';
import { ROOM_PALETTE } from '../src/design/room-palette.ts';
import { attentionBadge } from './badge.ts';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE = path.join(OUT, 'server', 'index.js');
/** how often the app looks for a new Open Space, besides at launch */
const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** a bridge that stops sooner than this after it started is broken: it is not started again */
const STEADY_AFTER_MS = 10_000;
/** the room behind the page while it loads, so the window does not flash white */
const BACKGROUND = ROOM_PALETTE.icon.bottom;
/** the share of a macOS icon's width its squircle covers (824 of 1024 on Apple's grid), as the other Dock icons do */
const MACOS_ICON_TILE = 824 / 1024;

const config = loadConfig(process.env, os.homedir());
const address = `http://127.0.0.1:${config.port}`;
const logFile = path.join(config.dataDir, 'server.log');
const boundsFile = path.join(app.getPath('userData'), 'window.json');
const outFile = path.join(app.getPath('userData'), 'out-windows.json');
/** a window taken out of Open Space (src/state/out.ts): a session, a mod or a browser */
const OUT_KEY = /^(session:[\w-]+|mod:[\w-]+|browser:[\w-]+:\d{1,2})$/;

let window: BrowserWindow | null = null;
/** the windows taken out, by key: one each, kept over the other apps unless the user said otherwise */
const outWindows = new Map<string, BrowserWindow>();
/** which are open (opened again at the next launch), where each was, and the ones the user let go behind */
interface OutSaved { open: string[]; bounds: Record<string, Electron.Rectangle>; behind: string[] }
let tray: Tray | null = null;
let avatarIcon: NativeImage | null = null;
let bridge: UtilityProcess | null = null;

/** SIGTERM, or a message on Windows, where kill() ends the bridge at once, before it closes its sessions. */
function stopBridge(child: UtilityProcess) {
  if (process.platform === 'win32') child.postMessage({ t: 'shutdown' } satisfies AppNews);
  else child.kill();
}
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
  if (process.platform !== 'darwin') return Promise.resolve(process.env.PATH);
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
      else if (message.t === 'restart' && update?.state === 'ready') { installing = true; quitting = true; stopBridge(child); }
      else if (message.t === 'check') checkNow();
    });
    child.once('exit', (code) => {
      bridge = null;
      // the sessions are saved: Squirrel (Mac) or the silent NSIS installer (Windows) replaces the app and opens the new one
      if (installing) { electronUpdater.autoUpdater.quitAndInstall(true, true); return; }
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
    ...(process.platform === 'win32' ? { icon: avatarIcon ?? path.join(OUT, 'desktop', 'icon.png') } : {}),
    // plugins: Chromium's PDF viewer, for the PDFs the files explorer shows (the only plugin left)
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, plugins: true, preload: path.join(OUT, 'desktop', 'preload.cjs') },
  });
  const current = window;
  current.once('ready-to-show', () => current.show());
  current.on('close', (event) => {
    try { writeFileSync(boundsFile, JSON.stringify(current.getNormalBounds())); } catch { /* not kept */ }
    // Keep the page and its unread counts alive. The tray's Quit action stops sessions cleanly.
    if (process.platform === 'win32' && tray && !quitting) { event.preventDefault(); current.hide(); }
  });
  current.on('closed', () => { window = null; });
  // "(2) Open Space": two sessions wait for the user, on the Dock icon too
  current.on('page-title-updated', (_event, title) => {
    const count = /^\((\d+)\)/.exec(title)?.[1] ?? '';
    app.dock?.setBadge(count);
    if (process.platform === 'win32') current.setOverlayIcon(count ? attentionBadge(Number(count)) : null, count);
    tray?.setToolTip(title);
  });
  guard(current.webContents);
  if (page) void current.loadURL(page);
}

/**
 * Where a page of Open Space goes. Links (an MCP sign-in, a link in a message) open in the browser; the window stays on
 * Open Space. A file a session sent ("Open the original") opens in a window of the app: the browser has no session
 * cookie to load it with. A window taken out opens as one of the app's own (openOut).
 */
function guard(contents: Electron.WebContents) {
  const isAttachment = (url: string) => url.startsWith(`${address}/attachments/`);
  contents.setWindowOpenHandler(({ url, features }) => {
    if (isAttachment(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 800, backgroundColor: BACKGROUND } };
    const key = outKeyOf(url);
    if (key) openOut(key, sizeOf(features));
    else openOutside(url);
    return { action: 'deny' };
  });
  offerImageMenu(contents);
  contents.on('did-create-window', (opened) => {
    offerImageMenu(opened.webContents);
    opened.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
    // the window's own first load goes through will-navigate too: stopping it sent the file to the browser
    opened.webContents.on('will-navigate', (event, url) => {
      if (isAttachment(url)) return;
      event.preventDefault();
      openOutside(url);
    });
  });
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${address}/`) || url === address) return;
    event.preventDefault();
    openOutside(url);
  });
}

/** The key of a window taken out, from its page's address (/?out=<key>); null for any other address. */
function outKeyOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    const key = parsed.searchParams.get('out');
    return parsed.origin === address && parsed.pathname === '/' && key && OUT_KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** The size the page asked for (window.open's "width=…,height=…"), within reason. */
function sizeOf(features: string) {
  const read = (name: string) => Number(new RegExp(`${name}=(\\d+)`).exec(features)?.[1]) || undefined;
  const width = read('width'), height = read('height');
  return width && height ? { width: Math.min(Math.max(width, 280), 2400), height: Math.min(Math.max(height, 160), 1600) } : undefined;
}

function readOut(): OutSaved {
  try {
    const saved = JSON.parse(readFileSync(outFile, 'utf8')) as Partial<OutSaved>;
    return { open: (saved.open ?? []).filter((key) => OUT_KEY.test(key)), bounds: saved.bounds ?? {}, behind: saved.behind ?? [] };
  } catch {
    return { open: [], bounds: {}, behind: [] };
  }
}

function updateOut(change: (saved: OutSaved) => void) {
  const saved = readOut();
  change(saved);
  try { writeFileSync(outFile, JSON.stringify(saved)); } catch { /* not kept */ }
}

/** Over the other apps, on every desktop and over an app in full screen (a video), or a window like the others. */
function keepOnTop(current: BrowserWindow, onTop: boolean) {
  current.setAlwaysOnTop(onTop, 'floating');
  current.setVisibleOnAllWorkspaces(onTop, { visibleOnFullScreen: onTop });
}

/** A window taken out of Open Space, or the one open already brought forward. It opens where it was last. */
function openOut(key: string, size?: { width: number; height: number }) {
  const existing = outWindows.get(key);
  if (existing) { if (existing.isMinimized()) existing.restore(); existing.show(); existing.focus(); return; }
  const saved = readOut();
  const current = new BrowserWindow({
    ...(size ?? { width: 520, height: 720 }), ...saved.bounds[key], minWidth: 280, minHeight: 160,
    title: 'Open Space', backgroundColor: BACKGROUND, show: false, fullscreenable: false,
    // the page's head carries it (-webkit-app-region in components.css); its own close button closes it
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
    ...(process.platform === 'win32' ? { icon: avatarIcon ?? path.join(OUT, 'desktop', 'icon.png') } : {}),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, plugins: true, preload: path.join(OUT, 'desktop', 'preload.cjs') },
  });
  if (process.platform === 'darwin') current.setWindowButtonVisibility(false);
  keepOnTop(current, !saved.behind.includes(key));
  outWindows.set(key, current);
  updateOut((out) => { out.open = [...out.open.filter((each) => each !== key), key]; });
  current.once('ready-to-show', () => current.show());
  current.on('close', () => updateOut((out) => { out.bounds[key] = current.getNormalBounds(); }));
  current.on('closed', () => {
    outWindows.delete(key);
    // quitting, it stays in the list: it opens again at the next launch
    if (!quitting) updateOut((out) => { out.open = out.open.filter((each) => each !== key); });
  });
  guard(current.webContents);
  void current.loadURL(`${address}/?out=${encodeURIComponent(key)}`);
}

/** The window taken out that sent this message (its page itself, not a frame in it). */
function outOf(event: Electron.IpcMainInvokeEvent): [string, BrowserWindow] | undefined {
  return [...outWindows].find(([, current]) => event.sender === current.webContents && event.senderFrame === current.webContents.mainFrame);
}

/** A right click on a picture (one shown large, a sent file opened in its window) offers to save or copy it, as a browser does. */
function offerImageMenu(contents: Electron.WebContents) {
  contents.on('context-menu', (_event, params) => {
    if (params.mediaType !== 'image' || !params.srcURL) return;
    let english = false;
    try { english = JSON.parse(readFileSync(path.join(config.dataDir, 'settings.json'), 'utf8')).language === 'en'; } catch { /* French by default */ }
    Menu.buildFromTemplate([
      { label: english ? 'Save Image As…' : 'Enregistrer l’image sous…', click: () => contents.downloadURL(params.srcURL) },
      { label: english ? 'Copy Image' : 'Copier l’image', click: () => contents.copyImageAt(params.x, params.y) },
    ]).popup();
  });
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

/** That session: its window taken out if it is, else Open Space's window on it. */
function openSession(sessionId: string) {
  const out = outWindows.get(`session:${sessionId}`);
  if (out) { out.show(); out.focus(); return; }
  if (/^[\w-]+$/.test(sessionId)) openLink(`session=${sessionId}`);
}

/**
 * The window, on a link of its page: #session=<id>, #mod=<id>, #browser=<id>:<lane> (see src/App.tsx), which shows
 * that in it; a new window once its page is loaded.
 */
function openLink(hash: string) {
  const fresh = !window;
  showWindow();
  const contents = window?.webContents;
  if (!contents) return;
  const open = () => { void contents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`); };
  if (fresh || contents.isLoading()) contents.once('did-finish-load', open);
  else open();
}

/**
 * The Dock icon: the user's bust (OFFICE_DIR/avatar.png, saved by the page from their look) on the squircle of the
 * room at night, as src/room/chibi.ts draws the favicon, at 18 screen pixels per art pixel so the pixels stay sharp.
 * The squircle itself is cut at full size, smooth like the other Dock icons'; the bitmap is BGRA, like the bust's.
 */
function dockIcon(avatar: string, scale = 18): NativeImage | null {
  const bust = nativeImage.createFromPath(avatar);
  if (bust.isEmpty()) return null;
  const { width, height } = bust.getSize();
  const pixels = bust.toBitmap();
  const grid = 28;
  const margin = 3;
  const tile = (grid - 2 * margin) * scale;
  const size = Math.round(tile / MACOS_ICON_TILE);
  const offset = Math.floor((size - tile) / 2);
  const channels = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const [top, bottom] = [channels(ROOM_PALETTE.icon.top), channels(ROOM_PALETTE.icon.bottom)];
  const left = Math.floor((grid - width) / 2);
  const above = grid - height;
  const artColour = (x: number, y: number) => {
    const bx = x - left;
    const by = y - above;
    if (bx >= 0 && bx < width && by >= 0 && by < height && pixels[(by * width + bx) * 4 + 3]! > 0) {
      const at = (by * width + bx) * 4;
      return [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!];
    }
    return [2, 1, 0].map((channel) => top[channel]! + (bottom[channel]! - top[channel]!) * y / (grid - 1));
  };
  const image = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const coverage = squircleCoverage(px + 0.5 - size / 2, py + 0.5 - size / 2, tile / 2);
    if (coverage === 0) continue;
    const colour = artColour(margin + Math.floor((px - offset) / scale), margin + Math.floor((py - offset) / scale));
    const at = (py * size + px) * 4;
    image[at] = Math.round(colour[0]! * coverage);
    image[at + 1] = Math.round(colour[1]! * coverage);
    image[at + 2] = Math.round(colour[2]! * coverage);
    image[at + 3] = Math.round(255 * coverage);
  }
  return nativeImage.createFromBitmap(image, { width: size, height: size });
}

/** How much of the pixel at (x, y) from the middle lies inside a macOS squircle of that radius, from 0 to 1. */
function squircleCoverage(x: number, y: number, radius: number): number {
  const reach = (Math.abs(x) ** 5 + Math.abs(y) ** 5) ** (1 / 5);
  return Math.min(1, Math.max(0, radius - reach + 0.5));
}

/** The Dock icon follows the user's look: the page saves a new bust whenever it changes. */
function followAvatar() {
  const avatar = path.join(config.dataDir, 'avatar.png');
  const apply = () => {
    if (!existsSync(avatar)) return;
    avatarIcon = dockIcon(avatar);
    if (avatarIcon) app.dock?.setIcon(avatarIcon);
    if (avatarIcon && process.platform === 'win32') window?.setIcon(avatarIcon);
    // one screen pixel per pixel of the bust: a smoothed downscale blurs it
    const small = tray && dockIcon(avatar, 1);
    if (small) tray?.setImage(small);
  };
  apply();
  try {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    watch(config.dataDir, (_event, name) => { if (name === 'avatar.png') apply(); });
  } catch { /* the bundle's icon stays */ }
}

function createWindowsTray() {
  if (process.platform !== 'win32') return;
  tray = new Tray(nativeImage.createFromPath(path.join(OUT, 'desktop', 'icon.png')).resize({ width: 32, height: 32 }));
  tray.setToolTip('Open Space');
  tray.on('click', () => showWindow());
  tray.on('right-click', () => {
    let english = false;
    try { english = JSON.parse(readFileSync(path.join(config.dataDir, 'settings.json'), 'utf8')).language === 'en'; } catch { /* French by default */ }
    tray?.popUpContextMenu(Menu.buildFromTemplate([
      { label: english ? 'Open Open Space' : 'Ouvrir Open Space', click: () => showWindow() },
      { type: 'separator' },
      { label: english ? 'Quit Open Space' : 'Quitter Open Space', click: () => app.quit() },
    ]));
  });
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
 * Looks for a new Open Space at launch and every hour, and downloads it. It never restarts the app by itself, which
 * would cut every session: it installs when the user restarts from the settings, or when they quit the app.
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
  // an unsigned Mac build cannot be updated in place (Windows can): the error is only logged
  const check = () => lookForUpdate().catch((error: unknown) => log(`  !  update: ${error instanceof Error ? error.message : error}`));
  void check();
  setInterval(() => { if (update?.state !== 'ready') void check(); }, UPDATE_CHECK_MS);
}

async function start() {
  if (process.platform === 'win32') app.setAppUserModelId('io.github.fantomiald.open-space');
  let pickingFolder = false;
  ipcMain.handle('open-space:pick-folder', async (event) => {
    const owner = window;
    // Only the main app page can open a native dialog, never attachments, subframes or other origins.
    if (process.platform !== 'win32' || config.rootsLocked || !owner || event.sender !== owner.webContents
      || event.senderFrame !== owner.webContents.mainFrame || !event.senderFrame.url.startsWith(`${address}/`) || pickingFolder) return null;
    pickingFolder = true;
    try {
      const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    } finally { pickingFolder = false; }
  });
  // a window taken out goes back into Open Space's window (its key gives the link, see openLink)
  ipcMain.handle('open-space:out-back', (event) => {
    const found = outOf(event);
    if (!found) return;
    const [key, current] = found;
    current.close();
    openLink(key.replace(':', '='));
  });
  ipcMain.handle('open-space:out-top', (event, onTop: unknown) => {
    const found = outOf(event);
    if (!found) return false;
    const [key, current] = found;
    if (typeof onTop === 'boolean') {
      keepOnTop(current, onTop);
      updateOut((out) => { out.behind = onTop ? out.behind.filter((each) => each !== key) : [...out.behind.filter((each) => each !== key), key]; });
    }
    return current.isAlwaysOnTop();
  });
  // the page is always dark: the title bar and the menus too
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(process.platform === 'win32' ? null : Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : [{ label: 'Open Space', submenu: [{ role: 'quit' as const }] }]),
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  createWindowsTray();
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
      page = await startBridge({ ...process.env, ...(found ? { PATH: found } : {}),
        ...(process.platform === 'win32' ? { OPEN_SPACE_KNOWN_FOLDERS: JSON.stringify([app.getPath('desktop'), app.getPath('documents')]) } : {}),
      });
    } catch {
      showBroken();
      return;
    }
  }
  // the windows taken out at the last quit come back once the page has paired this app with the bridge (its cookie)
  window?.webContents.once('did-finish-load', () => { for (const key of readOut().open) openOut(key); });
  void window?.loadURL(page);
  watchForUpdates();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWindow());
  // the sessions keep running without a window: the Dock icon brings it back
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
  app.on('activate', () => showWindow());
  // SIGTERM: the bridge closes its sessions (they can be resumed) and saves, then the app quits (see startBridge)
  app.on('before-quit', (event) => {
    if (!bridge) { quitting = true; return; }
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    stopBridge(bridge);
  });
  app.whenReady().then(start).catch((error: unknown) => { log(`  !  ${error instanceof Error ? error.message : error}`); showBroken(); });
}
