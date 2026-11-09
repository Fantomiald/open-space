// The keys a trigger hands each of its runs (shared/secrets.ts): written in OFFICE_DIR/trigger-keys.json, readable by
// the user's account only, never sent to the page (only their names) and given to a run's `os-secret` when it starts.
// A run's session cannot read that folder either (see hiddenRules in claude-process.ts).
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isSecretName, MAX_SECRET_LENGTH, MAX_SECRETS, type SecretEntry } from '../shared/secrets.ts';

type Stored = Record<string, Record<string, string>>;

export class TriggerKeys {
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

  names(triggerId: string): string[] { return Object.keys(this.kept[triggerId] ?? {}).sort(); }

  /** The names of every trigger's keys, for the page. */
  all(): Record<string, string[]> {
    return Object.fromEntries(Object.keys(this.kept).map((id) => [id, this.names(id)]));
  }

  entries(triggerId: string): SecretEntry[] {
    return Object.entries(this.kept[triggerId] ?? {}).map(([name, value]) => ({ name, value }));
  }

  /** Adds or replaces keys (a later entry wins over an earlier one of the same name); returns the names kept. */
  set(triggerId: string, entries: readonly SecretEntry[]): string[] {
    const keys = { ...this.kept[triggerId] };
    const kept: string[] = [];
    for (const { name, value } of entries) {
      if (!isSecretName(name) || !value || value.length > MAX_SECRET_LENGTH) continue;
      if (!(name in keys) && Object.keys(keys).length >= MAX_SECRETS) continue;
      keys[name] = value;
      if (!kept.includes(name)) kept.push(name);
    }
    if (kept.length) { this.kept[triggerId] = keys; this.save(); }
    return kept;
  }

  /** Forgets one key, or all the keys of the trigger (when it is removed). */
  drop(triggerId: string, name?: string) {
    const keys = this.kept[triggerId];
    if (!keys || (name !== undefined && !(name in keys))) return;
    if (name === undefined) delete this.kept[triggerId];
    else {
      delete keys[name];
      if (!Object.keys(keys).length) delete this.kept[triggerId];
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
