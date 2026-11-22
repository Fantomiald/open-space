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
      '1.37': {
        title: 'Your keys, pasted once',
        items: {
          vault: { title: 'The key vault', text: 'A key pasted into an agent’s card goes to the vault, encrypted by your system. Agents get it by name and never see the value.' },
          scope: { title: 'You pick who gets it', text: 'Each key is for this session (by default), this project or everywhere. In one card, you can keep one key and not the other.' },
          trust: { title: 'Always for this project', text: 'A saved key goes through without a card where you allowed it. A session started by an agent or from Telegram always asks again.' },
          manage: { title: 'All in Settings, Keys', text: 'Keys of sessions, automatons and mods in one place: who used them and when, replace, remove.' },
          light: { title: 'Lighter automatons', text: 'An automaton can start without the plugins, MCP servers or CLAUDE.md it does not need: its first context drops from 127k to 48k tokens.' },
        },
        thanks: 'Thanks to Jean-Baptiste for the lighter automaton start (PR #62).',
      },
    },
    actions: { automata: 'Open automatons', mods: 'See my mods', settings: 'Open the setting', tour: 'Take the tour', dashboards: 'Open dashboards', keys: 'Open keys' },
  },
};
