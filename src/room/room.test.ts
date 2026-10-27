import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionInfo, SessionState } from '../../shared/protocol.ts';
import { earlySpeech, speechOf, USER_SPEAKER } from '../state/speech.ts';
import { VISIBLE_ROWS, bubbleText, earlyBubbleText, pruneBubbles, pushBubble, type Bubble } from './bubbles.ts';
import type { SeenSequences } from '../state/queue.ts';
import { planRoom, roleTitle, roomSessions } from './cast.ts';
import { LOUNGE, METRICS_KINDS, METRICS_OBJECT, METRICS_PIECES, OFFICE, ROOM, blockedTiles, isMetricsPiece, type MetricsKind } from '../../shared/room-layout.ts';
import { FESTIVALS, easterSunday, festivalDay, festivalOn } from '../../shared/festivals.ts';
import { outfitFor } from './outfits.ts';
import { Floor } from './floor.ts';
import { distance, isInRoom, tileCenter, toScreen, toTile, type Point } from './geometry.ts';
import { Scene, directionOf, type Character } from './scene.ts';
import { Visits, visitorId } from './visitors.ts';
import { createPet, isSpeaking, petWords, stepPet } from './pet.ts';
import { assignSeats } from './seats.ts';
import { NO_GEAR, parseLook, randomLook } from '../../shared/look.ts';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { lookOfStranger } from './chibi.ts';
import { metricsBadgeAt, showsMetricsBadge } from './metrics.ts';
import { BOARD, DOODLES, LINE_HEIGHT, birthdayLines, boardContent, doodlesWidth, lettersPerLine, textWidth } from './whiteboard.ts';
import { stackLabels } from './labels.ts';

const session = (id: string, state: SessionState, extra: Partial<SessionInfo> = {}): SessionInfo => ({
  id, name: id, cwd: `/work/${id}`, model: '', activeModel: '', permissionMode: 'auto', state, stateSince: 1000, createdAt: 0, turns: 1, permissions: [],
  subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 5, ...extra,
});
const NOBODY = new Map<string, number>();
const close = (a: Point, b: Point) => distance(a, b) < 1e-6;
const OFFICE_FLOOR = new Floor(OFFICE);
const LOUNGE_FLOOR = new Floor(LOUNGE);
const SEAT_COUNT = OFFICE_FLOOR.seatCount;
const DOOR = OFFICE_FLOOR.door;
const BLOCKED = blockedTiles(OFFICE_FLOOR.layout.furniture);
const planOffice = (sessions: readonly SessionInfo[], seen: SeenSequences, previous: ReadonlyMap<string, number>) => planRoom(sessions, seen, previous, SEAT_COUNT);
const officeScene = () => new Scene(OFFICE_FLOOR, { withPet: true });
/** No step lands on furniture (the doorway, outside the grid, is the only point off a tile). */
const offFurniture = (path: readonly Point[]) => path.every((point) => !BLOCKED.has(`${Math.floor(point.x)},${Math.floor(point.y)}`));

describe('isometric grid', () => {
  it('turns tiles into canvas pixels and back', () => {
    for (const tile of [{ x: 0, y: 0 }, { x: 3.5, y: 7.25 }, DOOR]) assert.ok(close(toTile(toScreen(tile)), tile));
  });

  it('lets the player walk on the floor, not on furniture or into the walls', () => {
    assert.equal(OFFICE_FLOOR.isWalkable({ x: 6.5, y: 9.5 }), true);
    assert.equal(OFFICE_FLOOR.isWalkable({ x: 3.5, y: 3.5 }), false, 'a desk');
    assert.equal(OFFICE_FLOOR.isWalkable({ x: 0.1, y: 5 }), false);
    assert.equal(OFFICE_FLOOR.isWalkable({ x: ROOM.width + 1, y: 5 }), false);
    assert.equal(OFFICE_FLOOR.isWalkable({ x: 11.5, y: 0.5 }), false, 'the whiteboard against the wall');
    assert.equal(OFFICE_FLOOR.isWalkable({ x: 3.5, y: 2.5 }), true, 'a chair can be walked to');
  });
});

describe('walking routes', () => {
  it('goes from the door to a chair and back out, tile by tile and never over furniture', () => {
    for (let seat = 0; seat < SEAT_COUNT; seat++) {
      const inward = OFFICE_FLOOR.pathToSeat(DOOR, seat);
      assert.ok(close(inward.at(-1)!, OFFICE_FLOOR.seatPosition(seat)));
      assert.ok(offFurniture(inward));
      const outward = OFFICE_FLOOR.pathToDoor(OFFICE_FLOOR.seatPosition(seat));
      assert.ok(close(outward.at(-1)!, DOOR));
      assert.ok(offFurniture(outward));
    }
  });

  it('walks the player to the centre of a tile, around the desks, without cutting their corners', () => {
    assert.deepEqual(OFFICE_FLOOR.route({ x: 4.5, y: 9.5 }, { x: 5.2, y: 9.9 }), [{ x: 5.5, y: 9.5 }]);
    const around = OFFICE_FLOOR.route({ x: 4.5, y: 2.5 }, { x: 4.5, y: 4.5 });
    assert.ok(offFurniture(around));
    for (let index = 1; index < around.length; index++) {
      const from = around[index - 1];
      const to = around[index];
      if (from.x !== to.x && from.y !== to.y) {
        assert.ok(!BLOCKED.has(`${Math.floor(to.x)},${Math.floor(from.y)}`) && !BLOCKED.has(`${Math.floor(from.x)},${Math.floor(to.y)}`), 'no corner cut');
      }
    }
  });
});

describe('the break room', () => {
  it('sits everyone on a sofa against its back, reachable from the door without crossing furniture', () => {
    const blocked = blockedTiles(LOUNGE_FLOOR.layout.furniture);
    assert.ok(LOUNGE_FLOOR.seatCount >= 20);
    for (let seat = 0; seat < LOUNGE_FLOOR.seatCount; seat++) {
      const inward = LOUNGE_FLOOR.pathToSeat(LOUNGE_FLOOR.door, seat);
      assert.ok(close(inward.at(-1)!, LOUNGE_FLOOR.seatPosition(seat)));
      assert.ok(inward.every((point) => !blocked.has(`${Math.floor(point.x)},${Math.floor(point.y)}`)));
      assert.ok(LOUNGE_FLOOR.seatLift(seat) > 0, 'on cushions');
    }
  });

  it('lets the user sit on any sofa, and keeps their seat free of sessions', () => {
    assert.equal(LOUNGE_FLOOR.layout.playerSpots.length, LOUNGE_FLOOR.seatCount);
    const scene = new Scene(LOUNGE_FLOOR, { withPet: false });
    const first = LOUNGE_FLOOR.layout.seats[0];
    scene.sitPlayerAt(LOUNGE_FLOOR.spotAt({ x: first.x + 0.5, y: first.y + 0.5 })!);
    assert.deepEqual([...scene.playerSeats()], [0]);
    const plan = planRoom([session('a', 'closed', { resting: true })], {}, NOBODY, LOUNGE_FLOOR.seatCount, 'lounge', scene.playerSeats());
    assert.equal(plan.seats.get('a'), 1);
  });

  it('holds the resting and closed sessions; the office holds the others', () => {
    const sessions = [session('rests', 'closed', { resting: true }), session('gone', 'closed'), session('idle', 'wait', { turns: 0 }), session('broken', 'error', { lastSeq: 9 })];
    assert.deepEqual(roomSessions(sessions, {}, 'lounge').flat().map(({ id }) => id), ['rests', 'gone']);
    assert.deepEqual(roomSessions(sessions, {}, 'office').flat().map(({ id }) => id), ['broken', 'idle'], 'an unseen error waits for the user at work');
    assert.deepEqual(roomSessions(sessions, { broken: 9 }, 'lounge').flat().map(({ id }) => id), ['rests', 'gone', 'broken']);
  });

  it('puts carved pumpkins in both rooms for Halloween only', () => {
    const pumpkins = (floor: Floor) => floor.layout.furniture.filter((piece) => piece.kind === 'pumpkin').length;
    assert.equal(pumpkins(OFFICE_FLOOR), 0);
    assert.ok(pumpkins(new Floor(OFFICE, 'halloween')) > 0);
    assert.ok(pumpkins(new Floor(LOUNGE, 'halloween')) > 0);
  });
});

describe('festivals', () => {
  it('knows the day of each one, the one-day ones first', () => {
    const on = (month: number, day: number, year = 2026) => festivalOn(new Date(year, month - 1, day));
    assert.equal(festivalOn(new Date(2026, 9, 20), ['10-20']), 'birthday', 'a birthday of the crew, over Halloween');
    assert.equal(on(10, 20), 'halloween', 'nobody born that day');
    assert.equal(on(10, 19), 'halloween');
    assert.equal(on(11, 3), null);
    assert.equal(on(12, 24), 'christmas');
    assert.equal(on(12, 31), 'newYear');
    assert.equal(on(1, 2, 2027), 'newYear');
    assert.equal(on(1, 6), 'epiphany');
    assert.equal(on(2, 2), 'candlemas');
    assert.equal(on(2, 17), 'chineseNewYear');
    assert.equal(on(2, 14, 2029), 'valentine', 'over the Chinese New Year of 2029');
    assert.equal(on(4, 14), 'songkran');
    assert.deepEqual(easterSunday(2026), [4, 5]);
    assert.deepEqual(easterSunday(2027), [3, 28]);
    assert.equal(on(4, 6), 'easter');
    assert.equal(on(5, 1), 'mayDay');
    assert.equal(on(6, 21), 'music');
    assert.equal(on(7, 14), 'bastille');
    assert.equal(on(8, 15), 'summer');
    assert.equal(on(6, 10), null);
  });

  it('dresses people for the day: crowns for the guests only, a water gun for the user only', () => {
    assert.equal(outfitFor('epiphany', 'Lina', false, ['Max', 'Lina']).hat, 'crown');
    assert.equal(outfitFor('epiphany', 'Tom', false, ['Max', 'Lina']).hat, undefined);
    assert.equal(outfitFor('birthday', 'Max', true, ['Max']).hat, 'crown');
    assert.equal(outfitFor('birthday', 'Tom', false, ['Max']).hat, 'party');
    assert.equal(outfitFor('christmas', 'Tom', false).hat, 'santa');
    assert.deepEqual(outfitFor('songkran', 'Max', true), { swimwear: true, sunglasses: true, waterGun: true });
    assert.equal(outfitFor('songkran', 'Tom', false).waterGun, undefined);
    assert.deepEqual(outfitFor(null, 'Tom', false), {});
  });

  it('says who a day is for: the crew born that day, the user and one drawn for the year at Epiphany', () => {
    const crew = [{ name: 'Max', self: true, birthday: '03-12' }, { name: 'Lina', birthday: '10-20' }, { name: 'Tom' }];
    assert.deepEqual(festivalDay(new Date(2026, 9, 20), crew), { festival: 'birthday', guests: ['Lina'] });
    assert.deepEqual(festivalDay(new Date(2026, 5, 10), crew, 'birthday'), { festival: 'birthday', guests: ['Max'] }, 'previewed: the user');
    const epiphany = festivalDay(new Date(2027, 0, 6), crew);
    assert.equal(epiphany.guests[0], 'Max');
    assert.ok(['Lina', 'Tom'].includes(epiphany.guests[1]));
    assert.deepEqual(festivalDay(new Date(2026, 5, 10), []), { festival: null, guests: [] });
  });

  it('dresses both rooms without blocking a seat, a spot of the user or the way to them', () => {
    for (const festival of FESTIVALS) {
      for (const layout of [OFFICE, LOUNGE]) {
        const floor = new Floor(layout, festival);
        const blocked = blockedTiles(floor.layout.furniture);
        const where = `${festival} in the ${layout === OFFICE ? 'office' : 'break room'}`;
        for (const piece of floor.layout.furniture) assert.ok(piece.x >= 0 && piece.y >= 0 && piece.x + piece.width <= ROOM.width && piece.y + piece.depth <= ROOM.depth, `${piece.kind} inside, ${where}`);
        const before = blockedTiles(layout.furniture);
        const added = blockedTiles(floor.layout.furniture.slice(layout.furniture.length));
        for (const tile of added) assert.ok(!before.has(tile), `nothing under the ${festival} pieces at ${tile}, ${where}`);
        for (const seat of layout.seats) assert.ok(!added.has(`${seat.x},${seat.y}`), `seat ${seat.x},${seat.y} free, ${where}`);
        for (let seat = 0; seat < floor.seatCount; seat++) {
          const path = floor.pathToSeat(floor.door, seat);
          assert.ok(close(path.at(-1)!, floor.seatPosition(seat)), `seat ${seat} reachable, ${where}`);
          assert.ok(path.every((point) => !blocked.has(`${Math.floor(point.x)},${Math.floor(point.y)}`)), `seat ${seat}, ${where}`);
        }
        for (const spot of floor.layout.playerSpots) assert.ok(!added.has(`${Math.floor(spot.at.x)},${Math.floor(spot.at.y)}`), `the user's spot free, ${where}`);
      }
    }
  });
});

describe('seats', () => {
  it('keeps people in their chair and gives newcomers the first free seats', () => {
    const seats = assignSeats([{ id: 'a' }, { id: 'b' }, { id: 'c' }], new Map([['a', 0]]), 12);
    assert.equal(seats.get('a'), 0);
    assert.deepEqual([seats.get('b'), seats.get('c')], [1, 2]);
  });

  it('never gives more seats than the room has, nor the same seat twice', () => {
    const seats = assignSeats(Array.from({ length: SEAT_COUNT + 2 }, (_, index) => ({ id: `s${index}` })), NOBODY, SEAT_COUNT);
    assert.equal(seats.size, SEAT_COUNT);
    assert.equal(new Set(seats.values()).size, SEAT_COUNT);
    assert.equal(seats.has(`s${SEAT_COUNT}`), false);
  });
});

describe('who is in the room', () => {
  it('names the role of a kit command, and nothing else', () => {
    assert.equal(roleTitle('kit:screenshots'), 'Screenshots');
    assert.equal(roleTitle('kit:aso'), 'ASO');
    assert.equal(roleTitle('superpowers:brainstorming'), 'Brainstorming', 'any plugin');
    assert.equal(roleTitle('compact'), null);
    assert.equal(roleTitle(''), null);
  });

  it('seats the sessions waiting for the user first, then the working ones; closed ones are not there', () => {
    const idle = Array.from({ length: SEAT_COUNT + 1 }, (_, index) => session(`idle${index}`, 'wait', { turns: 0 }));
    const sessions = [...idle, session('busy', 'work'), session('asks', 'perm', { permissions: [{ requestId: 'r', who: 'chef', tool: 'Bash', detail: 'ls', canAlways: false }] }), session('gone', 'closed')];
    const plan = planOffice(sessions, {}, NOBODY);
    const ids = plan.people.map((person) => person.id);
    assert.equal(ids.length, SEAT_COUNT);
    assert.deepEqual(ids.slice(0, 2), ['asks', 'busy']);
    assert.equal(ids.includes('gone'), false);
    assert.equal(plan.hiddenSessions, sessions.length - 1 - SEAT_COUNT, 'all but the closed one want a seat');
    assert.equal(plan.people[0].status, 'permission');
    assert.equal(plan.people[1].status, 'working');
  });

  it('keeps seated idle sessions over newcomers of the same group (no musical chairs)', () => {
    const last = SEAT_COUNT + 2;
    const sessions = Array.from({ length: last + 1 }, (_, index) => session(`s${index}`, 'wait', { turns: 0, createdAt: index }));
    const plan = planOffice(sessions, {}, new Map([[`s${last}`, 3]]));
    assert.equal(plan.seats.get(`s${last}`), 3);
    assert.equal(plan.seats.has(`s${last - 1}`), false);
  });

  it('keeps sub-agents with their session instead of giving them a chair', () => {
    const sessions = [session('a', 'work', { command: 'kit:design', subagents: [{ id: 't1', name: 'Bob', type: 'Explore' }, { id: 't2', name: 'Eve', type: '' }] })];
    const plan = planOffice(sessions, {}, NOBODY);
    assert.equal(plan.people.length, 1);
    assert.equal(plan.people[0].title, 'Design');
    assert.deepEqual(plan.people[0].agents, [{ id: 't1', name: 'Bob', type: 'Explore' }, { id: 't2', name: 'Eve', type: 'Sous-agent' }]);
  });

  it('shows a finished turn until it is seen', () => {
    const finished = session('a', 'wait', { lastSeq: 9 });
    assert.equal(planOffice([finished], {}, NOBODY).people[0].status, 'finished');
    assert.equal(planOffice([finished], { a: 9 }, NOBODY).people[0].status, null);
  });
});

describe('scene', () => {
  const walkFor = (scene: Scene, ms: number) => { for (let elapsed = 0; elapsed < ms; elapsed += 66) scene.step(66); };

  it('seats the people already there at once, and newcomers walk in from the door', () => {
    const scene = officeScene();
    scene.sync(planOffice([session('a', 'wait')], {}, scene.seats()), true);
    assert.equal(scene.characters.get('a')!.phase, 'seated');
    scene.sync(planOffice([session('a', 'wait'), session('b', 'work')], {}, scene.seats()), false);
    const newcomer = scene.characters.get('b')!;
    assert.equal(newcomer.phase, 'entering');
    assert.ok(close(newcomer.position, DOOR));
    walkFor(scene, 15_000);
    assert.equal(newcomer.phase, 'seated');
    assert.ok(close(newcomer.position, OFFICE_FLOOR.seatPosition(newcomer.seat)));
  });

  it('walks out whoever left the plan, then forgets them; someone called back turns around', () => {
    const scene = officeScene();
    scene.sync(planOffice([session('a', 'wait'), session('b', 'wait')], {}, scene.seats()), true);
    scene.sync(planOffice([session('a', 'wait')], {}, scene.seats()), false);
    assert.equal(scene.characters.get('b')!.phase, 'leaving');
    assert.equal(scene.seats().has('b'), false);
    scene.step(300);
    scene.sync(planOffice([session('a', 'wait'), session('b', 'wait')], {}, scene.seats()), false);
    assert.equal(scene.characters.get('b')!.phase, 'entering');
    scene.sync(planOffice([session('a', 'wait')], {}, scene.seats()), false);
    walkFor(scene, 15_000);
    assert.equal(scene.characters.has('b'), false);
  });

  it('lets the user carry someone to a free seat or swap seats, and back to theirs when let go elsewhere', () => {
    const scene = officeScene();
    scene.sync(planOffice([session('a', 'wait'), session('b', 'wait')], {}, scene.seats()), true);
    const a = scene.characters.get('a')!, b = scene.characters.get('b')!;
    const before = a.seat;
    assert.ok(scene.pickUp(a));
    assert.ok(scene.freeSeats().includes(before));
    assert.ok(!scene.freeSeats().includes(b.seat));
    const free = scene.freeSeats().find((seat) => seat !== before)!;
    const target = scene.seatScreenPosition(free);
    scene.carryTo({ x: target.x, y: target.y - 22 });
    assert.equal(scene.dropSeat(), free);
    assert.equal(scene.drop(), true);
    assert.equal(a.phase, 'seated');
    assert.equal(a.seat, free);
    assert.ok(close(a.position, OFFICE_FLOOR.seatPosition(free)));
    // the plan made from the scene keeps the new seat: no walking back
    scene.sync(planOffice([session('a', 'wait'), session('b', 'wait')], {}, scene.seats()), false);
    assert.equal(a.phase, 'seated');
    // onto someone else's seat: they swap, the other one walking over
    const theirs = b.seat;
    scene.pickUp(a);
    const taken = scene.seatScreenPosition(theirs);
    scene.carryTo({ x: taken.x, y: taken.y - 22 });
    assert.equal(scene.drop(), true);
    assert.equal(a.seat, theirs);
    assert.equal(b.seat, free);
    assert.equal(b.phase, 'entering');
    walkFor(scene, 15_000);
    assert.equal(b.phase, 'seated');
    // let go away from any seat: back to their own
    scene.pickUp(a);
    scene.carryTo({ x: 5, y: 5 });
    assert.equal(scene.drop(), false);
    assert.equal(a.seat, theirs);
  });

  it('lets go of someone carried whose session left', () => {
    const scene = officeScene();
    scene.sync(planOffice([session('a', 'wait')], {}, scene.seats()), true);
    scene.pickUp(scene.characters.get('a')!);
    scene.sync(planOffice([], {}, scene.seats()), false);
    assert.equal(scene.carried, null);
    assert.equal(scene.characters.get('a')!.phase, 'leaving');
  });

  it('finds who is under a click', () => {
    const scene = officeScene();
    scene.sync(planOffice([session('a', 'wait')], {}, scene.seats()), true);
    const feet = toScreen(scene.characters.get('a')!.position);
    assert.equal(scene.characterAt({ x: feet.x, y: feet.y - 20 })?.person.id, 'a');
    assert.equal(scene.characterAt({ x: feet.x + 40, y: feet.y - 20 }), null);
  });

  it('seats the player at the boss desk, lets them walk off, and sits them where they click a seat', () => {
    const scene = officeScene();
    assert.equal(scene.playerSpot?.atDesk, true);
    scene.walkPlayerTo({ x: 6.5, y: 9.5 });
    assert.equal(scene.playerSpot, null);
    walkFor(scene, 10_000);
    const sofa = OFFICE_FLOOR.spotAt({ x: 0.5, y: 13.5 })!;
    assert.equal(sofa.atDesk, false);
    scene.sitPlayerAt(sofa);
    walkFor(scene, 10_000);
    assert.equal(scene.playerSpot, sofa);
    assert.deepEqual(scene.player.position, { x: 0.62, y: 13.5 });
    scene.sitPlayerAt(OFFICE_FLOOR.spotAt({ x: 9.5, y: 6.5 })!);
    walkFor(scene, 10_000);
    assert.deepEqual(scene.player.position, { x: 9.5, y: 5.5 });
  });

  it('lets the pet wander on free tiles, rest, and speak in its own way when poked', () => {
    const pet = createPet();
    let seed = 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let elapsed = 0; elapsed < 120_000; elapsed += 66) {
      stepPet(pet, 66, OFFICE_FLOOR, random);
      assert.ok(OFFICE_FLOOR.isWalkable(pet.position), 'never on furniture');
    }
    assert.match(petWords(pet, 'cat'), /Miaou|Mrr|Mraou/);
    assert.match(petWords(pet, 'dog'), /Ouaf|Wouf/);
    assert.match(petWords(pet, 'rocky'), /♫/, 'Rocky speaks in chords');
    assert.match(petWords(pet, 'duck'), /Coin|bug/);
    assert.match(petWords(pet, 'owl'), /Hou/);
    const scene = officeScene();
    const paws = toScreen(scene.pet!.position);
    assert.equal(scene.pokePet({ x: paws.x, y: paws.y - 10 }), true);
    assert.equal(isSpeaking(scene.pet!), true);
    assert.equal(scene.pokePet({ x: paws.x + 60, y: paws.y }), false);
  });

  it('gives a click to whoever stands in front: a session before the pet behind it, up to the top of their hat', () => {
    const scene = officeScene();
    const pet = scene.pet!;
    const position = { x: pet.position.x + 0.5, y: pet.position.y + 0.5 };
    const person = { id: 'front', sessionId: 'front' } as Character['person'];
    scene.characters.set('front', { person, seat: 0, phase: 'entering', position, heading: { x: 1, y: 0 }, path: [], blinkOffset: 0 });
    const paws = toScreen(pet.position);
    assert.equal(scene.pokePet({ x: paws.x, y: paws.y - 10 }), false, 'the session in front takes it');
    const feet = toScreen(position);
    const hat = { x: feet.x, y: feet.y - 64 };
    assert.equal(scene.characterAt(hat), null, 'above the head');
    scene.heightOf = () => 70;
    assert.equal(scene.characterAt(hat)?.person.id, 'front', 'on the party hat');
  });

  it('walks the user out through the door when it is clicked, and brings them in through it in the other room', () => {
    const door = OFFICE_FLOOR.layout.door;
    const base = toScreen({ x: 0, y: door.y + 0.6 });
    assert.equal(OFFICE_FLOOR.isDoorAt({ x: base.x, y: base.y - 30 }), true);
    assert.equal(OFFICE_FLOOR.isDoorAt({ x: base.x, y: base.y - 200 }), false, 'the wall above it');
    assert.equal(OFFICE_FLOOR.isDoorAt(toScreen({ x: 0, y: door.y + 4 })), false, 'further along the wall');
    const scene = officeScene();
    scene.walkPlayerOut();
    walkFor(scene, 15_000);
    assert.equal(scene.playerWentOut, true);
    assert.ok(close(scene.player.position, OFFICE_FLOOR.door));
    const arriving = new Scene(LOUNGE_FLOOR, { withPet: false, atDoor: true });
    assert.equal(arriving.playerSpot, null);
    walkFor(arriving, 3_000);
    assert.ok(close(arriving.player.position, LOUNGE_FLOOR.inside));
    assert.equal(arriving.playerWentOut, false);
  });

  it('finds the user’s laptop under the pointer, on their desk in the office only', () => {
    const laptop = OFFICE_FLOOR.userScreen!;
    const at = (x: number, y: number, height: number) => { const base = toScreen({ x, y }); return { x: base.x, y: base.y - height }; };
    const middleX = (laptop.fromX + laptop.toX) / 2;
    assert.equal(OFFICE_FLOOR.isUserScreenAt(at(middleX, laptop.toY, (laptop.low + laptop.high) / 2)), true, 'the lid');
    assert.equal(OFFICE_FLOOR.isUserScreenAt(at(middleX, (laptop.fromY + laptop.toY) / 2, laptop.low)), true, 'the keyboard');
    assert.equal(OFFICE_FLOOR.isUserScreenAt(at(middleX, laptop.toY, 2)), false, 'the desk under it');
    assert.equal(OFFICE_FLOOR.isUserScreenAt(at(laptop.fromX - 1, laptop.toY, laptop.low)), false, 'the rest of the desk');
    assert.equal(LOUNGE_FLOOR.userScreen, null);
  });

  it('has no cat in the break room', () => {
    const scene = new Scene(LOUNGE_FLOOR, { withPet: false });
    assert.equal(scene.pet, null);
    assert.equal(scene.pokePet({ x: 100, y: 300 }), false);
  });

  it('faces the four screen diagonals', () => {
    assert.equal(directionOf({ x: 1, y: 0 }), 'down-right');
    assert.equal(directionOf({ x: 0, y: 1 }), 'down-left');
    assert.equal(directionOf({ x: 0, y: -1 }), 'up-right');
    assert.equal(directionOf({ x: -1, y: 0 }), 'up-left');
  });
});

describe('speech bubbles', () => {
  const bubble = (id: number, bornAt: number) => ({ id, sessionId: 's', label: 'Iris', text: 'Salut', x: 100, fromUser: false, head: '', bornAt });

  it('keeps the first sentence of a message, without markdown, shortened', () => {
    assert.equal(bubbleText('**Fait.** Les tests passent.'), 'Fait.');
    assert.equal(bubbleText('Voici le plan :\n\n1. un\n2. deux'), 'Voici le plan :');
    assert.equal(bubbleText('`npm test` est vert'), 'npm test est vert');
    assert.equal(bubbleText('a'.repeat(200)).length, 150);
    assert.equal(bubbleText('```\ncode\n```'), '');
  });

  it('gives the bubble of a message being written once its first sentence is over, the same as the whole message', () => {
    assert.equal(earlyBubbleText('Je regarde le code'), null);
    assert.equal(earlyBubbleText('Je regarde le code.'), null, 'the sentence may go on (1.5, …)');
    assert.equal(earlyBubbleText('Je regarde le code. Puis'), 'Je regarde le code.');
    assert.equal(earlyBubbleText('Voici le plan :\n\n1.'), bubbleText('Voici le plan :\n\n1. un'));
    assert.equal(earlyBubbleText('a'.repeat(151)), bubbleText('a'.repeat(400)), 'too long: cut as the whole one will be');
    assert.equal(earlyBubbleText('```\ncode\n```\n\n'), null, 'nothing to say in a bubble');
  });

  it('makes one bubble per message: early from its draft, then none from the whole message', () => {
    assert.equal(earlySpeech('e', 'chef', 'Je regarde'), null);
    assert.deepEqual(earlySpeech('e', 'chef', 'Je regarde. Le'), { sessionId: 'e', speaker: 'chef', text: 'Je regarde.' });
    assert.equal(earlySpeech('e', 'chef', 'Je regarde. Le code'), null, 'already said');
    assert.equal(speechOf('e', { k: 'state', state: 'work' }), null);
    assert.equal(speechOf('e', { k: 'say', who: 'chef', text: 'Je regarde. Le code est propre.' }), null);
    assert.equal(speechOf('e', { k: 'say', who: 'chef', text: 'Fini.' })?.text, 'Fini.', 'the next message has its own bubble');
    assert.equal(earlySpeech('e', 'toolu_1', 'Je liste. Puis'), null, 'never for a sub-agent');
  });

  it('pushes older bubbles up, fades those pushed past the top, then drops them', () => {
    let stack: readonly Bubble[] = [];
    for (let id = 1; id <= VISIBLE_ROWS + 1; id++) stack = pushBubble(stack, bubble(id, 1000));
    assert.deepEqual(stack.map((item) => item.row), Array.from({ length: VISIBLE_ROWS + 1 }, (_, index) => VISIBLE_ROWS - index));
    assert.deepEqual(stack.map((item) => item.fadingSince !== null), [true, ...Array(VISIBLE_ROWS).fill(false)]);
    stack = pruneBubbles(stack, 1700);
    assert.equal(stack.length, VISIBLE_ROWS);
    assert.equal(pruneBubbles(stack, 1800), stack);
    stack = pruneBubbles(stack, 10_000);
    assert.ok(stack.every((item) => item.fadingSince === 10_000));
    assert.equal(pruneBubbles(stack, 10_700).length, 0);
  });

  it('hears what the assistant says and what the user sends, not tool calls', () => {
    assert.deepEqual(speechOf('s', { k: 'say', who: 'chef', text: 'Bonjour' }), { sessionId: 's', speaker: 'chef', text: 'Bonjour' });
    assert.equal(speechOf('s', { k: 'start', text: '/kit:new' })?.speaker, USER_SPEAKER);
    assert.equal(speechOf('s', { k: 'say', who: 'toolu_1', text: 'Je regarde' }), null, 'a sub-agent speaks in its tab only');
    assert.equal(speechOf('s', { k: 'act', who: 'chef', id: 'c', tool: 'Read', detail: '/a' }), null);
  });
});

describe('light of the day', () => {
  it('is neutral at midday with the sun in, dark and starry at night, warm at dusk', async () => {
    const { lightingAt } = await import('./lighting.ts');
    const noon = lightingAt(13);
    assert.deepEqual(noon.tint, [255, 255, 255]);
    assert.ok(noon.beam > 0.9 && noon.stars === 0);
    const night = lightingAt(2);
    assert.ok(night.stars === 1 && night.glow === 1);
    assert.ok(night.tint[2] > night.tint[0], 'blue at night');
    const dusk = lightingAt(19.5);
    assert.ok(dusk.tint[0] > dusk.tint[2], 'warm at dusk');
    assert.ok(lightingAt(18).reach > noon.reach, 'a low sun throws the light further');
    assert.ok(lightingAt(9).slant < 0 && lightingAt(17).slant > 0, 'morning and evening light come from opposite sides');
  });
});

describe('looks', () => {
  const look = { ...lookOfStranger('someone') };

  it('gives a stranger the same look every time', () => {
    assert.deepEqual(lookOfStranger('session-a'), lookOfStranger('session-a'));
    assert.ok(parseLook(lookOfStranger('session-b')), 'a look the server would accept');
  });

  it('accepts only a complete look with known traits and #rrggbb colours', () => {
    assert.deepEqual(parseLook(look), look);
    assert.equal(parseLook({ ...look, hair: 'beehive' }), null);
    const { sunglasses: _sun, headphones: _phones, hat: _hat, hatColor: _hatColor, eyes: _eyes, eyeGear: _eyeGear, faceGear: _faceGear, neckGear: _neckGear,
      shoulderGear: _shoulderGear, backGear: _backGear, waistGear: _waistGear, handGear: _handGear, backColor: _backColor, ...older } = look;
    assert.deepEqual(parseLook(older), { ...look, eyes: 'round', sunglasses: false, headphones: false, hat: 'none', hatColor: DEFAULT_LOOK.hatColor, ...NO_GEAR, backColor: DEFAULT_LOOK.backColor }, 'a look saved before them keeps everything else');
    assert.equal(parseLook({ ...older, accessory: 'parrot' })?.shoulderGear, 'parrot', 'the single accessory of an older look goes where it is worn now');
    assert.deepEqual(parseLook({ ...older, accessory: 'none' }), parseLook(older));
    const anime = { ...look, top: 'narutoJacket', bottom: 'luffyShorts', shoes: 'zoroBoots', hat: 'strawHat', faceGear: 'mask', waistGear: 'swords' } as const;
    assert.deepEqual(parseLook(anime), anime, 'anime pieces mix like any other');
    assert.equal(parseLook({ ...look, backGear: 'cape' }), null);
    assert.equal(parseLook({ ...look, backGear: 'parrot' }), null, 'each accessory only in its own place');
    const dressedUp = { ...look, hair: 'dreadlocks', eyes: 'starry', top: 'kimono', bottom: 'hakama', shoes: 'geta', hat: 'hachimaki', waistGear: 'katana', backGear: 'shell', shoulderGear: 'parrot' } as const;
    assert.deepEqual(parseLook(dressedUp), dressedUp, 'the dress-up wardrobe mixes like any other');
    assert.equal(parseLook({ ...look, eyes: 'narrow' })?.eyes, 'round', 'eyes no longer offered: round ones, the rest kept');
    assert.equal(parseLook({ ...look, hat: 'sombrero' }), null);
    assert.equal(parseLook({ ...look, topColor: 'red' }), null);
    assert.equal(parseLook({ ...look, glasses: '#121419' })?.glasses, '#121419');
    const { watch: _watch, ...missing } = look;
    assert.equal(parseLook(missing), null);
  });
});

describe('random looks', () => {
  it('draws only valid looks, with variety in every trait', () => {
    const seen = new Map<string, Set<unknown>>();
    for (let draw = 0; draw < 200; draw++) {
      const look = randomLook();
      assert.deepEqual(parseLook(look), look, 'a look the server would accept');
      for (const [trait, value] of Object.entries(look)) seen.set(trait, (seen.get(trait) ?? new Set()).add(value));
    }
    for (const [trait, values] of seen) assert.ok(values.size >= 2, `${trait} varies`);
    assert.ok(seen.get('hat')?.has('none') && seen.get('backGear')?.has('none') && seen.get('beard')?.has('none'), 'optional pieces sometimes stay empty');
  });

  it('is decided by the random source alone', () => {
    assert.deepEqual(randomLook(() => 0), randomLook(() => 0));
    assert.deepEqual(parseLook(randomLook(() => 0.999999)), randomLook(() => 0.999999));
  });
});

describe('aisles', () => {
  it('reaches every seat from the door without walking over another chair or sofa, festivals included', () => {
    for (const [layout, name] of [[OFFICE, 'office'], [LOUNGE, 'lounge']] as const) {
      for (const festival of [null, ...FESTIVALS]) {
        const floor = new Floor(layout, festival);
        const seatTiles = new Set(floor.layout.furniture.filter((piece) => !piece.blocks && piece.top === undefined)
          .flatMap((piece) => { const tiles: string[] = []; for (let x = Math.floor(piece.x); x < Math.ceil(piece.x + piece.width); x++) for (let y = Math.floor(piece.y); y < Math.ceil(piece.y + piece.depth); y++) tiles.push(`${x},${y}`); return tiles; }));
        floor.layout.seats.forEach((seat, index) => {
          const path = floor.pathToSeat(floor.door, index);
          const goal = `${seat.x},${seat.y}`;
          const crossed = path.map((point) => `${Math.floor(point.x)},${Math.floor(point.y)}`).filter((tile) => tile !== goal && seatTiles.has(tile));
          assert.deepEqual(crossed, [], `${name} ${festival} seat ${goal}`);
          const end = path.at(-1)!;
          assert.equal(`${Math.floor(end.x)},${Math.floor(end.y)}`, goal, `${name} ${festival} seat ${goal} reached`);
        });
      }
    }
  });
});

describe('office life', () => {
  /** A visit stepped until it is over: `ms` at a time, with everyone free and the morning's rhythm. */
  const stepVisits = (visits: Visits, ms: number, options: Partial<Parameters<Visits['step']>[1]> = {}) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) visits.step(100, { free: ['Ana', 'Bo', 'Cy'], hour: 9, enabled: true, blocked: null, ...options });
  };

  it('has its places to drop by on free tiles the door leads to, festivals included', () => {
    for (const festival of [null, ...FESTIVALS]) {
      const floor = new Floor(OFFICE, festival);
      for (const spot of floor.layout.visitSpots ?? []) {
        const tile = { x: Math.floor(spot.at.x), y: Math.floor(spot.at.y) };
        assert.ok(spot.lift !== undefined || floor.isFreeTile(tile.x, tile.y), `${festival} ${spot.activity} at ${tile.x},${tile.y}`);
        const path = floor.route(floor.door, spot.at);
        assert.ok(close(tileCenter(path.at(-1)!), tileCenter(spot.at)), `${festival} ${spot.activity} reachable`);
      }
    }
    assert.ok(new Floor(OFFICE, 'birthday').layout.visitSpots!.some((spot) => spot.activity === 'party'));
    assert.equal(LOUNGE_FLOOR.layout.visitSpots, undefined);
  });

  it('brings two people for a coffee, one behind the other, side by side and turned to each other, then lets them go', () => {
    const visits = new Visits(OFFICE_FLOOR, () => 0);
    assert.equal(visits.start('coffee', ['Ana', 'Bo'], { together: true }).length, 2);
    // they never walk on each other: coming in, standing there, going out
    let closest = Infinity;
    for (let elapsed = 0; elapsed < 60_000 && visits.visitors.size; elapsed += 100) {
      visits.step(100, { free: ['Ana', 'Bo'], hour: 3, enabled: true, blocked: null });
      const inside = [...visits.visitors.values()].filter((visitor) => visitor.outside <= 0 && distance(visitor.position, OFFICE_FLOOR.door) > 1);
      if (inside.length === 2) closest = Math.min(closest, distance(inside[0].position, inside[1].position));
      if (elapsed === 15_000) {
        const [left, right] = [...visits.visitors.values()].sort((a, b) => a.position.x - b.position.x);
        assert.deepEqual([left.phase, right.phase], ['staying', 'staying']);
        assert.deepEqual([directionOf(left.heading), directionOf(right.heading)], ['down-right', 'down-left'], 'turned to each other, both faces showing');
      }
    }
    assert.ok(closest >= 1.2, `${closest} tiles apart at the closest`);
    assert.equal(visits.visitors.size, 0, 'gone through the door');
  });

  it('never has more than two visitors, and sends away one who got a session, or everyone when it is off', () => {
    const visits = new Visits(OFFICE_FLOOR, () => 0);
    visits.start('water', ['Ana']);
    visits.start('window', ['Bo']);
    assert.deepEqual(visits.start('books', ['Cy']), []);
    stepVisits(visits, 200, { free: ['Bo', 'Cy'], hour: 3 });
    assert.notEqual(visits.visitors.get(visitorId('Ana'))?.phase ?? 'gone', 'coming', 'on her way out (or already gone, from the door)');
    assert.equal(visits.visitors.get(visitorId('Bo'))?.phase, 'coming');
    stepVisits(visits, 200, { enabled: false });
    assert.ok([...visits.visitors.values()].every((visitor) => visitor.phase === 'leaving'));
  });

  it('keeps the sofa the user sits on for them', () => {
    const visits = new Visits(OFFICE_FLOOR, () => 0);
    const [first, second] = OFFICE_FLOOR.layout.visitSpots!.filter((spot) => spot.activity === 'sofa');
    visits.start('sofa', ['Ana'], { blocked: first.at });
    assert.equal(visits.visitors.get(visitorId('Ana'))?.spot, second);
  });

  it('comes now and then in the morning, rarely in the evening, never at night', () => {
    /** How many people came in during an hour. */
    const visitsIn = (hour: number) => {
      const visits = new Visits(OFFICE_FLOOR, () => 0.5);
      const seen = new Set<object>();
      for (let elapsed = 0; elapsed < 60 * 60_000; elapsed += 100) {
        visits.step(100, { free: ['Ana', 'Bo', 'Cy'], hour, enabled: true, blocked: null });
        for (const visitor of visits.visitors.values()) seen.add(visitor);
      }
      return seen.size;
    };
    const morning = visitsIn(9), evening = visitsIn(20);
    assert.ok(morning >= 15 && morning <= 30, `${morning} in a morning hour`);
    assert.ok(evening >= 3 && evening <= 6, `${evening} in an evening hour`);
    assert.equal(visitsIn(2), 0);
  });
});

describe('the room on screen', () => {
  it('tells the room (floor, walls, their top) from the dark around it', () => {
    assert.ok(isInRoom(toScreen({ x: ROOM.width / 2, y: ROOM.depth / 2 })), 'the middle of the floor');
    assert.ok(isInRoom({ x: toScreen({ x: 0, y: 0 }).x, y: toScreen({ x: 0, y: 0 }).y - 90 }), 'high on the back corner');
    assert.ok(!isInRoom({ x: 5, y: 470 }), 'the bottom left corner of the canvas');
    assert.ok(!isInRoom({ x: 635, y: 10 }), 'the top right corner');
    const front = toScreen({ x: ROOM.width, y: ROOM.depth });
    assert.ok(!isInRoom({ x: front.x, y: front.y + 6 }), 'just under the front corner of the floor');
  });
});

describe('the whiteboard', () => {
  it('stands in the office only, and the pointer finds it', () => {
    const board = OFFICE_FLOOR.board!;
    // the middle of the board, not a point on its outline, where rounding decides
    const foot = toScreen({ x: (board.fromX + board.toX) / 2, y: (board.fromY + board.toY) / 2 });
    assert.ok(OFFICE_FLOOR.isBoardAt({ x: foot.x, y: foot.y - board.high / 2 }));
    assert.equal(OFFICE_FLOOR.isBoardAt(toScreen({ x: 5, y: 9 })), false);
    assert.equal(LOUNGE_FLOOR.board, null);
    assert.ok(!OFFICE.furniture.some((piece) => piece.kind === ('printer' as string) || piece.kind === ('server' as string)), 'no printer nor server rack any more');
    for (const spot of OFFICE.visitSpots!.filter((spot) => spot.activity === 'window')) assert.ok(spot.at.x < board.fromX - 1 || spot.at.x > board.toX + 1, `the window at ${spot.at.x} is away from the whiteboard`);
    const cooler = OFFICE.furniture.find((piece) => piece.kind === 'cooler')!;
    const water = OFFICE.visitSpots!.find((spot) => spot.activity === 'water')!;
    assert.ok(distance(water.at, { x: cooler.x + 0.5, y: cooler.y + 0.5 }) < 1.5, 'a glass of water at the cooler, by the coffee machine');
  });

  it('shows notes on an ordinary day, doodles for a festival, and wishes a happy birthday to whoever it is', () => {
    assert.deepEqual(boardContent(null, []), { kind: 'notes' });
    assert.deepEqual(boardContent('birthday', ['Lina']), { kind: 'birthday', lines: ['HBD', 'LINA !!'] });
    assert.deepEqual(boardContent('birthday', ['Hélène']), { kind: 'birthday', lines: ['HBD', 'HELENE', '!!'] }, 'capitals without accents, "!!" below when it does not fit');
    assert.deepEqual(birthdayLines(['Maximilien']), ['HBD', 'MAXIMIL', '!!'], 'cut to the board');
    assert.deepEqual(birthdayLines([]), ['HBD !!']);
    const halloween = boardContent('halloween', []);
    assert.ok(halloween.kind === 'doodles' && halloween.doodles.includes('pumpkin'));
    const christmas = boardContent('christmas', []);
    assert.ok(christmas.kind === 'doodles' && christmas.doodles.includes('tree'));
  });

  it('fits what it shows on its surface, every festival included', () => {
    for (const festival of FESTIVALS) {
      const content = boardContent(festival, ['Christophe']);
      if (content.kind === 'birthday') {
        assert.ok(content.lines.every((line) => line.length <= lettersPerLine && textWidth(line) <= BOARD.columns), festival);
        assert.ok(content.lines.length * LINE_HEIGHT - 2 <= BOARD.rows, festival);
      } else if (content.kind === 'doodles') {
        assert.ok(doodlesWidth(content.doodles) <= BOARD.columns, `${festival} wide`);
        for (const doodle of content.doodles) assert.ok(DOODLES[doodle].length <= BOARD.rows && DOODLES[doodle].every((row) => row.length === DOODLES[doodle][0].length), `${festival} ${doodle}`);
      }
    }
  });
});

describe('the numbers object', () => {
  /** The office with one draft of the numbers object. */
  const officeWith = (kind: MetricsKind) => new Floor({ ...OFFICE, furniture: [...OFFICE.furniture, METRICS_PIECES[kind]] });
  const at = (x: number, y: number, height: number) => { const base = toScreen({ x, y }); return { x: base.x, y: base.y - height }; };

  it('is in the office only once the settings name a numbers file', () => {
    assert.equal(OFFICE_FLOOR.metrics, null);
    assert.ok(!OFFICE_FLOOR.layout.furniture.some(isMetricsPiece));
    const floor = new Floor(OFFICE, null, true);
    assert.deepEqual(floor.layout.furniture.filter(isMetricsPiece).map((piece) => piece.kind), [METRICS_OBJECT]);
    assert.ok(floor.metrics);
    assert.equal(new Floor(LOUNGE, null, true).metrics, null, 'not in the break room');
  });

  it('stands on a wall, a desk or a shelf without taking a tile, and the pointer finds it, each draft', () => {
    for (const kind of METRICS_KINDS) {
      const floor = officeWith(kind);
      const piece = METRICS_PIECES[kind];
      const box = floor.metrics!;
      assert.equal(piece.blocks, false, kind);
      assert.ok(piece.wall || piece.top !== undefined, `${kind} hangs or stands on something`);
      if (piece.wall) {
        assert.equal(piece.x, 0, `${kind} on the left wall`);
        assert.ok(piece.y + piece.depth < OFFICE.door.y - 0.5, `${kind} clear of the door`);
        assert.ok(box.high <= 100, `${kind} under the top of the wall`);
      } else {
        const support = OFFICE.furniture.find((other) => other !== piece && other.x === piece.x && other.y === piece.y && other.width === piece.width)!;
        assert.ok(support && support.kind !== piece.kind, `${kind} on its desk or shelf`);
      }
      assert.ok(floor.isMetricsAt(at((box.fromX + box.toX) / 2, box.toY, (box.low + box.high) / 2)), `${kind} under the pointer`);
      assert.equal(floor.isMetricsAt(toScreen({ x: 10, y: 10 })), false, kind);
      assert.deepEqual(blockedTiles(floor.layout.furniture), BLOCKED, `${kind} blocks nothing`);
    }
    const laptop = OFFICE_FLOOR.userScreen!;
    assert.ok(officeWith('cash').metrics!.toX < laptop.fromX, 'the banknotes and the notepad left of the laptop');
  });

  it('keeps every seat and every place to drop by reachable', () => {
    for (const kind of METRICS_KINDS) {
      const floor = officeWith(kind);
      floor.layout.seats.forEach((seat, index) => {
        const end = floor.pathToSeat(floor.door, index).at(-1)!;
        assert.equal(`${Math.floor(end.x)},${Math.floor(end.y)}`, `${seat.x},${seat.y}`, `${kind} seat ${seat.x},${seat.y}`);
      });
      for (const spot of floor.layout.visitSpots ?? []) assert.ok(close(tileCenter(floor.route(floor.door, spot.at).at(-1)!), tileCenter(spot.at)), `${kind} ${spot.activity}`);
    }
  });

  it('shows its badge while something new waits and the panel is closed, above the object, in the room', () => {
    assert.equal(showsMetricsBadge(true, false), true);
    assert.equal(showsMetricsBadge(true, true), false, 'opening the panel clears it at once');
    assert.equal(showsMetricsBadge(false, false), false);
    for (const kind of METRICS_KINDS) {
      const box = officeWith(kind).metrics!;
      const badge = metricsBadgeAt(METRICS_PIECES[kind]);
      assert.ok(isInRoom(badge), `${kind} badge in the room`);
      assert.ok(badge.y < at(box.fromX, box.toY, box.high).y + 4, `${kind} badge above the object`);
    }
  });
});

describe('name tags', () => {
  const box = (left: number, top: number, width = 40) => ({ left, top, width, height: 13 });

  it('leaves tags that do not touch where they are', () => {
    assert.deepEqual(stackLabels([box(0, 100), box(60, 100), box(0, 50)]), [100, 100, 50]);
  });

  it('moves the tag further back above the one in front, and again above a third', () => {
    const tops = stackLabels([box(20, 95), box(0, 100), box(10, 90)]);
    assert.equal(tops[1], 100, 'the front one keeps its place');
    assert.equal(tops[0], 100 - 1 - 13);
    assert.equal(tops[2], tops[0] - 1 - 13);
  });
});
