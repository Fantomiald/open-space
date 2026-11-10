// The user's settings, kept in OFFICE_DIR/settings.json: chosen at the first start (the onboarding, see `onboarded`)
// and changed later in the page. Before the onboarding, the file only holds the notifications, or does not exist.
import { readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isLanguage } from '../shared/i18n.ts';
import { DEFAULT_PET, parsePet } from '../shared/pets.ts';
import { DEFAULT_ROOM_THEME, isRoomTheme } from '../shared/room-themes.ts';
import { isAutomataFolder } from '../shared/automata.ts';
import { hooksAddressOf } from '../shared/triggers.ts';
import { NOTE_NAME } from '../shared/journal.ts';
import { parseClaudeSettings } from '../shared/claude-settings.ts';
import { ACCOUNTS_BROWSERS, DEFAULT_PERMISSION_MODE, EFFORTS, GLASS_OPACITY, IDLE_COMPACT_MINUTES, ISOLATE_MODES, isPermissionMode, TIME_FORMATS, WINDOW_STYLES, type Preferences } from '../shared/protocol.ts';
import { asArray, isJson } from './json.ts';
import { expandHomePath, isFullPath } from '../shared/paths.ts';
import { TERMINALS, type TerminalKind } from '../shared/terminal.ts';

export const DEFAULT_PREFERENCES: Preferences = {
  notifications: true, roots: [], defaultFolder: '', model: '', permissionMode: DEFAULT_PERMISSION_MODE, agentNote: '', festivals: true, officeLife: true, pet: DEFAULT_PET, theme: DEFAULT_ROOM_THEME,
  journalFolder: path.join(os.homedir(), 'Journal'),
  favoriteNotes: [],
  automataFolder: '',
  hooksAddress: '',
  copyOnSelect: false,
  autoPip: true,
  effort: '',
  claude: {},
  timeFormat: 'auto',
  timestamps: false,
  turnDuration: true,
  detailedActions: false,
  promptSuggestions: true,
  reduceMotion: false,
  glassOpacity: GLASS_OPACITY.initial,
  windowStyle: 'classic',
  tagColors: false,
  idleCompact: 0,
  autoTag: false,
  remoteByDefault: false,
  // a settings file from before worktrees has none: it gets this one
  isolate: 'busy',
  accountsBrowser: 'shared',
};

export const MAX_AGENT_NOTE = 600;
const MAX_ROOTS = 20;
const MAX_FAVORITE_NOTES = 200;

/** The settings found in untrusted JSON: what is valid is kept, the rest left out. Folders must be absolute (the journal's and the numbers file's may start with "~"). */
export function parsePreferences(raw: unknown, home = os.homedir()): Partial<Preferences> {
  if (!isJson(raw)) return {};
  const found: Partial<Preferences> = {};
  if (TERMINALS.includes(raw.terminal as TerminalKind)) found.terminal = raw.terminal as TerminalKind;
  if (typeof raw.notifications === 'boolean') found.notifications = raw.notifications;
  if (typeof raw.festivals === 'boolean') found.festivals = raw.festivals;
  if (typeof raw.officeLife === 'boolean') found.officeLife = raw.officeLife;
  for (const key of ['copyOnSelect', 'autoPip', 'timestamps', 'turnDuration', 'detailedActions', 'promptSuggestions', 'reduceMotion', 'autoTag', 'remoteByDefault', 'tagColors'] as const) if (typeof raw[key] === 'boolean') found[key] = raw[key];
  if (raw.effort === '' || EFFORTS.some((effort) => effort === raw.effort)) found.effort = raw.effort as Preferences['effort'];
  if (typeof raw.glassOpacity === 'number' && raw.glassOpacity >= GLASS_OPACITY.min && raw.glassOpacity <= GLASS_OPACITY.max) found.glassOpacity = raw.glassOpacity;
  if (IDLE_COMPACT_MINUTES.some((minutes) => minutes === raw.idleCompact)) found.idleCompact = raw.idleCompact as number;
  if (WINDOW_STYLES.some((style) => style === raw.windowStyle)) found.windowStyle = raw.windowStyle as Preferences['windowStyle'];
  if (TIME_FORMATS.some((format) => format === raw.timeFormat)) found.timeFormat = raw.timeFormat as Preferences['timeFormat'];
  if (ISOLATE_MODES.some((mode) => mode === raw.isolate)) found.isolate = raw.isolate as Preferences['isolate'];
  if (ACCOUNTS_BROWSERS.some((browser) => browser === raw.accountsBrowser)) found.accountsBrowser = raw.accountsBrowser as Preferences['accountsBrowser'];
  if (raw.claude !== undefined) found.claude = parseClaudeSettings(raw.claude);
  if (Array.isArray(raw.roots)) found.roots = [...new Set(asArray(raw.roots).filter((root): root is string => typeof root === 'string' && isFullPath(root)).map((root) => path.resolve(expandHomePath(root, home))))].slice(0, MAX_ROOTS);
  if (typeof raw.defaultFolder === 'string' && (raw.defaultFolder === '' || path.isAbsolute(raw.defaultFolder))) found.defaultFolder = raw.defaultFolder && path.resolve(raw.defaultFolder);
  if (typeof raw.model === 'string' && /^[\w.:[\]-]{0,80}$/.test(raw.model)) found.model = raw.model;
  if (isPermissionMode(raw.permissionMode)) found.permissionMode = raw.permissionMode;
  if (typeof raw.agentNote === 'string') found.agentNote = raw.agentNote.trim().slice(0, MAX_AGENT_NOTE);
  if (isRoomTheme(raw.theme)) found.theme = raw.theme;
  const pet = parsePet(raw.pet);
  if (pet) found.pet = pet;
  if (isLanguage(raw.language)) found.language = raw.language;
  if (typeof raw.journalFolder === 'string' && isFullPath(raw.journalFolder.trim())) {
    const folder = expandHomePath(raw.journalFolder.trim(), home);
    if (path.isAbsolute(folder) && folder.length <= 1000) found.journalFolder = path.resolve(folder);
  }
  if (Array.isArray(raw.favoriteNotes)) found.favoriteNotes = [...new Set(asArray(raw.favoriteNotes).filter((name): name is string => typeof name === 'string' && NOTE_NAME.test(name)))].slice(0, MAX_FAVORITE_NOTES);
  if (typeof raw.automataFolder === 'string' && isAutomataFolder(raw.automataFolder)) {
    const folder = expandHomePath(raw.automataFolder.trim(), home);
    if (!folder || path.isAbsolute(folder)) found.automataFolder = folder && path.resolve(folder);
  }
  const hooksAddress = typeof raw.hooksAddress === 'string' ? hooksAddressOf(raw.hooksAddress) : null;
  if (hooksAddress !== null) found.hooksAddress = hooksAddress;
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
    await this.save();
  }

  private async save() {
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify({ onboarded: this.onboarded, ...this.preferences }, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
