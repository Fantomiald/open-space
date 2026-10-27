// The browser-side state of Open Space: connection, sessions, the log of the followed session,
// slash commands and UI selection. Server messages go through `receive`; user actions through the `send` set by net/connection.ts.
import { create } from 'zustand';
import { browserId, type BrowserState } from '../../shared/browser.ts';
import { isRunning } from './labels.ts';
import { wentToPage } from './pip.ts';
import type { ClaudeDefaults } from '../../shared/claude-settings.ts';
import { setClockFormat } from '../lib/format.ts';
import type { Festival } from '../../shared/festivals.ts';
import { languageOf, type Language } from '../../shared/i18n.ts';
import type { Job } from '../../shared/jobs.ts';
import type { TerminalChoice } from '../../shared/terminal.ts';
import { DEFAULT_PET } from '../../shared/pets.ts';
import type { Look } from '../../shared/look.ts';
import type { MusicApp, MusicTrack, NowPlaying } from '../../shared/music.ts';
import type { AppUpdate, Aside, BranchRow, FolderRepo, ClaudeAccount, ClaudeInfo, ClaudeUpdate, ClientMessage, MetricsFile, Note, NoteFile, NoteMatch, Preferences, RootSuggestion, Conversation, CrewMember, FolderCode, ImageUpload, ContextUsage, InspectView, LoggedEvent, McpServer, UsageReport, PermissionDecision, SearchHit, Quota, ServerMessage, SessionChanges, SessionInfo, SessionOptions, SlashCommand, ModelChoice } from '../../shared/protocol.ts';
import type { CostReport } from '../../shared/usage.ts';
import { chime, errorChime, sampleChime } from '../lib/chime.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { keepDrafts, writeDraft } from './drafts.ts';
import { language as initialLanguage, setLanguage } from '../i18n/index.ts';
import { appendLive, mergeLog } from './log.ts';
import { addTo, fitColumns, FOCUS_TILING, maxColumns, moveIn, nextFocus, removeFrom, replaceIn, retile, ROOM_TILING, type Columns, type DropSlot } from './stack.ts';
import { afterEvent, withPartial, type Partials } from './partials.ts';
import { keepSizes, sanitizeWindows, withoutWindow, type Arrangement, type FreeLayout, type GridSizes, type WindowMode, type WindowsPreference } from './windows.ts';
import type { Box } from './room-frame.ts';
import { attentionQueue, newlyWaiting, type SeenSequences } from './queue.ts';
import { projectOf } from './projects.ts';
import { announceSpeech, answerSpeech, earlySpeech, replySpeech, speechOf } from './speech.ts';

/** The open windows, kept in this browser so a reload finds them as they were. */
const readLayout = () => readPreference<{ columns: string[][]; selectedId: string } | null>('layout', null);
const writeLayout = (columns: Columns, selectedId: string | null) => writePreference('layout', columns.length && selectedId ? { columns, selectedId } : null);

/** stopped: the bridge does not answer; unpaired: it answers but this browser has no valid session cookie */
export type Connection = 'connecting' | 'live' | 'stopped' | 'unpaired';
/** The office, the break room, or focus mode: the sessions listed beside their windows, without the room. */
export type View = 'salle' | 'repos' | 'focus';

export const tilingOf = (view: View) => (view === 'focus' ? FOCUS_TILING : ROOM_TILING);
export const arrangementOf = (view: View): Arrangement => (view === 'focus' ? 'focus' : 'room');
export type { Arrangement };

const savedWindows = sanitizeWindows(readPreference('windows', null));
const writeWindows = (state: CommandPostState) =>
  writePreference('windows', { mode: state.windowMode, free: state.free, sizes: state.gridSizes, stackWidth: state.stackWidth } satisfies WindowsPreference);
export const maxColumnsIn = (view: View) => maxColumns(window.innerWidth, tilingOf(view));

/** The parts of the settings dialog, in the order of its menu. */
export const SETTINGS_SECTIONS = ['general', 'sessions', 'claude', 'folders', 'office', 'notes', 'usage', 'shortcuts', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The latest search sent over every session's thread: only its answer is kept. */
let searchId = 0;

export interface Toast { id: number; kind: 'info' | 'error'; text: string }

/** What the palette or the "new session" dialog starts with. */
/** What the launcher starts with: a command in its field, someone of the crew to take it (a click on a visitor). */
/** `resumeIn`: the launcher opens on that folder's conversations (/resume) */
export interface NewSessionDraft { command?: string; person?: string; resumeIn?: string }

/** What the session panel shows under its header: the conversation, what the session changed, its browser, or one of the views of Claude Code. */
export type PanelView = 'thread' | 'changes' | 'browser' | InspectView;
/** A browser of a session (its own: lane 0, or one of its testers'), shown in the floating window over the office. */
export interface PipTarget { sessionId: string; lane: number }
/** The answers to the views of Claude Code of a session, as last asked for. */
export interface Inspections { mcp?: McpServer[]; context?: ContextUsage; usage?: UsageReport }

interface CommandPostState {
  connection: Connection;
  claude: ClaudeInfo | null;
  roots: string[];
  /** the people sessions are named after, with their look; one of them is the user (`self`) */
  crew: CrewMember[];
  crewOpen: boolean;
  settingsOpen: boolean;
  /** the part of the settings shown */
  settingsSection: SettingsSection;
  /** the row of the settings to bring into view and light up (picked in the search palette) */
  settingsRow: string | null;
  /** what Claude Code spent on this computer, as last read (null: not asked for yet) */
  costs: CostReport | null;
  /** the search over every session's thread: its latest answer, for `query` */
  searchResults: { id: number; query: string; hits: SearchHit[] } | null;
  /** the whiteboard's notes are open (a click on the whiteboard of the room) */
  boardOpen: boolean;
  /** the journal folder and its notes, as last listed */
  notes: { folder: string; files: NoteFile[] } | null;
  /** the whiteboard's search: what was looked for, and the notes found */
  noteMatches: { query: string; matches: NoteMatch[] } | null;
  /** the last note the server sent: read, saved, or refused because it changed on the disk (see the 'note' message) */
  lastNote: { note: Note; outcome: 'read' | 'saved' | 'conflict' } | null;
  /** the numbers panel is open (a click on the numbers object of the room) */
  metricsOpen: boolean;
  /** the numbers file as last read: null when there is none yet, undefined until read */
  metrics: MetricsFile | null | undefined;
  /** the numbers file changed since the page last showed it: a badge on the numbers object */
  metricsUnread: boolean;
  /** the music apps of the computer the radio can drive (none outside macOS) */
  musicApps: MusicApp[];
  /** what the music app the radio drives plays, as last asked for */
  nowPlaying: NowPlaying | null;
  /** Music's playlists and the library's tracks found for `query`, as last asked for */
  musicLibrary: { query: string; playlists: string[]; tracks: MusicTrack[] } | null;
  directories: string[];
  /** what each session changed in its files, as last asked for */
  changes: Record<string, SessionChanges>;
  /** the sessions' browsers that are running, by browserId: their own and their testers' (see server/browser.ts) */
  browsers: Record<string, BrowserState>;
  /** a Chrome to launch was found on the computer */
  browserAvailable: boolean;
  /** the browser each session's panel shows, when not its own */
  browserLanes: Record<string, number>;
  /** the browser floating over the office, kept in this browser across reloads */
  pip: PipTarget | null;
  /** sessions whose floating browser the user closed: it does not come back by itself before their turn ends */
  pipDismissed: string[];
  /** the views of Claude Code answered so far, by session */
  inspections: Record<string, Inspections>;
  /** what the open session's panel shows (back to the conversation when another session opens) */
  panelView: PanelView;
  /** the Claude Code conversations found for a folder, to resume one (the last folder asked for) */
  conversations: { cwd: string; list: Conversation[] } | null;
  /** what each folder asked for by the launcher is in git (null: not in a repository) */
  folderRepos: Record<string, FolderRepo | null>;
  /** the branches panel: the folder whose repository it shows (null: closed), and the branches of each folder asked for */
  branchesFor: string | null;
  branchLists: Record<string, { root: string; rows: BranchRow[]; failed?: string[] }>;
  /** the "ready to merge" cards put off with "Later", by session: the state of the branch then (kept in this browser) */
  branchSnoozes: Record<string, string>;
  openBranches: (cwd: string | null) => void;
  snoozeBranch: (sessionId: string, signature: string) => void;
  sessions: Record<string, SessionInfo>;
  /** events of the sessions being followed (selected ones), by session id */
  logs: Record<string, LoggedEvent[]>;
  /** sessions whose log answer has arrived (before that the log is empty because unknown, not because empty) */
  logLoaded: Record<string, boolean>;
  /** the messages still being written, in every session */
  partials: Partials;
  /** each session's side question (/btw) and its answer, while it is shown */
  asides: Record<string, Aside>;
  /** the commands of no folder in particular, then those of each session folder (its own included) */
  commands: SlashCommand[];
  folderCommands: Record<string, SlashCommand[]>;
  /** the models Claude Code offers, with their efforts (empty until it was asked) */
  models: ModelChoice[];
  quota: Quota | null;
  /** the session the keyboard, the palette and the panel's views go to: one of `openIds`, or null when none is open */
  selectedId: string | null;
  /** the sessions shown over the room, in columns of three from the right (a click opens one beside the others, see stack.ts) */
  columns: Columns;
  /** `columns`, flat */
  openIds: string[];
  /** one of several open sessions shown alone for a while, the others kept in their place (as tmux's zoom) */
  zoomedId: string | null;
  /** Tab: the open sessions stay open but step aside, to see and click the room */
  stackHidden: boolean;
  /** the grid's columns and rows resized by hand, for each arrangement (null: shared out evenly) */
  gridSizes: Record<Arrangement, GridSizes | null>;
  /** the width of the windows over the room pulled by hand, in fractions of the page's (null: as many columns as they need) */
  stackWidth: number | null;
  /** the windows of each arrangement in the grid, or placed by hand */
  windowMode: Record<Arrangement, WindowMode>;
  /** where the windows placed by hand are, by arrangement */
  free: Record<Arrangement, FreeLayout>;
  /** the mode asked for in the header, which the stack applies (it knows where the windows are on the screen) */
  windowModeRequest: WindowMode | null;
  view: View;
  /** the folder whose sessions the header's filter keeps in sight ('' = all): the others are ghosts in the room, out of the list */
  project: string;
  /** false until the user changes room: they then come in through the door instead of sitting at their desk */
  enteredThroughDoor: boolean;
  /** the user's settings (kept by the server) */
  preferences: Preferences;
  /** the language the page is shown in: the one chosen in the settings, else the browser's (the App is mounted again when it changes) */
  language: Language;
  /** false until the user went through the first start: the onboarding shows */
  onboarded: boolean;
  /** the folders are set by OFFICE_ROOTS: the page cannot change them */
  rootsLocked: boolean;
  /** what Claude Code runs with where Open Space sets nothing, and its output styles */
  claudeDefaults: ClaudeDefaults;
  /** where the last `claude update` asked from the page is (null: none since the page opened) */
  claudeUpdate: ClaudeUpdate | null;
  /** who Claude Code is signed in as (null until the server has asked it) */
  claudeAccount: ClaudeAccount | null;
  /** a new Open Space the Mac app found (null outside the app, or when there is none) */
  appUpdate: AppUpdate | null;
  /** folders offered at the onboarding, once asked for */
  rootSuggestions: RootSuggestion[] | null;
  terminals: TerminalChoice[];
  /** changes some of the settings (the server keeps them and tells every tab) */
  setPreferences: (changes: Partial<Preferences>) => boolean;
  /** a ding when a session finishes or needs the user */
  sound: boolean;
  paletteOpen: boolean;
  /** what the search palette's field starts with ("/" for the commands) */
  paletteQuery: string;
  /** a session asked for in a folder that runs code of its own and was never trusted, waiting for the user's answer */
  trustRequest: { cwd: string; code: FolderCode; options: SessionOptions } | null;
  /** the search bar of the open session's thread */
  searchOpen: boolean;
  /** what the thread's search bar starts with (a match picked in the search palette), '' for nothing */
  searchSeed: string;
  /** what the room shows instead of today's festival (null: none) and the hour now, to try them; undefined: the real ones */
  preview: { festival?: Festival | null; hour?: number };
  setPreview: (preview: { festival?: Festival | null; hour?: number }) => void;
  newSession: NewSessionDraft | null;
  /** focus mode: the launcher shown as one more window beside the open sessions, rather than in their place */
  launcherOpen: boolean;
  toasts: Toast[];
  /** a session was asked for: the next unknown one that appears gets selected */
  awaitingNew: boolean;
  /** what the user has already seen of each session (kept in localStorage) */
  seen: SeenSequences;
  /** false when the message could not leave (not connected) */
  send: (message: ClientMessage) => boolean;

  receive: (message: ServerMessage) => void;
  /** opens this session alone (null: none) */
  select: (sessionId: string | null) => void;
  /**
   * a click on a session: brought forward if it is open, else shown in place of the one the keyboard is in (in focus
   * mode, beside the open ones while there is room)
   */
  show: (sessionId: string) => void;
  /** Adds the session beside the open ones (nothing when there is no room left), or takes it out */
  toggleOpen: (sessionId: string) => void;
  zoom: (sessionId: string | null) => void;
  /** one of the open sessions takes the keyboard (the user clicked in it) */
  focus: (sessionId: string) => void;
  /** takes one of the open sessions out */
  closeOpen: (sessionId: string) => void;
  /** sets the open windows (stack.ts makes them), kept for the next visit */
  arrange: (columns: Columns) => void;
  /** a window dragged to another place of the grid */
  moveWindow: (sessionId: string, to: DropSlot) => void;
  /** the grid of the current arrangement resized by hand */
  resizeGrid: (sizes: GridSizes | null) => void;
  setStackWidth: (width: number | null) => void;
  requestWindowMode: (mode: WindowMode | null) => void;
  /** the windows of the current arrangement leave the grid, each where it was (boxes in fractions of their area) */
  freeWindows: (boxes: Record<string, Box>) => void;
  /** the windows placed by hand go back to the grid, in the order given */
  tidyWindows: (columns: Columns) => void;
  /** a window placed by hand moved or resized (in fractions of its area); it comes to the front */
  placeWindow: (sessionId: string, box: Box) => void;
  raiseWindow: (sessionId: string) => void;
  hideStack: (hidden: boolean) => void;
  /** after the window shrank: the column that no longer fits closes */
  fitOpen: () => void;
  /** shows a view in the open session's panel; one of Claude Code's is asked for at once */
  showPanel: (view: PanelView) => void;
  showBrowserLane: (sessionId: string, lane: number) => void;
  /** takes a browser out of its session's window, which goes back to the conversation */
  openPip: (target: PipTarget) => void;
  closePip: () => void;
  /** closed by the user: it stays closed while that session's turn goes on */
  dismissPip: () => void;
  /** puts the floating browser back in its session's window */
  dockPip: () => void;
  /** the user is looking at this session: what it shows now is no longer news */
  markSeen: (sessionId: string) => void;
  setView: (view: View) => void;
  setProject: (project: string) => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
  openPalette: (open: boolean, query?: string) => void;
  openSearch: (open: boolean, seed?: string) => void;
  /** asks the server for the events of every session that hold `query` */
  searchThreads: (query: string) => void;
  /** asks for what Claude Code spent (`fresh`: read its transcripts again now) */
  loadCosts: (fresh?: boolean) => void;
  openCrew: (open: boolean) => void;
  openSettings: (open: boolean, section?: SettingsSection, row?: string) => void;
  /** runs `claude update` on the server */
  updateClaude: () => void;
  /** runs `claude auth login` (the browser opens) or `claude auth logout` on the server */
  claudeLogin: () => void;
  claudeLogout: () => void;
  /** lets the waiting sessions on an older Claude Code go, so that their next message starts the new one */
  restartOutdated: () => void;
  /** restarts the Mac app on the new Open Space it downloaded */
  restartApp: () => void;
  /** asks the Mac app to look for a new Open Space now */
  checkApp: () => void;
  openBoard: (open: boolean) => void;
  /** opening it reads the numbers file, which clears the badge */
  openMetrics: (open: boolean) => void;
  /** false when the message could not leave (not connected) */
  /** `birthday`: "MM-DD", or undefined for none */
  saveMember: (previousName: string | null, name: string, look: Look, birthday?: string, jobs?: readonly Job[]) => boolean;
  removeMember: (name: string) => boolean;
  /** someone of the crew becomes the user (their perso in the room) */
  becomeSelf: (name: string) => boolean;
  openNewSession: (draft: NewSessionDraft | null) => void;
  closeLauncher: () => void;
  toast: (kind: Toast['kind'], text: string) => void;

  /** false when the message could not leave (too long, not connected): the Launcher then keeps what was typed */
  createSession: (options: SessionOptions) => boolean;
  /** a new session going on from this one's conversation; it opens like a new one */
  duplicateSession: (sessionId: string) => void;
  /** opens a terminal on the computer, in the folder of the session (the server finds it); without one, in the default folder */
  openTerminal: (sessionId?: string | null) => void;
  /** the user's answer to `trustRequest`: trust the folder, run without its settings, or give up (null) */
  answerTrust: (choice: 'folder' | 'restricted' | null) => void;
  /** a message to a session, with the pictures attached to it */
  sendText: (sessionId: string, text: string, images?: ImageUpload[], files?: string[]) => boolean;
  answerPermission: (sessionId: string, requestId: string, decision: PermissionDecision) => boolean;
  answerQuestions: (sessionId: string, requestId: string, answers: Record<string, string>) => boolean;
}

let toastId = 0;
/** the last session asked for: asked again with the user's answer when its folder needs trusting */
let lastCreate: SessionOptions | null = null;

/** After an answer, every answer button ignores clicks this long: a double click must not answer the next request, in this session or another. */
export const ANSWER_GUARD_MS = 400;
let lastAnswerAt = 0;
function answerAllowed(): boolean {
  const now = Date.now();
  if (now - lastAnswerAt < ANSWER_GUARD_MS) return false;
  lastAnswerAt = now;
  return true;
}

const isVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible';

/** The language of the settings, or the browser's: the words are switched before the page renders again. */
function languageState(preferences: Preferences): { language: Language } {
  const language = preferences.language ?? languageOf(navigator.languages);
  setLanguage(language);
  setClockFormat(preferences.timeFormat ?? 'auto');
  return { language };
}

export const useSessions = create<CommandPostState>((set, get) => ({
  connection: 'connecting',
  claude: null,
  roots: [],
  crew: [],
  crewOpen: false,
  settingsOpen: false,
  settingsSection: 'general',
  settingsRow: null,
  costs: null,
  searchResults: null,
  boardOpen: false,
  notes: null,
  noteMatches: null,
  lastNote: null,
  metricsOpen: false,
  metrics: undefined,
  metricsUnread: false,
  musicApps: [],
  nowPlaying: null,
  musicLibrary: null,
  directories: [],
  changes: {},
  browsers: {},
  browserAvailable: false,
  browserLanes: {},
  pip: readPreference<PipTarget | null>('pip', null),
  pipDismissed: [],
  inspections: {},
  panelView: 'thread',
  conversations: null,
  folderRepos: {},
  branchesFor: null,
  branchLists: {},
  branchSnoozes: readPreference<Record<string, string>>('branchSnoozes', {}),
  sessions: {},
  logs: {},
  logLoaded: {},
  partials: {},
  asides: {},
  commands: [],
  folderCommands: {},
  models: [],
  quota: null,
  selectedId: null,
  columns: [],
  openIds: [],
  zoomedId: null,
  stackHidden: false,
  gridSizes: savedWindows.sizes,
  stackWidth: savedWindows.stackWidth,
  windowMode: savedWindows.mode,
  free: savedWindows.free,
  windowModeRequest: null,
  // 'bureau' (the old pixel office) and anything unknown open the meeting room
  view: (['repos', 'focus'] as const).find((view) => view === readPreference<string>('view', 'salle')) ?? 'salle',
  project: readPreference('project', ''),
  enteredThroughDoor: false,
  // the server's setting, given with its hello
  // the server's settings, given with its hello
  preferences: { notifications: true, roots: [], defaultFolder: '', model: '', permissionMode: 'auto', agentNote: '', festivals: true, officeLife: true, theme: 'office', pet: DEFAULT_PET, journalFolder: '', favoriteNotes: [], metricsFile: '', copyOnSelect: false, autoPip: true, effort: '', claude: {}, timeFormat: 'auto', timestamps: false, turnDuration: true, reduceMotion: false, idleCompact: 0, isolate: 'busy', autoTag: false },
  onboarded: true,
  language: initialLanguage,
  rootsLocked: false,
  claudeDefaults: { current: {}, outputStyles: [] },
  claudeUpdate: null,
  claudeAccount: null,
  appUpdate: null,
  rootSuggestions: null,
  terminals: [],
  sound: readPreference('sound', true),
  paletteOpen: false,
  paletteQuery: '',
  trustRequest: null,
  searchOpen: false,
  searchSeed: '',
  preview: {},
  newSession: null,
  launcherOpen: false,
  toasts: [],
  awaitingNew: false,
  seen: readPreference<SeenSequences>('seen', {}),
  send: () => false,

  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 8000 : 4500);
  },

  receive: (message) => {
    const s = get();
    switch (message.t) {
      case 'hello': {
        const sessions = Object.fromEntries(message.sessions.map((session) => [session.id, session]));
        keepDrafts(Object.keys(sessions));
        // the browser's language becomes the setting until the user picks one: the server speaks it too
        if (!message.preferences.language) s.send({ t: 'preferences', preferences: { language: languageOf(navigator.languages) } });
        set({
          ...languageState(message.preferences),
          claude: message.claude, roots: message.roots, crew: message.crew, sessions, commands: message.commands, // a server started before these existed does not send them
          folderCommands: message.folderCommands ?? {}, models: message.models ?? [], quota: message.quota,
          preferences: message.preferences, onboarded: message.onboarded, rootsLocked: message.rootsLocked, claudeDefaults: message.claudeDefaults, appUpdate: message.appUpdate,
          browsers: message.browsers ?? {}, browserAvailable: message.browserAvailable ?? false,
        });
        // after a reconnection the windows stay; after a reload they come back as they were
        const kept = s.selectedId && sessions[s.selectedId] ? { columns: s.columns, selectedId: s.selectedId } : s.selectedId ? null : readLayout();
        const columns = (kept?.columns ?? []).map((column) => column.filter((id) => sessions[id])).filter((column) => column.length > 0);
        get().arrange(columns);
        const focused = kept && sessions[kept.selectedId] ? kept.selectedId : columns[0]?.[0];
        if (focused) get().focus(focused);
        else set({ selectedId: null });
        // resynchronise the followed sessions: ask for what was missed while disconnected
        for (const id of Object.keys(s.logs)) {
          if (sessions[id]) s.send({ t: 'log', sessionId: id, after: s.logs[id].at(-1)?.seq ?? 0 });
        }
        break;
      }
      case 'session': {
        const previous = s.sessions;
        set({ sessions: { ...previous, [message.session.id]: message.session } });
        if (s.awaitingNew && !previous[message.session.id]) {
          // a new session with several open joins them when there is room, else takes the place of the one in use
          // in focus mode it opens where the launcher's window was (the same place in the grid) and that window closes
          set({ awaitingNew: false, launcherOpen: false });
          // started in another project than the one in sight: the filter follows it, so it does not arrive as a ghost
          const project = projectOf(message.session);
          if (s.project && s.project !== project) get().setProject(project);
          const fits = s.openIds.length > 1 && addTo(s.columns, message.session.id, maxColumnsIn(s.view), tilingOf(s.view));
          if (fits) get().toggleOpen(message.session.id);
          else get().show(message.session.id);
        }
        // only the window the user is in: another open one that finishes still rings and waits to be seen
        if (s.selectedId === message.session.id && isVisible()) get().markSeen(message.session.id);
        const waiting = newlyWaiting(previous, [message.session], get().seen);
        if (s.sound) chime(waiting);
        if (s.sound && previous[message.session.id] && previous[message.session.id].state !== 'error' && message.session.state === 'error') errorChime();
        break;
      }
      case 'preferences': set({ ...languageState(message.preferences), preferences: message.preferences, roots: message.roots, onboarded: message.onboarded, claudeDefaults: message.claudeDefaults }); break;
      case 'rootSuggestions': set({ rootSuggestions: message.suggestions }); break;
      case 'terminals': set({ terminals: message.choices }); break;
      case 'trustNeeded': if (lastCreate) set({ trustRequest: { cwd: message.cwd, code: message.code, options: lastCreate } }); break;
      case 'forgotten': {
        const { [message.sessionId]: _removed, ...sessions } = s.sessions;
        const { [message.sessionId]: _log, ...logs } = s.logs;
        const { [message.sessionId]: _seen, ...seen } = s.seen;
        writePreference('seen', seen);
        if (s.branchSnoozes[message.sessionId]) {
          const { [message.sessionId]: _snooze, ...branchSnoozes } = s.branchSnoozes;
          writePreference('branchSnoozes', branchSnoozes);
          set({ branchSnoozes });
        }
        writeDraft(message.sessionId, '');
        set({ sessions, logs, seen, free: withoutWindow(s.free, message.sessionId) });
        writeWindows(get());
        if (s.openIds.includes(message.sessionId)) get().closeOpen(message.sessionId);
        break;
      }
      case 'aside': {
        const { [message.sessionId]: _old, ...asides } = s.asides;
        set({ asides: message.aside ? { ...asides, [message.sessionId]: message.aside } : asides });
        break;
      }
      case 'partial': {
        const speech = earlySpeech(message.sessionId, message.who, message.text);
        if (speech) announceSpeech(speech);
        set({ partials: withPartial(s.partials, message.sessionId, message.who, message.text) });
        break;
      }
      case 'ev': {
        const speech = speechOf(message.sessionId, message.ev);
        if (speech) announceSpeech(speech);
        const partials = afterEvent(s.partials, message.sessionId, message.ev);
        if (partials !== s.partials) set({ partials });
        const current = s.logs[message.sessionId];
        if (!current) break;
        const result = appendLive(current, { seq: message.seq, at: message.at, ev: message.ev });
        if (result.kind === 'appended') set({ logs: { ...s.logs, [message.sessionId]: result.log } });
        else if (result.kind === 'gap' && s.logLoaded[message.sessionId]) s.send({ t: 'log', sessionId: message.sessionId, after: result.after });
        break;
      }
      case 'log':
        if (!s.logs[message.sessionId]) break;
        set({
          logs: { ...s.logs, [message.sessionId]: mergeLog(s.logs[message.sessionId], message.events) },
          logLoaded: { ...s.logLoaded, [message.sessionId]: true },
        });
        break;
      case 'commands': set({ commands: message.commands }); break;
      case 'folderCommands': set({ folderCommands: { ...s.folderCommands, [message.cwd]: message.commands } }); break;
      case 'models': set({ models: message.models }); break;
      case 'directories': set({ directories: message.directories }); break;
      case 'claude': set({ claude: message.claude }); break;
      case 'claudeUpdate': set({ claudeUpdate: message.update }); break;
      case 'claudeAccount': set({ claudeAccount: message.account }); break;
      case 'appUpdate': set({ appUpdate: message.update }); break;
      case 'changes': set({ changes: { ...s.changes, [message.sessionId]: message.changes } }); break;
      case 'browser': {
        const id = browserId(message.sessionId, message.lane);
        const { [id]: _closed, ...browsers } = s.browsers;
        set({ browsers: message.browser ? { ...browsers, [id]: message.browser } : browsers });
        // a tester takes its browser to a page while it is out of sight: it floats over the office. A session's own agent
        // only lights its globe: it mostly checks the pages it writes, which is not worth a window.
        const session = s.sessions[message.sessionId];
        const testing = message.lane > 0;
        const dismissed = s.pipDismissed.includes(message.sessionId) && session && isRunning(session);
        const inView = s.selectedId === message.sessionId && s.panelView === 'browser';
        if (s.preferences.autoPip && testing && !s.pip && !dismissed && !inView && session && wentToPage(s.browsers[id], message.browser)) get().openPip({ sessionId: message.sessionId, lane: message.lane });
        // its browser closed: nothing left to float
        if (!message.browser && s.pip && browserId(s.pip.sessionId, s.pip.lane) === id) get().closePip();
        break;
      }
      case 'inspection': {
        const { inspection } = message;
        const answer: Inspections = inspection.view === 'mcp' ? { mcp: inspection.servers } : inspection.view === 'context' ? { context: inspection.usage } : { usage: inspection.report };
        set({ inspections: { ...s.inspections, [message.sessionId]: { ...s.inspections[message.sessionId], ...answer } } });
        break;
      }
      case 'conversations': set({ conversations: { cwd: message.cwd, list: message.conversations } }); break;
      case 'folderInfo': set({ folderRepos: { ...s.folderRepos, [message.cwd]: message.repo } }); break;
      case 'branches': set({ branchLists: { ...s.branchLists, [message.cwd]: { root: message.root, rows: message.branches, ...(message.failed ? { failed: message.failed } : {}) } } }); break;
      case 'crew': set({ crew: message.crew }); break;
      case 'quota': set({ quota: message.quota }); break;
      case 'notes': set({ notes: { folder: message.folder, files: message.files } }); break;
      case 'note': set({ lastNote: { note: message.note, outcome: message.outcome } }); break;
      case 'noteMatches': set({ noteMatches: { query: message.query, matches: message.matches } }); break;
      case 'metrics': set({ metrics: message.metrics }); break;
      case 'metricsStatus': set({ metricsUnread: message.unread }); break;
      case 'musicApps': set({ musicApps: message.apps }); break;
      case 'music': set({ nowPlaying: message.nowPlaying }); break;
      case 'musicLibrary': set({ musicLibrary: { query: message.query, playlists: message.playlists, tracks: message.tracks } }); break;
      // an answer to an older query, overtaken by the one typed since, is dropped
      case 'searchResults': if (message.id === searchId) set({ searchResults: { id: message.id, query: message.query, hits: message.hits } }); break;
      case 'costs': set({ costs: message.report }); break;
      case 'toast': s.toast(message.kind, message.text); break;
    }
  },

  select: (sessionId) => {
    set({ stackHidden: false });
    get().arrange(sessionId ? [[sessionId]] : []);
    if (sessionId) get().focus(sessionId);
    else set({ selectedId: null, searchOpen: false, panelView: 'thread' });
  },

  show: (sessionId) => {
    const s = get();
    set({ stackHidden: false });
    if (s.openIds.includes(sessionId)) { if (s.zoomedId && s.zoomedId !== sessionId) s.zoom(null); s.focus(sessionId); return; }
    const beside = s.selectedId && addTo(s.columns, sessionId, maxColumnsIn(s.view), tilingOf(s.view));
    if (beside) { set({ zoomedId: null }); s.arrange(beside); s.focus(sessionId); return; }
    if (s.openIds.length < 2 || !s.selectedId) { s.select(sessionId); return; }
    set({ zoomedId: null });
    s.arrange(replaceIn(s.columns, s.selectedId, sessionId));
    s.focus(sessionId);
  },

  toggleOpen: (sessionId) => {
    const s = get();
    if (!s.selectedId) { s.select(sessionId); return; }
    set({ stackHidden: false });
    if (s.openIds.includes(sessionId)) {
      if (s.openIds.length > 1) s.closeOpen(sessionId);
      return;
    }
    const columns = addTo(s.columns, sessionId, maxColumnsIn(s.view), tilingOf(s.view));
    if (!columns) return;
    set({ zoomedId: null });
    s.arrange(columns);
    s.focus(sessionId);
  },

  zoom: (sessionId) => set({ zoomedId: sessionId && get().openIds.length > 1 ? sessionId : null }),

  focus: (sessionId) => {
    const s = get();
    if (sessionId !== s.selectedId) set({ selectedId: sessionId, searchOpen: false, panelView: 'thread' });
    s.markSeen(sessionId);
    writeLayout(get().columns, sessionId);
    if (!s.logs[sessionId]) {
      set({ logs: { ...s.logs, [sessionId]: [] }, logLoaded: { ...s.logLoaded, [sessionId]: false } });
      s.send({ t: 'log', sessionId, after: 0 });
    }
  },

  closeOpen: (sessionId) => {
    const s = get();
    const next = s.selectedId === sessionId ? nextFocus(s.columns, sessionId) : s.selectedId;
    s.arrange(removeFrom(s.columns, sessionId, tilingOf(s.view)));
    if (next) s.focus(next);
    else s.select(null);
  },

  arrange: (columns) => {
    const openIds = columns.flat();
    const arrangement = arrangementOf(get().view);
    set((state) => ({
      gridSizes: { ...state.gridSizes, [arrangement]: keepSizes(state.columns, columns, state.gridSizes[arrangement]) },
      columns, openIds, zoomedId: state.zoomedId && openIds.includes(state.zoomedId) && openIds.length > 1 ? state.zoomedId : null,
      launcherOpen: state.launcherOpen && openIds.length > 0,
    }));
    writeLayout(columns, get().selectedId);
    writeWindows(get());
  },

  moveWindow: (sessionId, to) => {
    const s = get();
    s.arrange(moveIn(s.columns, sessionId, to, maxColumnsIn(s.view), tilingOf(s.view)));
  },

  resizeGrid: (sizes) => {
    set((state) => ({ gridSizes: { ...state.gridSizes, [arrangementOf(state.view)]: sizes } }));
    writeWindows(get());
  },

  setStackWidth: (width) => {
    set({ stackWidth: width });
    writeWindows(get());
  },

  requestWindowMode: (mode) => set({ windowModeRequest: mode }),

  freeWindows: (boxes) => {
    const arrangement = arrangementOf(get().view);
    set((state) => ({
      windowMode: { ...state.windowMode, [arrangement]: 'free' }, windowModeRequest: null,
      free: { ...state.free, [arrangement]: { boxes: { ...state.free[arrangement].boxes, ...boxes }, order: state.openIds.filter((id) => boxes[id]) } },
    }));
    writeWindows(get());
  },

  tidyWindows: (columns) => {
    const arrangement = arrangementOf(get().view);
    get().arrange(columns);
    set((state) => ({ windowMode: { ...state.windowMode, [arrangement]: 'grid' }, windowModeRequest: null }));
    writeWindows(get());
  },

  placeWindow: (sessionId, box) => {
    const arrangement = arrangementOf(get().view);
    set((state) => {
      const { boxes, order } = state.free[arrangement];
      return { free: { ...state.free, [arrangement]: { boxes: { ...boxes, [sessionId]: box }, order: [...order.filter((id) => id !== sessionId), sessionId] } } };
    });
    writeWindows(get());
  },

  raiseWindow: (sessionId) => {
    const arrangement = arrangementOf(get().view);
    const { boxes, order } = get().free[arrangement];
    if (order.at(-1) === sessionId || !boxes[sessionId]) return;
    set((state) => ({ free: { ...state.free, [arrangement]: { boxes, order: [...order.filter((id) => id !== sessionId), sessionId] } } }));
    writeWindows(get());
  },

  hideStack: (hidden) => set({ stackHidden: hidden && get().openIds.length > 0 }),

  fitOpen: () => {
    const s = get();
    const max = maxColumnsIn(s.view), tiling = tilingOf(s.view);
    const columns = fitColumns(s.columns, max, tiling);
    if (JSON.stringify(columns) === JSON.stringify(s.columns)) return;
    for (const id of s.openIds.filter((id) => !columns.flat().includes(id))) s.closeOpen(id);
    get().arrange(fitColumns(get().columns, max, tiling));
  },

  showPanel: (view) => {
    const s = get();
    set({ panelView: view });
    if (s.selectedId && view !== 'thread' && view !== 'changes' && view !== 'browser') s.send({ t: 'inspect', sessionId: s.selectedId, view });
  },

  showBrowserLane: (sessionId, lane) => set({ browserLanes: { ...get().browserLanes, [sessionId]: lane } }),

  openPip: (target) => {
    const s = get();
    set({ pip: target, pipDismissed: s.pipDismissed.filter((id) => id !== target.sessionId), ...(s.selectedId === target.sessionId && s.panelView === 'browser' ? { panelView: 'thread' } : {}) });
    writePreference('pip', target);
  },

  closePip: () => {
    set({ pip: null });
    writePreference('pip', null);
  },

  dismissPip: () => {
    const { pip, pipDismissed } = get();
    if (pip) set({ pipDismissed: [...pipDismissed.filter((id) => id !== pip.sessionId), pip.sessionId] });
    get().closePip();
  },

  dockPip: () => {
    const s = get();
    if (!s.pip) return;
    const { sessionId, lane } = s.pip;
    s.closePip();
    if (!s.sessions[sessionId]) return;
    s.show(sessionId);
    s.showBrowserLane(sessionId, lane);
    get().showPanel('browser');
  },

  markSeen: (sessionId) => {
    const s = get();
    const session = s.sessions[sessionId];
    if (!session || (s.seen[sessionId] ?? 0) >= session.lastSeq) return;
    const seen = { ...s.seen, [sessionId]: session.lastSeq };
    writePreference('seen', seen);
    set({ seen });
  },

  setProject: (project) => {
    writePreference('project', project);
    set({ project });
  },
  setView: (view) => {
    const s = get();
    writePreference('view', view);
    if (view !== 'focus') set({ launcherOpen: false });
    // from one room to the other the user walks through the door; out of focus mode they are back at their desk
    set({ view, enteredThroughDoor: s.view !== 'focus' && view !== 'focus' ? true : s.enteredThroughDoor });
    if (tilingOf(view) === tilingOf(s.view)) return;
    const columns = retile(s.columns, maxColumnsIn(view), tilingOf(view));
    // the other arrangement keeps the sizes it was given: the windows are laid out again, not changed
    const sizes = s.gridSizes;
    s.arrange(columns);
    set({ gridSizes: sizes });
    writeWindows(get());
    if (s.selectedId && !columns.flat().includes(s.selectedId)) {
      if (columns[0]) s.focus(columns[0][0]);
      else s.select(null);
    }
  },

  toggleSound: () => {
    const sound = !get().sound;
    writePreference('sound', sound);
    set({ sound });
    if (sound) sampleChime();
  },
  // the server keeps the setting and tells every tab (see the 'preferences' message)
  toggleNotifications: () => { get().send({ t: 'preferences', preferences: { notifications: !get().preferences.notifications } }); },
  setPreferences: (changes) => get().send({ t: 'preferences', preferences: changes }),

  openPalette: (open, query = '') => set({ paletteOpen: open, paletteQuery: query }),
  openSearch: (open, seed = '') => set({ searchOpen: open, searchSeed: seed }),
  searchThreads: (query) => { get().send({ t: 'search', id: ++searchId, query }); },
  loadCosts: (fresh) => { get().send({ t: 'costs', ...(fresh ? { fresh } : {}) }); },
  setPreview: (preview) => set({ preview }),
  openCrew: (open) => set({ crewOpen: open }),
  updateClaude: () => { get().send({ t: 'updateClaude' }); },
  claudeLogin: () => { get().send({ t: 'claudeLogin' }); },
  claudeLogout: () => { get().send({ t: 'claudeLogout' }); },
  restartOutdated: () => { get().send({ t: 'restartOutdated' }); },
  restartApp: () => { get().send({ t: 'restartApp' }); },
  checkApp: () => { get().send({ t: 'checkApp' }); },
  // opened without a section: from the top (General), not where they were last left
  openSettings: (open, section, row) => set((state) => ({ settingsOpen: open, settingsRow: row ?? null, settingsSection: section ?? (open && !state.settingsOpen ? 'general' : state.settingsSection) })),
  openBoard: (open) => set({ boardOpen: open, ...(open ? {} : { lastNote: null }) }),
  openMetrics: (open) => {
    set({ metricsOpen: open, metrics: undefined });
    if (open) get().send({ t: 'metrics' });
  },
  saveMember: (previousName, name, look, birthday, jobs = []) => get().send({ t: 'saveMember', previousName, name, look, ...(birthday ? { birthday } : {}), ...(jobs.length ? { jobs: [...jobs] } : {}) }),
  removeMember: (name) => get().send({ t: 'removeMember', name }),
  becomeSelf: (name) => get().send({ t: 'becomeSelf', name }),
  /**
   * The launcher shows when no session is open: a draft closes the open one and goes to the launcher's field. In focus
   * mode the open ones stay, and the launcher opens beside them.
   */
  openNewSession: (draft) => {
    const s = get();
    if (draft && s.view === 'focus' && s.openIds.length) set({ launcherOpen: true, zoomedId: null, stackHidden: false });
    else if (draft) s.select(null);
    set({ newSession: draft });
  },
  closeLauncher: () => set({ launcherOpen: false }),
  openBranches: (cwd) => {
    set({ branchesFor: cwd });
    if (cwd) get().send({ t: 'branches', cwd });
  },
  snoozeBranch: (sessionId, signature) => {
    const branchSnoozes = { ...get().branchSnoozes, [sessionId]: signature };
    writePreference('branchSnoozes', branchSnoozes);
    set({ branchSnoozes });
  },

  openTerminal: (sessionId) => get().send(sessionId ? { t: 'openTerminal', sessionId } : { t: 'openTerminal' }),
  duplicateSession: (sessionId) => { set({ awaitingNew: true }); get().send({ t: 'duplicate', sessionId }); },
  createSession: (options) => {
    if (!get().send({ t: 'create', options })) return false;
    set({ awaitingNew: true });
    lastCreate = options;
    return true;
  },
  answerTrust: (choice) => {
    const request = get().trustRequest;
    set({ trustRequest: null });
    if (!request || !choice) { set({ awaitingNew: false }); return; }
    get().createSession({ ...request.options, trust: choice });
  },
  sendText: (sessionId, text, images, files) => get().send({ t: 'send', sessionId, text, ...(images?.length ? { images } : {}), ...(files?.length ? { files } : {}) }),
  answerPermission: (sessionId, requestId, decision) => {
    const sent = answerAllowed() && get().send({ t: 'answer', sessionId, requestId, decision });
    if (sent) announceSpeech(answerSpeech(sessionId, decision));
    return sent;
  },
  answerQuestions: (sessionId, requestId, answers) => {
    const sent = answerAllowed() && get().send({ t: 'reply', sessionId, requestId, answers });
    if (sent) announceSpeech(replySpeech(sessionId, answers));
    return sent;
  },
}));

/** Sessions waiting for the user and not seen yet, for the tab title. */
export const selectAttentionCount = (state: CommandPostState) => attentionQueue(Object.values(state.sessions), state.seen).length;

/** The commands offered in a session folder (the ones of no folder until it was probed), or with no folder. */
export const commandsIn = (state: Pick<CommandPostState, 'commands' | 'folderCommands'>, cwd?: string): SlashCommand[] => (cwd && state.folderCommands[cwd]) || state.commands;

/** The sessions whose process runs another Claude Code than the one installed (`version`): the next launch takes it. */
export const outdatedSessions = (sessions: readonly SessionInfo[], version: string | undefined) =>
  version ? sessions.filter((session) => session.claudeVersion !== undefined && session.claudeVersion !== version) : [];
export const selectOutdatedCount = (state: CommandPostState) => outdatedSessions(Object.values(state.sessions), state.claude?.version).length;
