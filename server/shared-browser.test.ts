import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { asJson } from './json.ts';
import { type CdpMessage, cookiesToClear, isKept, readSites, relaySharedCdp, SharedCdpFilter, SharedTabs, writeSites } from './shared-browser.ts';

describe('the tabs of the shared browser', () => {
  it('gives a tab created through an owner to that owner', () => {
    const tabs = new SharedTabs();
    const url = tabs.expect('s1');
    assert.match(url, /^about:blank#os-[0-9a-f]{16}$/);
    assert.equal(tabs.claim({ targetId: 't1', type: 'page', url }), 's1');
    assert.equal(tabs.ownerOf('t1'), 's1');
  });

  it('gives a popup to the owner of its opener', () => {
    const tabs = new SharedTabs();
    tabs.claim({ targetId: 't1', type: 'page', url: tabs.expect('s1.2') });
    assert.equal(tabs.claim({ targetId: 't2', type: 'page', url: '', openerId: 't1' }), 's1.2');
  });

  it('owns nothing else', () => {
    const tabs = new SharedTabs();
    tabs.expect('s1');
    assert.equal(tabs.claim({ targetId: 't3', type: 'page', url: 'about:blank' }), undefined);
    assert.equal(tabs.claim({ targetId: 'w', type: 'service_worker', url: 'https://x' }), undefined);
    assert.equal(tabs.ownerOf('t3'), undefined);
  });

  it('lists a session’s tabs, testers included', () => {
    const tabs = new SharedTabs();
    tabs.claim({ targetId: 'a', type: 'page', url: tabs.expect('s1') });
    tabs.claim({ targetId: 'b', type: 'page', url: tabs.expect('s1.2') });
    tabs.claim({ targetId: 'c', type: 'page', url: tabs.expect('s10') });
    assert.deepEqual(tabs.tabsOfSession('s1').sort(), ['a', 'b']);
  });

  it('forgets an owner’s tabs and the sites they visited, Google’s kept', () => {
    const tabs = new SharedTabs();
    tabs.claim({ targetId: 't1', type: 'page', url: tabs.expect('s1') });
    tabs.visit('t1', 'https://staging.kiin.ai/login');
    tabs.visit('t1', 'https://tagmanager.google.com/#/home');
    assert.equal(tabs.visit('t1', 'chrome://settings'), undefined);
    // the site's origin, port included: its storage belongs to the origin, not to the host
    assert.equal(tabs.visit('t1', 'https://staging.kiin.ai/dashboard'), 'https://staging.kiin.ai');
    assert.equal(tabs.visit('t1', 'http://localhost:5173/login'), 'http://localhost:5173');
    assert.deepEqual(tabs.release('s1'), { tabs: ['t1'], origins: ['https://staging.kiin.ai', 'http://localhost:5173'] });
    assert.equal(tabs.ownerOf('t1'), undefined);
    assert.deepEqual(tabs.release('s1'), { tabs: [], origins: [] });
  });
});

describe('the sites kept', () => {
  it('keeps Google’s sites and nothing that only looks like them', () => {
    assert.equal(isKept('google.com'), true);
    assert.equal(isKept('accounts.google.com'), true);
    assert.equal(isKept('.google.com'), true);
    assert.equal(isKept('google.com.evil.io'), false);
    assert.equal(isKept('notgoogle.com'), false);
  });

  it('clears the cookies of the sites visited, or every one but the kept at launch', () => {
    const cookie = (domain: string) => ({ name: 'n', domain, path: '/' });
    const cookies = [cookie('.kiin.ai'), cookie('staging.kiin.ai'), cookie('.google.com'), cookie('other.io')];
    assert.deepEqual(cookiesToClear(cookies, ['https://staging.kiin.ai']), [cookie('.kiin.ai'), cookie('staging.kiin.ai')]);
    assert.deepEqual(cookiesToClear([cookie('127.0.0.1')], ['http://127.0.0.1:8766']), [cookie('127.0.0.1')]);
    assert.deepEqual(cookiesToClear(cookies), [cookie('.kiin.ai'), cookie('staging.kiin.ai'), cookie('other.io')]);
  });
});

const attached = (sessionId: string, targetId: string, url: string, extra: Record<string, unknown> = {}): CdpMessage => ({
  method: 'Target.attachedToTarget', params: { sessionId, targetInfo: { targetId, type: 'page', url, ...extra }, waitingForDebugger: true },
});
/** The address the filter gave a new tab of its owner (what Chrome then reports for that tab). */
const created = (filter: SharedCdpFilter, id = 1) => String(asJson(filter.fromClient({ id, method: 'Target.createTarget', params: { url: 'about:blank' } }).upstream?.params).url);

describe('the shared browser seen by one owner', () => {
  it('rewrites a new tab so that it comes back to its owner', () => {
    const filter = new SharedCdpFilter('s1', new SharedTabs());
    const url = created(filter);
    assert.match(url, /#os-/);
    // in a window of its own: a background tab of a shared window gets no animation frame, so Playwright could not click in it
    assert.equal(asJson(filter.fromClient({ id: 2, method: 'Target.createTarget', params: { url: 'about:blank' } }).upstream?.params).newWindow, true);
    const event = attached('S', 't', url);
    assert.deepEqual(filter.fromUpstream(event), { client: event, upstream: [] });
  });

  it('hides another owner’s tab and lets it go', () => {
    const tabs = new SharedTabs();
    const mine = new SharedCdpFilter('s1', tabs), theirs = new SharedCdpFilter('s2', tabs);
    const result = mine.fromUpstream(attached('S', 't', created(theirs)));
    assert.equal(result.client, undefined);
    assert.deepEqual(result.upstream.map((message) => [message.method, message.sessionId ?? (message.params as CdpMessage).sessionId]), [
      ['Runtime.runIfWaitingForDebugger', 'S'], ['Target.detachFromTarget', 'S'],
    ]);
    assert.ok(result.upstream.every((message) => Number(message.id) >= 1_000_000_000));
    assert.deepEqual(mine.fromUpstream({ id: Number(result.upstream[0].id), result: {} }), { upstream: [] });
    assert.equal(mine.fromUpstream({ method: 'Page.frameNavigated', sessionId: 'S', params: {} }).client, undefined);
    assert.equal(mine.fromUpstream({ method: 'Target.detachedFromTarget', params: { sessionId: 'S' } }).client, undefined);
  });

  it('passes an owned tab to a new connection', () => {
    const tabs = new SharedTabs();
    const url = created(new SharedCdpFilter('s1', tabs));
    tabs.claim({ targetId: 't', type: 'page', url });
    const again = new SharedCdpFilter('s1', tabs);
    assert.ok(again.fromUpstream({ ...attached('S2', 't', 'https://tagmanager.google.com/'), params: { sessionId: 'S2', targetInfo: { targetId: 't', type: 'page', url: 'https://tagmanager.google.com/' }, waitingForDebugger: false } }).client);
  });

  it('gives each of two owners creating at once only its own tab', () => {
    const tabs = new SharedTabs();
    const a = new SharedCdpFilter('s1', tabs), b = new SharedCdpFilter('s2', tabs);
    const urlA = created(a), urlB = created(b);
    for (const filter of [a, b]) {
      const seen = [attached('SA', 'ta', urlA), attached('SB', 'tb', urlB)].filter((event) => filter.fromUpstream(event).client);
      assert.deepEqual(seen.map((event) => ((event.params as CdpMessage).targetInfo as CdpMessage).targetId), [filter === a ? 'ta' : 'tb']);
    }
  });

  it('keeps popups and frames with their tab', () => {
    const filter = new SharedCdpFilter('s1', new SharedTabs());
    filter.fromUpstream(attached('S', 't', created(filter)));
    assert.ok(filter.fromUpstream(attached('P', 'popup', '', { openerId: 't' })).client);
    const frame: CdpMessage = { method: 'Target.attachedToTarget', sessionId: 'S', params: { sessionId: 'F', targetInfo: { targetId: 'f', type: 'iframe', url: 'https://checkout.com/' } } };
    assert.ok(filter.fromUpstream(frame).client);
    assert.ok(filter.fromUpstream({ method: 'Runtime.consoleAPICalled', sessionId: 'F', params: {} }).client);
    assert.ok(filter.fromClient({ id: 9, method: 'Runtime.evaluate', sessionId: 'F', params: {} }).upstream);
  });

  it('holds a session it attached to itself', () => {
    const tabs = new SharedTabs();
    const filter = new SharedCdpFilter('s1', tabs);
    tabs.claim({ targetId: 't', type: 'page', url: created(filter) });
    assert.ok(filter.fromClient({ id: 5, method: 'Target.attachToTarget', params: { targetId: 't', flatten: true } }).upstream);
    filter.fromUpstream({ id: 5, result: { sessionId: 'X' } });
    assert.ok(filter.fromClient({ id: 6, method: 'Page.enable', sessionId: 'X', params: {} }).upstream);
  });

  it('refuses what reaches beyond the owner', () => {
    const filter = new SharedCdpFilter('s1', new SharedTabs());
    const refused = (message: CdpMessage) => {
      const result = filter.fromClient(message);
      return !result.upstream && !!(result.client?.error as CdpMessage | undefined)?.message;
    };
    assert.ok(refused({ id: 1, method: 'Runtime.evaluate', sessionId: 'unknown', params: {} }));
    assert.ok(refused({ id: 2, method: 'Target.closeTarget', params: { targetId: 'other' } }));
    assert.ok(refused({ id: 3, method: 'Target.attachToTarget', params: { targetId: 'other', flatten: true } }));
    assert.ok(refused({ id: 4, method: 'Target.createTarget', params: { url: 'https://example.com' } }));
    for (const method of ['Storage.getCookies', 'Storage.clearCookies', 'Network.getAllCookies', 'Network.clearBrowserCookies', 'Storage.clearDataForOrigin']) {
      assert.ok(refused({ id: 6, method, params: {} }), method);
    }
    assert.deepEqual(filter.fromClient({ id: 7, method: 'Browser.close', params: {} }), { client: { id: 7, result: {} }, close: true });
  });

  it('holds a session on the browser itself to the same rules (Playwright’s newCDPSession)', () => {
    const tabs = new SharedTabs();
    const filter = new SharedCdpFilter('s1', tabs), other = new SharedCdpFilter('s2', tabs);
    assert.ok(filter.fromClient({ id: 1, method: 'Target.attachToBrowserTarget', params: {} }).upstream);
    // Chrome tells of the session before it answers, as a target of type "browser": it must not be let go of
    const told: CdpMessage = { method: 'Target.attachedToTarget', params: { sessionId: 'B', targetInfo: { targetId: 'br', type: 'browser', url: '' }, waitingForDebugger: false } };
    assert.deepEqual(filter.fromUpstream(told), { client: told, upstream: [] });
    filter.fromUpstream({ id: 1, result: { sessionId: 'B' } });
    const onBrowser = (message: CdpMessage) => filter.fromClient({ ...message, sessionId: 'B' });
    // an answer goes back on the session it was asked on, or Playwright takes it for another
    assert.equal(onBrowser({ id: 2, method: 'Target.closeTarget', params: { targetId: 'other' } }).client?.sessionId, 'B');
    assert.ok(onBrowser({ id: 2, method: 'Target.closeTarget', params: { targetId: 'other' } }).client?.error);
    assert.ok(onBrowser({ id: 3, method: 'Storage.getCookies', params: {} }).client?.error);
    assert.match(String(asJson(onBrowser({ id: 4, method: 'Target.createTarget', params: { url: 'about:blank' } }).upstream?.params).url), /#os-/);
    assert.deepEqual(onBrowser({ id: 5, method: 'Browser.close', params: {} }), { client: { id: 5, result: {}, sessionId: 'B' }, close: true });
    const theirs = filter.fromUpstream({ ...attached('S', 't', created(other)), sessionId: 'B' });
    assert.equal(theirs.client, undefined);
    // let go of on the session it was attached on: Chrome knows no such session at the root
    assert.equal(theirs.upstream[1].sessionId, 'B');
    assert.ok(onBrowser({ id: 6, method: 'Target.detachFromTarget', params: { sessionId: 'B' } }).upstream);
  });

  it('holds a page session to the browser’s rules too: Target and Browser reach the whole browser from there', () => {
    const tabs = new SharedTabs();
    const filter = new SharedCdpFilter('s1', tabs), other = new SharedCdpFilter('s2', tabs);
    filter.fromUpstream(attached('S', 't', created(filter)));
    tabs.claim({ targetId: 'o', type: 'page', url: created(other) });
    const onPage = (message: CdpMessage) => filter.fromClient({ ...message, sessionId: 'S' });
    const refusedOnPage = (message: CdpMessage) => { const result = onPage(message); return !result.upstream && result.client?.sessionId === 'S' && !!result.client.error; };
    assert.ok(refusedOnPage({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'o', flatten: true } }));
    assert.ok(refusedOnPage({ id: 2, method: 'Target.closeTarget', params: { targetId: 'o' } }));
    assert.deepEqual(onPage({ id: 3, method: 'Browser.close', params: {} }), { client: { id: 3, result: {}, sessionId: 'S' }, close: true });
    assert.match(String(asJson(onPage({ id: 4, method: 'Target.createTarget', params: { url: 'about:blank' } }).upstream?.params).url), /#os-/);
    assert.ok(onPage({ id: 5, method: 'Target.getTargets', params: {} }).upstream);
    const owned = { targetId: 't', type: 'page', url: 'x' }, theirs = { targetId: 'o', type: 'page', url: 'y' };
    assert.deepEqual(filter.fromUpstream({ id: 5, sessionId: 'S', result: { targetInfos: [owned, theirs] } }).client, { id: 5, sessionId: 'S', result: { targetInfos: [owned] } });
    // another owner's tab attached through the page session: let go of there, never shown
    const nested = filter.fromUpstream({ method: 'Target.attachedToTarget', sessionId: 'S', params: { sessionId: 'X', targetInfo: theirs, waitingForDebugger: true } });
    assert.equal(nested.client, undefined);
    assert.deepEqual(nested.upstream.map((message) => [message.method, message.sessionId]), [['Runtime.runIfWaitingForDebugger', 'X'], ['Target.detachFromTarget', 'S']]);
    assert.ok(filter.fromClient({ id: 6, method: 'Runtime.evaluate', sessionId: 'X', params: {} }).client?.error);
    assert.equal(filter.fromUpstream({ method: 'Target.targetCreated', sessionId: 'S', params: { targetInfo: theirs } }).client, undefined);
    for (const method of ['Browser.crash', 'Browser.crashGpuProcess']) assert.ok(filter.fromClient({ id: 7, method, params: {} }).client?.error, method);
  });

  it('refuses reading or changing the kept accounts’ cookies', () => {
    const filter = new SharedCdpFilter('s1', new SharedTabs());
    filter.fromUpstream(attached('S', 't', created(filter)));
    const refused = (message: CdpMessage) => !filter.fromClient(message).upstream;
    assert.ok(refused({ id: 1, method: 'Network.getCookies', sessionId: 'S', params: { urls: ['https://accounts.google.com'] } }));
    assert.ok(refused({ id: 2, method: 'Storage.clearDataForStorageKey', params: { storageKey: 'https://accounts.google.com/', storageTypes: 'all' } }));
    assert.ok(refused({ id: 3, method: 'Network.deleteCookies', sessionId: 'S', params: { name: 'SID', domain: '.google.com' } }));
    assert.ok(refused({ id: 4, method: 'Storage.setCookies', params: { cookies: [{ name: 'SID', value: '', domain: '.google.com', path: '/' }] } }));
    assert.ok(refused({ id: 5, method: 'Network.setCookie', sessionId: 'S', params: { name: 'SID', value: '', url: 'https://accounts.google.com/' } }));
    assert.ok(!refused({ id: 6, method: 'Storage.setCookies', params: { cookies: [{ name: 'qa', value: '1', domain: '127.0.0.1', path: '/' }] } }));
    assert.ok(!refused({ id: 7, method: 'Network.deleteCookies', sessionId: 'S', params: { name: 'qa', url: 'http://127.0.0.1:8766/' } }));
  });

  it('lists only the owner’s targets', () => {
    const tabs = new SharedTabs();
    const filter = new SharedCdpFilter('s1', tabs);
    const owned = { targetId: 't', type: 'page', url: created(filter) };
    const other = { targetId: 'o', type: 'page', url: 'https://example.com/' };
    assert.ok(filter.fromClient({ id: 7, method: 'Target.getTargets', params: {} }).upstream);
    assert.deepEqual(filter.fromUpstream({ id: 7, result: { targetInfos: [owned, other] } }).client, { id: 7, result: { targetInfos: [owned] } });
  });
});

/** A fake Chrome, and Open Space's end of a relay to it that a test client connects to. */
async function relayed(onCommand: (chrome: WebSocket, message: CdpMessage) => void) {
  const chrome = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  chrome.on('connection', (socket) => socket.on('message', (data) => onCommand(socket, JSON.parse(String(data)))));
  await new Promise((resolve) => chrome.once('listening', resolve));
  const relay = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  relay.on('connection', (socket) => relaySharedCdp(socket, `ws://127.0.0.1:${(chrome.address() as AddressInfo).port}`, 's1', new SharedTabs()));
  await new Promise((resolve) => relay.once('listening', resolve));
  const client = new WebSocket(`ws://127.0.0.1:${(relay.address() as AddressInfo).port}`);
  const received: CdpMessage[] = [];
  client.on('message', (data) => received.push(JSON.parse(String(data))));
  await new Promise((resolve) => client.once('open', resolve));
  const stop = () => { client.close(); relay.close(); chrome.close(); };
  return { chrome, client, received, stop };
}
const until = async (check: () => boolean) => { for (let tries = 0; tries < 100 && !check(); tries++) await new Promise((resolve) => setTimeout(resolve, 10)); };

describe('the relay to the shared browser', () => {
  it('relays an owned tab', async () => {
    const { client, received, stop } = await relayed((chrome, message) => {
      if (message.method !== 'Target.createTarget') return;
      const url = asJson(message.params).url;
      chrome.send(JSON.stringify(attached('S', 't', String(url))));
      chrome.send(JSON.stringify({ id: message.id, result: { targetId: 't' } }));
    });
    client.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
    await until(() => received.length === 2);
    assert.match(String(asJson(asJson(received[0].params).targetInfo).url), /#os-/);
    assert.deepEqual(received[1], { id: 1, result: { targetId: 't' } });
    stop();
  });

  it('closes the client when Chrome goes', async () => {
    const { chrome, client, stop } = await relayed(() => {});
    const closed = new Promise((resolve) => client.once('close', resolve));
    await until(() => chrome.clients.size === 1);
    for (const socket of chrome.clients) socket.terminate();
    await closed;
    stop();
  });
});

describe('the sites left to clear', () => {
  it('outlive Open Space: kept in a file, read back whole, nothing from a missing or broken one', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'open-space-sites-'));
    const file = path.join(folder, 'sites.json');
    assert.deepEqual(await readSites(file), []);
    await writeSites(file, ['staging.kiin.ai', 'app.example.com']);
    assert.deepEqual(await readSites(file), ['staging.kiin.ai', 'app.example.com']);
    writeFileSync(file, '{not json');
    assert.deepEqual(await readSites(file), []);
    rmSync(folder, { recursive: true, force: true });
  });
});
