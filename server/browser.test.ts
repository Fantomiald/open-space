import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { addressOf, MODIFIERS, SHARED_LANE, shownFormat } from '../shared/browser.ts';
import { accountsBrowserOf, browserKey, browserMcpConfig, Browsers, chromeArgs, keyEvent, PICTURE_HEAD, picturePart, shortAddress, testerAgent, typingTab, TESTERS, testerAgents, testerLane } from './browser.ts';
import { browserId, lanesOf, sessionOfBrowser } from '../shared/browser.ts';
import { buildClaudeArgs } from './claude-process.ts';
import { parseClientMessage } from './messages.ts';

const ENDPOINT = 'http://127.0.0.1:4848/browser/s1/cdp/key';
const serverOf = (config: string) => Object.entries(JSON.parse(config).mcpServers)[0] as [string, { command: string; args: string[]; env?: Record<string, string> }];

describe('the Playwright server of a session', () => {
  it('takes the user’s own, under its name, pointed at the session’s browser', () => {
    const [name, server] = serverOf(browserMcpConfig(ENDPOINT, {
      web: { type: 'stdio', command: '/usr/bin/npx', args: ['@playwright/mcp@latest', '--browser', 'firefox', '--headless', '--user-data-dir=/tmp/p', '--caps', 'vision'], env: { PATH: '/bin' } },
      other: { command: 'x' },
    }));
    assert.equal(name, 'web');
    assert.equal(server.command, '/usr/bin/npx');
    assert.deepEqual(server.env, { PATH: '/bin' });
    assert.deepEqual(server.args, ['@playwright/mcp@latest', '--caps', 'vision', '--cdp-endpoint', ENDPOINT]);
  });

  it('is npx @playwright/mcp when the user has none', () => {
    const [name, server] = serverOf(browserMcpConfig(ENDPOINT, { other: { command: 'x' } }));
    assert.equal(name, 'playwright');
    assert.equal(server.command, process.platform === 'win32' ? 'cmd.exe' : 'npx');
    assert.deepEqual(server.args, [...(process.platform === 'win32' ? ['/d', '/c', 'npx'] : []), '-y', '@playwright/mcp@latest', '--cdp-endpoint', ENDPOINT]);
  });

  it('reaches claude with --mcp-config, and the session is told its browser is shown', () => {
    const config = browserMcpConfig(ENDPOINT, {});
    const args = buildClaudeArgs({ sessionId: 's1', resume: false, model: '', permissionMode: 'auto', name: 'Ada', mcpConfig: config });
    assert.equal(args[args.indexOf('--mcp-config') + 1], config);
    assert.match(args[args.indexOf('--append-system-prompt') + 1], /Playwright/);
    assert.doesNotMatch(buildClaudeArgs({ sessionId: 's1', resume: false, model: '', permissionMode: 'auto', name: 'Ada' }).join(' '), /--mcp-config|Playwright/);
  });

  it('gives each tester a server of its own on a browser of its own, and keeps the session’s from them', () => {
    const agents = JSON.parse(testerAgents(ENDPOINT, { web: { command: 'npx', args: ['@playwright/mcp@latest'] } }, { description: 'd', prompt: 'use tester-browser' }));
    assert.equal(Object.keys(agents).length, TESTERS);
    const second = agents[testerAgent(2)];
    assert.deepEqual(second.mcpServers, [{ 'tester-browser-2': { command: 'npx', args: ['@playwright/mcp@latest', '--cdp-endpoint', `${ENDPOINT}/lane/2`] } }]);
    assert.equal(second.prompt, 'use tester-browser-2');
    assert.deepEqual(second.disallowedTools, ['mcp__web']);
    const args = buildClaudeArgs({ sessionId: 's1', resume: true, model: '', permissionMode: 'auto', name: 'Ada', agents: JSON.stringify(agents) });
    assert.ok(JSON.parse(args[args.indexOf('--agents') + 1])[testerAgent(4)]);
  });

  it('adds the shared browser, under a name of its own', () => {
    const shared = 'http://127.0.0.1:4848/browser/s1/shared/key';
    const servers = JSON.parse(browserMcpConfig(ENDPOINT, { web: { command: 'npx', args: ['@playwright/mcp@latest', '--extension'] } }, shared)).mcpServers;
    assert.deepEqual(Object.keys(servers), ['web', 'shared-browser']);
    assert.deepEqual(servers['shared-browser'].args, ['@playwright/mcp@latest', '--cdp-endpoint', shared]);
  });

  it('gives each tester the shared browser on its own lane', () => {
    const shared = 'http://127.0.0.1:4848/browser/s1/shared/key';
    const agents = JSON.parse(testerAgents(ENDPOINT, { web: { command: 'npx', args: ['@playwright/mcp@latest'] } }, { description: 'd', prompt: 'use tester-browser and shared-browser' }, shared));
    const second = agents[testerAgent(2)];
    assert.deepEqual(second.mcpServers[1], { 'tester-shared-2': { command: 'npx', args: ['@playwright/mcp@latest', '--cdp-endpoint', `${shared}/lane/2`] } });
    assert.equal(second.prompt, 'use tester-browser-2 and tester-shared-2');
    assert.deepEqual(second.disallowedTools, ['mcp__web', 'mcp__shared-browser']);
  });

  it('leaves the shared browser out when not asked', () => {
    assert.deepEqual(Object.keys(JSON.parse(browserMcpConfig(ENDPOINT, {})).mcpServers), ['playwright']);
    const tester = JSON.parse(testerAgents(ENDPOINT, {}, { description: 'd', prompt: 'p' }))[testerAgent(1)];
    assert.equal(tester.mcpServers.length, 1);
    assert.deepEqual(tester.disallowedTools, ['mcp__playwright']);
  });

  it('keeps the user’s own Chrome from every tester when the session has it', () => {
    const agents = JSON.parse(testerAgents(ENDPOINT, {}, { description: 'd', prompt: 'p' }, undefined, true));
    for (let lane = 1; lane <= TESTERS; lane++) assert.deepEqual(agents[testerAgent(lane)].disallowedTools, ['mcp__playwright', 'mcp__claude-in-chrome']);
  });

  it('names each browser of a session by its lane', () => {
    assert.equal(browserId('s1'), 's1');
    assert.equal(browserId('s1', 2), 's1.2');
    assert.equal(sessionOfBrowser('s1.2'), 's1');
    assert.deepEqual(lanesOf(['s1.2', 's2', 's1', 's1.1'], 's1'), [0, 1, 2]);
  });

  it('gets a key of its own session, which another session’s does not open', () => {
    assert.equal(browserKey('secret', 's1'), browserKey('secret', 's1'));
    assert.notEqual(browserKey('secret', 's1'), browserKey('secret', 's2'));
    assert.notEqual(browserKey('secret', 's1'), browserKey('other', 's1'));
  });
});

describe('the browser of the user’s accounts', () => {
  it('is the one chosen in the settings, for a trusted folder only', () => {
    assert.equal(accountsBrowserOf('shared', false), 'shared');
    assert.equal(accountsBrowserOf('chrome', false), 'chrome');
    assert.equal(accountsBrowserOf('chrome', true), null, 'a folder not trusted never reaches the user’s Chrome');
    assert.equal(accountsBrowserOf('shared', true), null, 'nor the shared browser');
  });
});

describe('a sub-agent that is done', () => {
  it('takes its browser with it when it is a tester, not otherwise', () => {
    assert.equal(testerLane(testerAgent(3)), 3);
    assert.equal(testerLane('general-purpose'), 0);
    assert.equal(testerLane('browser-tester-x'), 0);
  });
});

describe('the address bar', () => {
  it('opens local addresses in http, hosts in https, and searches the rest', () => {
    assert.equal(addressOf('localhost:5173/login'), 'http://localhost:5173/login');
    assert.equal(addressOf('127.0.0.1:4848'), 'http://127.0.0.1:4848');
    assert.equal(addressOf('example.com'), 'https://example.com');
    assert.equal(addressOf('https://example.com/a b'), 'https://example.com/a b');
    assert.equal(addressOf('how to center a div'), 'https://www.google.com/search?q=how%20to%20center%20a%20div');
    assert.equal(addressOf('about:blank'), 'about:blank');
  });

  it('refuses other schemes', () => {
    for (const typed of ['javascript:alert(1)', 'file:///etc/passwd', 'chrome://settings', '  ']) assert.equal(addressOf(typed), null, typed);
  });
});

describe('the format shown', () => {
  const state = (size: { width: number; height: number } | null) => ({ tabs: [], active: null, format: 'desktop' as const, size });

  it('is the one picked until a page is pictured', () => {
    assert.equal(shownFormat(state(null)), 'desktop');
  });

  it('follows the size the agent gave the page', () => {
    assert.equal(shownFormat(state({ width: 375, height: 667 })), 'mobile');
    assert.equal(shownFormat(state({ width: 768, height: 1024 })), 'desktop');
  });
});

describe('the keys passed on to the page', () => {
  it('types characters, and Enter as a carriage return', () => {
    assert.deepEqual(keyEvent({ kind: 'key', type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 0 }), { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 0, text: 'a', unmodifiedText: 'a' });
    assert.equal(keyEvent({ kind: 'key', type: 'keyDown', key: 'Enter', code: 'Enter', modifiers: 0 }).text, '\r');
    assert.equal(keyEvent({ kind: 'key', type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 0 }).type, 'keyUp');
  });

  it('sends the keys that type nothing with their code, and ⌘A as select all', () => {
    assert.deepEqual(keyEvent({ kind: 'key', type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', modifiers: 0 }), { type: 'rawKeyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 0 });
    const selectAll = keyEvent({ kind: 'key', type: 'keyDown', key: 'a', code: 'KeyA', modifiers: MODIFIERS.meta });
    assert.equal(selectAll.type, 'rawKeyDown');
    assert.deepEqual(selectAll.commands, ['selectAll']);
  });

  it('types punctuation rather than the key sharing its character code (. is 46, Delete)', () => {
    for (const key of ['.', "'", '(', '&', '%', '$', '#', '!', '"']) {
      const down = keyEvent({ kind: 'key', type: 'keyDown', key, code: '', modifiers: 0 });
      assert.equal(down.text, key);
      assert.ok(![33, 34, 35, 36, 37, 38, 39, 40, 46].includes(Number(down.windowsVirtualKeyCode)), `${key} sent as key ${down.windowsVirtualKeyCode}`);
    }
    assert.equal(keyEvent({ kind: 'key', type: 'keyDown', key: '7', code: 'Digit7', modifiers: 0 }).windowsVirtualKeyCode, 55);
  });
});

describe('the pictures of the page', () => {
  it('follows each picture with the next part\'s headers, which is when Chrome shows it', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const part = picturePart(jpeg);
    assert.deepEqual(part.subarray(0, jpeg.length), jpeg);
    assert.equal(part.subarray(jpeg.length).toString(), `\r\n${PICTURE_HEAD}`);
  });
});

describe('the messages of the browser', () => {
  it('keeps clicks inside the picture and known actions only', () => {
    assert.deepEqual(parseClientMessage({ t: 'browserInput', sessionId: 's1', input: { kind: 'mouse', type: 'mousePressed', x: 0.5, y: 0.25, button: 'left', clicks: 1, modifiers: 8 } }),
      { t: 'browserInput', sessionId: 's1', lane: 0, input: { kind: 'mouse', type: 'mousePressed', x: 0.5, y: 0.25, button: 'left', clicks: 1, modifiers: 8 } });
    assert.equal(parseClientMessage({ t: 'browserInput', sessionId: 's1', input: { kind: 'mouse', type: 'mousePressed', x: 2, y: 0, button: 'left' } }), null);
    assert.equal(parseClientMessage({ t: 'browserInput', sessionId: 's1', input: { kind: 'mouse', type: 'drag', x: 0, y: 0, button: 'left' } }), null);
    assert.deepEqual(parseClientMessage({ t: 'browser', sessionId: 's1', action: { kind: 'navigate', url: 'localhost:3000' } }), { t: 'browser', sessionId: 's1', lane: 0, action: { kind: 'navigate', url: 'localhost:3000' } });
    assert.equal(parseClientMessage({ t: 'browser', sessionId: 's1', action: { kind: 'eval' } }), null);
    assert.deepEqual(parseClientMessage({ t: 'browser', sessionId: 's1', lane: 3, action: { kind: 'reload' } }), { t: 'browser', sessionId: 's1', lane: 3, action: { kind: 'reload' } });
  });
});

describe('the profiles swept', () => {
  it('keeps the shared browser’s', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'open-space-profiles-'));
    for (const name of ['_shared', 'gone', 's1']) mkdirSync(path.join(folder, name));
    await new Browsers({ chrome: null, folder, sessionAlive: () => false, onState: () => {}, log: () => {} }).sweepProfiles(new Set(['s1']));
    assert.deepEqual(['_shared', 'gone', 's1'].map((name) => existsSync(path.join(folder, name))), [true, false, true]);
    rmSync(folder, { recursive: true, force: true });
  });
});

describe('the Chrome launched', () => {
  it('never plays sound out loud', () => {
    for (const shared of [true, false]) assert.ok(chromeArgs('/p/s1', shared).includes('--mute-audio'));
  });
  it('keeps every window of the shared browser drawn: each owner works in a window of its own, side by side', () => {
    assert.ok(chromeArgs('/p/_shared', true).includes('--disable-backgrounding-occluded-windows'));
    assert.ok(!chromeArgs('/p/s1', false).includes('--disable-backgrounding-occluded-windows'));
    assert.ok(chromeArgs('/p/s1', false).includes('--user-data-dir=/p/s1'));
    assert.equal(chromeArgs('/p/s1', false).at(-1), 'about:blank');
  });
});

describe('the browser a key opens', () => {
  it('is never the shared one, nor a tester that does not exist', async () => {
    const browsers = new Browsers({ chrome: null, folder: os.tmpdir(), sessionAlive: () => false, onState: () => {}, log: () => {} });
    await assert.rejects(browsers.version('s1', SHARED_LANE), /no such browser/);
    await assert.rejects(browsers.version('s1', TESTERS + 1), /no such browser/);
  });
});

describe('the tab os-secret type types into', () => {
  const tabs = [{ id: 'a', url: 'https://tagmanager.google.com/#/container/1', title: '' }, { id: 'b', url: 'https://staging.example.org/login?next=/', title: '' }];

  it('is the one on the address given, else the one shown, else the only one', () => {
    assert.equal(typingTab(tabs, 'a', 'https://staging.example.org/')?.id, 'b');
    assert.equal(typingTab(tabs, 'a', 'https://other.example.org/'), undefined);
    assert.equal(typingTab(tabs, 'b', '')?.id, 'b');
    assert.equal(typingTab(tabs, null, ''), undefined);
    assert.equal(typingTab(tabs.slice(0, 1), null, '')?.id, 'a');
  });

  it('is told back without its query nor fragment', () => {
    assert.equal(shortAddress('https://staging.example.org/login?token=abc#x'), 'https://staging.example.org/login');
    assert.equal(shortAddress('about:blank#open-space-helper'), 'about:blank');
  });
});
