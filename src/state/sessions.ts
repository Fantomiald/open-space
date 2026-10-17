// The browser-side state of Open Space: connection, sessions, the log of the followed session,
// slash commands and UI selection. Server messages go through `receive`; user actions through the `send` set by net/connection.ts.
import { create } from 'zustand';
import type { Festival } from '../../shared/festivals.ts';
import { languageOf, type Language } from '../../shared/i18n.ts';
import type { Job } from '../../shared/jobs.ts';
import { DEFAULT_PET } from '../../shared/pets.ts';
import type { Look } from '../../shared/look.ts';
import type { Aside, ClaudeInfo, ClientMessage, Preferences, RootSuggestion, Conversation, CrewMember, FolderCode, ImageUpload, LoggedEvent, PermissionDecision, Quota, ServerMessage, SessionChanges, SessionInfo, SessionOptions, SlashCommand } from '../../shared/protocol.ts';
import { chime, errorChime, sampleChime } from '../lib/chime.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { language as initialLanguage, setLanguage } from '../i18n/index.ts';
import { appendLive, mergeLog } from './log.ts';
import { afterEvent, withPartial, type Partials } from './partials.ts';
import { attentionQueue, newlyWaiting, type SeenSequences } from './queue.ts';
import { announceSpeech, answerSpeech, earlySpeech, replySpeech, speechOf } from './speech.ts';

/** stopped: the bridge does not answer; unpaired: it answers but this browser has no valid session cookie */
export type Connection = 'connecting' | 'live' | 'stopped' | 'unpaired';
export type View = 'salle' | 'repos';

export interface Toast { id: number; kind: 'info' | 'error'; text: string }

/** What the palette or the "new session" dialog starts with. */
/** What the launcher starts with: a command in its field, someone of the crew to take it (a click on a visitor). */
export interface NewSessionDraft { command?: string; person?: string }

interface CommandPostState {
  connection: Connection;
  claude: ClaudeInfo | null;
  roots: string[];
  /** the people sessions are named after, with their look; one of them is the user (`self`) */
  crew: CrewMember[];
  crewOpen: boolean;
  settingsOpen: boolean;
  directories: string[];
  /** what each session changed in its files, as last asked for */
  changes: Record<string, SessionChanges>;
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
  commands: SlashCommand[];
  quota: Quota | null;
  selectedId: string | null;
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
  toasts: Toast[];
  /** a session was asked for: the next unknown one that appears gets selected */
  awaitingNew: boolean;
  /** what the user has already seen of each session (kept in localStorage) */
  seen: SeenSequences;
  /** false when the message could not leave (not connected) */
  send: (message: ClientMessage) => boolean;

  receive: (message: ServerMessage) => void;
  select: (sessionId: string | null) => void;
  /** the user is looking at this session: what it shows now is no longer news */
  markSeen: (sessionId: string) => void;
  setView: (view: View) => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
  openPalette: (open: boolean) => void;
  openSearch: (open: boolean) => void;
  openCrew: (open: boolean) => void;
  openSettings: (open: boolean) => void;
  /** false when the message could not leave (not connected) */
  /** `birthday`: "MM-DD", or undefined for none */
  saveMember: (previousName: string | null, name: string, look: Look, birthday?: string, jobs?: readonly Job[]) => boolean;
  removeMember: (name: string) => boolean;
  /** someone of the crew becomes the user (their perso in the room) */
  becomeSelf: (name: string) => boolean;
  openNewSession: (draft: NewSessionDraft | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;

  createSession: (options: SessionOptions) => void;
  /** the user's answer to `trustRequest`: trust the folder, run without its settings, or give up (null) */
  answerTrust: (choice: 'folder' | 'restricted' | null) => void;
  /** a message to a session, with the pictures attached to it */
  sendText: (sessionId: string, text: string, images?: ImageUpload[]) => boolean;
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
  directories: [],
  changes: {},
  conversations: null,
  sessions: {},
  logs: {},
  logLoaded: {},
  partials: {},
  asides: {},
  commands: [],
  quota: null,
  selectedId: null,
  // 'bureau' (the old pixel office) and anything unknown open the meeting room
  view: readPreference<string>('view', 'salle') === 'repos' ? 'repos' : 'salle',
  enteredThroughDoor: false,
  // the server's setting, given with its hello
  // the server's settings, given with its hello
  preferences: { notifications: true, roots: [], defaultFolder: '', model: '', permissionMode: 'auto', agentNote: '', festivals: true, officeLife: true, pet: DEFAULT_PET },
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
        // the browser's language becomes the setting until the user picks one: the server speaks it too
        if (!message.preferences.language) s.send({ t: 'preferences', preferences: { language: languageOf(navigator.languages) } });
        set({
          ...languageState(message.preferences),
          claude: message.claude, roots: message.roots, crew: message.crew, sessions, commands: message.commands, quota: message.quota,
          preferences: message.preferences, onboarded: message.onboarded, rootsLocked: message.rootsLocked,
          selectedId: s.selectedId && sessions[s.selectedId] ? s.selectedId : null,
        });
        // resynchronise the followed sessions: ask for what was missed while disconnected
        for (const id of Object.keys(s.logs)) {
          if (sessions[id]) s.send({ t: 'log', sessionId: id, after: s.logs[id].at(-1)?.seq ?? 0 });
        }
        break;
      }
      case 'session': {
        const previous = s.sessions;
        set({ sessions: { ...previous, [message.session.id]: message.session } });
        if (s.awaitingNew && !previous[message.session.id]) { set({ awaitingNew: false }); get().select(message.session.id); }
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
        set({ sessions, logs, seen, selectedId: s.selectedId === message.sessionId ? null : s.selectedId });
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
      case 'directories': set({ directories: message.directories }); break;
      case 'changes': set({ changes: { ...s.changes, [message.sessionId]: message.changes } }); break;
      case 'conversations': set({ conversations: { cwd: message.cwd, list: message.conversations } }); break;
      case 'crew': set({ crew: message.crew }); break;
      case 'quota': set({ quota: message.quota }); break;
      case 'toast': s.toast(message.kind, message.text); break;
    }
  },

  select: (sessionId) => {
    const s = get();
    set({ selectedId: sessionId, ...(sessionId !== s.selectedId ? { searchOpen: false } : {}) });
    if (!sessionId) return;
    get().markSeen(sessionId);
    if (!s.logs[sessionId]) {
      set({ logs: { ...s.logs, [sessionId]: [] }, logLoaded: { ...s.logLoaded, [sessionId]: false } });
      s.send({ t: 'log', sessionId, after: 0 });
    }
  },

  markSeen: (sessionId) => {
    const s = get();
    const session = s.sessions[sessionId];
    if (!session || (s.seen[sessionId] ?? 0) >= session.lastSeq) return;
    const seen = { ...s.seen, [sessionId]: session.lastSeq };
    writePreference('seen', seen);
    set({ seen });
  },

  setView: (view) => { writePreference('view', view); set({ view, enteredThroughDoor: true }); },

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
  saveMember: (previousName, name, look, birthday, jobs = []) => get().send({ t: 'saveMember', previousName, name, look, ...(birthday ? { birthday } : {}), ...(jobs.length ? { jobs: [...jobs] } : {}) }),
  removeMember: (name) => get().send({ t: 'removeMember', name }),
  becomeSelf: (name) => get().send({ t: 'becomeSelf', name }),
  /** The launcher shows when no session is open: a draft closes the open one and goes to the launcher's field. */
  openNewSession: (draft) => {
    if (draft) get().select(null);
    set({ newSession: draft });
  },

  createSession: (options) => { set({ awaitingNew: true }); lastCreate = options; get().send({ t: 'create', options }); },
  answerTrust: (choice) => {
    const request = get().trustRequest;
    set({ trustRequest: null });
    if (!request || !choice) { set({ awaitingNew: false }); return; }
    get().createSession({ ...request.options, trust: choice });
  },
  sendText: (sessionId, text, images) => get().send({ t: 'send', sessionId, text, ...(images?.length ? { images } : {}) }),
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
