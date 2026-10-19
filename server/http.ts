// The web side of the bridge: serves the compiled UI, the /pair link that authorises a browser, and upgrades /ws to a
// WebSocket. Every request goes through the Host check; the WebSocket also needs the Origin and the session cookie.
import { createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { ATTACHMENT_NAME, SHOWN_EXTENSIONS, VIDEO_EXTENSIONS } from './attachments.ts';
import { TEXT_EXTENSIONS } from '../shared/protocol.ts';
import { SPOTIFY_ARTWORK } from '../shared/music.ts';
import { resolveInside } from './paths.ts';
import { MAX_UPLOAD_BYTES, saveUpload } from './uploads.ts';
import { checkUpgrade, hasSessionCookie, hostAllowed, parseRequestUrl, secretsMatch, sessionCookie, type AccessPolicy } from './security.ts';

/** The file types the compiled UI contains. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
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
  log: (message: string, error?: unknown) => void;
}

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
/** An SVG a session sent is shown as a picture; opened on its own, it may not run anything either. */
const SVG_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
/** What claude.ai wraps a published page in (the page starts with its own <title> and <style>, without <html> nor <head>). */
const PAGE_SKELETON = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>';

export function createWebServer(options: WebServerOptions) {
  const { policy, port, distDir, soundsDir, attachmentsDir, uploadsDir, dev, devPort, log } = options;
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob: ${SPOTIFY_ARTWORK}`,
    "font-src 'self' data:", "media-src 'self' blob: data: https:", "worker-src 'self' blob:",
    `connect-src 'self' ws://localhost:${port} ws://127.0.0.1:${port}`, "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
  ].join('; ');

  /** A file sent whole, or the one range asked for ("bytes=start-end", "bytes=start-", "bytes=-suffix"). */
  function serveRanges(file: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const size = statSync(file).size;
    const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' };
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
      if (name.endsWith('.html') && !url.searchParams.has('name')) {
        const page = await readFile(stored, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=31536000, immutable',
          'Content-Security-Policy': PAGE_CSP, 'Referrer-Policy': 'no-referrer',
        });
        res.end(/^\s*<!doctype/i.test(page) ? page : `${PAGE_SKELETON}${page}`);
        return;
      }
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
  server.on('upgrade', (req, socket, head) => {
    const url = parseRequestUrl(req.url);
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
