// Anime pieces from Naruto and One Piece, each its own top, bottom, shoes, hat or accessory, drawn by chibi.ts over
// the body in the chibi's coordinates: the torso is x 3-12 from row 13, the legs x 4-6 and 9-11 from row 19, the feet on
// row 23 (one row lower when seated, see `up`).
import { COSTUME_COLORS as C } from '../design/people-palette.ts';
import { COSTUME_BOTTOMS, COSTUME_HATS, COSTUME_SHOES, COSTUME_TOPS, type Look } from '../../shared/look.ts';
import { shadedBall, tones, type Tones } from './pixel-art.ts';

type Paint = (x: number, y: number, width: number, height: number, colour: string) => void;
type Dot = (x: number, y: number, colour: string) => void;

export type CostumeHat = (typeof COSTUME_HATS)[number];

/** How the body stands in the frame being drawn, from chibi.ts's paint. */
export interface Body {
  back: boolean; sit: boolean; up: number; swing: number; lift: readonly number[]; raising: boolean; typing: boolean; step: 0 | 1; skin: Tones; hair: Tones;
}

const includes = (list: readonly string[], value: string) => list.includes(value);
export const isCostumeHat = (hat: string | undefined): hat is CostumeHat => hat !== undefined && includes(COSTUME_HATS, hat);

/** What chibi.ts draws under the anime pieces: a bare torso, bare legs and bare feet, the pieces then go over them. */
export function underCostume(look: Look): Look {
  return {
    ...look,
    top: includes(COSTUME_TOPS, look.top) ? 'none' : look.top,
    bottom: includes(COSTUME_BOTTOMS, look.bottom) ? 'shorts' : look.bottom,
    shoes: includes(COSTUME_SHOES, look.shoes) ? 'barefoot' : look.shoes,
  };
}

/** The sleeve of an anime top that goes down to the wrist, for the forearm of someone typing; null otherwise. */
export function costumeSleeve(top: Look['top']): string | null {
  switch (top) {
    case 'narutoJacket': return C.orange;
    case 'sanjiSuit': return C.suit;
    case 'kakashiVest': return C.navy;
    default: return null;
  }
}

/** The rows of a letter grid, `x`, `y` its top left corner; `colours` maps each letter. */
export function grid(P: Dot, x: number, y: number, rows: readonly string[], colours: Readonly<Record<string, string>>) {
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => { if (colours[letter]) P(x + column, y + line, colours[letter]); });
}

/** The rows `from` to `to` of the head's own ball (the skin of chibi.ts): what a mask covers. */
export function headRows(P: Dot, from: number, to: number, up: number, cloth: Tones) {
  for (let y = from; y <= to; y++) for (let x = 0; x <= 16; x++) {
    const nx = (x + 0.5 - 8) / 6.4, ny = (y + 0.5 - 6.5) / 6.6;
    if (nx * nx + ny * ny <= 1) P(x, y + up, x > 11 ? cloth.shade : x < 4 ? cloth.light : cloth.base);
  }
}

export function torso(R: Paint, b: Body, cloth: Tones) {
  R(3, 13 + b.up, 10, 7, cloth.base); R(3, 13 + b.up, 2, 7, cloth.light); R(11, 13 + b.up, 2, 7, cloth.shade);
}

/** Sleeves from the shoulder, `rows` long (5: to the wrist); `cuff` colours their last row. */
export function sleeves(R: Paint, b: Body, cloth: Tones, rows: number, cuff?: string) {
  for (const [x, offset, colour] of [[1, b.swing, cloth.light], [13, -b.swing, cloth.shade]] as const) {
    if (b.raising && x === 13) continue;
    R(x, 14 + b.up + offset, 2, rows, colour);
    if (cuff) R(x, 13 + b.up + offset + rows, 2, 1, cuff);
  }
}

/** Each leg, standing or walking: `x` its left column, `last` its lowest row (the ankle). Seated, the legs are one band. */
export function eachLeg(b: Body, draw: (x: number, last: number, side: 0 | 1) => void) {
  if (b.sit) return;
  draw(4, 22 - b.lift[0], 0);
  draw(9, 22 - b.lift[1], 1);
}

export function eachFoot(b: Body, draw: (x: number, y: number) => void) {
  eachLeg(b, (x, last) => draw(x, last + 1));
}

export function trousers(R: Paint, b: Body, cloth: Tones) {
  if (b.sit) { R(4, 21, 8, 3, cloth.base); R(4, 23, 8, 1, cloth.shade); return; }
  eachLeg(b, (x, last, side) => R(x, 19, 3, last - 18, side ? cloth.shade : cloth.base));
}

/** Bandage round the ankles, over the trousers. */
function ankleWraps(R: Paint, b: Body) {
  eachLeg(b, (x, last) => R(x, last, 3, 1, C.bandage));
}

/** Ninja sandals: open at the toes, a strap round the ankle. */
function ninjaSandals(R: Paint, P: Dot, b: Body, colour: string) {
  const sandal = tones(colour);
  eachFoot(b, (x, y) => { R(x, y, 4, 1, sandal.base); P(x + 3, y, b.skin.base); R(x, y + 1, 4, 1, sandal.dark); });
}

/** The swirl of the Leaf on a back: a red ring. */
function swirl(R: Paint, P: Dot, b: Body) {
  R(7, 15 + b.up, 3, 1, C.swirl); P(7, 16 + b.up, C.swirl); P(9, 16 + b.up, C.swirl); R(7, 17 + b.up, 3, 1, C.swirl);
}

/** The bottom and the shoes, drawn before the top, which covers the waist. */
export function paintCostumeLegs(R: Paint, P: Dot, look: Look, b: Body) {
  const front = !b.back;
  // a dress stands for the bottom
  switch (look.top === 'dress' ? null : look.bottom) {
    case 'narutoPants': trousers(R, b, tones(C.orange)); if (front && !b.sit) R(4, 20, 3, 1, C.band); ankleWraps(R, b); break;
    case 'zoroPants': trousers(R, b, tones(C.trousers)); break;
    case 'luffyShorts': {
      const blue = tones(C.shorts);
      if (b.sit) { R(4, 21, 8, 1, blue.base); R(4, 22, 8, 1, C.cuff); }
      // the rolled-up cuffs stand out a little
      else eachLeg(b, (x, _last, side) => { R(x, 19, 3, 2, side ? blue.shade : blue.base); R(side ? x : x - 1, 21, 4, 1, C.cuff); });
      break;
    }
    case 'sanjiPants': trousers(R, b, tones(C.suit)); break;
    case 'kakashiPants': trousers(R, b, tones(C.navy)); if (front && !b.sit) R(4, 20, 3, 1, C.bandage); ankleWraps(R, b); break;
  }
  switch (look.shoes) {
    case 'narutoSandals': ninjaSandals(R, P, b, C.sandal); break;
    case 'kakashiSandals': ninjaSandals(R, P, b, C.kakashiSandal); break;
    case 'zoroBoots': {
      const boot = tones(C.boots);
      eachFoot(b, (x, y) => { R(x, y - 2, 4, 4, boot.base); R(x, y - 2, 4, 1, boot.light); R(x, y + 1, 4, 1, boot.dark); });
      break;
    }
    case 'luffySandals': eachFoot(b, (x, y) => { P(x + 1, y, C.strap); P(x + 2, y, C.strap); R(x, y + 1, 4, 1, C.sole); }); break;
    case 'sanjiShoes': eachFoot(b, (x, y) => { R(x, y, 4, 2, C.shoe); P(x + 3, y, C.shine); }); break;
  }
}

/** The top, over the bare torso and arms chibi.ts drew. */
export function paintCostumeTop(R: Paint, P: Dot, look: Look, b: Body) {
  const up = b.up, front = !b.back;
  switch (look.top) {
    case 'narutoJacket': {
      const orange = tones(C.orange), black = tones(C.black);
      torso(R, b, orange);
      R(3, 13 + up, 10, 2, black.base); R(11, 13 + up, 2, 2, black.shade);
      sleeves(R, b, orange, 5, C.black);
      sleeves(R, b, black, 1);
      if (front) R(8, 13 + up, 1, 7, C.zipper); else swirl(R, P, b);
      break;
    }
    case 'zoroShirt': {
      const green = tones(C.haramaki);
      torso(R, b, tones(C.tee));
      sleeves(R, b, tones(C.tee), 2);
      R(3, 17 + up, 10, 3, green.base); R(3, 17 + up, 2, 3, green.light); R(11, 17 + up, 2, 3, green.shade); R(3, 18 + up, 10, 1, green.dark);
      break;
    }
    case 'luffyVest': {
      const red = tones(C.vest);
      // open on the chest, two buttons on the near flap; sleeveless
      if (front) {
        R(3, 13 + up, 2, 6, red.light); R(5, 13 + up, 1, 6, red.base);
        R(10, 13 + up, 1, 6, red.base); R(11, 13 + up, 2, 6, red.shade);
        P(5, 15 + up, C.button); P(5, 17 + up, C.button);
      } else { R(3, 13 + up, 10, 6, red.base); R(3, 13 + up, 2, 6, red.light); R(11, 13 + up, 2, 6, red.shade); }
      break;
    }
    case 'sanjiSuit': {
      const suit = tones(C.suit), shirt = tones(C.shirt);
      torso(R, b, suit);
      sleeves(R, b, suit, 5, C.shirt);
      if (front) {
        R(6, 13 + up, 4, 2, shirt.base); R(7, 15 + up, 2, 1, shirt.shade);
        R(7, 13 + up, 2, 3, C.tie);
        P(5, 14 + up, suit.light); P(10, 14 + up, suit.light); P(8, 17 + up, C.shine);
      }
      break;
    }
    case 'kakashiVest': {
      const flak = tones(C.flak);
      torso(R, b, flak);
      sleeves(R, b, tones(C.navy), 5);
      for (const [x, offset] of [[1, b.swing], [13, -b.swing]] as const) {
        if (b.raising && x === 13) continue;
        P(x, 15 + up + offset, C.swirl);
        // gloves; typing, the near hand is on the desk (drawTypingHand)
        if (!(b.typing && x === 1)) R(x, 19 + up + offset, 2, 1, C.glove);
      }
      if (front) {
        R(8, 13 + up, 1, 7, flak.dark);
        R(4, 15 + up, 3, 2, flak.light); R(9, 15 + up, 3, 2, flak.light); P(5, 15 + up, flak.dark); P(10, 15 + up, flak.dark);
      } else swirl(R, P, b);
      break;
    }
  }
  // Luffy's shorts show their waistband under a top that leaves the belly bare
  if (look.bottom === 'luffyShorts' && (look.top === 'none' || look.top === 'luffyVest')) R(3, 19 + up, 10, 1, tones(C.shorts).base);
}

/** The far arm raised (see chibi.ts), in its sleeve, drawn after it. */
export function paintRaisedSleeve(R: Paint, look: Look, b: Body) {
  const sleeve = costumeSleeve(look.top);
  if (!b.raising || !sleeve) return;
  R(13, 11 + b.up, 2, 4, sleeve); R(14, 8 + b.up, 2, 4, sleeve); R(15, 5 + b.up, 2, 3, sleeve);
  if (look.top === 'kakashiVest') R(15 + b.step, 1 + b.up, 3, 4, C.glove);
}

/** The knot at the back of a band, its two ends hanging straight down (spread apart, they read as eyes). */
function knot(R: Paint, up: number, colour: string) {
  R(8, 5 + up, 2, 2, colour); R(8, 7 + up, 1, 1, colour);
}

/** A forehead protector: a band round the head, the metal plate on the forehead, its knot behind. */
function leafBand(R: Paint, P: Dot, back: boolean, up: number) {
  R(2, 3 + up, 13, 2, C.band);
  if (back) { knot(R, up, C.band); return; }
  R(5, 3 + up, 7, 2, C.metal); P(5, 3 + up, C.metalLight); P(8, 3 + up, C.metalDark); P(9, 4 + up, C.metalDark); P(7, 4 + up, C.metalDark);
  P(1, 4 + up, C.band); P(0, 5 + up, C.band); P(0, 6 + up, C.band);
}

/** An anime hat, in place of the look's hat (outfits.ts decides which hat is worn). */
export function paintCostumeHat(R: Paint, P: Dot, hat: CostumeHat, back: boolean, up: number) {
  switch (hat) {
    case 'leafBand': leafBand(R, P, back, up); break;
    // worn slanted over one eye
    case 'leafBandTilted':
      if (back) { R(2, 3 + up, 13, 2, C.band); R(2, 5 + up, 3, 1, C.band); knot(R, up, C.band); break; }
      grid(P, 2, 3 + up, [
        'bbbmmmmmm.....',
        'bbbmmmdmmmm...',
        '.......mmmmmb.',
        '........mmmmb.',
        '........ddddb.',
      ], { b: C.band, m: C.metal, d: C.metalDark });
      break;
    case 'bandana': {
      const black = tones(C.black);
      shadedBall((x, y, colour) => { if (y <= 4 + up) P(x, y, colour); }, 8, 3 + up, 7, 4, black);
      R(2, 4 + up, 13, 1, black.base);
      if (back) knot(R, up, black.base);
      else { P(1, 4 + up, black.base); P(0, 5 + up, black.base); P(0, 6 + up, black.base); P(-1, 7 + up, black.base); }
      break;
    }
    case 'strawHat': {
      const straw = tones(C.straw);
      grid(P, -1, -3 + up, [
        '.....lyyyyyyy......',
        '....lyyyyyyyyy.....',
        '....rrrrrrrrrr.....',
        '.lllyyyyyyyyyyyyyy.',
        'lyyyyyyyyyyyyyyyyyv',
        '.vvvvvvvvvvvvvvvvv.',
      ], { y: straw.base, l: straw.light, v: straw.shade, r: C.hatBand });
      break;
    }
  }
}

/** The look's accessory, drawn over the face and the hair, under the hat. */
export function paintAccessory(R: Paint, P: Dot, look: Look, b: Body) {
  const up = b.up, front = !b.back;
  switch (look.accessory) {
    // two short lines across each cheek
    case 'whiskers': if (front) for (const y of [8, 10]) { R(3, y + up, 2, 1, b.skin.dark); R(12, y + up, 2, 1, b.skin.dark); } break;
    case 'scar': if (front) { P(10, 8 + up, C.scar); P(11, 8 + up, C.scar); } break;
    case 'cigarette': if (front) { R(11, 10 + up, 3, 1, C.paper); P(14, 10 + up, C.ember); } break;
    case 'mask': {
      const navy = tones(C.navy);
      if (front) { headRows(P, 8, 13, up, navy); P(11, 8 + up, navy.light); } else headRows(P, 11, 13, up, navy);
      break;
    }
    // at the left hip, hilt up, sheath trailing: the far side from the front, the near one from behind; earrings too
    case 'swords': {
      if (look.top === 'blanket') break;
      const blades = [[C.wado, C.wado], [C.kitetsu, C.kitetsuSheath], [C.shusui, C.shusui]] as const;
      blades.forEach(([hilt, sheath], index) => {
        for (let t = 0; t < 8; t++) {
          const dx = index + Math.floor(t * 0.6);
          P(b.back ? 4 - dx : 11 + dx, 15 + t + up, t < 2 ? hilt : t === 2 ? C.gold : sheath);
        }
      });
      if (front) { P(1, 9 + up, C.gold); P(2, 9 + up, C.gold); P(1, 10 + up, C.gold); }
      break;
    }
  }
}

/** What goes over the outline: the smoke of a cigarette. */
export function paintSmoke(P: Dot, look: Look, b: Body) {
  if (look.accessory !== 'cigarette' || b.back) return;
  for (const [x, y] of [[15, 9], [15, 8], [16, 7], [16, 6], [15, 5], [16, 4]]) P(x, y + b.up, C.smoke);
}
