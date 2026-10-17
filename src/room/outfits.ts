// What people wear for a festival, over their look: a hat, ears, glasses, swimwear, a water gun. Pure: chibi.ts draws it.
import type { Festival } from '../../shared/festivals.ts';
import type { HatStyle, Look } from '../../shared/look.ts';

export type Hat = Exclude<HatStyle, 'none'>;

export interface Outfit {
  hat?: Hat;
  /** the colour of a hat that has one (a cap, a beanie, a beret, a top hat, a party hat): the look's */
  hatColor?: string;
  headphones?: boolean;
  sunglasses?: boolean;
  /** a tank top and swim briefs, flip-flops: the blanket comes off */
  swimwear?: boolean;
  waterGun?: boolean;
}

export const NO_OUTFIT: Outfit = {};

/**
 * `name`: the person's first name; `isUser`: the user's own character; `guests`: who the day is for (see festivalDay):
 * a crown for them at Epiphany and on their birthday, a party hat for everyone else at a birthday.
 */
export function outfitFor(festival: Festival | null, name: string, isUser: boolean, guests: readonly string[] = []): Outfit {
  const guest = guests.includes(name);
  switch (festival) {
    case 'christmas': return { hat: 'santa' };
    case 'newYear': return { hat: 'gold' };
    case 'birthday': return { hat: guest ? 'crown' : 'party' };
    case 'epiphany': return guest ? { hat: 'crown' } : NO_OUTFIT;
    case 'easter': return { hat: 'bunny' };
    case 'music': return { headphones: true };
    case 'summer': return { sunglasses: true };
    case 'bastille': return { hat: 'beret' };
    case 'songkran': return { swimwear: true, sunglasses: true, ...(isUser ? { waterGun: true } : {}) };
    default: return NO_OUTFIT;
  }
}

/** How many art pixels a hat rises above the hair: the name tag goes that much higher. */
export const HAT_HEIGHT: Readonly<Record<Hat, number>> = { party: 9, gold: 9, santa: 6, crown: 4, bunny: 7, beret: 3, cap: 3, beanie: 5, tophat: 5 };

/** What someone wears: the festival's outfit over their look's own hat, glasses and headphones. */
export function wornOutfit(look: Look, outfit: Outfit): Outfit {
  const ownHat = look.hat === 'none' ? undefined : look.hat;
  return {
    ...outfit,
    ...(outfit.hat ? {} : ownHat ? { hat: ownHat, hatColor: look.hatColor } : {}),
    ...(outfit.sunglasses || look.sunglasses ? { sunglasses: true } : {}),
    ...(outfit.headphones || look.headphones ? { headphones: true } : {}),
  };
}

/** A stable key for the sprite cache. */
export const outfitKey = (outfit: Outfit) => `${outfit.hat ?? ''}${outfit.hatColor ?? ''}${outfit.headphones ? 'h' : ''}${outfit.sunglasses ? 's' : ''}${outfit.swimwear ? 'w' : ''}${outfit.waterGun ? 'g' : ''}`;
