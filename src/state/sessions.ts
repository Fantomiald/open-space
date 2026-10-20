// The browser-side state of Open Space: connection, sessions, the log of the followed session,
// slash commands and UI selection. Server messages go through `receive`; user actions through the `send` set by net/connection.ts.
import { create } from 'zustand';
import type { Festival } from '../../shared/festivals.ts';
import { languageOf, type Language } from '../../shared/i18n.ts';
import type { Job } from '../../shared/jobs.ts';
import { DEFAULT_PET } from '../../shared/pets.ts';
import type { Look } from '../../shared/look.ts';
import type { MusicApp, MusicTrack, NowPlaying } from '../../shared/music.ts';
import type { Aside, ClaudeInfo, ClientMessage, MetricsFile, Note, NoteFile, Preferences, RootSuggestion, Conversation, CrewMember, FolderCode, ImageUpload, ContextUsage, InspectView, LoggedEvent, McpServer, UsageReport, PermissionDecision, Quota, ServerMessage, SessionChanges, SessionInfo, SessionOptions, SlashCommand, ModelChoice } from '../../shared/protocol.ts';
import { chime, errorChime, sampleChime } from '../lib/chime.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { keepDrafts, writeDraft } from './drafts.ts';
import { language as initialLanguage, setLanguage } from '../i18n/index.ts';
import { appendLive, mergeLog } from './log.ts';
import { addTo, fitColumns, FOCUS_TILING, maxColumns, nextFocus, removeFrom, replaceIn, retile, ROOM_TILING, type Columns } from './stack.ts';
import { afterEvent, withPartial, type Partials } from './partials.ts';
import { attentionQueue, newlyWaiting, type SeenSequences } from './queue.ts';
import { announceSpeech, answerSpeech, earlySpeech, replySpeech, speechOf } from './speech.ts';

/** The open windows, kept in this browser so a reload finds them as they were. */
const readLayout = () => readPreference<{ columns: string[][]; selectedId: string } | null>('layout', null);
const writeLayout = (columns: Columns, selectedId: string | null) => writePreference('layout', columns.length && selectedId ? { columns, selectedId } : null);

/** stopped: the bridge does not answer; unpaired: it answers but this browser has no valid session cookie */
export type Connection = 'connecting' | 'live' | 'stopped' | 'unpaired';
/** The office, the break room, or focus mode: the sessions listed beside their windows, without the room. */
export type View = 'salle' | 'repos' | 'focus';

export const tilingOf = (view: View) => (view === 'focus' ? FOCUS_TILING : ROOM_TILING);
export const maxColumnsIn = (view: View) => maxColumns(window.innerWidth, tilingOf(view));

export interface Toast { id: number; kind: 'info' | 'error'; text: string }

/** What the palette or the "new session" dialog starts with. */
/** What the launcher starts with: a command in its field, someone of the crew to take it (a click on a visitor). */
export interface NewSessionDraft { command?: string; person?: string }

/** What the session panel shows under its header: the conversation, what the session changed, or one of the views of Claude Code. */
export type PanelView = 'thread' | 'changes' | InspectView;
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
  /** the whiteboard's notes are open (a click on the whiteboard of the room) */
  boardOpen: boolean;
  /** the journal folder and its notes, as last listed */
  notes: { folder: string; files: NoteFile[] } | null;
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
  /** the views of Claude Code answered so far, by session */
  inspections: Record<string, Inspections>;
  /** what the open session's panel shows (back to the conversation when another session opens) */
  panelView: PanelView;
  /** the Claude Code conversations found for a folder, to resume one (the last folder asked for) */
  conversations: { cwd: string; list: Conversation[] } | null;
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
  /** the sessions shown over the room, in columns of three from the right (several with Shift+click, see stack.ts) */
  columns: Columns;
  /** `columns`, flat */
  openIds: string[];
  /** one of several open sessions shown alone for a while, the others kept in their place (as tmux's zoom) */
  zoomedId: string | null;
  /** Tab: the open sessions stay open but step aside, to see and click the room */
  stackHidden: boolean;
  view: View;
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
  /** folders offered at the onboarding, once asked for */
  rootSuggestions: RootSuggestion[] | null;
  /** changes some of the settings (the server keeps them and tells every tab) */
  setPreferences: (changes: Partial<Preferences>) => boolean;
  /** a ding when a session finishes or needs the user */
  sound: boolean;
  paletteOpen: boolean;
  /** a session asked for in a folder that runs code of its own and was never trusted, waiting for the user's answer */
  trustRequest: { cwd: string; code: FolderCode; options: SessionOptions } | null;
  /** the search bar of the open session's thread */
  searchOpen: boolean;
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
  /** Shift+click: adds the session beside the open ones (nothing when there is no room left), or takes it out */
  toggleOpen: (sessionId: string) => void;
  zoom: (sessionId: string | null) => void;
  /** one of the open sessions takes the keyboard (the user clicked in it) */
  focus: (sessionId: string) => void;
  /** takes one of the open sessions out */
  closeOpen: (sessionId: string) => void;
  /** sets the open windows (stack.ts makes them), kept for the next visit */
  arrange: (columns: Columns) => void;
  hideStack: (hidden: boolean) => void;
  /** after the window shrank: the column that no longer fits closes */
  fitOpen: () => void;
  /** shows a view in the open session's panel; one of Claude Code's is asked for at once */
  showPanel: (view: PanelView) => void;
  /** the user is looking at this session: what it shows now is no longer news */
  markSeen: (sessionId: string) => void;
  setView: (view: View) => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
  openPalette: (open: boolean) => void;
  openSearch: (open: boolean) => void;
  openCrew: (open: boolean) => void;
  openSettings: (open: boolean) => void;
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

  createSession: (options: SessionOptions) => void;
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
  return { language };
}

export const useSessions = create<CommandPostState>((set, get) => ({
  connection: 'connecting',
  claude: null,
  roots: [],
  crew: [],
  crewOpen: false,
  settingsOpen: false,
  boardOpen: false,
  notes: null,
  lastNote: null,
  metricsOpen: false,
  metrics: undefined,
  metricsUnread: false,
  musicApps: [],
  nowPlaying: null,
  musicLibrary: null,
  directories: [],
  changes: {},
  inspections: {},
  panelView: 'thread',
  conversations: null,
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
  // 'bureau' (the old pixel office) and anything unknown open the meeting room
  view: (['repos', 'focus'] as const).find((view) => view === readPreference<string>('view', 'salle')) ?? 'salle',
  enteredThroughDoor: false,
  // the server's setting, given with its hello
  // the server's settings, given with its hello
  preferences: { notifications: true, roots: [], defaultFolder: '', model: '', permissionMode: 'auto', agentNote: '', festivals: true, officeLife: true, pet: DEFAULT_PET, journalFolder: '', metricsFile: '' },
  onboarded: true,
  language: initialLanguage,
  rootsLocked: false,
  rootSuggestions: null,
  sound: readPreference('sound', true),
  paletteOpen: false,
  trustRequest: null,
  searchOpen: false,
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
          preferences: message.preferences, onboarded: message.onboarded, rootsLocked: message.rootsLocked,
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
      case 'preferences': set({ ...languageState(message.preferences), preferences: message.preferences, roots: message.roots, onboarded: message.onboarded }); break;
      case 'rootSuggestions': set({ rootSuggestions: message.suggestions }); break;
      case 'trustNeeded': if (lastCreate) set({ trustRequest: { cwd: message.cwd, code: message.code, options: lastCreate } }); break;
      case 'forgotten': {
        const { [message.sessionId]: _removed, ...sessions } = s.sessions;
        const { [message.sessionId]: _log, ...logs } = s.logs;
        const { [message.sessionId]: _seen, ...seen } = s.seen;
        writePreference('seen', seen);
        writeDraft(message.sessionId, '');
        set({ sessions, logs, seen });
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
      case 'changes': set({ changes: { ...s.changes, [message.sessionId]: message.changes } }); break;
      case 'inspection': {
        const { inspection } = message;
        const answer: Inspections = inspection.view === 'mcp' ? { mcp: inspection.servers } : inspection.view === 'context' ? { context: inspection.usage } : { usage: inspection.report };
        set({ inspections: { ...s.inspections, [message.sessionId]: { ...s.inspections[message.sessionId], ...answer } } });
        break;
      }
      case 'conversations': set({ conversations: { cwd: message.cwd, list: message.conversations } }); break;
      case 'crew': set({ crew: message.crew }); break;
      case 'quota': set({ quota: message.quota }); break;
      case 'notes': set({ notes: { folder: message.folder, files: message.files } }); break;
      case 'note': set({ lastNote: { note: message.note, outcome: message.outcome } }); break;
      case 'metrics': set({ metrics: message.metrics }); break;
      case 'metricsStatus': set({ metricsUnread: message.unread }); break;
      case 'musicApps': set({ musicApps: message.apps }); break;
      case 'music': set({ nowPlaying: message.nowPlaying }); break;
      case 'musicLibrary': set({ musicLibrary: { query: message.query, playlists: message.playlists, tracks: message.tracks } }); break;
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
    const beside = s.view === 'focus' && s.selectedId && addTo(s.columns, sessionId, maxColumnsIn(s.view), FOCUS_TILING);
    if (beside) { set({ zoomedId: null }); s.arrange(beside); s.focus(sessionId); return; }
    if (s.openIds.length < 2 || !s.selectedId) { s.select(sessionId); return; }
    set({ zoomedId: null });
    s.arrange(replaceIn(s.columns, s.selectedId, sessionId, tilingOf(s.view)));
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
    set((state) => ({
      columns, openIds, zoomedId: state.zoomedId && openIds.includes(state.zoomedId) && openIds.length > 1 ? state.zoomedId : null,
      launcherOpen: state.launcherOpen && openIds.length > 0,
    }));
    writeLayout(columns, get().selectedId);
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
    if (s.selectedId && view !== 'thread' && view !== 'changes') s.send({ t: 'inspect', sessionId: s.selectedId, view });
  },

  markSeen: (sessionId) => {
    const s = get();
    const session = s.sessions[sessionId];
    if (!session || (s.seen[sessionId] ?? 0) >= session.lastSeq) return;
    const seen = { ...s.seen, [sessionId]: session.lastSeq };
    writePreference('seen', seen);
    set({ seen });
  },

  setView: (view) => {
    const s = get();
    writePreference('view', view);
    if (view !== 'focus') set({ launcherOpen: false });
    // from one room to the other the user walks through the door; out of focus mode they are back at their desk
    set({ view, enteredThroughDoor: s.view !== 'focus' && view !== 'focus' ? true : s.enteredThroughDoor });
    if (tilingOf(view) === tilingOf(s.view)) return;
    const columns = retile(s.columns, maxColumnsIn(view), tilingOf(view));
    s.arrange(columns);
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

  openPalette: (open) => set({ paletteOpen: open }),
  openSearch: (open) => set({ searchOpen: open }),
  setPreview: (preview) => set({ preview }),
  openCrew: (open) => set({ crewOpen: open }),
  openSettings: (open) => set({ settingsOpen: open }),
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

  createSession: (options) => { set({ awaitingNew: true }); lastCreate = options; get().send({ t: 'create', options }); },
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
