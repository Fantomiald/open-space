// The light of the room for an hour of the day: a tint over everything (neutral by day, warm at dawn and dusk, blue
// and dark at night), the sun or the moon coming through the windows, the sky they show, and how much the lamps and
// screens glow. Pure functions: draw.ts turns the result into pixels. Colours come from the room palette.
import { ROOM_PALETTE as P } from '../design/room-palette.ts';

export type Rgb = readonly [number, number, number];

export interface Lighting {
  /** multiplied over the whole room ([255, 255, 255] changes nothing) */
  tint: Rgb;
  /** 0 (no light coming in) to 1 (full midday sun) */
  beam: number;
  /** colour of what comes through the windows: sunlight by day, moonlight at night */
  beamColor: Rgb;
  /** how far the light travels across the floor for each unit of window height (long when the sun is low) */
  reach: number;
  /** sideways slant of the light on the floor, in tiles per unit of window height (morning one way, evening the other) */
  slant: number;
  skyTop: Rgb;
  skyBottom: Rgb;
  /** 0 by day, 1 in the middle of the night */
  stars: number;
  /** 0 by day, 1 when lamps and screens shine the most */
  glow: number;
}

export function rgb(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((channel) => Math.round(a[channel] + (b[channel] - a[channel]) * t)) as unknown as Rgb;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Keyframes of the day: hour, tint, sky top and bottom, stars. Between two keyframes everything blends smoothly. */
const DAY = [
  { hour: 0, tint: P.light.night, top: P.light.skyNightTop, bottom: P.light.skyNightBottom, stars: 1 },
  { hour: 5, tint: P.light.night, top: P.light.skyNightTop, bottom: P.light.skyNightBottom, stars: 1 },
  { hour: 7, tint: P.light.dawn, top: P.light.skyDawnTop, bottom: P.light.skyDawnBottom, stars: 0.2 },
  { hour: 9, tint: P.light.day, top: P.light.skyDayTop, bottom: P.light.skyDayBottom, stars: 0 },
  { hour: 17, tint: P.light.day, top: P.light.skyDayTop, bottom: P.light.skyDayBottom, stars: 0 },
  { hour: 19.5, tint: P.light.dusk, top: P.light.skyDuskTop, bottom: P.light.skyDuskBottom, stars: 0.2 },
  { hour: 21.5, tint: P.light.night, top: P.light.skyNightTop, bottom: P.light.skyNightBottom, stars: 1 },
  { hour: 24, tint: P.light.night, top: P.light.skyNightTop, bottom: P.light.skyNightBottom, stars: 1 },
];

/** Sun above the horizon from SUNRISE to SUNSET (a simple day, the same all year). */
const SUNRISE = 6.5;
const SUNSET = 20.5;

/** The hour of the clock, with its minutes as a fraction. */
export const currentHour = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60; };

export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  const next = DAY.findIndex((frame) => frame.hour > h);
  const from = DAY[Math.max(0, next - 1)];
  const to = DAY[next === -1 ? DAY.length - 1 : next];
  const t = to.hour === from.hour ? 0 : smooth((h - from.hour) / (to.hour - from.hour));

  // the sun's height: 0 at sunrise and sunset, 1 at the middle of the day
  const daylight = h > SUNRISE && h < SUNSET ? Math.sin(Math.PI * (h - SUNRISE) / (SUNSET - SUNRISE)) : 0;
  const stars = from.stars + (to.stars - from.stars) * t;
  const moon = stars * 0.35;
  const beam = Math.max(daylight, moon);
  return {
    tint: mix(rgb(from.tint), rgb(to.tint), t),
    beam,
    beamColor: daylight >= moon ? mix(rgb(P.light.sunLow), rgb(P.light.sun), Math.min(1, daylight * 1.6)) : rgb(P.light.moon),
    // a low sun throws the light far across the floor; at midday it falls close to the wall
    reach: daylight > 0 ? 0.35 + 1.4 * (1 - daylight) : 0.8,
    slant: daylight > 0 ? ((h - (SUNRISE + SUNSET) / 2) / ((SUNSET - SUNRISE) / 2)) * 0.9 : 0.2,
    skyTop: mix(rgb(from.top), rgb(to.top), t),
    skyBottom: mix(rgb(from.bottom), rgb(to.bottom), t),
    stars,
    glow: Math.min(1, stars * 1.1),
  };
}

export const css = (color: Rgb, alpha = 1) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
