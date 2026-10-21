// The treehouse's floor and what carries it (forest.ts), at art resolution: raw planks with their knots and nails,
// moss growing in from the walls, roots coming through, fallen leaves, carpets of moss and flowers where the office has
// its rugs, a mat before the door; under it all, a chunk of earth floating in the air, grass on its lip, roots hanging
// from it and little waterfalls running off it (they flow every frame, see forest-effects.ts).
import { FOREST_PALETTE as F } from '../../design/theme-forest.ts';
import { ROOM, type Layout } from '../../../shared/room-layout.ts';
import { CANVAS_HEIGHT, DOOR_SIZE, toTile, type Point } from '../geometry.ts';
import { ART_SCALE, fillPolygon, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { line, type Context } from '../wall-art.ts';
import { dot, noise } from './forest-art.ts';

/** The floor tile under an art pixel. */
const tileAt = (x: number, y: number) => toTile({ x: (x + 0.5) * ART_SCALE, y: (y + 0.5) * ART_SCALE });

/** Every art pixel of the floor, with the tile under it. */
function eachFloorPixel(paint: (x: number, y: number, tile: Point) => void) {
  const far = toArt({ x: 0, y: 0 }), left = toArt({ x: 0, y: ROOM.depth }), right = toArt({ x: ROOM.width, y: 0 }), front = toArt({ x: ROOM.width, y: ROOM.depth });
  for (let y = Math.floor(far.y); y < Math.ceil(front.y); y++) for (let x = Math.floor(left.x); x < Math.ceil(right.x); x++) {
    const tile = tileAt(x, y);
    if (tile.x >= 0 && tile.y >= 0 && tile.x < ROOM.width && tile.y < ROOM.depth) paint(x, y, tile);
  }
}

/** Wide planks along x, one a tile, of every length, a dark gap between them, knots and two nails at each end. */
function paintPlanks(context: Context) {
  for (let row = 0; row < ROOM.depth; row++) {
    const y = row;
    let x = -pick(`plankstart${row}`, 4) * 0.75;
    let index = 0;
    while (x < ROOM.width) {
      const length = 2.5 + pick(`planklen${row},${index}`, 5) * 0.5;
      const from = Math.max(0, x), to = Math.min(ROOM.width, x + length);
      const colour = F.planks[pick(`plank${row},${index}`, F.planks.length)];
      fillPolygon(context, [toArt({ x: from, y }), toArt({ x: to, y }), toArt({ x: to, y: y + 1 }), toArt({ x: from, y: y + 1 })], colour);
      line(context, toArt({ x: from, y }), toArt({ x: to, y }), F.plankSeam);
      line(context, toArt({ x: from, y: y + 0.2 }), toArt({ x: to, y: y + 0.2 }), tones(colour).light);
      if (to < ROOM.width) line(context, toArt({ x: to, y }), toArt({ x: to, y: y + 1 }), F.plankSeam);
      for (const along of [from + 0.15, to - 0.15]) if (along > 0.1 && along < ROOM.width - 0.1) for (const across of [0.35, 0.75]) dot(context, toArt({ x: along, y: y + across }), F.nail);
      // the grain: a darker streak or a knot along the plank
      for (let streak = 0; streak < length; streak++) {
        const at = from + pick(`grain${row},${index},${streak}`, 100) / 100 * (to - from);
        const across = 0.45 + pick(`grainy${row},${index},${streak}`, 4) * 0.12;
        line(context, toArt({ x: at, y: y + across }), toArt({ x: Math.min(to, at + 0.6), y: y + across }), tones(colour).shade);
      }
      if (pick(`knot${row},${index}`, 3) === 0) {
        const at = toArt({ x: from + (to - from) * 0.6, y: y + 0.55 });
        dot(context, at, tones(colour).dark);
        dot(context, { x: at.x + 1, y: at.y }, tones(colour).shade);
        dot(context, { x: at.x - 1, y: at.y }, tones(colour).shade);
      }
      x += length;
      index++;
    }
  }
}

/** Moss creeping in along the walls and in the back corner, in patches. */
function paintMoss(context: Context) {
  eachFloorPixel((x, y, tile) => {
    const nearWall = Math.max(0, 1 - Math.min(tile.x, tile.y) / 1.6) * 0.45;
    const nearEdge = Math.max(0, 1 - Math.min(ROOM.width - tile.x, ROOM.depth - tile.y) / 0.8) * 0.25;
    const amount = noise('floormoss', tile.x * 3, tile.y * 3, 2) * 0.8 + nearWall + nearEdge;
    if (amount < 0.86) return;
    const speckle = pick(`fm${x},${y}`, 7);
    dot(context, { x, y }, speckle === 0 ? F.mossLight : F.moss[pick(`fmc${x},${y}`, F.moss.length)]);
  });
}

/** A root coming through the floor: up out of the planks, along them, back down, thick in the middle. */
function paintRoot(context: Context, points: readonly Point[]) {
  const samples: Point[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    for (let step = 0; step < 16; step++) samples.push({ x: from.x + (to.x - from.x) * step / 16, y: from.y + (to.y - from.y) * step / 16 });
  }
  samples.forEach((tile, index) => {
    const share = index / (samples.length - 1);
    const thickness = Math.round(1 + Math.sin(share * Math.PI) * 1.6);
    const at = toArt(tile);
    const x = Math.round(at.x), y = Math.round(at.y);
    for (let down = -thickness; down <= thickness; down++) dot(context, { x, y: y + down }, down === -thickness ? F.rootLight : down === thickness ? F.rootDark : F.root);
    dot(context, { x, y: y + thickness + 1 }, F.plankSeam);
  });
}

const ROOTS: readonly (readonly Point[])[] = [
  [{ x: 0, y: 3.2 }, { x: 0.8, y: 3.6 }, { x: 1.4, y: 4.6 }, { x: 1.2, y: 5.6 }],
  [{ x: 6.2, y: 0 }, { x: 6.6, y: 0.7 }, { x: 7.6, y: 1.1 }, { x: 8.4, y: 1 }],
  [{ x: 11.6, y: 0 }, { x: 11.9, y: 0.9 }, { x: 11.5, y: 1.8 }],
  [{ x: 0, y: 11.3 }, { x: 0.9, y: 11.1 }, { x: 1.8, y: 11.7 }, { x: 2.4, y: 12.6 }],
];

/** A leaf lying on the floor: a few pixels, a darker vein. */
function paintFallenLeaf(context: Context, at: Point, colour: string, turn: number) {
  const x = Math.round(at.x), y = Math.round(at.y);
  const pixels = turn ? [[0, 0], [1, 0], [2, 0], [1, -1], [1, 1], [3, 1]] : [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [-1, 0]];
  for (const [across, down] of pixels) dot(context, { x: x + across, y: y + down }, colour);
  dot(context, { x: x + 1, y }, tones(colour).dark);
}

function paintFallenLeaves(context: Context) {
  for (let index = 0; index < 90; index++) {
    // more of them along the walls, where they pile up
    const near = pick(`leafnear${index}`, 3) === 0;
    const tile = near
      ? (pick(`leafwall${index}`, 2) ? { x: pick(`lx${index}`, ROOM.width * 10) / 10, y: pick(`ly${index}`, 12) / 10 } : { x: pick(`lx${index}`, 12) / 10, y: pick(`ly${index}`, ROOM.depth * 10) / 10 })
      : { x: pick(`lx${index}`, ROOM.width * 10) / 10, y: pick(`ly${index}`, ROOM.depth * 10) / 10 };
    paintFallenLeaf(context, toArt(tile), F.autumn[pick(`lc${index}`, F.autumn.length)], pick(`lt${index}`, 2));
  }
}

/** Where the office has its rugs: a carpet of moss with a ragged edge, a lighter weave on it, small flowers. */
function paintMossCarpets(context: Context, layout: Layout) {
  for (const rug of layout.rugs) {
    const base = tones(F.rugs[rug.colour]);
    const flower = F.flowers[rug.colour];
    eachFloorPixel((x, y, tile) => {
      const inside = Math.min(tile.x - rug.x, rug.x + rug.width - tile.x, tile.y - rug.y, rug.y + rug.depth - tile.y);
      const ragged = noise(`rugedge${rug.x},${rug.y}`, tile.x * 4, tile.y * 4, 1.5) * 0.35;
      if (inside < ragged - 0.1) return;
      const edge = inside < ragged + 0.06;
      const tuft = noise(`rugtuft${rug.x}`, tile.x * 8, tile.y * 8, 2);
      const speckle = pick(`rug${x},${y}`, 9);
      dot(context, { x, y }, edge ? base.dark : speckle === 0 ? base.light : tuft > 0.6 ? base.shade : tuft < 0.25 ? base.light : base.base);
    });
    const count = Math.round(rug.width * rug.depth * 1.6);
    for (let index = 0; index < count; index++) {
      const tile = { x: rug.x + 0.3 + pick(`fx${rug.x},${index}`, Math.round((rug.width - 0.6) * 20)) / 20, y: rug.y + 0.3 + pick(`fy${rug.y},${index}`, Math.round((rug.depth - 0.6) * 20)) / 20 };
      const at = toArt(tile);
      const x = Math.round(at.x), y = Math.round(at.y);
      dot(context, { x, y: y + 1 }, base.dark);
      dot(context, { x: x - 1, y }, flower);
      dot(context, { x: x + 1, y }, flower);
      dot(context, { x, y: y - 1 }, flower);
      dot(context, { x, y }, F.flowers.amber === flower ? F.lanternCore : F.flowers.amber);
    }
  }
}

/** A round woven mat before the door. */
function paintDoormat(context: Context, layout: Layout) {
  const middle = toArt({ x: 0.75, y: layout.door.y + DOOR_SIZE.width / 2 });
  for (let up = -5; up <= 5; up++) for (let across = -11; across <= 11; across++) {
    const distance = Math.hypot(across / 11, up / 5);
    if (distance > 1) continue;
    const ring = Math.floor(distance * 4);
    dot(context, { x: middle.x + across, y: middle.y + up }, distance > 0.88 ? tones(F.doormat).dark : ring % 2 ? tones(F.doormat).shade : F.doormat);
  }
}

export function paintForestFloor(context: Context, layout: Layout) {
  paintPlanks(context);
  paintMoss(context);
  for (const root of ROOTS) paintRoot(context, root);
  paintMossCarpets(context, layout);
  paintFallenLeaves(context);
  paintDoormat(context, layout);
}

/* The floating earth under the floor */

/** Where the waterfalls leave the lip of the earth, in art pixels, and how far they fall: found when the slab is painted. */
export const WATERFALLS: { x: number; y: number; fall: number }[] = [];

/**
 * Over the slab (from `left` to `front` to `right`, their top edge): a lip of grass with blades over the edge, then soil
 * with stones in it down to a ragged underside, deeper under the sides (the canvas ends under the front corner), roots
 * hanging from it, and the beds of three waterfalls.
 */
export function paintFloatingEarth(context: Context, left: Point, front: Point, right: Point, height: number, underside: number) {
  WATERFALLS.length = 0;
  const bottomOfCanvas = CANVAS_HEIGHT / ART_SCALE - 2;
  const topAt = (x: number) => (x <= front.x ? left.y + (front.y - left.y) * (x - left.x) / (front.x - left.x) : front.y + (right.y - front.y) * (x - front.x) / (right.x - front.x));
  const falls = new Set([0.22, 0.62, 1.42].map((share) => Math.round(share < 1 ? left.x + (front.x - left.x) * share : front.x + (right.x - front.x) * (share - 1))));
  for (let x = Math.ceil(left.x); x < Math.floor(right.x); x++) {
    const top = Math.round(topAt(x));
    const fromSide = Math.min(x - left.x, right.x - x);
    const deep = Math.min(bottomOfCanvas - top, height + underside + Math.round(Math.min(fromSide, 36) * 0.4 + noise('earthdeep', x, 0, 6) * 6 + noise('earthlump', x, 0, 2) * 2));
    const leftFace = x <= front.x;
    for (let down = 0; down <= deep; down++) {
      const y = top + down;
      let colour: string;
      if (down === 0) colour = F.grass;
      else if (down === 1) colour = pick(`blade${x}`, 3) ? F.grassDark : F.grass;
      else if (down === deep) colour = F.soilDeep;
      else {
        const depth = down / deep;
        const stony = noise('stones', x, y * 1.6, 3) > 0.74;
        colour = stony ? (noise('stonelit', x, y, 2) > 0.5 ? F.stoneLight : F.stone) : depth > 0.6 ? F.soilDark : F.soil;
        if (!stony && pick(`soil${x},${y}`, 13) === 0) colour = F.soilDeep;
        if (!leftFace && !stony) colour = tones(colour).shade;
      }
      dot(context, { x, y }, colour);
    }
    // blades of grass hanging over the lip, and moss tufts under it
    if (pick(`overhang${x}`, 3) === 0) dot(context, { x, y: top + 2 }, F.grass);
    if (noise('earthmoss', x, 0, 4) > 0.66) for (let down = 2; down < 4 + pick(`mossdown${x}`, 3); down++) dot(context, { x, y: top + down }, F.moss[(x + down) % F.moss.length]);
    // roots hanging from the underside, swaying a little as they go down
    if (pick(`hanging${x}`, 7) === 0) {
      const length = 4 + pick(`hanglength${x}`, 14);
      for (let down = 0; down < length; down++) dot(context, { x: x + Math.round(Math.sin(down / 3 + x) * 0.8), y: top + deep + down }, down === length - 1 ? F.moss[0] : F.hangingRoot);
    }
    if (falls.has(x)) WATERFALLS.push({ x, y: top, fall: Math.min(bottomOfCanvas - top - 2, 60) });
  }
  // the beds the water has worn in the lip, wet and dark
  for (const fall of WATERFALLS) for (let across = -1; across <= 2; across++) {
    dot(context, { x: fall.x + across, y: fall.y }, F.waterDeep);
    dot(context, { x: fall.x + across, y: fall.y + 1 }, F.water);
  }
}
