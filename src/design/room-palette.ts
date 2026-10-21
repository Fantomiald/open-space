// Every colour of the meeting room (the people's are in people-palette.ts). This is the one exception to the design
// tokens: the room is pixel art with a single look of its own, so it does not follow the light/dark theme. Change the
// room's colours here only (src/room/room.css reads the bubble colours from this file through CSS variables).

export const ROOM_PALETTE = {
  /** around the room: clear, the page's backdrop shows through */
  backdrop: 'transparent',
  /** the floor, the walls and what hangs on them */
  room: {
    planks: ['#9a6a40', '#a5744a', '#8f6138', '#a06e44'],
    plankSeam: '#6e4627',
    plankLight: '#b98652',
    floorEdge: '#5a3a22',
    floorEdgeDark: '#46301c',
    /** the stone slab the room stands on, floating in the sky: its two faces, the lit lip, the joints, the stepped underside */
    slab: '#8a849e',
    slabDark: '#6a6482',
    slabLight: '#b2acc6',
    slabSeam: '#5a5470',
    slabUnder: '#4a4560',
    wall: '#3f3a5a',
    wallStripe: '#38344f',
    wallSide: '#353049',
    wallSideStripe: '#2f2b42',
    wainscot: '#5a3f33',
    wainscotSide: '#4c352b',
    wainscotLine: '#43302a',
    rail: '#8a6a52',
    baseboard: '#2a2030',
    wallTop: '#6c6690',
    wallTopSide: '#5a547a',
    /** the cut end of a wall at the front of the room, and the lit edge of its top */
    wallEnd: '#2e2a44',
    wallTopEdge: '#8a84ae',
    doorFrame: '#7a5236',
    doorway: '#120d0b',
    doorLight: '#ffcf8a',
    windowFrame: '#2b2840',
    windowSill: '#6c6690',
    city: '#1d1631',
    cityFar: '#2a2040',
    cityLit: '#ffcf6b',
    clock: '#eef0f4',
    tvFrame: '#16141f',
    tvScreen: '#2b4a7a',
    clockHands: '#1b1f2c',
    rugs: { blue: '#2f4f86', green: '#2f6b55', purple: '#5a3f7a', amber: '#8a5a2a' },
  },
  /** the furniture (src/room/pixel-furniture.ts) */
  furniture: {
    wood: '#9a6a40',
    darkWood: '#5e3d26',
    metal: '#3b404e',
    lightMetal: '#8b919c',
    monitor: '#262a35',
    paper: '#f3f4f7',
    mug: '#e5534b',
    chair: '#2f3442',
    leaves: '#3f9a4a',
    trunk: '#6a4428',
    soil: '#3a2a1e',
    shadow: 'rgba(10, 6, 4, 0.14)',
    steam: '#e9edf5',
    darkLeaves: '#2c7236',
    pot: '#c0643a',
    books: ['#e5534b', '#4d8dff', '#e8c547', '#45c46b', '#7a5cc4', '#e8833a'],
    sofa: '#e8833a',
    couch: '#5a6fb0',
    lampShade: '#f4e3c0',
    cooler: '#d5d8de',
    water: '#6fb6f0',
    ledRed: '#e5534b',
    ledBlue: '#4d8dff',
    counter: '#e9e6df',
    coffee: '#2b2f3a',
    boss: '#3a2a20',
    bossStripe: '#ff8a3d',
    outline: '#0a0b0f',
    /** the whiteboard on wheels: its board, aluminium frame, stand, casters, and the markers it is written with (src/room/whiteboard.ts) */
    whiteboard: '#f7f8fa', boardFrame: '#b9bec8', caster: '#22252e',
    markers: { k: '#2b2f3a', b: '#2f6fd8', r: '#d8343f', g: '#2f8a4a', y: '#f2b822', o: '#e8833a', t: '#7a4a28' },
    /** the drafts of the numbers object (METRICS_OBJECT in shared/room-layout.ts): banknotes and a notepad, a dashboard screen, a stock ticker, a piggy bank */
    cash: '#5fae6a', cashBand: '#f3e9c6', notepad: '#f6f1dc', spiral: '#3b404e', rising: '#2f8a4a',
    screenBezel: '#16141f', screenFace: '#11243c', screenGrid: '#24466e', bars: ['#45c46b', '#7fd3ff'], trend: '#ffb866',
    ticker: '#0d0e13', tickerGreen: '#62f08e', tickerRed: '#ff6a6a', tickerAmber: '#ffc44a',
    piggy: '#f49ac1', piggyShade: '#d86f9c', piggySnout: '#ff8fbd', coin: '#f2c14e',
    /** around what a click opens (the user's laptop, the whiteboard, the numbers), under the pointer, like the door */
    highlight: '#ffffff',
  },
  /** Halloween's decorations (src/room/halloween.ts, and the pumpkins of pixel-furniture.ts) */
  halloween: {
    pumpkin: '#e8833a', pumpkinDark: '#b85a1e', stem: '#4a7a2a', stalk: '#6b4a2b', stalkLight: '#8a6440', leaf: '#5f9a35', carved: '#2a1a10', ghost: '#eef0f6', web: '#b9bccb',
    wire: '#2a2433', bulbOrange: '#ffa94d', bulbPurple: '#b07cff', glow: '#ffb347',
  },
  /** the other festivals (shared/festivals.ts): their furniture, walls, outfits and effects (src/room/festivals.ts) */
  festive: {
    gold: '#f2c14e', goldDark: '#b8862a', silver: '#d3d9e6', red: '#d8343f', green: '#2f8a4a', pine: '#2a7a44', pineDark: '#1c5a33', trunk: '#6a4428',
    white: '#f4f6fa', pink: '#ff8ab4', rose: '#e0304e', blue: '#3a6fd8', black: '#1a1b22',
    bulbs: ['#ff5a5a', '#ffd84a', '#5ad1ff', '#7dff6a', '#ff8af0'],
    gifts: ['#d8343f', '#3a6fd8', '#2f8a4a', '#9a6ad8'],
    balloons: ['#ff5a6e', '#ffd84a', '#5ab8ff', '#7ad97a', '#c88aff'],
    confetti: ['#ff5a5a', '#ffd84a', '#5ad1ff', '#7dff6a', '#ff8af0', '#ffffff'],
    eggs: ['#ff9ccf', '#9fd8ff', '#fff07a', '#b6ff9c', '#d0a8ff'],
    tablecloth: '#ffd1e3', plate: '#eef0f4', crepe: '#f1c27d', crepeDark: '#d79a52', jam: '#b4233a', galette: '#e2a640', cake: '#f6e1c8', icing: '#ff9ccf',
    candle: '#8ad1ff', flame: '#ffcf4a', chocolate: '#6b3f22', glass: '#bfe3f2', bubbly: '#f6e08a', bottle: '#1f5a3a',
    water: '#5ec8f2', waterLight: '#c2f0ff', poolRim: '#ff8a3d', poolStripe: '#ffffff', duck: '#ffd84a', duckBeak: '#ff8a3d', squirt: '#7fd8ff',
    envelope: '#c8202c', kumquat: '#ff9a1f', potRed: '#b8242c', lily: '#fbfbf2', leaf: '#3f9a4a',
    speaker: '#23252e', speakerCone: '#3b3f4c', fan: '#d5d8de', fanBlade: '#9aa3b4',
    tricolor: ['#2b4fb3', '#f4f6fa', '#d8343f'], lantern: '#d8202c', lanternGlow: '#ff6a3d', note: '#f4f1e8', heart: '#ff5a7a', heartDark: '#c2305a', snow: '#f4f8ff',
    hatStripe: '#ffffff', fur: '#f4f6fa', jewel: '#d8343f', jewelBlue: '#3a6fd8', ear: '#f4f6fa', earInside: '#ffb3c8', headphones: '#2a2d36', headphonesShell: '#434a5a', headphonesShine: '#7a849c', headphonesPad: '#e5534b',
    shades: '#121419', shadesShine: '#5a6a8a', waterGun: '#ff8a3d', waterGunTank: '#5ad1ff', beret: '#2b4fb3',
  },
  /** the office pet (src/room/pet.ts): its hearts and speech bubble, each cat coat, each dog breed, and Rocky */
  pet: {
    heart: '#ff6b9a', bubble: '#ffffff', bubbleInk: '#1b1b22', nose: '#e86f8a', earInside: '#f2a0b0', tongue: '#ff7a8a', black: '#1b1b22', white: '#f4f4f6',
    collar: '#d8343f', tag: '#f2c14e', beak: '#ff9a2a', citrus: '#ffb02e', leaf: '#3f9a4a', gills: '#e8608a',
    /** each cat pattern's fur, before the user picks another; the patches of a calico */
    cats: { plain: '#e08a3c', tabby: '#9a7a52', calico: '#f4efe6', tuxedo: '#26262d', eyes: '#3f9a4a', patchA: '#e08a3c', patchB: '#2a2a33' },
    /** each breed's fur, before the user picks another */
    dogs: { labrador: '#e3b56a', dalmatian: '#f4f4f6', husky: '#7d8696', shiba: '#d9813a', corgi: '#e0903f', dachshund: '#8a4a26', pug: '#e3c89a' },
    duck: '#ffd84a', capybara: '#9a6a3c', axolotl: '#ffb3c8',
    /** Claude Code's mascot, in its clay orange */
    clawd: '#d97757',
    rocky: { shell: '#8a5a2c', light: '#c08a4a', dark: '#5a3a1c' },
  },

  /** the day cycle (src/room/lighting.ts): tints multiplied over the room, sky colours, and the light sources */
  light: {
    night: '#2c3466',
    dawn: '#f2b9a0',
    day: '#ffffff',
    dusk: '#d98a6c',
    skyNightTop: '#0b1430',
    skyNightBottom: '#24366e',
    skyDawnTop: '#5b6fb8',
    skyDawnBottom: '#f6b48c',
    skyDayTop: '#5f9be3',
    skyDayBottom: '#bfe0fb',
    skyDuskTop: '#3d3f8f',
    skyDuskBottom: '#f08a5d',
    sun: '#fff1c9',
    sunLow: '#ffb46b',
    moon: '#9fb7ff',
    /** the sky behind the page (src/room/sky.ts) */
    moonDisk: '#eef2ff',
    cloud: '#f7f9ff',
    cloudShade: '#d3ddf2',
    lamp: '#ffc46b',
    screen: '#7fd3ff',
    screenIdle: '#5a7bd0',
    corridor: '#ffb86b',
    city: '#7a6cff',
    boss: '#ff8a3d',
    coffee: '#ff9a5a',
  },
  /** behind the user's bust in the app icon and the favicon (src/room/chibi.ts, scripts/macos-app.py): the room at night */
  icon: { top: '#3a4170', bottom: '#252a48' },
  star: '#e8eefc',
  shadow: 'rgba(10, 8, 20, 0.35)',
  white: '#ffffff',
  outline: '#1b1f2c',
  /** the badge above the numbers object while something new waits in its file (src/room/metrics.ts) */
  metricsBadge: '#ffd43b',
  /** the round icon at the start of a name tag, in the page's session tones (--tone-* in tokens.css) */
  status: {
    permission: '#ffb866',
    question: '#ffb866',
    working: '#8cc2ff',
    finished: '#6fdc9b',
    error: '#ff8f8a',
    compacting: '#c9a6ff',
  },
  /** the glyph in that icon */
  statusInk: '#141826',
  /** a name tag that waits for the user: amber through the glass, an amber edge and a soft halo */
  askingTag: 'rgba(78, 58, 38, 0.9)',
  askingTagEdge: 'rgba(255, 184, 102, 0.7)',
  askingTagHalo: 'rgba(255, 184, 102, 0.16)',
  errorTagEdge: 'rgba(255, 143, 138, 0.55)',
  /** a name tag with nothing going on */
  quietTagText: '#c3c9d8',
  /** what a visitor of the crew is doing, in a thought bubble above their head (src/room/activity-icons.ts) */
  activity: {
    bubble: '#ffffff', ink: '#1b1f2c', mug: '#e2774a', coffee: '#5a3420', steam: '#a9afc0', water: '#4d9dff', waterLight: '#b9dcff',
    bird: '#4d8dff', beak: '#f4a72a', cover: '#d8454b', pages: '#fbf3df', screen: '#7cc6ff', balloon: '#ff5f7e', shine: '#ffd0da',
  },
  tag: 'rgba(15, 20, 35, 0.8)',
  tagText: '#f4f1e8',
  /** the word the user put on a session, after its name */
  sessionTag: '#9aa8ff',
  playerTagText: '#ffd6e2',
  /** the hairline around a name tag, like the edge of the glass panels */
  tagEdge: 'rgba(255, 255, 255, 0.18)',
  /** the outline of the door under the pointer */
  doorHover: '#ffffff',
  selection: '#ffffff',
  bubble: '#ffffff',
  bubbleFromUser: '#ffe3ec',
  bubbleInk: '#1b1f2c',
  bubbleShadow: 'rgba(0, 0, 0, 0.35)',
  more: 'rgba(15, 20, 35, 0.78)',
  moreText: '#f4f1e8',
} as const;

/** A colour made darker (factor below 1) or lighter (above 1). */
export function shade(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) =>
    Math.round(factor > 1 ? channel + (255 - channel) * (factor - 1) : channel * factor));
  return `rgb(${channels.join(',')})`;
}
