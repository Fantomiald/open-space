import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkUpgrade, createSecret, hostAllowed, loopbackPolicy, parseRequestUrl, readCookie, readOrCreateSecret, secretsMatch, sessionCookie } from './security.ts';

const fakeRequest = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
const policy = loopbackPolicy([4848], 'secret-value');
const goodHeaders = { host: '127.0.0.1:4848', origin: 'http://127.0.0.1:4848', cookie: 'other=1; poste_session=secret-value' };

describe('parseRequestUrl', () => {
  it('parses a normal target', () => {
    const url = parseRequestUrl('/pair?secret=abc');
    assert.equal(url?.pathname, '/pair');
    assert.equal(url?.searchParams.get('secret'), 'abc');
  });

  // These targets used to make `new URL(target, base)` throw outside any try/catch and kill the bridge.
  for (const target of ['//', '/\\', '//evil.example/ws', '/\\evil.example', undefined, '', 'http://evil.example/', 'relative']) {
    it(`rejects ${JSON.stringify(target)} without throwing`, () => {
      assert.equal(parseRequestUrl(target), null);
    });
  }

  it('normalises dot segments instead of passing them through', () => {
    assert.equal(parseRequestUrl('/a/../../etc/passwd')?.pathname, '/etc/passwd');
  });
});

describe('secret and cookie', () => {
  it('creates distinct, long secrets', () => {
    const [a, b] = [createSecret(), createSecret()];
    assert.notEqual(a, b);
    assert.ok(a.length >= 43);
  });

  it('matches only the exact secret', () => {
    assert.equal(secretsMatch('secret-value', 'secret-value'), true);
    assert.equal(secretsMatch('secret-value', 'secret-value '), false);
    assert.equal(secretsMatch('secret-value', ''), false);
    assert.equal(secretsMatch('secret-value', null), false);
    assert.equal(secretsMatch('secret-value', ['secret-value']), false);
  });

  it('keeps the secret across restarts in a 0600 file, and replaces an unreadable one', () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'office-secret-'));
    const file = path.join(folder, 'data', 'secret');
    const first = readOrCreateSecret(file);
    assert.equal(readOrCreateSecret(file), first);
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    writeFileSync(file, 'short');
    const replaced = readOrCreateSecret(file);
    assert.notEqual(replaced, 'short');
    assert.equal(readFileSync(file, 'utf8').trim(), replaced);
    rmSync(folder, { recursive: true, force: true });
  });

  it('reads one cookie out of a Cookie header', () => {
    assert.equal(readCookie('a=1; poste_session=xyz; b=2', 'poste_session'), 'xyz');
    assert.equal(readCookie('xposte_session=xyz', 'poste_session'), null);
    assert.equal(readCookie(undefined, 'poste_session'), null);
  });

  it('sets an HttpOnly, SameSite=Strict cookie', () => {
    assert.match(sessionCookie('s'), /^poste_session=s; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Strict$/);
  });
});

describe('Host and Origin', () => {
  it('accepts loopback hosts on the configured port only', () => {
    assert.equal(hostAllowed(policy, fakeRequest({ host: 'localhost:4848' })), true);
    assert.equal(hostAllowed(policy, fakeRequest({ host: '127.0.0.1:4848' })), true);
    assert.equal(hostAllowed(policy, fakeRequest({ host: 'LOCALHOST:4848' })), true);
    assert.equal(hostAllowed(policy, fakeRequest({ host: 'localhost:9999' })), false);
    assert.equal(hostAllowed(policy, fakeRequest({ host: 'rebind.attacker.example:4848' })), false);
    assert.equal(hostAllowed(policy, fakeRequest({})), false);
  });

  it('upgrades only with host, origin and session cookie all valid', () => {
    assert.equal(checkUpgrade(policy, fakeRequest(goodHeaders)), 'ok');
    assert.equal(checkUpgrade(policy, fakeRequest({ ...goodHeaders, host: 'evil.example' })), 'bad-host');
    assert.equal(checkUpgrade(policy, fakeRequest({ ...goodHeaders, origin: 'http://evil.example' })), 'bad-origin');
    assert.equal(checkUpgrade(policy, fakeRequest({ host: goodHeaders.host, cookie: goodHeaders.cookie })), 'bad-origin');
    assert.equal(checkUpgrade(policy, fakeRequest({ ...goodHeaders, origin: 'null' })), 'bad-origin');
    assert.equal(checkUpgrade(policy, fakeRequest({ ...goodHeaders, cookie: 'poste_session=wrong' })), 'bad-cookie');
    assert.equal(checkUpgrade(policy, fakeRequest({ host: goodHeaders.host, origin: goodHeaders.origin })), 'bad-cookie');
  });
});
