// The room dressed as a beach bar on a sandy islet (themes/kit.ts), at art resolution like backdrop.ts. The walls are
// low: a half wall of painted planks with a bamboo rail, open above it on the sea, bamboo posts holding a fringe of palm
// thatch and a string of lights; the floor is sand with plank decks and a straw mat where the office has its rugs; the
// slab is the islet's edge, sand on rock, water falling from it. The openings show boats, an islet and the sun's path on
// the sea; the clock is a life ring, the door a bamboo arch with a bead curtain, the lounge's screen plays a surf film.
// The furniture is in beach-furniture.ts, the page behind in beach-sky.ts.
import { BEACH_PALETTE as B } from '../../design/theme-beach.ts';
import { ROOM, type Layout, type Rug, type WallItem } from '../../../shared/room-layout.ts';
import { depthOf, toScreen, toTile, type Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting } from '../lighting.ts';
import { ART_SCALE, fillPolygon, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { WALL_EFFECT, type ThemeEffect, type ThemeKit, type ThemeLight } from './kit.ts';
import { WALL, line, onWallAt, roomPointOnWall, type Context, type Wall } from '../wall-art.ts';
import { BEACH_FURNITURE, furnitureEffects, furnitureLights } from './beach-furniture.ts';
import { paintBeachSky, paintGulls } from './beach-sky.ts';

/** The half walls' top, the sea seen over them (its horizon at `high`), the bottom of the thatch, in art pixels. */
const RAIL = 15;
const SEA = { low: RAIL + 2, high: 23 };
const THATCH = 40;
const LENGTH: Readonly<Record<Wall, number>> = { back: ROOM.width, left: ROOM.depth };
/** A bamboo post is three art pixels wide. */
const POST = 3 / 8;

export function dot(context: Context, point: Point, colour: string, alpha = 1) {
  context.globalAlpha = alpha;
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
  context.globalAlpha = 1;
}

const quad = (context: Context, wall: Wall, from: number, to: number, low: number, high: number, colour: string) =>
  fillPolygon(context, [onWallAt(wall, from, low), onWallAt(wall, to, low), onWallAt(wall, to, high), onWallAt(wall, from, high)], colour);

/** Clears part of a wall: the page's sky shows through. */
function open(context: Context, wall: Wall, from: number, to: number, low: number, high: number) {
  context.globalCompositeOperation = 'destination-out';
  quad(context, wall, from, to, low, high, B.foam);
  context.globalCompositeOperation = 'source-over';
}

/** Smooth noise from 0 to 1: random values on a grid of `size` pixels, blended between them. */
export function noise(key: string, x: number, y: number, size: number): number {
  const gx = Math.floor(x / size), gy = Math.floor(y / size), fx = x / size - gx, fy = y / size - gy;
  const at = (i: number, j: number) => pick(`${key}${gx + i},${gy + j}`, 1000) / 1000;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * ease(fx), bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * ease(fx);
  return top + (bottom - top) * ease(fy);
}

/* The walls */

/** The half wall: painted boards three pixels high, their joints staggered, the paint worn to white in patches; a bamboo rail on top. */
function paintBoards(context: Context, wall: Wall) {
  const columns = LENGTH[wall] * 8;
  const colours = wall === 'back' ? B.boards : B.boardsSide;
  for (let column = 0; column < columns; column++) for (let z = 0; z < RAIL; z++) {
    const board = Math.floor(z / 3);
    const joint = (column + board * 13) % 23 === 0;
    let colour = z % 3 === 0 || joint ? B.boardSeam : colours[board % 2];
    const worn = noise(`wash${wall}`, column, z * 2.5, 6) + (z % 3 === 2 ? 0.08 : 0);
    if (colour !== B.boardSeam && worn > 0.66 && pick(`w${wall}${column},${z}`, 3)) colour = B.whitewash;
    if (z < 1) colour = B.baseboard;
    dot(context, onWallAt(wall, column / 8, z), colour);
  }
  for (let column = 0; column < columns; column++) {
    const node = column % 14 === 0;
    dot(context, onWallAt(wall, column / 8, RAIL), node ? B.bambooNode : B.bamboo);
    dot(context, onWallAt(wall, column / 8, RAIL + 1), node ? B.bambooNode : B.bambooLight);
  }
}

/** The sea seen over the half wall, from `from` to `to` along it: turquoise near, deep blue at the horizon, lines of waves and foam. */
function paintSea(context: Context, wall: Wall, from: number, to: number, low = SEA.low) {
  for (let column = Math.round(from * 8); column < Math.round(to * 8); column++) for (let z = low; z <= SEA.high; z++) {
    const share = (z - SEA.low) / (SEA.high - SEA.low);
    let colour = z === SEA.high ? B.horizon : share < 0.3 ? B.seaNear : share < 0.65 ? B.seaMiddle : B.seaFar;
    const dash = Math.floor((column + z * 5) / (z < SEA.low + 2 ? 3 : 4));
    if (z < SEA.high && pick(`wave${wall}${dash},${z}`, z < SEA.low + 2 ? 6 : 11) === 0) colour = z <= SEA.low ? B.foam : B.seaLine;
    dot(context, onWallAt(wall, column / 8, z), colour);
  }
}

/** A bamboo post on a wall, lit on its left, a ring at each node. */
function post(context: Context, wall: Wall, along: number, low: number, high: number) {
  const colours = [B.bambooLight, B.bamboo, tones(B.bamboo).shade];
  for (let z = low; z < high; z++) {
    const node = (z - low) % 8 === 7;
    colours.forEach((colour, column) => { dot(context, onWallAt(wall, along + column / 8, z), node ? B.bambooNode : colour); });
  }
}

/** The palm thatch along the top of a wall: two layers of fronds, ragged at their ends, bound by a rope along the top. */
function paintThatch(context: Context, wall: Wall) {
  const columns = LENGTH[wall] * 8;
  for (let column = 0; column < columns; column++) {
    const upper = WALL - 5 - pick(`upper${wall}${column}`, 3);
    const lower = THATCH - pick(`fringe${wall}${column}`, 3) - (column % 6 === 3 ? 1 : 0);
    for (let z = lower; z <= WALL; z++) {
      const layer = z >= upper ? 'u' : 'l';
      const strand = B.thatch[pick(`straw${wall}${layer}${column}`, B.thatch.length)];
      let colour = z === lower || z === upper ? B.thatchDark : strand;
      if (z === upper - 1 || (z === lower + 1 && pick(`tip${wall}${column}`, 2))) colour = tones(strand).shade;
      if (z === WALL - 1) colour = B.rope;
      dot(context, onWallAt(wall, column / 8, z), colour);
    }
  }
}

/** The string of lights hung under the thatch: where each bulb is, sagging between hooks two tiles apart. */
export interface Bulb { wall: Wall; along: number; z: number }
export function bulbsOf(): Bulb[] {
  const bulbs: Bulb[] = [];
  for (const wall of ['back', 'left'] as const) for (let along = 0.5; along < LENGTH[wall] - 0.3; along += 0.5) {
    bulbs.push({ wall, along, z: THATCH - 3 - Math.round(Math.sin(((along % 2) / 2) * Math.PI) * 3) });
  }
  return bulbs;
}

function paintLightString(context: Context) {
  for (const wall of ['back', 'left'] as const) for (let column = 2; column < LENGTH[wall] * 8 - 2; column++) {
    const along = column / 8;
    dot(context, onWallAt(wall, along, THATCH - 2 - Math.sin(((along % 2) / 2) * Math.PI) * 3), B.thatchDark);
  }
  for (const bulb of bulbsOf()) dot(context, onWallAt(bulb.wall, bulb.along, bulb.z), B.bulbOff);
}

/** Where the posts of a wall stand: its ends, either side of each opening and of the door, under the clock, and between when far apart. */
function postsOf(wall: Wall, layout: Layout): number[] {
  const posts = [0, LENGTH[wall] - POST];
  if (wall === 'back') for (const item of layout.wallItems) {
    if (item.kind === 'window') posts.push(item.fromX - POST, item.fromX + item.width);
    if (item.kind === 'clock') posts.push(item.fromX + item.width / 2 - POST / 2);
  }
  else posts.push(layout.door.y - 0.2 - POST, layout.door.y + 1.5);
  posts.sort((a, b) => a - b);
  for (let index = 1; index < posts.length; index++) {
    if (posts[index] - posts[index - 1] > 4.5) posts.splice(index, 0, (posts[index] + posts[index - 1]) / 2);
  }
  return posts;
}

export function paintBeachWalls(context: Context, layout: Layout) {
  for (const wall of ['back', 'left'] as const) {
    open(context, wall, 0, LENGTH[wall], RAIL + 2, WALL + 1);
    paintBoards(context, wall);
    paintSea(context, wall, 0, LENGTH[wall]);
    // under the screen of the lounge, nothing: it hangs from the thatch on ropes
    for (const along of postsOf(wall, layout)) post(context, wall, along, RAIL + 2, THATCH);
    paintThatch(context, wall);
  }
  paintLightString(context);
}

/* The floor */

const inRug = (rug: Rug, x: number, y: number) => x >= rug.x && x < rug.x + rug.width && y >= rug.y && y < rug.y + rug.depth;

/** A deck of planks along x, two a tile, their joints staggered, raised a pixel above the sand. */
function paintDeck(context: Context, rug: Rug) {
  const { x, y, width, depth } = rug;
  const corner = (along: number, across: number) => toArt({ x: along, y: across });
  line(context, { x: corner(x, y + depth).x, y: corner(x, y + depth).y + 1 }, { x: corner(x + width, y + depth).x, y: corner(x + width, y + depth).y + 1 }, tones(B.plankSeam).dark);
  line(context, { x: corner(x + width, y).x, y: corner(x + width, y).y + 1 }, { x: corner(x + width, y + depth).x, y: corner(x + width, y + depth).y + 1 }, tones(B.plankSeam).dark);
  for (let row = 0; row < depth * 2; row++) {
    const top = y + row / 2;
    let along = x - pick(`stagger${row}`, 4) * 0.5;
    while (along < x + width) {
      const length = 1.5 + pick(`plank${row},${along}`, 3) * 0.5;
      const from = Math.max(x, along), to = Math.min(x + width, along + length);
      fillPolygon(context, [corner(from, top), corner(to, top), corner(to, top + 0.5), corner(from, top + 0.5)], B.planks[pick(`deck${row},${along}`, B.planks.length)]);
      line(context, corner(from, top), corner(to, top), B.plankLight);
      if (to < x + width) line(context, corner(to, top), corner(to, top + 0.5), B.plankSeam);
      along += length;
    }
  }
  const edges = [corner(x, y), corner(x + width, y), corner(x + width, y + depth), corner(x, y + depth)];
  edges.forEach((point, index) => { line(context, point, edges[(index + 1) % 4], B.plankSeam); });
}

/** A pixel of the straw mat: a weave of two straws, a border of two stripes. */
function matAt(rug: Rug, x: number, y: number, ax: number, ay: number): string {
  const edge = Math.min(x - rug.x, rug.x + rug.width - x, y - rug.y, rug.y + rug.depth - y);
  if (edge < 0.08) return B.strawDark;
  if (edge < 0.2) return B.matStripes[0];
  if (edge < 0.26) return B.straw;
  if (edge < 0.36) return B.matStripes[1];
  return (Math.floor(ax / 2) + Math.floor(ay)) % 2 ? B.straw : B.strawDark;
}

/** A pixel of sand: three tones in soft patches, ripples left by the wind, a grain here and there. */
function sandAt(x: number, y: number, ax: number, ay: number): string {
  const patch = noise('sand', ax, ay * 2, 14);
  let colour = B.sand[patch < 0.4 ? 0 : patch < 0.62 ? 1 : 2];
  const ripple = (x * 0.55 + y * 0.9 + noise('warp', ax, ay, 22) * 1.6) % 1;
  if (ripple < 0.05) colour = B.sandRipple;
  else if (ripple < 0.09) colour = B.sandLight;
  const grain = pick(`grain${ax},${ay}`, 29);
  if (grain === 0) colour = B.sandRipple;
  if (grain === 1) colour = B.sandLight;
  return colour;
}

/** Footprints from the door into the room, and shells and starfish lying about. */
function paintBeachLife(context: Context, layout: Layout) {
  const start = { x: 0.6, y: layout.door.y + 0.65 }, end = { x: 7.2, y: 11.6 };
  const steps = 14;
  for (let step = 1; step < steps; step++) {
    const share = step / steps;
    const side = step % 2 ? 0.1 : -0.1;
    const at = toArt({ x: start.x + (end.x - start.x) * share - side * 0.3, y: start.y + (end.y - start.y) * share + side });
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0]]) dot(context, { x: at.x + dx, y: at.y + dy }, B.footprint, 0.8);
  }
  const shells = [[7.6, 12.4], [11.6, 12.3], [2.6, 10.7], [12.4, 6.6], [9.6, 12.9], [3.4, 0.6], [16.6, 6.4], [6.8, 6.2]];
  shells.forEach(([x, y], index) => {
    const at = toArt({ x, y });
    const colour = B.shells[index % B.shells.length];
    if (index % 3 === 2) {
      // a starfish: five arms round a middle
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 1], [2, 1], [-1, 2], [1, 2]]) dot(context, { x: at.x + dx, y: at.y + dy }, B.starfish);
      dot(context, at, tones(B.starfish).light);
    } else {
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, -1]]) dot(context, { x: at.x + dx, y: at.y + dy }, colour);
      dot(context, { x: at.x + 1, y: at.y + 1 }, tones(colour).shade);
      dot(context, { x: at.x + 1, y: at.y + 2 }, B.sandRipple);
    }
  });
}

/** Where water runs off the islet's edge (floor points on it): a little stream across the sand, then a fall down the rock. */
const FALLS: readonly Point[] = [{ x: 9.4, y: ROOM.depth }, { x: 12.6, y: ROOM.depth }, { x: ROOM.width, y: 5.4 }, { x: ROOM.width, y: 10.5 }];

export function paintSandFloor(context: Context, layout: Layout) {
  const far = toArt({ x: 0, y: 0 }), right = toArt({ x: ROOM.width, y: 0 }), front = toArt({ x: ROOM.width, y: ROOM.depth }), left = toArt({ x: 0, y: ROOM.depth });
  for (let ay = Math.floor(far.y); ay < Math.ceil(front.y); ay++) for (let ax = Math.floor(left.x); ax < Math.ceil(right.x); ax++) {
    const { x, y } = toTile({ x: (ax + 0.5) * ART_SCALE, y: (ay + 0.5) * ART_SCALE });
    if (x < 0 || y < 0 || x >= ROOM.width || y >= ROOM.depth) continue;
    const rug = layout.rugs.find((each) => inRug(each, x, y));
    let colour = rug?.colour === 'amber' ? matAt(rug, x, y, ax, ay) : sandAt(x, y, ax, ay);
    // wet sand along the islet's front edges
    const shore = Math.min(ROOM.width - x, ROOM.depth - y);
    if (!rug && shore < 0.22) colour = shore < 0.1 ? B.floorEdgeDark : B.floorEdge;
    context.fillStyle = colour;
    context.fillRect(ax, ay, 1, 1);
  }
  for (const rug of layout.rugs) if (rug.colour !== 'amber') paintDeck(context, rug);
  // the streams running to the falls
  for (const fall of FALLS) {
    const along = fall.y === ROOM.depth;
    for (let step = 0; step < 6; step++) {
      const inward = 0.05 + step * 0.06;
      const at = toArt(along ? { x: fall.x + Math.sin(step) * 0.05, y: fall.y - inward } : { x: fall.x - inward, y: fall.y + Math.sin(step) * 0.05 });
      for (const dx of [-1, 0, 1]) dot(context, { x: at.x + dx, y: at.y }, step < 2 ? B.fall : B.fallLight, step > 3 ? 0.6 : 1);
    }
  }
  paintBeachLife(context, layout);
}

/* The slab: the islet's edge */

/** Where each fall leaves the islet and how far it goes, in art pixels: set when the slab is painted, animated every frame. */
interface Fall { x: number; top: number; lip: number; end: number }
const falls: Fall[] = [];

export function paintIslet(context: Context, left: Point, front: Point, right: Point, height: number, underside: number) {
  const faces = [[left, front, false], [front, right, true]] as const;
  for (const [from, to, shaded] of faces) {
    for (let x = Math.round(from.x); x < Math.round(to.x); x++) {
      const top = Math.round(from.y + ((to.y - from.y) * (x + 0.5 - from.x)) / (to.x - from.x));
      // shallower near the ends of each face, where it turns the corner
      const taper = Math.min(1, Math.min(x - from.x, to.x - x) / 18);
      const hang = Math.round(taper * (2 + noise(`hang${shaded}`, x, 0, 5) * 7 + pick(`rock${x}`, 2)));
      const bottom = top + height + underside + hang;
      for (let y = top; y < bottom; y++) {
        const depth = y - top;
        let colour: string;
        if (depth < 1) colour = B.slabLight;
        else if (depth < 4) colour = pick(`sand${x},${y}`, 5) ? B.slab : B.slabLight;
        else if (depth < 5) colour = B.slabSeam;
        else {
          const grain = noise('rock', x, y * 1.5, 4);
          colour = y === bottom - 1 ? B.rockDark : grain > 0.62 ? B.rockLight : grain < 0.3 ? B.rockDark : B.rock;
        }
        if (shaded) colour = tones(colour).shade;
        dot(context, { x, y }, colour);
      }
      if (hang > 3 && pick(`weed${x}`, 7) === 0) for (let y = bottom; y < bottom + 2 + pick(`weedLength${x}`, 3); y++) dot(context, { x, y }, B.seaweed);
    }
  }
  falls.length = 0;
  for (const point of FALLS) {
    const edge = toArt(point);
    const x = Math.round(edge.x);
    const onRight = point.x === ROOM.width;
    const face = onRight ? [front, right] : [left, front];
    const top = Math.round(face[0].y + ((face[1].y - face[0].y) * (x + 0.5 - face[0].x)) / (face[1].x - face[0].x));
    const lip = top + height + underside + 6;
    const fall = { x, top: top - 4, lip, end: lip + 8 };
    falls.push(fall);
    for (let y = fall.top; y < fall.end; y++) {
      const below = y - lip;
      // a thread that wavers as it falls, in broken dashes, thinning into mist before the sea
      const sway = Math.round(Math.sin(y * 0.8 + x) * 0.8);
      const half = y < fall.top + 1 ? 2 : below > 2 ? 0 : 1;
      for (let dx = -half; dx <= half; dx++) {
        const gap = y > fall.top + 2 && pick(`gap${x},${Math.floor(y / 2)},${dx}`, 100) < 22 + Math.max(0, below + 3) * 12;
        if (gap) continue;
        let colour = y < fall.top + 1 ? B.fallFoam : dx === 0 ? B.fall : B.fallLight;
        if (onRight && colour !== B.fallFoam) colour = tones(colour).shade;
        dot(context, { x: x + dx + sway, y }, colour, Math.max(0.35, 1 - Math.max(0, below) * 0.08));
      }
    }
  }
}

/** The falls running: drops of foam going down them, mist puffing at their end. Dimmer at night: it is not a light. */
function runFalls(context: Context, time: number, glow: number) {
  const alpha = 1 - glow * 0.6;
  for (const [index, fall] of falls.entries()) {
    for (let drop = 0; drop < 7; drop++) {
      const share = (time / 1100 + drop / 7 + index * 0.17) % 1;
      const y = fall.top + 1 + share * (fall.end - fall.top - 4);
      const dx = ((drop * 3) % 5) - 2;
      context.globalAlpha = alpha * (y > fall.lip ? Math.max(0, 1 - (y - fall.lip) / 16) * 0.8 : 0.7);
      context.fillStyle = B.fallFoam;
      context.fillRect((fall.x + dx) * ART_SCALE, Math.round(y) * ART_SCALE, ART_SCALE, ART_SCALE);
    }
    const puff = Math.floor(time / 300 + index) % 3;
    context.globalAlpha = alpha * 0.5;
    context.fillRect((fall.x - 2 + puff) * ART_SCALE, (fall.lip + 1) * ART_SCALE, ART_SCALE, ART_SCALE);
  }
  context.globalAlpha = 1;
}

/* The door */

/** A bamboo arch with a little thatch roof, the half wall cut for it, a beach and the sea beyond, and a curtain of beads. */
export function paintBambooArch(context: Context, from: number, to: number, height: number) {
  open(context, 'left', from - 0.2, to + 0.2, 0, RAIL + 2);
  // beyond it: the beach, the sea, foam where they meet
  for (let column = Math.round((from - 0.2) * 8); column < Math.round((to + 0.2) * 8); column++) for (let z = 0; z < SEA.low; z++) {
    const colour = z < 3 ? B.isletSand : z === 3 ? B.foam : z < 10 ? B.seaNear : B.seaMiddle;
    dot(context, onWallAt('left', column / 8, z), z > 3 && pick(`doorwave${column},${z}`, 6) === 0 ? B.seaLine : colour);
  }
  paintSea(context, 'left', from - 0.2, to + 0.2);
  for (const along of [from - 0.2 - POST, to + 0.2]) post(context, 'left', along, 0, height + 6);
  // the lintel and its little roof
  for (let column = Math.round((from - 0.4) * 8); column < Math.round((to + 0.4) * 8); column++) {
    dot(context, onWallAt('left', column / 8, height + 1), column % 9 ? B.bamboo : B.bambooNode);
    dot(context, onWallAt('left', column / 8, height + 2), B.bambooLight);
    const fringe = height + 3 - pick(`porch${column}`, 2);
    for (let z = fringe; z < height + 8; z++) dot(context, onWallAt('left', column / 8, z), z === fringe ? B.thatchDark : B.thatch[pick(`porchStraw${column}`, B.thatch.length)]);
  }
  // the bead curtain: strings every other pixel, beads of every colour, the strings a little shorter in the middle
  const first = Math.round(from * 8), last = Math.round(to * 8);
  for (let column = first; column < last; column += 2) {
    const reach = 2 + Math.round(Math.sin(((column - first) / (last - first)) * Math.PI) * 3);
    for (let z = reach; z <= height; z++) {
      const bead = (z + column) % 3 !== 0;
      dot(context, onWallAt('left', column / 8, z), bead ? B.beads[pick(`bead${column},${Math.floor(z / 3)}`, B.beads.length)] : B.rope, bead ? 1 : 0.7);
    }
  }
}

/* What hangs on the back wall, painted again when the hour changes */

/** When the sun is low (morning or evening), how much: 0 by day and by night. */
const lowSun = (lighting: Lighting) => (lighting.stars < 0.6 && lighting.beam < 0.5 ? Math.min(1, (0.5 - lighting.beam) * 4) * (1 - lighting.stars) : 0);

/** A disc on the back wall facing the viewer (not on the wall's slant): the sun, the life ring. */
function faceOn(context: Context, along: number, z: number, radius: number, paint: (dx: number, dy: number, distance: number) => string | null) {
  const center = onWallAt('back', along, z);
  const reach = Math.ceil(radius);
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const distance = Math.hypot(dx, dy);
    if (distance > radius) continue;
    const colour = paint(dx, dy, distance);
    if (colour) dot(context, { x: center.x + dx, y: center.y + dy }, colour);
  }
}

/** An opening on the sea: what shines on the water at this hour, a sailboat, an islet, the low sun; posts and a rolled blind. */
export function paintOpening(context: Context, item: WallItem, lighting: Lighting, index: number, count: number) {
  const from = item.fromX, to = item.fromX + item.width;
  const low = lowSun(lighting);
  const glitter = lighting.stars > 0.5 ? B.glitterMoon : low > 0.3 ? B.glitterDusk : B.glitter;
  const path = index === 0 ? from + item.width * 0.38 : (from + to) / 2;
  for (let column = Math.round(from * 8); column < Math.round(to * 8); column++) for (let z = SEA.low; z < SEA.high; z++) {
    // a path of light toward the sun or the moon, wider near the shore, and sparkles elsewhere
    const width = 1 + (SEA.high - z) * 0.9;
    const onPath = (low > 0.3 && index === 0) || (lighting.stars > 0.5 && index === Math.floor(count / 2));
    const inPath = onPath && Math.abs(column / 8 - path) * 8 < width;
    const chance = inPath ? 2 : low > 0.3 ? 9 : lighting.stars > 0.5 ? 30 : 13;
    if (pick(`glint${item.fromX}${column},${z}`, chance) === 0) dot(context, onWallAt('back', column / 8, z), glitter, inPath ? 1 : 0.85);
  }
  if (low > 0.1 && index === 0) {
    const core = mix(rgb(B.sunLowCore), rgb(B.sunLow), 0.3);
    faceOn(context, path, SEA.high + 1, 6, (_dx, dy, distance) => (dy > 1 ? null : distance > 4.5 ? B.sunLow : css(core)));
  }
  if (index === 0) paintBoat(context, from + item.width * 0.68, low > 0.3);
  if (index === count - 1 && count > 1) paintSmallIslet(context, from + item.width * 0.3);
  for (const along of [from - POST, to]) post(context, 'back', along, RAIL + 2, THATCH);
  paintBlind(context, from, to);
}

/** A sailboat far out: a red hull, a white sail (dark against the low sun). */
function paintBoat(context: Context, along: number, against: boolean) {
  const sail = against ? tones(B.hull).dark : B.sail;
  for (let column = -3; column <= 3; column++) dot(context, onWallAt('back', along + column / 8, SEA.high - 1), B.hull);
  for (let column = -2; column <= 2; column++) dot(context, onWallAt('back', along + column / 8, SEA.high - 2), tones(B.hull).shade);
  for (let up = 0; up < 7; up++) {
    dot(context, onWallAt('back', along, SEA.high + up), tones(B.hull).dark);
    for (let column = 1; column <= Math.floor((7 - up) * 0.6); column++) dot(context, onWallAt('back', along + column / 8, SEA.high + up), sail);
    if (up < 4) for (let column = 1; column <= Math.floor((4 - up) * 0.5); column++) dot(context, onWallAt('back', along - column / 8, SEA.high + up), sail);
  }
}

/** A tiny islet on the horizon, its palm leaning. */
function paintSmallIslet(context: Context, along: number) {
  for (const [z, half, colour] of [[SEA.high - 1, 7, B.isletSand], [SEA.high, 6, B.islet], [SEA.high + 1, 4, B.islet], [SEA.high + 2, 2, tones(B.islet).shade]] as const) {
    for (let column = -half; column <= half; column++) dot(context, onWallAt('back', along + column / 8, z), colour);
  }
  for (let up = 0; up < 6; up++) dot(context, onWallAt('back', along + (1 + Math.floor(up / 3)) / 8, SEA.high + 2 + up), B.isletTrunk);
  for (const [dx, dz] of [[-2, 8], [-1, 9], [0, 9], [1, 9], [2, 9], [3, 8], [4, 7], [-3, 7], [1, 8]] as const) dot(context, onWallAt('back', along + dx / 8, SEA.high + dz), B.islet);
}

/** A bamboo blind rolled up under the thatch, tied at both ends. */
function paintBlind(context: Context, from: number, to: number) {
  for (let column = Math.round(from * 8); column < Math.round(to * 8); column++) for (let z = THATCH - 6; z < THATCH - 2; z++) {
    const colour = z === THATCH - 6 ? B.blindShade : z === THATCH - 3 ? tones(B.blind).light : column % 2 ? B.blind : B.blindShade;
    dot(context, onWallAt('back', column / 8, z), colour);
  }
  for (const along of [from + 0.5, to - 0.6]) for (let z = THATCH - 8; z < THATCH - 1; z++) dot(context, onWallAt('back', along, z), B.rope);
}

/** The clock as a life ring hung on its post: red and white, a rope round it, a dial in its middle. */
export function paintLifeRing(context: Context, item: WallItem, hour: number) {
  const center = item.fromX + item.width / 2;
  const z = 29;
  faceOn(context, center, z, 6.5, (dx, dy, distance) => {
    if (distance <= 3.6) return distance > 3 ? tones(B.clock).shade : B.clock;
    const quarter = Math.floor(((Math.atan2(dy, dx) + Math.PI / 4 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
    const colour = quarter % 2 ? B.buoy : B.buoyWhite;
    const light = dx * 0.6 + dy * 0.5;
    return light > 2.6 ? tones(colour).shade : light < -3 ? tones(colour).light : colour;
  });
  for (const [dx, dy] of [[-5, -4], [5, -4], [-5, 4], [5, 4], [0, -7], [-1, -7], [1, -7]] as const) dot(context, { x: onWallAt('back', center, z).x + dx, y: onWallAt('back', center, z).y + dy }, B.rope);
  const middle = onWallAt('back', center, z);
  const hand = (turns: number, length: number) => {
    for (let step = 0; step <= length * 2; step++) {
      const reach = step / 2;
      dot(context, { x: middle.x + Math.sin(turns * Math.PI * 2) * reach, y: middle.y - Math.cos(turns * Math.PI * 2) * reach }, B.clockHands);
    }
  };
  hand((hour % 12) / 12, 2);
  hand(hour % 1, 3);
}

/** The lounge's screen in a bamboo frame, hung from the thatch: a surf film, a wave curling over at sunset and its surfer. */
export function paintSurfScreen(context: Context, item: WallItem) {
  const from = item.fromX, to = item.fromX + item.width;
  const low = 17, high = 36;
  for (const along of [from + 0.4, to - 0.6]) for (let z = high; z < THATCH; z++) dot(context, onWallAt('back', along, z), B.rope);
  quad(context, 'back', from - 0.25, to + 0.25, low - 2, high + 2, B.bamboo);
  for (const z of [low - 2, high + 1]) for (let column = Math.round((from - 0.25) * 8); column < Math.round((to + 0.25) * 8); column++) {
    dot(context, onWallAt('back', column / 8, z), column % 10 ? B.bambooLight : B.bambooNode);
  }
  const columns = Math.round(item.width * 8);
  const crestOf = (column: number) => {
    const share = column / columns;
    return share < 0.58 ? 25 + Math.round(9 * Math.sqrt(1 - share / 0.58)) : 25 - Math.round((share - 0.58) * 4);
  };
  for (let column = 0; column < columns; column++) for (let z = low; z < high; z++) {
    const crest = crestOf(column);
    let colour: string;
    if (z > crest) colour = css(mix(rgb(B.screenSky), rgb(B.screenSkyHigh), (z - 25) / (high - 25)));
    else if (z === crest) colour = B.foam;
    else colour = z > crest - 3 && column / columns < 0.58 ? B.screenWave : z < 21 ? B.screenDeep : B.screenSea;
    // the lip curling over the barrel on the left
    if (column < 7 && z <= crestOf(0) && z > crestOf(0) - 1 - column) colour = column < 2 ? B.foam : B.screenWave;
    if (column < 5 && z < crestOf(0) - 2 && z > 25) colour = B.screenDeep;
    if (z < crest && pick(`surfFoam${column},${z}`, 9) === 0) colour = B.seaLine;
    dot(context, onWallAt('back', from + column / 8, z), colour);
  }
  // the sun going down behind, and the surfer on the face of the wave
  const sun = from + item.width * 0.78;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= 9 && 29 + dz > crestOf(Math.round((sun - from) * 8 + dx))) dot(context, onWallAt('back', sun + dx / 8, 29 + dz), B.sunLowCore);
  const rider = Math.round(columns * 0.42), riderZ = crestOf(rider) - 2;
  for (let dx = -2; dx <= 2; dx++) dot(context, onWallAt('back', from + (rider + dx) / 8, riderZ), B.surfer);
  for (const [dx, dz, colour] of [[0, 1, B.clockHands], [0, 2, B.clockHands], [-1, 2, B.clockHands], [1, 2, B.clockHands], [0, 3, B.buoy], [0, 4, B.buoy]] as const) dot(context, onWallAt('back', from + (rider + dx) / 8, riderZ + dz), colour);
}

/* The light */

/** The light of the hour on the beach: a bluer, brighter sky by day, and a night a little less dark than the office's. */
function beachLight(lighting: Lighting): Lighting {
  const day = lighting.beam * (1 - lighting.stars);
  return {
    ...lighting,
    tint: mix(lighting.tint, rgb(B.nightTint), lighting.stars * 0.35),
    skyTop: mix(lighting.skyTop, rgb(B.skyTop), day * 0.8),
    skyBottom: mix(lighting.skyBottom, rgb(B.skyBottom), day * 0.8),
  };
}

/** The string of lights under the thatch, a halo for every few bulbs. */
function bulbLights(): ThemeLight[] {
  return bulbsOf().filter((_bulb, index) => index % 4 === 0).map((bulb) => ({
    x: bulb.wall === 'back' ? bulb.along : 0.3, y: bulb.wall === 'back' ? 0.3 : bulb.along, height: bulb.z * ART_SCALE, radius: 60, colour: B.bulb, strength: 0.22,
  }));
}

/** The bulbs lit at night, each with a little glow, one now and then a little brighter. */
function lightBulbs(context: Context, time: number, glow: number) {
  if (glow < 0.05) return;
  bulbsOf().forEach((bulb, index) => {
    const point = roomPointOnWall(bulb.wall, bulb.along, bulb.z);
    const x = Math.round(point.x / ART_SCALE) * ART_SCALE, y = Math.round(point.y / ART_SCALE) * ART_SCALE;
    const twinkle = pick(`bulb${index},${Math.floor(time / 700)}`, 9) === 0 ? 1 : 0.8;
    context.globalAlpha = glow * 0.25;
    context.fillStyle = B.bulbWarm;
    context.fillRect(x - ART_SCALE, y - ART_SCALE, ART_SCALE * 3, ART_SCALE * 3);
    context.globalAlpha = glow * twinkle;
    context.fillStyle = index % 3 ? B.bulb : B.bulbWarm;
    context.fillRect(x, y, ART_SCALE, ART_SCALE);
  });
  context.globalAlpha = 1;
}

/** A crab, one letter a pixel, its legs in two steps: it goes sideways along the shore and stops now and then. */
const CRAB = [['e...e', 'c.e.c', '.ccc.', 'd.d.d'], ['e...e', 'c.e.c', '.ccc.', '.d.d.']];
const CRAB_COLOURS: Readonly<Record<string, string>> = { c: B.crab, d: B.crabDark, e: B.crabEye };

/** Where the crab is: its place along the front edge, and whether its legs are going. */
function crabAt(time: number) {
  const cycle = (time / 16000) % 1;
  // there and back, a stop at each end and one on the way
  const leg = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  const share = Math.min(1, Math.max(0, (leg - 0.1) / 0.8));
  const along = 8.2 + 2.2 * (share < 0.45 ? share / 0.45 * 0.5 : share < 0.55 ? 0.5 : 0.5 + (share - 0.55) / 0.45 * 0.5);
  const moving = share > 0 && share < 1 && (share < 0.45 || share > 0.55);
  return { point: { x: along, y: ROOM.depth - 0.12 }, moving };
}

/** Asleep at night; by day it walks between two plants on the front edge, where nobody stands. */
function crabEffects(time: number, glow: number): ThemeEffect[] {
  if (glow > 0.6) return [];
  const { point, moving } = crabAt(time);
  return [{ depth: depthOf(point), paint(context) {
    const feet = toScreen(point);
    const frame = CRAB[moving ? Math.floor(time / 150) % 2 : 0];
    context.globalAlpha = 1 - glow;
    for (const [line, row] of frame.entries()) [...row].forEach((letter, column) => {
      const colour = CRAB_COLOURS[letter];
      if (!colour) return;
      context.fillStyle = colour;
      context.fillRect(Math.round(feet.x / ART_SCALE + column - 2) * ART_SCALE, Math.round(feet.y / ART_SCALE + line - 4) * ART_SCALE, ART_SCALE, ART_SCALE);
    });
    context.globalAlpha = 1;
  } }];
}

export const BEACH: ThemeKit = {
  structure: B,
  paintWalls: paintBeachWalls,
  paintFloor: paintSandFloor,
  rugs: false,
  paintSlab: paintIslet,
  paintDoor: paintBambooArch,
  paintWindow: paintOpening,
  paintClock: paintLifeRing,
  paintTv: paintSurfScreen,
  paintSky: paintBeachSky,
  paintSkyMotion: paintGulls,
  // the gulls glide a pixel at a time
  skyFrameMs: 250,
  // the walls are open above the half wall: a shaft of light from the openings would veil the sky behind
  wallBeam: false,
  furniture: BEACH_FURNITURE,
  lighting: beachLight,
  officeLamps: false,
  lights: (layout) => [...furnitureLights(layout), ...bulbLights()],
  effects: (layout, time, lighting) => [
    { depth: WALL_EFFECT, paint: (context) => lightBulbs(context, time, lighting.glow) },
    { depth: Infinity, paint: (context) => runFalls(context, time, lighting.glow) },
    ...crabEffects(time, lighting.glow),
    ...furnitureEffects(layout, time, lighting.glow),
  ],
  screenLight: B.screenLight,
  doorLight: B.doorLight,
};
