// The people of the room in chibi pixel art: a big head on a small body, 16 x 25 art pixels, drawn from a Look
// (shared/look.ts). Each pose is drawn once on its own little canvas, outlined, and kept.
import { CLOTH_COLORS, COSTUME_COLORS, HAIR_COLORS, MANNEQUIN, PEOPLE_INK as INK, SKIN_TONES } from '../design/people-palette.ts';
import { ROOM_PALETTE } from '../design/room-palette.ts';
import { BEARD_STYLES, HAIR_STYLES, WARDROBE_HAIR, type HairStyle, type Look } from '../../shared/look.ts';
import { costumeSleeve, isCostumeHat, paintAccessory, paintCostumeHat, paintCostumeLegs, paintCostumeTop, paintRaisedSleeve, paintSmoke, underCostume, type Body, type CostumeHat } from './costumes.ts';
import { css, mix, rgb } from './lighting.ts';
import { HAT_HEIGHT, NO_OUTFIT, outfitKey, wornOutfit, type Hat, type Outfit } from './outfits.ts';
import { ART_SCALE, artCanvas, outline, shadedBall, tones, type Tones } from './pixel-art.ts';
import { hash, type Pose, type SpriteSource } from './sprites.ts';
import { paintWardrobeBehind, paintWardrobeGlow, paintWardrobeLegs, paintWardrobeRaisedSleeve, paintWardrobeTop, underWardrobe, wardrobeSleeve } from './wardrobe.ts';
import { isWardrobeHat, paintWardrobeEyes, paintWardrobeHair, paintWardrobeHat, paintWardrobeOverHair, type WardrobeHat } from './wardrobe-head.ts';

const F = ROOM_PALETTE.festive;

/** The sprite canvas, and where the feet stand on it. Room for hair and a hat above the head, a moustache beyond it. */
const CANVAS = { width: 26, height: 44 };
/** The rows at the top of the canvas kept for hats: without one, the person fits in the rows below. */
export const HAT_ROWS = 8;
const ORIGIN = { x: 5, y: 8 + HAT_ROWS };
const FEET = { x: 13, y: 41 };
/** The square of the canvas holding the head (hair included). */
const HEAD = { x: 4, y: 11, size: 18 };
/** The highest row of each hairstyle (0 is the top of a bald head): where a hat sits. */
const HAIR_TOP: Readonly<Record<HairStyle, number>> = {
  none: 0, buzz: 0, short: -1, sidePart: -1, sweep: -1, curly: -2, quiff: -2, spiky: -2, mohawk: -3, afro: -3, pigtails: -1, bob: -1, ponytail: -1, bun: -3, braids: -1, long: -1, bangs: -1,
  topknot: -2, dreadlocks: -1, mullet: -1, punkSpikes: -6, wavy: -1, coils: -1, undercut: -2, geisha: -5, twinTails: -1, vikingBraids: -1, emo: -1, tonsure: 0,
};
/** Hairstyles that hide the ears from the front, and those that leave them to see from behind. */
const COVERS_EARS: ReadonlySet<HairStyle> = new Set(['long', 'bob', 'bangs', 'braids', 'dreadlocks', 'wavy', 'geisha', 'vikingBraids']);
const EARS_FROM_BEHIND: ReadonlySet<HairStyle> = new Set(['none', 'buzz', 'short', 'sidePart', 'sweep', 'quiff', 'spiky', 'mohawk', 'pigtails', 'ponytail', 'bun', 'topknot', 'punkSpikes', 'coils', 'undercut', 'twinTails', 'tonsure']);
/** Tops whose sleeves go down to the wrist. */
const LONG_SLEEVES: ReadonlySet<Look['top']> = new Set(['suit', 'threePiece', 'tracksuit', 'shirt', 'hoodie', 'sweater', 'jacket']);

/** Hats as rows of letters, their bottom row on the hair; `x` is their left column (the head is centred on 8). */
const HATS: Readonly<Record<Exclude<Hat, 'party' | 'gold' | CostumeHat | WardrobeHat>, { x: number; rows: readonly string[] }>> = {
  santa: { x: 1, rows: [
    '......rrrr.....',
    '....rrrrrrrr...',
    '...rrrrrrrrrrww',
    '..rrrrrrrrr.www',
    '..rrrrrrrrr..w.',
    '.fffffffffffff.',
    '.fffffffffffff.',
  ] },
  crown: { x: 4, rows: [
    'y...y...y',
    'yy.yyy.yy',
    'yyyyyyyyy',
    'yyryyybyy',
    'yyyyyyyyy',
  ] },
  bunny: { x: 4, rows: [
    '.w.....w.',
    'www...www',
    'wpw...wpw',
    'wpw...wpw',
    'wpw...wpw',
    'www...www',
    'kkkkkkkkk',
  ] },
  // a beret: flat, wide, tilted, its little stalk
  beret: { x: 1, rows: [
    '..........c...',
    '...ccccccccccc',
    '.ccclccccccccc',
    'cccccccccccc..',
  ] },
  // a cap: a rounded crown, a long darker visor ahead
  cap: { x: 1, rows: [
    '..cccccc.......',
    '.cclcccccc.....',
    'ccccccccccc....',
    'cccccccccccvvvv',
  ] },
  // a knitted beanie: tall and round, a pompom, its folded band
  beanie: { x: 2, rows: [
    '.....lll.....',
    '...ccccccc...',
    '..ccccccccc..',
    '.cclcccccccc.',
    '.ccccccccccc.',
    'vvvvvvvvvvvvv',
    'vvvvvvvvvvvvv',
  ] },
  tophat: { x: 3, rows: [
    '..ccccccc..',
    '..cclcccc..',
    '..ccccccc..',
    '..ccccccc..',
    '..rrrrrrr..',
    'ccccccccccc',
  ] },
};
/** Headphones, each cup a rounded shell lit from the top left (k shell, l shine, d shadow, p the red cap). Seen
 * three-quarters, the near cup is the bigger one, on the side of the visible ear: the left from the front, the right from
 * behind. From the front the far cup hides behind the face, its edge showing; from behind both stick out. */
const HEADPHONES = {
  front: { near: { x: -1, y: 5, rows: ['.lk.', 'lkkk', 'kpkd', 'kkdd', '.dd.'] }, far: { x: 14, y: 5, rows: ['k.', 'kd', 'kd', 'dd', 'd.'] } },
  back: { near: { x: 13, y: 5, rows: ['.lk.', 'lkkk', 'kkpd', 'kkdd', '.dd.'] }, far: { x: -1, y: 5, rows: ['.k.', 'kkd', 'kdd', 'kdd', '.d.'] } },
};
const HAT_PAINT: Readonly<Record<string, string>> = { r: F.red, w: F.fur, f: F.fur, y: F.gold, b: F.jewelBlue, p: F.earInside, k: F.headphones };
/** The arm nearer the viewer once the sprite is mirrored to face down-left (the way people at a desk face), and its
 * elbow while seated: where the forearm of someone typing starts. */
const NEAR_ARM = { x: 1, elbowY: 19 };

type Paint = (x: number, y: number, width: number, height: number, colour: string) => void;

/** Halfway between two "#rrggbb" colours, as one. */
const blend = (a: string, b: string) => `#${mix(rgb(a), rgb(b), 0.5).map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

const ball = (R: Paint, cx: number, cy: number, rx: number, ry: number, colours: Tones) => shadedBall((x, y, colour) => R(x, y, 1, 1, colour), cx, cy, rx, ry, colours);

interface Frame { back: boolean; posture: Pose['posture']; step: 0 | 1; blinking: boolean; smiling: boolean; gesture: Pose['gesture'] }

/** A party hat: a cone leaning a little to the right, two stripes, a pompom on its tip. */
function cone(R: Paint, base: number, body: string, stripe: string, pompom: string) {
  for (let row = 0; row < 8; row++) {
    const width = 9 - row;
    R(8 - Math.floor(width / 2) + Math.floor(row / 3), base - row, width, 1, row === 2 || row === 5 ? stripe : body);
  }
  R(9, base - 9, 2, 2, pompom);
}

/** What a festival puts on someone (outfits.ts), drawn over their hair: headphones, sunglasses, a hat. */
function paintOutfit(R: Paint, P: (x: number, y: number, colour: string) => void, look: Look, outfit: Outfit, back: boolean, up: number) {
  const top = HAIR_TOP[look.hair] + up;
  if (outfit.headphones) {
    const paints: Readonly<Record<string, string>> = { k: F.headphonesShell, l: F.headphonesShine, d: F.headphones, p: F.headphonesPad };
    const grid = (x: number, y: number, rows: readonly string[]) => {
      for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => { if (paints[letter]) P(x + column, y + line, paints[letter]); });
    };
    grid(3, top, ['llkkkkkkkd']);
    grid(2, top + 1, ['l..........d']);
    for (let y = top + 2; y < 5 + up; y++) { P(1, y, F.headphonesShell); P(14, y, F.headphones); }
    const { near, far } = back ? HEADPHONES.back : HEADPHONES.front;
    grid(far.x, far.y + up, far.rows);
    grid(near.x, near.y + up, near.rows);
  }
  if (outfit.sunglasses) {
    if (back) R(11, 5 + up, 3, 1, F.shades);
    else {
      R(5, 5 + up, 4, 3, F.shades); R(10, 5 + up, 4, 3, F.shades); P(9, 6 + up, F.shades); R(3, 6 + up, 2, 1, F.shades);
      P(6, 5 + up, F.shadesShine); P(11, 5 + up, F.shadesShine);
    }
  }
  if (!outfit.hat) return;
  if (isCostumeHat(outfit.hat)) { paintCostumeHat(R, P, outfit.hat, back, up); return; }
  if (isWardrobeHat(outfit.hat)) { paintWardrobeHat(R, P, outfit.hat, outfit.hatColor ?? F.beret, top, back, up); return; }
  if (outfit.hat === 'party') { const colour = outfit.hatColor ?? F.balloons[hash(JSON.stringify(look)) % F.balloons.length]; cone(R, top + 1, colour, F.hatStripe, F.gold); return; }
  if (outfit.hat === 'gold') { cone(R, top + 1, F.gold, F.silver, F.silver); return; }
  const { x, rows } = HATS[outfit.hat];
  const own = tones(outfit.hatColor ?? F.beret);
  const paints = { ...HAT_PAINT, c: own.base, l: own.light, v: own.shade };
  // the hat's bottom row sits one row into the hair (the santa hat's fur brim and the beanie's band two)
  const bottom = top + (outfit.hat === 'santa' || outfit.hat === 'beanie' ? 2 : 1);
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = paints[letter as keyof typeof paints];
    if (colour) P(x + column, bottom - (rows.length - 1 - line), colour);
  });
}

/** Facing down-right (front) or up-right (back); the left-facing poses are these, mirrored. */
function paint(worn: Look, frame: Frame, outfit: Outfit): HTMLCanvasElement {
  // in swimwear, the blanket comes off: a tank top in the colour of the top, swim briefs, flip-flops
  const swim = outfit.swimwear === true;
  const dressed: Look = swim ? { ...worn, top: worn.top === 'none' ? 'none' : 'tank', bottom: 'shorts', shoes: 'flipflops' } : worn;
  // the anime pieces go over a bare body (costumes.ts), the wardrobe's over plain trousers and bare feet (wardrobe.ts)
  const look = underWardrobe(underCostume(dressed));
  const { canvas, context } = artCanvas(CANVAS.width, CANVAS.height);
  const R: Paint = (x, y, width, height, colour) => { context.fillStyle = colour; context.fillRect(ORIGIN.x + x, ORIGIN.y + y, width, height); };
  const P = (x: number, y: number, colour: string) => R(x, y, 1, 1, colour);
  const { back, posture } = frame;
  const sit = posture === 'sit', walk = posture === 'walk';
  const up = sit ? 1 : 0;
  const swing = walk ? (frame.step ? 1 : -1) : 0;
  const lift = walk ? (frame.step ? [1, 0] : [0, 1]) : [0, 0];
  const skin = tones(look.skin), hair = tones(look.hairColor), fuzz = tones(blend(look.hairColor, look.skin)), beard = tones(look.beardColor), top = tones(look.topColor), bottom = tones(look.bottomColor);
  const accent = look.accentColor;
  const body: Body = { back, sit, up, swing, lift, raising: frame.gesture === 'raising', typing: frame.gesture === 'typing' && !back, step: frame.step, skin, hair };
  paintWardrobeBehind(R, P, dressed, outfit.hat, body);

  // legs and feet, or the blanket that hides them
  if (look.top === 'blanket') {
    const sway = walk ? (frame.step ? 1 : -1) : 0;
    ball(R, 8 + sway * 0.5, 18 + up / 2, 7.2, 7.6, top);
    ball(R, 4, 15 + up, 3, 3, top);
    ball(R, 12 + sway, 22, 3, 3, top);
    ball(R, 4 - sway, 23, 2.6, 2, top);
    for (let y = 13 + up; y < 25; y++) P(10 + (y > 19 ? 1 : 0) + (y > 21 ? sway : 0), y, top.dark);
  } else {
    const feet = (x: number, y: number) => {
      const colour = look.shoesColor, dark = tones(colour).dark;
      switch (look.shoes) {
        case 'flipflops': R(x, y, 4, 1, skin.base); P(x + 1, y, colour); R(x, y + 1, 4, 1, colour); break;
        case 'sandals': R(x, y, 4, 1, skin.base); P(x + 1, y, colour); P(x + 3, y, colour); R(x, y + 1, 4, 1, colour); break;
        case 'barefoot': R(x, y, 4, 2, skin.base); R(x, y + 1, 4, 1, skin.shade); break;
        // boots climb up the ankle, over the trousers
        case 'boots': R(x, y - 1, 4, 3, colour); R(x, y + 1, 4, 1, dark); break;
        // heels: the foot slopes down to the toes, a thin heel at the back
        case 'heels': R(x + 1, y, 3, 1, colour); R(x + 2, y + 1, 2, 1, colour); P(x, y + 1, dark); break;
        default: R(x, y, 4, 2, colour); if (look.shoes === 'sneakers') R(x, y + 1, 4, 1, INK.sole);
      }
    };
    // a dress and a skirt end above the knee; the legs show below
    const flared = look.top === 'dress' ? top : look.bottom === 'skirt' ? bottom : null;
    if (sit && swim) { R(4, 21, 8, 1, bottom.base); R(4, 22, 8, 2, skin.base); }
    else if (sit && flared) { R(3, 21, 10, 2, flared.base); R(4, 23, 8, 1, skin.base); }
    else if (sit) R(4, 21, 8, 3, bottom.base);
    else {
      [[4, lift[0], 0], [9, lift[1], 1]].forEach(([x, raised, side]) => {
        if (swim) { R(x, 19, 3, 1, side ? bottom.shade : bottom.base); R(x, 20, 3, 3 - raised, side ? skin.shade : skin.base); }
        else if (flared || look.bottom === 'shorts') {
          const cloth = flared ?? bottom;
          R(x, 19, 3, 2, side ? cloth.shade : cloth.base); R(x, 21, 3, 2 - raised, side ? skin.shade : skin.base);
        } else { R(x, 19, 3, 4 - raised, side ? bottom.shade : bottom.base); if (look.bottom === 'tracksuit') R(x + side * 2, 19, 1, 4 - raised, accent); }
        feet(x, 23 - raised);
      });
      if (flared) { R(3, 19, 10, 1, flared.base); R(2, 20, 12, 1, flared.base); R(10, 19, 3, 2, flared.shade); }
    }
    paintCostumeLegs(R, P, dressed, body);
    paintWardrobeLegs(R, P, dressed, body);
    // the top: shaded from the left, and its own details
    const cloth = look.top === 'none' ? skin : top;
    const front = !back;
    R(3, 13 + up, 10, 7, cloth.base); R(3, 13 + up, 2, 7, cloth.light); R(11, 13 + up, 2, 7, cloth.shade);
    switch (look.top) {
      case 'tracksuit': R(3, 16 + up, 10, 1, accent); if (front) R(8, 13 + up, 1, 7, top.dark); break;
      // a tank top: bare shoulders and a low neck
      case 'tank': R(3, 13 + up, 2, 1, skin.base); R(11, 13 + up, 2, 1, skin.shade); if (front) R(6, 13 + up, 4, 1, skin.base); break;
      case 'vneck': if (front) { R(6, 13 + up, 4, 1, skin.base); R(7, 14 + up, 2, 1, skin.shade); } break;
      // a polo: two wide collar flaps, the placket between them, one button
      case 'polo': if (front) { R(4, 13 + up, 4, 2, top.light); R(9, 13 + up, 4, 2, top.light); R(4, 15 + up, 4, 1, top.shade); R(9, 15 + up, 4, 1, top.shade); R(8, 13 + up, 1, 4, top.dark); P(8, 15 + up, INK.sole); } break;
      // a shirt: two collar points, a placket and its buttons
      case 'shirt': if (front) { R(5, 13 + up, 2, 1, top.light); R(9, 13 + up, 2, 1, top.light); R(8, 13 + up, 1, 7, top.shade); P(8, 15 + up, top.light); P(8, 17 + up, top.light); } break;
      // a hoodie: the hood down behind the neck, its strings, the front pocket
      case 'hoodie':
        if (front) { R(4, 12 + up, 8, 1, top.shade); P(6, 14 + up, INK.shirt); P(6, 15 + up, INK.shirt); P(9, 14 + up, INK.shirt); P(9, 15 + up, INK.shirt); R(5, 17 + up, 6, 2, top.shade); }
        else R(4, 12 + up, 8, 3, top.shade);
        break;
      // a sweater: a rolled neck and a ribbed hem
      case 'sweater': R(5, 12 + up, 6, 2, top.light); R(3, 19 + up, 10, 1, top.shade); break;
      // an open jacket over a shirt in the accent colour
      case 'jacket': if (front) { R(6, 13 + up, 4, 7, accent); R(5, 13 + up, 1, 7, top.dark); R(10, 13 + up, 1, 7, top.dark); P(6, 13 + up, top.light); P(9, 13 + up, top.light); } break;
      case 'dress': R(3, 17 + up, 10, 1, top.shade); if (front) R(6, 13 + up, 4, 1, skin.base); break;
      case 'suit': if (front) { R(7, 13 + up, 2, 2, top.dark); P(6, 14 + up, top.dark); P(9, 14 + up, top.dark); P(8, 17 + up, top.light); } break;
      case 'threePiece':
        if (front) {
          R(6, 13 + up, 4, 2, INK.shirt); R(6, 15 + up, 4, 3, top.dark);
          R(7, 13 + up, 2, 1, accent); R(7, 14 + up, 2, 4, accent); P(7, 17 + up, top.dark);
          P(5, 13 + up, top.light); P(10, 13 + up, top.light);
        }
        break;
      case 'none': if (front && !swim) { R(4, 15 + up, 3, 1, skin.shade); R(9, 15 + up, 3, 1, skin.shade); P(8, 18 + up, skin.dark); } else if (back) R(8, 14 + up, 1, 5, skin.shade); break;
    }
    // arms: bare, short sleeves and bare forearms, or long sleeves to the wrist
    const bareArms = look.top === 'none' || look.top === 'tank';
    const longSleeves = LONG_SLEEVES.has(look.top);
    const raising = frame.gesture === 'raising';
    const typing = frame.gesture === 'typing' && !back;
    [[1, swing, cloth.light, skin.base], [13, -swing, cloth.shade, skin.shade]].forEach(([x, moved, sleeve, arm]) => {
      const column = x as number, offset = moved as number;
      if (raising && column === 13) return;
      if (bareArms) R(column, 14 + up + offset, 2, 5, arm as string);
      else if (longSleeves) { R(column, 14 + up + offset, 2, 5, sleeve as string); if (look.top === 'tracksuit') R(column, 16 + up + offset, 2, 1, accent); }
      else { R(column, 14 + up + offset, 2, 2, sleeve as string); R(column, 16 + up + offset, 2, 3, arm as string); }
      // typing, the near arm stops at the elbow: its forearm and hand lie on the desk, drawn after it (drawTypingHand)
      if (!(typing && column === NEAR_ARM.x)) R(column, 19 + up + offset, 2, 1, arm as string);
    });
    paintCostumeTop(R, P, dressed, body);
    paintWardrobeTop(R, P, dressed, body);
    if (look.watch && !back && !typing) R(1, 18 + up + swing, 2, 1, INK.watch);
    // a water gun in the near hand, pointing ahead, its tank on top
    if (outfit.waterGun && !back && !typing) {
      const y = 17 + up + swing;
      R(-3, y, 5, 2, F.waterGun); R(0, y + 2, 2, 2, F.waterGun); R(-2, y - 2, 3, 2, F.waterGunTank); P(-4, y, tones(F.waterGun).dark);
    }
  }

  // the head, and what of the hair hangs behind it
  R(6, 12 + up, 4, 1, skin.shade);
  if (look.hair === 'afro') { ball(R, 8, 4 + up, 8.6, 6.6, hair); ball(R, 1.5, 2 + up, 2, 2, hair); ball(R, 14.5, 2 + up, 2, 2, hair); }
  // a ponytail hangs at the back of the head: from the front, that is the side away from the face (the left)
  if (look.hair === 'ponytail' && !back) { R(0, 2 + up, 3, 3, hair.base); R(-1, 4 + up, 2, 7, hair.shade); P(-1, 11 + up, hair.dark); }
  ball(R, 8, 6.5 + up, 6.4, 6.6, skin);
  const tufts = (bumps: readonly (readonly [number, number])[]) => { for (const [x, y] of bumps) ball(R, x, y + up, 1.7, 1.6, hair); };
  /** a braid down the shoulder, its strands shaded one row in two, tied at the end */
  const braid = (x: number, from: number, to: number) => { for (let y = from; y < to; y++) R(x, y + up, 2, 1, y % 2 ? hair.base : hair.shade); R(x, to + up, 2, 1, INK.band); };
  if (!back) {
    if (!COVERS_EARS.has(look.hair)) R(1, 6 + up, 2, 3, skin.shade);
    if (look.glasses) {
      R(6, 5 + up, 3, 3, look.glasses); R(10, 5 + up, 3, 3, look.glasses); P(9, 6 + up, look.glasses); R(3, 6 + up, 3, 1, look.glasses);
      P(7, 6 + up, frame.blinking ? look.glasses : INK.pupil); P(11, 6 + up, frame.blinking ? look.glasses : INK.pupil);
    } else if (frame.blinking) {
      R(6, 7 + up, 2, 1, INK.pupil); R(10, 7 + up, 2, 1, INK.pupil);
    } else {
      for (const x of [6, 10]) {
        const outer = x === 6 ? x - 1 : x + 2;
        switch (look.eyes) {
          case 'wide': R(x, 5 + up, 2, 3, INK.eyeWhite); R(x + 1, 6 + up, 1, 2, INK.pupil); break;
          case 'sleepy': R(x, 6 + up, 2, 1, skin.shade); R(x, 7 + up, 2, 1, INK.eyeWhite); P(x + 1, 7 + up, INK.pupil); break;
          // laughing eyes: two little arches
          case 'happy': P(x - 1 + (x === 6 ? 0 : 1), 7 + up, INK.pupil); P(x + (x === 6 ? 0 : 1), 6 + up, INK.pupil); P(x + 1 + (x === 6 ? 0 : 1), 7 + up, INK.pupil); break;
          // drawn over the brows (wardrobe-head.ts)
          case 'angry': case 'wink': case 'tired': case 'starry': case 'sparkly': case 'cyborg': case 'laughing': break;
          default: R(x, 6 + up, 2, 2, INK.eyeWhite); R(x + 1, 6 + up, 1, 2, INK.pupil); if (look.eyes === 'lashes') P(outer, 6 + up, INK.pupil);
        }
      }
    }
    if (look.hair !== 'none' && !look.glasses) { R(6, 5 + up, 2, 1, hair.dark); R(10, 5 + up, 2, 1, hair.dark); }
    if (!look.glasses) paintWardrobeEyes(R, P, look, body, frame.blinking);
    // a finished turn waiting to be seen makes anyone smile
    const mouth = () => { R(9, 10 + up, 2, 1, INK.mouth); if (frame.smiling) { P(8, 9 + up, INK.mouth); P(11, 9 + up, INK.mouth); } };
    switch (look.beard) {
      case 'none': mouth(); break;
      // three days of growth: every other pixel of the jaw, around the mouth
      case 'stubble':
        for (const [y, from, to] of [[8, 3, 4], [9, 3, 13], [10, 3, 13], [11, 4, 12], [12, 6, 10]] as const) {
          for (let x = from; x <= to; x++) if ((x + y) % 2 === 0 && !(y >= 9 && y <= 10 && x >= 8 && x <= 11)) P(x, y + up, beard.shade);
        }
        mouth();
        break;
      case 'mustache': R(7, 9 + up, 6, 1, beard.base); P(7, 10 + up, beard.shade); P(12, 10 + up, beard.shade); R(9, 10 + up, 2, 1, INK.mouth); break;
      // a chinstrap: along the jaw, no moustache
      case 'chinstrap': R(2, 7 + up, 1, 4, beard.base); R(14, 7 + up, 1, 4, beard.shade); R(3, 11 + up, 12, 1, beard.base); R(5, 12 + up, 8, 1, beard.dark); mouth(); break;
      case 'short':
        R(2, 7 + up, 2, 4, beard.base); R(13, 7 + up, 2, 4, beard.shade); R(3, 11 + up, 12, 1, beard.base); R(5, 12 + up, 8, 1, beard.dark);
        R(8, 9 + up, 4, 1, beard.base); mouth();
        break;
      case 'full': case 'long':
        R(4, 8 + up, 11, 3, beard.base); R(5, 11 + up, 9, 1, beard.base); R(7, 12 + up, 6, 1, beard.dark); P(6, 9 + up, beard.light); P(12, 10 + up, beard.dark);
        if (look.beard === 'long') { R(5, 12 + up, 9, 3, beard.base); R(6, 15 + up, 7, 3, beard.base); R(7, 18 + up, 5, 2, beard.dark); P(7, 13 + up, beard.light); P(10, 16 + up, beard.light); P(8, 17 + up, beard.dark); }
        R(9, 9 + up, 3, 1, INK.mouth);
        break;
      case 'handlebar':
        // a short beard on the chin, and a long moustache curling up past the cheeks
        R(6, 11 + up, 7, 2, beard.base); R(7, 13 + up, 5, 1, beard.dark); P(8, 11 + up, beard.light);
        R(2, 8 + up, 14, 1, beard.base); R(4, 9 + up, 10, 1, beard.shade); P(1, 7 + up, beard.base); P(0, 6 + up, beard.base); P(16, 7 + up, beard.base); P(17, 6 + up, beard.base);
        R(9, 10 + up, 2, 1, INK.mouth);
        break;
      case 'goatee':
        R(8, 9 + up, 4, 1, beard.base); R(8, 11 + up, 3, 2, beard.base); P(9, 13 + up, beard.dark);
        R(9, 10 + up, 2, 1, INK.mouth);
        break;
    }
    switch (look.hair) {
      case 'none': P(5, 2 + up, skin.light); P(6, 2 + up, skin.light); break;
      // shaved close: the scalp shows through, so the hair is halfway to the skin's colour
      case 'buzz': ball(R, 8, 2.6 + up, 6.3, 2.9, fuzz); break;
      case 'short': ball(R, 8, 3 + up, 6.7, 3.6, hair); R(3, 4 + up, 9, 1, hair.base); P(2, 5 + up, hair.base); P(2, 6 + up, hair.base); break;
      // a side parting: the hair swept to one side, the parting a darker line
      case 'sidePart': ball(R, 8, 3 + up, 6.8, 3.7, hair); R(2, 4 + up, 9, 1, hair.base); R(2, 5 + up, 3, 1, hair.base); P(2, 6 + up, hair.base); P(11, 0 + up, hair.dark); P(11, 1 + up, hair.dark); P(10, 2 + up, hair.dark); break;
      // swept to one side and down over the far eye
      case 'sweep':
        ball(R, 8, 3 + up, 6.8, 3.7, hair); R(2, 4 + up, 9, 1, hair.base); R(2, 5 + up, 3, 1, hair.base); P(2, 6 + up, hair.base);
        R(9, 3 + up, 5, 2, hair.base); R(10, 5 + up, 4, 2, hair.base); R(10, 7 + up, 3, 1, hair.shade);
        break;
      case 'curly':
        ball(R, 8, 2.8 + up, 7, 3.9, hair); tufts([[3, 1.5], [6, 0.2], [9.5, -0.2], [13, 1.2], [2.2, 4.2]]);
        R(3, 4 + up, 9, 1, hair.base); P(5, 5 + up, hair.base); P(9, 5 + up, hair.base); P(4, 1 + up, hair.light); P(9, 0 + up, hair.light);
        break;
      case 'quiff':
        ball(R, 8, 3.2 + up, 6.6, 3.4, hair); R(5, -1 + up, 8, 2, hair.base); R(7, -2 + up, 7, 1, hair.base); R(11, -3 + up, 4, 1, hair.base); P(15, -2 + up, hair.base);
        R(8, -1 + up, 3, 1, hair.light); R(4, 4 + up, 7, 1, hair.base); P(2, 5 + up, hair.base);
        break;
      case 'spiky':
        ball(R, 8, 3 + up, 6.7, 3.6, hair); R(3, -1 + up, 2, 2, hair.base); R(6, -2 + up, 2, 3, hair.base); R(9, -2 + up, 2, 3, hair.light); R(12, -1 + up, 2, 2, hair.base);
        R(4, 4 + up, 8, 1, hair.base); P(2, 5 + up, hair.base); P(2, 6 + up, hair.base);
        break;
      // a mohawk: shaved sides, a crest standing up the middle
      case 'mohawk': R(6, -3 + up, 4, 6, hair.base); R(7, -3 + up, 1, 5, hair.light); R(9, -2 + up, 1, 4, hair.shade); P(3, 3 + up, hair.shade); P(12, 3 + up, hair.shade); break;
      case 'afro': ball(R, 8, 2.5 + up, 7.8, 3.6, hair); P(4, 1 + up, hair.light); P(9, 0 + up, hair.light); break;
      case 'pigtails':
        ball(R, 8, 3 + up, 6.9, 3.8, hair); R(2, 3 + up, 11, 1, hair.base); P(5, 4 + up, hair.base); P(9, 4 + up, hair.base);
        ball(R, -0.5, -1 + up, 2, 3, hair); ball(R, 16.5, -1 + up, 2, 3, hair); P(1, 2 + up, INK.band); P(14, 2 + up, INK.band);
        break;
      // a bob: straight to the chin, a fringe across the forehead
      case 'bob': ball(R, 8, 3 + up, 7.1, 3.9, hair); R(1, 3 + up, 3, 9, hair.base); R(1, 3 + up, 1, 9, hair.light); R(13, 4 + up, 3, 8, hair.shade); R(3, 3 + up, 10, 2, hair.base); break;
      case 'ponytail': ball(R, 8, 3 + up, 6.9, 3.8, hair); R(3, 4 + up, 9, 1, hair.base); P(2, 5 + up, hair.base); P(1, 3 + up, INK.band); break;
      case 'bun': ball(R, 8, 3 + up, 6.9, 3.8, hair); R(3, 4 + up, 9, 1, hair.base); ball(R, 8, -0.8 + up, 3, 2.4, hair); P(7, -2 + up, hair.light); R(6, 1 + up, 5, 1, hair.dark); break;
      case 'braids': ball(R, 8, 3 + up, 7.1, 3.9, hair); R(3, 3 + up, 4, 2, hair.base); R(9, 3 + up, 4, 2, hair.base); braid(1, 5, 17); braid(13, 5, 17); break;
      // long hair parted in the middle, the forehead clear
      case 'long':
        ball(R, 8, 2.6 + up, 7.1, 3.4, hair); R(1, 3 + up, 3, 12, hair.base); R(1, 3 + up, 1, 12, hair.light); R(13, 3 + up, 3, 11, hair.shade);
        R(8, -1 + up, 1, 3, hair.dark); R(3, 3 + up, 3, 1, hair.base); R(11, 3 + up, 2, 1, hair.base);
        break;
      // long hair under a thick, straight fringe that hides the brows
      case 'bangs':
        ball(R, 8, 3 + up, 7.1, 3.9, hair); R(1, 3 + up, 3, 12, hair.base); R(1, 3 + up, 1, 12, hair.light); R(13, 4 + up, 3, 10, hair.shade);
        R(2, 3 + up, 12, 3, hair.base); R(2, 5 + up, 12, 1, hair.shade);
        break;
      default: paintWardrobeHair(R, P, look, body);
    }
  } else {
    if (EARS_FROM_BEHIND.has(look.hair)) R(13, 6 + up, 2, 3, skin.shade);
    if (look.beard !== 'none' && look.beard !== 'goatee' && look.beard !== 'mustache') { R(12, 9 + up, 3, 3, look.beard === 'stubble' ? beard.shade : beard.base); if (look.beard === 'long') R(12, 12 + up, 2, 4, beard.base); }
    if (look.beard === 'handlebar') { R(14, 8 + up, 3, 1, beard.base); P(17, 7 + up, beard.base); P(17, 6 + up, beard.base); }
    if (look.glasses) R(11, 5 + up, 3, 1, look.glasses);
    switch (look.hair) {
      case 'none': P(5, 2 + up, skin.light); R(6, 12 + up, 5, 1, skin.shade); break;
      case 'buzz': ball(R, 8, 5 + up, 6.5, 6, fuzz); break;
      case 'short': case 'sidePart': case 'sweep': ball(R, 8, 5 + up, 6.7, 6.2, hair); break;
      case 'curly': ball(R, 8, 5 + up, 7, 6.4, hair); tufts([[3, 1.5], [6, 0.2], [9.5, -0.2], [13, 1.2], [2, 6], [14, 6]]); break;
      case 'quiff': ball(R, 8, 5 + up, 6.6, 6.2, hair); R(5, -1 + up, 8, 2, hair.base); R(7, -2 + up, 6, 1, hair.base); break;
      case 'spiky': ball(R, 8, 5 + up, 6.7, 6.2, hair); R(3, -1 + up, 2, 2, hair.base); R(6, -2 + up, 2, 3, hair.base); R(9, -2 + up, 2, 3, hair.light); R(12, -1 + up, 2, 2, hair.base); break;
      case 'mohawk': R(6, -3 + up, 4, 15, hair.base); R(7, -3 + up, 1, 14, hair.light); break;
      case 'afro': ball(R, 8, 5 + up, 7.2, 6.4, hair); break;
      case 'pigtails': ball(R, 8, 5.5 + up, 6.7, 6.4, hair); ball(R, -0.5, -1 + up, 2, 3, hair); ball(R, 16.5, -1 + up, 2, 3, hair); P(1, 2 + up, INK.band); P(14, 2 + up, INK.band); break;
      case 'bob': ball(R, 8, 5.5 + up, 7.1, 6.6, hair); R(1, 6 + up, 15, 6, hair.base); R(1, 6 + up, 2, 6, hair.light); R(13, 6 + up, 3, 6, hair.shade); break;
      case 'ponytail': ball(R, 8, 5 + up, 6.7, 6.2, hair); R(7, 9 + up, 3, 8, hair.base); R(9, 10 + up, 1, 7, hair.shade); R(7, 9 + up, 3, 1, INK.band); break;
      case 'bun': ball(R, 8, 5 + up, 6.7, 6.2, hair); ball(R, 8, -0.8 + up, 3, 2.4, hair); break;
      case 'braids': ball(R, 8, 5.5 + up, 7.1, 6.6, hair); braid(4, 10, 18); braid(10, 10, 18); break;
      case 'long': case 'bangs': ball(R, 8, 5.5 + up, 7.1, 6.6, hair); R(1, 6 + up, 15, 10, hair.base); R(1, 6 + up, 2, 10, hair.light); R(13, 6 + up, 3, 10, hair.shade); break;
      default: paintWardrobeHair(R, P, look, body);
    }
  }
  paintAccessory(R, P, dressed, body);
  paintWardrobeOverHair(R, P, dressed, body, look.glasses !== null);
  paintOutfit(R, P, look, outfit, back, up);
  if (frame.gesture === 'raising') {
    // the far arm raised, drawn over the hair and against the head so no outline runs between them; the hand waves.
    // Not the near one: at a desk (facing down-left) it would rise behind the next desk's person and tag.
    const sleeve = look.top === 'none' || swim ? skin.base : top.base;
    // out to the side rather than straight up, so the hand shows beside the head, below the name tag
    R(13, 11 + up, 2, 4, sleeve);
    R(14, 8 + up, 2, 4, sleeve);
    R(15, 5 + up, 2, 4, sleeve);
    R(15 + frame.step, 1 + up, 3, 4, skin.base);
  }
  paintRaisedSleeve(R, dressed, body);
  paintWardrobeRaisedSleeve(R, dressed, body);
  outline(canvas, INK.outline);
  paintSmoke(P, dressed, body);
  paintWardrobeGlow(P, dressed, body);
  return canvas;
}

function mirrored(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, context } = artCanvas(source.width, source.height);
  context.translate(source.width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0);
  return canvas;
}

const sprites = new Map<string, HTMLCanvasElement>();
/** The canvas of a look in a pose (and in a festival's outfit), drawn the first time it is needed. */
export function chibiSprite(look: Look, pose: Pose, festive: Outfit = NO_OUTFIT): HTMLCanvasElement {
  const outfit = wornOutfit(look, festive);
  const back = pose.direction.startsWith('up');
  const left = pose.direction.endsWith('left');
  const frame: Frame = {
    back, posture: pose.posture, step: pose.posture === 'walk' || pose.gesture !== 'none' ? pose.step : 0,
    blinking: !back && pose.blinking, smiling: !back && pose.smiling, gesture: pose.gesture,
  };
  const key = `${JSON.stringify(look)}|${frame.back}|${frame.posture}|${frame.step}|${frame.blinking}|${frame.smiling}|${frame.gesture}|${left}|${outfitKey(outfit)}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const right = paint(look, frame, outfit);
    sprite = left ? mirrored(right) : right;
    sprites.set(key, sprite);
  }
  return sprite;
}

const heads = new Map<string, string>();
/** The face of a look as an image (for the speech bubbles). */
export function chibiHead(look: Look): string {
  const key = JSON.stringify(look);
  let url = heads.get(key);
  if (!url) {
    const sprite = chibiSprite(look, { direction: 'down-right', posture: 'stand', step: 0, blinking: false, smiling: true, gesture: 'none' });
    const { canvas, context } = artCanvas(18 * 2, 18 * 2);
    context.drawImage(sprite, HEAD.x, HEAD.y, HEAD.size, HEAD.size, 0, 0, 36, 36);
    url = canvas.toDataURL();
    heads.set(key, url);
  }
  return url;
}

/** The bust of the app icon and the favicon: head and shoulders, at art size (hair and a hat-free head fit in it). */
const BUST = { x: 3, y: HAT_ROWS + 4, width: 20, height: 21 };
/** The squircle the bust stands in, like the other icons of macOS, in art pixels. */
const ICON_GRID = 28;

/** The user's bust, at art size (BUST.width x BUST.height): what the macOS app's icon is made of. */
export function chibiBust(look: Look): HTMLCanvasElement {
  const sprite = chibiSprite(look, { direction: 'down-right', posture: 'stand', step: 0, blinking: false, smiling: true, gesture: 'none' });
  const { canvas, context } = artCanvas(BUST.width, BUST.height);
  context.drawImage(sprite, BUST.x, BUST.y, BUST.width, BUST.height, 0, 0, BUST.width, BUST.height);
  return canvas;
}

/** The bust on a squircle of the room at night, `scale` screen pixels per art pixel: the favicon. */
export function chibiIcon(look: Look, scale = 2): HTMLCanvasElement {
  const { canvas, context } = artCanvas(ICON_GRID * scale, ICON_GRID * scale);
  const middle = (ICON_GRID - 1) / 2;
  for (let y = 0; y < ICON_GRID; y++) for (let x = 0; x < ICON_GRID; x++) {
    if (Math.abs(x - middle) ** 4 + Math.abs(y - middle) ** 4 > 11.5 ** 4) continue;
    context.fillStyle = css(mix(rgb(ROOM_PALETTE.icon.top), rgb(ROOM_PALETTE.icon.bottom), y / (ICON_GRID - 1)));
    context.fillRect(x * scale, y * scale, scale, scale);
  }
  // the bust stands on the bottom edge, cut to the squircle
  context.save();
  context.beginPath();
  for (let y = 0; y < ICON_GRID; y++) {
    const half = (11.5 ** 4 - Math.abs(y - middle) ** 4) ** 0.25;
    if (!Number.isNaN(half)) context.rect(Math.ceil(middle - half) * scale, y * scale, (Math.floor(middle + half) - Math.ceil(middle - half) + 1) * scale, scale);
  }
  context.clip();
  context.drawImage(chibiBust(look), Math.floor((ICON_GRID - BUST.width) / 2) * scale, (ICON_GRID - BUST.height) * scale, BUST.width * scale, BUST.height * scale);
  context.restore();
  return canvas;
}

/** Where a piece of the wardrobe is worn: the square of the sprite its picture shows, in art pixels. `body` is the
 * whole person, `back` the whole person from behind (what is worn on the back). */
export type BodyPart = 'hat' | 'head' | 'chest' | 'legs' | 'feet' | 'body' | 'back';
const PARTS: Readonly<Record<BodyPart, { x: number; y: number; size: number }>> = {
  hat: { x: 1, y: 6, size: 24 }, head: { x: 4, y: 12, size: 18 }, chest: { x: 5, y: 27, size: 16 }, legs: { x: 6, y: 29, size: 14 }, feet: { x: 7, y: 33, size: 12 },
  body: { x: -2, y: 13, size: 30 }, back: { x: -2, y: 13, size: 30 },
};
/** The first row under the chin: below the head, the face stays see-through like the rest of the dummy. */
const NECK = 30;
/** Nothing on but plain trousers, which stay see-through like the body unless they are the piece shown. */
const DUMMY: Partial<Look> = {
  hair: 'none', beard: 'none', hat: 'none', headphones: false, accessory: 'none', glasses: null, sunglasses: false, watch: false, top: 'none', bottom: 'pants', shoes: 'barefoot',
};
const STANDING: Pose = { direction: 'down-right', posture: 'stand', step: 0, blinking: false, smiling: true, gesture: 'none' };
const FROM_BEHIND: Pose = { ...STANDING, direction: 'up-right' };

const pieces = new Map<string, string>();
/**
 * One piece of the wardrobe (`piece`, in the colours of `look`) on a see-through dummy, cut to the part of the body
 * it is worn on: the crew editor's choices. The body and the trousers are found by drawing the dummy again in other
 * colours (what changes is theirs), and drawn faint, their outline dotted; the piece keeps its own.
 */
export function chibiPiece(look: Look, piece: Partial<Look>, part: BodyPart): string {
  const key = `${JSON.stringify(look)}|${JSON.stringify(piece)}|${part}`;
  let url = pieces.get(key);
  if (url) return url;
  const dressed: Look = { ...look, ...DUMMY, ...piece };
  const pixels = (variant: Look) => {
    const sprite = chibiSprite(variant, part === 'back' ? FROM_BEHIND : STANDING);
    return sprite.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sprite.width, sprite.height).data;
  };
  const shown = pixels(dressed);
  const reskinned = pixels({ ...dressed, skin: dressed.skin === SKIN_TONES[0] ? SKIN_TONES[4] : SKIN_TONES[0] });
  const trousers = 'bottom' in piece ? null : pixels({ ...dressed, bottomColor: dressed.bottomColor === CLOTH_COLORS[0] ? CLOTH_COLORS[3] : CLOTH_COLORS[0] });
  const width = CANVAS.width;
  const below = part !== 'hat' && part !== 'head' && part !== 'body' && part !== 'back';
  const differs = (other: Uint8ClampedArray, at: number) => other[at] !== shown[at] || other[at + 1] !== shown[at + 1] || other[at + 2] !== shown[at + 2];
  const [inkRed, inkGreen, inkBlue] = rgb(INK.outline);
  type Kind = 'empty' | 'dummy' | 'line' | 'piece';
  const kindAt = (x: number, y: number): Kind => {
    if (x < 0 || y < 0 || x >= width || y >= CANVAS.height) return 'empty';
    const at = (y * width + x) * 4;
    if (shown[at + 3] < 40) return 'empty';
    if (differs(reskinned, at) || (trousers && differs(trousers, at)) || (below && y < NECK)) return 'dummy';
    return shown[at] === inkRed && shown[at + 1] === inkGreen && shown[at + 2] === inkBlue ? 'line' : 'piece';
  };
  const { x: left, y: top, size } = PARTS[part];
  // about 128 screen pixels whatever the part: sharp at twice the size it is shown
  const scale = Math.round(128 / size);
  const { canvas, context } = artCanvas(size * scale, size * scale);
  for (let y = top; y < top + size; y++) for (let x = left; x < left + size; x++) {
    const kind = kindAt(x, y);
    const at = (y * width + x) * 4;
    const around = [kindAt(x - 1, y), kindAt(x + 1, y), kindAt(x, y - 1), kindAt(x, y + 1)];
    if (kind === 'piece' || (kind === 'line' && around.includes('piece'))) context.fillStyle = `rgb(${shown[at]} ${shown[at + 1]} ${shown[at + 2]})`;
    // the dummy's outline, every other pixel: a dotted line
    else if (kind === 'line') { if ((x + y) % 2) continue; context.fillStyle = MANNEQUIN.line; }
    else if (kind === 'dummy') context.fillStyle = MANNEQUIN.body;
    else continue;
    context.fillRect((x - left) * scale, (y - top) * scale, scale, scale);
  }
  url = canvas.toDataURL();
  pieces.set(key, url);
  return url;
}

/** A look for someone without one (a sub-agent, a session named like nobody in the crew): stable for the same id. */
export function lookOfStranger(id: string): Look {
  const seed = hash(id);
  const pick = <T>(list: readonly T[], shift: number) => list[(seed >>> shift) % list.length];
  const hair = pick(HAIR_STYLES.filter((style) => style !== 'pigtails' && style !== 'mohawk' && !(WARDROBE_HAIR as readonly string[]).includes(style)), 0);
  // strangers keep to natural hair colours, everyday clothes, now and then a cap or a beanie
  const hairColor = pick(HAIR_COLORS.slice(0, 12), 6);
  return {
    skin: pick(SKIN_TONES, 3), eyes: pick(['round', 'round', 'wide', 'sleepy', 'lashes', 'happy'] as const, 29), hair, hairColor, beard: seed % 3 ? 'none' : pick(BEARD_STYLES.filter((style) => style !== 'long'), 9),
    beardColor: hairColor, glasses: seed % 4 === 0 ? INK.pupil : null, sunglasses: false, headphones: seed % 11 === 0,
    hat: seed % 7 === 0 ? pick(['cap', 'beanie'] as const, 25) : 'none', hatColor: pick(CLOTH_COLORS, 27),
    top: pick(['tshirt', 'vneck', 'polo', 'suit', 'shirt', 'hoodie', 'sweater', 'jacket'] as const, 12),
    topColor: pick(CLOTH_COLORS, 14), accentColor: pick(CLOTH_COLORS, 18), bottom: seed % 5 === 0 ? 'shorts' : 'pants', bottomColor: pick(CLOTH_COLORS, 20),
    shoes: pick(['sneakers', 'shoes', 'boots'] as const, 22), shoesColor: pick(CLOTH_COLORS, 23), watch: false, accessory: 'none',
  };
}

/** People drawn twice the size of their art pixels, like the furniture; `outfitFor`: what a festival puts on them. */
export function chibiSprites(lookFor: (personId: string) => Look, outfitFor: (personId: string) => Outfit = () => NO_OUTFIT): SpriteSource {
  return {
    height(pose, personId) {
      const hat = personId === undefined ? undefined : wornOutfit(lookFor(personId), outfitFor(personId)).hat;
      return (pose.posture === 'sit' ? 50 : 52) + (hat ? HAT_HEIGHT[hat] * ART_SCALE : 0);
    },
    draw(context, personId, pose, x, y) {
      const sprite = chibiSprite(lookFor(personId), pose, outfitFor(personId));
      const previous = context.imageSmoothingEnabled;
      context.imageSmoothingEnabled = false;
      context.drawImage(sprite, Math.round(x - FEET.x * ART_SCALE), Math.round(y - FEET.y * ART_SCALE), sprite.width * ART_SCALE, sprite.height * ART_SCALE);
      context.imageSmoothingEnabled = previous;
    },
    drawTypingHand(context, personId, feet, hand, step) {
      const look = lookFor(personId);
      if (look.top === 'blanket') return;
      const skin = tones(look.skin);
      const longSleeves = look.top === 'suit' || look.top === 'threePiece' || look.top === 'tracksuit';
      const own = wardrobeSleeve(look);
      const sleeve = costumeSleeve(look.top) ?? (own?.long ? own.colour : null);
      const forearm = sleeve ? tones(sleeve) : longSleeves ? tones(look.topColor) : skin;
      const palm = look.top === 'kakashiVest' ? tones(COSTUME_COLORS.glove) : skin;
      // the elbow, from where the mirrored sprite puts the near arm's last pixel (see paint: x 1-2, row 19, seated)
      const column = CANVAS.width - 1 - (ORIGIN.x + NEAR_ARM.x + 1);
      const elbow = { x: feet.x + (column - FEET.x + 1) * ART_SCALE, y: feet.y + (ORIGIN.y + NEAR_ARM.elbowY + 1 - FEET.y) * ART_SCALE };
      const end = { x: hand.x, y: hand.y - step * ART_SCALE };
      // chibi limbs are short and thick: a forearm three art pixels thick from the elbow to the keys, lit on top and
      // shaded underneath, with no outline across the arm
      const cell = (x: number, y: number, colour: string) => {
        context.fillStyle = colour;
        context.fillRect(Math.round(x / ART_SCALE) * ART_SCALE, Math.round(y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
      };
      const steps = Math.ceil(Math.hypot(end.x - elbow.x, end.y - elbow.y) / ART_SCALE);
      for (let index = 0; index <= steps; index++) {
        const x = elbow.x + (end.x - elbow.x) * index / steps, y = elbow.y + (end.y - elbow.y) * index / steps;
        cell(x, y - 2 * ART_SCALE, forearm.light);
        cell(x, y - ART_SCALE, forearm.base);
        cell(x, y, forearm.shade);
      }
      // a round mitten of a hand on the keys: four by three art pixels, its corners cut
      const mitten = ['.oo.', 'oooo', 'ssss'];
      for (const [line, row] of mitten.entries()) [...row].forEach((letter, column) => {
        if (letter === '.') return;
        cell(end.x + (column - 2) * ART_SCALE, end.y + (line - 2) * ART_SCALE, letter === 'o' ? palm.base : palm.shade);
      });
    },
    drawHead(context, personId, x, y, size) {
      const sprite = chibiSprite(lookFor(personId), { direction: 'down-right', posture: 'stand', step: 0, blinking: false, smiling: false, gesture: 'none' });
      context.drawImage(sprite, HEAD.x, HEAD.y, HEAD.size, HEAD.size, Math.round(x), Math.round(y), size, size);
    },
  };
}
