// The room dressed as a treehouse in an enchanted forest (themes/kit.ts): walls of logs with ivy, lanterns and strings
// of fireflies (forest-walls.ts), raw planks with moss, roots and fallen leaves on a chunk of earth floating in the air
// (forest-floor.ts), a round door, round windows on the forest, a cuckoo clock and a stained glass of leaves
// (forest-openings.ts), furniture of wood, moss and mushrooms (forest-furniture.ts), the treetops behind
// (forest-sky.ts), and what glows and moves (forest-effects.ts). Warm under the leaves by day, green blue at night.
import { FOREST_PALETTE as F } from '../../design/theme-forest.ts';
import { mix, rgb, type Lighting } from '../lighting.ts';
import type { ThemeKit } from './kit.ts';
import { forestEffects, forestLights } from './forest-effects.ts';
import { paintFloatingEarth, paintForestFloor } from './forest-floor.ts';
import { FOREST_FURNITURE } from './forest-furniture.ts';
import { paintCuckooClock, paintRoundDoor, paintRoundWindow, paintStainedGlass } from './forest-openings.ts';
import { paintForestSky, paintForestSkyMotion } from './forest-sky.ts';
import { paintForestWalls } from './forest-walls.ts';

/** The light under the leaves: golden by day, a deep green blue at night. */
function forestLighting(lighting: Lighting): Lighting {
  const night = lighting.stars;
  const tint = mix(mix(lighting.tint, rgb(F.tintDay), (1 - night) * 0.8), rgb(F.tintNight), night * 0.5);
  return { ...lighting, tint };
}

export const FOREST: ThemeKit = {
  structure: F,
  paintWalls: paintForestWalls,
  paintFloor: paintForestFloor,
  rugs: false,
  paintSlab: paintFloatingEarth,
  paintDoor: paintRoundDoor,
  paintWindow: paintRoundWindow,
  paintClock: paintCuckooClock,
  paintTv: paintStainedGlass,
  paintSky: paintForestSky,
  paintSkyMotion: paintForestSkyMotion,
  skyFrameMs: 150,
  // the windows are round: a straight shaft from their wall would veil them
  wallBeam: false,
  furniture: FOREST_FURNITURE,
  lighting: forestLighting,
  lights: (layout) => forestLights(layout),
  effects: forestEffects,
  // the doorway's light would only paint a hard band over the planks: the lanterns light the room
  screenLight: F.lightFirefly,
  doorLight: false,
};
