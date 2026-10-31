// Runtime validation of what a WebSocket client sends. Nothing from the network is trusted: unknown or
// malformed messages are dropped (null), strings are bounded.
import { BRANCH_ACTIONS, EFFORTS, isPermissionMode, MAX_SESSION_FILE, MAX_TEXT, type BranchAction, type CleanedBranch, type ClientMessage, type Effort, type FileAction, type ImageUpload, type InspectView, type McpAction, type PermissionDecision, type SessionOptions } from '../shared/protocol.ts';
import { IMAGE_EXTENSIONS } from './attachments.ts';
import { MAX_FILES, UPLOAD_ID } from './uploads.ts';
import { parseBirthday } from '../shared/festivals.ts';
import { MAX_NOTE, NOTE_NAME } from '../shared/journal.ts';
import { isEntryName } from './files.ts';
import { parseJobs } from '../shared/jobs.ts';
import { isSecretName, MAX_SECRET_LENGTH, MAX_SECRETS, type SecretEntry } from '../shared/secrets.ts';
import { parseLook } from '../shared/look.ts';
import { MUSIC_APPS, type MusicAction, type MusicApp } from '../shared/music.ts';
import type { BrowserAction, BrowserInput, MouseButton } from '../shared/browser.ts';
import { DEFAULT_PREFERENCES, parsePreferences } from './settings.ts';
import { CONVERSATION_ID } from './conversations.ts';
import { asJson, asNumber, isJson } from './json.ts';

export const MAX_NAME = 40;
/** Session tags are short labels. */
export const MAX_TAG = 24;
const MAX_SEARCH = 100;
/** The search over every session's threads takes a few words. */
const MAX_QUERY = 200;
/** Pictures per message, and the size of one in base64 (Claude takes 5 MB a picture; the page shrinks them first). */
export const MAX_IMAGES = 8;
const MAX_IMAGE_BASE64 = Math.floor(5 * 1024 * 1024 * 4 / 3);
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,79}$/;

const boundedString = (value: unknown, max: number): string | null => (typeof value === 'string' && value.length <= max ? value : null);
const INSPECT_VIEWS: ReadonlySet<InspectView> = new Set(['mcp', 'context', 'usage']);
const MCP_ACTIONS: ReadonlySet<McpAction> = new Set(['reconnect', 'enable', 'disable', 'authenticate']);
const identifier = (value: unknown): string | null => (typeof value === 'string' && /^[\w-]{1,100}$/.test(value) ? value : null);
const MAX_NOTE_QUERY = 200;
const noteName = (value: unknown): string | null => (typeof value === 'string' && NOTE_NAME.test(value) ? value : null);

/** A path from a session's folder, as the explorer sends it ("/" between names, '' for the folder itself): no ".." nor absolute path. */
export function relativePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1024 || value.includes('\0') || value.includes('\\') || value.startsWith('/')) return null;
  return value.split('/').every((name) => name !== '..' && name !== '.') ? value.replace(/\/+$/, '') : null;
}

function parseFileAction(raw: unknown): FileAction | null {
  if (!isJson(raw)) return null;
  const name = typeof raw.name === 'string' && isEntryName(raw.name) ? raw.name : null;
  switch (raw.kind) {
    case 'newFile':
    case 'newFolder': {
      const folder = relativePath(raw.folder);
      return folder !== null && name ? { kind: raw.kind, folder, name } : null;
    }
    case 'rename': {
      const at = relativePath(raw.path);
      return at && name ? { kind: 'rename', path: at, name } : null;
    }
    case 'delete': {
      const at = relativePath(raw.path);
      return at ? { kind: 'delete', path: at } : null;
    }
    default: return null;
  }
}

/** The upload ids of the files sent with a message (see uploads.ts): undefined when none, null when malformed. */
function parseFiles(raw: unknown): string[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_FILES || !raw.every((id) => typeof id === 'string' && UPLOAD_ID.test(id))) return null;
  return raw.length ? raw as string[] : undefined;
}

/** Undefined when there are none; null when something is wrong with them (the whole message is then dropped). */
function parseImages(raw: unknown): ImageUpload[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_IMAGES) return null;
  const images: ImageUpload[] = [];
  for (const item of raw) {
    const image = asJson(item);
    const mediaType = image.mediaType;
    if (typeof mediaType !== 'string' || !Object.hasOwn(IMAGE_EXTENSIONS, mediaType)) return null;
    if (typeof image.data !== 'string' || !image.data || image.data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) return null;
    images.push({ mediaType: mediaType as ImageUpload['mediaType'], data: image.data });
  }
  return images.length ? images : undefined;
}

function parseOptions(raw: unknown): SessionOptions | null {
  const options = asJson(raw);
  const cwd = boundedString(options.cwd, 1000);
  if (!cwd) return null;
  const result: SessionOptions = { cwd };
  if (options.model !== undefined) {
    if (typeof options.model !== 'string' || (options.model !== '' && !MODEL_PATTERN.test(options.model))) return null;
    result.model = options.model;
  }
  if (options.effort !== undefined) {
    if (!(EFFORTS as readonly unknown[]).includes(options.effort)) return null;
    result.effort = options.effort as Effort;
  }
  if (options.ultracode !== undefined) {
    if (typeof options.ultracode !== 'boolean') return null;
    result.ultracode = options.ultracode;
  }
  if (options.permissionMode !== undefined) {
    if (!isPermissionMode(options.permissionMode)) return null;
    result.permissionMode = options.permissionMode;
  }
  if (options.name !== undefined) {
    const name = boundedString(options.name, MAX_NAME);
    if (name === null) return null;
    result.name = name;
  }
  if (options.text !== undefined) {
    const text = boundedString(options.text, MAX_TEXT);
    if (text === null) return null;
    result.text = text;
  }
  if (options.trust !== undefined) {
    if (options.trust !== 'folder' && options.trust !== 'restricted') return null;
    result.trust = options.trust;
  }
  const images = parseImages(options.images);
  if (images === null) return null;
  if (images) result.images = images;
  const files = parseFiles(options.files);
  if (files === null) return null;
  if (files) result.files = files;
  if (options.resumeId !== undefined) {
    if (typeof options.resumeId !== 'string' || !CONVERSATION_ID.test(options.resumeId)) return null;
    result.resumeId = options.resumeId;
  }
  if (options.isolate !== undefined) {
    const base = isJson(options.isolate) ? options.isolate.base : null;
    if (base !== undefined && !isBranchName(base)) return null;
    result.isolate = base ? { base: base as string } : {};
  }
  return result;
}

/**
 * A local branch's name as git takes it (git check-ref-format: accents and other letters are fine): no control
 * character, space, ~ ^ : ? * [ or backslash, no "..", "@{" or "//", not starting with "-" or "/", not ending with
 * "/", "." or ".lock". Only ever compared with the server's own lists, and passed to git as one argument.
 */
const isBranchName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this refuses
  && !/[\u0000-\u0020\u007f~^:?*[\\]/.test(value) && !value.startsWith('-') && !value.startsWith('/')
  && !value.includes('..') && !value.includes('@{') && !value.includes('//') && !value.endsWith('/') && !value.endsWith('.') && !value.endsWith('.lock');
/** A commit's name as git prints it (sha-1 or sha-256). */
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const SWITCH_OFF_BRANCH: ReadonlySet<string> = new Set(['merge', 'keep', 'discard']);
/** How many branches the cleaning panel may remove at once. */
const MAX_CLEANED = 200;

const DECISIONS: readonly PermissionDecision[] = ['allow', 'deny', 'always'];
/** AskUserQuestion takes at most 4 questions */
const MAX_ANSWERS = 4;

/** question text -> answer, both bounded strings */
function parseAnswers(raw: unknown): Record<string, string> | null {
  if (!isJson(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length === 0 || entries.length > MAX_ANSWERS) return null;
  const answers: Record<string, string> = {};
  for (const [question, answer] of entries) {
    const text = boundedString(answer, MAX_TEXT);
    if (question.length > MAX_TEXT || text === null) return null;
    answers[question] = text;
  }
  return answers;
}

/** The user's bust is 20 x 21 pixels: a few kilobytes at most. */
const MAX_AVATAR = 40_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isJson(raw) || typeof raw.t !== 'string') return null;
  const sessionId = identifier(raw.sessionId);
  switch (raw.t) {
    case 'create': {
      const options = parseOptions(raw.options);
      return options ? { t: 'create', options } : null;
    }
    case 'send': {
      const text = boundedString(raw.text, MAX_TEXT);
      const images = parseImages(raw.images);
      const files = parseFiles(raw.files);
      if (!sessionId || text === null || images === null || files === null) return null;
      return { t: 'send', sessionId, text, ...(images ? { images } : {}), ...(files ? { files } : {}) };
    }
    case 'answer': {
      const requestId = identifier(raw.requestId);
      const decision = DECISIONS.find((candidate) => candidate === raw.decision);
      return sessionId && requestId && decision ? { t: 'answer', sessionId, requestId, decision } : null;
    }
    case 'reply': {
      const requestId = identifier(raw.requestId);
      const answers = parseAnswers(raw.answers);
      return sessionId && requestId && answers ? { t: 'reply', sessionId, requestId, answers } : null;
    }
    case 'secrets': {
      const requestId = raw.requestId === undefined ? undefined : identifier(raw.requestId);
      const entries = Array.isArray(raw.entries) && raw.entries.length <= MAX_SECRETS ? raw.entries.map(parseSecret) : null;
      if (!sessionId || requestId === null || !entries?.length || entries.some((entry) => !entry)) return null;
      return { t: 'secrets', sessionId, ...(requestId ? { requestId } : {}), entries: entries as SecretEntry[] };
    }
    case 'forgetSecrets': {
      if (!sessionId) return null;
      if (raw.names === undefined) return { t: 'forgetSecrets', sessionId };
      const names = Array.isArray(raw.names) && raw.names.length <= MAX_SECRETS && raw.names.every((name) => typeof name === 'string' && isSecretName(name)) ? raw.names as string[] : null;
      return names ? { t: 'forgetSecrets', sessionId, names } : null;
    }
    case 'interrupt': return sessionId ? { t: 'interrupt', sessionId } : null;
    case 'unqueue': {
      const queueId = identifier(raw.queueId);
      return sessionId && queueId ? { t: 'unqueue', sessionId, queueId } : null;
    }
    case 'sendNow': return sessionId ? { t: 'sendNow', sessionId } : null;
    case 'aside': {
      const question = boundedString(raw.question, MAX_TEXT)?.trim();
      return sessionId && question ? { t: 'aside', sessionId, question } : null;
    }
    case 'asideClose': return sessionId ? { t: 'asideClose', sessionId } : null;
    case 'presence': return typeof raw.active === 'boolean' ? { t: 'presence', active: raw.active } : null;
    case 'preferences': return { t: 'preferences', preferences: parsePreferences(raw.preferences) };
    case 'suggestRoots': return { t: 'suggestRoots' };
    case 'avatar': {
      const png = boundedString(raw.png, MAX_AVATAR);
      return png && /^[A-Za-z0-9+/]+=*$/.test(png) && Buffer.from(png, 'base64').subarray(0, 8).equals(PNG_SIGNATURE) ? { t: 'avatar', png } : null;
    }
    case 'onboard': {
      const self = isJson(raw.self) ? raw.self : {};
      const name = boundedString(self.name, MAX_NAME)?.trim();
      const look = parseLook(self.look);
      const birthday = parseBirthday(self.birthday);
      if (!name || !look) return null;
      return { t: 'onboard', self: { name, look, ...(birthday ? { birthday } : {}) }, preferences: { ...DEFAULT_PREFERENCES, ...parsePreferences(raw.preferences) } };
    }
    case 'close': return sessionId ? { t: 'close', sessionId } : null;
    case 'forget': {
      if (!sessionId) return null;
      if (raw.branch === undefined) return { t: 'forget', sessionId };
      return typeof raw.branch === 'string' && SWITCH_OFF_BRANCH.has(raw.branch) ? { t: 'forget', sessionId, branch: raw.branch as 'merge' | 'keep' | 'discard' } : null;
    }
    case 'folderInfo': {
      const cwd = boundedString(raw.cwd, 4096);
      return cwd ? { t: 'folderInfo', cwd } : null;
    }
    case 'branch': return sessionId && BRANCH_ACTIONS.some((action) => action === raw.action) ? { t: 'branch', sessionId, action: raw.action as BranchAction } : null;
    case 'branches': {
      const cwd = boundedString(raw.cwd, 4096);
      return cwd ? { t: 'branches', cwd } : null;
    }
    case 'cleanBranches': {
      const cwd = boundedString(raw.cwd, 4096);
      if (!cwd || !Array.isArray(raw.branches) || raw.branches.length > MAX_CLEANED) return null;
      const branches: CleanedBranch[] = [];
      for (const item of raw.branches) {
        if (!isJson(item)) return null;
        const branch = item.branch === '' ? '' : isBranchName(item.branch) ? item.branch : null;
        const folder = item.folder === null ? null : boundedString(item.folder, 4096);
        if (branch === null || (folder === null && item.folder !== null) || (!branch && !folder)) return null;
        if (typeof item.head !== 'string' || !COMMIT.test(item.head) || !Number.isInteger(item.dirty) || (item.dirty as number) < 0) return null;
        branches.push({ branch, folder, head: item.head, dirty: item.dirty as number });
      }
      return { t: 'cleanBranches', cwd, branches };
    }
    case 'rename': {
      const name = boundedString(raw.name, MAX_NAME);
      return sessionId && name !== null ? { t: 'rename', sessionId, name } : null;
    }
    case 'rest': return sessionId ? { t: 'rest', sessionId } : null;
    case 'tag': {
      const tag = typeof raw.tag === 'string' ? raw.tag.trim().slice(0, MAX_TAG) : null;
      return sessionId && tag !== null ? { t: 'tag', sessionId, tag } : null;
    }
    case 'log': return sessionId ? { t: 'log', sessionId, after: Math.max(0, Math.floor(asNumber(raw.after))) } : null;
    case 'directories': return { t: 'directories' };
    case 'updateClaude': return { t: 'updateClaude' };
    case 'claudeLogin': return { t: 'claudeLogin' };
    case 'claudeLogout': return { t: 'claudeLogout' };
    case 'duplicate': return sessionId ? { t: 'duplicate', sessionId } : null;
    case 'restartOutdated': return { t: 'restartOutdated' };
    case 'restartApp': return { t: 'restartApp' };
    case 'checkApp': return { t: 'checkApp' };
    case 'changes': return sessionId ? { t: 'changes', sessionId } : null;
    case 'listFolder': {
      const folder = relativePath(raw.folder);
      return sessionId && folder !== null ? { t: 'listFolder', sessionId, folder } : null;
    }
    case 'readFile':
    case 'revealFile': {
      const at = relativePath(raw.path);
      return sessionId && at ? { t: raw.t, sessionId, path: at } : null;
    }
    case 'writeFile': {
      const at = relativePath(raw.path);
      const text = boundedString(raw.text, MAX_SESSION_FILE);
      const version = typeof raw.version === 'string' && /^[0-9a-f]{16}$/.test(raw.version) ? raw.version : null;
      return sessionId && at && text !== null && version ? { t: 'writeFile', sessionId, path: at, text, version } : null;
    }
    case 'fileAction': {
      const action = parseFileAction(raw.action);
      return sessionId && action ? { t: 'fileAction', sessionId, action } : null;
    }
    case 'tune': {
      if (!sessionId) return null;
      const model = raw.model === undefined || (typeof raw.model === 'string' && (raw.model === '' || MODEL_PATTERN.test(raw.model))) ? raw.model as string | undefined : null;
      const effort = raw.effort === undefined || raw.effort === '' || (EFFORTS as readonly unknown[]).includes(raw.effort) ? raw.effort as Effort | '' | undefined : null;
      const ultracode = raw.ultracode === undefined || typeof raw.ultracode === 'boolean' ? raw.ultracode : null;
      const permissionMode = raw.permissionMode === undefined || isPermissionMode(raw.permissionMode) ? raw.permissionMode : null;
      if (model === null || effort === null || ultracode === null || permissionMode === null) return null;
      if (model === undefined && effort === undefined && ultracode === undefined && permissionMode === undefined) return null;
      return {
        t: 'tune', sessionId, ...(model !== undefined ? { model } : {}), ...(effort !== undefined ? { effort } : {}), ...(ultracode !== undefined ? { ultracode } : {}),
        ...(permissionMode !== undefined ? { permissionMode } : {}),
      };
    }
    case 'remoteControl': return sessionId && typeof raw.enabled === 'boolean' ? { t: 'remoteControl', sessionId, enabled: raw.enabled } : null;
    case 'openTerminal': return raw.sessionId === undefined ? { t: 'openTerminal' } : sessionId ? { t: 'openTerminal', sessionId } : null;
    case 'shell': {
      const command = boundedString(raw.command, 10_000)?.trim();
      return sessionId && command ? { t: 'shell', sessionId, command } : null;
    }
    case 'stopShell': {
      const shellId = boundedString(raw.shellId, 100);
      return sessionId && shellId ? { t: 'stopShell', sessionId, shellId } : null;
    }
    case 'inspect': return sessionId && INSPECT_VIEWS.has(raw.view as InspectView) ? { t: 'inspect', sessionId, view: raw.view as InspectView } : null;
    case 'mcpAction': {
      const server = boundedString(raw.server, 200);
      return sessionId && server && MCP_ACTIONS.has(raw.action as McpAction) ? { t: 'mcpAction', sessionId, server, action: raw.action as McpAction } : null;
    }
    case 'conversations': {
      const cwd = boundedString(raw.cwd, 4096);
      const query = boundedString(raw.query, 200);
      return cwd ? { t: 'conversations', cwd, ...(query ? { query } : {}) } : null;
    }
    case 'saveMember': {
      const name = boundedString(raw.name, MAX_NAME);
      const look = parseLook(raw.look);
      const previousName = raw.previousName === null ? null : boundedString(raw.previousName, MAX_NAME);
      const birthday = parseBirthday(raw.birthday);
      const jobs = parseJobs(raw.jobs);
      return name !== null && look !== null && (previousName !== null || raw.previousName === null)
        ? { t: 'saveMember', previousName, name, look, ...(birthday ? { birthday } : {}), ...(jobs.length ? { jobs } : {}) } : null;
    }
    case 'removeMember': {
      const name = boundedString(raw.name, MAX_NAME);
      return name !== null ? { t: 'removeMember', name } : null;
    }
    case 'becomeSelf': {
      const name = boundedString(raw.name, MAX_NAME);
      return name !== null ? { t: 'becomeSelf', name } : null;
    }
    case 'notes': return { t: 'notes' };
    case 'readNote': {
      const name = noteName(raw.name);
      return name ? { t: 'readNote', name } : null;
    }
    case 'writeNote': {
      const name = noteName(raw.name);
      const text = boundedString(raw.text, MAX_NOTE);
      const version = raw.version === null ? null : typeof raw.version === 'string' && /^[0-9a-f]{16}$/.test(raw.version) ? raw.version : undefined;
      return name && text !== null && version !== undefined ? { t: 'writeNote', name, text, version } : null;
    }
    case 'renameNote': {
      const name = noteName(raw.name);
      const newName = noteName(raw.newName);
      return name && newName && name !== newName ? { t: 'renameNote', name, newName } : null;
    }
    case 'deleteNote': {
      const name = noteName(raw.name);
      return name ? { t: 'deleteNote', name } : null;
    }
    case 'searchNotes': {
      const query = boundedString(raw.query, MAX_NOTE_QUERY);
      return query !== null ? { t: 'searchNotes', query } : null;
    }
    case 'metrics': return { t: 'metrics' };
    case 'search': {
      const query = boundedString(raw.query, MAX_QUERY);
      const id = asNumber(raw.id, -1);
      return query !== null && Number.isInteger(id) && id >= 0 ? { t: 'search', id, query } : null;
    }
    case 'costs': return { t: 'costs', ...(raw.fresh === true ? { fresh: true } : {}) };
    case 'music': {
      if (!MUSIC_APPS.includes(raw.app as MusicApp)) return null;
      if (raw.action === undefined) return { t: 'music', app: raw.app as MusicApp };
      const action = parseMusicAction(raw.action);
      return action ? { t: 'music', app: raw.app as MusicApp, action } : null;
    }
    case 'musicLibrary': {
      const query = boundedString(raw.query, MAX_SEARCH);
      return query !== null ? { t: 'musicLibrary', query: query.trim() } : null;
    }
    case 'browser': {
      const action = parseBrowserAction(raw.action);
      return sessionId && action ? { t: 'browser', sessionId, lane: laneNumber(raw.lane), action } : null;
    }
    case 'browserInput': {
      const input = parseBrowserInput(raw.input);
      return sessionId && input ? { t: 'browserInput', sessionId, lane: laneNumber(raw.lane), input } : null;
    }
    default: return null;
  }
}

/** which browser of the session (shared/browser.ts browserId): its own when not said */
const laneNumber = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100 ? value : 0);

function parseBrowserAction(value: unknown): BrowserAction | null {
  if (!isJson(value)) return null;
  switch (value.kind) {
    case 'open': case 'back': case 'forward': case 'reload': case 'stop': return { kind: value.kind };
    case 'navigate': { const url = boundedString(value.url, 4000); return url ? { kind: 'navigate', url } : null; }
    case 'tab': case 'closeTab': { const id = boundedString(value.id, 100); return id ? { kind: value.kind, id } : null; }
    case 'format': return value.format === 'desktop' || value.format === 'mobile' ? { kind: 'format', format: value.format } : null;
    default: return null;
  }
}

const MOUSE_TYPES = new Set(['mousePressed', 'mouseReleased', 'mouseMoved']);
const MOUSE_BUTTONS = new Set(['left', 'middle', 'right', 'none']);
const fraction = (value: unknown) => (typeof value === 'number' && value >= 0 && value <= 1 ? value : null);
const modifiers = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 15 ? value : 0);
const delta = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(-10_000, Math.min(10_000, value)) : 0);

function parseBrowserInput(value: unknown): BrowserInput | null {
  if (!isJson(value)) return null;
  const x = fraction(value.x), y = fraction(value.y);
  switch (value.kind) {
    case 'mouse': {
      if (x === null || y === null || !MOUSE_TYPES.has(value.type as string) || !MOUSE_BUTTONS.has(value.button as string)) return null;
      const clicks = typeof value.clicks === 'number' && Number.isInteger(value.clicks) ? Math.max(0, Math.min(3, value.clicks)) : 0;
      return { kind: 'mouse', type: value.type as 'mouseMoved', x, y, button: value.button as MouseButton, clicks, modifiers: modifiers(value.modifiers) };
    }
    case 'wheel': return x === null || y === null ? null : { kind: 'wheel', x, y, dx: delta(value.dx), dy: delta(value.dy) };
    case 'key': {
      const key = boundedString(value.key, 40), code = boundedString(value.code, 40);
      if (!key || code === null || (value.type !== 'keyDown' && value.type !== 'keyUp')) return null;
      return { kind: 'key', type: value.type, key, code, modifiers: modifiers(value.modifiers) };
    }
    case 'text': { const text = boundedString(value.text, MAX_TEXT); return text ? { kind: 'text', text } : null; }
    default: return null;
  }
}

function parseMusicAction(value: unknown): MusicAction | null {
  if (!isJson(value)) return null;
  switch (value.kind) {
    case 'toggle': case 'next': case 'previous': return { kind: value.kind };
    case 'volume': return typeof value.volume === 'number' && value.volume >= 0 && value.volume <= 100 ? { kind: 'volume', volume: value.volume } : null;
    case 'playlist': { const name = boundedString(value.name, 200); return name ? { kind: 'playlist', name } : null; }
    case 'track': return typeof value.id === 'string' && /^[0-9A-F]{16}$/.test(value.id) ? { kind: 'track', id: value.id } : null;
    default: return null;
  }
}

/** A key given in the box: a variable name and a value, never trimmed (a token is taken as pasted). */
function parseSecret(raw: unknown): SecretEntry | null {
  if (!isJson(raw) || typeof raw.name !== 'string' || typeof raw.value !== 'string') return null;
  return isSecretName(raw.name) && raw.value && raw.value.length <= MAX_SECRET_LENGTH ? { name: raw.name, value: raw.value } : null;
}
