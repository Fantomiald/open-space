// The pets that came after the first ones, each drawn facing right like them: src/room/pet.ts frames, outlines and
// mirrors them. One colour is the user's (`fur`: a coat, a shell, a robot's metal, a slime's goo, a firefly's light).
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { PlainPetKind } from '../../shared/pets.ts';
import type { Dot, Paint, PetActivity } from './pet.ts';
import { shadedBall, tones, type Tones } from './pixel-art.ts';

const C = ROOM_PALETTE.pet;
type Painter = (R: Paint, P: Dot, fur: Tones, activity: PetActivity, frame: 0 | 1) => void;

/** A robot dog: a metal box on rod legs, a glowing visor, an antenna whose light blinks; it beeps a smile to wash. */
const robotDog: Painter = (R, P, fur, activity, frame) => {
  const eye = C.robotEye;
  if (activity === 'sleep') {
    R(2, 7, 10, 3, fur.base); R(3, 7, 8, 1, fur.light); R(2, 9, 10, 1, fur.shade); P(6, 8, fur.shade);
    R(11, 5, 5, 4, fur.base); R(12, 5, 3, 1, fur.light); R(13, 6, 3, 1, fur.dark);
    P(12, 4, fur.dark); R(0, 8, 2, 1, fur.dark);
    return;
  }
  if (activity === 'walk') {
    for (const x of frame ? [3, 5, 8, 10] : [2, 4, 9, 11]) { R(x, 8, 1, 2, fur.dark); P(x, 10, fur.shade); }
    R(2, 4, 10, 4, fur.base); R(3, 4, 8, 1, fur.light); R(2, 7, 10, 1, fur.shade); R(6, 5, 1, 2, fur.shade);
    P(4, 5, fur.light); P(9, 5, fur.light);
    R(11, 1, 5, 4, fur.base); R(12, 1, 3, 1, fur.light); R(13, 2, 3, 1, eye); R(13, 4, 3, 1, fur.shade);
    P(12, 0, fur.dark); P(12, -1, frame ? C.collar : C.tag);
    R(0, frame ? 3 : 4, 2, 1, fur.dark);
    return;
  }
  // sitting up; when it washes, the visor shows a smile and the antenna blinks
  R(4, 4, 6, 6, fur.base); R(4, 4, 2, 5, fur.light); R(4, 9, 6, 1, fur.shade); R(7, 5, 1, 3, fur.shade);
  P(5, 10, fur.dark); P(8, 10, fur.dark);
  R(6, 0, 6, 5, fur.base); R(7, 0, 3, 1, fur.light); R(6, 4, 6, 1, fur.shade);
  if (activity === 'wash') { P(9, 2, eye); P(11, 2, eye); P(10, 1, eye); } else R(9, 1, 3, 2, eye);
  P(7, -1, fur.dark); P(7, -2, activity === 'wash' && frame ? C.tag : C.collar);
  R(frame ? 0 : 1, 9, 3, 1, fur.dark);
};

/** A little alien: a big green head, two black almond eyes, antennae; it waves to wash, curls up to sleep. */
const alien: Painter = (R, P, fur, activity, frame) => {
  if (activity === 'sleep') {
    R(4, 9, 6, 2, fur.base); R(4, 10, 6, 1, fur.shade);
    shadedBall(P, 12, 7.5, 4, 3, fur);
    R(11, 7, 2, 1, C.black); R(14, 7, 1, 1, C.black);
    P(10, 4, fur.dark); P(9, 3, C.alienTip);
    return;
  }
  const bob = activity === 'walk' ? frame : 0;
  const seated = activity !== 'walk';
  const top = (seated ? 1 : 0) + bob;
  // the body and legs
  if (seated) { R(7, 8, 4, 2, fur.base); R(7, 9, 4, 1, fur.shade); R(10, 10, 3, 1, fur.base); R(6, 10, 2, 1, fur.shade); }
  else {
    R(7, 6 + bob, 4, 3, fur.base); R(7, 8 + bob, 4, 1, fur.shade);
    R(frame ? 7 : 8, 9 + bob, 1, 2 - bob, fur.shade); R(frame ? 10 : 9, 9 + bob, 1, 2 - bob, fur.base);
  }
  // the arms; one waves when it washes
  P(6, 7 + top - (seated ? 0 : 1), fur.shade);
  if (activity === 'wash') R(12, 3 + top - frame, 1, 3, fur.base); else P(11, 7 + top - (seated ? 0 : 1), fur.base);
  // the head, the eyes looking right, the antennae
  shadedBall(P, 9.5, 2.5 + top, 4.5, 3.2, fur);
  R(8, 2 + top, 2, 2, C.black); R(11, 2 + top, 2, 2, C.black); P(8, 2 + top, C.white); P(11, 2 + top, C.white);
  P(10, 5 + top, fur.dark);
  P(7, -1 + top, fur.dark); P(6, -2 + top, C.alienTip); P(12, -1 + top, fur.dark); P(13, -2 + top, C.alienTip);
};

/** A pocket dragon: horns, little wings, a cream belly, a spade at the end of its tail; it puffs a flame to wash. */
const dragon: Painter = (R, P, fur, activity, frame) => {
  const belly = C.dragonBelly;
  if (activity === 'sleep') {
    R(2, 7, 10, 3, fur.base); R(3, 7, 8, 1, fur.light); R(3, 9, 8, 1, belly);
    R(5, 5, 4, 2, fur.light); P(6, 4, fur.light);
    R(11, 6, 5, 3, fur.base); R(12, 7, 2, 1, fur.dark); P(15, 7, fur.dark); P(12, 5, belly);
    R(0, 9, 3, 1, fur.base); P(-1, 8, fur.dark);
    return;
  }
  if (activity === 'walk') {
    for (const x of frame ? [3, 6, 8, 11] : [4, 5, 9, 10]) { R(x, 8, 1, 2, fur.shade); P(x, 10, fur.dark); }
    R(2, 5, 10, 3, fur.base); R(3, 5, 8, 1, fur.light); R(3, 7, 8, 1, belly);
    for (const x of [4, 6, 8]) P(x, 4, fur.dark);
    // the wing, flapping
    if (frame) { R(5, 1, 4, 3, fur.light); P(5, 0, fur.light); R(6, 3, 3, 1, fur.shade); }
    else { R(5, 3, 5, 2, fur.light); R(6, 4, 3, 1, fur.shade); }
    R(11, 2, 4, 4, fur.base); R(12, 2, 2, 1, fur.light); R(15, 4, 2, 2, fur.base); P(16, 4, fur.dark);
    P(13, 3, C.black); R(12, 5, 3, 1, belly);
    P(11, 1, belly); P(10, 0, belly);
    R(0, 6, 2, 1, fur.base); P(-1, 5, fur.dark); P(-2, 5, fur.dark); P(-1, 4, fur.dark);
    return;
  }
  // sitting up, the wings folded; a puff of flame when it washes
  R(4, 4, 6, 6, fur.base); R(4, 4, 2, 5, fur.light); R(8, 5, 2, 4, belly); R(4, 9, 6, 1, fur.shade);
  R(2, 3, 3, 3, fur.light); P(2, 2, fur.light); R(3, 5, 2, 1, fur.shade);
  P(5, 10, fur.dark); P(8, 10, fur.dark);
  R(6, 0, 5, 4, fur.base); R(7, 0, 2, 1, fur.light); R(11, 2, 2, 2, fur.base); P(12, 2, fur.dark);
  P(9, 1, C.black); R(8, 3, 3, 1, belly);
  P(7, -1, belly); P(6, -2, belly);
  if (activity === 'wash') { R(13, 2, 2, 1, C.flame); P(15 + frame, 2 - frame, C.flameCore); P(14, 3, C.flameCore); }
  R(0, 9, 4, 1, fur.base); P(frame && activity === 'sit' ? -1 : 0, 8, fur.dark);
};

/** A ghost cat: pale, floating and bobbing, its sheet trailing into a wisp instead of legs; glowing eyes; it says boo to wash. */
const ghostCat: Painter = (R, P, fur, activity, frame) => {
  const eye = C.ghostEyes;
  if (activity === 'sleep') {
    // drifting low, curled up, eyes shut
    R(3, 6, 8, 3, fur.base); R(4, 5, 6, 1, fur.light); P(4, 9, fur.base); P(8, 9, fur.base);
    R(9, 4, 5, 4, fur.base); P(9, 3, fur.base); P(13, 3, fur.base); R(11, 6, 2, 1, fur.dark);
    R(1, 7, 2, 1, fur.base); P(0, 6, fur.light);
    return;
  }
  const b = frame;
  if (activity === 'walk') {
    R(10, b, 5, 5, fur.base); R(11, b, 2, 1, fur.light); P(10, b - 1, fur.base); P(14, b - 1, fur.base);
    P(13, 2 + b, eye); P(14, 4 + b, fur.shade);
    R(5, 2 + b, 5, 4, fur.base); R(6, 2 + b, 4, 1, fur.light); P(6, 6 + b, fur.base); P(9, 6 + b, fur.base);
    R(3, 3 + b, 2, 3, fur.base); R(1, 4 + b, 2, 1, fur.light); P(0, 3 + b, fur.light); P(-1, 2 + b + frame, fur.light);
    return;
  }
  // upright, the sheet tapering into a curl above the floor; little paws up to say boo
  R(6, b, 6, 5, fur.base); R(7, b, 3, 1, fur.light); P(6, b - 1, fur.base); P(11, b - 1, fur.base);
  R(6, 5 + b, 5, 2, fur.base); R(6, 5 + b, 1, 2, fur.light); R(6, 7 + b, 4, 1, fur.base); R(4, 8 + b, 4, 1, fur.base);
  P(3, 7 + b, fur.light); P(2, 6 + b, fur.light);
  P(8, 2 + b, eye); P(10, 2 + b, eye);
  if (activity === 'wash') { P(9, 4 + b, fur.dark); R(4, 3 + b, 1, 2, fur.base); R(12, 3 + b, 1, 2, fur.base); }
};

/** A parrot: an upright bird, a curved pale beak, a blue and yellow wing, a long tail; it preens to wash. */
const parrot: Painter = (R, P, fur, activity, frame) => {
  const low = activity === 'sleep' ? 1 : 0;
  const bob = activity === 'walk' ? frame : 0;
  const y = low + bob;
  // the tail, then the feet
  R(2, 8 + low, 3, 1, C.parrotWing); R(1, 9 + low, 2, 1, C.parrotWing); P(0, 10, fur.dark);
  if (activity !== 'sleep') {
    P(activity === 'walk' && frame ? 6 : 7, 10, C.parrotFeet); P(9, 10, C.parrotFeet);
  }
  R(5, 3 + y, 5, 6 - y + low, fur.base); R(6, 3 + y, 3, 1, fur.light); R(9, 5 + y, 1, 3, fur.light);
  // the wing: a yellow band, then blue flight feathers
  R(4, 4 + y, 4, 1, C.parrotBand); R(4, 5 + y, 4, 3, C.parrotWing); R(3, 7 + y, 2, 2, tones(C.parrotWing).shade);
  const preening = activity === 'wash';
  const head = preening ? 3 : 0;
  R(7, head + y, 5, 4, fur.base); R(8, head + y, 3, 1, fur.light);
  if (activity === 'sleep') R(9, 1 + y, 2, 1, fur.dark);
  else { P(9, 1 + head + y, C.white); P(10, 1 + head + y, C.black); }
  R(12, 1 + head + y, 2, 2, C.parrotBeak); P(13, 3 + head + y, C.black); P(12, 3 + head + y, tones(C.parrotBeak).shade);
  if (preening && frame) P(11, 5 + y, C.parrotBand);
};

/** A crab, seen from the front: eyes on stalks, two claws that snap, three legs a side that scuttle. */
const crab: Painter = (R, P, fur, activity, frame) => {
  const asleep = activity === 'sleep';
  const low = asleep ? 2 : 0;
  for (const [index, x, out] of [[0, 5, -1], [1, 3, -1], [2, 1, -1], [0, 10, 1], [1, 12, 1], [2, 14, 1]] as const) {
    if (asleep) { P(x, 10, fur.shade); continue; }
    const lift = activity === 'walk' && (index + frame) % 2 ? 1 : 0;
    P(x - out, 8, fur.shade); P(x, 9 - lift, fur.shade); P(x, 10 - lift, fur.dark);
  }
  R(4, 3 + low, 8, 1, fur.light); R(3, 4 + low, 10, 3, fur.base); R(3, 7 + low, 10, 1, fur.shade);
  P(4, 4 + low, fur.light); P(5, 4 + low, fur.light); R(7, 6 + low, 2, 1, fur.dark);
  if (asleep) { P(6, 4 + low, C.black); P(9, 4 + low, C.black); }
  else { P(6, 2, fur.base); P(9, 2, fur.base); P(6, 1, C.black); P(9, 1, C.black); }
  // the claws, open on the beat when it walks or snaps them to wash
  const snapping = activity === 'walk' || activity === 'wash';
  const top = asleep ? 8 : snapping ? 1 : 2;
  for (const [x, arm] of [[-1, 2], [14, 13]] as const) {
    const open = snapping ? frame === 1 : activity === 'sit' && frame === 1 && x > 0;
    if (open) { R(x, top + 1, 3, 2, fur.base); P(x, top, fur.base); P(x + 2, top, fur.base); }
    else { R(x, top, 3, 3, fur.base); P(x + 1, top, fur.light); }
    const from = Math.min(top + 2, 4 + low), to = Math.max(top + 2, 4 + low);
    R(arm, from, 1, to - from + 1, fur.shade);
  }
};

/** A turtle: a domed shell (the user's colour) with darker plates, a green head and stubby legs; it hides inside to sleep. */
const turtle: Painter = (R, P, fur, activity, frame) => {
  const skin = tones(C.turtleSkin);
  const sleeping = activity === 'sleep';
  if (!sleeping) {
    for (const x of activity === 'walk' && frame ? [5, 11] : [4, 10]) R(x, 8, 2, 2, skin.base);
    for (const x of activity === 'walk' && frame ? [4, 10] : [5, 11]) P(x, 10, skin.shade);
    P(2, 8, skin.base);
    const up = activity === 'walk' ? frame : 0;
    R(13, 5 - up, 4, 3, skin.base); R(14, 5 - up, 2, 1, skin.light); P(15, 6 - up, C.black); P(16, 7 - up, skin.shade);
    R(13, 7, 1, 2, skin.base);
    if (activity === 'wash') R(17, 6 + frame, 1, 2, C.leaf);
  } else R(14, 8, 1, 1, skin.shade);
  const low = sleeping ? 1 : 0;
  // the dome and its plates
  R(5, 3 + low, 7, 1, fur.base); R(4, 4 + low, 9, 4, fur.base); R(3, 6 + low, 11, 2, fur.base);
  R(5, 4 + low, 2, 1, fur.light); R(6, 3 + low, 3, 1, fur.light);
  for (const [x, y] of [[7, 4], [6, 6], [9, 6], [10, 4]] as const) R(x, y + low, 2, 1, fur.dark);
  R(3, 8 + low, 11, 1, C.turtleRim);
};

/** An owl, its round face to us: big yellow eyes, ear tufts, a speckled breast; it winks to wash. */
const owl: Painter = (R, P, fur, activity, frame) => {
  const asleep = activity === 'sleep';
  const walking = activity === 'walk';
  const x = 4 + (walking ? frame : 0);
  const top = asleep ? 2 : 1;
  // an egg of a body, its tufts
  R(x + 2, top, 5, 1, fur.base); R(x + 1, top + 1, 7, 1, fur.base); R(x, top + 2, 9, 8 - top, fur.base); R(x + 1, 9, 7, 1, fur.base);
  P(x + 1, top - 1, fur.dark); P(x + 7, top - 1, fur.dark); P(x + 1, top, fur.dark); P(x + 7, top, fur.dark);
  R(x, top + 4, 1, 5 - top, fur.shade); R(x + 8, top + 4, 1, 5 - top, fur.shade);
  // the face disc, the eyes and the beak
  R(x + 1, top + 2, 7, 3, fur.light); R(x + 2, top + 1, 2, 1, fur.light); R(x + 5, top + 1, 2, 1, fur.light);
  if (asleep) { R(x + 2, top + 3, 2, 1, fur.dark); R(x + 5, top + 3, 2, 1, fur.dark); }
  else {
    R(x + 2, top + 2, 2, 2, C.owlEyes); P(x + 3, top + 3, C.black);
    if (activity === 'wash' && frame) R(x + 5, top + 3, 2, 1, fur.dark);
    else { R(x + 5, top + 2, 2, 2, C.owlEyes); P(x + 6, top + 3, C.black); }
  }
  P(x + 4, top + 3, C.owlBeak); P(x + 4, top + 4, C.owlBeak);
  // the speckled breast, then the talons
  for (const [dx, dy] of [[3, 6], [5, 6], [4, 7], [2, 8], [6, 8]] as const) P(x + dx, dy + (asleep ? 1 : 0), fur.shade);
  if (!asleep) for (const dx of walking && frame ? [2, 6] : [3, 5]) P(x + dx, 10, C.owlBeak);
};

/** A fox: slender, black socks and ear tips, a white chest, and a big brush of a tail tipped white. */
const fox: Painter = (R, P, fur, activity, frame) => {
  const white = C.white, black = C.black;
  if (activity === 'sleep') {
    // curled up, its tail over its nose
    R(3, 6, 10, 4, fur.base); R(4, 5, 7, 1, fur.light);
    R(9, 5, 4, 4, fur.base); P(9, 4, fur.base); P(12, 4, fur.base); P(9, 3, black); P(12, 3, black);
    R(10, 7, 2, 1, fur.dark);
    R(2, 8, 12, 2, fur.light); R(12, 8, 3, 2, white);
    return;
  }
  if (activity === 'walk') {
    for (const x of frame ? [3, 5, 9, 11] : [4, 4, 10, 10]) { R(x, 8, 1, 3, black); }
    R(3, 5, 9, 3, fur.base); R(4, 5, 7, 1, fur.light); R(9, 7, 3, 1, white);
    R(11, 2, 4, 4, fur.base); R(12, 2, 2, 1, fur.light); R(15, 4, 2, 1, fur.base); P(17, 4, black);
    R(12, 5, 4, 1, white); P(13, 3, black);
    P(11, 1, fur.base); P(11, 0, black); P(13, 1, fur.base); P(13, 0, black);
    // the brush, swinging
    R(-1, 3 + frame, 4, 3, fur.base); R(0, 3 + frame, 3, 1, fur.light); R(-2, 4 + frame, 2, 2, white);
    return;
  }
  // sitting, the tail round its paws; licking a paw when it washes
  R(5, 4, 5, 6, fur.base); R(5, 4, 2, 5, fur.light); R(8, 5, 2, 4, white);
  P(6, 10, black); P(9, 10, black);
  const lowered = activity === 'wash' ? 1 : 0;
  R(6, lowered, 5, 4, fur.base); R(7, lowered, 2, 1, fur.light); R(11, 2 + lowered, 2, 1, fur.base); P(13, 2 + lowered, black);
  R(9, 3 + lowered, 3, 1, white);
  P(6, -1 + lowered, fur.base); P(6, -2 + lowered, black); P(9, -1 + lowered, fur.base); P(9, -2 + lowered, black);
  if (activity === 'wash') { R(9, 1 + lowered, 2, 1, fur.dark); R(11, 4, 2, 2, black); }
  else P(9, 1, black);
  R(0, 8, 6, 2, fur.base); R(1, 8, 4, 1, fur.light); R(frame && activity === 'sit' ? 9 : 10, 9, 0, 0, white); R(-1, 9, 2, 1, white);
};

/** A red panda: a russet coat, a white masked face, dark legs and belly, a ringed tail. */
const redPanda: Painter = (R, P, fur, activity, frame) => {
  const dark = C.pandaDark, white = C.white;
  const rings = (x: number, y: number, length: number) => {
    for (let index = 0; index < length; index++) R(x + index, y, 1, 2, index % 2 ? fur.dark : fur.base);
  };
  if (activity === 'sleep') {
    R(3, 6, 9, 4, fur.base); R(4, 5, 6, 1, fur.light); R(3, 9, 9, 1, dark);
    R(10, 5, 4, 4, fur.base); P(10, 4, white); P(13, 4, white); R(11, 7, 3, 1, white); R(11, 6, 2, 1, fur.dark);
    rings(1, 8, 9);
    return;
  }
  if (activity === 'walk') {
    for (const x of frame ? [3, 5, 9, 11] : [4, 4, 10, 10]) R(x, 8, 1, 3, dark);
    R(3, 4, 9, 4, fur.base); R(4, 4, 7, 1, fur.light); R(4, 7, 7, 1, dark);
    R(11, 1, 5, 5, fur.base); R(12, 1, 2, 1, fur.light);
    P(12, 3, white); R(14, 4, 3, 1, white); P(16, 3, fur.base); P(17, 4, C.black); P(14, 2, C.black); P(13, 2, white); P(14, 3, fur.dark);
    P(11, 0, white); P(14, 0, white);
    rings(-2, 4 + frame, 5);
    return;
  }
  // sitting up; it washes its face with a paw
  R(4, 4, 6, 6, fur.base); R(4, 4, 2, 5, fur.light); R(7, 6, 3, 4, dark);
  P(5, 10, dark); P(8, 10, dark);
  const lowered = activity === 'wash' ? 1 : 0;
  R(6, lowered, 6, 5, fur.base); R(7, lowered, 3, 1, fur.light);
  P(6, -1 + lowered, white); P(11, -1 + lowered, white);
  R(7, 3 + lowered, 2, 1, white); R(10, 3 + lowered, 2, 2, white); P(12, 3 + lowered, fur.base); P(13, 3 + lowered, C.black);
  if (activity === 'wash') { R(8, 2 + lowered, 2, 1, fur.dark); R(11, 4, 2, 2, dark); }
  else { P(9, 2, C.black); P(8, 1, white); P(10, 1, white); P(9, 3, fur.dark); }
  rings(0, 8 - (frame && activity === 'sit' ? 1 : 0), 4);
};

/** A slime: a glossy dome with two dots for eyes; it bounces to move, jiggles to wash, melts flat to sleep. */
const slime: Painter = (R, P, fur, activity, frame) => {
  // each pose's width and height, and how high it is off the floor
  const shapes = { walk: frame ? [10, 8, 2] : [14, 5, 0], sit: [12, 7 - frame, 0], wash: frame ? [13, 6, 0] : [11, 8, 0], sleep: [16, 3, 0] } as const;
  const [width, height, up] = shapes[activity];
  const center = 9, bottom = 10 - up;
  for (let row = 0; row < height; row++) {
    const half = Math.round((width / 2) * Math.sqrt(1 - (row / height) ** 2));
    const y = bottom - row;
    R(center - half, y, half * 2, 1, row === 0 ? fur.shade : row === height - 1 ? fur.light : fur.base);
    if (row > 0 && row < height - 1) { P(center - half, y, fur.light); P(center + half - 1, y, fur.shade); }
  }
  const top = bottom - height + 1;
  P(center - width / 2 + 3, top + 1, C.white); P(center - width / 2 + 4, top + 1, fur.light);
  const eyes = bottom - Math.max(1, Math.floor(height / 2));
  if (activity === 'sleep') { R(9, eyes, 2, 1, fur.dark); R(12, eyes, 2, 1, fur.dark); }
  else {
    R(9, eyes - 1, 1, 2, C.black); R(12, eyes - 1, 1, 2, C.black);
    if (activity === 'wash') R(10, eyes + 1, 2, 1, fur.dark);
  }
};

/** An octopus: a round mantle, two eyes, four thick arms curling out at the floor; it waves one more to wash. */
const octopus: Painter = (R, P, fur, activity, frame) => {
  const asleep = activity === 'sleep';
  if (asleep) { R(2, 10, 15, 1, fur.shade); P(1, 9, fur.base); P(17, 9, fur.base); R(3, 9, 13, 1, fur.base); }
  else {
    [[4, -1], [7, -1], [10, 1], [13, 1]].forEach(([x, curl], index) => {
      const lift = activity === 'walk' && (index + frame) % 2 ? 1 : 0;
      R(x, 7, 2, 3 - lift, fur.base); R(x + (curl > 0 ? 1 : 0), 7, 1, 3 - lift, fur.shade);
      R(x + curl, 10 - lift, 2, 1, fur.base);
    });
  }
  if (activity === 'wash') { R(16, 4 - frame, 1, 4, fur.base); P(17, 3 - frame, fur.base); }
  const top = asleep ? 3 : 0;
  shadedBall(P, 9.5, 4 + top, 5.4, 4.3, fur);
  P(7, 1 + top, fur.light); P(6, 2 + top, fur.light); P(6, 5 + top, fur.shade); P(8, 6 + top, fur.shade);
  if (asleep) { R(10, 5 + top, 2, 1, fur.dark); R(13, 5 + top, 1, 1, fur.dark); }
  else { R(10, 4, 1, 2, C.black); R(13, 4, 1, 2, C.black); P(10, 4, C.white); P(13, 4, C.white); }
};

/** A maneki-neko: a white lucky cat, a red collar and a gold bell, who beckons with one paw; it walks and sleeps like a cat. */
const manekiNeko = (cat: Painter): Painter => (R, P, fur, activity, frame) => {
  if (activity === 'walk' || activity === 'sleep') {
    cat(R, P, fur, activity, frame);
    if (activity === 'walk') { R(9, 5, 3, 1, C.collar); P(11, 6, C.tag); }
    else P(11, 9, C.collar);
    return;
  }
  // sitting, facing us, holding a gold coin and beckoning (both paws up when it washes)
  R(4, 5, 8, 5, fur.base); R(4, 5, 2, 4, fur.light); R(4, 9, 8, 1, fur.shade);
  P(5, 10, fur.base); P(10, 10, fur.base);
  R(4, 0, 8, 5, fur.base); R(5, 0, 4, 1, fur.light);
  P(4, -1, fur.base); P(5, -1, C.earInside); P(11, -1, fur.base); P(10, -1, C.earInside);
  R(4, 0, 2, 2, C.manekiPatch); P(11, 1, C.cats.patchB);
  R(5, 2, 2, 1, C.black); R(9, 2, 2, 1, C.black); P(8, 3, C.nose); P(7, 4, fur.shade); P(8, 4, fur.shade);
  R(4, 5, 8, 1, C.collar); P(8, 6, C.tag); P(8, 7, tones(C.tag).shade);
  R(5, 7, 2, 2, C.coin); P(5, 7, tones(C.coin).light);
  // the beckoning paw: raised high, then folded down
  if (frame) { R(13, -1, 2, 3, fur.base); P(13, -1, C.earInside); R(13, 2, 1, 3, fur.base); }
  else { R(13, 2, 2, 2, fur.base); P(14, 3, C.earInside); R(13, 4, 1, 1, fur.base); }
  if (activity === 'wash') { R(1, frame ? -1 : 2, 2, frame ? 3 : 2, fur.base); R(2, frame ? 2 : 4, 1, frame ? 3 : 1, fur.base); }
  R(0, 9, 4, 1, fur.base);
};

/** A mini golem: stone blocks with moss on top, glowing eyes and a rune; heavy arms that swing as it lumbers. */
const golem: Painter = (R, P, fur, activity, frame) => {
  const glow = C.golemGlow;
  if (activity === 'sleep') {
    // settled into a heap of stones, the eyes out
    R(3, 6, 12, 4, fur.base); R(4, 5, 9, 1, fur.light); R(3, 9, 12, 1, fur.shade);
    R(7, 6, 1, 3, fur.dark); R(11, 6, 1, 2, fur.dark);
    R(9, 7, 2, 1, fur.dark); P(5, 4, C.leaf); P(6, 4, C.leaf);
    return;
  }
  const step = activity === 'walk' ? frame : 0;
  // the legs
  R(6, 8, 2, 3 - step, fur.shade); R(10, 8, 2, 2 + step, fur.shade); P(6, 10 - step, fur.dark); P(10, 9 + step, fur.dark);
  // the torso and its rune
  R(5, 3, 8, 5, fur.base); R(5, 3, 8, 1, fur.light); R(5, 7, 8, 1, fur.shade); R(8, 3, 1, 2, fur.dark);
  P(9, 5, glow); P(10, 6, glow); P(8, 6, glow);
  // the arms, apart from the torso: hanging and swinging, or stretched up when it washes
  if (activity === 'wash') { R(2, -frame, 2, 4, fur.base); R(14, -frame, 2, 4, fur.base); P(2, -frame, fur.light); P(14, -frame, fur.light); }
  else {
    R(2, 3 + step, 2, 5, fur.base); P(2, 3 + step, fur.light); P(3, 7 + step, fur.dark);
    R(14, 4 - step, 2, 5, fur.base); P(14, 4 - step, fur.light); P(15, 8 - step, fur.dark);
    R(4, 3, 1, 2, fur.shade); R(13, 3, 1, 2, fur.shade);
  }
  // the head, moss on top, the eyes
  R(7, 0, 5, 3, fur.base); R(7, 0, 5, 1, fur.light); R(7, -1, 3, 1, C.leaf); P(11, -1, C.leaf);
  P(9, 1, glow); P(11, 1, glow);
};

/** A giant firefly: a dark beetle with fluttering wings and a glowing tail (the user's colour); it lands to sleep. */
const firefly: Painter = (R, P, fur, activity, frame) => {
  const body = tones(C.fireflyBody);
  const landed = activity === 'sleep';
  const hover = landed ? 4 : activity === 'wash' ? 0 : frame;
  const y = 2 + hover;
  // the glowing tail: dim asleep, flashing when it washes
  const light = landed ? { base: fur.shade, light: fur.base, shade: fur.dark } : activity === 'wash' && frame ? { base: fur.light, light: C.white, shade: fur.base } : fur;
  R(1, y + 1, 5, 3, light.base); R(2, y + 1, 3, 1, light.light); P(0, y + 2, light.base); R(1, y + 3, 5, 1, light.shade);
  // the thorax, the head and its antennae
  R(6, y, 5, 4, body.base); R(7, y, 3, 1, body.light); R(11, y + 1, 3, 3, body.base); P(13, y + 2, C.white);
  P(13, y, body.base); P(14, y - 1, body.base); P(12, y - 1, body.base); P(12, y - 2, body.base);
  for (const x of [7, 9, 11]) P(x, y + 4, body.shade);
  if (landed) for (const x of [6, 9, 12]) P(x, y + 5, body.shade);
  // the wings: up, or down
  if (landed) R(4, y - 1, 6, 1, C.fireflyWing);
  else if (frame) { R(5, y - 3, 3, 3, C.fireflyWing); R(8, y - 2, 2, 2, C.fireflyWing); }
  else R(4, y - 1, 6, 2, C.fireflyWing);
};

/** A penguin: a dark back (the user's colour), a white front, an orange beak and feet; it waddles and flaps. */
const penguin: Painter = (R, P, fur, activity, frame) => {
  const sway = activity === 'walk' ? frame : 0;
  const low = activity === 'sleep' ? 1 : 0;
  const x = 5 + sway;
  R(x, 1 + low, 6, 9 - low, fur.base); R(x + 1, 0 + low, 4, 1, fur.base); R(x + 1, 0 + low, 3, 1, fur.light);
  R(x + 3, 3 + low, 3, 7 - low, C.white); R(x + 4, 2 + low, 2, 1, C.white);
  // the flipper, out when it flaps
  if (activity === 'wash' && frame) { R(x - 2, 3, 2, 1, fur.shade); P(x - 3, 2, fur.shade); }
  else if (activity === 'walk') R(x - 1 + (frame ? 0 : 1), 4, 1, 4, fur.shade);
  else R(x + 1, 4 + low, 1, 4, fur.shade);
  if (activity === 'sleep') R(x + 4, 2 + low, 1, 1, fur.dark);
  else P(x + 4, 2, C.black);
  R(x + 6, 3 + low, 2, 1, C.beak); P(x + 6, 4 + low, tones(C.beak).shade);
  R(x + 1 - sway, 10, 2, 1, C.beak); R(x + 4, 10, 2, 1, C.beak);
};

/** A rabbit: long ears lined pink, a cotton tail, a twitching nose; it hops, washes its face, and sleeps ears down. */
const rabbit: Painter = (R, P, fur, activity, frame) => {
  if (activity === 'sleep') {
    R(3, 6, 9, 4, fur.base); R(4, 5, 6, 1, fur.light); R(3, 9, 9, 1, fur.shade);
    R(10, 5, 4, 4, fur.base); R(12, 6, 2, 1, fur.dark); P(14, 7, C.nose);
    R(5, 4, 5, 1, fur.base); R(6, 4, 3, 1, C.earInside);
    R(2, 6, 2, 2, C.white);
    return;
  }
  if (activity === 'walk') {
    // a hop: crouched, then stretched in the air
    const up = frame ? 2 : 0;
    if (frame) { R(1, 7, 3, 1, fur.shade); R(12, 7, 2, 1, fur.shade); } else { R(3, 9, 3, 2, fur.shade); R(10, 9, 2, 2, fur.light); }
    R(3, 5 - up, 9, 4, fur.base); R(4, 5 - up, 6, 1, fur.light); R(4, 8 - up, 7, 1, fur.light);
    R(2, 5 - up, 2, 2, C.white);
    R(10, 3 - up, 4, 4, fur.base); R(11, 3 - up, 2, 1, fur.light); P(12, 4 - up, C.black); P(14, 5 - up, C.nose);
    R(9, -1 - up + frame, 1, 4, fur.base); R(11, -2 - up + frame, 1, 5, fur.base); P(11, -1 - up + frame, C.earInside);
    return;
  }
  // sitting up; it washes its face with both paws
  R(4, 5, 7, 5, fur.base); R(4, 5, 2, 4, fur.light); R(4, 9, 7, 1, fur.shade);
  R(2, 7, 2, 2, C.white);
  P(10, 10, fur.light); P(5, 10, fur.base);
  R(7, 2, 5, 4, fur.base); R(8, 2, 2, 1, fur.light);
  R(8, -2, 1, 4, fur.base); R(10, -2, 1, 4, fur.base); P(10, -1, C.earInside); P(10, 0, C.earInside);
  if (activity === 'wash') { R(9, 3, 2, 1, fur.dark); R(11, 4 + frame, 2, 2, fur.light); }
  else { P(10, 3, C.black); P(12, 4 + frame, C.nose); P(12, 5, fur.light); }
};

/** A hedgehog: a dome of spines (the user's colour) over a pale pointed face; it sniffs to wash, rolls into a ball to sleep. */
const hedgehog: Painter = (R, P, fur, activity, frame) => {
  const face = C.hedgehogFace;
  if (activity === 'sleep') {
    shadedBall(P, 8.5, 7, 5, 3.5, fur);
    for (const [x, y] of [[4, 3], [6, 2], [8, 2], [10, 2], [12, 3], [13, 5], [3, 5]] as const) P(x, y, fur.dark);
    R(11, 8, 2, 1, face); P(13, 9, C.black);
    return;
  }
  const step = activity === 'walk' ? frame : 0;
  const sniff = activity === 'wash' ? 1 - frame : 0;
  // the feet
  for (const x of step ? [5, 10] : [6, 11]) P(x, 10, C.black);
  // the spines: a dome with a jagged edge, darker streaks
  R(3, 5, 9, 5, fur.base); R(4, 4, 7, 1, fur.base); R(5, 3, 5, 1, fur.base);
  for (const [x, y] of [[3, 4], [5, 2], [7, 2], [9, 2], [11, 3], [2, 6], [2, 8], [12, 4]] as const) P(x, y, fur.base);
  for (const [x, y] of [[5, 4], [7, 3], [9, 4], [4, 6], [6, 6], [8, 5], [10, 6], [5, 8], [7, 8], [9, 8]] as const) P(x, y, fur.dark);
  P(6, 3, fur.light); P(8, 3, fur.light); P(4, 5, fur.light);
  // the face, the snout up when it sniffs
  R(11, 6, 3, 4, face); R(14, 7 - sniff, 2, 2, face); P(16, 7 - sniff, C.black); P(12, 7, C.black);
  P(11, 9, tones(face).shade);
};

/** The painter of each pet that is neither a cat nor a dog nor one of the first ones. */
export function speciesPainters(cat: Painter): Readonly<Record<NewPetKind, Painter>> {
  return { robotDog, alien, dragon, ghostCat, parrot, crab, turtle, owl, fox, redPanda, slime, octopus, manekiNeko: manekiNeko(cat), golem, firefly, penguin, rabbit, hedgehog };
}

export type NewPetKind = Exclude<PlainPetKind, 'duck' | 'capybara' | 'axolotl' | 'rocky' | 'clawd'>;
