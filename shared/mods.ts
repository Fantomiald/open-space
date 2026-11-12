// Mods: small pages the user's agents write, each in a folder of OFFICE_DIR/mods (mod.json + index.html), shown by the
// page as floating windows. Here: what a mod is, and how its manifest is read. Pure, shared by the server and the page.
import { isSecretName } from './secrets.ts';
import { TRIGGER_ID } from './triggers.ts';

/** The pictures a mod may wear in the panel and on its window (src/command/ModIcon.tsx). */
export const MOD_ICONS = ['puzzle', 'chart', 'bars', 'coins', 'timer', 'list', 'bell', 'calendar', 'star', 'heart', 'bolt', 'globe', 'note', 'terminal'] as const;
export type ModIcon = (typeof MOD_ICONS)[number];

/** The size a window opens at and the sizes it may be given, in CSS pixels (its title bar aside). */
export const MOD_SIZE = { width: { min: 240, max: 960, initial: 380 }, height: { min: 120, max: 900, initial: 320 } } as const;
export const MAX_MOD_NAME = 40;
export const MAX_MOD_DESCRIPTION = 120;
/** what the user asks a new mod to be */
export const MAX_MOD_REQUEST = 2000;
/** How often a mod's window refreshes it, in seconds (0: never by itself), as the settings offer it. */
export const MOD_REFRESH = [0, 60, 300, 900, 1800, 3600] as const;
export const MAX_MOD_ENV = 30;
/** What a mod's page saves (the kit's OpenSpace.store): a name per value, a JSON value of this many bytes at most. */
export const MAX_MOD_STORE = 256 * 1024;
export const isModStoreName = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
export const MAX_MOD_ENV_LABEL = 80;

/** A mod's folder name: what names it everywhere (its address, its place on the screen). */
export const isModId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);

export interface ModManifest {
  name: string;
  description: string;
  icon: ModIcon;
  width: number;
  height: number;
  /** still being written by its agent: the window says so instead of showing a half-made page */
  draft: boolean;
  /** how often its window refreshes it, in seconds (one of MOD_REFRESH; 0: only when asked) */
  refresh: number;
  /** the variables its page needs (OpenSpace.env in the kit), which the user fills in its settings */
  env: ModEnvNeed[];
  /** the trigger its page may start (the kit's OpenSpace.runTrigger), the user confirming each time; null for none */
  trigger: string | null;
  /** the trigger its refresh button starts (instead of loading the page again), the page loading again once its run is over; null: the button only reloads */
  refreshTrigger: string | null;
}

/** A variable a mod asks for: its name, and what it is for in the user's words (where to find it). */
export interface ModEnvNeed { name: string; label: string }

export interface ModInfo extends ModManifest {
  id: string;
  /** its folder, where a session edits it */
  folder: string;
  /** where its page is served, the key that lets a page without a cookie in included */
  url: string;
  /** changes with its files: the window loads the page again */
  version: number;
  /** its data (the files of its data/ folder) changed since the user last had it open */
  unread: boolean;
  /** the names of the variables the user gave it (their values stay on the server until its page asks) */
  envSet: string[];
}

/** What the settings change in a mod: written in its mod.json, but `env`, kept by Open Space (a value of '' keeps the one given before). */
export interface ModSettings { name: string; description: string; icon: ModIcon; refresh: number; refreshTrigger: string | null; env: { name: string; value: string }[] }

const within = (value: unknown, { min, max, initial }: { min: number; max: number; initial: number }) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(Math.max(value, min), max)) : initial;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const triggerId = (value: unknown) => (typeof value === 'string' && TRIGGER_ID.test(value) ? value : null);

/** A manifest as written in mod.json, whatever is missing or wrong replaced: a mod half written still shows. */
export function readManifest(raw: unknown, id: string): ModManifest {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    name: text(given.name, MAX_MOD_NAME) || id,
    description: text(given.description, MAX_MOD_DESCRIPTION),
    icon: MOD_ICONS.find((icon) => icon === given.icon) ?? 'puzzle',
    width: within(given.width, MOD_SIZE.width),
    height: within(given.height, MOD_SIZE.height),
    draft: given.draft === true,
    refresh: MOD_REFRESH.find((each) => each === given.refresh) ?? 0,
    env: Array.isArray(given.env) ? given.env.flatMap((raw): ModEnvNeed[] => {
      const need = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return typeof need.name === 'string' && isSecretName(need.name) ? [{ name: need.name, label: text(need.label, MAX_MOD_ENV_LABEL) }] : [];
    }).filter((need, index, all) => all.findIndex((each) => each.name === need.name) === index).slice(0, MAX_MOD_ENV) : [],
    trigger: triggerId(given.trigger),
    refreshTrigger: triggerId(given.refreshTrigger),
  };
}

/** The folder name of a new mod asked for with `request`: its first words, free among `taken`. */
export function modIdFor(request: string, taken: ReadonlySet<string>): string {
  const words = request.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const stem = words.filter((word) => word.length > 2).slice(0, 3).join('-').slice(0, 30).replace(/-+$/, '') || 'mod';
  let id = stem;
  for (let copy = 2; taken.has(id); copy++) id = `${stem}-${copy}`;
  return id;
}

/** The files of a mod's folder that are its data: a change there is news for the user, a change elsewhere is its code. */
export const MOD_DATA_FOLDER = 'data';
export const hasNewData = (dataChangedAt: number | null, seenAt: number | undefined) => dataChangedAt !== null && dataChangedAt > (seenAt ?? 0);
