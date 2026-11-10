// A room of the office, drawn on a canvas: the office itself (the default view), where the sessions work at their
// desks, the break room, where the sessions put to rest doze on sofas, or the automatons' server room, where the
// automatons of the user's orchestrator stand in capsules around a floating orb, as robots (themes/servers.ts,
// robot.ts). People come and go through the door, what is said rises in speech bubbles, and clicking someone (or their
// bubble) opens their session in the detail panel.
import { inProject } from '../state/projects.ts';
import { useProjects } from '../state/useProjects.ts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { AUTOMATON_LOOK, DEFAULT_LOOK } from '../design/people-palette.ts';
import { runOfPerson } from '../../shared/automata.ts';
import { seatedRuns } from '../state/automata.ts';
import { ROOM_PALETTE } from '../design/room-palette.ts';
import { t } from '../i18n/index.ts';
import { availability } from '../state/availability.ts';
import { useSessions } from '../state/sessions.ts';
import { useReducedMotion } from '../lib/motion.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { USER_SPEAKER, onSpeech } from '../state/speech.ts';
import type { FestivalDay } from '../../shared/festivals.ts';
import type { Look } from '../../shared/look.ts';
import { LOUNGE, OFFICE, SERVER_ROOM } from '../../shared/room-layout.ts';
import { paintBackdrop } from './backdrop.ts';
import { BUBBLE_LANE, BUBBLE_ROW_HEIGHT, VISIBLE_ROWS, bubbleText, pruneBubbles, pushBubble, type Bubble } from './bubbles.ts';
import { decorOf, planRoom, roomSessions, type RoomKind } from './cast.ts';
import { chibiHead, chibiSprites, lookOfStranger } from './chibi.ts';
import { outfitFor } from './outfits.ts';
import { TAG_FONT, paintFrame, type HoveredThing } from './draw.ts';
import { isOrbAt } from './server-room.ts';
import { Floor } from './floor.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, RENDER_SCALE, isInRoom, toTile } from './geometry.ts';
import { css, currentHour, lightingAt, type Lighting } from './lighting.ts';
import { dressRoom, themedLighting } from './themes/index.ts';
import { SERVERS } from './themes/servers.ts';
import { robotHead, robotLook, withRobots, type RobotLook } from './robot.ts';
import { pixelFurniture } from './pixel-furniture.ts';
import { PLAYER_ID, Scene, selfName, type Character } from './scene.ts';
import type { Pose } from './sprites.ts';
import { modsNews, showsMetricsBadge } from './metrics.ts';
import { useRoomFrame } from './useRoomFrame.ts';
import { ArrangeHint } from './ArrangeHint.tsx';
import { boardContent } from './whiteboard.ts';
import { advanceTrip, exitsOf, through } from './pet-trip.ts';

const FRAME_MS = 1000 / 15;

/** `scale`: CSS pixels per canvas pixel. `offset`: how much of the canvas is cropped on the left (narrow screens zoom in). */
interface StageLayout { width: number; scale: number; offset: number }
const PRUNE_EVERY_MS = 250;
/** Held this long on someone, they are picked up; moved further than HOLD_SLOP canvas pixels while held, at once. */
const HOLD_MS = 250;
const HOLD_SLOP = 4;
const STANDING: Pose = { direction: 'down-right', posture: 'stand', step: 0, blinking: false, smiling: false, gesture: 'none' };

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

/** The sky of the windows, carried on to the page behind the room (--sky-top and --sky-bottom, read by tokens.css). */
function showSky(document: Document, lighting: Lighting) {
  const style = document.documentElement.style;
  const top = css(lighting.skyTop), bottom = css(lighting.skyBottom);
  if (style.getPropertyValue('--sky-top') === top && style.getPropertyValue('--sky-bottom') === bottom) return;
  style.setProperty('--sky-top', top);
  style.setProperty('--sky-bottom', bottom);
}

/**
 * The robot of an automaton by its person id, or undefined for anyone else: an automaton in the room (a run is a
 * lead, its sub-agents are not), or one of the runs it started, a face on its tag (`<its id>/<the run's id>`).
 */
function automatonLookOf(scene: Scene, personId: string): RobotLook | undefined {
  const own = scene.characters.get(personId)?.person;
  if (own) return own.automatonRole === undefined ? undefined : robotLook(own.automatonRole, own.automatonAgent === undefined);
  const cut = personId.lastIndexOf('/');
  const owner = cut > 0 ? scene.characters.get(personId.slice(0, cut))?.person : undefined;
  const role = owner?.automatonRole === undefined ? undefined : owner.agents.find((agent) => agent.id === personId.slice(cut + 1))?.type;
  return role === undefined ? undefined : robotLook(role);
}

/**
 * The pet and this room, each frame, while one is picked. Elsewhere, its trip moves on by the clock; here, it comes in
 * (by the passage it took, if just now) and the room steps it; gone out by a passage, it goes on to the room on the
 * other side.
 */
function followPet(scene: Scene, room: RoomKind, state: ReturnType<typeof useSessions.getState>) {
  if (state.preferences.pet.kind === 'none') { scene.pet = null; return; }
  const now = Date.now();
  if (scene.petLeftBy) {
    state.movePet(through(state.petTrip, scene.petLeftBy, now));
    scene.pet = null;
    scene.petLeftBy = null;
    return;
  }
  const trip = advanceTrip(state.petTrip, now, room);
  if (trip !== state.petTrip) state.movePet(trip);
  if (trip.room !== room) { scene.pet = null; return; }
  if (!scene.pet) scene.bringPet(now - trip.since < 3000 ? trip.via : null, trip.since + trip.stay - now, exitsOf(room).map((exit) => exit.via));
}

/** Mounted again (a new `key`) when the room or the festival changes; `day`: the festival and who it is for. */
export function RoomView({ room, day }: { room: RoomKind; day: FestivalDay }) {
  const reducedMotion = useReducedMotion(useSessions((s) => s.preferences.reduceMotion));
  // the server room keeps its own look, festival or not (themes/servers.ts)
  const { festival, guests } = room === 'automata' ? { festival: null, guests: [] as string[] } : day;
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const ready = useSessions((s) => s.claude !== null);
  const openIds = useSessions((s) => s.openIds);
  const select = useSessions((s) => s.select);
  const show = useSessions((s) => s.show);
  /** a click opens the session alone; Shift+click adds it under the open ones (or takes it out) */
  const crew = useSessions((s) => s.crew);
  // the user's automatons at work sit in their own room, never at a session's desk (src/room/cast.ts)
  const automata = useSessions((s) => s.automata);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  useRoomFrame(stage, room);
  const selected = useRef(openIds);
  const crewRef = useRef(crew);
  crewRef.current = crew;
  const synced = useRef(false);
  // the automatons' room is a room of servers, whatever the theme: it is dressed so while it is shown
  useLayoutEffect(() => {
    if (room !== 'automata') return;
    dressRoom(SERVERS);
    return () => dressRoom(null);
  }, [room]);
  // the office and the break room have the mods object, the office the teleporter to the automatons' room
  const [floor] = useState(() => new Floor(room === 'lounge' ? LOUNGE : room === 'automata' ? SERVER_ROOM : OFFICE, festival, room !== 'automata', room === 'office'));
  const [scene] = useState(() => {
    const { enteredThroughDoor, arrivedByPortal } = useSessions.getState();
    return new Scene(floor, { withVisitors: room === 'office', atDoor: enteredThroughDoor && !arrivedByPortal, atPortal: arrivedByPortal || room === 'automata' });
  });
  // the seats the user put people on, by session, kept for when they come back (and across reloads)
  const keptSeats = useRef(new Map(Object.entries(readPreference<Record<string, number>>(`seats:${room}`, {})).filter(([, seat]) => seat < floor.seatCount)));
  // counts the moves by hand: the plan is drawn again from the seats they leave
  const [moves, setMoves] = useState(0);
  const press = useRef<{ character: Character; at: { x: number; y: number }; pointer: number; timer: number } | null>(null);
  const [carrying, setCarrying] = useState(false);
  // the click that ends a drop must not open the session
  const dropped = useRef(false);
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
    // an automaton, and the runs it started (their faces on its tag): never a look of the crew
    if (runOfPerson(personId)) return AUTOMATON_LOOK;
    const name = scene.nameOf(personId);
    const member = crewRef.current.find((candidate) => !candidate.self && candidate.name === name);
    return member ? member.look ?? DEFAULT_LOOK : lookOfStranger(personId);
  }, [scene]);
  // what the festival puts on everyone (a sub-agent's head, in a tag, is drawn without it)
  // the automatons are robots of their role (robot.ts), everyone else a chibi in the festival's outfit
  const [sprites] = useState(() => withRobots(chibiSprites(lookFor, (personId) => personId === PLAYER_ID
    ? outfitFor(festival, selfName(crewRef.current), true, guests)
    : outfitFor(festival, scene.nameOf(personId), false, guests)), (personId) => automatonLookOf(scene, personId)));
  // a click reaches someone up to the top of their hat
  useEffect(() => { scene.heightOf = (personId) => sprites.height(STANDING, personId); }, [scene, sprites]);
  const [furniture] = useState(() => pixelFurniture(boardContent(festival, guests)));
  const [bubbles, setBubbles] = useState<readonly Bubble[]>([]);
  const [layout, setLayout] = useState<StageLayout>({ width: 0, scale: 1, offset: 0 });
  const list = useMemo(() => Object.values(sessions), [sessions]);
  const inRoom = useMemo(() => roomSessions(list, seen, room).flat(), [list, seen, room]);
  // the plan reads who sits where now: it changes with the sessions and with a move by hand (`moves`), and the scene follows it below
  const bots = useMemo(() => seatedRuns(automata), [automata]);
  const plan = useMemo(() => planRoom(list, seen, new Map([...keptSeats.current, ...scene.seats()]), floor.seatCount, room, scene.playerSeats(), bots), [list, seen, scene, floor, room, moves, bots]);
  const hidden = useMemo(() => inRoom.filter((session) => !plan.seats.has(session.id)), [inRoom, plan]);
  // the automatons without a capsule, shown over the server room's door
  const waiting = useRef(plan.waitingAutomata);
  waiting.current = plan.waitingAutomata;
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => { selected.current = openIds; }, [openIds]);
  // the people of the other projects, while one is picked in the header
  const { project } = useProjects();
  const ghosts = useRef<ReadonlySet<string>>(new Set());
  ghosts.current = useMemo(() => new Set(list.filter((session) => !inProject(session, project)).map((session) => session.id)), [list, project]);

  // the people already there when the room opens are seated at once; later ones walk in
  useEffect(() => {
    if (!ready) return;
    scene.sync(plan, !synced.current);
    synced.current = true;
  }, [scene, plan, ready]);

  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    context.imageSmoothingEnabled = false;
    const backdrop = paintBackdrop(floor.layout, festival, decorOf(room), guests);
    const dozing = room === 'lounge';
    let timer: number | undefined;
    let last = 0;
    const frame = () => {
      const now = performance.now();
      const elapsed = Math.min(100, now - last);
      scene.step(elapsed);
      last = now;
      const state = useSessions.getState();
      const hour = state.preview.hour ?? currentHour();
      const lighting = themedLighting(lightingAt(hour));
      showSky(document, lighting);
      scene.visits?.step(elapsed, { free: freeRef.current, hour, enabled: state.preferences.officeLife, blocked: scene.playerSpot?.at ?? null });
      followPet(scene, room, state);
      paintFrame(context, backdrop, scene, sprites, furniture, { time: now, reducedMotion, tagColors: state.preferences.tagColors, openSessionIds: selected.current, ghostIds: ghosts.current, lighting, hour, dozing, hoveredThing: hoveredThing.current, metricsBadge: showsMetricsBadge(modsNews(state), state.modsOpen), hoveredId: hoveredId.current, festival, guests, room: decorOf(room), playerName: selfName(crewRef.current), pet: useSessions.getState().preferences.pet, waitingAutomata: waiting.current });
      // through the door: the other room opens, the user standing at its door
      if (scene.playerWentOut) { scene.playerWentOut = false; useSessions.getState().setView(room === 'office' ? 'repos' : 'salle'); }
      // through the teleporter: the other room opens, the user coming in on its twin
      if (scene.playerTeleported) { scene.playerTeleported = false; useSessions.getState().teleport(room === 'office' ? 'automates' : 'salle'); }
    };
    const start = () => {
      if (timer !== undefined || document.hidden) return;
      last = performance.now();
      frame();
      timer = window.setInterval(frame, FRAME_MS);
    };
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    void document.fonts.load(TAG_FONT);
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [scene, floor, room, festival, guests, sprites, furniture, reducedMotion]);

  useEffect(() => {
    let lastId = 0;
    return onSpeech(({ sessionId, speaker, text }) => {
      const personId = speaker === USER_SPEAKER ? PLAYER_ID : sessionId;
      const position = scene.screenPositionOf(personId);
      const words = bubbleText(text);
      if (!position || !words) return;
      const label = personId === PLAYER_ID ? selfName(crewRef.current) : scene.characters.get(personId)!.person.title;
      const robot = automatonLookOf(scene, personId);
      const head = robot === undefined ? chibiHead(lookFor(personId)) : robotHead(robot);
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
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const roomPoint = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) * CANVAS_WIDTH / box.width, y: (event.clientY - box.top) * CANVAS_HEIGHT / box.height };
  };

  // several sessions open are a layout the user built: a stray click must not close them all (each has its cross)
  const leave = () => { if (useSessions.getState().openIds.length <= 1) select(null); };

  const onClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (dropped.current) { dropped.current = false; return; }
    const point = roomPoint(event);
    if (useSessions.getState().preferences.pet.kind !== 'none' && scene.pokePet(point)) return;
    const character = scene.characterAt(point);
    if (room === 'automata' && isOrbAt(point, character?.position)) { useSessions.getState().openAutomata(true); return; }
    if (character?.person.automaton) { useSessions.getState().openAutomata(true, character.person.automaton, character.person.automatonAgent); return; }
    if (character) { show(character.person.sessionId); return; }
    const visitor = scene.visitorAt(point);
    if (visitor) { useSessions.getState().openNewSession({ person: visitor.name }); return; }
    // the dark around the room: like the panel's cross, back to the office without a session open
    if (!isInRoom(point)) { leave(); return; }
    if (floor.isDoorAt(point)) { scene.walkPlayerOut(); return; }
    if (floor.isPortalAt(point)) { scene.walkPlayerToPortal(); return; }
    if (floor.isUserScreenAt(point)) { useSessions.getState().send({ t: 'openTerminal' }); return; }
    if (floor.isBoardAt(point)) { useSessions.getState().openBoard(true); return; }
    if (floor.isMetricsAt(point)) { useSessions.getState().openModsPanel(true); return; }
    const tile = toTile(point);
    const spot = floor.spotAt(tile);
    if (spot) scene.sitPlayerAt(spot);
    else if (floor.isWalkable(tile)) scene.walkPlayerTo(tile);
  };

  const onMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (scene.carried) return;
    const point = roomPoint(event);
    // the orb takes the click over an automaton behind it
    const orb = room === 'automata' && isOrbAt(point, scene.characterAt(point)?.position);
    const person = orb ? null : scene.personAt(point);
    // a session in front of a visitor, the door or the desk takes the click (the user, seated behind their laptop, does not)
    const visitor = orb || (person && person !== PLAYER_ID) ? null : scene.visitorAt(point);
    hoveredId.current = visitor?.id ?? person;
    const thing: HoveredThing = orb ? 'orb' : (person && person !== PLAYER_ID) || visitor ? null
      : floor.isDoorAt(point) ? 'door' : floor.isPortalAt(point) ? 'portal' : floor.isUserScreenAt(point) ? 'screen' : floor.isBoardAt(point) ? 'board' : floor.isMetricsAt(point) ? 'metrics' : null;
    hoveredThing.current = thing;
    const words = t.room.hint;
    const automaton = person && person !== PLAYER_ID ? scene.characters.get(person)?.person : undefined;
    const text = automaton?.automaton ? t.automata.hint(automaton.name) : automaton?.automatonRole ? t.automata.triggerHint(automaton.name) : visitor ? words.startWith(visitor.name)
      : thing === 'portal' ? (room === 'office' ? words.toAutomata : words.portalToOffice)
      : thing === 'door' ? (room === 'office' ? words.toLounge : words.toOffice) : thing === 'screen' ? words.openTerminal : thing === 'board' ? words.openBoard : thing === 'orb' ? words.openAutomata
      : thing === 'metrics' ? (modsNews(useSessions.getState()) ? words.newMods : words.openMods) : null;
    setHintText(text);
    const card = hint.current;
    if (!card || !text) return;
    // right of the pointer, or left of it near the right edge
    // in the stage's own pixels: the room may be zoomed out (useRoomFrame.ts)
    const box = stage.current!.getBoundingClientRect(), scale = box.width / stage.current!.offsetWidth;
    const x = (event.clientX - box.left) / scale, y = (event.clientY - box.top) / scale;
    const left = x + 16 + card.offsetWidth > stage.current!.offsetWidth ? x - 10 - card.offsetWidth : x + 16;
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(y + 10)}px)`;
  };
  const pickUp = (canvasElement: HTMLCanvasElement) => {
    const held = press.current;
    if (!held) return;
    window.clearTimeout(held.timer);
    press.current = null;
    if (!scene.pickUp(held.character)) return;
    canvasElement.setPointerCapture(held.pointer);
    scene.carryTo(held.at);
    hoveredId.current = null;
    setHintText(null);
    setCarrying(true);
  };

  // a long press on someone picks them up (⌥ drags the window instead)
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || event.altKey || scene.carried) return;
    const point = roomPoint(event);
    const character = scene.characterAt(point);
    if (!character) return;
    const element = event.currentTarget;
    press.current = { character, at: point, pointer: event.pointerId, timer: window.setTimeout(() => pickUp(element), HOLD_MS) };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = roomPoint(event);
    if (scene.carried) { scene.carryTo(point); return; }
    const held = press.current;
    if (held && Math.hypot(point.x - held.at.x, point.y - held.at.y) > HOLD_SLOP) { held.at = point; pickUp(event.currentTarget); }
  };

  const onPointerUp = () => {
    if (press.current) { window.clearTimeout(press.current.timer); press.current = null; }
    if (!scene.carried) return;
    dropped.current = true;
    setCarrying(false);
    if (!scene.drop()) return;
    // one person per seat: whoever was kept on a seat someone now sits on loses it
    const bySeat = new Map([...keptSeats.current].map(([id, seat]) => [seat, id]));
    for (const [id, seat] of scene.seats()) bySeat.set(seat, id);
    keptSeats.current = new Map([...bySeat].map(([seat, id]) => [id, seat]));
    writePreference(`seats:${room}`, Object.fromEntries(keptSeats.current));
    setMoves((count) => count + 1);
  };

  // the dark around the canvas, on a wide or tall panel: the same as the dark around the room in it
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && BACKDROP_CLASSES.some((name) => (event.target as Element).classList.contains(name))) leave();
  };
  const onMouseLeave = () => { hoveredThing.current = null; hoveredId.current = null; setHintText(null); };

  const seated = plan.people.length;
  const description = t.room.description[room](seated, plan.waitingAutomata);
  return (
    <div className="cp-room" onClick={onBackdropClick}>
      <div className="cp-room__fit">
        <div className="cp-room__stage" ref={stage} style={PALETTE_VARIABLES} data-carrying={carrying || undefined}>
          <div className="cp-room__zoom" ref={zoom}>
            <canvas
              ref={canvas} className="cp-room__canvas" width={CANVAS_WIDTH * RENDER_SCALE} height={CANVAS_HEIGHT * RENDER_SCALE} onClick={onClick}
              onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              role="img" aria-label={description}
            />
          </div>
          <div ref={hint} className="cp-room__hint-card" hidden={!hintText} aria-hidden="true">{hintText}</div>
          <div className="cp-room__bubbles" aria-hidden="true">
            {bubbles.map((bubble) => <SpeechBubble key={bubble.id} bubble={bubble} layout={layout} onOpen={() => show(bubble.sessionId)} />)}
          </div>
          {hidden.length > 0 && (
            <div className="cp-room__more">
              <button type="button" aria-expanded={showHidden} title={t.room.hidden.more(hidden.length)} onClick={() => setShowHidden((shown) => !shown)}>
                +{hidden.length}
              </button>
              {showHidden && (
                <ul aria-label={t.room.hidden.list}>
                  {hidden.map((session) => <li key={session.id}><button type="button" onClick={() => { show(session.id); setShowHidden(false); }}>{session.name}</button></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      <ArrangeHint />
    </div>
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
