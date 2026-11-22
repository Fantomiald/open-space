// The keys of each trigger (handed to its runs' `os-secret` when they start) or each mod (given to its page), when there
// is no vault (server/vault.ts: Open Space without its desktop app): written in OFFICE_DIR/trigger-keys.json and
// mods-env.json, readable by the user's account only, never sent to the page but their names (a mod's go to its own
// page). The sessions' file tools cannot read them either (see hiddenRules in claude-process.ts). With a vault, they
// move there at start (migrateShelf).
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isSecretName, MAX_SECRET_LENGTH, MAX_SECRETS, type SecretEntry } from '../shared/secrets.ts';
import type { KeyShelf } from './vault.ts';

type Stored = Record<string, Record<string, string>>;

export class KeyFile implements KeyShelf {
  private readonly file: string;
  private kept: Stored = {};

  constructor(file: string) {
    this.file = file;
    try {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [id, keys] of Object.entries(raw)) {
          if (!keys || typeof keys !== 'object') continue;
          const valid = Object.entries(keys).filter((entry): entry is [string, string] => isSecretName(entry[0]) && typeof entry[1] === 'string' && entry[1] !== '' && entry[1].length <= MAX_SECRET_LENGTH);
          if (valid.length) this.kept[id] = Object.fromEntries(valid.slice(0, MAX_SECRETS));
        }
      }
    } catch { /* none yet, or unreadable: no keys */ }
  }

  names(owner: string): string[] { return Object.keys(this.kept[owner] ?? {}).sort(); }

  /** The names of every owner's keys, for the page. */
  all(): Record<string, string[]> {
    return Object.fromEntries(Object.keys(this.kept).map((id) => [id, this.names(id)]));
  }

  entries(owner: string): SecretEntry[] {
    return Object.entries(this.kept[owner] ?? {}).map(([name, value]) => ({ name, value }));
  }

  /** Adds or replaces keys (a later entry wins over an earlier one of the same name); returns the names kept. */
  set(owner: string, entries: readonly SecretEntry[]): string[] {
    const keys = { ...this.kept[owner] };
    const kept: string[] = [];
    for (const { name, value } of entries) {
      if (!isSecretName(name) || !value || value.length > MAX_SECRET_LENGTH) continue;
      if (!(name in keys) && Object.keys(keys).length >= MAX_SECRETS) continue;
      keys[name] = value;
      if (!kept.includes(name)) kept.push(name);
    }
    if (kept.length) { this.kept[owner] = keys; this.save(); }
    return kept;
  }

  /** Forgets one key, or all the keys of the owner (when it is removed). */
  drop(owner: string, name?: string) {
    const keys = this.kept[owner];
    if (!keys || (name !== undefined && !(name in keys))) return;
    if (name === undefined) delete this.kept[owner];
    else {
      delete keys[name];
      if (!Object.keys(keys).length) delete this.kept[owner];
    }
    this.save();
  }

  private save() {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, `${JSON.stringify(this.kept, null, 2)}\n`, { mode: 0o600 });
    // an older file keeps its mode through writeFileSync
    chmodSync(this.file, 0o600);
  }
}
