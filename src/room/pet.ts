// The office pet (Preferences.pet): a cat, a dog or Rocky. It wanders from one free tile to another, sits, washes (or
// pants, or tinkers), sleeps, and says something now and then (or when it is clicked), each in its own way. The logic
// is pure and steps with the room; the pet is drawn in pixel art like the people.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { CatPattern, DogBreed, PetChoice, PetColors } from '../../shared/pets.ts';
import type { Floor } from './floor.ts';
import { ROOM, tileCenter, type Point } from './geometry.ts';
import { advanceAlong, type Mover } from './paths.ts';
import { ART_SCALE, artCanvas, outline, tones, type Tones } from './pixel-art.ts';

export type PetActivity = 'walk' | 'sit' | 'wash' | 'sleep';

export interface Pet extends Mover {
  activity: PetActivity;
  /** the pet's own clock, in ms */
  time: number;
  /** when the current activity ends (for everything but walking) */
  until: number;
  /** while time < speakUntil, it says something (`line` of its kind's lines) */
  speakUntil: number;
  nextSpeech: number;
  line: number;
  /** when each heart floating up from a cuddle was born (pet time) */
  hearts: number[];
}

/** Tiles per second: a pet strolls. */
const PET_SPEED = 1.5;
const SPEECH_MS = 1800;

export function createPet(start: Point = { x: 7.5, y: 10.5 }): Pet {
  return { position: start, heading: { x: 1, y: 0 }, path: [], activity: 'sit', time: 0, until: 4000, speakUntil: 0, nextSpeech: 9000, line: 0, hearts: [] };
}

/** A free tile somewhere in the room (not a seat), to stroll to. */
function somewhereFree(floor: Floor, random: () => number): Point {
  const seats = new Set(floor.layout.seats.map((seat) => `${Math.floor(seat.x)},${Math.floor(seat.y)}`));
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = Math.floor(random() * ROOM.width), y = Math.floor(random() * ROOM.depth);
    if (floor.isFreeTile(x, y) && !seats.has(`${x},${y}`) && x > 0) return tileCenter({ x, y });
  }
  return { x: 7.5, y: 10.5 };
}

/** What each kind says: a cat meows, a dog barks, the rubber duck listens to your bug, Rocky speaks like Rocky (in chords, his words three times over). */
const LINES: Readonly<Record<Exclude<PetChoice['kind'], 'none'>, readonly string[]>> = {
  cat: ['Miaou !', 'Mrrrr…', 'Miaou ?', 'Mraou !'],
  dog: ['Ouaf ouaf !', 'Wouf !', 'Ouaf ?', 'Ouaf ouaf ouaf !'],
  duck: ['Coin coin !', 'Coin ?', 'Explique-moi ton bug.', 'Coin.'],
  capybara: ['Tranquille.', 'Mmh.', 'Zen.', '…'],
  axolotl: ['Blub !', 'Bloup.', 'Blub blub ?'],
  rocky: ['♫ Amaze! Amaze! Amaze!', '♫ Fist my bump.', '♫ Good good good.', '♫ Happy happy happy!', '♫ You are friend, question?'],
};

/** What the pet says now, for its kind. */
export function petWords(pet: Pet, kind: Exclude<PetChoice['kind'], 'none'>): string {
  const lines = LINES[kind];
  return lines[pet.line % lines.length];
}

export function speak(pet: Pet, random: () => number = Math.random) {
  pet.speakUntil = pet.time + SPEECH_MS;
  pet.line = Math.floor(random() * 1000);
  if (pet.activity === 'sleep') { pet.activity = 'sit'; pet.until = pet.time + 3000; }
}

const HEART_MS = 1600;
/** A cuddle: it speaks, stops to enjoy it, and little hearts float up. */
export function cuddle(pet: Pet) {
  speak(pet);
  if (pet.activity === 'walk') { pet.path = []; pet.activity = 'sit'; }
  pet.until = Math.max(pet.until, pet.time + 4000);
  pet.hearts.push(...[0, 180, 360, 540].map((delay) => pet.time + delay));
}

export function stepPet(pet: Pet, ms: number, floor: Floor, random: () => number = Math.random) {
  pet.time += ms;
  if (pet.activity === 'walk') {
    if (advanceAlong(pet, PET_SPEED * ms / 1000) || !pet.path.length) {
      const roll = random();
      pet.activity = roll < 0.55 ? 'sit' : roll < 0.8 ? 'wash' : 'sleep';
      pet.until = pet.time + (pet.activity === 'sleep' ? 14000 + random() * 16000 : 3000 + random() * 6000);
    }
  } else if (pet.time >= pet.until) {
    pet.activity = 'walk';
    pet.path = floor.route(pet.position, somewhereFree(floor, random));
  }
  pet.hearts = pet.hearts.filter((born) => pet.time - born < HEART_MS);
  if (pet.activity !== 'sleep' && pet.time >= pet.nextSpeech) {
    speak(pet, random);
    pet.nextSpeech = pet.time + 18000 + random() * 22000;
  }
}

export const isSpeaking = (pet: Pet) => pet.time < pet.speakUntil;

/* Drawing */

const C = ROOM_PALETTE.pet;
const CANVAS = { width: 22, height: 17 };
/** Where the paws touch the floor on the canvas. */
const FEET = { x: 10, y: 15 };

type Paint = (x: number, y: number, width: number, height: number, colour: string) => void;
type Dot = (x: number, y: number, colour: string) => void;
type Drawn = Exclude<PetChoice, { kind: 'none' }>;

/** The fur a pet is drawn in: the one the user picked, else its pattern's, breed's or kind's. */
export function furOf(choice: Drawn): string {
  if (choice.colors?.fur) return choice.colors.fur;
  switch (choice.kind) {
    case 'cat': return C.cats[choice.variant];
    case 'dog': return C.dogs[choice.variant];
    case 'rocky': return C.rocky.shell;
    default: return C[choice.kind];
  }
}

/** A cat facing right; `frame` alternates the legs when walking and flicks the tail otherwise. */
function paintCat(R: Paint, P: Dot, pattern: CatPattern, colors: PetColors, fur: Tones, activity: PetActivity, frame: 0 | 1) {
  const eyes = colors.eyes ?? C.cats.eyes;
  const belly = pattern === 'tuxedo' || pattern === 'calico' ? C.white : fur.light;
  const paws = pattern === 'tuxedo' ? C.white : fur.light;
  const stripes = (spots: readonly (readonly [number, number, number])[]) => {
    if (pattern === 'tabby') for (const [x, y, height] of spots) R(x, y, 1, height, fur.dark);
    if (pattern === 'calico') { const [[x, y], [x2, y2]] = spots; R(x - 1, y, 3, 2, C.cats.patchA); R(x2, y2, 2, 2, C.cats.patchB); }
  };
  if (activity === 'walk') {
    // legs and their paws, the body lit along the back, the head held up, the tail raised
    for (const x of frame ? [2, 6, 7, 11] : [3, 5, 8, 10]) { R(x, 8, 1, 3, fur.shade); P(x, 10, paws); }
    R(2, 4, 9, 4, fur.base); R(3, 4, 7, 1, fur.light); R(3, 7, 7, 1, belly);
    stripes([[4, 4, 2], [6, 4, 3], [8, 4, 2]]);
    R(9, 1, 5, 5, fur.base); R(10, 1, 2, 1, fur.light);
    P(9, 0, fur.base); P(10, 0, C.earInside); P(13, 0, fur.base); P(12, 0, C.earInside);
    if (pattern === 'tuxedo') R(12, 4, 2, 2, C.white);
    if (pattern === 'tabby') { P(10, 2, fur.dark); P(11, 1, fur.dark); }
    P(12, 3, eyes); P(14, 4, C.nose); P(13, 5, fur.shade); P(15, 5, fur.light);
    R(1, 3, 1, 2, fur.base); R(0, frame ? 1 : 2, 1, 2, fur.base); if (pattern === 'tabby') P(0, frame ? 1 : 2, fur.dark);
  } else if (activity === 'sleep') {
    // curled up, the tail round the front, eyes shut
    R(2, 6, 10, 4, fur.base); R(3, 5, 7, 1, fur.light); R(3, 9, 8, 1, fur.shade);
    stripes([[4, 6, 1], [6, 6, 2], [8, 6, 1]]);
    R(9, 5, 4, 4, fur.base); P(9, 4, fur.base); P(12, 4, fur.base); P(10, 5, C.earInside); R(10, 7, 2, 1, fur.dark); P(13, 7, C.nose);
    if (pattern === 'tuxedo') R(11, 8, 2, 1, C.white);
    R(1, 9, 9, 1, fur.dark);
  } else {
    // sitting up, washing a paw when 'wash'
    R(4, 4, 6, 6, fur.base); R(4, 4, 2, 5, fur.light); R(8, 5, 2, 4, belly); R(4, 9, 6, 1, fur.shade);
    stripes([[5, 5, 1], [5, 7, 1], [6, 6, 1]]);
    P(5, 10, paws); P(8, 10, paws);
    const lowered = activity === 'wash' ? 1 : 0;
    R(6, lowered, 6, 5, fur.base); R(7, lowered, 3, 1, fur.light);
    P(6, lowered - 1, fur.base); P(11, lowered - 1, fur.base); P(7, lowered - 1, C.earInside); P(10, lowered - 1, C.earInside);
    if (pattern === 'tuxedo') R(8, 3 + lowered, 3, 2, C.white);
    if (pattern === 'tabby') { P(8, lowered, fur.dark); P(9, lowered, fur.dark); }
    if (activity === 'wash') { R(8, 3, 2, 1, fur.dark); R(11, 4, 2, 2, paws); P(12, 4, C.earInside); }
    else { P(8, 2, eyes); P(10, 2, eyes); P(9, 3, C.nose); P(7, 3, fur.light); P(11, 3, fur.light); }
    R(0, 9, 5, 1, fur.base); R(0, frame && activity === 'sit' ? 7 : 8, 1, frame && activity === 'sit' ? 2 : 1, fur.base);
  }
}

/** The shape and markings of each breed: ears that hang or stand, a long body, short legs, a curled tail, a flat face. */
const BREEDS: Readonly<Record<DogBreed, { pointy: boolean; long: boolean; short: boolean; curled: boolean; markings: 'none' | 'spots' | 'mask' | 'blaze' | 'black' }>> = {
  labrador: { pointy: false, long: false, short: false, curled: false, markings: 'none' },
  dalmatian: { pointy: false, long: false, short: false, curled: false, markings: 'spots' },
  husky: { pointy: true, long: false, short: false, curled: true, markings: 'mask' },
  shiba: { pointy: true, long: false, short: false, curled: true, markings: 'blaze' },
  corgi: { pointy: true, long: true, short: true, curled: false, markings: 'blaze' },
  dachshund: { pointy: false, long: true, short: true, curled: false, markings: 'none' },
  pug: { pointy: false, long: false, short: false, curled: true, markings: 'black' },
};

/** A dog facing right, a red collar and its tag; `frame` alternates the legs when walking and wags the tail otherwise; it pants when 'wash'. */
function paintDog(R: Paint, P: Dot, breed: DogBreed, fur: Tones, activity: PetActivity, frame: 0 | 1) {
  const { pointy, long, short, curled, markings } = BREEDS[breed];
  const white = markings === 'mask' || markings === 'blaze' ? C.white : fur.light;
  const muzzle = markings === 'black' ? C.black : markings === 'mask' || markings === 'blaze' ? C.white : fur.light;
  const ears = markings === 'black' ? C.black : fur.dark;
  const spot = (x: number, y: number) => { if (markings === 'spots') P(x, y, C.black); };
  if (activity === 'walk') {
    const length = long ? 12 : 9, head = long ? 12 : 9, legs = short ? 2 : 3, top = short ? 5 : 4;
    for (const x of frame ? [2, 5, length - 1, length + 1] : [3, 4, length - 2, length]) { R(x, 11 - legs, 1, legs, fur.shade); P(x, 10, fur.light); }
    R(2, top, length, 4, fur.base); R(3, top, length - 2, 1, fur.light); R(3, top + 3, length - 2, 1, white);
    spot(4, top + 1); spot(7, top); spot(9, top + 2); spot(5, top + 3);
    R(head, top - 3, 5, 5, fur.base); R(head + 1, top - 3, 2, 1, fur.light);
    R(head + 4, top - 1, 2, 2, muzzle); P(head + 5, top - 1, C.black); P(head + 3, top - 2, C.black);
    if (markings === 'mask') R(head + 1, top, 3, 2, C.white);
    if (pointy) { P(head + 1, top - 4, fur.base); P(head + 3, top - 4, fur.base); P(head + 2, top - 4, C.earInside); } else R(head + 1, top - 3, 2, 3, ears);
    spot(head + 1, top);
    // the collar round the neck, its tag hanging
    R(head, top + 1, 2, 1, C.collar); P(head + 1, top + 2, C.tag);
    if (curled) { R(1, top - 2, 2, 2, fur.base); P(2, top - 3, fur.base); P(1, top - 2, fur.light); } else { R(0, frame ? top - 2 : top - 1, 2, 1, fur.base); R(1, top, 1, 1, fur.base); }
  } else if (activity === 'sleep') {
    // lying down, the head on the paws, eyes shut
    const length = long ? 13 : 11;
    R(2, 7, length, 3, fur.base); R(3, 6, length - 3, 1, fur.light); R(3, 9, length - 2, 1, fur.shade);
    spot(4, 7); spot(7, 8); spot(10, 7);
    R(length, 6, 4, 3, fur.base); R(length + 1, 7, 2, 1, fur.dark); R(length + 3, 7, 1, 2, muzzle); P(length + 3, 7, C.black);
    if (pointy) P(length + 1, 5, fur.base); else R(length, 5, 2, 2, ears);
    P(length - 1, 7, C.collar);
    R(0, 9, 3, 1, fur.base);
  } else {
    // sitting, the tail sweeping the floor; panting, its tongue out, when 'wash'
    R(4, 4, 6, 6, fur.base); R(4, 4, 2, 5, fur.light); R(8, 5, 2, 4, white); R(4, 9, 6, 1, fur.shade);
    spot(5, 5); spot(6, 8); spot(4, 7);
    P(5, 10, fur.light); P(8, 10, fur.light);
    R(6, 0, 6, 5, fur.base); R(7, 0, 3, 1, fur.light);
    R(11, 2, 2, 2, muzzle); P(12, 2, C.black); P(9, 1, C.black);
    if (markings === 'mask') R(7, 2, 4, 2, C.white);
    if (markings === 'blaze') R(10, 1, 1, 3, C.white);
    if (pointy) { P(7, -1, fur.base); P(9, -1, fur.base); P(8, -1, C.earInside); } else R(6, 0, 2, 3, ears);
    spot(7, 1);
    R(7, 5, 4, 1, C.collar); P(9, 6, C.tag);
    if (activity === 'wash') { P(11, 4, C.tongue); P(12, 4, C.tongue); }
    if (curled) { R(2, 4, 2, 2, fur.base); P(3, 3, fur.base); } else R(frame ? 0 : 1, 9, 4, 1, fur.base);
  }
}

/** A rubber duck, the debugging kind: it slides rather than walks, bobbing, and tucks its head in to sleep. */
function paintDuck(R: Paint, P: Dot, fur: Tones, activity: PetActivity, frame: 0 | 1) {
  const bob = activity === 'walk' ? frame : 0;
  const sleeping = activity === 'sleep';
  const head = sleeping ? 3 : activity === 'wash' ? 2 : 0;
  R(3, 6 + bob, 9, 4, fur.base); R(2, 7 + bob, 1, 2, fur.base); R(4, 9 + bob, 7, 1, fur.shade); R(4, 6 + bob, 6, 1, fur.light);
  R(1, 5 + bob, 2, 2, fur.base); // the tail, up
  R(5, 7 + bob, 4, 2, fur.shade); R(5, 7 + bob, 4, 1, fur.base); // the wing
  R(8, 1 + head + bob, 5, 5, fur.base); R(9, 1 + head + bob, 2, 1, fur.light);
  R(13, 3 + head + bob, 3, 2, C.beak); P(15, 4 + head + bob, fur.dark);
  if (sleeping) R(10, 3 + head, 2, 1, fur.dark); else { P(11, 2 + head + bob, C.black); P(12, 2 + head + bob, C.white); }
}

/** A capybara: a calm brown barrel on short legs, a blunt muzzle, and a citrus balanced on its head. */
function paintCapybara(R: Paint, P: Dot, fur: Tones, activity: PetActivity, frame: 0 | 1) {
  const low = activity === 'sleep' ? 2 : 0;
  if (activity !== 'sleep') for (const x of activity === 'walk' && frame ? [3, 6, 10, 12] : [4, 5, 11, 12]) R(x, 9, 1, 2, fur.dark);
  R(2, 4 + low, 12, 5, fur.base); R(3, 4 + low, 10, 1, fur.light); R(3, 8 + low, 10, 1, fur.shade);
  R(12, 2 + low, 4, 5, fur.base); R(16, 3 + low, 1, 3, fur.base); R(13, 2 + low, 2, 1, fur.light);
  P(13, 1 + low, fur.dark); // the little ear
  P(17, 4 + low, fur.dark); P(16, 6 + low, fur.shade);
  if (activity === 'sleep') R(14, 3 + low, 2, 1, fur.dark); else P(15, 3 + low, C.black);
  if (activity === 'wash') P(17, 6, C.leaf); // chewing a leaf
  // the citrus on its head, and its leaf
  R(12, low - 1, 3, 3, C.citrus); P(12, low - 1, tones(C.citrus).light); P(14, low - 2, C.leaf);
}

/** An axolotl: a pink salamander with feathery gills, a fin along its tail, a smile. */
function paintAxolotl(R: Paint, P: Dot, fur: Tones, activity: PetActivity, frame: 0 | 1) {
  const low = activity === 'sleep' ? 1 : 0;
  const sway = activity === 'walk' ? frame : 0;
  R(0, 6 + low + sway, 4, 2, fur.light); // the tail and its fin
  R(3, 6 + low, 9, 3, fur.base); R(4, 6 + low, 7, 1, fur.light); R(4, 8 + low, 7, 1, fur.shade);
  if (activity !== 'sleep') for (const x of [4, 9]) { R(x + (sway && x === 4 ? 1 : 0), 9, 1, 2, fur.base); }
  R(11, 4 + low, 6, 4, fur.base); R(12, 4 + low, 3, 1, fur.light);
  // three feathery gills each side of the head
  for (const [x, y] of [[11, 3], [12, 2], [13, 3], [15, 2], [16, 3], [17, 4]] as const) P(x, y + low, C.gills);
  if (activity === 'sleep') R(14, 6, 2, 1, fur.dark); else { P(14, 5 + low, C.black); P(16, 5 + low, C.black); }
  P(15, 7 + low, fur.dark);
  if (activity === 'wash') P(18, 3, C.white); // a bubble
}
/** Rocky facing right: a ridged stone-brown shell on five jointed legs; no eyes. */
function paintRocky(R: Paint, P: Dot, fur: Tones, activity: PetActivity, frame: 0 | 1) {
  const { base: shell, light, dark } = fur;
  const low = activity === 'sleep' ? 3 : 0;
  // the five legs: out from the shell, a knuckle, then down to the floor (folded under him when he sleeps)
  if (activity === 'sleep') R(2, 10, 14, 2, dark);
  else {
    const lifted = (leg: number) => (activity === 'walk' && (leg + frame) % 2 === 0 ? 1 : 0);
    const legs = [[1, 2], [5, 0], [8, 0], [11, 0], [15, -2]] as const;
    legs.forEach(([x, out], leg) => {
      const up = lifted(leg);
      if (activity === 'wash' && leg === 3) { R(12, 4, 2, 2, shell); R(14, 3, 2, 2, light); return; }
      if (out) R(x + (out > 0 ? 1 : 0), 6, 2, 1, shell);
      R(x, 7 - up, 2, 5, shell); R(x, 7 - up, 1, 5, light); P(x, 11 - up, dark); P(x + 1, 11 - up, dark);
    });
  }
  // the shell, lit from the top left, its ridges darker
  for (const [y, from, to] of [[2, 6, 11], [3, 5, 12], [4, 4, 13], [5, 4, 14], [6, 4, 14], [7, 5, 13]] as const) R(from, y + low, to - from + 1, 1, shell);
  R(6, 3 + low, 3, 1, light); R(5, 4 + low, 2, 2, light);
  R(8, 4 + low, 1, 3, dark); R(11, 3 + low, 1, 3, dark); R(6, 7 + low, 6, 1, dark);
}

function paint(choice: Drawn, activity: PetActivity, frame: 0 | 1): HTMLCanvasElement {
  const { canvas, context } = artCanvas(CANVAS.width, CANVAS.height);
  const R: Paint = (x, y, width, height, colour) => { context.fillStyle = colour; context.fillRect(x + 3, y + 4, width, height); };
  const P: Dot = (x, y, colour) => R(x, y, 1, 1, colour);
  const fur = tones(furOf(choice));
  switch (choice.kind) {
    case 'cat': paintCat(R, P, choice.variant, choice.colors ?? {}, fur, activity, frame); break;
    case 'dog': paintDog(R, P, choice.variant, fur, activity, frame); break;
    case 'duck': paintDuck(R, P, fur, activity, frame); break;
    case 'capybara': paintCapybara(R, P, fur, activity, frame); break;
    case 'axolotl': paintAxolotl(R, P, fur, activity, frame); break;
    case 'rocky': paintRocky(R, P, fur, activity, frame); break;
  }
  return outline(canvas, ROOM_PALETTE.furniture.outline);
}


function mirrored(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, context } = artCanvas(source.width, source.height);
  context.translate(source.width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0);
  return canvas;
}

const sprites = new Map<string, HTMLCanvasElement>();

/** A pet's picture in an activity, facing right (for the settings' preview, and the room). */
export function petSprite(choice: Drawn, activity: PetActivity, frame: 0 | 1, left = false): HTMLCanvasElement {
  const key = `${JSON.stringify(choice)}|${activity}|${frame}|${left}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const right = paint(choice, activity, frame);
    sprite = left ? mirrored(right) : right;
    sprites.set(key, sprite);
  }
  return sprite;
}

/** Draws the pet with its paws at (x, y) in room pixels. `time`: the room's clock, for the walking and the tail. */
export function drawPet(context: CanvasRenderingContext2D, pet: Pet, choice: Drawn, x: number, y: number, time: number) {
  const frame: 0 | 1 = Math.floor(time / (pet.activity === 'walk' ? 160 : 900)) % 2 ? 1 : 0;
  const sprite = petSprite(choice, pet.activity, frame, pet.heading.x - pet.heading.y < 0);
  context.drawImage(sprite, Math.round(x - FEET.x * ART_SCALE), Math.round(y - FEET.y * ART_SCALE), sprite.width * ART_SCALE, sprite.height * ART_SCALE);
}

/** The hearts of a cuddle, rising from the pet's head and fading. */
export function drawHearts(context: CanvasRenderingContext2D, pet: Pet, x: number, y: number) {
  const heart = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
  context.fillStyle = C.heart;
  pet.hearts.forEach((born, index) => {
    const age = (pet.time - born) / HEART_MS;
    if (age < 0 || age >= 1) return;
    context.globalAlpha = 1 - age * age;
    const left = Math.round(x - 5 + Math.sin(age * 7 + index * 2) * 6 + (index % 2 ? 4 : -4));
    const top = Math.round(y - PET_HEIGHT + 6 - age * 34);
    for (const [px, py] of heart) context.fillRect(left + px * 2, top + py * 2, 2, 2);
  });
  context.globalAlpha = 1;
}

/** How far above its paws the top of the pet is, in room pixels (its bubble goes above). */
export const PET_HEIGHT = 28;
