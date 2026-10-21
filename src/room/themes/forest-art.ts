// Small tools shared by the forest's walls, sky and effects (forest.ts, forest-sky.ts, forest-effects.ts).
import type { Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting } from '../lighting.ts';
import { ART_SCALE } from '../pixel-art.ts';
import { pick } from '../sky.ts';

type Context = CanvasRenderingContext2D;

/** One art pixel at an art point. */
export function dot(context: Context, point: Point, colour: string, alpha = 1) {
  context.globalAlpha = alpha;
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
  context.globalAlpha = 1;
}

/** An art pixel (or `size` of them) at a room point, on the art grid: what the effects paint every frame. */
export function roomDot(context: Context, point: Point, colour: string, alpha: number, size = 1) {
  if (alpha <= 0.01) return;
  context.globalAlpha = Math.min(1, alpha);
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE * size, ART_SCALE * size);
}

/** Smooth noise from 0 to 1: random values on a grid of `size` pixels, blended between them. */
export function noise(key: string, x: number, y: number, size: number): number {
  const gx = Math.floor(x / size), gy = Math.floor(y / size), fx = x / size - gx, fy = y / size - gy;
  const at = (i: number, j: number) => pick(`${key}${gx + i},${gy + j}`, 1000) / 1000;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * ease(fx), bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * ease(fx);
  return top + (bottom - top) * ease(fy);
}

/**
 * A colour as the light of the hour shows it: what the effects paint comes after the light, so what should not glow
 * takes the room's tint itself (a pendulum, a falling leaf).
 */
export function underLight(colour: string, lighting: Lighting): string {
  const [red, green, blue] = rgb(colour);
  const [tintRed, tintGreen, tintBlue] = lighting.tint;
  return css([Math.round((red * tintRed) / 255), Math.round((green * tintGreen) / 255), Math.round((blue * tintBlue) / 255)]);
}

/** Between two colours, as css. */
export const blend = (from: string, to: string, share: number) => css(mix(rgb(from), rgb(to), Math.max(0, Math.min(1, share))));
