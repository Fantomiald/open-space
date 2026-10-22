// How a crew member looks in the room: a few drawn traits and their colours. The room draws them in pixel art
// (src/room/chibi.ts); the crew editor picks them. Shared so the server can check what it stores.
import { CLOTH_COLORS, DEFAULT_BACK_COLOR, DEFAULT_HAT_COLOR, FANCY_SKINS, GLASSES_COLORS, HAIR_COLORS, SKIN_TONES } from '../src/design/people-palette.ts';

/** Dress-up pieces (src/room/wardrobe.ts and wardrobe-head.ts), after the everyday ones in each list. */
export const WARDROBE_HAIR = ['topknot', 'dreadlocks', 'mullet', 'punkSpikes', 'wavy', 'coils', 'undercut', 'geisha', 'twinTails', 'vikingBraids', 'emo', 'tonsure'] as const;
export const WARDROBE_EYES = ['angry', 'wink', 'tired', 'starry', 'sparkly', 'cyborg', 'laughing'] as const;
export const WARDROBE_TOPS = [
  'bomber', 'kimono', 'spacesuit', 'armor', 'wizardCape', 'pirateShirt', 'hawaiian', 'sailor', 'labCoat', 'chainmail', 'captainVest', 'cardigan', 'apron', 'overalls', 'jersey', 'bikerJacket',
] as const;
export const WARDROBE_BOTTOMS = ['hakama', 'pleatedSkirt', 'cargo', 'swimShorts', 'greaves', 'kilt', 'joggers'] as const;
export const WARDROBE_SHOES = ['geta', 'pirateBoots', 'spaceBoots', 'clogs', 'rollerSkates', 'flippers', 'sabatons'] as const;
export const WARDROBE_HATS = ['spaceHelmet', 'tricorne', 'wizardHat', 'greatHelm', 'hachimaki', 'sunHat', 'catEars', 'flowerCrown', 'cowboyHat'] as const;
export const HAIR_STYLES = ['none', 'buzz', 'short', 'sidePart', 'sweep', 'curly', 'quiff', 'spiky', 'mohawk', 'afro', 'pigtails', 'bob', 'ponytail', 'bun', 'braids', 'long', 'bangs', ...WARDROBE_HAIR] as const;
export const BEARD_STYLES = ['none', 'stubble', 'mustache', 'short', 'chinstrap', 'full', 'long', 'handlebar', 'goatee'] as const;
/** Anime pieces (src/room/costumes.ts): drawn in the character's colours, not the look's. */
export const COSTUME_TOPS = ['narutoJacket', 'zoroShirt', 'luffyVest', 'sanjiSuit', 'kakashiVest'] as const;
export const COSTUME_BOTTOMS = ['narutoPants', 'zoroPants', 'luffyShorts', 'sanjiPants', 'kakashiPants'] as const;
export const COSTUME_SHOES = ['narutoSandals', 'zoroBoots', 'luffySandals', 'sanjiShoes', 'kakashiSandals'] as const;
export const COSTUME_HATS = ['leafBand', 'leafBandTilted', 'bandana', 'strawHat'] as const;
export const TOPS = ['tshirt', 'tank', 'vneck', 'polo', 'shirt', 'hoodie', 'sweater', 'jacket', 'suit', 'threePiece', 'tracksuit', 'dress', 'blanket', 'none', ...COSTUME_TOPS, ...WARDROBE_TOPS] as const;
export const BOTTOMS = ['pants', 'shorts', 'skirt', 'tracksuit', ...COSTUME_BOTTOMS, ...WARDROBE_BOTTOMS] as const;
export const SHOES = ['shoes', 'sneakers', 'boots', 'heels', 'sandals', 'flipflops', 'barefoot', ...COSTUME_SHOES, ...WARDROBE_SHOES] as const;
/** What one wears on the head: the festivals put some of the same on everyone (src/room/outfits.ts), over this one. */
export const HATS = ['none', 'cap', 'beanie', 'beret', 'tophat', 'party', 'gold', 'santa', 'crown', 'bunny', ...COSTUME_HATS, ...WARDROBE_HATS] as const;
/**
 * The accessories, one at most in each place of the body so they can be worn together: anime touches (Naruto's whiskers,
 * Luffy's scar, Sanji's cigarette, Kakashi's mask, Zoro's swords), then the wardrobe's gear.
 */
export const GEAR = {
  eyeGear: ['none', 'visor', 'goggles', 'eyePatch', 'monocle'],
  faceGear: ['none', 'whiskers', 'scar', 'mask', 'cigarette', 'earbuds'],
  neckGear: ['none', 'lei', 'scarf'],
  shoulderGear: ['none', 'parrot', 'cat'],
  backGear: ['none', 'backpack', 'jetpack', 'backSword', 'guitar', 'shell', 'wings', 'quiver', 'shield'],
  waistGear: ['none', 'swords', 'katana'],
  handGear: ['none', 'staff', 'lantern'],
} as const;
export type GearSlot = keyof typeof GEAR;
export const GEAR_SLOTS = Object.keys(GEAR) as GearSlot[];
export const EYES = ['round', 'wide', 'sleepy', 'lashes', 'happy', ...WARDROBE_EYES] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type BeardStyle = (typeof BEARD_STYLES)[number];
export type Top = (typeof TOPS)[number];
export type Bottom = (typeof BOTTOMS)[number];
export type Shoes = (typeof SHOES)[number];
export type HatStyle = (typeof HATS)[number];
export type EyeStyle = (typeof EYES)[number];
export type Gear = (typeof GEAR)[GearSlot][number];
type WornGear = { [Slot in GearSlot]: (typeof GEAR)[Slot][number] };
export const NO_GEAR: WornGear = { eyeGear: 'none', faceGear: 'none', neckGear: 'none', shoulderGear: 'none', backGear: 'none', waistGear: 'none', handGear: 'none' };

export const isCostumePiece = (value: string) => ([...COSTUME_TOPS, ...COSTUME_BOTTOMS, ...COSTUME_SHOES, ...COSTUME_HATS] as readonly string[]).includes(value);

/**
 * Colours are "#rrggbb". A blanket covers the trousers and the shoes, a dress the trousers; `glasses` is the colour of
 * the frames; `accentColor` is the tie of a three-piece suit, the stripes of a tracksuit and the shirt under a jacket.
 * `hatColor` colours a cap, a beanie, a beret, a top hat or a party hat; `backColor` the turtle shell worn on the back.
 */
export interface Look extends WornGear {
  skin: string;
  eyes: EyeStyle;
  hair: HairStyle;
  hairColor: string;
  beard: BeardStyle;
  beardColor: string;
  glasses: string | null;
  sunglasses: boolean;
  headphones: boolean;
  hat: HatStyle;
  hatColor: string;
  top: Top;
  topColor: string;
  accentColor: string;
  bottom: Bottom;
  bottomColor: string;
  shoes: Shoes;
  shoesColor: string;
  watch: boolean;
  backColor: string;
}

/** The traits that came after the first looks: a look saved without them gets these, and keeps everything else. */
export const LATER_TRAITS: Pick<Look, 'eyes' | 'sunglasses' | 'headphones' | 'hat' | 'hatColor' | GearSlot | 'backColor'> = {
  eyes: 'round', sunglasses: false, headphones: false, hat: 'none', hatColor: DEFAULT_HAT_COLOR, ...NO_GEAR, backColor: DEFAULT_BACK_COLOR,
};

const COLOR = /^#[0-9a-f]{6}$/;
const isColor = (value: unknown): value is string => typeof value === 'string' && COLOR.test(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

/** The place of a look saved with a single `accessory`, before they each had their own: it goes where it is worn now. */
function wornGear(accessory: unknown): Partial<WornGear> {
  const slot = GEAR_SLOTS.find((slot) => accessory !== 'none' && oneOf(GEAR[slot], accessory));
  return slot ? { [slot]: accessory } : {};
}

/** A look from untrusted JSON, or null when anything in it is off (the later traits may be missing: they get their default). */
export function parseLook(raw: unknown): Look | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const look = { ...LATER_TRAITS, ...wornGear((raw as Record<string, unknown>).accessory), ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  const valid = isColor(look.skin) && oneOf(HAIR_STYLES, look.hair) && isColor(look.hairColor) && oneOf(BEARD_STYLES, look.beard)
    && isColor(look.beardColor) && (look.glasses === null || isColor(look.glasses)) && oneOf(TOPS, look.top) && isColor(look.topColor) && isColor(look.accentColor)
    && oneOf(BOTTOMS, look.bottom) && isColor(look.bottomColor) && oneOf(SHOES, look.shoes) && isColor(look.shoesColor) && typeof look.watch === 'boolean'
    && typeof look.sunglasses === 'boolean' && typeof look.headphones === 'boolean' && oneOf(HATS, look.hat) && isColor(look.hatColor)
    && GEAR_SLOTS.every((slot) => oneOf(GEAR[slot], look[slot])) && isColor(look.backColor);
  if (!valid) return null;
  return {
    // eyes no longer offered fall back to round ones rather than losing the whole look
    skin: look.skin as string, eyes: oneOf(EYES, look.eyes) ? look.eyes : 'round', hair: look.hair as HairStyle, hairColor: look.hairColor as string, beard: look.beard as BeardStyle,
    beardColor: look.beardColor as string, glasses: look.glasses as string | null, sunglasses: look.sunglasses as boolean, headphones: look.headphones as boolean,
    hat: look.hat as HatStyle, hatColor: look.hatColor as string, top: look.top as Top, topColor: look.topColor as string, accentColor: look.accentColor as string,
    bottom: look.bottom as Bottom, bottomColor: look.bottomColor as string, shoes: look.shoes as Shoes, shoesColor: look.shoesColor as string,
    watch: look.watch as boolean, backColor: look.backColor as string, ...Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, look[slot]])) as WornGear,
  };
}

/**
 * A whole look drawn at random, every trait on its own, from what the editor offers. The optional pieces (hat, accessories,
 * beard, glasses, headphones, watch) often come out as "none" so the results stay varied. `random`: a number in [0, 1).
 */
export function randomLook(random: () => number = Math.random): Look {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const maybe = <T>(chance: number, value: () => T, otherwise: T): T => (random() < chance ? value() : otherwise);
  const glasses = random();
  return {
    skin: pick([...SKIN_TONES, ...FANCY_SKINS]),
    eyes: pick(EYES),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    beard: maybe(0.35, () => pick(BEARD_STYLES.filter((style) => style !== 'none')), 'none'),
    beardColor: pick(HAIR_COLORS),
    glasses: glasses < 0.25 ? pick(GLASSES_COLORS) : null,
    sunglasses: glasses >= 0.25 && glasses < 0.4,
    headphones: random() < 0.2,
    hat: maybe(0.45, () => pick(HATS.filter((hat) => hat !== 'none')), 'none'),
    hatColor: pick(CLOTH_COLORS),
    top: pick(TOPS.filter((top) => top !== 'none')),
    topColor: pick(CLOTH_COLORS),
    accentColor: pick(CLOTH_COLORS),
    bottom: pick(BOTTOMS),
    bottomColor: pick(CLOTH_COLORS),
    shoes: pick(SHOES),
    shoesColor: pick(CLOTH_COLORS),
    watch: random() < 0.4,
    backColor: pick(CLOTH_COLORS),
    // rarely each, so a look carries one or two accessories rather than all of them
    ...Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, maybe(0.12, () => pick(GEAR[slot].filter((gear) => gear !== 'none')), 'none')])) as WornGear,
  };
}
