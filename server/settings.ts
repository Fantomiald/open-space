// The user's settings, kept in OFFICE_DIR/settings.json: chosen at the first start (the onboarding, see `onboarded`)
// and changed later in the page. Before the onboarding, the file only holds the notifications, or does not exist.
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PET, parsePet } from '../shared/pets.ts';
import { DEFAULT_PERMISSION_MODE, isPermissionMode, type Preferences } from '../shared/protocol.ts';
import { asArray, isJson } from './json.ts';

export const DEFAULT_PREFERENCES: Preferences = {
  notifications: true, roots: [], defaultFolder: '', model: '', permissionMode: DEFAULT_PERMISSION_MODE, agentNote: '', festivals: true, pet: DEFAULT_PET,
};

export const MAX_AGENT_NOTE = 600;
const MAX_ROOTS = 20;

/** The settings found in untrusted JSON: what is valid is kept, the rest left out. Folders must be absolute. */
export function parsePreferences(raw: unknown): Partial<Preferences> {
  if (!isJson(raw)) return {};
  const found: Partial<Preferences> = {};
  if (typeof raw.notifications === 'boolean') found.notifications = raw.notifications;
  if (typeof raw.festivals === 'boolean') found.festivals = raw.festivals;
  if (Array.isArray(raw.roots)) found.roots = [...new Set(asArray(raw.roots).filter((root): root is string => typeof root === 'string' && path.isAbsolute(root)).map((root) => path.resolve(root)))].slice(0, MAX_ROOTS);
  if (typeof raw.defaultFolder === 'string' && (raw.defaultFolder === '' || path.isAbsolute(raw.defaultFolder))) found.defaultFolder = raw.defaultFolder && path.resolve(raw.defaultFolder);
  if (typeof raw.model === 'string' && /^[\w.:[\]-]{0,80}$/.test(raw.model)) found.model = raw.model;
  if (isPermissionMode(raw.permissionMode)) found.permissionMode = raw.permissionMode;
  if (typeof raw.agentNote === 'string') found.agentNote = raw.agentNote.trim().slice(0, MAX_AGENT_NOTE);
  const pet = parsePet(raw.pet);
  if (pet) found.pet = pet;
  return found;
}

export class Settings {
  preferences: Preferences = { ...DEFAULT_PREFERENCES };
  /** false until the user went through the first start */
  onboarded = false;
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  async load() {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      this.preferences = { ...DEFAULT_PREFERENCES, ...parsePreferences(raw) };
      this.onboarded = isJson(raw) && raw.onboarded === true;
    } catch { /* missing or unreadable: the defaults, and the onboarding */ }
  }

  get notifications() { return this.preferences.notifications; }

  async update(changes: Partial<Preferences>, onboarded = this.onboarded) {
    this.preferences = { ...this.preferences, ...changes };
    this.onboarded = onboarded;
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify({ onboarded: this.onboarded, ...this.preferences }, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
