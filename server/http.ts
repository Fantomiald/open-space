// The web side of the bridge: serves the compiled UI, the /pair link that authorises a browser, and upgrades /ws to a
// WebSocket. Every request goes through the Host check; the WebSocket also needs the Origin and the session cookie.
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { ATTACHMENT_NAME } from './attachments.ts';
import { resolveInside } from './paths.ts';
import { checkUpgrade, hasSessionCookie, hostAllowed, parseRequestUrl, secretsMatch, sessionCookie, type AccessPolicy } from './security.ts';

/** The file types the compiled UI contains. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
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
  /** dev mode: the UI is served by Vite, the bridge only answers /ws */
  dev: boolean;
  devPort: number;
  onConnection: (socket: WebSocket) => void;
  log: (message: string, error?: unknown) => void;
}

export function createWebServer(options: WebServerOptions) {
  const { policy, port, distDir, soundsDir, attachmentsDir, dev, devPort, log } = options;
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", "media-src 'self' blob: data: https:", "worker-src 'self' blob:",
    `connect-src 'self' ws://localhost:${port} ws://127.0.0.1:${port}`, "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
  ].join('; ');

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

  async function route(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!hostAllowed(policy, req)) { res.writeHead(403).end('Forbidden host.'); return; }
    const url = parseRequestUrl(req.url);
    if (!url) { res.writeHead(400).end('Bad request.'); return; }
    if (url.pathname === '/pair') { pair(req, res, url); return; }
    if (url.pathname.startsWith('/attachments/')) {
      // the user's screenshots: only for a browser holding the session cookie, named by content so cached for good
      const name = url.pathname.slice('/attachments/'.length);
      if (!hasSessionCookie(policy, req)) { res.writeHead(401).end(); return; }
      const picture = ATTACHMENT_NAME.test(name) ? resolveInside(attachmentsDir, name) : null;
      if (!picture || !statSync(picture).isFile()) { res.writeHead(404).end(); return; }
      await serveFile(picture, res, { 'Cache-Control': 'private, max-age=31536000, immutable' });
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
