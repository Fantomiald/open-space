// The dress-up wardrobe's tops, bottoms, shoes and gear worn on the body (shared/look.ts WARDROBE_*), drawn by chibi.ts
// over the body like the anime pieces (costumes.ts), in the same coordinates: the torso is x 3-12 from row 13, the arms
// x 1-2 and 13-14, the legs x 4-6 and 9-11 from row 19, the feet on row 23 (`up` lifts the upper body when seated).
// They take the look's colours when that makes sense (a kimono in the top's colour, its belt in the accent), metal,
// wood and neon keep their own.
import { WARDROBE_COLORS as W } from '../design/people-palette.ts';
import { WARDROBE_BOTTOMS, WARDROBE_SHOES, type Look } from '../../shared/look.ts';
import { eachFoot, eachLeg, grid, sleeves, torso, trousers, type Body } from './costumes.ts';
import type { Hat } from './outfits.ts';
import { shadedBall, tones, type Tones } from './pixel-art.ts';

type Paint = (x: number, y: number, width: number, height: number, colour: string) => void;
type Dot = (x: number, y: number, colour: string) => void;

const includes = (list: readonly string[], value: string) => list.includes(value);

/** The pieces whose colour is their own: the editor offers no colour for them. */
export const FIXED_COLOUR: ReadonlySet<string> = new Set(['armor', 'chainmail', 'labCoat', 'greaves', 'sabatons']);

/** What chibi.ts draws under the wardrobe's legs: plain trousers, a skirt or shorts, bare feet; overalls are trousers. */
export function underWardrobe(look: Look): Look {
  const base: Readonly<Record<string, Look['bottom']>> = { pleatedSkirt: 'skirt', kilt: 'skirt', swimShorts: 'shorts' };
  return {
    ...look,
    ...(look.top === 'overalls' ? { bottom: 'pants', bottomColor: look.topColor } : includes(WARDROBE_BOTTOMS, look.bottom) ? { bottom: base[look.bottom] ?? 'pants' } : {}),
    ...(includes(WARDROBE_SHOES, look.shoes) ? { shoes: 'barefoot' } : {}),
  };
}

/** The colour of a wardrobe top's sleeves, and whether they go down to the wrist; null for the other tops. */
export function wardrobeSleeve(look: Look): { colour: string; long: boolean } | null {
  switch (look.top) {
    case 'bomber': case 'kimono': case 'spacesuit': case 'wizardCape': case 'pirateShirt': case 'sailor': case 'cardigan': case 'bikerJacket':
      return { colour: look.topColor, long: true };
    case 'armor': case 'chainmail': return { colour: W.steel, long: true };
    case 'labCoat': return { colour: W.white, long: true };
    case 'captainVest': case 'apron': return { colour: look.accentColor, long: true };
    case 'overalls': return { colour: look.accentColor, long: false };
    case 'hawaiian': case 'jersey': return { colour: look.topColor, long: false };
    default: return null;
  }
}

/** A 3 x 5 digit for the back of a football shirt. */
const DIGITS: Readonly<Record<string, readonly string[]>> = { 1: ['.x', 'xx', '.x', '.x', '.x'], 0: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'] };

/** A shape filled row by row between two edges: `edges(row)` gives [left, right) for each row from `from` to `to`. */
function band(R: Paint, from: number, to: number, edges: (row: number) => readonly [number, number], colour: (row: number, x: number) => string) {
  for (let row = from; row <= to; row++) {
    const [left, right] = edges(row);
    for (let x = Math.round(left); x < Math.round(right); x++) R(x, row, 1, 1, colour(row, x));
  }
}

/** A cape from the shoulders to the calves, flaring out: behind the body from the front, over it from behind. */
function cape(R: Paint, b: Body, cloth: Tones, over: boolean) {
  const from = 12 + b.up, to = 22;
  band(R, from, to, (row) => { const flare = (row - from) / (to - from); return [2.4 - flare * 3.4, 13.6 + flare * 3.4]; }, (row, x) => {
    if (!over) return x < 8 ? cloth.shade : cloth.dark;
    // folds: darker lines that open up towards the hem
    const fold = (x === 5 || x === 11) && row > from + 3;
    return fold ? cloth.shade : x < 4 ? cloth.light : x > 12 ? cloth.shade : cloth.base;
  });
}

/** What hangs behind the body, drawn first so the body covers it: a cape, a jetpack's tanks, a sword's hilt, long tails of hair. */
export function paintWardrobeBehind(R: Paint, P: Dot, look: Look, hat: Hat | undefined, b: Body) {
  const up = b.up, front = !b.back;
  // the helmet's glass, the faintest tint around the head (its rim is drawn with the hat)
  if (hat === 'spaceHelmet') shadedBall((x, y) => P(x, y, W.glass), 8, 5.5 + up, 9.4, 9.4, { base: W.glass, light: W.glass, shade: W.glass, dark: W.glass });
  const hair = b.hair;
  if (front) switch (look.hair) {
    // twin tails tied high on each side, hanging past the waist
    case 'twinTails':
      for (const [x, lean] of [[-2, -1], [15, 1]] as const) {
        for (let row = 1; row <= 19; row++) {
          const sway = Math.round(Math.sin(row / 4) * 0.8) + (row > 8 ? lean : 0);
          R(x + sway, row + up, 3, 1, row % 5 === 0 ? hair.shade : hair.base);
          P(x + sway + (lean < 0 ? 0 : 2), row + up, hair.light);
        }
      }
      break;
    // the long back of a mullet, hanging behind the neck to the shoulders
    case 'mullet':
      R(-1, 4 + up, 4, 9, hair.base); R(-1, 4 + up, 1, 9, hair.light); R(2, 9 + up, 1, 4, hair.shade);
      P(-1, 13 + up, hair.base); P(1, 13 + up, hair.shade); P(0, 14 + up, hair.shade);
      break;
    // the braid at the end of a viking's plait, down the back
    case 'vikingBraids':
      for (let y = 5; y <= 14; y++) { P(-1, y + up, y % 2 ? hair.light : hair.shade); P(0, y + up, y % 2 ? hair.shade : hair.light); }
      R(-1, 9 + up, 2, 1, W.steel); R(-1, 15 + up, 2, 1, W.steel);
      break;
  }
  if (front && look.top === 'wizardCape') cape(R, b, tones(look.topColor), false);
  if (look.top === 'blanket') return;
  switch (look.accessory) {
    case 'jetpack':
      if (front) { R(-1, 11 + up, 2, 7, W.steel); R(-1, 11 + up, 2, 1, W.red); R(15, 11 + up, 2, 7, W.steelDark); R(15, 11 + up, 2, 1, W.red); }
      break;
    case 'backpack': if (front) { R(-1, 13 + up, 3, 7, tones(W.bag).shade); R(-1, 13 + up, 3, 1, tones(W.bag).base); } break;
    // the hilt over the shoulder, behind the head
    case 'backSword':
      // slanting out over the shoulder: the grip, its pommel, the guard across it
      if (!front) break;
      for (const [x, y] of [[14, 11], [15, 10], [15, 9], [16, 8]]) P(x, y + up, (x + y) % 2 ? W.leather : W.leatherDark);
      P(17, 7 + up, W.gold); P(13, 11 + up, W.gold); P(14, 12 + up, W.gold); P(15, 13 + up, W.gold); R(0, 18 + up, 1, 3, W.steel);
      break;
    // the guitar's neck and head above the shoulder, the guitar on the back
    case 'guitar': if (b.back) break; R(14, 8 + up, 1, 5, W.fret); R(14, 6 + up, 2, 2, W.guitarDark); break;
  }
}

/** The bottom and the shoes, after chibi.ts's legs (underWardrobe) and before the top, which covers the waist. */
export function paintWardrobeLegs(R: Paint, P: Dot, look: Look, b: Body) {
  const front = !b.back;
  const cloth = tones(look.bottomColor);
  switch (look.top === 'dress' || look.top === 'overalls' ? null : look.bottom) {
    // wide pleated trousers down to the ankles, a dark line down each pleat
    case 'hakama':
      if (b.sit) { R(3, 21, 10, 3, cloth.base); R(6, 21, 1, 3, cloth.dark); R(10, 21, 1, 3, cloth.dark); break; }
      eachLeg(b, (x, last, side) => { R(x - 1, 19, 5, last - 18, side ? cloth.shade : cloth.base); R(x + 1, 20, 1, last - 19, cloth.dark); });
      R(3, 19, 10, 1, cloth.base);
      if (front) R(6, 19, 4, 1, cloth.light);
      break;
    // the skirt chibi.ts drew, pleated
    case 'pleatedSkirt':
      if (b.sit) { for (let x = 3; x <= 12; x++) R(x, 21, 1, 2, x % 2 ? cloth.light : cloth.dark); break; }
      // pleats all round, light and dark in turn, the hem flaring a pixel wider
      for (let y = 19; y <= 21; y++) for (let x = y === 19 ? 2 : 1; x <= (y === 19 ? 13 : 14); x++) P(x, y, x % 2 ? cloth.light : cloth.dark);
      break;
    // pockets with flaps on the side of each leg
    case 'cargo':
      if (b.sit) { R(4, 21, 2, 2, cloth.shade); R(4, 21, 2, 1, cloth.light); R(10, 21, 2, 2, cloth.dark); break; }
      // big pockets with flaps on the outside of each thigh, sticking out
      eachLeg(b, (x, _last, side) => { const at = side ? x + 2 : x - 1; R(at, 20, 2, 2, side ? cloth.dark : cloth.shade); R(at, 20, 2, 1, cloth.light); });
      break;
    // swim shorts: a white stripe down the side, a drawstring
    case 'swimShorts':
      if (b.sit) { R(4, 21, 8, 1, W.white); break; }
      eachLeg(b, (x, _last, side) => R(side ? x + 2 : x, 19, 1, 2, W.white));
      if (front) { P(7, 19, W.white); P(8, 20, W.white); }
      break;
    // steel greaves, a round plate on each knee
    case 'greaves': {
      const steel = tones(W.steel);
      if (b.sit) { R(4, 21, 8, 3, steel.base); R(4, 21, 8, 1, steel.light); R(5, 22, 2, 1, W.steelLight); R(9, 22, 2, 1, W.steelLight); break; }
      trousers(R, b, steel);
      eachLeg(b, (x, last, side) => { R(x, 19, 3, 1, W.leather); P(x + 1, 20, W.steelLight); R(x, 21, 1, last - 20, side ? steel.dark : steel.light); });
      break;
    }
    // a tartan kilt, its sporran, and knee socks
    case 'kilt':
      if (b.sit) { R(3, 21, 10, 1, cloth.dark); R(6, 21, 1, 2, cloth.light); R(10, 21, 1, 2, cloth.light); break; }
      R(3, 20, 10, 1, cloth.dark); for (const x of [5, 9]) R(x, 19, 1, 2, cloth.light);
      if (front) { R(7, 19, 2, 2, W.sporran); P(7, 21, W.white); P(8, 21, W.white); }
      eachLeg(b, (x, last) => R(x, last - 1, 3, 2, W.sock));
      break;
    // joggers: a neon stripe down the side, tight neon cuffs
    case 'joggers':
      if (b.sit) { R(4, 21, 8, 1, W.neonLime); break; }
      eachLeg(b, (x, last, side) => { R(side ? x + 2 : x, 19, 1, last - 19, W.neonLime); R(x, last, 3, 1, W.neonLime); });
      if (front) R(7, 19, 2, 1, cloth.light);
      break;
  }
  const shoe = tones(look.shoesColor);
  switch (look.shoes) {
    // a wooden platform on two teeth, a dark thong between the toes
    case 'geta': eachFoot(b, (x, y) => { P(x + 2, y, W.strap); R(x, y + 1, 4, 1, W.wood); P(x, y + 2, W.woodDark); P(x + 3, y + 2, W.woodDark); }); break;
    // tall boots with a wide turned-down cuff, a buckle
    case 'pirateBoots': eachFoot(b, (x, y) => {
      R(x, y - 3, 4, 5, shoe.base); R(x + 3, y - 3, 1, 4, shoe.shade); R(x - 1, y - 4, 5, 2, shoe.light); P(x + 1, y - 1, W.gold); R(x, y + 1, 5, 1, shoe.dark);
    }); break;
    // chunky moon boots: a steel ring at the ankle, a thick pale sole
    case 'spaceBoots': eachFoot(b, (x, y) => { R(x, y - 2, 4, 3, shoe.base); R(x, y - 2, 4, 1, W.steel); P(x, y - 1, shoe.light); R(x, y + 1, 4, 1, W.whiteShade); P(x + 4, y + 1, W.whiteShade); }); break;
    // wooden clogs, rounded, the toe turned up
    case 'clogs': eachFoot(b, (x, y) => grid(P, x, y - 1, ['.lll.', 'bbbbl', 'sssss'], { l: shoe.light, b: shoe.base, s: shoe.shade })); break;
    // boots on a steel frame and four little wheels
    case 'rollerSkates': eachFoot(b, (x, y) => { R(x, y - 2, 4, 3, shoe.base); R(x, y - 2, 4, 1, shoe.light); R(x, y + 1, 4, 1, W.steel); for (const dx of [0, 3]) P(x + dx, y + 2, W.rubber); }); break;
    // long fins ahead of the toes
    case 'flippers': eachFoot(b, (x, y) => { R(x, y, 4, 1, shoe.base); R(x, y + 1, 7, 1, shoe.light); P(x + 6, y, shoe.shade); P(x + 5, y, shoe.shade); }); break;
    // steel plates over the foot, a pointed toe
    case 'sabatons': eachFoot(b, (x, y) => { R(x, y - 1, 4, 3, W.steel); R(x, y - 1, 4, 1, W.steelLight); R(x, y + 1, 4, 1, W.steelDark); P(x + 4, y + 1, W.steelDark); P(x + 1, y, W.steelDark); }); break;
  }
}

/** Long sleeves with a cuff, over chibi.ts's short ones. */
const longSleeves = (R: Paint, b: Body, cloth: Tones, cuff?: string) => sleeves(R, b, cloth, 5, cuff);

/** The top, and what is worn over it (straps, a guitar, a pack on the back), after chibi.ts's torso and arms. */
export function paintWardrobeTop(R: Paint, P: Dot, look: Look, b: Body) {
  const up = b.up, front = !b.back;
  const top = tones(look.topColor), accent = tones(look.accentColor);
  const y = (row: number) => row + up;
  switch (look.top) {
    // a padded bomber: neon ribs at the neck, cuffs and hem, a zip, a patch on the sleeve
    case 'bomber':
      torso(R, b, top); longSleeves(R, b, top, W.neonCyan);
      R(4, y(13), 8, 1, W.neonCyan); R(3, y(19), 10, 1, W.neonCyan);
      if (front) { R(8, y(14), 1, 5, top.dark); P(5, y(15), W.neonPink); P(1, y(15) + b.swing, W.neonPink); }
      else R(3, y(16), 10, 1, top.shade);
      break;
    // crossed collar, wide sleeves, a sash in the accent colour
    case 'kimono':
      torso(R, b, top); longSleeves(R, b, top);
      for (const [x, offset] of [[0, b.swing], [15, -b.swing]] as const) if (!(b.raising && x === 15)) R(x, y(16) + offset, 1, 3, x ? top.shade : top.light);
      R(3, y(17), 10, 2, accent.base); R(3, y(18), 10, 1, accent.shade);
      if (front) { for (let i = 0; i < 4; i++) { P(5 + i, y(13 + i), top.light); P(10 - i, y(13 + i), top.dark); } R(6, y(13), 3, 1, b.skin.base); P(7, y(14), b.skin.shade); }
      else { R(6, y(16), 4, 3, accent.light); R(7, y(17), 2, 1, accent.dark); }
      break;
    // a puffy suit, a control panel on the chest, steel rings
    case 'spacesuit':
      torso(R, b, top); longSleeves(R, b, top, W.steel);
      R(4, y(13), 8, 1, W.steel); R(3, y(19), 10, 1, W.steelDark);
      if (front) { R(5, y(15), 5, 3, W.steelDark); P(6, y(16), W.led); P(7, y(16), W.neonLime); P(8, y(16), W.neonCyan); R(6, y(15), 3, 1, W.steel); }
      else { R(5, y(14), 6, 4, W.steel); R(5, y(14), 6, 1, W.steelLight); }
      break;
    // a breastplate, pauldrons, and a tabard in the top's colour
    case 'armor': {
      const steel = tones(W.steel);
      torso(R, b, steel); longSleeves(R, b, steel, W.steelDark);
      R(6, y(14), 4, 6, top.base); R(6, y(14), 1, 6, top.light); R(9, y(14), 1, 6, top.shade); R(7, y(16), 2, 1, W.gold);
      R(3, y(18), 10, 1, W.leather);
      for (const [x, offset] of [[0, b.swing], [13, -b.swing]] as const) if (!(b.raising && x === 13)) { R(x, y(13) + offset, 3, 2, x ? steel.shade : steel.light); P(x + 1, y(13) + offset, W.steelLight); }
      break;
    }
    // a robe with gold stars; the cape hangs behind (paintWardrobeBehind), or over the back
    case 'wizardCape':
      torso(R, b, top); longSleeves(R, b, top, top.dark);
      if (front) { P(5, y(15), W.star); P(10, y(17), W.star); P(6, y(18), W.star); R(3, y(12), 2, 2, top.dark); R(11, y(12), 2, 2, top.dark); R(7, y(13), 2, 1, W.gold); }
      else cape(R, b, top, true);
      break;
    // a loose shirt laced at the neck, puffed sleeves with ruffles, a sash
    case 'pirateShirt':
      torso(R, b, top); longSleeves(R, b, top, top.light);
      for (const [x, offset] of [[0, b.swing], [15, -b.swing]] as const) if (!(b.raising && x === 15)) R(x, y(16) + offset, 1, 2, x ? top.shade : top.light);
      if (front) { R(6, y(13), 4, 3, b.skin.base); P(7, y(13), W.strap); P(8, y(14), W.strap); P(7, y(15), W.strap); P(8, y(16), W.strap); }
      R(3, y(18), 10, 2, accent.base); R(3, y(19), 10, 1, accent.shade);
      if (front) { P(4, y(20), accent.base); P(5, y(20), accent.shade); }
      break;
    // a short-sleeved shirt with big flowers in the accent colour
    case 'hawaiian':
      for (const [fx, fy] of front ? [[4, 14], [9, 15], [6, 18], [11, 18]] : [[4, 15], [8, 14], [10, 18], [5, 18]]) {
        P(fx, y(fy), accent.base); P(fx + 1, y(fy), accent.light); P(fx, y(fy + 1), accent.shade); P(fx + 1, y(fy + 1), W.petalYellow);
      }
      for (const [x, offset] of [[1, b.swing], [13, -b.swing]] as const) if (!(b.raising && x === 13)) P(x, y(14) + offset, accent.base);
      if (front) { R(7, y(13), 2, 1, b.skin.base); P(6, y(13), top.light); P(9, y(13), top.light); }
      break;
    // a sailor uniform: the big collar in the accent colour, a red bow
    case 'sailor':
      torso(R, b, top); longSleeves(R, b, top, accent.base);
      if (front) {
        for (let i = 0; i < 3; i++) { R(3 + i, y(13 + i), 2, 1, accent.base); R(11 - i, y(13 + i), 2, 1, accent.base); }
        R(6, y(13), 4, 1, b.skin.base); R(7, y(14), 2, 1, b.skin.shade);
        R(6, y(16), 4, 1, W.red); R(7, y(17), 2, 2, W.red); P(7, y(16), tones(W.red).light);
      } else { R(4, y(13), 8, 4, accent.base); R(4, y(16), 8, 1, W.white); }
      break;
    // a long white coat, open on a shirt in the accent colour, a pen in the pocket
    case 'labCoat': {
      const coat = tones(W.white);
      torso(R, b, coat); longSleeves(R, b, coat, W.whiteShade);
      if (front) { R(6, y(13), 4, 7, accent.base); R(7, y(13), 2, 1, accent.light); R(5, y(13), 1, 7, W.whiteShade); R(10, y(13), 1, 7, W.whiteShade); P(4, y(15), W.blue); R(3, y(16), 2, 1, W.whiteShade); }
      else R(8, y(16), 1, 4, W.whiteShade);
      if (!b.sit) { R(3, 20, 3, 2, coat.light); R(10, 20, 3, 2, coat.shade); if (b.back) R(6, 20, 4, 2, coat.base); }
      break;
    }
    // rings of mail, a belt, a ragged hem
    case 'chainmail': {
      const steel = tones(W.steel);
      torso(R, b, steel); longSleeves(R, b, steel);
      for (let row = 13; row <= 19; row++) for (let x = 3; x <= 12; x++) if ((x + row) % 2) P(x, y(row), x > 10 ? W.steelDark : steel.shade);
      for (const [x, offset] of [[1, b.swing], [13, -b.swing]] as const) if (!(b.raising && x === 13)) for (let row = 14; row <= 18; row++) if ((x + row) % 2) P(x, y(row) + offset, steel.shade);
      R(3, y(18), 10, 1, W.leather); P(7, y(18), W.gold);
      if (!b.sit) for (let x = 3; x <= 12; x += 2) P(x, 20, steel.base);
      break;
    }
    // a captain's vest: two rows of gold buttons, epaulettes, a shirt in the accent colour
    case 'captainVest':
      longSleeves(R, b, accent, accent.shade);
      if (front) {
        R(7, y(13), 2, 2, accent.base); P(7, y(13), accent.light);
        for (const row of [15, 17]) { P(6, y(row), W.gold); P(9, y(row), W.gold); }
        R(8, y(15), 1, 5, top.dark);
      } else R(3, y(18), 10, 1, top.dark);
      for (const [x, offset] of [[1, b.swing], [13, -b.swing]] as const) if (!(b.raising && x === 13)) { R(x, y(14) + offset, 2, 1, W.gold); P(x, y(15) + offset, W.goldDark); }
      break;
    // an open cardigan on a T-shirt in the accent colour, buttons, ribbed hem and cuffs
    case 'cardigan':
      longSleeves(R, b, top, top.shade);
      R(3, y(19), 10, 1, top.shade);
      if (front) { R(6, y(13), 4, 6, accent.base); R(6, y(13), 1, 6, accent.light); R(5, y(13), 1, 7, top.dark); P(5, y(15), top.light); P(5, y(17), top.light); R(10, y(17), 2, 1, top.shade); }
      break;
    // a bib apron in the top's colour over a shirt in the accent colour, its ties at the back
    case 'apron':
      torso(R, b, accent); longSleeves(R, b, accent);
      if (front) {
        R(5, y(15), 6, 5, top.base); R(5, y(15), 1, 5, top.light); R(10, y(15), 1, 5, top.shade); R(7, y(17), 2, 1, top.shade);
        P(5, y(13), top.base); P(5, y(14), top.base); P(10, y(13), top.base); P(10, y(14), top.base); R(3, y(16), 2, 1, top.shade); R(11, y(16), 2, 1, top.shade);
        if (!b.sit) { R(5, 20, 6, 2, top.base); R(10, 20, 1, 2, top.shade); }
      } else { for (let i = 0; i < 5; i++) { P(4 + i, y(13 + i), top.base); P(11 - i, y(13 + i), top.base); } R(6, y(17), 4, 1, top.base); P(7, y(18), top.shade); P(9, y(18), top.shade); }
      break;
    // dungarees: the bib on a T-shirt in the accent colour, straps and two buttons; the trousers are the top's (underWardrobe)
    case 'overalls':
      R(3, y(13), 10, 3, accent.base); R(3, y(13), 2, 3, accent.light); R(11, y(13), 2, 3, accent.shade);
      for (const [x, offset] of [[1, b.swing], [13, -b.swing]] as const) if (!(b.raising && x === 13)) R(x, y(14) + offset, 2, 2, x === 1 ? accent.light : accent.shade);
      if (front) {
        R(5, y(15), 6, 5, top.base); R(10, y(15), 1, 5, top.shade); R(5, y(13), 1, 2, top.base); R(10, y(13), 1, 2, top.shade);
        P(5, y(15), W.gold); P(10, y(15), W.gold); R(7, y(16), 2, 2, top.shade);
      } else { for (let i = 0; i < 4; i++) { P(4 + i, y(13 + i), top.base); P(11 - i, y(13 + i), top.base); } R(4, y(17), 8, 3, top.base); }
      break;
    // a football shirt: stripes in the accent colour, a crest, the number 10 on the back
    case 'jersey':
      for (const [x, offset] of [[1, b.swing], [13, -b.swing]] as const) if (!(b.raising && x === 13)) R(x, y(15) + offset, 2, 1, accent.base);
      if (front) { for (const x of [5, 8, 11]) R(x, y(13), 1, 7, accent.base); R(6, y(13), 4, 1, accent.base); P(7, y(14), accent.base); P(10, y(15), W.gold); }
      else { R(4, y(13), 8, 1, accent.base); grid(P, 5, y(14), DIGITS[1], { x: accent.base }); grid(P, 8, y(14), DIGITS[0], { x: accent.base }); }
      break;
    // a leather jacket: a slanted zip, wide lapels with studs, a belt at the hem
    case 'bikerJacket':
      torso(R, b, top); longSleeves(R, b, top, W.steelDark);
      R(3, y(19), 10, 1, top.dark); P(9, y(19), W.steel);
      if (front) { for (let i = 0; i < 7; i++) P(9 - Math.floor(i / 2), y(13 + i), W.steel); R(4, y(13), 2, 2, top.light); R(10, y(13), 2, 2, top.shade); P(4, y(13), W.steelLight); P(11, y(13), W.steelLight); }
      else R(4, y(14), 8, 1, top.shade);
      break;
  }
  if (look.top === 'blanket') return;
  // gear worn on the body
  switch (look.accessory) {
    case 'jetpack':
      if (front) { R(4, y(13), 1, 6, W.strap); R(11, y(13), 1, 6, W.strap); R(4, y(16), 8, 1, W.strap); break; }
      for (const x of [3, 9]) { R(x, y(12), 4, 8, W.steel); R(x, y(12), 1, 8, W.steelLight); R(x + 3, y(12), 1, 8, W.steelDark); R(x, y(12), 4, 2, W.red); R(x + 1, y(20), 2, 1, W.rubber); }
      R(7, y(14), 2, 4, W.steelDark); P(7, y(15), W.neonLime);
      break;
    case 'backpack': {
      const bag = tones(W.bag);
      if (front) { R(4, y(13), 1, 5, W.strap); R(11, y(13), 1, 5, W.strap); break; }
      R(3, y(13), 10, 7, bag.base); R(3, y(13), 2, 7, bag.light); R(11, y(13), 2, 7, bag.shade); R(3, y(13), 10, 2, bag.shade); R(5, y(16), 6, 3, bag.light); R(5, y(16), 6, 1, W.strap); P(8, y(14), W.steelLight);
      break;
    }
    // the sword across the back, its hilt over the shoulder
    case 'backSword':
      if (front) { R(3, y(14), 1, 1, W.leather); for (let i = 0; i < 6; i++) P(4 + i, y(13 + i), W.leather); break; }
      for (let i = 0; i < 11; i++) P(12 - i, y(12 + i), i < 3 ? W.leather : i === 3 ? W.gold : i % 2 ? W.steel : W.steelLight);
      R(10, y(14), 3, 1, W.gold); P(13, y(11), W.gold);
      break;
    // a guitar on its strap, the neck up to the far shoulder; from behind, on the back
    case 'guitar': {
      const wood = tones(W.guitar);
      if (front) {
        for (let i = 0; i < 6; i++) P(3 + Math.floor(i * 1.6), y(13 + i), W.strap);
        for (let i = 0; i < 5; i++) P(9 + i, y(16 - i), W.fret);
        shadedBall((x, py) => P(x, py, x < 5 ? wood.light : wood.base), 6, y(18), 3.4, 2.6, wood);
        P(6, y(18), W.guitarDark); P(7, y(18), W.guitarDark); R(4, y(19), 1, 1, W.fret);
      } else {
        for (let i = 0; i < 6; i++) P(12 - i, y(16 - i), W.fret);
        shadedBall((x, py) => P(x, py, x < 9 ? wood.shade : wood.dark), 10, y(18), 3.4, 2.6, wood);
        for (let i = 0; i < 6; i++) P(3 + Math.floor(i * 1.6), y(13 + i), W.strap);
      }
      break;
    }
  }
}

/** The far arm raised (see chibi.ts), in a wardrobe top's sleeve, drawn after it. */
export function paintWardrobeRaisedSleeve(R: Paint, look: Look, b: Body) {
  const sleeve = wardrobeSleeve(look);
  if (!b.raising || !sleeve) return;
  R(13, 11 + b.up, 2, 4, sleeve.colour); R(14, 8 + b.up, 2, 4, sleeve.colour); R(15, 5 + b.up, 2, 3, sleeve.colour);
}

/** What goes over the outline: the flames under a jetpack, flickering with the step. */
export function paintWardrobeGlow(P: Dot, look: Look, b: Body) {
  if (look.accessory !== 'jetpack' || look.top === 'blanket') return;
  const flame = b.step ? [[0, W.flameCore], [1, W.flame], [2, W.flame]] as const : [[0, W.flameCore], [1, W.flame]] as const;
  const nozzles = b.back ? [4, 5, 10, 11] : [-1, 16];
  for (const x of nozzles) for (const [dy, colour] of flame) P(x, (b.back ? 21 : 18) + b.up + dy, colour);
}
