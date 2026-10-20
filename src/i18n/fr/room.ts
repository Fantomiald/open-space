import type { Festival } from '../../../shared/festivals.ts';
import type { PetKind } from '../../../shared/pets.ts';
import { plural } from '../index.ts';

export const room = {
  /** the user's name tag when the crew has no name for them */
  you: 'Toi',
  /** what the crew says at a birthday party (src/room/visitors.ts) */
  birthdayWish: (names: readonly string[]) => `Joyeux anniversaire ${names.join(' et ')} !`,
  subagent: 'Sous-agent',
  /** the card following the pointer over the door, the user's screen, the whiteboard or the numbers */
  /** Tab hides the open sessions to see the room, and brings them back */
  stack: {
    show: (count: number) => `Afficher ${plural(count, 'conversation', 'conversations')}`,
    resizeColumns: 'Largeur des colonnes',
    resizeRows: 'Hauteur des fenêtres',
    resizeStack: 'Largeur des fenêtres',
    resizeTitle: 'Tirer pour redimensionner, double-clic pour répartir',
  },
  /** the line in the corner of the room until the room or a window was moved by hand */
  arrange: { title: 'Astuce', move: 'glisser : bouger la salle ou une fenêtre', zoom: 'molette : zoomer', close: 'Compris' },
  hint: { openUnder: 'Maj+clic : l’ouvrir à côté · Tab : voir la salle', openFull: '6 fenêtres au plus : ferme-en une pour l’ouvrir à côté', toLounge: 'Salle de repos', toOffice: 'Open space', openTerminal: 'Ouvrir un terminal', openBoard: 'Tableau : tes notes', openMetrics: 'Chiffres', newMetrics: 'Chiffres : du nouveau', startWith: (name: string) => `Lancer une session avec ${name}` },
  description: {
    lounge: (count: number) => `Salle de repos : ${plural(count, 'session au repos', 'sessions au repos')}.`,
    office: (count: number) => `Bureau : ${plural(count, 'session', 'sessions')} à leur poste.`,
  },
  hidden: {
    more: (count: number) => `${plural(count, 'autre session', 'autres sessions')} sans place`,
    list: 'Sessions sans place',
  },
  /** before someone's words in a speech bubble */
  speaker: (label: string) => `${label} :`,
  /** what each pet says: a cat meows, a dog barks, the rubber duck listens to your bug, Rocky speaks in chords */
  petLines: {
    cat: ['Miaou !', 'Mrrrr…', 'Miaou ?', 'Mraou !'],
    dog: ['Ouaf ouaf !', 'Wouf !', 'Ouaf ?', 'Ouaf ouaf ouaf !'],
    duck: ['Coin coin !', 'Coin ?', 'Coin.', 'Coin coin coin !'],
    capybara: ['Tranquille.', 'Mmh.', 'Zen.', '…'],
    axolotl: ['Blub !', 'Bloup.', 'Blub blub ?'],
    rocky: ['♫ Amaze! Amaze! Amaze!', '♫ Fist my bump.', '♫ Good good good.', '♫ Happy happy happy!', '♫ You are friend, question?'],
    clawd: ['Tu as tout à fait raison !', 'Bonne question !', 'Excellente idée !', '✻ Mijote…', '✻ Cogite…', '✻ Infuse…', '✻ Peaufine…'],
  } satisfies Record<Exclude<PetKind, 'none'>, readonly string[]>,
  /** the festivals' names, in the preview menu */
  festivals: {
    newYear: 'Nouvel An', epiphany: 'Épiphanie', chineseNewYear: 'Nouvel An chinois', candlemas: 'Chandeleur', valentine: 'Saint-Valentin',
    songkran: 'Songkran', easter: 'Pâques', mayDay: '1er mai', music: 'Fête de la musique', bastille: '14 juillet', summer: 'Été',
    birthday: 'Anniversaire', halloween: 'Halloween', christmas: 'Noël',
  } satisfies Record<Festival, string>,
};
