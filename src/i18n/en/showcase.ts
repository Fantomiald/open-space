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
      '1.32': {
        title: 'Windows that tidy up, a clearer app',
        items: {
          windows: { title: 'Windows and mods tidy up as you drag', text: 'Drag a conversation or a mod onto the others: it joins the grid. Pull it out: it floats. No more Grid / Free switch.' },
          list: { title: 'The list grouped your way', text: 'The filter icon groups by state or by project. Tags show in full, and in the All view each window names its project.' },
          quota: { title: 'Two rings for your quota', text: 'The 5 hours and the week side by side in the header: no more hidden weekly limit.' },
          settings: { title: 'Tidier settings', text: 'An Appearance section (radio you can turn off, first names you can hide in the room), and Automatons and connections in one place.' },
          telegram: { title: 'A calmer Telegram', text: 'A session the bot starts in Remote Control no longer writes to you twice. /follow and /unfollow pick what you follow.' },
          desktop: { title: 'Claude Desktop’s conversations', text: 'Resume lists them too, and picks them up in their folder and on their branch. A /clear also takes the old tags off.' },
        },
        thanks: 'Thanks to Quentin and Guillaume for their pull requests.',
      },
    },
    actions: { automata: 'Open automatons', mods: 'See my mods', settings: 'Open the setting', tour: 'Take the tour' },
  },
};
