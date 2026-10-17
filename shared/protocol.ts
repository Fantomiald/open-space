// The contract between the browser and the bridge (the Node server driving Claude Code).
// Everything goes through one JSON WebSocket. Erasable syntax only: Node reads this file as is
// (no compilation step), and so does Vite.
import type { Job } from './jobs.ts';
import type { PetChoice } from './pets.ts';
import type { Look } from './look.ts';

export interface PlanItem { text: string; status: 'pending' | 'in_progress' | 'completed' }

/**
 * What happens in a session. `who` is "chef" (the main agent) or the id of the Task/Agent call
 * that started a sub-agent.
 */
export type OfficeEvent =
  /** a message was sent to the session */
  /** a message from the user; `images`: the pictures sent with it, by name under /attachments/ */
  | { k: 'start'; text: string; images?: string[] }
  | { k: 'init'; model: string }
  | { k: 'think'; who: string }
  | { k: 'say'; who: string; text: string }
  | { k: 'plan'; items: PlanItem[] }
  | { k: 'hire'; id: string; type: string; name: string; task: string; prompt: string }
  | { k: 'act'; who: string; id: string; tool: string; detail: string }
  | { k: 'act_done'; who: string; id: string; ok: boolean }
  /** the report a sub-agent hands back to the main agent */
  | { k: 'report'; who: string; text: string }
  /** a sub-agent finished its work */
  | { k: 'leave'; who: string; ok: boolean; tokens: number; tools: number; ms: number }
  /** questions = an AskUserQuestion call, answered with a reply instead of yes/no */
  | { k: 'ask'; who: string; requestId: string; tool: string; detail: string; canAlways: boolean; always?: string[]; questions?: Question[] }
  | { k: 'ask_done'; requestId: string; allow: boolean; cancelled?: boolean }
  /** a turn ended */
  | { k: 'end'; ok: boolean; text: string; ms: number; stopped?: boolean }
  | { k: 'error'; message: string }
  /**
   * a message from another Claude Code session (its SendMessage tool), `from`: that session's name. It started the turn
   * it comes with, but Claude Code only tells it at the turn's end: the thread shows it at the top of that turn.
   */
  | { k: 'peer'; from: string; text: string }
  /** a note of Open Space in the thread ("the last exchanges of the conversation it resumes") */
  | { k: 'note'; text: string }
  /** the session changed state (see SessionState) */
  | { k: 'state'; state: SessionState; reason?: string };

export interface ClaudeInfo { found: boolean; version?: string; path?: string }

/** One usage window of the subscription: "five_hour", "seven_day", or another one Claude Code reports. */
export interface QuotaWindow { name: string; utilization: number; resetsAt: number | null }
/** The five-hour window (shown in the header) and every window reported, five-hour included. resetsAt: Unix seconds. */
export interface Quota { fiveHour: number; resetsAt: number | null; windows: QuotaWindow[] }

// ════════════════════════════════════════════════════════════════════════════════════════════
// Open Space's protocol: N sessions, one WebSocket. Every event carries its sessionId and a
// per-session sequence number, so a client that reconnects can ask for what it missed.
// ════════════════════════════════════════════════════════════════════════════════════════════

/**
 * starting: process launching, init not seen yet
 * work:     a turn is running
 * perm:     a tool call waits for the user (a yes/no, or the answers to an AskUserQuestion call)
 * wait:     nothing is running, the ball is in the user's court (turn finished, or session not started yet)
 * done:     the claude process ended by itself, cleanly
 * closed:   the user closed it (resumable)
 * error:    the process died abnormally, or could not start
 */
export type SessionState = 'starting' | 'work' | 'perm' | 'wait' | 'done' | 'closed' | 'error';

export interface QuestionOption { label: string; description: string }

/** One question of an AskUserQuestion call (1 to 4 per call, 2 to 4 options each). */
export interface Question { question: string; header: string; options: QuestionOption[]; multiSelect: boolean }

/** A tool call waiting for the user's yes or no, or, when `questions` is set, for the answers to an AskUserQuestion call. */
/** `always`: what "Toujours" would allow for the rest of the session, in words (one line per rule). */
export interface PermissionPrompt { requestId: string; who: string; tool: string; detail: string; canAlways: boolean; always?: string[]; questions?: Question[] }

/** Claude Code permission modes offered per session (bypassPermissions and dontAsk are left out on purpose). */
export const PERMISSION_MODES = ['auto', 'acceptEdits', 'manual', 'plan'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'auto';
export const isPermissionMode = (value: unknown): value is PermissionMode => PERMISSION_MODES.some((mode) => mode === value);

/** A sub-agent at work: `id` is the id of the Agent/Task call that started it (the `who` of its events). */
export interface SubagentInfo { id: string; name: string; type: string }

/** Why a session waits for the user. */
export type AttentionKind = 'permission' | 'question' | 'finished' | 'error';

/** What a folder would run of its own with a session: its hooks and MCP servers ("event : command", "name : command"), and whether it has a CLAUDE.md. */
export interface FolderCode { hooks: string[]; mcpServers: string[]; instructions: boolean }

export interface QueuedMessage { id: string; text: string; /** how many pictures go with it */ images?: number }

export type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
/** A picture sent with a message (a pasted or dropped screenshot), in base64. */
export interface ImageUpload { mediaType: ImageType; data: string }

export interface SessionInfo {
  /** also the Claude Code session id (the same UUID is used for --session-id and --resume) */
  id: string;
  name: string;
  cwd: string;
  /** requested model alias or full name; '' = Claude Code default */
  model: string;
  /** the model reported by Claude Code at init */
  activeModel: string;
  permissionMode: PermissionMode;
  /** the name the session's Claude was last told it has; differs from `name` after a rename (or for older sessions) */
  introducedAs?: string;
  /** a short label the user put on the session ("urgent", "Jarvis"), shown next to its name */
  tag?: string;
  /** runs without its folder's own settings (hooks, MCP servers): the folder was not trusted */
  untrusted?: boolean;
  /** put to rest by the user: its process is released and it waits in the break room until it gets a message */
  resting?: boolean;
  /** messages sent during a turn, oldest first: they leave together when the turn ends */
  queued?: QueuedMessage[];
  state: SessionState;
  /** epoch ms of the last state change */
  stateSince: number;
  createdAt: number;
  /** completed turns */
  turns: number;
  /** tool calls waiting for an answer, oldest first */
  permissions: PermissionPrompt[];
  /** sub-agents currently working, oldest first */
  subagents: SubagentInfo[];
  /** the last slash command sent to the session, without the slash (e.g. "kit:design"); '' if none */
  command: string;
  /** last text said by the assistant, shortened */
  lastMessage: string;
  /** why the session is in the error state, when it is */
  error?: string;
  /** a conversation exists on disk, so --resume can work */
  resumable: boolean;
  /** highest event sequence number recorded for this session */
  lastSeq: number;
}

export interface SlashCommand { name: string; description?: string; argumentHint?: string }

export type PermissionDecision = 'allow' | 'deny' | 'always';

/** An event as stored in the session log. */
export interface LoggedEvent { seq: number; at: number; ev: OfficeEvent }

export interface SessionOptions {
  /** absolute path, must be inside one of the configured roots */
  cwd: string;
  model?: string;
  permissionMode?: PermissionMode;
  name?: string;
  /** first message to send, e.g. "/kit:new" */
  text?: string;
  /** pictures sent with the first message */
  images?: ImageUpload[];
  /** for a folder that runs code of its own and was never trusted (see FolderCode): trust it from now on, or run
   * this session without its settings. Without it, such a folder is refused with a `trustNeeded` message. */
  trust?: 'folder' | 'restricted';
  /** a Claude Code conversation already on disk to go on with (see Conversation), instead of a new one */
  resumeId?: string;
}

/** A Claude Code conversation found on disk for a folder, that a new session can go on with. updatedAt: ms. */
export interface Conversation { id: string; title: string; preview: string; updatedAt: number }

/** Someone of the user's crew: sessions named like them wear their look; `self` is the user's own avatar. Null: the default look. */
/** `birthday`: "MM-DD", the day the rooms throw them a party. `jobs`: what they do, to send them the requests that fit (shared/jobs.ts). */
export interface CrewMember { name: string; look: Look | null; self?: boolean; birthday?: string; jobs?: Job[] }

/** The user's settings, chosen at the first start (the onboarding) and changed later in the page. */
export interface Preferences {
  /** macOS notifications when a session needs the user and the page is not in front */
  notifications: boolean;
  /** the folders sessions may run in (OFFICE_ROOTS, when set, wins over them) */
  roots: string[];
  /** where a session starts when no folder is given ('' : the first root) */
  defaultFolder: string;
  /** the model and permission mode a new session starts with ('' : Claude Code's default model) */
  model: string;
  permissionMode: PermissionMode;
  /** a few words for every new session's agent, after its name (how to address the user, which language to answer in) */
  agentNote: string;
  /** the rooms dress up for the festivals */
  festivals: boolean;
  /** the office pet: a cat, a dog, Rocky, or none */
  pet: PetChoice;
}

/** A folder offered at the onboarding as a place for sessions to run in: how many projects it holds (-1: not looked into). */
export interface RootSuggestion { path: string; projects: number }

export type ClientMessage =
  | { t: 'create'; options: SessionOptions }
  /** the Claude Code conversations of a folder, to resume one */
  | { t: 'conversations'; cwd: string }
  | { t: 'send'; sessionId: string; text: string; images?: ImageUpload[] }
  | { t: 'answer'; sessionId: string; requestId: string; decision: PermissionDecision }
  /** answers to an AskUserQuestion call: question text -> chosen label(s) or the user's own text */
  | { t: 'reply'; sessionId: string; requestId: string; answers: Record<string, string> }
  | { t: 'interrupt'; sessionId: string }
  /** takes a queued message back */
  | { t: 'unqueue'; sessionId: string; queueId: string }
  /** sends the queued messages at once, interrupting the running turn */
  | { t: 'sendNow'; sessionId: string }
  /** a side question (/btw): answered from the session's conversation without interrupting it nor entering it */
  | { t: 'aside'; sessionId: string; question: string }
  /** the side question's answer is put away (and the question withdrawn if still asked) */
  | { t: 'asideClose'; sessionId: string }
  /** whether this tab is in front (visible and focused): no macOS notification while one is */
  | { t: 'presence'; active: boolean }
  /** changes some of the settings */
  | { t: 'preferences'; preferences: Partial<Preferences> }
  /** the end of the onboarding: who the user is, and their settings */
  | { t: 'onboard'; self: { name: string; look: Look; birthday?: string }; preferences: Preferences }
  /** the folders worth offering at the onboarding */
  | { t: 'suggestRoots' }
  /** the user's bust as a PNG (base64), drawn by the page from their look: the macOS app's icon (scripts/macos-app.py) */
  | { t: 'avatar'; png: string }
  | { t: 'close'; sessionId: string }
  | { t: 'rename'; sessionId: string; name: string }
  /** an empty tag removes it */
  | { t: 'tag'; sessionId: string; tag: string }
  /** sends the session to the break room (its process is released; a message calls it back) */
  | { t: 'rest'; sessionId: string }
  | { t: 'forget'; sessionId: string }
  /** events of a session after a sequence number (0 = from the start) */
  | { t: 'log'; sessionId: string; after: number }
  | { t: 'directories' }
  /** adds a crew member (previousName null) or updates the one called previousName */
  | { t: 'saveMember'; previousName: string | null; name: string; look: Look; birthday?: string; jobs?: Job[] }
  | { t: 'removeMember'; name: string };

export type ServerMessage =
  | { t: 'hello'; claude: ClaudeInfo; roots: string[]; sessions: SessionInfo[]; commands: SlashCommand[]; quota: Quota | null; build: string; crew: CrewMember[]; preferences: Preferences; onboarded: boolean; rootsLocked: boolean }
  /** a session asked for in a folder that runs code of its own and was never trusted: the user decides (SessionOptions.trust) */
  | { t: 'trustNeeded'; cwd: string; code: FolderCode }
  /** the settings changed (from any tab); `roots`: the folders in effect */
  | { t: 'preferences'; preferences: Preferences; roots: string[]; onboarded: boolean }
  | { t: 'rootSuggestions'; suggestions: RootSuggestion[] }
  | { t: 'crew'; crew: CrewMember[] }
  | { t: 'conversations'; cwd: string; conversations: Conversation[] }
  | { t: 'session'; session: SessionInfo }
  | { t: 'forgotten'; sessionId: string }
  | { t: 'ev'; sessionId: string; seq: number; at: number; ev: OfficeEvent }
  /** a session's side question and its answer so far (null: put away); never logged */
  | { t: 'aside'; sessionId: string; aside: Aside | null }
  /** the text of a message still being written by `who`, so far: not logged, the whole message follows as a `say` event */
  | { t: 'partial'; sessionId: string; who: string; text: string }
  | { t: 'log'; sessionId: string; events: LoggedEvent[]; truncated: boolean }
  | { t: 'commands'; commands: SlashCommand[] }
  | { t: 'directories'; directories: string[] }
  | { t: 'quota'; quota: Quota }
  | { t: 'toast'; kind: 'info' | 'error'; text: string };

/** A side question (/btw) and its answer. */
export interface Aside { question: string; answer: string; state: 'asking' | 'answered' | 'failed' }
