// Runtime validation of what a WebSocket client sends. Nothing from the network is trusted: unknown or
// malformed messages are dropped (null), strings are bounded.
import { isPermissionMode, type ClientMessage, type ImageUpload, type PermissionDecision, type SessionOptions } from '../shared/protocol.ts';
import { IMAGE_EXTENSIONS } from './attachments.ts';
import { parseBirthday } from '../shared/festivals.ts';
import { parseLook } from '../shared/look.ts';
import { DEFAULT_PREFERENCES, parsePreferences } from './settings.ts';
import { CONVERSATION_ID } from './conversations.ts';
import { asJson, asNumber, isJson } from './json.ts';

export const MAX_TEXT = 20_000;
export const MAX_NAME = 40;
/** Session tags are short labels. */
export const MAX_TAG = 24;
/** Pictures per message, and the size of one in base64 (Claude takes 5 MB a picture; the page shrinks them first). */
export const MAX_IMAGES = 8;
const MAX_IMAGE_BASE64 = Math.floor(5 * 1024 * 1024 * 4 / 3);
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,79}$/;

const boundedString = (value: unknown, max: number): string | null => (typeof value === 'string' && value.length <= max ? value : null);
const identifier = (value: unknown): string | null => (typeof value === 'string' && /^[\w-]{1,100}$/.test(value) ? value : null);

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
  if (options.resumeId !== undefined) {
    if (typeof options.resumeId !== 'string' || !CONVERSATION_ID.test(options.resumeId)) return null;
    result.resumeId = options.resumeId;
  }
  return result;
}

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
      if (!sessionId || text === null || images === null) return null;
      return images ? { t: 'send', sessionId, text, images } : { t: 'send', sessionId, text };
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
    case 'forget': return sessionId ? { t: 'forget', sessionId } : null;
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
    case 'conversations': {
      const cwd = boundedString(raw.cwd, 4096);
      return cwd ? { t: 'conversations', cwd } : null;
    }
    case 'saveMember': {
      const name = boundedString(raw.name, MAX_NAME);
      const look = parseLook(raw.look);
      const previousName = raw.previousName === null ? null : boundedString(raw.previousName, MAX_NAME);
      const birthday = parseBirthday(raw.birthday);
      return name !== null && look !== null && (previousName !== null || raw.previousName === null) ? { t: 'saveMember', previousName, name, look, ...(birthday ? { birthday } : {}) } : null;
    }
    case 'removeMember': {
      const name = boundedString(raw.name, MAX_NAME);
      return name !== null ? { t: 'removeMember', name } : null;
    }
    default: return null;
  }
}
