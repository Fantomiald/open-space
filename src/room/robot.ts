// The automatons of the user's orchestrator drawn as robots, not as people: a square head with an antenna and its
// diode, a visor with two lit eyes, a body of plates with a glowing core on the chest, visible joints. Each role has
// its accent (eyes, core, diode), picked from its name, so two roles tell apart at a glance; a run the orchestrator
// launched (a lead, its sub-agents around it) stands taller, a crown of light on its antenna and its shoulders in its accent. One letter a pixel,
// drawn once per pose like the chibi people (chibi.ts), through the same SpriteSource.
import { PEOPLE_INK as INK, ROBOT_ACCENTS, ROBOT_METAL as M } from '../design/people-palette.ts';
import { ART_SCALE, artCanvas, outline, tones } from './pixel-art.ts';
import { hash, type Pose, type SpriteSource } from './sprites.ts';

/** How a robot looks: its accent, and whether it is a lead, a run the orchestrator launched (taller, crowned). */
export interface RobotLook { accent: string; lead: boolean }

/**
 * A role's robot: the same role always gets the same accent (the high bits of its hash spread the roles best).
 * `lead`: a run of the orchestrator, not one of its sub-agents.
 */
export function robotLook(role: string, lead = false): RobotLook {
  // a role as its file names it ("code-reviewer") or as people read it ("Code reviewer"): the same robot
  const name = role.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return { accent: ROBOT_ACCENTS[(hash(name) >>> 24) % ROBOT_ACCENTS.length], lead };
}

/** The canvas of a sprite and where its feet are on it, as for the chibi people (chibi.ts), so they stand alike. */
const CANVAS = { width: 26, height: 44 };
const FEET = { x: 13, y: 41 };
/** The robot's column on the canvas (it is 16 art pixels wide). */
const LEFT = 5;

/** The head, from the antenna's diode down to the neck. */
const HEAD_FRONT = [
  '.......AA.......',
  '.......ss.......',
  '...hhhhhhhhhh...',
  '..hLLLLLLLLLHh..',
  '..hLHHHHHHHHbh..',
  '.jhLvvvvvvvvbhj.',
  '.jhLvewvvewvbhj.',
  '.jhLvvvvvvvvbhj.',
  '..hHHHHHHHHHbh..',
  '..hHHgHgHgHHbh..',
  '...hhhhhhhhhh...',
  '......jjjj......',
];
const HEAD_BACK = [
  '.......AA.......',
  '.......ss.......',
  '...hhhhhhhhhh...',
  '..hLLLLLLLLLHh..',
  '..hLHHHHHHHHbh..',
  '.jhLHgggggHHbhj.',
  '.jhLHHHHHHHHbhj.',
  '.jhLHgggggHHbhj.',
  '..hHHHHHHHHHbh..',
  '..hHHHHHHHHHbh..',
  '...hhhhhhhhhh...',
  '......jjjj......',
];
/** The body: the arms either side of the torso, its plates, and the core in its frame (vents on the back). */
const ARM_LEFT = ['hj', 'HL', 'HL', 'jj', 'HL', 'HL', 'hh', '..'];
const ARM_RIGHT = ['jh', 'bH', 'bH', 'jj', 'bH', 'bH', 'hh', '..'];
const TORSO_FRONT = ['hBBBBBBBBBBh', 'LBkkkkkkkkBb', 'LBkcccccckBb', 'LBkcCCCCckBb', 'LBkcccccckBb', 'LBkkkkkkkkBb', 'LBBBBBBBBBBb', 'hbbbbbbbbbbh'];
const TORSO_BACK = ['hBBBBBBBBBBh', 'LBBBBBBBBBBb', 'LBggggggggBb', 'LBBBBBBBBBBb', 'LBggggggggBb', 'LBBBBBBBBBBb', 'LBBBBBBBBBBb', 'hbbbbbbbbbbh'];
/** Hips, legs with their knees, feet. */
const LEGS = [
  '....jhhhhhhj....',
  '....LHb..LHb....',
  '....jjj..jjj....',
  '....LHb..LHb....',
  '...ffff..ffff...',
  '...hhhh..hhhh...',
];
/** Walking, the other frame: the left leg lifted, its foot a row up. */
const LEGS_STEP = [
  '....jhhhhhhj....',
  '....LHb..LHb....',
  '....jjj..jjj....',
  '...ffff..LHb....',
  '...hhhh..ffff...',
  '.........hhhh...',
];
/** A lead's crown of light above its antenna. */
const CROWN = ['......aAAa......', '.......AA.......'];

/** One sprite's rows, top to bottom, for a frame. */
export function robotRows(look: RobotLook, back: boolean, walkStep: boolean): string[] {
  const head = back ? HEAD_BACK : HEAD_FRONT;
  const torso = back ? TORSO_BACK : TORSO_FRONT;
  const body = torso.map((row, index) => `${ARM_LEFT[index]}${row}${ARM_RIGHT[index]}`);
  // a lead's shoulders are plates of its accent
  if (look.lead) body[0] = `aaa${torso[0].slice(1, -1)}aaa`;
  return [...(look.lead ? CROWN : []), ...head, ...body, ...(walkStep ? LEGS_STEP : LEGS)];
}

interface Frame { back: boolean; walkStep: boolean; blinking: boolean; working: boolean }

function paint(look: RobotLook, frame: Frame): HTMLCanvasElement {
  const { canvas, context } = artCanvas(CANVAS.width, CANVAS.height);
  const accent = tones(look.accent);
  const colours: Readonly<Record<string, string>> = {
    h: M.dark, H: M.base, L: M.light, b: M.shade, B: M.base, j: M.joint, s: M.joint, g: M.grille, f: M.joint, k: M.dark,
    v: M.visor, e: frame.blinking ? M.visor : accent.light, w: frame.blinking ? M.visor : INK.eyeWhite,
    a: accent.base, A: frame.working ? INK.eyeWhite : accent.light,
    // at work, the core glows at full strength on every other beat
    c: frame.working ? accent.light : accent.base, C: frame.working ? INK.eyeWhite : accent.light,
  };
  const rows = robotRows(look, frame.back, frame.walkStep);
  const top = FEET.y - rows.length + 1;
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = colours[letter];
    if (!colour) return;
    context.fillStyle = colour;
    context.fillRect(LEFT + column, top + line, 1, 1);
  });
  outline(canvas, INK.outline);
  return canvas;
}

function mirrored(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, context } = artCanvas(source.width, source.height);
  context.translate(source.width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0);
  return canvas;
}

const sprites = new Map<string, HTMLCanvasElement>();
/** The canvas of a robot in a pose, drawn the first time it is needed. */
export function robotSprite(look: RobotLook, pose: Pose): HTMLCanvasElement {
  const frame: Frame = {
    back: pose.direction.startsWith('up'), walkStep: pose.posture === 'walk' && pose.step === 1,
    blinking: pose.blinking, working: pose.gesture !== 'none' && pose.step === 1,
  };
  const left = pose.direction.endsWith('left');
  const key = `${look.accent}|${look.lead}|${frame.back}|${frame.walkStep}|${frame.blinking}|${frame.working}|${left}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const right = paint(look, frame);
    sprite = left ? mirrored(right) : right;
    sprites.set(key, sprite);
  }
  return sprite;
}

/** How tall a robot stands, in room pixels: the chibi people's 52, a lead its crown more. */
export const robotHeight = (look: RobotLook) => (look.lead ? 56 : 52);

/** The rows of the head on the sprite (the antenna left out): the face shown on name tags. */
const FACE = { x: LEFT + 1, size: 14 };

/**
 * People, and the automatons as robots: `lookOf` gives the robot of whoever is an automaton (undefined for anyone
 * else, drawn by `people` as before).
 */
export function withRobots(people: SpriteSource, lookOf: (personId: string) => RobotLook | undefined): SpriteSource {
  const robotOf = (personId: string | undefined) => (personId === undefined ? null : lookOf(personId) ?? null);
  return {
    height(pose, personId) {
      const robot = robotOf(personId);
      return robot ? robotHeight(robot) : people.height(pose, personId);
    },
    draw(context, personId, pose, x, y) {
      const robot = robotOf(personId);
      if (!robot) return people.draw(context, personId, pose, x, y);
      const sprite = robotSprite(robot, pose);
      const previous = context.imageSmoothingEnabled;
      context.imageSmoothingEnabled = false;
      context.drawImage(sprite, Math.round(x - FEET.x * ART_SCALE), Math.round(y - FEET.y * ART_SCALE), sprite.width * ART_SCALE, sprite.height * ART_SCALE);
      context.imageSmoothingEnabled = previous;
    },
    // a robot never sits at a desk: no hand on the keys
    drawTypingHand(context, personId, feet, hand, step) {
      if (!robotOf(personId)) people.drawTypingHand(context, personId, feet, hand, step);
    },
    drawHead(context, personId, x, y, size) {
      const robot = robotOf(personId);
      if (!robot) return people.drawHead(context, personId, x, y, size);
      paintRobotHead(context, robot, x, y, size);
    },
  };
}

const FACING: Pose = { direction: 'down-right', posture: 'stand', step: 0, blinking: false, smiling: false, gesture: 'none' };

/** A robot's head, face on, in a square of `size` at (x, y). */
function paintRobotHead(context: CanvasRenderingContext2D, robot: RobotLook, x: number, y: number, size: number) {
  const sprite = robotSprite(robot, FACING);
  const top = FEET.y - robotRows(robot, false, false).length + 1 + (robot.lead ? CROWN.length : 0) + 2;
  context.drawImage(sprite, FACE.x, top, FACE.size, FACE.size, Math.round(x), Math.round(y), size, size);
}

const heads = new Map<string, string>();
/** A robot's head as an image (36 px square), for a speech bubble or a sub-agent's face in a thread. */
export function robotHead(robot: RobotLook): string {
  const key = `${robot.accent}|${robot.lead}`;
  let url = heads.get(key);
  if (!url) {
    const { canvas, context } = artCanvas(36, 36);
    context.imageSmoothingEnabled = false;
    paintRobotHead(context, robot, 0, 0, 36);
    url = canvas.toDataURL();
    heads.set(key, url);
  }
  return url;
}
