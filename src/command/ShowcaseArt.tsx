import { useEffect, useMemo, useRef } from 'react';
import { randomLook, type Look } from '../../shared/look.ts';
import { DEFAULT_LOOK, SKIN_TONES } from '../design/people-palette.ts';
import { t } from '../i18n/index.ts';
import { reducedMotion } from '../lib/motion.ts';
import { MODIFIER } from '../lib/platform.ts';
import { HAT_ROWS, chibiHead, chibiSprite } from '../room/chibi.ts';
import { robotHead, robotLook } from '../room/robot.ts';
import type { Gesture, Posture } from '../room/sprites.ts';
import { CheckIcon, ClockIcon, GlobeIcon, ModsIcon, PinIcon, PopOutIcon, SendIcon, SparklesIcon, WebhookIcon } from './Icons.tsx';

/** The drawings of the tour and of the news: one per feature, made of the room's own characters and of Open Space's windows. */
export type Art = 'room' | 'parallel' | 'automata' | 'mods' | 'browser' | 'layout';

/** The same strangers on every drawing (a seeded draw), beside the user when their look is known. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
/** Plain-looking people (a human skin, no sunglasses), so the drawing reads as colleagues, not as a costume party. */
function strangers(count: number): Look[] {
  const found: Look[] = [];
  for (let seed = 1; found.length < count; seed += 1) {
    const look = randomLook(seeded(seed));
    if ((SKIN_TONES as readonly string[]).includes(look.skin) && !look.sunglasses && look.hat === 'none') found.push(look);
  }
  return found;
}
const STRANGERS = strangers(3);

const SCALE = 4;

/** A character of the room, drawn like there and moving on the spot (two frames). */
function Figure({ look, posture = 'stand', gesture = 'none', smiling = false }: { look: Look; posture?: Posture; gesture?: Gesture; smiling?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    let step: 0 | 1 = 0;
    const paint = () => {
      const sprite = chibiSprite(look, { direction: 'down-right', posture, step, blinking: false, smiling, gesture });
      context.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      context.drawImage(sprite, 0, HAT_ROWS, sprite.width, sprite.height - HAT_ROWS, 0, 0, sprite.width * SCALE, (sprite.height - HAT_ROWS) * SCALE);
      step = step ? 0 : 1;
    };
    paint();
    if (reducedMotion() || (gesture === 'none' && posture !== 'walk')) return;
    const timer = window.setInterval(paint, gesture === 'typing' ? 220 : 420);
    return () => window.clearInterval(timer);
  }, [look, posture, gesture, smiling]);
  return <canvas ref={canvas} className="cp-art__figure" width={26 * SCALE} height={36 * SCALE} />;
}

/** A state's sign, as on the labels above the people in the room. */
function Sign({ state }: { state: 'working' | 'waiting' | 'done' }) {
  return <span className="cp-art__sign" data-state={state} aria-hidden="true">{state === 'working' ? '…' : state === 'waiting' ? '!' : <CheckIcon />}</span>;
}

function Room({ look }: { look: Look }) {
  const cast = t.showcase.tour.cast;
  const people = [
    { state: 'working', look: STRANGERS[0], posture: 'sit', gesture: 'typing' },
    { state: 'waiting', look, posture: 'stand', gesture: 'raising' },
    { state: 'done', look: STRANGERS[1], posture: 'stand', gesture: 'none' },
  ] as const;
  return (
    <div className="cp-art__room">
      {people.map((person) => (
        <figure key={person.state} className="cp-art__person" data-state={person.state}>
          <figcaption className="cp-art__label"><Sign state={person.state} />{cast[person.state]}</figcaption>
          <div className="cp-art__body">
            <Figure look={person.look} posture={person.posture} gesture={person.gesture} smiling={person.state === 'done'} />
            {person.posture === 'sit' && <span className="cp-art__desk" aria-hidden="true"><span /></span>}
          </div>
        </figure>
      ))}
    </div>
  );
}

const LINES = ['first', 'second', 'third'];

function Lines({ count = 3 }: { count?: number }) {
  return <span className="cp-art__lines">{LINES.slice(0, count).map((line) => <span key={line} />)}</span>;
}

function Parallel({ look }: { look: Look }) {
  const words = t.showcase.tour.art;
  const people = [{ layer: 0, look: STRANGERS[2] }, { layer: 1, look: STRANGERS[0] }, { layer: 2, look }];
  return (
    <div className="cp-art__parallel">
      <div className="cp-art__stack">
        {people.map(({ layer, look: person }) => (
          <div key={layer} className="cp-art__window" data-layer={layer}>
            <div className="cp-art__bar"><img src={chibiHead(person)} alt="" width={18} height={18} /><Lines count={1} /></div>
            <Lines count={layer === 2 ? 3 : 2} />
            {layer === 2 && <span className="cp-art__typing" aria-hidden="true"><span /><span /><span /></span>}
          </div>
        ))}
      </div>
      <div className="cp-art__keys">
        <span><kbd className="cp-kbd">N</kbd>{words.newSession}</span>
        <span><kbd className="cp-kbd">{MODIFIER}</kbd><kbd className="cp-kbd">K</kbd>{words.search}</span>
      </div>
    </div>
  );
}

function Automata() {
  const words = t.showcase.tour.art;
  return (
    <div className="cp-art__automata">
      <div className="cp-art__triggers">
        <span className="cp-art__chip"><ClockIcon />{words.schedule}</span>
        <span className="cp-art__chip"><WebhookIcon />{words.webhook}</span>
      </div>
      <div className="cp-art__robot"><img src={robotHead(robotLook('tour'))} alt="" width={72} height={72} /></div>
      <div className="cp-art__chat">
        <p className="cp-art__bubble" data-from="bot"><SendIcon />{words.telegram}</p>
        <p className="cp-art__bubble" data-from="me">{words.telegramReply}</p>
      </div>
    </div>
  );
}

function Mods() {
  const words = t.showcase.tour.art;
  return (
    <div className="cp-art__mods">
      <p className="cp-art__prompt"><SparklesIcon /><span className="cp-art__typed">{words.modPrompt}</span></p>
      <div className="cp-art__window" data-mod="true">
        <div className="cp-art__bar"><ModsIcon /><span>{words.modTitle}</span><span className="cp-art__dots" aria-hidden="true"><span /><span /></span></div>
        <p className="cp-art__timer">24:13</p>
        <span className="cp-art__progress" aria-hidden="true"><span /></span>
      </div>
    </div>
  );
}

function Browser({ look }: { look: Look }) {
  const words = t.showcase.tour.art;
  return (
    <div className="cp-art__browser">
      <div className="cp-art__window" data-pip="true">
        <div className="cp-art__bar"><img src={chibiHead(look)} alt="" width={18} height={18} /><span>{words.tester}</span><GlobeIcon /></div>
        <p className="cp-art__address">{words.address}</p>
        <div className="cp-art__page">
          <Lines count={1} />
          <span className="cp-art__field" />
          <span className="cp-art__field" />
          <span className="cp-art__cta">{words.signUp}</span>
          <svg className="cp-art__cursor" viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" /></svg>
        </div>
      </div>
    </div>
  );
}

function Layout({ look }: { look: Look }) {
  const words = t.showcase.tour.art;
  return (
    <div className="cp-art__layout">
      <div className="cp-art__screen">
        <div className="cp-art__mini-room">
          {[STRANGERS[0], look, STRANGERS[1]].map((person, index) => <img key={LINES[index]} src={chibiHead(person)} alt="" width={27} height={27} />)}
        </div>
        <div className="cp-art__window" data-out="true">
          <div className="cp-art__bar"><PopOutIcon /><Lines count={1} /><PinIcon /></div>
          <Lines count={2} />
        </div>
        <span className="cp-art__chip" data-floating="true"><PinIcon />{words.popOut}</span>
      </div>
      <div className="cp-art__keys">
        <span><kbd className="cp-kbd">tab</kbd>{words.hide}</span>
        <span><kbd className="cp-kbd">{MODIFIER}</kbd><kbd className="cp-kbd">.</kbd>{words.focus}</span>
      </div>
    </div>
  );
}

/** A feature's drawing on its stage. `look`: the user's, when known, so they find themself in the room. */
export function ShowcaseArt({ art, look }: { art: Art; look?: Look }) {
  const self = useMemo(() => look ?? DEFAULT_LOOK, [look]);
  return (
    <div className="cp-art" data-art={art} aria-hidden="true">
      {art === 'room' && <Room look={self} />}
      {art === 'parallel' && <Parallel look={self} />}
      {art === 'automata' && <Automata />}
      {art === 'mods' && <Mods />}
      {art === 'browser' && <Browser look={self} />}
      {art === 'layout' && <Layout look={self} />}
    </div>
  );
}
