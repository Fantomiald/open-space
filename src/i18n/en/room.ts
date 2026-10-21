import { plural, type Dictionary } from '../index.ts';

export const room: Dictionary['room'] = {
  you: 'You',
  birthdayWish: (names: readonly string[]) => `Happy birthday ${names.join(' and ')}!`,
  subagent: 'Sub-agent',
  /** Tab hides the open sessions to see the room, and brings them back */
  stack: {
    show: (count: number) => `Show ${plural(count, 'conversation', 'conversations')}`,
    resizeColumns: 'Column width',
    resizeRows: 'Window height',
    resizeStack: 'Width of the windows',
    resizeTitle: 'Drag to resize, double-click to share out evenly',
  },
  /** the line in the corner of the room until the room or a window was moved by hand */
  arrange: { title: 'Tip', move: 'drag: move the room or a window', zoom: 'scroll: zoom', close: 'Got it' },
  hint: { toLounge: 'Break room', toOffice: 'Open space', openTerminal: 'Open a terminal', openBoard: 'Whiteboard: your notes', openMetrics: 'Numbers', newMetrics: 'Numbers: something new', startWith: (name: string) => `Start a session with ${name}` },
  description: {
    lounge: (count) => `Break room: ${plural(count, 'session resting', 'sessions resting')}.`,
    office: (count) => `Office: ${plural(count, 'session', 'sessions')} at their desks.`,
  },
  hidden: {
    more: (count) => `${plural(count, 'more session', 'more sessions')} without a seat`,
    list: 'Sessions without a seat',
  },
  speaker: (label) => `${label}:`,
  petLines: {
    cat: ['Meow!', 'Purrr…', 'Meow?', 'Mrrow!'],
    dog: ['Woof woof!', 'Arf!', 'Woof?', 'Woof woof woof!'],
    duck: ['Quack quack!', 'Quack?', 'Quack.', 'Quack quack quack!'],
    capybara: ['Chill.', 'Mmh.', 'Zen.', '…'],
    axolotl: ['Blub!', 'Bloop.', 'Blub blub?'],
    rocky: ['♫ Amaze! Amaze! Amaze!', '♫ Fist my bump.', '♫ Good good good.', '♫ Happy happy happy!', '♫ You are friend, question?'],
    clawd: ['You’re absolutely right!', 'Great question!', 'Excellent idea!', '✻ Baking…', '✻ Mulling…', '✻ Steeping…', '✻ Polishing…'],
    fox: ['Yip!', 'Kyah!', 'Yip yip?', 'Awooo!'],
    redPanda: ['Squee!', 'Sniff sniff.', 'Mmh?', 'Squee squee!'],
    rabbit: ['Sniff sniff.', 'Nibble nibble…', 'Hop!', 'A carrot?'],
    hedgehog: ['Sniff sniff.', 'Hrrf!', 'Pfff.', 'Sniff?'],
    owl: ['Hoo hoo!', 'Hoo?', 'Hooo…', 'Hoo hoo hoo!'],
    parrot: ['Pretty bird!', 'Commit! Commit!', 'Squawk!', 'Hello! Hello!'],
    penguin: ['Honk!', 'Brrr.', 'Honk honk?', 'Wheee!'],
    turtle: ['Slowly…', 'Mmh.', 'Slow and steady.', '…'],
    crab: ['Clack clack!', 'Clack?', 'Snip snip.', 'Pinch!'],
    octopus: ['Blop!', 'Eight arms, zero bugs.', 'Glub?', 'Splash!'],
    firefly: ['Bzzz…', 'Bzz?', '✧ Bzzz ✧', 'Zzz… bzz.'],
    ghostCat: ['Boo… meow.', 'Meeooow…', 'Ooooh!', 'Meow?'],
    manekiNeko: ['Welcome!', 'Meow! Good fortune!', 'Good luck to you!', 'Maneki maneki!'],
    robotDog: ['Beep boop!', 'Woof.exe', 'Beep?', 'Battery: 100%'],
    alien: ['Zorg beep!', 'I come in peace.', 'Zorg?', 'Phone… home.'],
    dragon: ['Rawr!', 'Grrr…', 'Fshhh!', 'Rawr?'],
    slime: ['Splotch!', 'Gloop.', 'Plop?', 'Squish!'],
    golem: ['Golem… help.', 'Hmmm.', 'Golem… happy.', 'Rrrumble.'],
  },
  festivals: {
    newYear: 'New Year', epiphany: 'Epiphany', chineseNewYear: 'Chinese New Year', candlemas: 'Candlemas', valentine: 'Valentine’s Day',
    songkran: 'Songkran', easter: 'Easter', mayDay: 'May Day', music: 'Music Day', bastille: 'Bastille Day', summer: 'Summer',
    birthday: 'Birthday', halloween: 'Halloween', christmas: 'Christmas',
  },
};
