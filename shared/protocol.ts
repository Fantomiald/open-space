// The contract between the browser and the bridge (the Node server driving Claude Code).
// Everything goes through one JSON WebSocket. Erasable syntax only: Node reads this file as is
// (no compilation step), and so does Vite.
import type { Language } from './i18n.ts';
import type { Job } from './jobs.ts';
import type { PetChoice } from './pets.ts';
import type { Look } from './look.ts';
import type { MusicAction, MusicApp, MusicTrack, NowPlaying } from './music.ts';

export interface PlanItem { text: string; status: 'pending' | 'in_progress' | 'completed' }

/**
 * What happens in a session. `who` is "chef" (the main agent) or the id of the Task/Agent call
 * that started a sub-agent.
 */
export type OfficeEvent =
  /** a message was sent to the session */
  /** a message from the user; `images`: the pictures sent with it, by name under /attachments/; `files`: the other files */
  | { k: 'start'; text: string; images?: string[]; files?: UploadedFile[] }
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
  /** `subagent`: written by one of the session's own sub-agents (the id of its Task call), not by another session */
  | { k: 'peer'; from: string; text: string; subagent?: string }
  /**
   * a command the user ran with "!" in the session's folder, without Claude (like Claude Code's bash mode), then its
   * end: `output` is what it wrote (the end of it when long), `code` null when it was stopped after too long
   */
  | { k: 'shell'; id: string; command: string }
  /** `code` null: stopped, by the user (`byUser`) or after two minutes */
  | { k: 'shell_done'; id: string; code: number | null; output: string; ms: number; byUser?: true }
  /** files a session's Claude (or one of its sub-agents) sent the user with its SendUserFile tool, and what it said of them */
  | { k: 'files'; who: string; caption?: string; files: SentFile[] }
  /** a page Claude published on claude.ai with its Artifact tool: its address there, and `stored` the copy of its HTML under /attachments/ (null when it could not be kept) */
  | { k: 'artifact'; who: string; title: string; url: string; stored: string | null }
  /** the conversation was summarized to free its context (/compact, or automatically when full): its size before and after, in tokens */
  | { k: 'compact'; auto: boolean; before: number; after: number }
  /** /clear: Claude goes on in a new, empty conversation */
  | { k: 'cleared' }
  /** a note of Open Space in the thread ("the last exchanges of the conversation it resumes") */
  | { k: 'note'; text: string }
  /** the session changed state (see SessionState) */
  | { k: 'state'; state: SessionState; reason?: string };

/**
 * A file a session sent: `title` its own name; `stored` the copy under /attachments/ (null when it could not be kept: too
 * big, gone); `image`: shown in the thread (png, jpeg, gif, webp, svg); `page`: an HTML page shown in a preview, unless
 * Claude sent it as a mere attachment; `video`: played in the page; any other file is offered for download.
 */
/** Sent files read in the viewer (Markdown rendered), served as plain text so they never run in the page. */
export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'markdown', 'txt', 'log', 'csv', 'tsv', 'json', 'yaml', 'yml', 'toml']);

export interface SentFile { title: string; stored: string | null; image: boolean; page?: true; video?: true; size: number }

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

export interface QueuedMessage { id: string; text: string; /** how many pictures go with it */ images?: number; /** how many other files */ files?: number }

/** A file of any kind the user sent with a message: `id` as uploaded (POST /upload, see server/uploads.ts) */
export interface UploadedFile { id: string; name: string; size: number }

export type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
/** A picture sent with a message (a pasted or dropped screenshot), in base64. */
export interface ImageUpload { mediaType: ImageType; data: string }

/**
 * A file a session wrote, against the last commit of its repository. `outside`: not in a git repository, so without a
 * diff. `patch`: its unified diff from the first hunk on, empty when binary, or cut (`truncated`) when too long.
 */
export interface FileChange { path: string; status: 'modified' | 'added' | 'deleted' | 'outside'; added: number; removed: number; patch: string; binary?: true; truncated?: true }
/** What a session changed: the files with changes not committed yet, the latest first; `touched`: all the files it wrote. */
export interface SessionChanges { files: FileChange[]; added: number; removed: number; touched: number }

export interface SessionInfo {
  /** also the Claude Code session id (the same UUID is used for --session-id and --resume) */
  id: string;
  name: string;
  cwd: string;
  /** requested model alias or full name; '' = Claude Code default */
  model: string;
  /** the model reported by Claude Code at init */
  activeModel: string;
  /** chosen in the session; none = the model's default */
  effort?: Effort;
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
  /** epoch ms since which it works (starting, at work or waiting for a permission on the way), while it does */
  busySince?: number;
  /** its session on claude.ai while Remote Control is on, kept across restarts of the server to reattach to it */
  remoteSession?: string;
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
  /**
   * the Claude Code conversation the session goes on with: its own id at first, a new one after /clear (Claude Code
   * starts another conversation then); absent = `id`
   */
  conversationId?: string;
  /** how full the conversation's context is, in tokens, as of the last answer (`max`: the model's window) */
  context?: { used: number; max: number };
  /** Remote Control is on: the session is also reachable from claude.ai/code and the Claude app, at `url` ('' until known) */
  remote?: RemoteControl;
}

export interface RemoteControl { url: string; state: 'connecting' | 'connected' | 'failed' }

/* The session panel's own views of what Claude Code knows (/mcp, /context, /usage), read from it (server/inspect.ts) */

/** `pending`: still connecting; `needs-auth`: waits for the user to sign in. */
export type McpState = 'connected' | 'pending' | 'failed' | 'needs-auth' | 'disabled';
/** Where a server is set up: the user's settings, the folder's (project, local), a plugin, claude.ai's connectors. */
export type McpSource = 'user' | 'project' | 'local' | 'plugin' | 'claudeai' | 'other';
export interface McpServer { name: string; state: McpState; source: McpSource; transport: string; tools: number; error?: string }
export type McpAction = 'reconnect' | 'enable' | 'disable' | 'authenticate';

/** `deferred`: loaded only when used, not counted; `buffer`: kept free for the automatic summary. */
export interface ContextCategory { name: string; tokens: number; kind: 'used' | 'deferred' | 'buffer' | 'free' }
export interface ContextUsage {
  model: string;
  used: number;
  max: number;
  categories: ContextCategory[];
  memoryFiles: { path: string; kind: string; tokens: number }[];
  /** the conversation is summarized when it gets this big, null when that is off */
  autoCompactAt: number | null;
}

/** A plan limit: `model` for a weekly limit on one model; `percent` 0-100; `resetsAt` ms. */
export interface UsageLimit { kind: 'session' | 'weekly' | 'weeklyModel' | 'other'; model?: string; percent: number; resetsAt: number | null }
export interface UsageShare { name: string; percent: number }
export interface UsageReport {
  /** "max", "pro"…, '' when not on a plan */
  plan: string;
  limits: UsageLimit[];
  session: { costUsd: number; durationMs: number; apiMs: number; linesAdded: number; linesRemoved: number };
  /** what weighed on the limits these seven days, on this machine, by share of the requests */
  week: { requests: number; sessions: number; skills: UsageShare[]; agents: UsageShare[]; mcpServers: UsageShare[] } | null;
}

export type Inspection = { view: 'mcp'; servers: McpServer[] } | { view: 'context'; usage: ContextUsage } | { view: 'usage'; report: UsageReport };
export type InspectView = Inspection['view'];

/** `aliases`: other names it answers to ("impeccable" for "impeccable:impeccable") */
export interface SlashCommand { name: string; description?: string; argumentHint?: string; aliases?: string[] }

/** How hard Claude thinks (Claude Code's --effort); a session without one runs at the model's default. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/** A model Claude Code offers (from its initialize answer): `value` is what --model takes ('default' : its default). */
export interface ModelChoice { value: string; label: string; description?: string; efforts: Effort[] }

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
  /** other files sent with it, by their upload id */
  files?: string[];
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
  /** the crew without a session drops by the office now and then (src/room/visitors.ts) */
  officeLife: boolean;
  /** the office pet: a cat, a dog, Rocky, or none */
  pet: PetChoice;
  /** the folder of the whiteboard's notes, one Markdown file per project (absolute; ~/Journal by default) */
  journalFolder: string;
  /** the Markdown file the office's numbers object shows, kept up to date by the user's scripts or sessions (absolute; '' by default: no object) */
  metricsFile: string;
  /** the language of the page, the server's messages and new agents' instructions; absent until chosen (the browser's then) */
  language?: Language;
}

/** A note of the whiteboard (a Markdown file of the journal folder, see shared/journal.ts): its file name, its last change (ms). */
export interface NoteFile { name: string; mtime: number }
/** A note's text, and its version (a hash of the text): a save carries the version it was made from, and is refused when the file changed since. */
export interface Note extends NoteFile { text: string; version: string }

/** The numbers file as it is on the disk: its text and its last change (ms). */
export interface MetricsFile { text: string; mtime: number }

/** A folder offered at the onboarding as a place for sessions to run in: how many projects it holds (-1: not looked into). */
export interface RootSuggestion { path: string; projects: number }

export type ClientMessage =
  | { t: 'create'; options: SessionOptions }
  /** the Claude Code conversations of a folder, to resume one */
  | { t: 'conversations'; cwd: string }
  | { t: 'send'; sessionId: string; text: string; images?: ImageUpload[]; files?: string[] }
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
  /** what a session changed in its files */
  | { t: 'changes'; sessionId: string }
  /** turns Remote Control on or off for a session (its process starts if needed, and stays while it is on) */
  /** changes the model or the effort of a session, at once if its process runs, else from its next launch ('' : the default) */
  | { t: 'tune'; sessionId: string; model?: string; effort?: Effort | '' }
  | { t: 'remoteControl'; sessionId: string; enabled: boolean }
  /** opens a terminal window on the user's computer, in the default folder */
  | { t: 'openTerminal' }
  /** runs a command typed with "!" in the session's folder, without Claude; Claude learns of it with the next message */
  | { t: 'shell'; sessionId: string; command: string }
  | { t: 'stopShell'; sessionId: string; shellId: string }
  /** asks a session's Claude Code for one of the panel's views (its process starts if needed) */
  | { t: 'inspect'; sessionId: string; view: InspectView }
  /** reconnects, turns on or off, or signs in to one of a session's MCP servers; the MCP view follows */
  | { t: 'mcpAction'; sessionId: string; server: string; action: McpAction }
  /** adds a crew member (previousName null) or updates the one called previousName */
  | { t: 'saveMember'; previousName: string | null; name: string; look: Look; birthday?: string; jobs?: Job[] }
  | { t: 'removeMember'; name: string }
  /** someone of the crew becomes the user */
  | { t: 'becomeSelf'; name: string }
  /** the notes of the whiteboard (the journal folder) */
  | { t: 'notes' }
  | { t: 'readNote'; name: string }
  /** saves a note made from `version` (null: a new one); the folder is created if needed */
  | { t: 'writeNote'; name: string; text: string; version: string | null }
  /** reads the numbers file to show it: its numbers then count as seen */
  | { t: 'metrics' }
  /** what a music app of the computer plays, after `action` when there is one (the radio asks every few seconds) */
  | { t: 'music'; app: MusicApp; action?: MusicAction }
  /** Music's playlists, and the tracks of its library that match `query` (none for an empty query) */
  | { t: 'musicLibrary'; query: string };

export type ServerMessage =
  | { t: 'hello'; claude: ClaudeInfo; roots: string[]; sessions: SessionInfo[]; commands: SlashCommand[]; folderCommands: Record<string, SlashCommand[]>; models: ModelChoice[]; quota: Quota | null; build: string; crew: CrewMember[]; preferences: Preferences; onboarded: boolean; rootsLocked: boolean }
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
  /** the commands of no folder in particular (the user's own, the plugins', Claude Code's) */
  | { t: 'commands'; commands: SlashCommand[] }
  /** the commands of a session folder: the ones above and the folder's own */
  | { t: 'folderCommands'; cwd: string; commands: SlashCommand[] }
  | { t: 'models'; models: ModelChoice[] }
  | { t: 'directories'; directories: string[] }
  | { t: 'changes'; sessionId: string; changes: SessionChanges }
  | { t: 'inspection'; sessionId: string; inspection: Inspection }
  | { t: 'quota'; quota: Quota }
  /** the journal folder and its notes, by name */
  | { t: 'notes'; folder: string; files: NoteFile[] }
  /** a note as it is on the disk: read, just saved, or changed since the version a save was made from (`conflict`: not saved) */
  | { t: 'note'; note: Note; outcome: 'read' | 'saved' | 'conflict' }
  /** the numbers file, null when there is none yet (asked for with 'metrics') */
  | { t: 'metrics'; metrics: MetricsFile | null }
  /** whether the numbers file changed since the page last showed it (the badge on the numbers object); sent at connection and when it flips */
  | { t: 'metricsStatus'; unread: boolean }
  /** the music apps the radio can drive, sent at connection (none outside macOS) */
  | { t: 'musicApps'; apps: MusicApp[] }
  | { t: 'music'; nowPlaying: NowPlaying }
  | { t: 'musicLibrary'; query: string; playlists: string[]; tracks: MusicTrack[] }
  | { t: 'toast'; kind: 'info' | 'error'; text: string };

/** A side question (/btw) and its answer. */
export interface Aside { question: string; answer: string; state: 'asking' | 'answered' | 'failed' }
