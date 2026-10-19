// The colours of the people in the room and in the crew editor: the swatches offered for each part, the default
// look, and the ink of faces. Like room-palette.ts, an exception to the design tokens (pixel art has its own colours).
import type { Look } from '../../shared/look.ts';

/** Human skin tones, light to dark. */
export const SKIN_TONES = ['#ffe0c4', '#f6cfa3', '#f2c095', '#dea47c', '#c88a62', '#a8734f', '#8a5a3c', '#6b4429'] as const;
/** And skins out of this world: green, blue, purple, grey, red, yellow, pink. */
export const FANCY_SKINS = ['#7fd36a', '#6aa8ff', '#b48cff', '#b8bcc6', '#e8645a', '#ffd84a', '#ff9ccf'] as const;
export const HAIR_COLORS = [
  '#1d1b1f', '#3b2a20', '#5b3a22', '#77583a', '#a07a52', '#c46a2a', '#c9a268', '#e3c88d', '#f2ead2', '#b5462e', '#8f8f96', '#e9e9ee',
  '#ff8ab4', '#9a6ad8', '#5aa0ff', '#3fbfa0', '#5fbf7a',
] as const;
export const CLOTH_COLORS = [
  '#121316', '#2a2d36', '#4a4f5c', '#8b919c', '#d5d8de', '#f3f4f7', '#efe6d2', '#7d6a4f', '#76644a', '#9a6a40', '#7a2a3a', '#c94f4f',
  '#ff7a6b', '#e8833a', '#c9a227', '#e8c547', '#6b7a3a', '#5fae5f', '#1f6b4f', '#3f8f7f', '#2a8a9a', '#9fdccf', '#3d5a8a', '#4d8dff',
  '#1f2a4a', '#2c3a66', '#7a5cc4', '#b9a7e8', '#e86fa4', '#f2b5c8',
] as const;
/** A pet's fur (or Rocky's shell), belly and eyes: real coats first, then fancier ones. */
export const FUR_COLORS = [
  '#1b1b22', '#45454f', '#8b919c', '#d5d8de', '#f4f4f6', '#f6e3c8', '#e3c89a', '#e3b56a', '#d9813a', '#e08a3c', '#b06a3a', '#8a4a26',
  '#5a3a1c', '#8a5a2c', '#c08a4a', '#ff9ccf', '#b48cff', '#6aa8ff', '#7fd36a', '#e8645a',
] as const;
/** The fur of the coats and breeds the first pets were named after (see parsePet). */
export const OLDER_PET_FURS = { ginger: '#e08a3c', black: '#2a2a33', white: '#eef0f4', grey: '#8b919c', blackLab: '#26262d' } as const;
export const PET_EYE_COLORS = ['#3f9a4a', '#e8c547', '#4d8dff', '#c46a2a', '#1b1b22'] as const;
/** A cap, a beanie, a beret or a top hat before one picks a colour. */
export const DEFAULT_HAT_COLOR = '#2b4fb3';
export const GLASSES_COLORS = ['#121419', '#eef1f5', '#a8743a', '#c43c5a', '#4d8dff'] as const;

export const DEFAULT_LOOK: Look = {
  skin: '#f2c095', eyes: 'round', hair: 'short', hairColor: '#3b2a20', beard: 'none', beardColor: '#3b2a20', glasses: null,
  sunglasses: false, headphones: false, hat: 'none', hatColor: DEFAULT_HAT_COLOR,
  top: 'tshirt', topColor: '#4d8dff', accentColor: '#8b919c', bottom: 'pants', bottomColor: '#2c3a66', shoes: 'sneakers', shoesColor: '#2a2d36', watch: false, accessory: 'none',
};

/** The colours of the anime pieces (src/room/costumes.ts), fixed like the characters'. */
export const COSTUME_COLORS = {
  orange: '#f08a24', black: '#26272f', zipper: '#d5d8de', swirl: '#d0402e', band: '#26304f', bandage: '#ecebe4',
  sandal: '#2f4f96', metal: '#c3cad6', metalLight: '#e6eaf0', metalDark: '#6b7383',
  tee: '#f1f0ea', haramaki: '#3f8f44', trousers: '#262830', boots: '#1b1c22', gold: '#e8c048',
  wado: '#f4f2ec', kitetsu: '#b2262a', kitetsuSheath: '#7a1a1e', shusui: '#18181d',
  vest: '#d3302b', button: '#f2c440', shorts: '#3d6fc6', cuff: '#f4f2ea', straw: '#e9c45c', hatBand: '#c8302a', strap: '#7a4e2a', sole: '#c89a5a', scar: '#9a4a3a',
  suit: '#1f2029', shirt: '#4b7dd3', tie: '#111116', shoe: '#121318', shine: '#9aa0ac', paper: '#f4f2ec', ember: '#f06a2a', smoke: '#c4c8d2',
  flak: '#6f8c4a', navy: '#2b3654', glove: '#30313c', kakashiSandal: '#24365e',
} as const;

export const PEOPLE_INK = {
  outline: '#0a0b0f',
  eyeWhite: '#f4f6fa',
  pupil: '#121419',
  mouth: '#8a4f3a',
  band: '#d0435f',
  sole: '#eceef2',
  shirt: '#f3f4f7',
  watch: '#cfd3da',
  lens: '#bcd6ea',
};
