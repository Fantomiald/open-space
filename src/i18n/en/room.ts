import { plural, type Dictionary } from '../index.ts';

export const room: Dictionary['room'] = {
  you: 'You',
  birthdayWish: (names: readonly string[]) => `Happy birthday ${names.join(' and ')}!`,
  subagent: 'Sub-agent',
  hint: { toLounge: 'Break room', toOffice: 'Open space', openTerminal: 'Open a terminal', startWith: (name: string) => `Start a session with ${name}` },
  description: {
    lounge: (count) => `Break room: ${plural(count, 'session resting', 'sessions resting')}.`,
    office: (count) => `Office: ${plural(count, 'session', 'sessions')} at their desks.`,
  },
  pip: {
    open: 'Mini window',
    openTitle: 'The room in a small window on top of the others',
    away: 'The room is in its mini window.',
    bringBack: 'Bring it back here',
  },
  hidden: {
    more: (count) => `${plural(count, 'more session', 'more sessions')} without a seat`,
    list: 'Sessions without a seat',
  },
  speaker: (label) => `${label}:`,
  petLines: {
    cat: ['Meow!', 'Purrr…', 'Meow?', 'Mrrow!'],
    dog: ['Woof woof!', 'Arf!', 'Woof?', 'Woof woof woof!'],
    duck: ['Quack quack!', 'Quack?', 'Walk me through your bug.', 'Quack.'],
    capybara: ['Chill.', 'Mmh.', 'Zen.', '…'],
    axolotl: ['Blub!', 'Bloop.', 'Blub blub?'],
    rocky: ['♫ Amaze! Amaze! Amaze!', '♫ Fist my bump.', '♫ Good good good.', '♫ Happy happy happy!', '♫ You are friend, question?'],
  },
  festivals: {
    newYear: 'New Year', epiphany: 'Epiphany', chineseNewYear: 'Chinese New Year', candlemas: 'Candlemas', valentine: 'Valentine’s Day',
    songkran: 'Songkran', easter: 'Easter', mayDay: 'May Day', music: 'Music Day', bastille: 'Bastille Day', summer: 'Summer',
    birthday: 'Birthday', halloween: 'Halloween', christmas: 'Christmas',
  },
};
