import type { ServerDictionary } from './index.ts';

/** where an isolated session works (see WorktreeInfo) */
type Place = { branch: string; base: string; root: string; mainRoot: string };

/** an isolated session: where it works, what it must not touch, and the dev servers of the others */
const worktreeNote = ({ branch, base, root, mainRoot }: Place) =>
  `You work on a branch of your own, "${branch}", started from "${base}", in a folder of your own: ${root} (a git worktree). ` +
  `The project's main folder, ${mainRoot}, belongs to the other sessions: never write in it, and run no git command there. ` +
  `Commit on your branch when it helps; Open Space merges into "${base}" when the user asks. ` +
  `A dev server started from the main folder may already hold its port: check before starting one (lsof -i :<port>), take another port if needed, and never start a second Metro.`;

export const en: ServerDictionary = {
  prompt: {
    tester: {
      description: 'Tests a flow in a browser of its own, shown live in Open Space. Launch it with the flow, the address and what should happen. For several flows at once, a browser-tester of a different number per flow.',
      prompt: 'You test a web flow in your own browser (the tester-browser tools), which the user watches live. Go through the flow you are given as a real visitor would, without changing any code. Watch the console and what shows at each step, take a screenshot of the key steps. Report briefly: what works, then each problem with how to reproduce it.',
    },
    identity: (name: string, user: string, note: string, browser: boolean) => {
      const who = user || 'the user';
      return `In ${user ? `${user}'s` : "the user's"} Open Space, you are the agent "${name}". If you are asked your name or who you are, answer "${name}" ` +
        `(you are still Claude, Anthropic's model). Several agents work in parallel, each under their own name. ` +
        `${user || 'The user'} follows several sessions at once: be concise. No preamble and no recap of what you just did, ` +
        `no narration of each step; a few short sentences are enough, and only go into detail when asked. ` +
        `This instruction is about your messages, not about the quality or completeness of the work.` +
        ` Open Space shows in the thread the pictures you send with SendUserFile and the pages you publish with Artifact: when you change something visible (a page, a screen) and can take a screenshot of it, send it.` +
        (browser ? ` Your browser (the Playwright tools) is shown live in Open Space, and ${user || 'the user'} can click in it: use it to test what you build. To test several flows at once, launch the sub-agents browser-tester-1 to browser-tester-4 in parallel, a different number per flow: each has a browser of its own, shown too. When you are done with it, close your browser (browser_close): otherwise it stays on screen.` : '') +
        (note ? `\n\nWhat ${who} asks of all their agents: ${note}` : '');
    },
    idleCompact: '/compact Keep what is needed to go on without explaining anything again: where things stand (branch, uncommitted files), each decision and why, what the user asked for or refused in their own words, what is left to do, the key files and the pitfalls already met.',
    /** another session named by "@" in the user's message */
    mention: (mention: string, name: string, folder: string) => `@${mention}: the Open Space session "${name}"${mention === name ? '' : `, tagged "${mention}"`} (folder ${folder}). To write to it: SendMessage with to: "${name}".`,
    attached: (paths: readonly string[]) => (paths.length === 1 ? `Attached file: ${paths[0]}` : `Attached files:\n${paths.map((file) => `- ${file}`).join('\n')}`),
    rename: (name: string) => `(Note from Open Space: your name is now "${name}". Keep this name.)\n\n`,
    aside: 'Side question (/btw), asked while you are working: answer briefly, from what is already ' +
      'in the conversation, without using any tool. Your answer does not enter the main conversation.',
    worktree: (worktree: Place) => worktreeNote(worktree),
    intoWorktree: (worktree: Place) => `(Note from Open Space: you moved to another folder. ${worktreeNote(worktree)})\n\n`,
    backHome: (folder: string) => `(Note from Open Space: your branch and its folder are gone. You now work in the project's main folder, ${folder}, with the other sessions.)\n\n`,
    merge: ({ branch, base, root, mainRoot }: { branch: string; base: string; root: string; mainRoot: string }) =>
      `Open Space asks you to merge your branch "${branch}" into "${base}". Work in your own folder only (${root}):\n` +
      `1. Squash all your work into one commit on your branch, with a clear message saying what it brings (git add -A, git reset --soft $(git merge-base ${base} HEAD), then a single git commit).\n` +
      `2. Bring your branch up to date: git rebase ${base}. If there are conflicts, settle them keeping the work of both sides, then git rebase --continue.\n` +
      `3. Run the project's quick checks if it has any (types, lint, short tests) and fix what breaks.\n` +
      `4. Do not merge or push, and do not touch the main folder (${mainRoot}): Open Space moves "${base}" itself at the end of your turn.\n` +
      `End with your folder clean (everything committed), and say in one sentence what the commit holds.`,
    catchUp: (base: string) => `"${base}" moved again during your merge. Do steps 2 and 3 again (git rebase ${base}, the conflicts, the checks), keep a single commit and end with your folder clean.`,
    pullRequest: ({ branch, base, mainRoot }: { branch: string; base: string; mainRoot: string }) =>
      `Open Space asks you to open a pull request for your branch "${branch}" into "${base}": commit what is left, push your branch (git push -u origin ${branch}), ` +
      `then open the PR with gh pr create --base ${base}, a clear title and description. Do not touch the main folder (${mainRoot}). End with the link to the PR.`,
  },
  process: {
    stopped: 'Claude Code stopped.',
    refused: 'Claude Code refused.',
    timedOut: 'Claude Code took too long to answer.',
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
      updated: 'Process released: the next message starts the new version of Claude Code.',
      compacted: 'Process released once the conversation was compacted.',
      moved: 'Process released to change folders.',
    },
    closing: 'This session is closing, try again in a moment.',
    tooMany: (max: number) => `Too many active sessions (${max} at most). Close one.`,
    folderGone: 'This session’s folder is no longer in the allowed roots.',
    uploadsGone: (count: number) => (count > 1 ? `${count} attached files no longer exist: the message went without them. Attach them again.` : 'An attached file no longer exists: the message went without it. Attach it again.'),
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
    duplicateOf: (name: string) => `${name}’s conversation`,
    nothingToDuplicate: 'This session has not said anything yet: nothing to duplicate.',
    logFailed: (name: string, reason: string) => `${name}’s log couldn’t be written (${reason}). It will be reopened on the next event.`,
    stoppingNoStart: 'The server is stopping: no session can start.',
    stoppingNoCreate: 'The server is stopping: no session can be created.',
    claudeMissing: 'Claude Code is not installed on this computer.',
    notFound: 'This session doesn’t exist.',
    alreadyOpen: 'This conversation is already open here.',
    emptyName: 'The name can’t be empty.',
    trustNeeded: 'This folder runs code of its own: confirm first.',
  },
  worktree: {
    preparing: 'Getting the branch ready…',
    preparingRetry: 'The branch is still being prepared, try again in a moment.',
    prepareFailed: (reason: string, name: string, folder: string) => `The branch couldn’t be prepared (${reason}). ${name} stays in ${folder}; your message waits above the field.`,
    notRepo: 'this folder is not in a git repository',
    noBase: 'the main folder is on no branch',
    noCommit: 'the repository has no commit yet',
    unknownBase: (base: string) => `there is no branch “${base}”`,
    notCopied: (name: string) => `The dependencies and .env files of the main folder couldn’t be copied: ${name} will install what is needed.`,
    revived: (branch: string) => `Found the branch “${branch}”: its folder is made again.`,
    folderGone: (branch: string, folder: string) => `The folder of the branch “${branch}” is gone: the session goes on in ${folder}.`,
    waitTurn: (name: string) => `${name} is still working: wait for the end of their turn.`,
    nothingToMerge: 'The branch has nothing new to merge.',
    notIsolated: 'This session does not work on a branch of its own.',
    notOnBranch: (branch: string) => `the folder is not on the branch “${branch}” any more (another branch, or none)`,
    midOperation: 'a rebase, a merge or a cherry-pick is under way in the branch’s folder',
    putAwayFailed: (name: string, reason: string) => `${name}’s branch couldn’t be put away (${reason}). Nothing was removed: the session and its folder stay.`,
    outsideRoots: (folder: string) => `the repository starts above your allowed folders (${folder})`,
    restricted: (name: string) => `The branch runs code (hooks, MCP servers) the main folder does not: ${name} works there without the project’s settings.`,
    mergeBubble: (base: string) => `Merge into ${base}`,
    catchUpBubble: (base: string) => `Catch up with ${base}`,
    prBubble: (base: string) => `Open a PR into ${base}`,
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
    unsupported: 'Opening a terminal only works on macOS and Windows for now.',
    failed: 'The terminal won’t open.',
  },
  trust: {
    entry: (name: string, what: string) => `${name}: ${what}`,
  },
  journal: {
    missing: (name: string) => `The note ${name} is no longer in the whiteboard’s folder.`,
    badName: (name: string) => `"${name}" can’t be a whiteboard note.`,
    tooBig: 'This note is too long for the whiteboard (1 MB at most).',
    taken: (name: string) => `A note is already called ${name}.`,
  },
  metrics: {
    tooBig: 'The numbers file is too long for the screen (1 MB at most).',
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
