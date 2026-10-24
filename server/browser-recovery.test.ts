import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { closeBrowserProfile, ownsBrowser, windowsArguments } from './browser-recovery.ts';

test('Windows browser recovery matches the exact executable, profile and headless launch', () => {
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const profile = "D:\\Office O'Brien & 100%\\browsers\\s1";
  const command = `"${chrome}" --headless=new --remote-debugging-port=0 "--user-data-dir=${profile}" about:blank`;
  assert.equal(ownsBrowser(command, chrome, profile, chrome), true);
  assert.equal(ownsBrowser(command, chrome.toLowerCase(), profile.toLowerCase(), chrome), true);
  assert.equal(ownsBrowser(command, chrome, `${profile}-other`, chrome), false);
  assert.equal(ownsBrowser(command.replace('--headless=new', ''), chrome, profile, chrome), false);
  assert.equal(ownsBrowser(command, 'C:\\other\\chrome.exe', profile, chrome), false);
  assert.equal(ownsBrowser(command.replace('--remote-debugging-port=0', '--remote-debugging-port=9222'), chrome, profile, chrome), false);
  assert.deepEqual(windowsArguments('"C:\\Program Files\\app.exe" "a b" "" tail'), ['C:\\Program Files\\app.exe', 'a b', '', 'tail']);
  assert.deepEqual(windowsArguments('app "--user-data-dir=D:\\profile with spaces\\\\"'), ['app', '--user-data-dir=D:\\profile with spaces\\']);
});

test('browser recovery verifies the profile before asking the debug endpoint to close', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'open-space-cdp-recovery-'));
  const chrome = 'C:\\Chrome\\chrome.exe';
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  let matches = false, closed = 0;
  server.on('connection', (socket) => socket.on('message', (data) => {
    const request = JSON.parse(String(data));
    if (request.method === 'Browser.getBrowserCommandLine') {
      socket.send(JSON.stringify({ id: request.id, result: { arguments: [chrome, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${matches ? profile : `${profile}-other`}`] } }));
    } else if (request.method === 'Browser.close') { closed++; socket.close(); }
  }));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await writeFile(path.join(profile, 'DevToolsActivePort'), `${address.port}\n/devtools/browser/test-id\n`);
    assert.equal(await closeBrowserProfile(profile, chrome), false);
    assert.equal(closed, 0, 'never close a different profile even if its endpoint was left in this folder');
    matches = true;
    assert.equal(await closeBrowserProfile(profile, chrome), true);
    assert.equal(closed, 1);
  } finally {
    server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
