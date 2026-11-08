// The automatons' server room (SERVER_ROOM in shared/room-layout.ts), dressed like a theme (kit.ts) but whatever
// theme the office wears: dark metal walls with cable trays along their top, a raised floor of grey tiles with a ring
// of light around the orb, and a dim, cold light that the orb and the capsules give. What moves: the racks' diodes
// blink, and the orb sends out rings of light as it pulses. The cords of light to the automatons are drawn by draw.ts
// (they follow the people), from server-room.ts.
import { SERVERS_FURNITURE as F, SERVERS_PALETTE as S } from '../../design/theme-servers.ts';
import { ORB, ROOM, type FurniturePiece, type Layout } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import { ART_SCALE, fillPolygon, toArt, tones } from '../pixel-art.ts';
import { bobOf, furnitureDepth } from '../pixel-furniture.ts';
import { ORB_FLOAT, ORB_SHAPE, facesSide, rackDiodes, ringPixels } from '../server-furniture.ts';
import { orbCenter, pulseRings } from '../server-room.ts';
import { WALL, line, onWallAt, type Context, type Wall } from '../wall-art.ts';
import type { ThemeEffect, ThemeKit, ThemeLight } from './kit.ts';

const WAINSCOT = 12;

function dot(context: Context, point: Point, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
}

/** Panels a tile wide, a cable tray along the top with its bundled cables, a row of status lights low down. */
function paintWalls(context: Context) {
  for (const wall of ['back', 'left'] as const satisfies readonly Wall[]) {
    const length = wall === 'back' ? ROOM.width : ROOM.depth;
    const seam = wall === 'back' ? S.wallStripe : S.wallSideStripe;
    for (let along = 1; along < length; along++) line(context, onWallAt(wall, along, WAINSCOT + 1), onWallAt(wall, along, WALL - 9), seam);
    for (let z = WALL - 8; z <= WALL - 4; z++) line(context, onWallAt(wall, 0, z), onWallAt(wall, length, z), z === WALL - 8 || z === WALL - 4 ? tones(S.tray).shade : S.tray);
    for (const z of [WALL - 7, WALL - 6, WALL - 5]) for (let along = 0; along < length; along += 0.5) dot(context, onWallAt(wall, along + (z % 2) * 0.25, z), S.trayCable);
    for (let along = 0.5; along < length; along += 2) dot(context, onWallAt(wall, along, WAINSCOT - 3), S.wallLed);
  }
}

/** The raised floor: a tile each, a perforated one now and then, and a ring of light where the capsules stand. */
function paintFloor(context: Context) {
  for (let y = 0; y < ROOM.depth; y++) for (let x = 0; x < ROOM.width; x++) {
    const tile = S.planks[(x + y) % S.planks.length];
    fillPolygon(context, [toArt({ x, y }), toArt({ x: x + 1, y }), toArt({ x: x + 1, y: y + 1 }), toArt({ x, y: y + 1 })], tile);
    line(context, toArt({ x, y }), toArt({ x: x + 1, y }), S.plankLight);
    line(context, toArt({ x, y }), toArt({ x, y: y + 1 }), S.plankLight);
    line(context, toArt({ x: x + 1, y }), toArt({ x: x + 1, y: y + 1 }), S.plankSeam);
    line(context, toArt({ x, y: y + 1 }), toArt({ x: x + 1, y: y + 1 }), S.plankSeam);
    if ((x * 3 + y * 5) % 7 === 0) for (const u of [0.25, 0.5, 0.75]) for (const v of [0.25, 0.5, 0.75]) dot(context, toArt({ x: x + u, y: y + v }), S.vent);
  }
  const steps = 360;
  for (let step = 0; step < steps; step++) {
    const angle = step / steps * Math.PI * 2;
    dot(context, toArt({ x: ORB.x + Math.cos(angle) * 4.6, y: ORB.y + Math.sin(angle) * 4.6 }), step % 6 < 4 ? S.orbLight : S.plankLight);
  }
}

function paintDoor(context: Context, from: number, to: number, height: number) {
  for (let z = 0; z <= height + 2; z++) for (const along of [from - 0.15, to + 0.05]) line(context, onWallAt('left', along, z), onWallAt('left', along + 0.1, z), S.doorFrame);
  line(context, onWallAt('left', from - 0.15, height + 2), onWallAt('left', to + 0.15, height + 2), S.doorFrame);
  for (let z = 0; z < height; z++) line(context, onWallAt('left', from, z), onWallAt('left', to, z), S.doorway);
  line(context, onWallAt('left', from + 0.1, height - 3), onWallAt('left', to - 0.1, height - 3), S.doorLight);
}

/** A room pixel square (one art pixel) on the canvas. */
function cell(context: Context, point: Point, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
}

/** How long a diode stays lit, then dark, in ms; each its own beat. */
const BLINK_MS = 700;

/** The diodes that blink: lit again over the rack, or dark, each on its beat, after the light so the dark does not dim them. */
function rackEffects(piece: FurniturePiece, time: number): ThemeEffect {
  const side = facesSide(piece);
  const point = (along: number, z: number) => {
    const floor = side ? toScreen({ x: piece.x + piece.width, y: piece.y + 1 - along }) : toScreen({ x: piece.x + along, y: piece.y + piece.depth });
    return { x: floor.x, y: floor.y - z * ART_SCALE };
  };
  return {
    depth: furnitureDepth(piece) + 0.01,
    paint(context) {
      for (const [index, diode] of rackDiodes(piece).entries()) {
        const lit = Math.floor((time + index * 377 + piece.x * 131 + piece.y * 97) / BLINK_MS) % 3 !== 0;
        cell(context, point(diode.along, diode.z), lit ? diode.colour : F.diodeOff);
      }
    },
  };
}

/** The orb lit up, and the rings it sends out as it pulses, over the light, bobbing with it. */
function orbEffect(piece: FurniturePiece, time: number): ThemeEffect {
  return {
    depth: furnitureDepth(piece) + 0.01,
    paint(context) {
      // the time stays at 0 when the system asks for less motion: the orb does not bob then (see pixelFurniture)
      const center = orbCenter(time === 0 ? 0 : bobOf(piece, ORB_FLOAT, time));
      for (const ring of pulseRings(time)) {
        context.globalAlpha = ring.alpha;
        for (const { x, y } of ringPixels({ x: ring.radius, y: ring.radius * 0.5 })) cell(context, { x: center.x + x * ART_SCALE, y: center.y + y * ART_SCALE }, F.orbInner);
      }
      context.globalAlpha = 1;
      for (const { x, y } of ringPixels({ x: ORB_SHAPE.radius - 1, y: ORB_SHAPE.radius - 1 })) cell(context, { x: center.x + x * ART_SCALE, y: center.y + y * ART_SCALE }, F.orbInner);
      for (const [x, y] of [[-1, -1], [0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) cell(context, { x: center.x + x * ART_SCALE, y: center.y + y * ART_SCALE }, F.orbCore);
    },
  };
}

export const SERVERS: ThemeKit = {
  structure: S,
  paintWalls,
  paintFloor,
  rugs: false,
  paintDoor,
  wallBeam: false,
  officeLamps: false,
  screenLight: S.podLight,
  doorLight: S.doorLight,
  // a room without windows: dim and cold at any hour, lit by the orb and the capsules
  lighting: (lighting) => ({ ...lighting, tint: [150, 160, 192], beam: 0, glow: 1, stars: 0 }),
  lights(layout: Layout): ThemeLight[] {
    const lights: ThemeLight[] = [{ x: ORB.x, y: ORB.y, height: ORB.z * ART_SCALE, radius: 230, colour: S.orbLight, strength: 1 }];
    for (const seat of layout.seats) lights.push({ x: seat.x + 0.5, y: seat.y + 0.5, height: 30, radius: 60, colour: S.podLight, strength: 0.9 });
    return lights;
  },
  effects(layout: Layout, time: number): ThemeEffect[] {
    const effects: ThemeEffect[] = [];
    for (const piece of layout.furniture) {
      if (piece.kind === 'serverRack') effects.push(rackEffects(piece, time));
      if (piece.kind === 'orb') effects.push(orbEffect(piece, time));
    }
    return effects;
  },
};
