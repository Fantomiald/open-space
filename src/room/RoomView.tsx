// A room of the office, drawn on a canvas: the office itself (the default view), where the sessions work at their
// desks, or the break room, where the sessions put to rest doze on sofas. People come and go through the door, what is
// said rises in speech bubbles, and clicking someone (or their bubble) opens their session in the detail panel.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { PictureInPictureIcon } from '../command/Icons.tsx';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { ROOM_PALETTE } from '../design/room-palette.ts';
import { t } from '../i18n/index.ts';
import { availability } from '../state/availability.ts';
import { useSessions } from '../state/sessions.ts';
import { USER_SPEAKER, onSpeech } from '../state/speech.ts';
import type { FestivalDay } from '../../shared/festivals.ts';
import type { Look } from '../../shared/look.ts';
import { LOUNGE, OFFICE } from '../../shared/room-layout.ts';
import { paintBackdrop } from './backdrop.ts';
import { BUBBLE_LANE, BUBBLE_ROW_HEIGHT, VISIBLE_ROWS, bubbleText, pruneBubbles, pushBubble, type Bubble } from './bubbles.ts';
import { planRoom, roomSessions, type RoomKind } from './cast.ts';
import { chibiHead, chibiSprites, lookOfStranger } from './chibi.ts';
import { outfitFor } from './outfits.ts';
import { TAG_FONT, paintFrame, type HoveredThing } from './draw.ts';
import { Floor } from './floor.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, RENDER_SCALE, isInRoom, toTile } from './geometry.ts';
import { lightingAt } from './lighting.ts';
import { pictureInPictureSupported } from './pip.ts';
import { pixelFurniture } from './pixel-furniture.ts';
import { PLAYER_ID, Scene, selfName } from './scene.ts';
import { showsMetricsBadge } from './metrics.ts';
import { boardContent } from './whiteboard.ts';

const FRAME_MS = 1000 / 15;

/** `scale`: CSS pixels per canvas pixel. `offset`: how much of the canvas is cropped on the left (narrow screens zoom in). */
interface StageLayout { width: number; scale: number; offset: number }
const PRUNE_EVERY_MS = 250;
/** The boxes around the canvas: a click there is a click on the dark around the room. */
const BACKDROP_CLASSES = ['cp-room', 'cp-room__fit', 'cp-room__stage', 'cp-room__zoom'];

const PALETTE_VARIABLES = {
  '--room-bubble': ROOM_PALETTE.bubble,
  '--room-bubble-from-user': ROOM_PALETTE.bubbleFromUser,
  '--room-bubble-ink': ROOM_PALETTE.bubbleInk,
  '--room-bubble-shadow': ROOM_PALETTE.bubbleShadow,
  '--room-more': ROOM_PALETTE.more,
  '--room-more-text': ROOM_PALETTE.moreText,
  '--room-backdrop': ROOM_PALETTE.backdrop,
} as CSSProperties;

/** The time of day as a fractional hour (14:30 is 14.5). */
const currentHour = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60; };

/**
 * Mounted again (a new `key`) when the room or the festival changes; `day`: the festival and who it is for. `pip`: the small window the room is shown in
 * instead of the page (kept by App, so it stays open from one room to the other); `onOpenPip` opens it, from a click.
 */
export function RoomView({ room, day, pip, onOpenPip }: { room: RoomKind; day: FestivalDay; pip: Window | null; onOpenPip: () => void }) {
  const { festival, guests } = day;
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const ready = useSessions((s) => s.claude !== null);
  const selectedId = useSessions((s) => s.selectedId);
  const select = useSessions((s) => s.select);
  const crew = useSessions((s) => s.crew);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  const selected = useRef(selectedId);
  const crewRef = useRef(crew);
  crewRef.current = crew;
  const synced = useRef(false);
  // the numbers object is there while the settings name a numbers file (App mounts the room again when that changes)
  const [floor] = useState(() => new Floor(room === 'lounge' ? LOUNGE : OFFICE, festival, useSessions.getState().preferences.metricsFile !== ''));
  const [scene] = useState(() => new Scene(floor, { withPet: room === 'office', withVisitors: room === 'office', atDoor: useSessions.getState().enteredThroughDoor }));
  // the crew without a session, who may drop by the office
  const free = useMemo(() => availability(crew, Object.values(sessions)).filter((person) => person.place === 'free').map((person) => person.member.name), [crew, sessions]);
  const freeRef = useRef(free);
  freeRef.current = free;
  const hoveredThing = useRef<HoveredThing>(null);
  const hoveredId = useRef<string | null>(null);
  // what a click on the thing under the pointer does, in a card that follows the pointer
  const hint = useRef<HTMLDivElement>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  // the user wears their own look; a session, sub-agent or visitor named like a crew member wears that member's look
  const lookFor = useMemo(() => (personId: string): Look => {
    if (personId === PLAYER_ID) return crewRef.current.find((member) => member.self)?.look ?? DEFAULT_LOOK;
    const name = scene.nameOf(personId);
    const member = crewRef.current.find((candidate) => !candidate.self && candidate.name === name);
    return member ? member.look ?? DEFAULT_LOOK : lookOfStranger(personId);
  }, [scene]);
  // what the festival puts on everyone (a sub-agent's head, in a tag, is drawn without it)
  const [sprites] = useState(() => chibiSprites(lookFor, (personId) => personId === PLAYER_ID
    ? outfitFor(festival, selfName(crewRef.current), true, guests)
    : outfitFor(festival, scene.nameOf(personId), false, guests)));
  const [furniture] = useState(() => pixelFurniture(boardContent(festival, guests)));
  const [bubbles, setBubbles] = useState<readonly Bubble[]>([]);
  const [layout, setLayout] = useState<StageLayout>({ width: 0, scale: 1, offset: 0 });
  const list = useMemo(() => Object.values(sessions), [sessions]);
  const inRoom = useMemo(() => roomSessions(list, seen, room).flat(), [list, seen, room]);
  // the plan reads who sits where now: it changes with the sessions, and the scene follows it below
  const plan = useMemo(() => planRoom(list, seen, scene.seats(), floor.seatCount, room, scene.playerSeats()), [list, seen, scene, floor, room]);
  const hidden = useMemo(() => inRoom.filter((session) => !plan.seats.has(session.id)), [inRoom, plan]);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => { selected.current = selectedId; }, [selectedId]);

  // the people already there when the room opens are seated at once; later ones walk in
  useEffect(() => {
    if (!ready) return;
    scene.sync(plan, !synced.current);
    synced.current = true;
  }, [scene, plan, ready]);

  // in the small window, the room is drawn on that window's clock: the page's own tab is hidden then, and its timers slow down
  useEffect(() => {
    const host = pip ?? window;
    const context = canvas.current!.getContext('2d')!;
    context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    context.imageSmoothingEnabled = false;
    const backdrop = paintBackdrop(floor.layout, festival, room, guests);
    const dozing = room === 'lounge';
    const reducedMotion = host.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer: number | undefined;
    let last = 0;
    const frame = () => {
      const now = performance.now();
      const elapsed = Math.min(100, now - last);
      scene.step(elapsed);
      last = now;
      const state = useSessions.getState();
      const hour = state.preview.hour ?? currentHour();
      scene.visits?.step(elapsed, { free: freeRef.current, hour, enabled: state.preferences.officeLife, blocked: scene.playerSpot?.at ?? null });
      paintFrame(context, backdrop, scene, sprites, furniture, { time: now, reducedMotion, selectedSessionId: selected.current, lighting: lightingAt(hour), hour, dozing, hoveredThing: hoveredThing.current, metricsBadge: showsMetricsBadge(state.metricsUnread, state.metricsOpen), hoveredId: hoveredId.current, festival, guests, room, playerName: selfName(crewRef.current), pet: useSessions.getState().preferences.pet });
      // through the door: the other room opens, the user standing at its door
      if (scene.playerWentOut) { scene.playerWentOut = false; useSessions.getState().setView(room === 'office' ? 'repos' : 'salle'); }
    };
    const start = () => {
      if (timer !== undefined || host.document.hidden) return;
      last = performance.now();
      frame();
      timer = host.setInterval(frame, FRAME_MS);
    };
    const stop = () => { host.clearInterval(timer); timer = undefined; };
    const onVisibility = () => (host.document.hidden ? stop() : start());
    host.document.addEventListener('visibilitychange', onVisibility);
    void host.document.fonts.load(TAG_FONT);
    start();
    return () => { stop(); host.document.removeEventListener('visibilitychange', onVisibility); };
  }, [scene, floor, room, festival, guests, sprites, furniture, pip]);

  useEffect(() => {
    let lastId = 0;
    return onSpeech(({ sessionId, speaker, text }) => {
      const personId = speaker === USER_SPEAKER ? PLAYER_ID : sessionId;
      const position = scene.screenPositionOf(personId);
      const words = bubbleText(text);
      if (!position || !words) return;
      const label = personId === PLAYER_ID ? selfName(crewRef.current) : scene.characters.get(personId)!.person.title;
      const head = chibiHead(lookFor(personId));
      setBubbles((stack) => pushBubble(stack, { id: ++lastId, sessionId, label, text: words, x: position.x, fromUser: personId === PLAYER_ID, head, bornAt: Date.now() }));
    });
  }, [scene, lookFor]);

  const hasBubbles = bubbles.length > 0;
  useEffect(() => {
    if (!hasBubbles) return;
    const timer = window.setInterval(() => setBubbles((stack) => pruneBubbles(stack, Date.now())), PRUNE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [hasBubbles]);

  useLayoutEffect(() => {
    const element = stage.current!;
    const measure = () => {
      const width = element.clientWidth;
      const zoomedWidth = zoom.current!.clientWidth;
      setLayout({ width, scale: zoomedWidth / CANVAS_WIDTH, offset: (zoomedWidth - width) / 2 });
    };
    // the observer of the window the stage is in (the page, or the small window)
    const observer = new (element.ownerDocument.defaultView ?? window).ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [pip]);

  const roomPoint = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) * CANVAS_WIDTH / box.width, y: (event.clientY - box.top) * CANVAS_HEIGHT / box.height };
  };

  const onClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = roomPoint(event);
    if (useSessions.getState().preferences.pet.kind !== 'none' && scene.pokePet(point)) return;
    const character = scene.characterAt(point);
    if (character) { select(character.person.sessionId); return; }
    const visitor = scene.visits?.at(point);
    if (visitor) { useSessions.getState().openNewSession({ person: visitor.name }); return; }
    // the dark around the room: like the panel's cross, back to the office without a session open
    if (!isInRoom(point)) { select(null); return; }
    if (floor.isDoorAt(point)) { scene.walkPlayerOut(); return; }
    if (floor.isUserScreenAt(point)) { useSessions.getState().send({ t: 'openTerminal' }); return; }
    if (floor.isBoardAt(point)) { useSessions.getState().openBoard(true); return; }
    if (floor.isMetricsAt(point)) { useSessions.getState().openMetrics(true); return; }
    const tile = toTile(point);
    const spot = floor.spotAt(tile);
    if (spot) scene.sitPlayerAt(spot);
    else if (floor.isWalkable(tile)) scene.walkPlayerTo(tile);
  };

  const onMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = roomPoint(event);
    const person = scene.personAt(point);
    // a session in front of a visitor, the door or the desk takes the click (the user, seated behind their laptop, does not)
    const visitor = person && person !== PLAYER_ID ? null : scene.visits?.at(point) ?? null;
    hoveredId.current = visitor?.id ?? person;
    const thing: HoveredThing = (person && person !== PLAYER_ID) || visitor ? null
      : floor.isDoorAt(point) ? 'door' : floor.isUserScreenAt(point) ? 'screen' : floor.isBoardAt(point) ? 'board' : floor.isMetricsAt(point) ? 'metrics' : null;
    hoveredThing.current = thing;
    const words = t.room.hint;
    const text = visitor ? words.startWith(visitor.name)
      : thing === 'door' ? (room === 'office' ? words.toLounge : words.toOffice) : thing === 'screen' ? words.openTerminal : thing === 'board' ? words.openBoard
      : thing === 'metrics' ? (useSessions.getState().metricsUnread ? words.newMetrics : words.openMetrics) : null;
    setHintText(text);
    const card = hint.current;
    if (!card || !text) return;
    // right of the pointer, or left of it near the right edge
    const box = stage.current!.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const left = x + 16 + card.offsetWidth > box.width ? x - 10 - card.offsetWidth : x + 16;
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(y + 10)}px)`;
  };
  // the dark around the canvas, on a wide or tall panel: the same as the dark around the room in it
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && BACKDROP_CLASSES.some((name) => (event.target as Element).classList.contains(name))) select(null);
  };
  const onMouseLeave = () => { hoveredThing.current = null; hoveredId.current = null; setHintText(null); };

  const seated = plan.people.length;
  const description = room === 'lounge' ? t.room.description.lounge(seated) : t.room.description.office(seated);
  const view = (
    <div className="cp-room" onClick={onBackdropClick}>
      <div className="cp-room__fit">
        <div className="cp-room__stage" ref={stage} style={PALETTE_VARIABLES}>
          <div className="cp-room__zoom" ref={zoom}>
            <canvas
              ref={canvas} className="cp-room__canvas" width={CANVAS_WIDTH * RENDER_SCALE} height={CANVAS_HEIGHT * RENDER_SCALE} onClick={onClick}
              onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
              role="img" aria-label={description}
            />
          </div>
          <div ref={hint} className="cp-room__hint-card" hidden={!hintText} aria-hidden="true">{hintText}</div>
          <div className="cp-room__bubbles" aria-hidden="true">
            {bubbles.map((bubble) => <SpeechBubble key={bubble.id} bubble={bubble} layout={layout} onOpen={() => select(bubble.sessionId)} />)}
          </div>
          {!pip && pictureInPictureSupported() && (
            <button type="button" className="cp-icon-button cp-room__pip" aria-label={t.room.pip.open} title={t.room.pip.openTitle} onClick={onOpenPip}>
              <PictureInPictureIcon />
            </button>
          )}
          {hidden.length > 0 && (
            <div className="cp-room__more">
              <button type="button" aria-expanded={showHidden} title={t.room.hidden.more(hidden.length)} onClick={() => setShowHidden((shown) => !shown)}>
                +{hidden.length}
              </button>
              {showHidden && (
                <ul aria-label={t.room.hidden.list}>
                  {hidden.map((session) => <li key={session.id}><button type="button" onClick={() => { select(session.id); setShowHidden(false); }}>{session.name}</button></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  if (!pip) return view;
  return (
    <>
      <div className="cp-room" data-away>
        <p className="cp-room__hint">{t.room.pip.away} <button type="button" className="cp-button" onClick={() => pip.close()}>{t.room.pip.bringBack}</button></p>
      </div>
      {createPortal(view, pip.document.body)}
    </>
  );
}

/** Placed by hand once its width is known: kept inside the room, its tail pointing at the speaker. */
function SpeechBubble({ bubble, layout, onOpen }: { bubble: Bubble; layout: StageLayout; onOpen: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = element.current!;
    const { scale, offset, width: stageWidth } = layout;
    const width = node.offsetWidth;
    const rowHeight = Math.max(BUBBLE_ROW_HEIGHT * scale, node.offsetHeight + 3);
    const lane = Math.max(BUBBLE_LANE * scale, (VISIBLE_ROWS - 1) * rowHeight + 4);
    const anchor = bubble.x * scale - offset;
    const left = Math.max(4, Math.min(stageWidth - width - 4, anchor - width / 2));
    node.style.setProperty('--tail', `${Math.round(Math.max(10, Math.min(width - 10, anchor - left)))}px`);
    node.style.transform = `translate(${Math.round(left)}px, ${Math.round(lane - bubble.row * rowHeight)}px)`;
    // the first position is applied without animation, so a new bubble does not slide in from the corner
    if (!node.dataset.placed) {
      void node.offsetWidth;
      node.dataset.placed = 'true';
    }
  }, [bubble.x, bubble.row, layout]);
  return (
    // the room's canvas describes the same sessions to screen readers, hence a plain clickable div
    <div ref={element} className="cp-room__bubble" data-from-user={bubble.fromUser} data-fading={bubble.fadingSince !== null} onClick={onOpen}>
      <img className="cp-room__bubble-head" src={bubble.head} alt="" width={27} height={27} />
      <span><b>{t.room.speaker(bubble.label)}</b> {bubble.text}</span>
    </div>
  );
}
