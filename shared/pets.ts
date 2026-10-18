// The office pet the user chose (Preferences.pet): its kind, a pattern (a cat) or a breed (a dog), and its colours.
// Shared so the server can check what it stores; src/room/pet.ts draws them.
import { OLDER_PET_FURS } from '../src/design/people-palette.ts';

export const PET_KINDS = ['cat', 'dog', 'duck', 'capybara', 'axolotl', 'rocky', 'clawd', 'none'] as const;
/** A cat's coat pattern; its colour is chosen apart. */
export const CAT_PATTERNS = ['plain', 'tabby', 'calico', 'tuxedo'] as const;
/** A dog's breed: its shape, ears, tail and markings; its colour starts as the breed's and can be changed. */
export const DOG_BREEDS = ['labrador', 'dalmatian', 'husky', 'shiba', 'corgi', 'dachshund', 'pug'] as const;

export type PetKind = (typeof PET_KINDS)[number];
export type CatPattern = (typeof CAT_PATTERNS)[number];
export type DogBreed = (typeof DOG_BREEDS)[number];

/** Colours chosen over the defaults: the fur (a shell, a duck's rubber, an axolotl's skin), a cat's eyes. "#rrggbb". */
export interface PetColors { fur?: string; eyes?: string }

export type PetChoice =
  | { kind: 'cat'; variant: CatPattern; colors?: PetColors }
  | { kind: 'dog'; variant: DogBreed; colors?: PetColors }
  | { kind: 'duck' | 'capybara' | 'axolotl' | 'rocky' | 'clawd'; colors?: PetColors }
  | { kind: 'none' };

export const DEFAULT_PET: PetChoice = { kind: 'cat', variant: 'plain' };

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

const COLOR = /^#[0-9a-f]{6}$/;

/** The valid colours of untrusted JSON, or undefined when there is none. */
function parseColors(raw: unknown): PetColors | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const colors = Object.fromEntries((['fur', 'eyes'] as const).flatMap((part) => {
    const value = (raw as Record<string, unknown>)[part];
    return typeof value === 'string' && COLOR.test(value) ? [[part, value]] : [];
  })) as PetColors;
  return Object.keys(colors).length ? colors : undefined;
}

/** The first pets had coats and breeds named after their colours: what they become now. */
const OLDER: Readonly<Record<string, { variant: string; fur?: string }>> = {
  ginger: { variant: 'plain', fur: OLDER_PET_FURS.ginger }, black: { variant: 'plain', fur: OLDER_PET_FURS.black }, white: { variant: 'plain', fur: OLDER_PET_FURS.white },
  grey: { variant: 'plain', fur: OLDER_PET_FURS.grey }, golden: { variant: 'labrador' }, blackLab: { variant: 'labrador', fur: OLDER_PET_FURS.blackLab },
};

/** A pet from untrusted JSON, or undefined when it is not one. */
export function parsePet(raw: unknown): PetChoice | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { kind, colors: rawColors } = raw as Record<string, unknown>;
  const older = typeof (raw as Record<string, unknown>).variant === 'string' ? OLDER[(raw as Record<string, string>).variant] : undefined;
  const variant = older?.variant ?? (raw as Record<string, unknown>).variant;
  const colors = { ...(older?.fur ? { fur: older.fur } : {}), ...parseColors(rawColors) };
  const painted = Object.keys(colors).length ? { colors } : {};
  if (kind === 'cat' && oneOf(CAT_PATTERNS, variant)) return { kind, variant, ...painted };
  if (kind === 'dog' && oneOf(DOG_BREEDS, variant)) return { kind, variant, ...painted };
  if (kind === 'duck' || kind === 'capybara' || kind === 'axolotl' || kind === 'rocky' || kind === 'clawd') return { kind, ...painted };
  if (kind === 'none') return { kind };
  return undefined;
}
