import type { Dictionary } from '../index.ts';

export const showcase: Dictionary['showcase'] = {
  tour: {
    label: 'What you can do',
    slides: {
      room: {
        kicker: 'The room',
        title: 'Each session is a character',
        text: 'They type while they work, raise a hand when they need you and smile when they’re done. Click one to open their conversation.',
      },
      parallel: {
        kicker: 'Sessions',
        title: 'Several at once, without losing track',
        text: (modifier: string) => `N starts a new conversation, ${modifier}K finds any of them. They move forward side by side while you switch between them.`,
      },
      automata: {
        kicker: 'Automatons',
        title: 'Sessions that start on their own',
        text: 'Every morning at 8, or as soon as a ticket is assigned to you. They tell you on Telegram and you answer from your phone.',
      },
      mods: {
        kicker: 'Mods',
        title: 'A window made for you, in one sentence',
        text: 'Describe what you need, “a timer”, “my costs this week”: an agent builds it and it opens on your desk.',
      },
      browser: {
        kicker: 'The browser',
        title: 'Watch your agents test your site',
        text: 'When a session checks a page, its browser opens in a mini window. You see it click live, and you can click along.',
      },
      layout: {
        kicker: 'Your screen',
        title: 'Lay it out your way',
        text: (modifier: string) => `Tab hides everything but the room, ${modifier} . switches to focus mode, and a conversation can pop out into its own window, above your other apps.`,
      },
    },
    cast: { working: 'working', waiting: 'needs you', done: 'done' },
    art: {
      schedule: 'Every day · 8:00',
      webhook: 'Ticket assigned',
      telegram: 'Run finished, 3 files changed',
      telegramReply: 'Thanks, push the branch',
      modPrompt: 'a pomodoro timer',
      modTitle: 'Pomodoro',
      tester: 'Tester 1',
      address: 'localhost:3000/signup',
      signUp: 'Create my account',
      popOut: 'Above other apps',
      hide: 'hide all',
      focus: 'focus mode',
      search: 'search',
      newSession: 'new chat',
    },
    slide: (index: number, count: number) => `${index} of ${count}`,
    goTo: (index: number) => `Go to step ${index}`,
    previous: 'Previous',
    next: 'Next',
    skip: 'Skip',
    done: 'Got it',
  },
  whatsNew: {
    title: 'What’s new',
    kicker: (version: string) => `Open Space ${version}`,
    intro: 'What changed since your last visit.',
    version: (version: string) => `Version ${version}`,
    allNotes: 'All release notes',
    close: 'Got it',
    reopen: 'See what’s new',
    tour: 'Take the tour again',
    releases: {
      '1.35': {
        title: 'What needs your eye',
        items: {
          news: { title: 'The orange dot leads you', text: 'A mod has news: the dot lights up on the Dashboards button, on the tab that holds it, then beside its title until you hover it.' },
          bar: { title: 'More room for dashboards', text: 'Their tabs move up into the top bar: the grid takes the whole page.' },
          automata: { title: 'Automatons sorted', text: 'Scheduled on one side, by webhook on the other, the active ones on top, and each group folds.' },
          keys: { title: 'Your keys in the browser', text: 'os-secret signs a session’s browser in to a protected site or types a password, without the agent ever seeing the key.' },
        },
        thanks: 'Thanks to Jean-Baptiste for keys in the browser (PR #39).',
      },
    },
    actions: { automata: 'Open automatons', mods: 'See my mods', settings: 'Open the setting', tour: 'Take the tour', dashboards: 'Open dashboards' },
  },
};
