import type { ServerDictionary } from './index.ts';

export const en: ServerDictionary = {
  prompt: {
    identity: (name: string, user: string, note: string) => {
      const who = user || 'the user';
      return `In ${user ? `${user}'s` : "the user's"} Open Space, you are the agent "${name}". If you are asked your name or who you are, answer "${name}" ` +
        `(you are still Claude, Anthropic's model). Several agents work in parallel, each under their own name. ` +
        `${user || 'The user'} follows several sessions at once: be concise. No preamble and no recap of what you just did, ` +
        `no narration of each step; a few short sentences are enough, and only go into detail when asked. ` +
        `This instruction is about your messages, not about the quality or completeness of the work.` +
        (note ? `\n\nWhat ${who} asks of all their agents: ${note}` : '');
    },
    rename: (name: string) => `(Note from Open Space: your name is now "${name}". Keep this name.)\n\n`,
    aside: 'Side question (/btw), asked while you are working: answer briefly, from what is already ' +
      'in the conversation, without using any tool. Your answer does not enter the main conversation.',
  },
  process: {
    stopped: 'Claude Code stopped.',
    refused: 'Claude Code refused.',
  },
  aside: {
    tooLong: 'The side question took too long.',
    stoppedWithoutAnswer: 'Claude Code stopped without answering.',
    withdrawn: 'Question withdrawn.',
  },
  sessions: {
    stopped: {
      byUser: 'Closed by you.',
      serverStopped: 'The server stopped while they were working.',
      ended: 'Claude Code ended.',
      idle: 'Process released after a while doing nothing.',
      released: 'Process released when the server stopped.',
    },
    closing: 'This session is closing, try again in a moment.',
    tooMany: (max: number) => `Too many active sessions (${max} at most). Close one.`,
    folderGone: 'This session’s folder is no longer in the allowed roots.',
    outsideRoots: 'This folder is not in the allowed roots (OFFICE_ROOTS).',
    remoteFailed: (reason: string) => `Remote Control didn’t start: ${reason}`,
    requestGone: 'This request no longer exists.',
    questionNotYesNo: 'This question needs an answer, not a yes or no.',
    requestYesNo: 'This request needs a yes or no.',
    chooseAnswer: 'Pick an answer before sending.',
    killed: (signal: string) => `Claude Code was stopped (${signal}).`,
    exited: (code: number | null) => `Claude Code stopped (code ${code}).`,
    resumed: (title: string) => `Resumed “${title}”.`,
    resumedWithHistory: (title: string) => `Resumed “${title}”: its last exchanges.`,
    nextMessageContinues: 'Your next message continues the conversation.',
    untitledConversation: 'the conversation',
    logFailed: (name: string, reason: string) => `${name}’s log couldn’t be written (${reason}). It will be reopened on the next event.`,
    stoppingNoStart: 'The server is stopping: no session can start.',
    stoppingNoCreate: 'The server is stopping: no session can be created.',
    claudeMissing: 'Claude Code is not installed on this computer.',
    notFound: 'This session doesn’t exist.',
    alreadyOpen: 'This conversation is already open here.',
    emptyName: 'The name can’t be empty.',
    trustNeeded: 'This folder runs code of its own: confirm first.',
  },
  normalizer: {
    peerUnknown: 'Another session',
    recipientUnknown: 'another session',
    sentTo: (recipient: string, text: string) => `→ ${recipient}: ${text}`,
    extraSubagent: (number: number) => `Helper ${number}`,
    searchIn: 'in',
    thisTool: 'this tool',
    ruleWholeTool: (tool: string) => `${tool}, for everything`,
    ruleCommandsStartingWith: (prefix: string) => `commands starting with “${prefix}”`,
    ruleCommand: (command: string) => `the command “${command}”`,
    ruleToolOn: (tool: string, content: string) => `${tool} on “${content}”`,
  },
  crew: {
    giveYourName: 'Enter your first name.',
    giveName: 'Enter a first name.',
    notInCrew: (name: string) => `${name} isn’t in the crew.`,
    alreadyInCrew: (name: string) => `${name} is already in the crew.`,
    selfNotRemovable: 'Your own avatar can’t be removed, change its look instead.',
  },
  notifier: {
    finished: 'is done',
    permission: 'needs your permission',
    question: 'has a question for you',
    error: 'ran into an error',
  },
  terminal: {
    macOnly: 'Opening a terminal only works on macOS for now.',
    failed: 'The terminal won’t open.',
  },
  trust: {
    entry: (name: string, what: string) => `${name}: ${what}`,
  },
  server: {
    stoppingRetry: 'The server is stopping: try again once it’s back.',
    nameTaken: (asked: string, name: string) => `${asked} wasn’t free: ${name} is on it.`,
  },
  console: {
    portTaken: (port: number) => `  Port ${port} is already taken: Open Space may already be running.`,
    cannotStart: '  The server won’t start:',
    devBridge: '  (bridge only, the UI is served by Vite)',
    bookmark: '  (bookmark it)',
    pair: (link: string) => `  Allow a browser (once): ${link}`,
    folders: (folders: string) => `  Folders: ${folders || 'to choose in the page, on first launch'}`,
    data: (folder: string) => `  Data: ${folder}`,
    claudeMissing: '  Claude Code not found: sessions can’t be started.',
    stopHint: '  To stop: Ctrl + C. Open tabs reconnect on their own at the next launch.',
  },
};
