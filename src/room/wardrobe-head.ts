// The dress-up wardrobe's hairstyles, eyes, hats and what is worn on the face (shared/look.ts WARDROBE_*), drawn by
// chibi.ts on the head in its coordinates: the head is a ball centred on (8, 6.5), the eyes at x 6-7 and 10-11 on rows
// 6-7, the visible ear at x 1-2 from the front; from behind, the ear is at x 13-14 (`up` lowers it all when seated).
import { PEOPLE_INK as INK, WARDROBE_COLORS as W } from '../design/people-palette.ts';
import { WARDROBE_HATS, type Look } from '../../shared/look.ts';
import { grid, type Body } from './costumes.ts';
import { shadedBall, tones, type Tones } from './pixel-art.ts';

type Paint = (x: number, y: number, width: number, height: number, colour: string) => void;
type Dot = (x: number, y: number, colour: string) => void;

export type WardrobeHat = (typeof WARDROBE_HATS)[number];
export const isWardrobeHat = (hat: string | undefined): hat is WardrobeHat => hat !== undefined && (WARDROBE_HATS as readonly string[]).includes(hat);

const inside = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
/** Whether a pixel is on the head's own ball (chibi.ts): what shaved hair shows as stubble on. */
const onHead = (x: number, y: number) => inside(x, y, 8, 6.5, 6.4, 6.6);
/** The wave of long wavy hair: how far a row of it swings out. */
const wave = (y: number) => [0, 0, 1, 1, 0, 0, -1, -1][(y + 16) % 8];

/** Shaved hair: the shadow of the stubble on the skin, on the rows `from` to `to` of the head, except where `spared`. */
function stubble(P: Dot, b: Body, from: number, to: number, spared: (x: number, y: number) => boolean) {
  for (let y = from; y <= to; y++) for (let x = 1; x <= 15; x++) {
    if (onHead(x, y) && !spared(x, y)) P(x, y + b.up, onHead(x + 1, y) && onHead(x, y - 1) ? b.skin.shade : b.skin.dark);
  }
}

/** A plait: two strands crossing one row in two, `width` columns from row `from` to `to` (both included). */
function plait(P: Dot, x: number, from: number, to: number, width: number, hair: Tones) {
  // each half of a row slants the other way from the row above: the strands' chevrons
  for (let y = from; y <= to; y++) for (let column = 0; column < width; column++) {
    const half = column < width / 2 ? 0 : 1;
    P(x + column, y, (y + half) % 2 ? (column === half * (width - 1) ? hair.light : hair.base) : column === width - 1 - half * (width - 1) ? hair.dark : hair.shade);
  }
}

/** A rope of hair two columns wide, banded every third row, its tip catching the light. */
function rope(P: Dot, x: number, from: number, to: number, hair: Tones) {
  for (let y = from; y <= to; y++) { P(x, y, y % 3 === 0 ? hair.dark : hair.base); P(x + 1, y, y % 3 === 0 ? hair.dark : hair.shade); }
  P(x, to + 1, hair.light);
}

/** Liberty spikes: four tall points fanning out of a narrow band along the middle of the head. */
function spikes(P: Dot, up: number, hair: Tones) {
  for (const [base, tipX, tipY] of [[6, 3, -4], [7, 6, -6], [8, 9, -6], [9, 12, -4]] as const) {
    const steps = -tipY;
    for (let t = 0; t <= steps; t++) {
      const x = Math.round(base + ((tipX - base) * t) / steps), y = -t + up;
      P(x, y, t === steps ? hair.light : hair.base);
      if (t < steps / 2) P(x + 1, y, hair.shade);
    }
  }
}

/** The colours of the hair grids: hair tones, skin (k, K shaded, L lit), a tie, steel, gold. */
const hairPaints = (b: Body) => ({ l: b.hair.light, b: b.hair.base, s: b.hair.shade, d: b.hair.dark, k: b.skin.base, K: b.skin.shade, L: b.skin.light, r: INK.band, y: W.steel, g: W.gold });

/** Each wardrobe hairstyle drawn for itself, from the front and from behind: letter grids (see hairPaints), their top left corner. */
const HAIR_GRIDS: Readonly<Partial<Record<Look['hair'], { front: readonly [number, number, readonly string[]]; back: readonly [number, number, readonly string[]] }>>> = {
  // a tuft tied on top of the head, the rest combed back off the forehead
  topknot: {
    front: [3, -6, ['..l.l.b.', '..lbbbs.', '...bbs..', '...rrr..', '..bbbbb.', '.lbdbbdbs.', 'lbbbdbbbdss', 'bbbbbbbbbss', 'b.........s', 'b.........']],
    back: [2, -6, ['..l.l.b.....', '..lbbbs.....', '...bbs......', '...rrr......', '..bbbbbbb...', '.lbbdbbdbbs.', 'lbbbbdbdbbss', 'lbbbbbdbbbss', 'lbbbbbdbbbss', 'bbbbbbdbbbss', 'bbbbbbbbbbss', 'sbbbbbbbbbss', '.sbbbbbbbbs.', '.sbbbbbbbbs.', '..sbbbbbbs..', '...ssssss...']],
  },
  // short and spiky on top, the long part hangs behind the neck (paintWardrobeBehind)
  mullet: {
    front: [-1, -2, ['.......l.l.l.....', '.....lbbbbbbbb...', '....lbbbbbbbbbbs.', '...lbbbbbbbbbbbss', '...bbbbbbbbbbbsss', '...bbbbbbbbbbsss.', '....bbb.bb.b.bs..']],
    back: [1, -2, ['.....l.l.l.....', '...lbbbbbbbbs..', '..lbbbbbbbbbbs.', '.lbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.sbbbbbbbbbbss.', '..sbbbbbbbbbs..', '...bbbbbbbbs...', '...bbbbbbbbs...', '...bbbbbbbbs...', '..lbbbbbbbbss..', '..lbbbbbbbbss..', '.lb.bb.bb.bss..', '.l..l..l..s.s..']],
  },
  // the sides and the nape shaved, a long top swept over to the face's side
  undercut: {
    front: [2, -3, ['....llbb......', '..lllbbbbbb...', '.lbbbbbbbbbbb.', 'lbbbbbbbbbbbbs', 'sbbbbbbbbbbsss', '.dddssbbbbbsss', '........bbbss.', '.........bs...']],
    back: [2, -3, ['....llbbbb....', '..lbbbbbbbbb..', '.lbbbbbbbbbbbs', 'lbbbbbbbbbbbss', 'sbbbbbbbbbbbss', '.dsssssssssdd.']],
  },
  // a geisha's chignon: a high bun tied with a red ribbon, a smooth puff over the forehead, wings at the sides
  geisha: {
    front: [0, -6, ['.......lbbb.....', '.....lbbbbbbb..', '....bbbbdbbbbs.', '....sbbbdbbbss.', '.....rrrrrrr...', '..lbbbbbbbbbbs..', '.lbbbbbbbbbbbbs.', 'lbbbbbbbbbbbbbbs', 'lbbbbbb.bbbbbbss', 'lbb..........bss', 'lb...........bs.', '.b...........s..']],
    back: [0, -6, ['.......lbbb.....', '.....lbbbbbbb...', '....bbbbdbbbbs..', '....sbbbdbbbss..', '.....rrrrrrr....', '..lbbbbbbbbbbs..', '.lbbbbbbbbbbbbs.', 'lbbbbbbbbbbbbbbs', 'lbbbbbbbbbbbbbss', 'lbbbbbbbbbbbbbss', '.bbbbbbbbbbbbbs.', '.sbbbbbbbbbbbbs.', '..bbbbbbbbbbbs..', '..sbbbbbbbbbss..', '...bbbbbbbbbs...', '...sbbbbbbbbs...', '....lbbbbbbs....', '...lbbdddbbbs...', '...bbs...sbbs...', '....ss...ss.....']],
  },
  // an anime fringe in points; the tails hang at the sides (paintWardrobeBehind from the front)
  twinTails: {
    front: [0, -2, ['.....lbbbbb......', '...lbbbbbbbbbs...', '..lbbbbbbbbbbbs..', '.lbbbbbbbbbbbbss.', '.bbbbbbbbbbbbbss.', '.bbbbbbbbbbbbss..', '.bb.bbb.bbb.bs...', '.b...b...b...s...']],
    back: [1, -2, ['....lbbbbb.....', '..lbbbbbbbbbs..', '.lbbbbbbbbbbbs.', 'lbbbbbbbbbbbbss', 'bbbbbbbbbbbbbss', 'bbbbbbbbbbbbbss', 'bbbbbbbbbbbbbss', 'sbbbbbbbbbbbbss', '.sbbbbbbbbbbbs.', '..sbbbbbbbbbs..', '...ssssssssss..']],
  },
  // a long side fringe over one eye in sharp points, choppy layers at the back
  emo: {
    front: [-1, -2, ['.......lbbbb.....', '.....lbbbbbbbbs..', '...lbbbbbbbbbbbs.', '..lbbbbbbbbbbbbss', '.lbbbbbbbbbbbbsss', 'l.bbbbbbbbbbbbss.', '..bbbbblbbbbbs...', '..sbbbbbl........', '...bbbbbb........', '...sbbbbl........', '....bb.bb........', '....b...b........']],
    back: [1, -2, ['....l.l..l.....', '...lbbbbbbbbs..', '..lbbbbbbbbbbs.', '.lbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.sbbbbbbbbbbbs.', '..sbbbbbbbbbs..', '..b.sb.bs.bs...', '..b..b..s..s...']],
  },
  // a monk's tonsure: a bare crown in a ring of hair cut straight
  tonsure: {
    front: [2, -1, ['...LLkkkk...', '..LkkkkkkkK..', '.bbkkkkkkKKbs', 'lbbbbbbbbbbbs', 'lbbbbbbbbbbbs', 'bb.........ss', 'bb..........', 'b...........']],
    back: [1, -1, ['.....LLkkk.....', '...lbkkkkkKbs..', '..lbbbkkkKbbbs.', '.lbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.bbbbbbbbbbbbss', '.sbbbbbbbbbbbs.', '..sbbbbbbbbbs..', '...ssssssssss..']],
  },
  // dreadlocks: the roots parted in rows; the ropes are drawn after (paintWardrobeHair)
  dreadlocks: {
    front: [0, -2, ['.....lbdbdb.....', '...lbdbbdbbdbs..', '..lbbdbbdbbdbss.', '.lbdbbdbbdbbdss.', '.bbdbbdbbdbbdbs.', '.bb.bb.bb.bb.bs.', '.bb..b..b..b.bs.']],
    back: [1, -2, ['....lbdbdb.....', '..lbdbbdbbdbs..', '.lbbdbbdbbdbss.', 'lbdbbdbbdbbdbss', 'bbdbbdbbdbbdbss']],
  },
};

/** A wardrobe hairstyle, over the head (chibi.ts draws the everyday ones). Each has its own silhouette, front and back. */
export function paintWardrobeHair(R: Paint, P: Dot, look: Look, b: Body) {
  const { up, hair } = b;
  const front = !b.back;
  const paints = hairPaints(b);
  const drawn = HAIR_GRIDS[look.hair];
  // what is drawn before the grid: shaved skin
  if (look.hair === 'undercut') stubble(P, b, front ? 1 : 3, front ? 5 : 11, (x) => front && x > 5 && x < 13);
  if (drawn) { const [x, y, lines] = front ? drawn.front : drawn.back; grid(P, x, y + up, lines, paints); }
  switch (look.hair) {
    case 'dreadlocks':
      if (front) for (const [x, from, to] of [[-3, 3, 11], [0, 3, 14], [13, 3, 12], [16, 4, 10]] as const) rope(P, x, from + up, to + up, hair);
      else {
        // the ropes over the back of the head, dark hair between them
        for (let y = 3; y <= 11; y++) for (const x of [3, 6, 9, 12]) if (onHead(x, y)) P(x, y + up, hair.dark);
        for (const [x, to] of [[1, 13], [4, 15], [7, 16], [10, 15], [13, 13]] as const) rope(P, x, 3 + up, to + up, hair);
      }
      break;
    // shaved sides, liberty spikes out of a narrow band from the forehead to the nape
    case 'punkSpikes': {
      const band = (x: number) => x >= 6 && x <= 9;
      stubble(P, b, 0, front ? 5 : 11, (x, y) => band(x) || (front && y > 2 && x > 4 && x < 13));
      for (let y = -1; y <= (front ? 3 : 11); y++) {
        const [from, to] = front && y >= 2 ? [7, 8] : [6, 9];
        for (let x = from; x <= to; x++) P(x, y + up, x === from ? hair.light : x === to ? hair.shade : hair.base);
      }
      spikes(P, up, hair);
      break;
    }
    // long hair falling in waves from a middle parting
    case 'wavy':
      if (front) {
        grid(P, 1, -2 + up, ['.....lbdbb.....', '...lbbbdbbbbs..', '..lbbbbdbbbbbs.', '.lbbbbbbdbbbbss', '.bbbbb...sbbbss', '.bbbs......sbbs', '.bbs........sbs'], paints);
        for (let y = 3; y <= 15; y++) {
          R(wave(y), y + up, 3, 1, hair.base); P(wave(y), y + up, hair.light);
          R(13 - wave(y), y + up, 3, 1, hair.shade); P(15 - wave(y), y + up, hair.dark);
        }
        P(1 + wave(16), 16 + up, hair.light); P(14 - wave(16), 16 + up, hair.shade);
      } else {
        for (let y = -1; y <= 16; y++) {
          const [from, to] = y < 6 ? [8 - Math.sqrt(Math.max(0, 1 - ((y + 0.5 - 5.5) / 6.6) ** 2)) * 7.1, 8 + Math.sqrt(Math.max(0, 1 - ((y + 0.5 - 5.5) / 6.6) ** 2)) * 7.1].map(Math.round) : [1 + wave(y), 15 - wave(y)];
          for (let x = from; x <= to; x++) P(x, y + up, x < from + 2 ? hair.light : x > to - 2 ? hair.shade : hair.base);
          if (y >= 3) { P(5 + wave(y), y + up, hair.dark); P(10 - wave(y), y + up, hair.dark); }
        }
        for (let x = 2; x <= 14; x += 3) P(x, 17 + up, hair.base);
      }
      break;
    // tight little curls close to the head: a bumpy outline, curls catching the light in staggered rows
    case 'coils': {
      const [cy, ry, last] = front ? [2.6, 3.9, 4] : [5, 6.6, 11];
      for (let y = -2; y <= last; y++) for (let x = 0; x <= 16; x++) {
        if (!inside(x, y, 8, cy, 7.3, ry)) continue;
        const edge = !inside(x - 1, y, 8, cy, 7.3, ry) || !inside(x + 1, y, 8, cy, 7.3, ry) || !inside(x, y - 1, 8, cy, 7.3, ry);
        if (edge && (x + y) % 2) continue;
        const curl = (x + (Math.floor((y + 8) / 2) % 2) * 2) % 4;
        P(x, y + up, (y + 8) % 2 === 0 && curl === 0 ? hair.light : (y + 8) % 2 === 1 && curl === 1 ? hair.dark : x > 11 ? hair.shade : hair.base);
      }
      if (front) { R(3, 4 + up, 10, 1, hair.base); P(2, 5 + up, hair.base); P(2, 6 + up, hair.shade); }
      break;
    }
    // high twin tails, tied
    case 'twinTails':
      if (b.back) for (const [x, lean] of [[-2, -1], [15, 1]] as const) for (let y = 1; y <= 19; y++) {
        const sway = Math.round(Math.sin(y / 4) * 0.8) + (y > 8 ? lean : 0);
        R(x + sway, y + up, 3, 1, y % 5 === 0 ? hair.dark : hair.shade);
      }
      R(-1, 0 + up, 2, 2, W.neonPink); R(15, 0 + up, 2, 2, W.neonPink);
      break;
    // kanzashi pins through the bun, a red flower on one
    case 'geisha':
      for (let i = 0; i < 5; i++) P(11 + i, -3 + up - Math.floor(i / 2), W.gold);
      P(15, -6 + up, W.petalRed); P(16, -6 + up, W.petalPink); P(16, -5 + up, W.petalRed);
      for (let i = 0; i < 3; i++) P(4 - i, -3 + up - i, W.gold);
      P(1, -6 + up, W.petalPink);
      break;
    // shaved sides, a plait from the forehead over the crown down to a long braid with steel rings
    case 'vikingBraids': {
      const crest = (x: number) => x >= 6 && x <= 9;
      stubble(P, b, 0, front ? 5 : 11, (x, y) => crest(x) || (front && y > 2 && x > 4 && x < 13));
      if (front) plait(P, 6, -1 + up, 3 + up, 4, hair);
      else { plait(P, 6, -1 + up, 9 + up, 4, hair); R(6, 10 + up, 4, 1, W.steel); plait(P, 7, 11 + up, 17 + up, 2, hair); R(7, 14 + up, 2, 1, W.steel); R(7, 18 + up, 2, 1, INK.band); }
      break;
    }
  }
}

/** A wardrobe's eyes, drawn over the brows (chibi.ts draws the everyday ones). Blinking, only a cyborg's LED stays lit. */
export function paintWardrobeEyes(R: Paint, P: Dot, look: Look, b: Body, blinking: boolean) {
  const up = b.up;
  const round = (x: number) => { R(x, 6 + up, 2, 2, INK.eyeWhite); R(x + 1, 6 + up, 1, 2, INK.pupil); };
  if (look.eyes === 'cyborg') {
    if (!blinking) round(6);
    R(9, 5 + up, 4, 4, W.steel); R(9, 5 + up, 4, 1, W.steelLight); P(12, 8 + up, W.rivet); P(9, 8 + up, W.rivet);
    R(10, 6 + up, 2, 2, W.led); P(10, 6 + up, W.ledGlow);
    return;
  }
  if (blinking) return;
  for (const x of [6, 10]) {
    const inner = x === 6 ? x + 1 : x;
    switch (look.eyes) {
      // frowning: brows slanted down towards the nose, the eyes narrowed under them
      case 'angry':
        R(x, 6 + up, 2, 2, INK.eyeWhite); P(inner, 7 + up, INK.pupil); P(inner, 6 + up, b.skin.shade);
        break;
      // one open, one shut in an arch
      case 'wink':
        if (x === 6) round(x);
        else { P(x, 7 + up, INK.pupil); P(x + 1, 6 + up, INK.pupil); P(x + 2, 7 + up, INK.pupil); }
        break;
      // heavy lids and dark rings under the eyes
      case 'tired': R(x, 6 + up, 2, 1, b.skin.shade); R(x, 7 + up, 2, 1, INK.eyeWhite); P(x + 1, 7 + up, INK.pupil); R(x, 8 + up, 2, 1, W.eyeBag); break;
      // a little star in each eye
      case 'starry': {
        const cx = x === 6 ? 6 : 11;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) P(cx + dx, 7 + dy + up, W.star);
        P(cx, 7 + up, W.starLight);
        break;
      }
      // big anime eyes: a dark top lash, a coloured iris, a white sparkle
      case 'sparkly':
        R(x, 6 + up, 2, 1, INK.pupil); R(x, 7 + up, 2, 2, W.iris); P(x, 8 + up, W.irisLight); P(x + 1, 7 + up, INK.eyeWhite);
        break;
      // laughing so hard the tears fly: arched eyes, a drop out of each
      case 'laughing':
        P(x - 1 + (x === 6 ? 0 : 1), 7 + up, INK.pupil); P(x + (x === 6 ? 0 : 1), 6 + up, INK.pupil); P(x + 1 + (x === 6 ? 0 : 1), 7 + up, INK.pupil);
        P(x === 6 ? 4 : 13, 6 + up, W.tear); P(x === 6 ? 3 : 14, 7 + up, W.tear); P(x === 6 ? 3 : 14, 8 + up, W.tear);
        break;
    }
  }
}

/** A wardrobe hat; `top`: the highest row of the hair (chibi.ts HAIR_TOP, seated included), `colour`: the look's hat colour. */
export function paintWardrobeHat(R: Paint, P: Dot, hat: WardrobeHat, colour: string, top: number, back: boolean, up: number) {
  const own = tones(colour);
  const paints = { c: own.base, l: own.light, v: own.shade, d: own.dark, g: W.gold, y: W.straw, Y: tones(W.straw).light, V: tones(W.straw).shade, w: W.white, s: W.steel, k: W.rivet };
  const rows = (x: number, y: number, lines: readonly string[]) => grid(P, x, y, lines, paints);
  switch (hat) {
    // a fishbowl helmet: a glass dome (its tint is behind the head, see wardrobe.ts) with a white rim, a steel collar
    case 'spaceHelmet': {
      const cy = 5.5 + up, r = 9.4;
      for (let y = Math.floor(cy - r); y < 12 + up; y++) for (let x = -2; x <= 18; x++) {
        const distance = Math.hypot(x + 0.5 - 8, y + 0.5 - cy);
        if (distance <= r && distance > r - 1.2) P(x, y, x + y < 8 + up ? W.white : W.whiteShade);
      }
      R(1, 12 + up, 15, 2, W.steel); R(1, 12 + up, 15, 1, W.steelLight);
      if (!back) { P(3, -1 + up, W.lensShine); P(2, 0 + up, W.lensShine); P(1, 2 + up, W.lensShine); }
      break;
    }
    // a tricorn: its brim turned up in three points, gold piping
    // a tricorn: the crown behind, the brim turned up in two horns at the sides and a point in front, gold piping
    case 'tricorne': rows(-1, top - 5, [
      'g.................g', 'lg......vvv......gl', 'llg...vvvlvvv...gll', 'cllgggvvvvvvvgggllc', '.cclllllllllllllcc.', '..cccccccccccccccc.', '...gggcccccccggg...', '......ggggggg......',
    ]); break;
    // a tall pointed hat, its tip flopping over, a gold band and a star, a wide brim
    case 'wizardHat': rows(-1, top - 10, [
      '..........cv......', '.........cc.......', '........ccv.......', '.......cccv.......', '.......clcv.......', '......cclccv......', '......cccgcv......',
      '.....ccggggcv.....', '.....cccgcccv.....', '....gggggggggg....', '.cccccccccccccccv.', 'ccccccccccccccccvv',
    ]); break;
    // a great helm: a steel bucket over the whole head, an eye slit, breathing holes
    case 'greatHelm': {
      for (let y = -1; y <= 12; y++) {
        const left = y === -1 ? 3 : y === 0 ? 2 : 1, right = y === -1 ? 13 : y === 0 ? 14 : 15;
        R(left, y + up, right - left + 1, 1, W.steel); P(left, y + up, W.steelLight); P(left + 1, y + up, W.steelLight); P(right, y + up, W.steelDark);
      }
      R(0, 12 + up, 17, 1, W.steelDark);
      if (back) { R(8, -1 + up, 1, 13, W.steelDark); break; }
      R(3, 6 + up, 12, 1, W.rivet); R(9, -1 + up, 1, 7, W.steelLight); R(9, 7 + up, 1, 5, W.steelLight);
      for (const [x, y] of [[11, 9], [13, 9], [12, 10], [11, 11], [13, 11]]) P(x, y + up, W.rivet);
      break;
    }
    // a white headband, a red sun on the forehead, its ends flying behind
    case 'hachimaki':
      R(2, 3 + up, 13, 2, W.white); R(2, 4 + up, 13, 1, W.whiteShade);
      if (back) { R(7, 5 + up, 2, 1, W.white); P(6, 6 + up, W.white); P(9, 6 + up, W.white); P(5, 7 + up, W.whiteShade); P(10, 7 + up, W.whiteShade); break; }
      R(8, 3 + up, 2, 2, W.red);
      for (const [x, y] of [[1, 4], [0, 5], [-1, 5], [-2, 6], [0, 6], [-1, 7]]) P(x, y + up, W.white);
      break;
    // a wide floppy straw hat for the beach, a ribbon in the hat's colour, a flower
    case 'sunHat': grid(P, -3, top - 3, [
      '.......YyyyyyY.......', '......Yyyyyyyyy......', '......ccccccccppp....', '..YYyyyyyyyyyyyyyyV..', 'Yyyyyyyyyyyyyyyyyyyyy', '.VVVV...........VVVV.',
    ], { ...paints, p: W.petalPink }); break;
    // a headband with two cat ears, glowing neon
    case 'catEars':
      for (const x of [2, 10]) grid(P, x, top - 3, ['p...', 'pp..', 'pcp.', 'pccp'].map((line) => (x === 10 ? [...line].reverse().join('') : line)), { p: W.neonPink, c: W.neonCyan });
      R(3, top + 1, 11, 1, W.neonPink);
      break;
    // a ring of little flowers and leaves
    case 'flowerCrown': {
      const petals = [W.petalPink, W.petalWhite, W.petalYellow, W.petalPurple, W.petalRed];
      R(2, top + 1, 13, 1, W.leaf);
      for (let x = 2, index = 0; x <= 13; x += 3, index++) { const petal = petals[index % petals.length]; R(x, top, 2, 2, petal); P(x + 1, top + 1, W.petalYellow); P(x + 2, top + 1, W.leaf); }
      break;
    }
    // a cowboy hat: a dented crown, a dark band, the brim curling up at both ends
    case 'cowboyHat': rows(-2, top - 4, ['......cc.cc......', '.....clccccc.....', '.....clcccccv....', '.....dddddddd....', 'c...ccccccccc...v', '.ccccccccccccccvv.', '..vvvvvvvvvvvvv..']); break;
  }
}

/**
 * What goes over the hair, under the hat: frowning brows (over a fringe, as in anime), and a wardrobe accessory worn
 * on the face, the neck or a shoulder, or held.
 */
export function paintWardrobeOverHair(R: Paint, P: Dot, look: Look, b: Body, glasses: boolean) {
  const up = b.up, front = !b.back;
  if (look.eyes === 'angry' && front && !glasses) for (const [x, y] of [[4, 4], [5, 4], [6, 5], [7, 5], [13, 4], [12, 4], [11, 5], [10, 5]]) P(x, y + up, INK.pupil);
  switch (look.eyeGear) {
    // a cyber visor across the eyes, glowing
    case 'visor':
      if (!front) { R(1, 5 + up, 15, 2, W.rubber); break; }
      R(2, 5 + up, 13, 3, W.rubber); R(3, 5 + up, 11, 2, tones(W.neonCyan).shade); R(3, 5 + up, 11, 1, W.neonCyan); P(5, 6 + up, W.lensShine);
      break;
    // a diving mask and its snorkel
    case 'goggles':
      if (!front) { R(1, 5 + up, 15, 2, W.rubber); R(1, -1 + up, 1, 7, W.snorkel); break; }
      R(4, 4 + up, 10, 5, W.rubber); R(5, 5 + up, 8, 3, W.lens); P(6, 5 + up, W.lensShine); P(7, 5 + up, W.lensShine); R(8, 8 + up, 2, 1, W.rubber);
      R(1, 5 + up, 3, 2, W.rubber);
      R(15, -1 + up, 1, 10, W.snorkel); R(13, 9 + up, 3, 1, W.snorkel);
      break;
    // a black patch over one eye, its string round the head
    case 'eyePatch':
      if (!front) { for (let x = 1; x <= 15; x++) P(x, 4 + up - Math.floor((x - 1) / 8), W.strap); break; }
      R(5, 5 + up, 4, 4, W.strap); P(5, 5 + up, b.skin.base); P(8, 8 + up, b.skin.base); P(5, 8 + up, b.skin.base);
      for (const [x, y] of [[4, 5], [3, 4], [2, 4], [9, 5], [10, 4], [11, 4], [12, 3], [13, 3], [14, 3]]) P(x, y + up, W.strap);
      break;
    // a monocle on its gold chain
    case 'monocle':
      if (!front) break;
      for (const [x, y] of [[10, 4], [11, 4], [9, 5], [12, 5], [9, 6], [12, 6], [9, 7], [12, 7], [10, 8], [11, 8]]) P(x, y + up, W.gold);
      for (const [x, y] of [[12, 9], [13, 10], [13, 11], [12, 12]]) P(x, y + up, W.goldDark);
      break;
  }
  // neon earbuds in the ears
  if (look.faceGear === 'earbuds') {
    if (front) { R(1, 6 + up, 2, 2, W.neonPink); P(2, 6 + up, W.neonCyan); P(1, 8 + up, W.neonPink); }
    else { R(13, 6 + up, 2, 2, W.neonPink); P(13, 6 + up, W.neonCyan); P(14, 8 + up, W.neonPink); }
  }
  // a wizard's staff in the far hand, the parrot's shoulder free, a glowing orb on top; put down while that hand is raised
  if (look.handGear === 'staff' && look.top !== 'blanket' && !b.typing && !b.raising) {
    const x = front ? 16 : -1, shift = front ? -b.swing : b.swing;
    R(x, 2 + up + shift, 1, 20 - up, W.wood); R(x, 22 + shift, 1, 3, W.woodDark);
    shadedBall(P, x + 0.5, 0.5 + up + shift, 1.8, 1.8, tones(W.neonCyan));
    P(x, 0 + up + shift, W.lensShine);
  }
  // a lit lantern hanging from a short pole in the same hand, at chest height; put down too while that hand is raised
  if (look.handGear === 'lantern' && look.top !== 'blanket' && !b.typing && !b.raising) {
    const hand = front ? 14 : 1, side = front ? 1 : -1, row = 19 + up + (front ? -b.swing : b.swing);
    [[0, 0], [1, -1], [1, -2], [2, -3], [2, -4], [3, -5]].forEach(([dx, dy], index) => {
      P(hand + side * dx, row + dy, index % 2 ? W.woodDark : W.wood);
    });
    const x = hand + side * 3;
    P(x, row - 4, W.strap); R(x - 1, row - 3, 3, 1, W.steelDark); R(x - 1, row - 2, 3, 2, W.flameCore); P(x, row - 1, W.flame); R(x - 1, row, 3, 1, W.steelDark);
  }
  // a knitted scarf round the neck in the accent colour, striped, one end hanging down
  if (look.neckGear === 'scarf') {
    const wool = tones(look.accentColor);
    R(3, 12 + up, 10, 2, wool.base); R(3, 13 + up, 10, 1, wool.shade);
    for (let x = 4; x < 13; x += 3) P(x, 12 + up, wool.light);
    const end = front ? 9 : 5;
    for (let row = 14; row <= 18; row++) R(end, row + up, 2, 1, row % 2 ? W.white : wool.base);
    P(end, 19 + up, wool.shade); P(end + 1, 19 + up, wool.shade);
  }
  // a garland of flowers round the neck
  if (look.neckGear === 'lei') {
    const petals = [W.petalPink, W.petalYellow, W.petalWhite, W.petalRed, W.petalPurple];
    const spots = front ? [[3, 13], [5, 14], [7, 15], [9, 15], [11, 14], [12, 13]] : [[3, 13], [5, 13], [7, 13], [9, 13], [11, 13]];
    spots.forEach(([x, y], index) => { R(x, y + up, 2, 1, petals[index % petals.length]); P(x + (index % 2), y + 1 + up, petals[(index + 2) % petals.length]); });
  }
  // a parrot on the shoulder
  if (look.shoulderGear === 'parrot') {
    const lines = front ? ['.rr.', 'rwry', 'rrr.', 'grrr', 'ggrr', '.bb.', '.b..'] : ['.rr.', 'rrrr', 'grrr', 'gggr', 'gggr', '.bb.', '..b.'];
    grid(P, front ? -2 : 15, 8 + up, lines, { r: W.red, w: INK.eyeWhite, y: W.yellow, g: W.green, b: W.blue });
  }
  // a ginger cat sitting on the shoulder, its tail curled down the arm
  if (look.shoulderGear === 'cat') {
    const lines = front
      ? ['o...o', 'oo.oo', 'oosoo', 'okoko', 'owpwo', '.www.', 'ooooo', 'soooo', 's....', 's....']
      : ['o...o', 'oo.oo', 'ooooo', 'ososo', 'ooooo', '.ooo.', 'ooooo', 'oosoo', '....s', '....s'];
    grid(P, front ? -3 : 14, 6 + up, lines, { o: W.orange, s: tones(W.orange).shade, w: W.white, k: INK.pupil, p: W.petalPink });
  }
  // a katana at the hip, its sheath trailing: the far side from the front, the near one from behind
  if (look.waistGear === 'katana' && look.top !== 'blanket') {
    for (let t = 0; t < 9; t++) {
      const dx = Math.floor(t * 0.6);
      P(b.back ? 4 - dx : 11 + dx, 14 + t + up, t < 2 ? (t % 2 ? W.white : W.strap) : t === 2 ? W.gold : W.sheath);
    }
  }
}
