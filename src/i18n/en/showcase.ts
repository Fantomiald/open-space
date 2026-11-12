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
      '1.34': {
        title: 'Your mods on dashboards',
        items: {
          dashboards: { title: 'Dashboards of mods', text: 'A new button beside the rooms: your mods laid out on a grid, full page. Make several and switch between them with their tabs.' },
          grid: { title: 'A grid like Grafana', text: 'Drag a mod by its title, pull its corner to resize it: the others make room and move back up. A mod can still open in its own window.' },
          focus: { title: 'A session per project, in one move', text: 'In focus mode, each project has its “+”, and Alt+1 to 9 starts a session there.' },
          resume: { title: 'Resume, clearer', text: 'The list scrolls all the way up, and a badge marks the conversations archived in Claude Desktop.' },
          viewer: { title: 'Zoom into images', text: 'In the viewer, the wheel or a pinch zooms into an image.' },
          folders: { title: 'The folder picker fits', text: 'The list of folders no longer spills out of the launcher.' },
        },
        thanks: 'Thanks to Quentin for focus mode, Resume and the folder picker (PRs #48 to #51).',
      },
    },
    actions: { automata: 'Open automatons', mods: 'See my mods', settings: 'Open the setting', tour: 'Take the tour', dashboards: 'Open dashboards' },
  },
};
