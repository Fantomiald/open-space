// The web side of the bridge: serves the compiled UI, the /pair link that authorises a browser, and upgrades /ws to a
// WebSocket. Every request goes through the Host check; the WebSocket also needs the Origin and the session cookie.
import { createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { ATTACHMENT_NAME, readBundle, SHOWN_EXTENSIONS, VIDEO_EXTENSIONS } from './attachments.ts';
import { PREVIEW_TYPES, TEXT_EXTENSIONS } from '../shared/protocol.ts';
import { SPOTIFY_ARTWORK } from '../shared/music.ts';
import { relativePath } from './messages.ts';
import { resolveInside } from './paths.ts';
import { MAX_UPLOAD_BYTES, saveUpload } from './uploads.ts';
import { checkUpgrade, hasSessionCookie, hostAllowed, parseRequestUrl, secretsMatch, sessionCookie, type AccessPolicy } from './security.ts';
import { browserId } from '../shared/browser.ts';
import { TESTERS } from './browser.ts';

/** The file types served: the compiled UI's, and what sessions send or publish. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.json': 'application/json', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

export interface WebServerOptions {
  policy: AccessPolicy;
  /** the port the bridge listens on (used in the CSP) */
  port: number;
  distDir: string;
  /** sounds made at startup (see sounds.ts), served under /sounds/ in dev mode too */
  soundsDir: string;
  /** pictures sent with messages (see attachments.ts), served under /attachments/ to paired browsers only */
  attachmentsDir: string;
  /** files of any kind the user sends with a message (see uploads.ts), received on POST /upload */
  uploadsDir: string;
  /** dev mode: the UI is served by Vite, the bridge only answers /ws */
  dev: boolean;
  devPort: number;
  onConnection: (socket: WebSocket) => void;
  /** the real path of a file of a session's folder (see files.ts), previewed by its explorer under /files/ */
  sessionFile?: (sessionId: string, relative: string) => string | null;
  log: (message: string, error?: unknown) => void;
  /** the sessions' browsers (see browser.ts) */
  /** what a session's os-secret asks for (server/secrets.ts), behind its key */
  secrets?: {
    key: (sessionId: string) => string;
    known: (sessionId: string) => boolean;
    answer: (sessionId: string, action: string, form: URLSearchParams) => Promise<{ status: number; text: string }>;
  };
  browser?: {
    watch: (sessionId: string, lane: number, res: http.ServerResponse) => Promise<void>;
    /** `lane`: the session's own browser (0) or one of its testers' (see shared/browser.ts browserId) */
    version: (sessionId: string, lane: number) => Promise<Record<string, unknown>>;
    key: (sessionId: string) => string;
    known: (sessionId: string) => boolean;
    /** the browser shared by every session (see shared-browser.ts), which each owner reaches through Open Space */
    shared?: {
      /** a key of its own, given to the sessions that get the shared browser only (never to a restricted one) */
      key: (sessionId: string) => string;
      version: (sessionId: string, lane: number) => Promise<Record<string, unknown>>;
      /** the shared Chrome's own WebSocket, launched if needed */
      socket: (sessionId: string, lane: number) => Promise<string>;
      connect: (client: WebSocket, upstreamUrl: string, owner: string) => void;
    };
  };
}

/** /browser/<session>/shared/<key>[/lane/<n>]/devtools: an owner's Playwright connecting to the shared browser. */
/** an os-secret request: a few names and a short text, or one key (shared/secrets.ts MAX_SECRET_LENGTH, url-encoded) */
const MAX_SECRETS_FORM = 128 * 1024;
const SHARED_SOCKET = /^\/browser\/([\w-]{1,100})\/shared\/([^/]+)(?:\/lane\/([1-9]\d?))?\/devtools$/;

/**
 * A page a session published (its Artifact tool) or sent (SendUserFile) runs in a sandbox without allow-same-origin, even opened on its own: an
 * origin of its own, so no cookie, no access to Open Space's page nor to its server (whose Origin check refuses "null").
 * Like on claude.ai, it may load scripts, styles and fonts from the web, and open links in a new tab; only Open Space's
 * page may frame it.
 */
const PAGE_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms',
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'", 'connect-src https:', "frame-ancestors 'self'", "base-uri 'none'",
].join('; ');
/** The same, for a page served with its files (see servePage): it may load them too, and nothing else of Open Space. */
const bundledPageCsp = (files: string) => PAGE_CSP.replace('default-src https:', `default-src ${files} https:`).replace('connect-src https:', `connect-src ${files} https:`);
/** An SVG a session sent is shown as a picture; opened on its own, it may not run anything either. */
const SVG_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
/** What claude.ai wraps a published page in (the page starts with its own <title> and <style>, without <html> nor <head>). */
const PAGE_SKELETON = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>';

/**
 * Added to every page: Escape pressed in it never reaches Open Space's page around its frame, so the page tells it (the
 * viewer closes on it, Viewer.tsx).
 */
const ESCAPE_RELAY = "<script>addEventListener('keydown',function(e){if(e.key==='Escape')parent.postMessage('open-space:escape','*')})</script>";

export function createWebServer(options: WebServerOptions) {
  const { policy, port, distDir, soundsDir, attachmentsDir, uploadsDir, dev, devPort, log } = options;
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob: ${SPOTIFY_ARTWORK}`,
    "font-src 'self' data:", "media-src 'self' blob: data: https:", "worker-src 'self' blob:",
    `connect-src 'self' ws://localhost:${port} ws://127.0.0.1:${port}`, "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
  ].join('; ');

  /** A file sent whole, or the one range asked for ("bytes=start-end", "bytes=start-", "bytes=-suffix"). */
  function serveRanges(file: string, req: http.IncomingMessage, res: http.ServerResponse, more: http.OutgoingHttpHeaders = {}) {
    const size = statSync(file).size;
    const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable', ...more };
    const asked = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (!asked || (!asked[1] && !asked[2])) {
      res.writeHead(200, { ...headers, 'Content-Length': size });
      createReadStream(file).pipe(res);
      return;
    }
    const start = asked[1] ? Number(asked[1]) : Math.max(0, size - Number(asked[2]));
    const end = asked[1] && asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  }

  async function serveFile(file: string, res: http.ServerResponse, headers: http.OutgoingHttpHeaders) {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(body);
  }

  /**
   * /pair?secret=... sets the session cookie and goes back to the app (the link printed at startup, opened by `npm start`).
   * /pair alone tells the page whether this browser is authorised (204) or not (401), so it can explain a refused WebSocket.
   */
  function pair(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    const secret = url.searchParams.get('secret');
    if (secret === null) { res.writeHead(hasSessionCookie(policy, req) ? 204 : 401, headers).end(); return; }
    if (!secretsMatch(policy.secret, secret)) { res.writeHead(403, headers).end('Invalid authorisation link.'); return; }
    res.writeHead(303, { ...headers, 'Set-Cookie': sessionCookie(policy.secret), Location: '/' }).end();
  }

  /**
   * A file the user sends with a message (POST, the file as the body, its name in ?name=): kept in uploads/, answered
   * with its id, which the message then names. Like the WebSocket, only from Open Space's own page (Origin) with the
   * session cookie: another site cannot drop files here.
   */
  async function upload(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !policy.allowedOrigins.has(origin) || !hasSessionCookie(policy, req)) { res.writeHead(403).end(); return; }
    const declared = Number(req.headers['content-length']);
    if (!Number.isFinite(declared) || declared > MAX_UPLOAD_BYTES) { res.writeHead(413).end(); req.resume(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(chunk);
    }
    const id = saveUpload(uploadsDir, url.searchParams.get('name') ?? '', Buffer.concat(chunks));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ id, size }));
  }

  function sendPage(res: http.ServerResponse, page: string, csp: string) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer',
    });
    res.end(`${/^\s*<!doctype/i.test(page) ? page : `${PAGE_SKELETON}${page}`}${ESCAPE_RELAY}`);
  }

  /**
   * A published page with the files it loads (see bundlePage), at /pages/<bundle>/ and /pages/<bundle>/<published path>.
   * Its sandbox gives it an origin of its own, so the browser sends no cookie with what it loads: the bundle's name, the
   * hash of what it holds, is what lets a request in. Its links open in the browser, which has no cookie either.
   */
  async function servePage(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const [hash = '', ...rest] = url.pathname.slice('/pages/'.length).split('/');
    const bundle = /^[0-9a-f]{64}$/.test(hash) ? await readBundle(attachmentsDir, hash) : null;
    if (!bundle) { res.writeHead(404).end(); return; }
    let published: string;
    try { published = decodeURIComponent(rest.join('/')); } catch { res.writeHead(400).end(); return; }
    const isPage = published === '' || published === 'index.html';
    const name = isPage ? bundle.page : bundle.files[published];
    const stored = name && ATTACHMENT_NAME.test(name) ? resolveInside(attachmentsDir, name) : null;
    if (!name || !stored || !statSync(stored).isFile()) { res.writeHead(404).end(); return; }
    const own = `http://${req.headers.host}/pages/${hash}/`;
    if (name.endsWith('.html')) {
      // an uploaded asset is named from the root of the page's site ("/_blob/<id>"), here under the bundle
      const page = await readFile(stored, 'utf8');
      sendPage(res, isPage ? page.replaceAll('/_blob/', `/pages/${hash}/_blob/`) : page, bundledPageCsp(own));
      return;
    }
    await serveFile(stored, res, {
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...(name.endsWith('.svg') ? { 'Content-Security-Policy': SVG_CSP } : {}),
    });
  }

  /**
   * /browser/<session>/view?lane=n: the picture of a session's browser (lane: see browserId), to a page holding the session cookie.
   * /browser/<session>/cdp/<key>[/lane/<n>]/json/version/: asked by the session's Playwright before it connects (no
   * cookie: the key, given in its --mcp-config, is what lets it in), /lane/<n> by its nth tester's. Launches the browser.
   * /browser/<session>/shared/<key>[/lane/<n>]/json/version/: the same for the shared browser, whose WebSocket is then
   * Open Space's own (see SHARED_SOCKET), so that each owner sees its own tabs only.
   */
  async function serveBrowser(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const [sessionId = '', kind = '', key = '', ...rest] = url.pathname.slice('/browser/'.length).split('/');
    const browser = options.browser;
    if (!browser || req.method !== 'GET' || !/^[\w-]{1,100}$/.test(sessionId) || !browser.known(sessionId)) { res.writeHead(404).end(); return; }
    if (kind === 'view' && !key) {
      if (!hasSessionCookie(policy, req)) { res.writeHead(401).end(); return; }
      const lane = Number(url.searchParams.get('lane') ?? 0);
      await browser.watch(sessionId, Number.isInteger(lane) && lane >= 0 && lane < 100 ? lane : 0, res);
      return;
    }
    const asked = rest.filter(Boolean).join('/');
    const matched = /^(?:lane\/([1-9]\d?)\/)?json\/version$/.exec(asked);
    // the lanes of testers that exist only: the view of the shared browser is a lane too, never reached with this key
    const lane = matched && Number(matched[1] ?? 0) <= TESTERS ? matched : null;
    if (kind === 'shared') {
      if (!browser.shared || !lane || req.headers.origin !== undefined || !secretsMatch(browser.shared.key(sessionId), key)) { res.writeHead(404).end(); return; }
      const number = Number(lane[1] ?? 0);
      const version = await browser.shared.version(sessionId, number);
      const socket = `ws://${req.headers.host}/browser/${sessionId}/shared/${key}${number ? `/lane/${number}` : ''}/devtools`;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ ...version, webSocketDebuggerUrl: socket }));
      return;
    }
    if (kind !== 'cdp' || !lane || req.headers.origin !== undefined || !secretsMatch(browser.key(sessionId), key)) { res.writeHead(404).end(); return; }
    const version = await browser.version(sessionId, Number(lane[1] ?? 0));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(version));
  }

  /**
   * POST /secrets/<session>/<key>/<action>, a form: what the session's os-secret asks for. No cookie: the key, in the
   * session's environment only, lets it in; never a page's request (no Origin).
   */
  async function serveSecrets(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const [sessionId = '', key = '', action = '', ...rest] = url.pathname.slice('/secrets/'.length).split('/');
    const secrets = options.secrets;
    if (!secrets || req.method !== 'POST' || rest.length || req.headers.origin !== undefined || !/^[\w-]{1,100}$/.test(sessionId) || !secrets.known(sessionId) || !secretsMatch(secrets.key(sessionId), key)) { res.writeHead(404).end(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_SECRETS_FORM) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(chunk);
    }
    const reply = await secrets.answer(sessionId, action, new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(reply.status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(reply.text);
  }

  async function route(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!hostAllowed(policy, req)) { res.writeHead(403).end('Forbidden host.'); return; }
    const url = parseRequestUrl(req.url);
    if (!url) { res.writeHead(400).end('Bad request.'); return; }
    if (url.pathname === '/pair') { pair(req, res, url); return; }
    if (url.pathname === '/upload') { await upload(req, res, url); return; }
    if (url.pathname.startsWith('/attachments/')) {
      // the user's screenshots: only for a browser holding the session cookie, named by content so cached for good
      const name = url.pathname.slice('/attachments/'.length);
      if (!hasSessionCookie(policy, req)) { res.writeHead(401).end(); return; }
      const stored = ATTACHMENT_NAME.test(name) ? resolveInside(attachmentsDir, name) : null;
      if (!stored || !statSync(stored).isFile()) { res.writeHead(404).end(); return; }
      const title = (url.searchParams.get('name') ?? name).replace(/[^\w.\- ]/g, '_').slice(0, 120) || name;
      // a page (an artifact, or an HTML file sent) is shown when asked without a name to download it under, sandboxed (see PAGE_CSP)
      if (name.endsWith('.html') && !url.searchParams.has('name')) { sendPage(res, await readFile(stored, 'utf8'), PAGE_CSP); return; }
      const extension = path.extname(name).slice(1);
      // a video is played, by ranges: the browser asks for the parts it needs to start, then to jump ahead
      if (VIDEO_EXTENSIONS.has(extension) && !url.searchParams.has('name')) { serveRanges(stored, req, res); return; }
      if (TEXT_EXTENSIONS.has(extension) && !url.searchParams.has('name')) {
        await serveFile(stored, res, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Security-Policy': 'sandbox' });
        return;
      }
      // pictures are shown; any other file a session sent never runs in the page: it is downloaded
      const shown = SHOWN_EXTENSIONS.has(extension) && !url.searchParams.has('name');
      await serveFile(stored, res, {
        'Cache-Control': 'private, max-age=31536000, immutable',
        ...(extension === 'svg' ? { 'Content-Security-Policy': SVG_CSP } : {}),
        ...(shown ? {} : { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${title}"` }),
      });
      return;
    }
    if (url.pathname.startsWith('/files/')) {
      // a picture, a PDF, a video or a sound of a session's folder, previewed by its explorer: /files/<session>/<path>
      if (!hasSessionCookie(policy, req)) { res.writeHead(401).end(); return; }
      let relative: string | null = null, sessionId = '';
      try {
        const [id = '', ...names] = url.pathname.slice('/files/'.length).split('/').map(decodeURIComponent);
        sessionId = id;
        relative = relativePath(names.join('/'));
      } catch { /* a bad escape: not found */ }
      const type = relative ? PREVIEW_TYPES[path.extname(relative).slice(1).toLowerCase()] : undefined;
      const file = relative && type ? options.sessionFile?.(sessionId, relative) : null;
      if (!file || !type) { res.writeHead(404).end(); return; }
      // the file changes as the session works: asked again each time; an SVG never runs anything (see SVG_CSP)
      serveRanges(file, req, res, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': SVG_CSP } : {}) });
      return;
    }
    if (url.pathname.startsWith('/pages/')) { await servePage(req, res, url); return; }
    if (url.pathname.startsWith('/browser/')) { await serveBrowser(req, res, url); return; }
    if (url.pathname.startsWith('/secrets/')) { await serveSecrets(req, res, url); return; }
    if (url.pathname.startsWith('/sounds/')) {
      const sound = resolveInside(soundsDir, `.${url.pathname.slice('/sounds'.length)}`);
      if (!sound || !statSync(sound).isFile()) { res.writeHead(404).end(); return; }
      await serveFile(sound, res, { 'Cache-Control': 'public, max-age=3600' });
      return;
    }
    if (dev) { res.writeHead(404).end(`Dev mode: the UI is served by Vite on http://localhost:${devPort}`); return; }
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('Bad request.'); return; }
    // real-path check: anything missing, a directory, or leading outside dist/ falls back to the app shell
    const real = resolveInside(distDir, `.${pathname}`);
    const file = real && statSync(real).isFile() ? real : path.join(distDir, 'index.html');
    const ext = path.extname(file);
    await serveFile(file, res, {
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      ...(ext === '.html' ? { 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer' } : {}),
    });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      log(`request failed: ${req.method} ${String(req.url).slice(0, 200)}`, error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  // room for a message with its pictures (MAX_IMAGES, shrunk by the page before they are sent)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32_000_000 });
  // an owner's Playwright and the shared Chrome: CDP messages, a page's picture among them
  const relays = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64_000_000 });
  /** The owner a shared-browser connection is for: a known session, its key, no page behind it (no Origin). */
  const sharedOwner = (req: http.IncomingMessage, url: URL | null) => {
    const shared = options.browser?.shared;
    const match = url && SHARED_SOCKET.exec(url.pathname);
    if (!shared || !match || req.headers.origin !== undefined || !hostAllowed(policy, req)) return null;
    const [, sessionId = '', key = '', lane] = match;
    if (Number(lane ?? 0) > TESTERS || !options.browser?.known(sessionId) || !secretsMatch(shared.key(sessionId), key)) return null;
    return { shared, sessionId, lane: Number(lane ?? 0) };
  };
  server.on('upgrade', (req, socket, head) => {
    const url = parseRequestUrl(req.url);
    const owner = sharedOwner(req, url);
    if (owner) {
      relays.handleUpgrade(req, socket, head, (client) => {
        owner.shared.socket(owner.sessionId, owner.lane)
          .then((upstream) => owner.shared.connect(client, upstream, browserId(owner.sessionId, owner.lane)))
          .catch((error: unknown) => { log('cannot reach the shared browser', error); client.close(); });
      });
      return;
    }
    if (url?.pathname !== '/ws' || checkUpgrade(policy, req) !== 'ok') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => options.onConnection(ws));
  });
  // a malformed request or a reset socket must never take the bridge down
  server.on('clientError', (_error, socket) => { socket.destroy(); });

  return { server, wss };
}
