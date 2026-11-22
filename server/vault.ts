// The vault: the keys the user keeps beyond a session (for a project, for every session, for a trigger or a mod), in a
// file of the desktop app's own folder (app.getPath('userData'), so `npm run app:dev` never writes over the installed
// app's). Each value is sealed by the operating system (Electron's safeStorage: the macOS Keychain, Windows DPAPI, a
// Linux keyring), which only the app's main process reaches: the bridge asks it through appPort (`Cipher`). Without the
// app, or with no real keyring behind it, there is no vault and the keys stay in memory (server/secrets.ts).
// The names, scopes, consents and uses are written in clear (the page sees the names anyway); a value that cannot be
// opened (another keychain, a key denied) counts as missing, but its sealed form stays in the file.
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isSecretName, MAX_SECRET_LENGTH, MAX_SECRETS, type KeysStorage, type SecretEntry, type StoredKey, type VaultScope } from '../shared/secrets.ts';
import { isJson } from './json.ts';

/** Seals and opens values: the app's safeStorage, or a fake one in the tests. `open` gives null for a value it cannot open. */
export interface Cipher {
  seal(text: string): Promise<string>;
  open(sealed: readonly string[]): Promise<(string | null)[]>;
}

interface Entry {
  id: string;
  name: string;
  scope: VaultScope;
  /** as written in the file; null until sealed (or when sealing failed: kept in memory only) */
  sealed: string | null;
  /** null when it could not be opened */
  value: string | null;
  /** the projects where it is handed to a session without asking ("always for this project") */
  allowed: string[];
  /** the projects whose sessions used it, most recent first */
  usedIn: string[];
  lastUsed?: { at: number; by: string };
}

const MAX_KEYS = 500;
const MAX_PROJECTS = 50;
/** a use is written down at most this often per key: the filter around Playwright reads keys at every answer */
const TOUCH_WRITE_MS = 60_000;

const sameScope = (a: VaultScope, b: VaultScope) =>
  a.kind === b.kind && (a.kind === 'project' ? a.path === (b as typeof a).path : a.kind === 'trigger' || a.kind === 'mod' ? a.id === (b as typeof a).id : true);
const ownerOf = (scope: VaultScope) => (scope.kind === 'project' ? scope.path : scope.kind === 'all' ? undefined : scope.id);
const strings = (raw: unknown) => (Array.isArray(raw) ? raw.filter((each): each is string => typeof each === 'string') : []);

function parseScope(raw: unknown): VaultScope | null {
  if (!isJson(raw)) return null;
  if (raw.kind === 'all') return { kind: 'all' };
  if (raw.kind === 'project' && typeof raw.path === 'string' && path.isAbsolute(raw.path)) return { kind: 'project', path: raw.path };
  if ((raw.kind === 'trigger' || raw.kind === 'mod') && typeof raw.id === 'string' && raw.id) return { kind: raw.kind, id: raw.id };
  return null;
}

export class Vault {
  readonly storage: KeysStorage;
  private readonly file: string;
  private readonly cipher: Cipher;
  private readonly now: () => number;
  private entries: Entry[] = [];
  /** seals and writes, one after the other */
  private writing: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private onChange: () => void = () => {};

  private constructor(file: string, cipher: Cipher, storage: KeysStorage, now: () => number) {
    this.file = file;
    this.cipher = cipher;
    this.storage = storage;
    this.now = now;
  }

  /** Reads the file and opens its values (an unreadable file: an empty vault, whose first write replaces it). */
  static async open(file: string, cipher: Cipher, storage: KeysStorage, now: () => number = Date.now): Promise<Vault> {
    const vault = new Vault(file, cipher, storage, now);
    let raw: unknown = null;
    try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
    const listed = isJson(raw) && Array.isArray(raw.keys) ? raw.keys : [];
    const read: Entry[] = [];
    for (const each of listed.slice(0, MAX_KEYS)) {
      if (!isJson(each) || typeof each.name !== 'string' || !isSecretName(each.name) || typeof each.sealed !== 'string') continue;
      const scope = parseScope(each.scope);
      if (!scope || read.some((other) => other.name === each.name && sameScope(other.scope, scope))) continue;
      const lastUsed = isJson(each.lastUsed) && typeof each.lastUsed.at === 'number' && typeof each.lastUsed.by === 'string' ? { at: each.lastUsed.at, by: each.lastUsed.by } : undefined;
      read.push({
        id: typeof each.id === 'string' && each.id ? each.id : randomUUID(), name: each.name, scope, sealed: each.sealed, value: null,
        allowed: strings(each.allowed).slice(0, MAX_PROJECTS), usedIn: strings(each.usedIn).slice(0, MAX_PROJECTS), ...(lastUsed ? { lastUsed } : {}),
      });
    }
    let opened: (string | null)[] = [];
    try { opened = await cipher.open(read.map((entry) => entry.sealed ?? '')); } catch { /* none opened: all count as missing */ }
    read.forEach((entry, index) => { entry.value = typeof opened[index] === 'string' && opened[index] ? opened[index] : null; });
    vault.entries = read;
    return vault;
  }

  /** Called whenever a key is added, replaced, removed, or consented to. */
  watch(onChange: () => void) { this.onChange = onChange; }

  /** The keys, for the page: never their values. */
  list(): StoredKey[] {
    return this.entries.map(({ id, name, scope, usedIn, lastUsed }) => ({ id, name, scope: scope.kind, ...(ownerOf(scope) ? { owner: ownerOf(scope) } : {}), usedIn: [...usedIn], ...(lastUsed ? { lastUsed: { ...lastUsed } } : {}) }));
  }

  has(id: string) { return this.entries.some((entry) => entry.id === id); }

  /** The key a session of `project` gets under `name`: the project's own first, else the one for every session. */
  lookup(name: string, project: string): { id: string; value: string; scope: 'project' | 'all'; allowed: boolean } | null {
    const usable = (entry: Entry) => entry.name === name && entry.value !== null;
    const found = this.entries.find((entry) => usable(entry) && entry.scope.kind === 'project' && entry.scope.path === project)
      ?? this.entries.find((entry) => usable(entry) && entry.scope.kind === 'all');
    if (!found?.value) return null;
    return { id: found.id, value: found.value, scope: found.scope.kind === 'project' ? 'project' : 'all', allowed: found.allowed.includes(project) };
  }

  /** An entry handed to a session of `project`, while it holds a value and is still for that project or every session. */
  handed(id: string, project: string): { id: string; value: string; scope: 'project' | 'all' } | null {
    const found = this.entries.find((entry) => entry.id === id);
    if (!found?.value) return null;
    if (found.scope.kind === 'all') return { id, value: found.value, scope: 'all' };
    return found.scope.kind === 'project' && found.scope.path === project ? { id, value: found.value, scope: 'project' } : null;
  }

  /** The keys of one owner (a trigger, a mod), with their values. */
  entriesOf(scope: VaultScope): SecretEntry[] {
    return this.entries.filter((entry) => sameScope(entry.scope, scope) && entry.value !== null).map((entry) => ({ name: entry.name, value: entry.value! }));
  }

  /** The names of a kind of owner's keys, by owner (a trigger's or a mod's, for the page). */
  namesBy(kind: 'trigger' | 'mod'): Record<string, string[]> {
    const names: Record<string, string[]> = {};
    for (const entry of this.entries) {
      if (entry.scope.kind !== kind || entry.value === null) continue;
      names[entry.scope.id] = [...(names[entry.scope.id] ?? []), entry.name];
    }
    for (const list of Object.values(names)) list.sort();
    return names;
  }

  /**
   * Keeps `value` under `name` there, replacing what was (an unreadable one too); returns its id, or null when it is not
   * a valid key or the owner has too many. Usable at once; sealed and written in the background (see flush).
   */
  set(name: string, scope: VaultScope, value: string): string | null {
    if (!isSecretName(name) || !value || value.length > MAX_SECRET_LENGTH) return null;
    let entry = this.entries.find((each) => each.name === name && sameScope(each.scope, scope));
    if (!entry) {
      const owned = this.entries.filter((each) => sameScope(each.scope, scope)).length;
      if (owned >= (scope.kind === 'all' || scope.kind === 'project' ? MAX_KEYS : MAX_SECRETS) || this.entries.length >= MAX_KEYS) return null;
      entry = { id: randomUUID(), name, scope, sealed: null, value: null, allowed: [], usedIn: [] };
      this.entries.push(entry);
    }
    const kept = entry;
    // the file keeps the value before until this one is sealed
    kept.value = value;
    this.later(async () => {
      const sealed = await this.cipher.seal(value);
      // replaced again meanwhile: the later value is sealed by its own turn
      if (kept.value === value) kept.sealed = sealed;
      this.write();
    });
    this.onChange();
    return kept.id;
  }

  /** Replaces the value of a key, wherever it is kept. */
  replace(id: string, value: string): boolean {
    const entry = this.entries.find((each) => each.id === id);
    return !!entry && this.set(entry.name, entry.scope, value) !== null;
  }

  remove(id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    if (this.entries.length === before) return false;
    this.later(async () => this.write());
    this.onChange();
    return true;
  }

  /** Forgets one key of an owner, or all of them (a trigger or a mod removed). */
  drop(scope: VaultScope, name?: string) {
    for (const entry of this.entries.filter((each) => sameScope(each.scope, scope) && (name === undefined || each.name === name))) this.remove(entry.id);
  }

  /** "Always for this project": the key goes to the project's sessions without asking. */
  allow(id: string, project: string) {
    const entry = this.entries.find((each) => each.id === id);
    if (!entry || entry.allowed.includes(project)) return;
    entry.allowed = [project, ...entry.allowed].slice(0, MAX_PROJECTS);
    this.later(async () => this.write());
    this.onChange();
  }

  /** A key was used by `by` (a session's name, a trigger's, a mod's), in `project` when it is a session's. */
  touch(id: string, by: string, project?: string) {
    const entry = this.entries.find((each) => each.id === id);
    if (!entry) return;
    const at = this.now();
    const fresh = !entry.lastUsed || at - entry.lastUsed.at >= TOUCH_WRITE_MS || entry.lastUsed.by !== by || (project !== undefined && entry.usedIn[0] !== project);
    entry.lastUsed = { at, by };
    if (project !== undefined) entry.usedIn = [project, ...entry.usedIn.filter((each) => each !== project)].slice(0, MAX_PROJECTS);
    if (!fresh) return;
    this.later(async () => this.write());
    this.onChange();
  }

  /** The keys of an owner (a trigger, a mod) were used by it. */
  touchOwner(scope: VaultScope, by: string) {
    for (const entry of this.entries.filter((each) => sameScope(each.scope, scope))) this.touch(entry.id, by);
  }

  /** Waits for the seals and writes asked so far; throws when one of them failed since the last flush. */
  async flush() {
    await this.writing;
    const failure = this.failure;
    this.failure = null;
    if (failure) throw failure;
  }

  private later(step: () => Promise<void>) {
    this.writing = this.writing.then(step).catch((error: unknown) => { this.failure = error; });
  }

  /** The file, written whole and atomically (0600): the sealed values only, a value not sealed yet waits for its own write. */
  private write() {
    const keys = this.entries.filter((entry) => entry.sealed !== null).map(({ id, name, scope, sealed, allowed, usedIn, lastUsed }) => ({ id, name, scope, sealed, allowed, usedIn, ...(lastUsed ? { lastUsed } : {}) }));
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, keys }, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, this.file);
  }
}

/** The keys of one kind of owner (each trigger's, each mod's): what the triggers and the mods keep, whether in the vault or in a file. */
export interface KeyShelf {
  names(owner: string): string[];
  all(): Record<string, string[]>;
  entries(owner: string): SecretEntry[];
  set(owner: string, entries: readonly SecretEntry[]): string[];
  drop(owner: string, name?: string): void;
}

/** A KeyShelf in the vault: the keys of each trigger, or each mod, under a scope of its own. */
export class VaultShelf implements KeyShelf {
  private readonly vault: Vault;
  private readonly kind: 'trigger' | 'mod';

  constructor(vault: Vault, kind: 'trigger' | 'mod') {
    this.vault = vault;
    this.kind = kind;
  }

  names(owner: string) { return this.vault.namesBy(this.kind)[owner] ?? []; }
  all() { return this.vault.namesBy(this.kind); }
  entries(owner: string) { return this.vault.entriesOf({ kind: this.kind, id: owner }); }

  set(owner: string, entries: readonly SecretEntry[]): string[] {
    const kept: string[] = [];
    for (const { name, value } of entries) if (this.vault.set(name, { kind: this.kind, id: owner }, value) && !kept.includes(name)) kept.push(name);
    return kept;
  }

  drop(owner: string, name?: string) { this.vault.drop({ kind: this.kind, id: owner }, name); }
}

/** Forgets the keys of the owners gone (a trigger deleted before its keys went with it): those `kept` says no to. */
export function pruneShelf(shelf: KeyShelf, kept: (owner: string) => boolean) {
  for (const owner of Object.keys(shelf.all())) if (!kept(owner)) shelf.drop(owner);
}

/**
 * Moves the keys of a file shelf (trigger-keys.json, mods-env.json) into the vault, then removes the file, only once
 * the vault is written. Nothing happens without the file; a failed write leaves it for the next start. A name the vault
 * already holds keeps the vault's value: the file may be older (a start that failed, or keys typed while Open Space ran
 * without its app).
 */
export async function migrateShelf(file: string, from: KeyShelf, to: KeyShelf, vault: Vault) {
  if (!existsSync(file)) return;
  for (const owner of Object.keys(from.all())) {
    const held = to.names(owner);
    to.set(owner, from.entries(owner).filter((entry) => !held.includes(entry.name)));
  }
  await vault.flush();
  rmSync(file, { force: true });
}

/**
 * The names of the triggers' and the mods' keys kept in the vault, written beside the other data (OFFICE_DIR) by the
 * app: Open Space started without its app cannot reach the vault, and says so rather than running without them.
 */
export interface VaultOwners { triggers: Record<string, string[]>; mods: Record<string, string[]> }

export function writeVaultOwners(file: string, vault: Vault) {
  const owners: VaultOwners = { triggers: vault.namesBy('trigger'), mods: vault.namesBy('mod') };
  writeFileSync(file, `${JSON.stringify(owners)}\n`, { mode: 0o600 });
}

export function readVaultOwners(file: string): VaultOwners | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!isJson(raw)) return null;
    const names = (value: unknown) => Object.fromEntries(Object.entries(isJson(value) ? value : {}).map(([owner, list]) => [owner, strings(list)]).filter(([, list]) => list.length));
    return { triggers: names(raw.triggers), mods: names(raw.mods) };
  } catch {
    return null;
  }
}
