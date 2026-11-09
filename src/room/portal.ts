// The teleporter between the office and the automatons' room: the light rising from its ring, and the column of light
// that takes someone away or brings them in (the user, the pet). Pure logic, no clock of its own: it steps with the room.

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

/**
 * The vortex turning inside the ring: its pixels within the ellipse of radii `wide` and `high` (art pixels across and
 * up from the ring's middle), each with its tone (0 the deep of it, 1 the arms of the spiral, 2 their bright heart)
 * and how much it shows.
 */
export function vortex(time: number, wide: number, high: number): { across: number; up: number; tone: 0 | 1 | 2; alpha: number }[] {
  const cells = new Map<string, { across: number; up: number; tone: 0 | 1 | 2; alpha: number }>();
  for (let up = -high; up <= high; up++) for (let across = -wide; across <= wide; across++) {
    const distance = ellipseDistance(across, up, wide, high);
    if (distance <= 1) cells.set(`${across},${up}`, { across, up, tone: 0, alpha: 0.5 + 0.35 * (1 - distance) });
  }
  // three arms winding in, turning
  for (let arm = 0; arm < 3; arm++) for (let distance = 0.05; distance <= 1; distance += 0.03) {
    const angle = (arm * Math.PI * 2) / 3 + distance * 5.5 - time / 240;
    const across = Math.round(Math.cos(angle) * distance * wide), up = Math.round(Math.sin(angle) * distance * high);
    if (ellipseDistance(across, up, wide, high) > 1) continue;
    cells.set(`${across},${up}`, { across, up, tone: distance < 0.35 ? 2 : 1, alpha: 0.95 - distance * 0.35 });
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
