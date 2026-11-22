import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { KeysCard } from '../shared/secrets.ts';
import { KeyFile } from './key-file.ts';
import { parseClientMessage } from './messages.ts';
import { answerSecrets, SecretStore, type KeyPlace, type SecretsApiDeps } from './secrets.ts';
import { migrateShelf, pruneShelf, readVaultOwners, Vault, VaultShelf, writeVaultOwners, type Cipher } from './vault.ts';
import { projectOf } from './worktrees.ts';

let base: string;
before(() => { base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-vault-'))); });
after(() => rmSync(base, { recursive: true, force: true }));

/** stands for safeStorage: a value it seals is not readable as is, one it was not given cannot be opened */
const cipher: Cipher = {
  seal: async (text) => `sealed:${Buffer.from(text).toString('base64')}`,
  open: async (sealed) => sealed.map((each) => (each.startsWith('sealed:') ? Buffer.from(each.slice(7), 'base64').toString() : null)),
};
let files = 0;
const vaultFile = () => path.join(base, `vault-${files++}.json`);

/** a store with a vault, and sessions placed where each test says */
function storeWith(vault: Vault | null, places: Record<string, Partial<KeyPlace>>) {
  return new SecretStore(() => {}, Date.now, { vault, place: (id) => (places[id] ? { name: id, project: '/repo/app', trigger: false, untrusted: false, ...places[id] } : null) });
}

describe('the keys vault', () => {
  it('keeps values sealed on disk, reads them back, and counts a value it cannot open as missing without losing it', async () => {
    const file = vaultFile();
    const vault = await Vault.open(file, cipher, 'keychain');
    vault.set('TOKEN', { kind: 'all' }, 'tok-123456');
    vault.set('P8', { kind: 'project', path: '/repo/app' }, '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----');
    await vault.flush();
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /tok-123456/);
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    const again = await Vault.open(file, cipher, 'keychain');
    assert.equal(again.lookup('TOKEN', '/elsewhere')?.value, 'tok-123456');
    assert.equal(again.lookup('P8', '/repo/app')?.value.split('\n').length, 3);
    const raw = JSON.parse(text);
    raw.keys[0].sealed = 'from another keychain';
    writeFileSync(file, JSON.stringify(raw));
    const broken = await Vault.open(file, cipher, 'keychain');
    assert.equal(broken.lookup('TOKEN', '/repo/app'), null, 'missing: it will be asked again');
    broken.allow(broken.list().find((key) => key.name === 'P8')!.id, '/repo/other');
    await broken.flush();
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).keys.find((key: { name: string }) => key.name === 'TOKEN').sealed, 'from another keychain', 'kept in the file');
    assert.equal(broken.list().length, 2, 'the page still lists it, to replace or delete');
  });

  it('gives a project its own key before the one for every session, matched whole', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('KEY', { kind: 'all' }, 'everywhere');
    vault.set('KEY', { kind: 'project', path: '/repo/app' }, 'for app');
    assert.equal(vault.lookup('KEY', '/repo/app')?.value, 'for app');
    assert.equal(vault.lookup('KEY', '/repo/app-2')?.value, 'everywhere', 'never by prefix');
    assert.equal(vault.lookup('KEY', '/repo')?.value, 'everywhere');
  });
});

describe('the keys of a session with a vault', () => {
  it('prefers its own copy, then its project, then every session', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('KEY', { kind: 'all' }, 'everywhere');
    vault.set('KEY', { kind: 'project', path: '/repo/app' }, 'for app');
    const store = storeWith(vault, { s: {}, t: { project: '/repo/other' } });
    store.grant('s', ['KEY']);
    store.grant('t', ['KEY']);
    assert.equal(store.get('s', 'KEY'), 'for app');
    assert.equal(store.get('t', 'KEY'), 'everywhere');
    store.set('s', [{ name: 'KEY', value: 'pasted' }]);
    assert.equal(store.get('s', 'KEY'), 'pasted');
    assert.equal(store.scopeOf('s', 'KEY'), 'session');
    assert.deepEqual(store.inherited('t'), ['KEY']);
    assert.deepEqual(store.given('t'), []);
  });

  it('saves a key pasted for its project or everywhere, allowed in its project, and only a copy without a vault', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    const store = storeWith(vault, { s: {}, other: { project: '/repo/other' }, wild: { untrusted: true } });
    assert.deepEqual(store.give('s', [{ name: 'A', value: 'aaaa', scope: 'project' }, { name: 'B', value: 'bbbb', scope: 'all' }, { name: 'C', value: 'cccc' }]), ['A', 'B', 'C']);
    assert.deepEqual(vault.list().map((key) => `${key.name}:${key.scope}:${key.owner ?? ''}`).sort(), ['A:project:/repo/app', 'B:all:']);
    assert.equal(store.scopeOf('s', 'C'), 'session');
    assert.deepEqual(store.offer('other', ['A', 'B']), { silent: [], stored: [{ name: 'B', scope: 'all' }], missing: ['A'] }, 'another project is asked, and has no key of app');
    store.give('wild', [{ name: 'D', value: 'dddd', scope: 'all' }]);
    assert.equal(vault.lookup('D', '/repo/app')?.allowed, false, 'saved from a folder not trusted: its project is not allowed');

    const memory = storeWith(null, { s: {} });
    assert.deepEqual(memory.give('s', [{ name: 'A', value: 'aaaa', scope: 'project' }]), ['A']);
    assert.equal(memory.scopeOf('s', 'A'), 'session', 'no vault: kept in memory, as before');
  });

  it('hands a saved key without asking only once its project is allowed, never to a folder not trusted nor by scope to a trigger’s run', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('KEY', { kind: 'all' }, 'k-123456');
    const store = storeWith(vault, { s: {}, s2: {}, wild: { untrusted: true }, run: { trigger: true } });
    assert.deepEqual(store.offer('s', ['KEY']), { silent: [], stored: [{ name: 'KEY', scope: 'all' }], missing: [] });
    store.give('s', [], { stored: ['KEY'], always: false });
    assert.equal(store.get('s', 'KEY'), 'k-123456', 'this time');
    assert.deepEqual(store.offer('s2', ['KEY']).stored.length, 1, 'still asked: this time only');
    store.give('s2', [], { stored: ['KEY'], always: true });
    assert.deepEqual(store.offer('s', ['OTHER', 'KEY']).missing, ['OTHER']);
    const fresh = storeWith(vault, { s3: {} });
    assert.deepEqual(fresh.offer('s3', ['KEY']).silent, ['KEY'], 'always for this project');
    const wild = storeWith(vault, { wild: { untrusted: true } });
    assert.deepEqual(wild.offer('wild', ['KEY']), { silent: [], stored: [{ name: 'KEY', scope: 'all' }], missing: [] }, 'a folder not trusted always sees the box, even in an allowed project');
    const elsewhere = storeWith(vault, { wild: { untrusted: true, project: '/repo/wild' } });
    elsewhere.give('wild', [], { stored: ['KEY'], always: true });
    assert.equal(elsewhere.get('wild', 'KEY'), 'k-123456', 'given this time');
    assert.equal(vault.lookup('KEY', '/repo/wild')?.allowed, false, '"always" is never kept for it');
    const run = storeWith(vault, { run: { trigger: true } });
    assert.deepEqual(run.offer('run', ['KEY']), { silent: [], stored: [], missing: ['KEY'] }, 'a run gets its trigger’s keys only');
    run.give('run', [{ name: 'NEW', value: 'nnnn', scope: 'all' }], { stored: ['KEY'], always: true });
    assert.equal(run.get('run', 'KEY'), null);
    assert.equal(vault.lookup('NEW', '/repo/app'), null, 'a run saves nothing in the vault');
  });

  it('binds what was handed to the vault’s entry: the key for every session never opens another project’s key of that name', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('KEY', { kind: 'all' }, 'everywhere');
    vault.set('KEY', { kind: 'project', path: '/repo/other' }, 'for other');
    const places: Record<string, Partial<KeyPlace>> = { s: { project: '/repo/app' } };
    const store = storeWith(vault, places);
    store.give('s', [], { stored: ['KEY'], always: true });
    assert.equal(store.get('s', 'KEY'), 'everywhere');
    places.s = { project: '/repo/other' };
    assert.equal(store.get('s', 'KEY'), 'everywhere', 'still the entry consented to');
    assert.equal(vault.lookup('KEY', '/repo/other')?.allowed, false, '"always" stayed on the key for every session');
  });

  it('lets an agent forget its copy, never the vault’s key', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('KEY', { kind: 'all' }, 'k-123456');
    const store = storeWith(vault, { s: {} });
    store.grant('s', ['KEY']);
    const reply = await answerSecrets({ sessionId: 's', action: 'forget', form: new URLSearchParams({ name: 'KEY' }) }, deps(store));
    assert.equal(reply.status, 200);
    assert.equal(store.get('s', 'KEY'), null);
    assert.equal(vault.lookup('KEY', '/repo/app')?.value, 'k-123456');
  });

  it('writes down who used a key and where, for the settings', async () => {
    let now = 1000;
    const vault = await Vault.open(vaultFile(), cipher, 'keychain', () => now);
    vault.set('KEY', { kind: 'all' }, 'k-123456');
    const store = storeWith(vault, { Morgane: {} });
    store.grant('Morgane', ['KEY']);
    store.get('Morgane', 'KEY');
    assert.equal(vault.list()[0]?.lastUsed, undefined, 'reading for the Playwright filter is not a use');
    now = 5000;
    store.get('Morgane', 'KEY', true);
    assert.deepEqual(vault.list()[0]?.lastUsed, { at: 5000, by: 'Morgane' });
    assert.deepEqual(vault.list()[0]?.usedIn, ['/repo/app']);
  });
});

describe('os-secret ask with a vault', () => {
  it('takes allowed keys at once, offers the others with the missing ones, and says where each came from', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('ALLOWED', { kind: 'all' }, 'aaaa');
    vault.allow(vault.list()[0]!.id, '/repo/app');
    vault.set('SAVED', { kind: 'project', path: '/repo/app' }, 'ssss');
    const store = storeWith(vault, { s: {} });
    const cards: { names: string[]; card: KeysCard }[] = [];
    const api = deps(store, (names, card) => { cards.push({ names, card }); store.give('s', [{ name: 'NEW', value: 'nnnn' }], { stored: ['SAVED'], always: false }); });
    const reply = await answerSecrets({ sessionId: 's', action: 'ask', form: new URLSearchParams({ names: 'ALLOWED SAVED NEW' }) }, api);
    assert.equal(reply.status, 200);
    assert.deepEqual(cards, [{ names: ['NEW'], card: { stored: [{ name: 'SAVED', scope: 'project' }], canSave: true, project: '/repo/app' } }], 'mixed: no "always"');
    assert.match(reply.text, /Ready: ALLOWED \(saved\), SAVED \(saved\), NEW \(pasted\)/);
    const known = await answerSecrets({ sessionId: 's', action: 'ask', form: new URLSearchParams({ names: 'ALLOWED' }) }, api);
    assert.equal(known.status, 200);
    assert.equal(cards.length, 1, 'nothing asked for a key held');
  });

  it('offers "always" when every key is saved, but not to a folder not trusted', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('SAVED', { kind: 'all' }, 'ssss');
    const cards: KeysCard[] = [];
    for (const untrusted of [false, true]) {
      const store = storeWith(vault, { s: { untrusted } });
      await answerSecrets({ sessionId: 's', action: 'ask', form: new URLSearchParams({ names: 'SAVED' }) }, deps(store, (_, card) => { cards.push(card); }));
    }
    assert.equal(cards[0]?.canAlways, true);
    assert.equal(cards[1]?.canAlways, undefined);
  });

  it('asks again for a key that fails, to replace it where it is kept', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    vault.set('SAVED', { kind: 'project', path: '/repo/app' }, 'old-value');
    const store = storeWith(vault, { s: {} });
    store.grant('s', ['SAVED']);
    const cards: { names: string[]; card: KeysCard }[] = [];
    const api = deps(store, (names, card) => { cards.push({ names, card }); store.give('s', [{ name: 'SAVED', value: 'new-value', scope: 'project' }]); });
    const reply = await answerSecrets({ sessionId: 's', action: 'ask', form: new URLSearchParams({ names: 'SAVED', again: '1', why: '401 from the API' }) }, api);
    assert.equal(reply.status, 200);
    assert.deepEqual(cards[0], { names: ['SAVED'], card: { stored: [], again: true, scopes: { SAVED: 'project' }, canSave: true, project: '/repo/app' } });
    assert.equal(vault.lookup('SAVED', '/repo/app')?.value, 'new-value', 'replaced in the vault, for every session');
  });

  it('fails at once in a run nobody can answer, and waits when a chat bot follows it', async () => {
    const store = storeWith(null, { run: { trigger: true } });
    let asked = 0;
    const api = { ...deps(store, () => { asked++; store.set('run', [{ name: 'KEY', value: 'kkkk' }]); }), unattended: () => true };
    const alone = await answerSecrets({ sessionId: 'run', action: 'ask', form: new URLSearchParams({ names: 'KEY' }) }, api);
    assert.equal(alone.status, 409);
    assert.match(alone.text, /automatic run/);
    assert.equal(asked, 0);
    const followed = await answerSecrets({ sessionId: 'run', action: 'ask', form: new URLSearchParams({ names: 'KEY' }) }, { ...api, unattended: () => false });
    assert.equal(followed.status, 200);
    assert.equal(asked, 1);
  });
});

describe('the keys of triggers and mods', () => {
  it('move from their file into the vault, the file removed once the vault is written', async () => {
    const file = path.join(base, 'trigger-keys.json');
    new KeyFile(file).set('t1', [{ name: 'TOKEN', value: 'tok-1' }, { name: 'API', value: 'api-1' }]);
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    const shelf = new VaultShelf(vault, 'trigger');
    await migrateShelf(file, new KeyFile(file), shelf, vault);
    assert.equal(existsSync(file), false);
    assert.deepEqual(shelf.all(), { t1: ['API', 'TOKEN'] });
    assert.deepEqual(shelf.entries('t1').sort((a, b) => a.name.localeCompare(b.name)), [{ name: 'API', value: 'api-1' }, { name: 'TOKEN', value: 'tok-1' }]);
    assert.equal(vault.lookup('TOKEN', '/repo/app'), null, 'a trigger’s key is no session’s');
    shelf.drop('t1', 'API');
    assert.deepEqual(shelf.names('t1'), ['TOKEN']);
  });

  it('never replace a value the vault holds when an older file is moved again', async () => {
    const file = path.join(base, 'trigger-keys-again.json');
    new KeyFile(file).set('t1', [{ name: 'TOKEN', value: 'typed-without-the-app' }, { name: 'NEW', value: 'new-1' }]);
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    const shelf = new VaultShelf(vault, 'trigger');
    shelf.set('t1', [{ name: 'TOKEN', value: 'in-the-vault' }]);
    await migrateShelf(file, new KeyFile(file), shelf, vault);
    assert.deepEqual(shelf.entries('t1').sort((a, b) => a.name.localeCompare(b.name)), [{ name: 'NEW', value: 'new-1' }, { name: 'TOKEN', value: 'in-the-vault' }]);
  });

  it('leave their names beside the data, for Open Space started without its app', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    new VaultShelf(vault, 'trigger').set('t1', [{ name: 'TOKEN', value: 'tok-1' }]);
    new VaultShelf(vault, 'mod').set('my-mod', [{ name: 'API', value: 'api-1' }]);
    const file = path.join(base, 'vault-keys.json');
    writeVaultOwners(file, vault);
    assert.doesNotMatch(readFileSync(file, 'utf8'), /tok-1|api-1/, 'names only');
    assert.deepEqual(readVaultOwners(file), { triggers: { t1: ['TOKEN'] }, mods: { 'my-mod': ['API'] } });
    assert.equal(readVaultOwners(path.join(base, 'none.json')), null);
  });

  it('go with their trigger once it is deleted', async () => {
    const vault = await Vault.open(vaultFile(), cipher, 'keychain');
    const shelf = new VaultShelf(vault, 'trigger');
    shelf.set('kept', [{ name: 'A', value: 'aaaa' }]);
    shelf.set('deleted', [{ name: 'B', value: 'bbbb' }]);
    pruneShelf(shelf, (id) => id === 'kept');
    assert.deepEqual(shelf.all(), { kept: ['A'] });
    assert.deepEqual(vault.list().map((key) => key.owner), ['kept']);
  });

  it('keep their file when the vault cannot be written', async () => {
    const file = path.join(base, 'mods-env.json');
    new KeyFile(file).set('my-mod', [{ name: 'KEY', value: 'k-1' }]);
    const failing: Cipher = { seal: async () => { throw new Error('denied'); }, open: async (sealed) => sealed.map(() => null) };
    const vault = await Vault.open(vaultFile(), failing, 'keychain');
    await assert.rejects(migrateShelf(file, new KeyFile(file), new VaultShelf(vault, 'mod'), vault));
    assert.equal(existsSync(file), true);
  });
});

describe('what the page sends about keys', () => {
  it('takes a scope per key, keys of the vault handed over, and the settings’ changes, nothing else', () => {
    assert.deepEqual(parseClientMessage({ t: 'secrets', sessionId: 's1', requestId: 'secrets-1', entries: [{ name: 'A', value: 'v', scope: 'project' }, { name: 'B', value: 'w', scope: 'session' }], stored: ['C'], always: true }),
      { t: 'secrets', sessionId: 's1', requestId: 'secrets-1', entries: [{ name: 'A', value: 'v', scope: 'project' }, { name: 'B', value: 'w' }], stored: ['C'], always: true });
    assert.deepEqual(parseClientMessage({ t: 'secrets', sessionId: 's1', requestId: 'secrets-1', entries: [], stored: ['C'] }), { t: 'secrets', sessionId: 's1', requestId: 'secrets-1', entries: [], stored: ['C'] });
    assert.equal(parseClientMessage({ t: 'secrets', sessionId: 's1', entries: [{ name: 'A', value: 'v', scope: 'trigger' }] }), null);
    assert.equal(parseClientMessage({ t: 'secrets', sessionId: 's1', entries: [], stored: [] }), null);
    assert.deepEqual(parseClientMessage({ t: 'saveKey', name: 'A', value: 'v', scope: { kind: 'project', path: '/repo/app' } }), { t: 'saveKey', name: 'A', value: 'v', scope: { kind: 'project', path: '/repo/app' } });
    assert.equal(parseClientMessage({ t: 'saveKey', name: 'A', value: 'v', scope: { kind: 'mod', id: 'x' } }), null, 'a mod’s variables are set in its settings');
    assert.deepEqual(parseClientMessage({ t: 'replaceKey', id: 'a1-b2', value: 'v' }), { t: 'replaceKey', id: 'a1-b2', value: 'v' });
    assert.equal(parseClientMessage({ t: 'deleteKey', id: '../x' }), null);
  });
});

describe('the project of a folder', () => {
  it('is the main checkout for a worktree, the top of the repository inside it, the folder itself outside git', () => {
    const repo = path.join(base, 'repo');
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q');
    writeFileSync(path.join(repo, 'src', 'a.txt'), 'a');
    git('add', '.');
    git('commit', '-qm', 'a');
    git('worktree', 'add', '-q', path.join(repo, '.claude', 'worktrees', 'os-x'), '-b', 'os/x');
    assert.equal(projectOf(path.join(repo, 'src')), repo);
    assert.equal(projectOf(path.join(repo, '.claude', 'worktrees', 'os-x', 'src')), repo);
    const outside = path.join(base, 'loose');
    mkdirSync(outside);
    assert.equal(projectOf(outside), outside);
  });

  it('is never another repository named by a hand-written pointer without git’s link back', () => {
    const repo = path.join(base, 'repo');
    const fake = path.join(base, 'impostor');
    mkdirSync(fake);
    // the agent of the impostor folder points it at a worktree entry of repo, or at one it made up in repo
    writeFileSync(path.join(fake, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'os-x')}\n`);
    assert.equal(projectOf(fake), fake, 'the entry names another folder');
    mkdirSync(path.join(repo, '.git', 'worktrees', 'made-up'), { recursive: true });
    writeFileSync(path.join(repo, '.git', 'worktrees', 'made-up', 'commondir'), '../..\n');
    writeFileSync(path.join(repo, '.git', 'worktrees', 'made-up', 'gitdir'), `${path.join(base, 'elsewhere', '.git')}\n`);
    writeFileSync(path.join(fake, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'made-up')}\n`);
    assert.equal(projectOf(fake), fake);
  });
});

/** a fake Open Space around the store: `answer` plays the user answering the box */
function deps(store: SecretStore, answer?: (names: string[], card: KeysCard) => void): SecretsApiDeps {
  return {
    store, roots: () => [base],
    ask: async (sessionId, names, _why, card) => { if (!answer) return null; answer(names, card); return store.names(sessionId); },
    setCookie: async () => {}, signIn: async () => {}, type: async () => '',
  };
}
