// The teleporter between the office and the automatons' room: the light rising from its ring, and the column of light
// that takes someone away or brings them in (the user, the pet). Pure logic, no clock of its own: it steps with the room.

/**
 * The teleporter's ring (drawn in pixel-furniture.ts and by each theme in themes/portals.ts): how far its plane is from
 * the back of its footprint (tiles), its radii across and up, the plinth under it and its band (art pixels).
 */
export const PORTAL = { plane: 0.22, across: 11, up: 13, plinth: 4, band: 3 } as const;
/** How high the middle of the ring is, in art pixels above the floor. */
export const PORTAL_MIDDLE_UP = PORTAL.plinth + PORTAL.up;
/** How tall a teleporter's canvas is by default, in art pixels: room for its ring and plinth (a theme's may stand higher). */
export const PORTAL_HEIGHT = PORTAL.plinth + PORTAL.up * 2 + 4;

/** How long the column of light takes to take someone away, or to bring them in, in ms. */
export const BEAM_MS = 900;

/** Where a beam is: 0 when it starts, 1 when it is done. */
export const beamProgress = (startedAt: number, now: number) => Math.min(1, Math.max(0, (now - startedAt) / BEAM_MS));

/** Whoever goes away is hidden once the light is at its brightest, and whoever comes in shows from then on. */
export const hiddenInBeam = (kind: 'out' | 'in', progress: number) => (kind === 'out' ? progress >= 0.5 : progress < 0.5);

/** How bright the column is: up to full in the middle of the beam, then down. */
export const beamGlow = (progress: number) => 1 - Math.abs(progress * 2 - 1);

/** How far a point is from the middle of an ellipse of radii `wide` and `high`: 1 on its edge. */
export const ellipseDistance = (across: number, up: number, wide: number, high: number) => Math.hypot(across / wide, up / high);

/** A pixel of what turns inside the ring: its tone (0 the deep of it, 1 what moves in it, 2 its bright heart) and how much it shows. */
export interface VortexCell { across: number; up: number; tone: 0 | 1 | 2; alpha: number }

/**
 * What turns inside the ring, by theme: a spiral winding in (the office's), ripples spreading out like water, a tunnel
 * of rings drawn in, a rain of glowing code, stars streaming out at warp speed.
 */
export type VortexForm = 'spiral' | 'ripple' | 'tunnel' | 'rain' | 'warp';

/** A number from 0 to 1 that looks random but is always the same for `seed`. */
const scatter = (seed: number) => { const value = Math.sin(seed * 12.9898) * 43758.5453; return value - Math.floor(value); };
const wrap = (value: number) => ((value % 1) + 1) % 1;

/**
 * The pixels of the vortex within the ellipse of radii `wide` and `high` (art pixels across and up from the ring's
 * middle), at `time`: its deep fills the ellipse, then its form is laid over it.
 */
export function vortex(time: number, wide: number, high: number, form: VortexForm = 'spiral'): VortexCell[] {
  const cells = new Map<string, VortexCell>();
  const set = (across: number, up: number, tone: 0 | 1 | 2, alpha: number) => {
    if (ellipseDistance(across, up, wide, high) <= 1) cells.set(`${across},${up}`, { across, up, tone, alpha });
  };
  for (let up = -high; up <= high; up++) for (let across = -wide; across <= wide; across++) {
    const distance = ellipseDistance(across, up, wide, high);
    if (distance > 1) continue;
    set(across, up, 0, 0.5 + 0.35 * (1 - distance));
    if (form === 'ripple' || form === 'tunnel') {
      // rings a third of the radius apart, spreading out (or drawn in), each a pixel or two thick
      const wave = wrap(distance * 3 + (form === 'ripple' ? -1 : 1) * time / 900);
      if (distance < 0.14) set(across, up, 2, 0.95);
      else if (wave < 0.3) set(across, up, form === 'tunnel' && Math.floor(distance * 3 + time / 900) % 2 ? 2 : 1, 0.9 - distance * 0.3);
    }
  }
  if (form === 'spiral') {
    // three arms winding in, turning
    for (let arm = 0; arm < 3; arm++) for (let distance = 0.05; distance <= 1; distance += 0.03) {
      const angle = (arm * Math.PI * 2) / 3 + distance * 5.5 - time / 240;
      set(Math.round(Math.cos(angle) * distance * wide), Math.round(Math.sin(angle) * distance * high), distance < 0.35 ? 2 : 1, 0.95 - distance * 0.35);
    }
  }
  if (form === 'rain') {
    // a column of code falling down each other column, at its own pace: a bright head and a trail fading behind it
    for (let across = -wide; across <= wide; across++) {
      if (scatter(across + 40) < 0.25) continue;
      const fall = 2 * high + 10;
      const head = Math.round(high - wrap(time / (1400 + scatter(across) * 1600) + scatter(across + 7)) * fall);
      for (let trail = 0; trail < 6; trail++) set(across, head + trail, trail ? 1 : 2, trail ? 0.9 - trail * 0.12 : 1);
    }
  }
  if (form === 'warp') {
    // stars coming from the middle and rushing out, faster and brighter as they go, a streak behind each
    set(0, 0, 2, 0.8);
    for (let star = 0; star < 22; star++) {
      const angle = star * 2.4;
      const reach = wrap(time / (1500 + scatter(star) * 900) + scatter(star + 3)) ** 2;
      for (const [behind, tone] of [[0.12, 1], [0, reach > 0.35 ? 2 : 1]] as const) {
        const at = Math.max(0, reach - behind);
        set(Math.round(Math.cos(angle) * at * wide), Math.round(Math.sin(angle) * at * high), tone, 0.4 + reach * 0.6);
      }
    }
  }
  return [...cells.values()];
}

/** Motes of light coming out of the ring into the room, fading: how far out (tiles), across and up from its middle (art pixels). */
const MOTES = 10;
const DRIFT_MS = 1600;
export function portalMotes(time: number, radius: number): { out: number; across: number; up: number; alpha: number }[] {
  return Array.from({ length: MOTES }, (_, index) => {
    const phase = ((time / DRIFT_MS) + index / MOTES) % 1;
    const angle = index * 2.4;
    const spread = radius * 0.6;
    return { out: phase * 1.3, across: Math.round(Math.cos(angle) * spread * (0.4 + phase)), up: Math.round(Math.sin(angle) * spread * 0.6 - phase * radius * 0.7), alpha: 1 - phase };
  });
}

/**
 * What comes out of a ring, by theme: the office's motes of light, stars twinkling around it, leaves (or petals)
 * falling from its top, bubbles rising, sea spray thrown out, sparks off a frayed cable, fireflies wandering about.
 */
export type ParticleKind = 'motes' | 'stars' | 'leaves' | 'bubbles' | 'spray' | 'sparks' | 'fireflies';
/** How a particle is drawn: one square, a leaf of two (`flip`: on its other side), a bubble's ring, a star's cross, a dot with a halo. */
export type ParticleShape = 'dot' | 'leaf' | 'bubble' | 'star' | 'glow';
export interface Particle {
  /** tiles out of the ring's plane, towards its face */
  out: number;
  /** art pixels across and up from the ring's middle */
  across: number;
  up: number;
  alpha: number;
  /** which of the theme's colours (wrapped round) */
  colour: number;
  shape: ParticleShape;
  flip?: boolean;
}

/** Where the cellar's frayed cable hangs off its ring, across and up from the middle: its sparks fly from there. */
export const SPARK_SOURCE = { across: 11, up: 9 } as const;

/** The ring the particles come out of: its radii, and how far down the floor is (art pixels from its middle, negative). */
export interface RingSize { wide: number; high: number; floor: number }

/** The particles of a ring at `time`. */
export function portalParticles(kind: ParticleKind, time: number, { wide, high, floor }: RingSize): Particle[] {
  const each = (count: number, period: number, make: (index: number, age: number, cycle: number) => Particle | null) =>
    Array.from({ length: count }, (_, index) => {
      const clock = time / period + index / count;
      return make(index, wrap(clock), Math.floor(clock));
    }).filter((particle): particle is Particle => particle !== null);
  switch (kind) {
    case 'motes':
      return portalMotes(time, high).map((mote) => ({ ...mote, colour: mote.alpha > 0.6 ? 0 : 1, shape: 'dot' }));
    case 'stars':
      return each(10, 4200, (index, age, cycle) => {
        const angle = index * 2.4 + cycle * 0.7;
        const reach = 1.15 + scatter(index + cycle * 11) * 0.35;
        const alpha = Math.sin(age * Math.PI);
        return { out: age * 0.7, across: Math.round(Math.cos(angle) * wide * reach), up: Math.round(Math.sin(angle) * high * reach), alpha, colour: index, shape: alpha > 0.75 ? 'star' : 'dot' };
      });
    case 'leaves':
      // from over the top of the ring down to the floor, swaying and turning over, lying a moment before they go
      return each(12, 5600, (index, age, cycle) => {
        const top = high + 3;
        const sway = Math.sin(age * 10 + index * 1.3);
        const fall = Math.min(1, age / 0.88);
        return {
          out: 0.05 + fall * (0.25 + scatter(index * 3 + cycle) * 0.8),
          across: Math.round((scatter(index + cycle * 7) * 2 - 1) * (wide + 2) + sway * 3),
          up: Math.round(top - fall * (top - floor)),
          alpha: age < 0.88 ? 1 : (1 - age) / 0.12,
          colour: index + cycle,
          shape: 'leaf',
          flip: age < 0.88 && sway > 0,
        };
      });
    case 'bubbles':
      return each(9, 2800, (index, age, cycle) => ({
        out: 0.15 + scatter(index * 5 + cycle) * 0.7,
        across: Math.round((scatter(index + cycle * 13) * 2 - 1) * (wide - 2) + Math.sin(age * 9 + index) * 1.5),
        up: Math.round(-high * 0.6 + age * (high * 1.6 + 8)),
        alpha: age < 0.85 ? 0.9 : (1 - age) / 0.15 * 0.9,
        colour: index,
        shape: index % 3 ? 'dot' : 'bubble',
      }));
    case 'spray':
      // droplets thrown out of the lower half of the ring, falling back in an arc
      return each(12, 1500, (index, age, cycle) => {
        const from = (scatter(index + cycle * 5) * 2 - 1) * wide * 0.8;
        return {
          out: age * (0.6 + scatter(index * 2 + cycle) * 0.7),
          across: Math.round(from * (1 + age * 0.4)),
          up: Math.round(-high * 0.2 + scatter(index * 7 + cycle) * high * 0.4 + age * 12 - age * age * 26),
          alpha: 1 - age,
          colour: index,
          shape: 'dot',
        };
      });
    case 'sparks':
      // bursts off the cable's end, each spark falling fast, then nothing for a while
      return each(8, 1100, (index, age, cycle) => {
        const flight = age / 0.55;
        if (flight > 1 || scatter(cycle + index * 0.01) < 0.35) return null;
        const side = scatter(index + cycle * 3) * 2 - 1;
        return {
          out: flight * 0.35,
          across: Math.round(SPARK_SOURCE.across + side * flight * 9),
          up: Math.round(SPARK_SOURCE.up + flight * 5 - flight * flight * 24),
          alpha: 1 - flight * 0.7,
          colour: index,
          shape: 'dot',
        };
      });
    case 'fireflies':
      return Array.from({ length: 8 }, (_, index) => ({
        out: 0.35 + 0.3 * Math.sin(time / 2100 + index * 2.1),
        across: Math.round(Math.sin(time / (1700 + index * 230) + index * 2) * (wide + 4)),
        up: Math.round(Math.cos(time / (2300 + index * 170) + index * 3) * high * 0.9 + 2),
        alpha: Math.max(0, Math.sin(time / 520 + index * 1.7)) ** 2,
        colour: index,
        shape: 'glow',
      }));
  }
}
