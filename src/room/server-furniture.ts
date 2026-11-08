// The furniture of the automatons' server room (shared/room-layout.ts, SERVER_ROOM), in the pixel art of
// pixel-furniture.ts: racks of servers along the walls, the capsules the automatons stand in, and the orb of light
// floating in the middle. What moves on them (blinking diodes, the orb's pulse, the cords of light) is drawn every
// frame by themes/servers.ts and draw.ts.
import { SERVERS_FURNITURE as S } from '../design/theme-servers.ts';
import { ORB, type FurniturePiece } from '../../shared/room-layout.ts';
import { hash } from './sprites.ts';
import type { Design, Painter } from './pixel-furniture.ts';

/** A rack's height, and the server faces on it: every 4 art pixels from the bottom, each with its row of diodes. */
export const RACK = { height: 42, bottom: 3, top: 39, step: 4, inset: 0.1 };
/** A capsule: its base, how high its glass goes, its cap. */
export const POD = { base: 2, glass: 36, cap: 3 };
/** The orb: its radius (art pixels), and the ring around it, flat, wider than the orb. */
export const ORB_SHAPE = { radius: 7, ring: { x: 13, y: 5 } };
/** How far the orb bobs up and down, in art pixels (see bobOf). */
export const ORB_FLOAT = 2;

/** A rack against the left wall faces +x; along the back wall, +y. */
export const facesSide = (piece: FurniturePiece) => piece.depth > piece.width;

/** Where a rack's diodes are, from its corner: along its face (tiles), and up (art pixels). Stable for each rack. */
export function rackDiodes(piece: FurniturePiece): { along: number; z: number; colour: string }[] {
  const diodes: { along: number; z: number; colour: string }[] = [];
  for (let z = RACK.bottom + 2, row = 0; z < RACK.top; z += RACK.step, row++) {
    for (let index = 0; index < 3; index++) {
      const seed = hash(`${piece.x},${piece.y}:${row}:${index}`);
      if (seed % 5 === 0) continue;
      diodes.push({ along: 0.62 + index * 0.1, z, colour: S.diodes[seed % S.diodes.length] });
    }
  }
  return diodes;
}

function paintRack(p: Painter, piece: FurniturePiece) {
  const side = facesSide(piece);
  p.box(0, 0, piece.width, piece.depth, 0, RACK.height, S.cabinet, S.cabinetEdge);
  const face = (fromZ: number, toZ: number, colour: string, from = RACK.inset, to = 1 - RACK.inset) => (side
    ? p.onSide(piece.width, from, to, fromZ, toZ, colour)
    : p.onFront(piece.depth, from, to, fromZ, toZ, colour));
  face(RACK.bottom, RACK.top, S.server);
  for (let z = RACK.bottom; z <= RACK.top; z += RACK.step) face(z, z + 1, S.serverLine);
  // vents on the left of each server face
  for (let z = RACK.bottom + 2; z < RACK.top; z += RACK.step) face(z, z + 1, S.cabinetEdge, 0.18, 0.5);
}

/** The diodes, after the outline so they stay one pixel each (the blinking ones are lit again every frame). */
function paintDiodes(p: Painter, piece: FurniturePiece) {
  const side = facesSide(piece);
  for (const diode of rackDiodes(piece)) {
    if (side) p.pixel(piece.width, 1 - diode.along, diode.z, diode.colour);
    else p.pixel(diode.along, piece.depth, diode.z, diode.colour);
  }
}

/** The far half of a capsule, drawn before the automaton in it: its base lit from below, the inside of its shell. */
function paintPodBack(p: Painter) {
  p.box(-0.02, -0.02, 1.04, 1.04, 0, POD.base, S.podShell, S.podBase);
  // the inside of the shell, behind whoever stands there: two dark panels and a strip of light down each
  p.box(0.08, 0.08, 0.84, 0.1, POD.base, POD.glass, S.podShell);
  p.box(0.08, 0.08, 0.1, 0.84, POD.base, POD.glass, S.podShell);
  p.onFront(0.18, 0.18, 0.92, POD.base, POD.base + POD.glass, S.podBack);
  p.onSide(0.18, 0.18, 0.92, POD.base, POD.base + POD.glass, S.podBack);
}

function paintPodBackLight(p: Painter) {
  for (let z = POD.base + 2; z < POD.base + POD.glass - 2; z++) {
    p.pixel(0.55, 0.18, z, S.podInside);
    p.pixel(0.18, 0.55, z, S.podInside);
  }
}

/** The near half, drawn over the automaton: the front pillars and the cap; the glass after the outline. */
function paintPodFront(p: Painter) {
  const top = POD.base + POD.glass;
  // the two side pillars, at the capsule's left and right on screen: the front corner stays open on whoever is inside
  // (out at the very corners of the tile, a little past them: whoever stands inside is as wide as the tile)
  p.box(0.96, -0.04, 0.07, 0.07, POD.base, POD.glass, S.podTrim);
  p.box(-0.04, 0.96, 0.07, 0.07, POD.base, POD.glass, S.podTrim);
  p.box(-0.02, -0.02, 1.04, 1.04, top, POD.cap, S.podShell, S.podTrim);
}

function paintPodGlass(p: Painter) {
  const top = POD.base + POD.glass;
  p.onFront(0.92, 0.16, 0.84, POD.base, top, S.glassFill);
  p.onSide(0.92, 0.16, 0.84, POD.base, top, S.glassFill);
  // a short shine high on each pane, clear of the face, and the glass's rim under the cap
  for (let step = 0; step < 3; step++) {
    p.pixel(0.2, 0.92, top - 3 - step, S.glassShine);
    p.pixel(0.92, 0.2, top - 3 - step, S.glassEdge);
  }
  for (let along = 0.15; along < 0.85; along += 0.1) { p.pixel(along, 0.92, top - 1, S.glassEdge); p.pixel(0.92, along, top - 1, S.glassEdge); }
}

/** The orb's flat ring, as a row of pixels on an ellipse around its centre (art pixels from it). */
export function ringPixels(ring: { x: number; y: number }): { x: number; y: number }[] {
  const pixels: { x: number; y: number }[] = [];
  const steps = Math.ceil(Math.PI * (ring.x + ring.y) * 1.2);
  const seen = new Set<string>();
  for (let step = 0; step < steps; step++) {
    const angle = step / steps * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * ring.x), y = Math.round(Math.sin(angle) * ring.y);
    if (seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    pixels.push({ x, y });
  }
  return pixels;
}

export const SERVER_DESIGNS: Readonly<Record<'serverRack' | 'pod' | 'podGlass' | 'orb', Design>> = {
  serverRack: { height: RACK.height + 2, paint: (p, piece) => paintRack(p, piece), fine: (p, piece) => paintDiodes(p, piece) },
  pod: { height: POD.base + POD.glass + 2, paint: paintPodBack, fine: paintPodBackLight },
  podGlass: { height: POD.base + POD.glass + POD.cap + 2, paint: paintPodFront, fine: paintPodGlass },
  // the orb floats and bobs; its pad of light stays on the floor (its glow and pulse are drawn every frame)
  orb: {
    height: ORB.z + ORB_SHAPE.radius + 4, float: ORB_FLOAT,
    paint(p) {
      p.ball(0.5, 0.5, ORB.z, ORB_SHAPE.radius, ORB_SHAPE.radius, S.orbOuter);
      p.ball(0.45, 0.45, ORB.z + 1, ORB_SHAPE.radius - 2, ORB_SHAPE.radius - 2, S.orbInner);
    },
    fine(p) {
      // the far half of the ring passes behind the orb
      for (const { x, y } of ringPixels(ORB_SHAPE.ring)) if (y >= 0 || Math.abs(x) > ORB_SHAPE.radius) p.upright(x, ORB.z - y, S.orbRing);
      p.upright(-1, ORB.z + 2, S.orbCore);
      p.upright(0, ORB.z + 2, S.orbCore);
      p.upright(-1, ORB.z + 3, S.orbCore);
    },
    ground(p) {
      p.box(0.12, 0.12, 0.76, 0.76, 0, 2, S.orbPad, S.orbPadLight);
      p.box(0.3, 0.3, 0.4, 0.4, 2, 1, S.orbPad, S.orbInner);
    },
  },
};
