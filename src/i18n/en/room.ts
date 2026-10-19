import { plural, type Dictionary } from '../index.ts';

export const room: Dictionary['room'] = {
  you: 'You',
  birthdayWish: (names: readonly string[]) => `Happy birthday ${names.join(' and ')}!`,
  subagent: 'Sub-agent',
  /** Tab hides the open sessions to see the room, and brings them back */
  stack: { show: (count: number) => `Show ${plural(count, 'conversation', 'conversations')}` },
  hint: { openUnder: 'Shift+click: open it beside · Tab: see the room', openFull: 'Six windows at most: close one to open it beside', toLounge: 'Break room', toOffice: 'Open space', openTerminal: 'Open a terminal', openBoard: 'Whiteboard: your notes', openMetrics: 'Numbers', newMetrics: 'Numbers: something new', startWith: (name: string) => `Start a session with ${name}` },
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
  },
  festivals: {
    newYear: 'New Year', epiphany: 'Epiphany', chineseNewYear: 'Chinese New Year', candlemas: 'Candlemas', valentine: 'Valentine’s Day',
    songkran: 'Songkran', easter: 'Easter', mayDay: 'May Day', music: 'Music Day', bastille: 'Bastille Day', summer: 'Summer',
    birthday: 'Birthday', halloween: 'Halloween', christmas: 'Christmas',
  },
};
