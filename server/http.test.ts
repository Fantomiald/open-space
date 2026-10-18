import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createWebServer } from './http.ts';
import { loopbackPolicy } from './security.ts';

const SECRET = 'test-secret';
const COOKIE = `poste_session=${SECRET}`;
let base: string;
let server: ReturnType<typeof createWebServer>['server'];
let port: number;
let connections = 0;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(free));
    });
  });
}

/** Sends a raw HTTP request, so the request target reaches the server exactly as written (fetch would normalise it). */
function rawRequest(target: string, host = `127.0.0.1:${port}`): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('close', () => resolve({ status: Number(data.slice(9, 12)), body: data.split('\r\n\r\n')[1] ?? '' }));
    socket.on('error', reject);
    socket.write(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
  });
}

function openSocket(options: { cookie?: string; origin?: string; host?: string } = {}): Promise<'open' | 'rejected'> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    if (options.host) headers.Host = options.host;
    if (options.cookie) headers.Cookie = options.cookie;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: options.origin, headers });
    socket.on('open', () => { socket.close(); resolve('open'); });
    socket.on('error', () => resolve('rejected'));
  });
}

before(async () => {
  base = mkdtempSync(path.join(os.tmpdir(), 'office-http-'));
  const distDir = path.join(base, 'dist');
  mkdirSync(distDir);
  writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>shell</title>');
  writeFileSync(path.join(base, 'secret.txt'), 'top secret');
  symlinkSync(path.join(base, 'secret.txt'), path.join(distDir, 'leak.txt'));
  const soundsDir = path.join(base, 'sounds');
  mkdirSync(soundsDir);
  writeFileSync(path.join(soundsDir, 'error.wav'), 'RIFF');
  symlinkSync(path.join(base, 'secret.txt'), path.join(soundsDir, 'leak.wav'));
  mkdirSync(path.join(base, 'attachments'));
  writeFileSync(path.join(base, 'attachments', `${'a'.repeat(64)}.png`), 'PNG');
  writeFileSync(path.join(base, 'attachments', `${'b'.repeat(64)}.html`), '<script>alert(1)</script>');
  writeFileSync(path.join(base, 'attachments', `${'d'.repeat(64)}.mp4`), '0123456789');
  writeFileSync(path.join(base, 'attachments', `${'c'.repeat(64)}.svg`), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  port = await freePort();
  server = createWebServer({
    policy: loopbackPolicy([port], SECRET), port, distDir, soundsDir: path.join(base, 'sounds'), attachmentsDir: path.join(base, 'attachments'), uploadsDir: path.join(base, 'uploads'), dev: false, devPort: 5174,
    onConnection: () => { connections++; }, log: () => {},
  }).server;
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
});

after(() => {
  server.close();
  server.closeAllConnections();
  rmSync(base, { recursive: true, force: true });
});

describe('HTTP requests', () => {
  it('serves the app shell with a restrictive CSP', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  });

  // The "//" request target used to throw inside the async handler and terminate the process.
  for (const target of ['//', '/\\', '//evil.example/x']) {
    it(`answers 400 to the target ${JSON.stringify(target)} and stays alive`, async () => {
      const { status } = await rawRequest(target);
      assert.equal(status, 400);
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    });
  }

  it('answers 400 to a malformed percent-encoding', async () => {
    const { status } = await rawRequest('/%E0%A4%A');
    assert.equal(status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  });

  it('refuses a foreign Host header (DNS rebinding)', async () => {
    assert.equal((await rawRequest('/', 'rebind.attacker.example')).status, 403);
    assert.equal((await rawRequest('/', 'localhost:1')).status, 403);
  });

  it('serves the sounds made at startup, nothing outside their folder', async () => {
    const sound = await fetch(`http://127.0.0.1:${port}/sounds/error.wav`);
    assert.equal(sound.status, 200);
    assert.equal(sound.headers.get('content-type'), 'audio/wav');
    assert.equal((await fetch(`http://127.0.0.1:${port}/sounds/missing.wav`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/sounds/leak.wav`)).status, 404);
  });

  it('serves the pictures sent with messages to a paired browser only, by their exact name', async () => {
    const picture = `http://127.0.0.1:${port}/attachments/${'a'.repeat(64)}.png`;
    assert.equal((await fetch(picture)).status, 401);
    const res = await fetch(picture, { headers: { Cookie: COOKIE } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`http://127.0.0.1:${port}/attachments/secret.png`, { headers: { Cookie: COOKIE } })).status, 404);
  });

  it('only downloads a file a session sent that is not a picture, under its own name: an HTML page never runs in the page', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/attachments/${'b'.repeat(64)}.html?name=${encodeURIComponent('rapport final.html')}`, { headers: { Cookie: COOKIE } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="rapport final.html"');
  });

  it('shows a published page asked without a name in a sandbox of its own origin, framed by Open Space only', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/attachments/${'b'.repeat(64)}.html`, { headers: { Cookie: COOKIE } });
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /^sandbox allow-scripts /);
    assert.doesNotMatch(csp, /allow-same-origin/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(await res.text(), /^<!doctype html>.*<script>alert\(1\)<\/script>$/s, 'wrapped like claude.ai does');
  });

  it('plays a video by ranges, as a browser asks for it', async () => {
    const video = `http://127.0.0.1:${port}/attachments/${'d'.repeat(64)}.mp4`;
    const whole = await fetch(video, { headers: { Cookie: COOKIE } });
    assert.deepEqual([whole.status, whole.headers.get('content-type'), whole.headers.get('accept-ranges'), await whole.text()], [200, 'video/mp4', 'bytes', '0123456789']);
    const part = await fetch(video, { headers: { Cookie: COOKIE, Range: 'bytes=2-5' } });
    assert.deepEqual([part.status, part.headers.get('content-range'), await part.text()], [206, 'bytes 2-5/10', '2345']);
    const end = await fetch(video, { headers: { Cookie: COOKIE, Range: 'bytes=-3' } });
    assert.equal(await end.text(), '789');
    assert.equal((await fetch(video, { headers: { Cookie: COOKIE, Range: 'bytes=20-' } })).status, 416);
    assert.equal((await fetch(video)).status, 401);
  });

  it('shows an SVG as a picture that can run nothing, even opened on its own', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/attachments/${'c'.repeat(64)}.svg`, { headers: { Cookie: COOKIE } });
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
    assert.match(res.headers.get('content-security-policy') ?? '', /^sandbox; default-src 'none'/);
  });

  it('keeps a file sent from Open Space’s own page with the cookie, under its name, and refuses it from anywhere else', async () => {
    const send = (headers: Record<string, string>) => fetch(`http://127.0.0.1:${port}/upload?name=${encodeURIComponent('../../rapport final.zip')}`, { method: 'POST', body: 'PK zip', headers });
    const own = { Cookie: COOKIE, Origin: `http://127.0.0.1:${port}` };
    assert.equal((await send({ Cookie: COOKIE, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await send({ Origin: own.Origin })).status, 403, 'no cookie');
    const res = await send(own);
    assert.equal(res.status, 200);
    const { id, size } = await res.json() as { id: string; size: number };
    assert.match(id, /^[0-9a-f]{16}\/rapport final\.zip$/);
    assert.equal(size, 6);
    assert.equal(readFileSync(path.join(base, 'uploads', id), 'utf8'), 'PK zip');
    assert.equal((await fetch(`http://127.0.0.1:${port}/upload`, { headers: own })).status, 405);
  });

  it('does not follow a symlink out of dist/', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/leak.txt`);
    assert.doesNotMatch(await res.text(), /top secret/);
  });
});

describe('pairing a browser', () => {
  it('sets the session cookie and goes back to the app with the right secret', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/pair?secret=${SECRET}`, { redirect: 'manual' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/');
    assert.match(res.headers.get('set-cookie') ?? '', /^poste_session=test-secret; .*HttpOnly; SameSite=Strict/);
  });

  it('refuses a wrong secret without setting anything', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/pair?secret=nope`, { redirect: 'manual' });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('tells the page whether this browser is authorised', async () => {
    assert.equal((await fetch(`http://127.0.0.1:${port}/pair`)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/pair`, { headers: { Cookie: COOKIE } })).status, 204);
  });
});

describe('WebSocket upgrade', () => {
  const origin = () => `http://127.0.0.1:${port}`;

  it('accepts the session cookie from the app origin', async () => {
    assert.equal(await openSocket({ cookie: COOKIE, origin: origin() }), 'open');
    assert.equal(connections, 1);
  });

  it('rejects a missing or wrong cookie', async () => {
    assert.equal(await openSocket({ origin: origin() }), 'rejected');
    assert.equal(await openSocket({ cookie: 'poste_session=nope', origin: origin() }), 'rejected');
  });

  it('rejects a foreign or missing Origin even with the right cookie', async () => {
    assert.equal(await openSocket({ cookie: COOKIE, origin: 'http://evil.example' }), 'rejected');
    assert.equal(await openSocket({ cookie: COOKIE }), 'rejected');
  });

  it('rejects a foreign Host even with the right cookie and Origin', async () => {
    assert.equal(await openSocket({ cookie: COOKIE, origin: origin(), host: 'rebind.attacker.example' }), 'rejected');
  });

  it('survives an upgrade request with a pathological target', async () => {
    await new Promise<void>((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('close', () => resolve());
      socket.resume();
      socket.write(`GET // HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  });
});
