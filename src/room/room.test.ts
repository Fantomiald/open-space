import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionInfo, SessionState } from '../../shared/protocol.ts';
import { earlySpeech, speechOf, USER_SPEAKER } from '../state/speech.ts';
import { VISIBLE_ROWS, bubbleText, earlyBubbleText, pruneBubbles, pushBubble, type Bubble } from './bubbles.ts';
import type { SeenSequences } from '../state/queue.ts';
import { planRoom, roleTitle, roomSessions } from './cast.ts';
import { LOUNGE, OFFICE, ROOM, blockedTiles } from '../../shared/room-layout.ts';
import { FESTIVALS, easterSunday, festivalDay, festivalOn } from '../../shared/festivals.ts';
import { outfitFor } from './outfits.ts';
import { Floor } from './floor.ts';
import { distance, toScreen, toTile, type Point } from './geometry.ts';
import { Scene, directionOf } from './scene.ts';
import { createPet, isSpeaking, petWords, stepPet } from './pet.ts';
import { assignSeats } from './seats.ts';
import { parseLook } from '../../shared/look.ts';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { lookOfStranger } from './chibi.ts';

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
    assert.equal(OFFICE_FLOOR.isWalkable({ x: 11.5, y: 0.5 }), false, 'the server against the wall');
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
    const scene = officeScene();
    const paws = toScreen(scene.pet!.position);
    assert.equal(scene.pokePet({ x: paws.x, y: paws.y - 10 }), true);
    assert.equal(isSpeaking(scene.pet!), true);
    assert.equal(scene.pokePet({ x: paws.x + 60, y: paws.y }), false);
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
    assert.equal(parseLook({ ...look, hair: 'dreadlocks' }), null);
    const { sunglasses: _sun, headphones: _phones, hat: _hat, hatColor: _hatColor, eyes: _eyes, ...older } = look;
    assert.deepEqual(parseLook(older), { ...look, eyes: 'round', sunglasses: false, headphones: false, hat: 'none', hatColor: DEFAULT_LOOK.hatColor }, 'a look saved before them keeps everything else');
    assert.equal(parseLook({ ...look, eyes: 'narrow' })?.eyes, 'round', 'eyes no longer offered: round ones, the rest kept');
    assert.equal(parseLook({ ...look, hat: 'sombrero' }), null);
    assert.equal(parseLook({ ...look, topColor: 'red' }), null);
    assert.equal(parseLook({ ...look, glasses: '#121419' })?.glasses, '#121419');
    const { watch: _watch, ...missing } = look;
    assert.equal(parseLook(missing), null);
  });
});
