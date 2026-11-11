// The browser-side state of Open Space: connection, sessions, the log of the followed session,
// slash commands and UI selection. Server messages go through `receive`; user actions through the `send` set by net/connection.ts.
import { NO_AUTOMATA, type AgentRole, type AutomataState } from '../../shared/automata.ts';
import { NO_TRIGGERS, type TriggerError, type TriggerInput, type TriggersState } from '../../shared/triggers.ts';
import { appendRunEvents, type RunLog } from './automata.ts';
import type { ModInfo, ModSettings } from '../../shared/mods.ts';
import { heardModEnv, heardModStore } from './mods.ts';
import type { SecretEntry } from '../../shared/secrets.ts';
import type { MessengerInput } from '../../shared/messengers.ts';
import { create } from 'zustand';
import { floatsOutOfSight } from './browser.ts';
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
import { startTrip, type PetTrip } from '../room/pet-trip.ts';
import type { Look } from '../../shared/look.ts';
import type { MusicApp, MusicTrack, NowPlaying } from '../../shared/music.ts';
import { GLASS_OPACITY } from '../../shared/protocol.ts';
import type { AppUpdate, Aside, BranchRow, FolderRepo, ClaudeAccount, ClaudeInfo, ClaudeUpdate, ClientMessage, Note, NoteFile, NoteMatch, Preferences, RootSuggestion, Conversation, CrewMember, FolderCode, ImageUpload, ContextUsage, InspectView, LoggedEvent, McpServer, UsageReport, PermissionDecision, SearchHit, Quota, ServerMessage, SessionChanges, SessionInfo, SessionOptions, SlashCommand, ModelChoice } from '../../shared/protocol.ts';
import type { CostReport } from '../../shared/usage.ts';
import { chime, errorChime, sampleChime } from '../lib/chime.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { keepDrafts, writeDraft } from './drafts.ts';
import { language as initialLanguage, setLanguage } from '../i18n/index.ts';
import { appendLive, mergeLog } from './log.ts';
import { addTo, fitColumns, FOCUS_TILING, maxColumns, moveIn, nextFocus, removeFrom, replaceIn, ROOM_TILING, type Columns, type DropSlot } from './stack.ts';
import { afterEvent, withPartial, type Partials } from './partials.ts';
import { keepSizes, sanitizeWindows, withoutWindow, type Arrangement, type FreeLayout, type GridSizes, type WindowsPreference } from './windows.ts';
import { dock, float, modOfSlot, modSlot, modsIn, modsOnly, openSessions, sessionsIn, switchArrangement, tidyAll, unfloat } from './docking.ts';
import type { Box } from './room-frame.ts';
import { attentionQueue, newlyWaiting, type SeenSequences } from './queue.ts';
import { projectOf } from './projects.ts';
import { openOut } from '../net/out.ts';
import { outKey, outSize, outTarget, parseOut, type OutTarget } from './out.ts';
import { announceSpeech, answerSpeech, earlySpeech, replySpeech, speechOf } from './speech.ts';

/** The open windows, kept in this browser so a reload finds them as they were. */
const readLayout = () => readPreference<{ columns: string[][]; selectedId: string | null } | null>('layout', null);
const writeLayout = (columns: Columns, selectedId: string | null) => writePreference('layout', columns.length || selectedId ? { columns, selectedId } : null);

/** stopped: the bridge does not answer; unpaired: it answers but this browser has no valid session cookie */
export type Connection = 'connecting' | 'live' | 'stopped' | 'unpaired';
/** The office, the break room, or focus mode: the sessions listed beside their windows, without the room. */
export type View = 'salle' | 'repos' | 'automates' | 'focus';

export const tilingOf = (view: View) => (view === 'focus' ? FOCUS_TILING : ROOM_TILING);
export const arrangementOf = (view: View): Arrangement => (view === 'focus' ? 'focus' : 'room');
export type { Arrangement };

// the windows open before a reload: an arrangement saved in free mode finds them floating (sanitizeWindows)
const savedLayout = readLayout();
const savedWindows = sanitizeWindows(readPreference('windows', null), Array.isArray(savedLayout?.columns) ? savedLayout.columns.flat() : []);
const writeWindows = (state: CommandPostState) =>
  writePreference('windows', { version: 2, free: state.free, sizes: state.gridSizes, grids: state.grids, stackWidth: state.stackWidth } satisfies WindowsPreference);
export const maxColumnsIn = (view: View) => maxColumns(window.innerWidth, tilingOf(view));

/** The parts of the settings dialog, in the order of its menu. */
export const SETTINGS_SECTIONS = ['general', 'office', 'sessions', 'claude', 'folders', 'connections', 'usage', 'shortcuts', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The latest search sent over every session's thread: only its answer is kept. */
let searchId = 0;

export interface Toast { id: number; kind: 'info' | 'error'; text: string }

/** What the palette or the "new session" dialog starts with. */
/** What the launcher starts with: a command in its field, someone of the crew to take it (a click on a visitor). */
/** `resumeIn`: the launcher opens on that folder's conversations (/resume); `folder`: the folder it starts in (a project's +) */
export interface NewSessionDraft { command?: string; person?: string; resumeIn?: string; folder?: string }

/** What the session panel shows under its header: the conversation, what the session changed, its browser, or one of the views of Claude Code. */
export type PanelView = 'thread' | 'changes' | 'browser' | 'files' | InspectView;
/** The views a window keeps when another one takes the focus; the others go back to its conversation. */
export type KeptView = 'files' | 'browser';
const isKept = (view: PanelView): view is KeptView => view === 'files' || view === 'browser';

/** Whether a session's window shows its browser, focused or not. */
export const showsBrowser = (s: { selectedId: string | null; panelView: PanelView; openIds: string[]; keptViews: Record<string, KeptView> }, sessionId: string) =>
  s.selectedId === sessionId ? s.panelView === 'browser' : s.openIds.includes(sessionId) && s.keptViews[sessionId] === 'browser';
/** A browser of a session (its own: lane 0, or one of its testers'), shown in the floating window over the office. */
export interface PipTarget { sessionId: string; lane: number }
/** The answers to the views of Claude Code of a session, as last asked for. */
export interface Inspections { mcp?: McpServer[]; context?: ContextUsage; usage?: UsageReport }

export interface CommandPostState {
  connection: Connection;
  claude: ClaudeInfo | null;
  roots: string[];
  /** the people sessions are named after, with their look; one of them is the user (`self`) */
  crew: CrewMember[];
  crewOpen: boolean;
  /** the news of the versions not seen yet, or the tour of the features, asked for from the settings (WhatsNewDialog.tsx) */
  showcase: 'whatsNew' | 'tour' | null;
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
  /** the user's mods (shared/mods.ts), as the server last listed them; null until it did */
  mods: ModInfo[] | null;
  /** the mods whose window is open, the last one opened or touched last (on top); kept in this browser across reloads */
  openMods: string[];
  /** the panel that lists the mods is open */
  modsOpen: boolean;
  /** the user's automatons, as the server last told them (shared/automata.ts) */
  automata: AutomataState;
  /** the automatons' panel is open, on a run (null: the first at work, or the last ended) */
  automataOpen: boolean;
  /** the panel opened on a new trigger's page */
  automataFresh: boolean;
  automatonId: string | null;
  /** the sub-agent of that run whose thread to show first (its Agent call), or null for the run's own */
  automatonAgent: string | null;
  /** the threads of the runs the page asked for, by run id */
  automatonLogs: Record<string, RunLog>;
  /** the triggers and their last firings, as the server last told them (shared/triggers.ts) */
  triggers: TriggersState;
  /** why the last trigger sent could not be saved (shared/triggers.ts TriggerError), until the next one */
  triggerError: TriggerError | null;
  /** the roles a session of a folder can run as, as last asked for (null: not asked yet) */
  agentRoles: { cwd: string; roles: AgentRole[] } | null;
  /** the mod whose settings that panel shows, instead of the list */
  modSettings: string | null;
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
  /** the windows taken out of this page, by key (src/state/out.ts): shown in their own window, not here */
  outKeys: string[];
  /** the views of Claude Code answered so far, by session */
  inspections: Record<string, Inspections>;
  /** what the focused session's panel shows */
  panelView: PanelView;
  /** the Keys window of a session (SecretPrompt.tsx), with a name to give already typed (/secret NAME) */
  secretsOpen: { sessionId: string; name: string } | null;
  /** the tab each other open window was left on when it lost the focus: its files or its browser stay shown */
  keptViews: Record<string, KeptView>;
  /** the Claude Code conversations found for a folder, to resume one (the last folder and search asked for) */
  conversations: { cwd: string; query: string; list: Conversation[] } | null;
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
  /**
   * the windows docked in the grid, in columns of three from the right over the room (a click opens one beside the
   * others, see stack.ts): sessions, and `mod:<id>` for the mods docked there (docking.ts)
   */
  columns: Columns;
  /** the sessions open: the docked ones, then the ones floating in the current arrangement */
  openIds: string[];
  /** one of several open sessions shown alone for a while, the others kept in their place (as tmux's zoom) */
  zoomedId: string | null;
  /** Tab: everything but the room steps aside (header, status, sessions, launcher, mods), to see and click it */
  uiHidden: boolean;
  /** the grid's columns and rows resized by hand, for each arrangement (null: shared out evenly) */
  gridSizes: Record<Arrangement, GridSizes | null>;
  /** the grid each arrangement had last: switching back finds it as it was */
  grids: Record<Arrangement, Columns>;
  /** the width of the windows over the room pulled by hand, in fractions of the page's (null: as many columns as they need) */
  stackWidth: number | null;
  /** the sessions' windows floating over the grid, by arrangement */
  free: Record<Arrangement, FreeLayout>;
  view: View;
  /** the folder whose sessions the header's filter keeps in sight ('' = all): the others are ghosts in the room, out of the list */
  project: string;
  /** false until the user changes room: they then come in through the door instead of sitting at their desk */
  enteredThroughDoor: boolean;
  /** the user came into the room shown through the teleporter (src/room/portal.ts), in its column of light */
  arrivedByPortal: boolean;
  /** where the pet is, from room to room (src/room/pet-trip.ts) */
  petTrip: PetTrip;
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
  /** a click on the background: what is docked in the grid closes, conversations and mods; what floats stays */
  clearDesk: () => void;
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
  /** asks the server for a session's conversation, once: its events keep it up to date from then on */
  follow: (sessionId: string) => void;
  /** takes one of the open sessions out */
  closeOpen: (sessionId: string) => void;
  /**
   * sets the docked windows (stack.ts makes them) and, when given, the floating ones of the current arrangement, kept
   * for the next visit; each open session follows its conversation
   */
  arrange: (columns: Columns, free?: FreeLayout) => void;
  /** a docked window (a session, or `mod:<id>`) dragged to another place of the grid */
  moveWindow: (id: string, to: DropSlot) => void;
  /** the grid of the current arrangement resized by hand */
  resizeGrid: (sizes: GridSizes | null) => void;
  setStackWidth: (width: number | null) => void;
  /** a session's window floating, moved or resized (in fractions of its area): out of the grid, in front of the others */
  placeWindow: (sessionId: string, box: Box) => void;
  /** a floating window (a session, or `mod:<id>`) docked at `to`, or the first place with room; false when there is none (it stays floating) */
  dockWindow: (id: string, to: DropSlot | null) => boolean;
  /** a docked mod's window out of the grid (ModWindows places it where it was dropped) */
  undockMod: (id: string) => void;
  /** every floating window of the current arrangement docked, while the grid has room */
  tidyWindows: () => void;
  raiseWindow: (sessionId: string) => void;
  hideUi: (hidden: boolean) => void;
  /** after the window shrank: the column that no longer fits closes */
  fitOpen: () => void;
  /** shows a view in the open session's panel; one of Claude Code's is asked for at once */
  showPanel: (view: PanelView) => void;
  openSecrets: (sessionId: string | null, name?: string) => void;
  showBrowserLane: (sessionId: string, lane: number) => void;
  /** takes a browser out of its session's window, which goes back to the conversation */
  openModsPanel: (open: boolean) => void;
  /** shows a mod's settings in the mods' panel (null: back to the list) */
  openModSettings: (id: string | null) => void;
  configureMod: (id: string, settings: ModSettings) => void;
  /** opens a mod's window, or brings it to the front */
  openMod: (id: string) => void;
  closeMod: (id: string) => void;
  /** asks for a new mod: its folder is made and a session starts writing it, opened here */
  createMod: (text: string) => boolean;
  deleteMod: (id: string) => void;
  /** shows the session that works in a mod's folder, or starts one there */
  editMod: (id: string) => void;
  openPip: (target: PipTarget) => void;
  closePip: () => void;
  /** closed by the user: it stays closed while that session's turn goes on */
  dismissPip: () => void;
  /** puts the floating browser back in its session's window */
  dockPip: () => void;
  /** takes a window out into one of its own, or brings that one forward */
  popOut: (target: OutTarget) => void;
  /** a window says it is out, or gone: out, it leaves this page */
  noteOut: (key: string, out: boolean) => void;
  /** a window out goes back into this page */
  putBack: (target: OutTarget) => void;
  /** the user is looking at this session: what it shows now is no longer news */
  markSeen: (sessionId: string) => void;
  setView: (view: View) => void;
  /** to the other room through the teleporter: the user comes in on its twin */
  teleport: (view: View) => void;
  /** the pet went on to another room (or the room shown moved it on by the clock) */
  movePet: (trip: PetTrip) => void;
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
  openShowcase: (showcase: 'whatsNew' | 'tour' | null) => void;
  openSettings:(open: boolean, section?: SettingsSection, row?: string) => void;
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
  /** opens the automatons' panel (on a run, whose thread is then asked for) or closes it */
  /** `fresh`: on the page of a new trigger */
  openAutomata: (open: boolean, runId?: string | null, agent?: string | null, fresh?: boolean) => void;
  /** adds a trigger (no id) or changes one; false when it could not leave */
  saveTrigger: (id: string | null, trigger: TriggerInput) => boolean;
  deleteTrigger: (id: string) => void;
  /** `test`: in plan mode, nothing changed; `body`: posing as a webhook's */
  runTrigger: (id: string, run?: { test?: boolean; body?: string }) => void;
  cancelTriggerRun: (id: string) => void;
  /** adds a chat bot (null) or changes one; false when it could not leave */
  saveMessenger: (id: string | null, messenger: MessengerInput) => boolean;
  deleteMessenger: (id: string) => void;
  /** keys a trigger hands each of its runs, added or replaced by name; false when they could not leave */
  setTriggerKeys: (id: string, entries: SecretEntry[]) => boolean;
  forgetTriggerKey: (id: string, name: string) => void;
  askAgentRoles: (cwd: string) => void;
  /** the open-space MCP access for other programs: on with a new key, or off */
  setExternalMcp: (enabled: boolean) => void;
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
  /** keys for a session (`requestId`: the os-secret ask they answer); their values go to the server only */
  giveSecrets: (sessionId: string, requestId: string | undefined, entries: SecretEntry[]) => boolean;
  /** forgets some of a session's keys, or all of them */
  forgetSecrets: (sessionId: string, names?: string[]) => void;
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
  showcase: null,
  settingsOpen: false,
  settingsSection: 'general',
  settingsRow: null,
  costs: null,
  searchResults: null,
  boardOpen: false,
  notes: null,
  noteMatches: null,
  lastNote: null,
  automata: NO_AUTOMATA,
  automataOpen: false,
  automataFresh: false,
  automatonId: null,
  automatonAgent: null,
  automatonLogs: {},
  triggers: NO_TRIGGERS,
  triggerError: null,
  agentRoles: null,
  musicApps: [],
  nowPlaying: null,
  musicLibrary: null,
  directories: [],
  changes: {},
  browsers: {},
  browserAvailable: false,
  browserLanes: {},
  mods: null,
  openMods: readPreference<string[]>('mods-open', []),
  modsOpen: false,
  modSettings: null,
  pip: readPreference<PipTarget | null>('pip', null),
  pipDismissed: [],
  outKeys: [],
  inspections: {},
  panelView: 'thread',
  secretsOpen: null,
  keptViews: {},
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
  uiHidden: false,
  gridSizes: savedWindows.sizes,
  grids: savedWindows.grids,
  stackWidth: savedWindows.stackWidth,
  free: savedWindows.free,
  // 'bureau' (the old pixel office) and anything unknown open the meeting room
  view: (['repos', 'automates', 'focus'] as const).find((view) => view === readPreference<string>('view', 'salle')) ?? 'salle',
  project: readPreference('project', ''),
  enteredThroughDoor: false,
  arrivedByPortal: false,
  petTrip: startTrip(Date.now()),
  // the server's setting, given with its hello
  // the server's settings, given with its hello
  preferences: { notifications: true, roots: [], defaultFolder: '', model: '', permissionMode: 'auto', agentNote: '', festivals: true, officeLife: true, theme: 'office', pet: DEFAULT_PET, journalFolder: '', favoriteNotes: [], automataFolder: '', hooksAddress: '', copyOnSelect: false, autoPip: true, effort: '', claude: {}, timeFormat: 'auto', timestamps: false, turnDuration: true, detailedActions: false, promptSuggestions: true, reduceMotion: false, glassOpacity: GLASS_OPACITY.initial, windowStyle: 'classic', tagColors: false, idleCompact: 0, isolate: 'busy', accountsBrowser: 'shared', autoTag: false, autoTagRule: '', remoteByDefault: false },
  onboarded: true,
  language: initialLanguage,
  rootsLocked: false,
  claudeDefaults: { current: {}, outputStyles: [] },
  claudeUpdate: null,
  claudeAccount: null,
  appUpdate: null,
  rootSuggestions: null,
  terminals: [],
  // a window out stays quiet: Open Space's page rings already
  sound: !outTarget && readPreference('sound', true),
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
          browsers: message.browsers ?? {}, browserAvailable: message.browserAvailable ?? false, mods: message.mods ?? null,
        });
        // after a reconnection the windows stay; after a reload they come back as they were
        const kept = s.selectedId && sessions[s.selectedId] ? { columns: s.columns, selectedId: s.selectedId } : s.selectedId ? null : readLayout();
        // the floating windows of sessions still there (none when the layout is gone), out of the grid
        const prune = (layout: FreeLayout): FreeLayout => {
          const boxes = Object.fromEntries(Object.entries(layout.boxes).filter(([id]) => kept && sessions[id]));
          return { boxes, order: layout.order.filter((id) => id in boxes) };
        };
        const free = { room: prune(s.free.room), focus: prune(s.free.focus) };
        const floating = free[arrangementOf(s.view)];
        const keeps = (id: string) => { const mod = modOfSlot(id); return mod !== null ? s.openMods.includes(mod) : !!sessions[id] && !floating.boxes[id]; };
        const columns = (Array.isArray(kept?.columns) ? kept.columns : []).map((column) => (Array.isArray(column) ? column.filter((id) => typeof id === 'string' && keeps(id)) : [])).filter((column) => column.length > 0);
        set({ free });
        get().arrange(columns, floating);
        const open = get().openIds;
        const focused = kept?.selectedId && open.includes(kept.selectedId) ? kept.selectedId : open[0];
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
        if (s.openIds.includes(message.sessionId)) get().closeOpen(message.sessionId);
        set({ sessions, logs, seen, free: withoutWindow(get().free, message.sessionId) });
        writeWindows(get());
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
        const testing = floatsOutOfSight(message.lane);
        const dismissed = s.pipDismissed.includes(message.sessionId) && session && isRunning(session);
        const inView = showsBrowser(s, message.sessionId);
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
      case 'conversations': set({ conversations: { cwd: message.cwd, query: message.query ?? '', list: message.conversations } }); break;
      case 'folderInfo': set({ folderRepos: { ...s.folderRepos, [message.cwd]: message.repo } }); break;
      case 'branches': set({ branchLists: { ...s.branchLists, [message.cwd]: { root: message.root, rows: message.branches, ...(message.failed ? { failed: message.failed } : {}) } } }); break;
      case 'crew': set({ crew: message.crew }); break;
      case 'quota': set({ quota: message.quota }); break;
      case 'notes': set({ notes: { folder: message.folder, files: message.files } }); break;
      case 'note': set({ lastNote: { note: message.note, outcome: message.outcome } }); break;
      case 'noteMatches': set({ noteMatches: { query: message.query, matches: message.matches } }); break;
      case 'automata': set({ automata: message.state }); break;
      case 'triggers': set({ triggers: message.state }); break;
      case 'triggerError': set({ triggerError: message.error as TriggerError }); break;
      case 'agentRoles': set({ agentRoles: { cwd: message.cwd, roles: message.roles } }); break;
      case 'automatonLog': set({ automatonLogs: { ...s.automatonLogs, [message.runId]: { events: message.events, truncated: message.truncated } } }); break;
      // a run's events only count once its thread was read: they follow it
      case 'automatonEvents': {
        const log = s.automatonLogs[message.runId];
        if (log) set({ automatonLogs: { ...s.automatonLogs, [message.runId]: appendRunEvents(log, message.events) } });
        break;
      }
      case 'musicApps': set({ musicApps: message.apps }); break;
      case 'music': set({ nowPlaying: message.nowPlaying }); break;
      case 'musicLibrary': set({ musicLibrary: { query: message.query, playlists: message.playlists, tracks: message.tracks } }); break;
      // an answer to an older query, overtaken by the one typed since, is dropped
      case 'searchResults': if (message.id === searchId) set({ searchResults: { id: message.id, query: message.query, hits: message.hits } }); break;
      case 'costs': set({ costs: message.report }); break;
      case 'mods': set({ mods: message.mods }); break;
      case 'modCreated': get().openMod(message.id); break;
      case 'modEnv': heardModEnv(message.id, message.env); break;
      case 'modStore': heardModStore(message.id, message.name, message.value); break;
      case 'toast': s.toast(message.kind, message.text); break;
    }
  },

  select: (sessionId) => {
    set({ uiHidden: false });
    // the other sessions close, docked or floating; the docked mods stay
    const s = get(), mods = modsOnly(s.columns);
    set({ free: { room: { boxes: {}, order: [] }, focus: { boxes: {}, order: [] } } });
    get().arrange(sessionId ? (addTo(mods, sessionId, maxColumnsIn(s.view), tilingOf(s.view)) ?? [[sessionId]]) : mods, { boxes: {}, order: [] });
    if (sessionId) get().focus(sessionId);
    else set({ selectedId: null, searchOpen: false, panelView: 'thread' });
  },

  clearDesk: () => {
    const s = get();
    set({ uiHidden: false, zoomedId: null });
    for (const id of modsIn(s.columns)) s.closeMod(id);
    get().arrange([]);
    const open = get().openIds;
    if (open.length) get().focus(open.at(-1)!);
    else set({ selectedId: null, searchOpen: false, panelView: 'thread' });
  },

  show: (sessionId) => {
    const s = get();
    if (s.outKeys.includes(outKey({ kind: 'session', sessionId }))) { s.popOut({ kind: 'session', sessionId }); return; }
    set({ uiHidden: false });
    if (s.openIds.includes(sessionId)) { if (s.zoomedId && s.zoomedId !== sessionId) s.zoom(null); s.focus(sessionId); return; }
    const beside = s.selectedId && addTo(s.columns, sessionId, maxColumnsIn(s.view), tilingOf(s.view));
    if (beside) { set({ zoomedId: null }); s.arrange(beside); s.focus(sessionId); return; }
    // no room left: it takes the place of the window in use, or of the first docked session when that one floats
    const replaced = s.selectedId && s.columns.flat().includes(s.selectedId) ? s.selectedId : sessionsIn(s.columns)[0];
    if (s.openIds.length < 2 || !replaced) { s.select(sessionId); return; }
    set({ zoomedId: null });
    s.arrange(replaceIn(s.columns, replaced, sessionId));
    s.focus(sessionId);
  },

  toggleOpen: (sessionId) => {
    const s = get();
    if (s.outKeys.includes(outKey({ kind: 'session', sessionId }))) { s.popOut({ kind: 'session', sessionId }); return; }
    if (!s.selectedId) { s.select(sessionId); return; }
    set({ uiHidden: false });
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
    if (sessionId !== s.selectedId) {
      const { [sessionId]: kept, ...others } = s.keptViews;
      const keptViews = s.selectedId && isKept(s.panelView) ? { ...others, [s.selectedId]: s.panelView } : others;
      set({ selectedId: sessionId, searchOpen: false, panelView: kept ?? 'thread', keptViews });
    }
    s.markSeen(sessionId);
    writeLayout(get().columns, sessionId);
    s.follow(sessionId);
  },

  follow: (sessionId) => {
    const s = get();
    if (s.logs[sessionId]) return;
    set({ logs: { ...s.logs, [sessionId]: [] }, logLoaded: { ...s.logLoaded, [sessionId]: false } });
    s.send({ t: 'log', sessionId, after: 0 });
  },

  closeOpen: (sessionId) => {
    const s = get();
    const docked = modsOnly(s.columns).length ? s.columns.map((column) => column.filter((id) => modOfSlot(id) === null)).filter((column) => column.length > 0) : s.columns;
    const next = s.selectedId === sessionId
      ? ((sessionsIn(docked).includes(sessionId) ? nextFocus(docked, sessionId) : null) ?? s.openIds.filter((id) => id !== sessionId).at(-1) ?? null)
      : s.selectedId;
    set({ free: withoutWindow(s.free, sessionId) });
    s.arrange(removeFrom(s.columns, sessionId, tilingOf(s.view)), get().free[arrangementOf(s.view)]);
    if (next) s.focus(next);
    else s.select(null);
    const { [sessionId]: _closed, ...keptViews } = get().keptViews;
    set({ keptViews });
  },

  arrange: (columns, free) => {
    const arrangement = arrangementOf(get().view);
    const floating = free ?? get().free[arrangement];
    const openIds = openSessions(columns, floating);
    set((state) => ({
      gridSizes: { ...state.gridSizes, [arrangement]: keepSizes(state.columns, columns, state.gridSizes[arrangement]) },
      free: { ...state.free, [arrangement]: floating },
      grids: { ...state.grids, [arrangement]: columns },
      columns, openIds, zoomedId: state.zoomedId && openIds.includes(state.zoomedId) && openIds.length > 1 ? state.zoomedId : null,
      launcherOpen: state.launcherOpen && openIds.length > 0,
    }));
    writeLayout(columns, get().selectedId);
    writeWindows(get());
    for (const sessionId of openIds) get().follow(sessionId);
  },

  moveWindow: (id, to) => {
    const s = get();
    s.arrange(moveIn(s.columns, id, to, maxColumnsIn(s.view), tilingOf(s.view)));
  },

  resizeGrid: (sizes) => {
    set((state) => ({ gridSizes: { ...state.gridSizes, [arrangementOf(state.view)]: sizes } }));
    writeWindows(get());
  },

  setStackWidth: (width) => {
    set({ stackWidth: width });
    writeWindows(get());
  },

  placeWindow: (sessionId, box) => {
    const s = get(), arrangement = arrangementOf(s.view);
    const placed = float(s.columns, s.free[arrangement], sessionId, box, tilingOf(s.view));
    s.arrange(placed.columns, placed.free);
  },

  dockWindow: (id, to) => {
    const s = get(), arrangement = arrangementOf(s.view);
    const columns = dock(s.columns, id, to, maxColumnsIn(s.view), tilingOf(s.view));
    if (!columns) return false;
    s.arrange(columns, unfloat(s.free[arrangement], id));
    return true;
  },

  undockMod: (id) => {
    const s = get();
    if (s.columns.flat().includes(modSlot(id))) s.arrange(removeFrom(s.columns, modSlot(id), tilingOf(s.view)));
  },

  tidyWindows: () => {
    const s = get(), arrangement = arrangementOf(s.view);
    const docked = new Set(modsIn(s.columns));
    const outKeys = new Set(s.outKeys);
    const floatingMods = s.openMods.filter((id) => !docked.has(id) && !outKeys.has(outKey({ kind: 'mod', modId: id })) && s.mods?.some((mod) => mod.id === id)).map(modSlot);
    const tidied = tidyAll(s.columns, s.free[arrangement], floatingMods, maxColumnsIn(s.view), tilingOf(s.view));
    set({ zoomedId: null, uiHidden: false });
    s.arrange(tidied.columns, tidied.free);
  },

  raiseWindow: (sessionId) => {
    const arrangement = arrangementOf(get().view);
    const { boxes, order } = get().free[arrangement];
    if (order.at(-1) === sessionId || !boxes[sessionId]) return;
    set((state) => ({ free: { ...state.free, [arrangement]: { boxes, order: [...order.filter((id) => id !== sessionId), sessionId] } } }));
    writeWindows(get());
  },

  hideUi: (hidden) => set({ uiHidden: hidden }),

  fitOpen: () => {
    const s = get();
    const max = maxColumnsIn(s.view), tiling = tilingOf(s.view);
    const columns = fitColumns(s.columns, max, tiling);
    if (JSON.stringify(columns) === JSON.stringify(s.columns)) return;
    // the sessions with no room left close; the mods float instead
    for (const id of sessionsIn(s.columns).filter((id) => !columns.flat().includes(id))) s.closeOpen(id);
    get().arrange(fitColumns(get().columns, max, tiling));
  },

  showPanel: (view) => {
    const s = get();
    set({ panelView: view });
    if (s.selectedId && view !== 'thread' && view !== 'changes' && view !== 'browser' && view !== 'files') s.send({ t: 'inspect', sessionId: s.selectedId, view });
  },

  openSecrets: (sessionId, name = '') => set({ secretsOpen: sessionId ? { sessionId, name } : null }),

  showBrowserLane: (sessionId, lane) => set({ browserLanes: { ...get().browserLanes, [sessionId]: lane } }),

  openModsPanel: (open) => set({ modsOpen: open, modSettings: null }),

  openModSettings: (id) => set({ modsOpen: true, modSettings: id }),

  configureMod: (id, settings) => { get().send({ t: 'configureMod', id, settings }); },

  openMod: (id) => {
    if (get().outKeys.includes(outKey({ kind: 'mod', modId: id }))) { get().popOut({ kind: 'mod', modId: id }); return; }
    const openMods = [...get().openMods.filter((each) => each !== id), id];
    set({ openMods });
    writePreference('mods-open', openMods);
  },

  closeMod: (id) => {
    const openMods = get().openMods.filter((each) => each !== id);
    set({ openMods });
    writePreference('mods-open', openMods);
    get().undockMod(id);
  },

  createMod: (text) => {
    if (!get().send({ t: 'createMod', text })) return false;
    set({ awaitingNew: true, modsOpen: false });
    return true;
  },

  deleteMod: (id) => {
    get().closeMod(id);
    get().send({ t: 'deleteMod', id });
  },

  editMod: (id) => {
    const s = get();
    const mod = s.mods?.find((each) => each.id === id);
    if (!mod) return;
    set({ modsOpen: false });
    const session = Object.values(s.sessions).find((each) => each.cwd === mod.folder);
    if (session) s.show(session.id);
    else s.createSession({ cwd: mod.folder, model: s.preferences.model || undefined, permissionMode: s.preferences.permissionMode });
  },

  openPip: (target) => {
    const s = get();
    // out in a window of its own already, where it shows
    if (s.outKeys.includes(outKey({ kind: 'browser', ...target }))) return;
    const { [target.sessionId]: _floated, ...keptViews } = s.keptViews;
    set({ pip: target, pipDismissed: s.pipDismissed.filter((id) => id !== target.sessionId), keptViews, ...(s.selectedId === target.sessionId && s.panelView === 'browser' ? { panelView: 'thread' } : {}) });
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

  popOut: (target) => {
    const mod = target.kind === 'mod' ? get().mods?.find((each) => each.id === target.modId) : undefined;
    openOut(target, outSize(target, mod));
  },

  noteOut: (key, out) => {
    const s = get();
    const outKeys = s.outKeys.filter((each) => each !== key);
    set({ outKeys: out ? [...outKeys, key] : outKeys });
    const target = parseOut(key);
    if (!out || !target) return;
    // it leaves this page once its window is there (a popup a browser blocks takes nothing away)
    if (target.kind === 'session' && s.openIds.includes(target.sessionId)) s.closeOpen(target.sessionId);
    if (target.kind === 'mod' && s.openMods.includes(target.modId)) s.closeMod(target.modId);
    if (target.kind === 'browser' && s.pip?.sessionId === target.sessionId && s.pip.lane === target.lane) s.closePip();
  },

  putBack: (target) => {
    const s = get();
    set({ outKeys: s.outKeys.filter((each) => each !== outKey(target)) });
    if (target.kind === 'session' && s.sessions[target.sessionId]) s.show(target.sessionId);
    if (target.kind === 'mod') s.openMod(target.modId);
    if (target.kind === 'browser' && s.sessions[target.sessionId]) s.openPip({ sessionId: target.sessionId, lane: target.lane });
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
  teleport: (view) => {
    get().setView(view);
    set({ arrivedByPortal: true });
  },
  movePet: (petTrip) => set({ petTrip }),
  setView: (view) => {
    const s = get();
    writePreference('view', view);
    if (view !== 'focus') set({ launcherOpen: false });
    // from one room to the other the user walks through the door; out of focus mode they are back at their desk
    set({ view, arrivedByPortal: false, enteredThroughDoor: s.view !== 'focus' && view !== 'focus' ? true : s.enteredThroughDoor });
    if (tilingOf(view) === tilingOf(s.view)) return;
    const here = s.free[arrangementOf(s.view)], there = s.free[arrangementOf(view)];
    const columns = switchArrangement(s.columns, here, there, s.grids[arrangementOf(view)], maxColumnsIn(view), tilingOf(view));
    // the other arrangement keeps the sizes it was given: the windows are laid out again, not changed
    const sizes = s.gridSizes;
    s.arrange(columns, there);
    // the sessions with no room left there close
    const open = get().openIds;
    let free = get().free;
    for (const id of s.openIds.filter((id) => !open.includes(id))) free = withoutWindow(free, id);
    set({ gridSizes: sizes, free });
    writeWindows(get());
    if (s.selectedId && !open.includes(s.selectedId)) {
      if (open[0]) s.focus(open[0]);
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
  openShowcase: (showcase) => set({ showcase }),
  updateClaude: () => { get().send({ t: 'updateClaude' }); },
  claudeLogin: () => { get().send({ t: 'claudeLogin' }); },
  claudeLogout: () => { get().send({ t: 'claudeLogout' }); },
  restartOutdated: () => { get().send({ t: 'restartOutdated' }); },
  restartApp: () => { get().send({ t: 'restartApp' }); },
  checkApp: () => { get().send({ t: 'checkApp' }); },
  // opened without a section: from the top (General), not where they were last left
  openSettings: (open, section, row) => set((state) => ({ settingsOpen: open, settingsRow: row ?? null, settingsSection: section ?? (open && !state.settingsOpen ? 'general' : state.settingsSection) })),
  openBoard: (open) => set({ boardOpen: open, ...(open ? {} : { lastNote: null }) }),
  openAutomata: (open, runId = null, agent = null, fresh = false) => {
    // a thread is read again each time it is shown: what was kept may have missed events while the page was away
    set((state) => ({ automataOpen: open, automataFresh: open && fresh, automatonId: open ? runId : null, automatonAgent: open && runId ? agent : null, automatonLogs: runId ? Object.fromEntries(Object.entries(state.automatonLogs).filter(([id]) => id !== runId)) : state.automatonLogs }));
    if (open && runId) get().send({ t: 'automatonLog', runId });
  },
  saveTrigger: (id, trigger) => {
    set({ triggerError: null });
    return get().send({ t: 'saveTrigger', ...(id ? { id } : {}), trigger });
  },
  deleteTrigger: (id) => get().send({ t: 'deleteTrigger', id }),
  runTrigger: (id, run) => get().send({ t: 'runTrigger', id, ...run }),
  cancelTriggerRun: (id) => get().send({ t: 'cancelTriggerRun', id }),
  saveMessenger: (id, messenger) => get().send({ t: 'saveMessenger', ...(id ? { id } : {}), messenger }),
  deleteMessenger: (id) => get().send({ t: 'deleteMessenger', id }),
  setTriggerKeys: (id, entries) => get().send({ t: 'triggerKeys', id, entries }),
  forgetTriggerKey: (id, name) => get().send({ t: 'forgetTriggerKey', id, name }),
  askAgentRoles: (cwd) => get().send({ t: 'agentRoles', cwd }),
  setExternalMcp: (enabled) => get().send({ t: 'externalMcp', enabled }),
  saveMember: (previousName, name, look, birthday, jobs = []) => get().send({ t: 'saveMember', previousName, name, look, ...(birthday ? { birthday } : {}), ...(jobs.length ? { jobs: [...jobs] } : {}) }),
  removeMember: (name) => get().send({ t: 'removeMember', name }),
  becomeSelf: (name) => get().send({ t: 'becomeSelf', name }),
  /**
   * The launcher shows when no session is open: a draft closes the open one and goes to the launcher's field. In focus
   * mode the open ones stay, and the launcher opens beside them.
   */
  openNewSession: (draft) => {
    const s = get();
    if (draft && s.view === 'focus' && s.openIds.length) set({ launcherOpen: true, zoomedId: null, uiHidden: false });
    else if (draft) s.select(null);
    set({ newSession: draft, uiHidden: false });
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
  giveSecrets: (sessionId, requestId, entries) => get().send({ t: 'secrets', sessionId, ...(requestId ? { requestId } : {}), entries }),
  forgetSecrets: (sessionId, names) => { get().send({ t: 'forgetSecrets', sessionId, ...(names ? { names } : {}) }); },
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
