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
      '1.33': {
        title: 'Your windows stay where you put them',
        items: {
          windows: { title: 'Each mode keeps its layout', text: 'Go from focus mode to the room and back: your windows are where you left them. A click on the background closes what is docked in the grid, floating windows stay.' },
          files: { title: 'Videos and PDFs to open', text: 'The files you send show in the conversation: a video plays large, a PDF opens in the viewer.' },
          aside: { title: 'Reply aside', text: 'Under a side question (/btw), a Reply field keeps the exchange going, no need to type /btw again.' },
          sessions: { title: '12 sessions, and room', text: 'Up to 12 sessions at once. At the limit, the one waiting the longest goes to sleep, and resumes on the next message.' },
          mods: { title: 'A mod starts an automation', text: 'A button in a mod can start an automation, once you agree. Each run says whether it is running, waiting for you or done.' },
          browsers: { title: 'Muted browsers', text: 'A video or a song an agent tests no longer plays on your speakers.' },
        },
      },
    },
    actions: { automata: 'Open automatons', mods: 'See my mods', settings: 'Open the setting', tour: 'Take the tour' },
  },
};
