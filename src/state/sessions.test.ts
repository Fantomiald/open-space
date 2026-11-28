import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClientMessage, Preferences, ServerMessage, SessionInfo } from '../../shared/protocol.ts';

const stored = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
});
// a laptop's page, wide enough for two columns of windows beside the sessions' panel
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { innerWidth: 1600, matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) },
});
const { maxColumnsIn, useSessions } = await import('./sessions.ts');

const session = (id: string): SessionInfo => ({
  id, name: id, cwd: `/work/${id}`, model: '', activeModel: '', permissionMode: 'auto', state: 'wait', stateSince: 1000, createdAt: 0, turns: 1, permissions: [],
  subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 5,
});

const hello = (sessions: SessionInfo[], preferences: Partial<Preferences> = {}) => ({
  t: 'hello', claude: {}, roots: [], sessions, commands: [], folderCommands: {}, models: [], quota: null, build: '', crew: [],
  preferences: { language: 'fr', ...preferences } as Preferences, onboarded: true, rootsLocked: false, claudeDefaults: {}, appUpdate: null, browsers: {}, browserAvailable: false,
}) as unknown as ServerMessage;

describe('the windows a reload brings back', () => {
  it('ask the server for the conversation of each of them, not only of the one with the keyboard', () => {
    stored.set('poste:layout', JSON.stringify({ columns: [['ines'], ['alice']], selectedId: 'alice' }));
    const sent: ClientMessage[] = [];
    useSessions.setState({ send: (message) => { sent.push(message); return true; } });

    useSessions.getState().receive(hello([session('ines'), session('alice')]));

    assert.deepEqual(useSessions.getState().openIds, ['ines', 'alice']);
    const asked = sent.flatMap((message) => (message.t === 'log' ? [message.sessionId] : []));
    assert.deepEqual(asked.sort(), ['alice', 'ines']);
  });
});

/** A reload with these windows open, each session known to the server, the keyboard in `selectedId`. */
function reload(columns: string[][], selectedId: string, preferences: Partial<Preferences> = {}) {
  useSessions.getState().select(null);
  useSessions.setState({ send: () => true });
  stored.set('poste:layout', JSON.stringify({ columns, selectedId }));
  const ids = [...columns.flat(), 'new', 'other'];
  useSessions.getState().receive(hello(ids.map(session), preferences));
}

describe('which window gives its place', () => {
  it('a layout saved before the order was kept: the first opened (first in the grid) goes, not the one in use', () => {
    reload([['a', 'b', 'c'], ['d', 'e', 'f']], 'f');

    useSessions.getState().show('new');

    assert.deepEqual(useSessions.getState().columns, [['new', 'b', 'c'], ['d', 'e', 'f']]);
    assert.equal(useSessions.getState().selectedId, 'new');
  });

  it('the one opened longest ago goes, even when the keyboard went back to it since', () => {
    reload([['a']], 'a', { maxWindows: 2 });
    useSessions.getState().show('b');
    useSessions.getState().show('a');

    useSessions.getState().show('new');

    assert.deepEqual(useSessions.getState().openIds.sort(), ['b', 'new']);
  });

  it('a reload with more windows than allowed keeps the latest ones', () => {
    reload([['a', 'b', 'c']], 'c', { maxWindows: 2 });

    assert.deepEqual(useSessions.getState().openIds, ['b', 'c']);
  });

  it('fewer windows asked for: the ones opened longest ago close first', () => {
    reload([['a', 'b', 'c']], 'a');

    useSessions.getState().receive({ t: 'preferences', preferences: { language: 'fr', maxWindows: 1 } as Preferences, roots: [], onboarded: true, claudeDefaults: {} });

    assert.deepEqual(useSessions.getState().openIds, ['c']);
  });

  it('a saved opening order with a stale id and a missing one still closes the right window', () => {
    reload([['a', 'b', 'c']], 'a');
    useSessions.setState({ opened: ['gone', 'c', 'a'] });

    useSessions.getState().receive({ t: 'preferences', preferences: { language: 'fr', maxWindows: 2 } as Preferences, roots: [], onboarded: true, claudeDefaults: {} });

    assert.deepEqual(useSessions.getState().openIds, ['a', 'b']);
  });
});

describe('a click on a session in the panel or the room', () => {
  it('opens it when closed, goes to it when open, and closes it when the keyboard is already in it', () => {
    reload([['a', 'b']], 'a');
    const { toggleWindow } = useSessions.getState();

    toggleWindow('b');
    assert.equal(useSessions.getState().selectedId, 'b');
    assert.deepEqual(useSessions.getState().openIds, ['a', 'b']);

    toggleWindow('b');
    assert.deepEqual(useSessions.getState().openIds, ['a']);

    toggleWindow('new');
    assert.deepEqual(useSessions.getState().openIds, ['a', 'new']);
  });

  it('closes the window in use from the panel floating too', () => {
    reload([['a', 'b']], 'b');
    useSessions.getState().placeChrome('panel', { left: 600, top: 40, width: 300, height: 600 });

    useSessions.getState().toggleWindow('b');

    assert.deepEqual(useSessions.getState().openIds, ['a']);
    useSessions.getState().dockPanel();
  });
});

describe('resetting the layout', () => {
  it('puts the elements moved back, out of the front order, and docks the launcher', () => {
    reload([['a']], 'a');
    const launcher = { left: 0.2, top: 0.1, width: 0.4, height: 0.8 };
    useSessions.setState({ free: { room: { boxes: { launcher }, order: ['launcher'] }, focus: { boxes: {}, order: [] } } });
    useSessions.getState().placeChrome('radio', { left: 400, top: 300, width: 220, height: 40 });
    useSessions.getState().raiseWindow('chrome:radio');

    useSessions.getState().resetLayout();

    const { chrome, free } = useSessions.getState();
    assert.deepEqual({ places: chrome.places, free }, { places: {}, free: { room: { boxes: {}, order: [] }, focus: { boxes: {}, order: [] } } });
  });
});

describe('the room the sessions’ panel leaves the windows in focus mode', () => {
  it('is the whole width once it floats, but not the list’s place when the panel is turned off', () => {
    const page = window as { innerWidth: number };
    const width = page.innerWidth;
    page.innerWidth = 1100;
    const floating = { places: { panel: { left: 600, top: 40, width: 288, height: 600 } }, panelWidth: null };
    useSessions.setState({ preferences: { language: 'fr' } as Preferences, chrome: floating });
    const free = maxColumnsIn('focus');
    useSessions.setState({ preferences: { language: 'fr', sessionPanel: false } as Preferences });
    const off = maxColumnsIn('focus');
    page.innerWidth = width;
    useSessions.setState({ preferences: { language: 'fr' } as Preferences, chrome: { places: {}, panelWidth: null } });
    assert.deepEqual({ free, off }, { free: 3, off: 2 });
  });
});
