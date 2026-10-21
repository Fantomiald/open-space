// What opens in the treehouse's walls and hangs on them (forest.ts), at art resolution: the round door with its green
// leaf ajar, a big round window on the forest for each window (trunks and leaves in layers, sunbeams by day, the Moon and
// fireflies at night), a carved cuckoo clock, and in the lounge a stained glass of leaves.
import { FOREST_PALETTE as F } from '../../design/theme-forest.ts';
import type { WallItem } from '../../../shared/room-layout.ts';
import { css, mix, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { fillPolygon, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { line, onWall, onWallAt, type Context } from '../wall-art.ts';
import { dot, noise } from './forest-art.ts';

/** Every pixel of an ellipse on a wall: `paint` gets its offsets from the middle and how far out it is (1 on its edge). */
function ellipseOnWall(radiusAlong: number, radiusUp: number, paint: (across: number, up: number, distance: number) => void) {
  for (let up = -Math.ceil(radiusUp); up <= Math.ceil(radiusUp); up++) for (let across = -Math.ceil(radiusAlong); across <= Math.ceil(radiusAlong); across++) {
    const distance = Math.hypot(across / radiusAlong, up / radiusUp);
    if (distance <= 1) paint(across, up, distance);
  }
}

/* The door */

/** The round door: a frame of radiating planks set in stones, the dark doorway with the green leaf ajar inside it. */
export function paintRoundDoor(context: Context, from: number, to: number, height: number) {
  const middle = (from + to) / 2, centre = height / 2;
  const at = (across: number, up: number) => onWallAt('left', middle + across / 8, centre + up);
  const outer = { along: (to - from) * 4 + 4, up: height / 2 + 4 };
  // stones around it
  ellipseOnWall(outer.along + 2, outer.up + 2, (across, up, distance) => {
    if (centre + up < 0) return;
    const angle = Math.atan2(up, across);
    const stone = Math.floor((angle + Math.PI) / (Math.PI / 9));
    const seam = Math.abs(((angle + Math.PI) / (Math.PI / 9)) % 1 - 0.5) > 0.42;
    if (distance > outer.along / (outer.along + 2) - 0.02) dot(context, at(across, up), seam ? F.doorStoneDark : stone % 2 ? F.doorStone : tones(F.doorStone).light);
  });
  // the frame: planks radiating from the middle
  ellipseOnWall(outer.along, outer.up, (across, up, distance) => {
    if (centre + up < 0) return;
    const angle = Math.atan2(up, across);
    const seam = Math.abs(((angle + Math.PI) / (Math.PI / 12)) % 1 - 0.5) > 0.44;
    const lit = -across * 0.5 + up > 0;
    dot(context, at(across, up), seam ? F.frameDark : distance > 0.93 ? F.frameDark : lit ? F.frameLight : F.frame);
  });
  // the doorway, a warm light far in, and the green leaf open against its side
  const inner = { along: outer.along - 3, up: outer.up - 3 };
  ellipseOnWall(inner.along, inner.up, (across, up) => {
    const z = centre + up;
    if (z < 0) return;
    let colour = z < 4 ? tones(F.doorLight).dark : F.doorway;
    if (across < -inner.along * 0.35) {
      const plank = Math.floor((across + inner.along) / 2.2);
      colour = (across + inner.along) % 2.2 < 0.6 ? F.doorDark : plank % 2 ? F.doorPlank : F.door;
    }
    dot(context, at(across, up), colour);
  });
  const knob = at(-inner.along * 0.62, -1);
  dot(context, knob, F.brass);
  dot(context, { x: knob.x, y: knob.y - 1 }, tones(F.brass).light);
}

/* The windows */

const WINDOW = { z: 27, glass: 11, frame: 13.5 };
/** Where the Moon shows in the last window, from its middle. */
const MOON = { across: 4, up: 5 };

/** The forest at a pixel of a window (`gx` across from its middle, `gz` up from it): day mixed into night. */
function forestAt(gx: number, gz: number, lighting: Lighting, seed: number, moon: boolean): Rgb {
  const day = 1 - lighting.stars;
  const x = gx + 40 + seed * 41;
  const height = (gz + WINDOW.glass) / (WINDOW.glass * 2);
  const sky = mix(mix(lighting.skyBottom, lighting.skyTop, height), rgb(F.forestHaze), 0.3 * day);
  const pickLayer = (dayColour: string, nightColour: string) => mix(rgb(nightColour), rgb(dayColour), day);
  // from near to far: leaves hanging from above, the treetops below, a big trunk, far trunks in the haze
  const hanging = gz > WINDOW.glass - 2 - noise('hang', x, 0, 3) * 4;
  const near = gz < -8 + noise('near', x, 0, 4) * 4;
  const trunk = Math.abs(((x + 30) % 47) - 6) < 2;
  const mid = gz < -4 + noise('mid', x, 0, 5) * 5;
  const farTrunk = (x % 11) < 2 && noise('farTrunk', x, 0, 11) > 0.45;
  const leafy = (key: string, colour: Rgb) => (pick(`${key}${x},${gz}`, 6) === 0 ? mix(colour, rgb(F.canopyLit), 0.35 * day) : colour);
  if (hanging) return leafy('h', pickLayer(F.forestNear, F.nightNear));
  if (near) return leafy('n', pickLayer(F.forestMid, F.nightMid));
  if (trunk) return mix(pickLayer(F.forestTrunk, F.nightNear), [0, 0, 0], ((x + 30) % 47) > 6 ? 0.25 : 0);
  if (mid) return leafy('m', mix(pickLayer(F.forestFar, F.nightFar), sky, 0.25));
  if (farTrunk) return mix(pickLayer(F.forestTrunkFar, F.nightFar), sky, 0.45);
  if (moon && lighting.stars > 0.3) {
    const distance = Math.hypot(gx - MOON.across, gz - MOON.up);
    if (distance < 3.6) return mix(sky, rgb(gx - MOON.across + gz - MOON.up > 2 ? F.moonShade : F.moon), Math.min(1, lighting.stars * 1.4));
  }
  if (lighting.stars > 0.3 && pick(`star${x},${gz}`, 23) === 0) return mix(sky, rgb(F.star), lighting.stars * 0.8);
  // sunbeams slanting through the leaves
  if (day > 0.3 && ((gx + gz + 400) % 13) < 3) return mix(sky, rgb(F.sunRay), 0.45 * day);
  return sky;
}

/** A window of the back wall as one big round window: a frame of wood lit from the top left, a cross dividing it, the forest behind. */
export function paintRoundWindow(context: Context, item: WallItem, lighting: Lighting, index: number, count: number) {
  const centre = item.fromX + item.width / 2;
  const reach = Math.ceil(WINDOW.frame);
  for (let up = -reach; up <= reach; up++) for (let across = -reach; across <= reach; across++) {
    const distance = Math.hypot(across, up);
    if (distance > WINDOW.frame) continue;
    const at = onWallAt('back', centre + across / 8, WINDOW.z + up);
    if (distance > WINDOW.glass) {
      const toward = (-across * 0.6 + up * 0.6) / distance;
      const seam = pick(`frame${Math.round(Math.atan2(up, across) * 4)}`, 5) === 0 && distance < WINDOW.frame - 1.2;
      dot(context, at, distance > WINDOW.frame - 1 ? F.frameDark : seam ? tones(F.frame).shade : toward > 0.4 ? F.frameLight : toward < -0.4 ? tones(F.frame).shade : F.frame);
    } else if (distance > WINDOW.glass - 1) dot(context, at, F.frameDark);
    else if (across === 0 || up === 0) dot(context, at, F.frame);
    else if (across === 1 || up === -1) dot(context, at, F.frameDark);
    else dot(context, at, css(forestAt(across, up, lighting, index, index === count - 1)));
  }
  // a shine on the glass, a tuft of ivy over the frame
  for (let step = 0; step < 4; step++) dot(context, onWallAt('back', centre + (-7 + step) / 8, WINDOW.z + 3 + step), F.glassShine, 0.3);
  for (let leaf = 0; leaf < 7; leaf++) {
    const angle = Math.PI * (0.55 + leaf * 0.06);
    const along = centre + (Math.cos(angle) * (WINDOW.frame - 0.5)) / 8, z = WINDOW.z + Math.sin(angle) * (WINDOW.frame - 0.5);
    dot(context, onWallAt('back', along, z), F.ivy[leaf % F.ivy.length]);
    dot(context, onWallAt('back', along, z + 1), tones(F.ivy[leaf % F.ivy.length]).light);
  }
  // the sill, a little pot of flowers on it
  fillPolygon(context, [onWallAt('back', centre - 1.1, 12), onWallAt('back', centre + 1.1, 12), onWallAt('back', centre + 1.1, 14), onWallAt('back', centre - 1.1, 14)], F.frame);
  line(context, onWallAt('back', centre - 1.1, 14), onWallAt('back', centre + 1.1, 14), F.frameLight);
  onWall(context, ['.f.f.', 'fyfyf', '.lgl.', '.ppp.', '.ppp.'], { f: F.flowers[index % 2 ? 'purple' : 'blue'], y: F.flowers.amber, l: F.ivy[1], g: F.ivy[0], p: F.doormat }, 'back', centre + 0.5, 14);
}

/* The cuckoo clock */

const PINE_CONE = ['.c.', 'cdc', 'dcd', 'cdc', '.d.'];

/** The clock as a carved cuckoo clock: a little house under its roof, a leaf on top, the bird's door, the dial, weights on chains. */
export function paintCuckooClock(context: Context, item: WallItem, hour: number) {
  const centre = item.fromX + item.width / 2;
  const quad = (from: number, to: number, low: number, high: number, colour: string) =>
    fillPolygon(context, [onWallAt('back', centre + from, low), onWallAt('back', centre + to, low), onWallAt('back', centre + to, high), onWallAt('back', centre + from, high)], colour);
  // chains and their pine cones, the pendulum
  for (const [across, bottom] of [[-0.3, 15], [0.35, 18]] as const) {
    for (let z = bottom + 5; z < 25; z++) dot(context, onWallAt('back', centre + across, z), z % 2 ? F.chain : tones(F.chain).dark);
    onWall(context, PINE_CONE, { c: F.pineCone, d: F.pineConeDark }, 'back', centre + across - 1 / 8, bottom);
  }
  for (let z = 17; z < 25; z++) dot(context, onWallAt('back', centre + 0.05, z), F.chain);
  onWall(context, ['.ll.', 'llll', 'lLLl', '.ll.'], { l: F.cuckooLeaf, L: tones(F.cuckooLeaf).light }, 'back', centre - 1 / 8, 14);
  // the house, its carved trim and the roof
  quad(-0.85, 0.85, 24, 38, F.cuckoo);
  quad(-0.85, 0.85, 24, 25.5, F.cuckooDark);
  for (const across of [-0.85, 0.72]) quad(across, across + 0.13, 24, 38, F.frame);
  line(context, onWallAt('back', centre - 0.85, 25.5), onWallAt('back', centre + 0.85, 25.5), F.frameLight);
  // the roof: shingles of moss, its edges lit, overhanging the house
  for (let z = 37; z <= 47; z++) {
    const half = 1.3 * (47 - z) / 10;
    line(context, onWallAt('back', centre - half, z), onWallAt('back', centre + half, z), z % 2 ? F.cuckooRoof : tones(F.cuckooRoof).shade);
  }
  line(context, onWallAt('back', centre - 1.3, 37), onWallAt('back', centre, 47), tones(F.cuckooRoof).light);
  line(context, onWallAt('back', centre, 47), onWallAt('back', centre + 1.3, 37), tones(F.cuckooRoof).dark);
  line(context, onWallAt('back', centre - 1.3, 36), onWallAt('back', centre + 1.3, 36), F.cuckooDark);
  onWall(context, ['.l.l.', 'lLlLl', '.lLl.', '..l..'], { l: F.cuckooLeaf, L: tones(F.cuckooLeaf).light }, 'back', centre - 2 / 8, 46);
  // the bird's door, the bird looking out
  quad(-0.2, 0.2, 38.5, 42, F.cuckooDark);
  onWall(context, ['.bb.', 'bkbo', '.bb.'], { b: F.cuckooBird, k: F.lead, o: F.brass }, 'back', centre - 2 / 8, 39);
  // the dial and its hands
  const dial = onWallAt('back', centre, 31);
  for (let up = -5; up <= 5; up++) for (let across = -5; across <= 5; across++) {
    const distance = Math.hypot(across, up);
    if (distance <= 5.2) dot(context, { x: dial.x + across, y: dial.y - up }, distance > 4.3 ? F.cuckooDark : F.dial);
  }
  for (const [across, up] of [[0, 3], [3, 0], [0, -3], [-3, 0]] as const) dot(context, { x: dial.x + across, y: dial.y - up }, tones(F.dial).dark);
  const hand = (turns: number, length: number) => line(context, dial, { x: dial.x + Math.sin(turns * Math.PI * 2) * length, y: dial.y - Math.cos(turns * Math.PI * 2) * length }, F.clockHands);
  hand((hour % 12) / 12, 2.4);
  hand(hour % 1, 3.6);
}

/* The stained glass of the lounge */

interface Pane { colour: string; id: number }

/** A leaf of the stained glass, around (cu, cz), `length` long, tilted by `angle`: its halves and its veins, or nothing. */
function leafPane(u: number, z: number, cu: number, cz: number, length: number, width: number, angle: number, shade: number): Pane | null {
  const du = u - cu, dz = z - cz;
  const along = du * Math.sin(angle) + dz * Math.cos(angle);
  const across = du * Math.cos(angle) - dz * Math.sin(angle);
  const share = along / length + 0.5;
  if (share < 0 || share > 1) return null;
  const half = width * Math.sin(share * Math.PI) ** 0.8;
  if (Math.abs(across) > half) return null;
  const side = across < 0 ? 0 : 1;
  const vein = Math.floor((along - Math.abs(across) * 0.9 + length) / 4);
  return { colour: F.stainedLeaves[(shade + side * 2) % F.stainedLeaves.length], id: 1000 + shade * 100 + side * 50 + vein };
}

/** Which pane a point of the glass is in (`u` across from the middle, `z` up): the leaves first, then rays of light around them. */
function paneAt(u: number, z: number, halfWidth: number): Pane {
  const leaves = [
    leafPane(u, z, 0, 29, 24, 7, 0, 0),
    leafPane(u, z, -10, 24, 15, 4.5, -0.75, 1),
    leafPane(u, z, 10, 24, 15, 4.5, 0.75, 3),
  ];
  for (const leaf of leaves) if (leaf) return leaf;
  const angle = Math.atan2(z - 15, u);
  const sector = Math.floor(angle / (Math.PI / 10));
  const reach = Math.hypot(u / halfWidth, (z - 15) / 29);
  const ring = reach < 0.55 ? 0 : reach < 0.82 ? 1 : 2;
  const colours = ring === 2 ? F.stainedSky : F.stainedLight;
  return { colour: colours[(sector + ring) % colours.length], id: sector * 3 + ring };
}

/** The lounge's screen as a tall window of stained glass under an arch: three leaves in a burst of light, lead between the panes. */
export function paintStainedGlass(context: Context, item: WallItem) {
  const centre = item.fromX + item.width / 2;
  const halfWidth = item.width * 4 - 2;
  const inside = (u: number, z: number, margin: number) => {
    if (z < 14 + margin || Math.abs(u) > halfWidth - margin) return false;
    return z <= 34 || (u / (halfWidth - margin)) ** 2 + ((z - 34) / (10 - margin)) ** 2 <= 1;
  };
  for (let z = 12; z <= 46; z++) for (let u = -halfWidth - 2; u <= halfWidth + 2; u++) {
    if (!inside(u, z, -2)) continue;
    const at = onWallAt('back', centre + u / 8, z);
    if (!inside(u, z, 0)) {
      const lit = -u * 0.3 + (z - 30) > 0;
      dot(context, at, inside(u, z, -1) ? (lit ? F.frameLight : F.frame) : F.frameDark);
      continue;
    }
    const pane = paneAt(u, z, halfWidth);
    const lead = paneAt(u + 1, z, halfWidth).id !== pane.id || paneAt(u, z + 1, halfWidth).id !== pane.id || !inside(u, z, 1);
    const glint = pick(`glint${u},${z}`, 17) === 0;
    dot(context, at, lead ? F.lead : glint ? tones(pane.colour).light : pane.colour);
  }
  // the sill under it
  fillPolygon(context, [onWallAt('back', centre - item.width / 2 - 0.1, 11), onWallAt('back', centre + item.width / 2 + 0.1, 11), onWallAt('back', centre + item.width / 2 + 0.1, 13), onWallAt('back', centre - item.width / 2 - 0.1, 13)], F.frame);
  line(context, onWallAt('back', centre - item.width / 2 - 0.1, 13), onWallAt('back', centre + item.width / 2 + 0.1, 13), F.frameLight);
}
