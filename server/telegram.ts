// Telegram's Bot API, as much as the messengers need (server/messengers.ts): the one outgoing connection of Open Space,
// to api.telegram.org only, and only once the user added a bot. Long polling (getUpdates) brings the messages, so no
// public address nor tunnel is needed.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.telegram.org';
/** How long a getUpdates waits for a message before answering empty, in seconds. */
export const POLL_SECONDS = 30;
/** Telegram's limit for a message's text. */
export const MAX_TEXT = 4096;
/** Telegram's limit for a caption. */
export const MAX_CAPTION = 1024;
/** What a bot can download from Telegram. */
export const MAX_DOWNLOAD = 20 * 1024 * 1024;
/** What a bot can send as a file. */
export const MAX_SEND = 50 * 1024 * 1024;

export interface TelegramFile { file_id: string; file_name?: string; file_size?: number; mime_type?: string }
export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TelegramFile[];
  document?: TelegramFile;
  video?: TelegramFile;
  audio?: TelegramFile;
  voice?: TelegramFile;
  reply_to_message?: { message_id: number };
}
export interface TelegramCallback { id: string; data?: string; message?: { message_id: number; chat: { id: number } } }
export interface TelegramUpdate { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallback }
export interface Button { text: string; callback_data: string }

/** Telegram refused the call: `code` 401 for a wrong token, 409 when another program reads the same bot. */
export class TelegramError extends Error {
  readonly code: number;
  constructor(code: number, description: string) {
    super(description);
    this.code = code;
  }
}

async function answer<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { ok?: boolean; result?: T; error_code?: number; description?: string } | null;
  if (!body?.ok) throw new TelegramError(body?.error_code ?? response.status, body?.description ?? response.statusText);
  return body.result as T;
}

/** One method of the Bot API with a JSON body. */
export async function call<T>(token: string, method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  return answer<T>(await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }));
}

const PHOTO = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO = new Set(['.mp4', '.mov', '.webm']);

/** How a file goes: a photo and a video are shown in the chat, anything else is a document. */
export function sendMethod(file: string): ['sendPhoto', 'photo'] | ['sendVideo', 'video'] | ['sendDocument', 'document'] {
  const extension = path.extname(file).toLowerCase();
  if (PHOTO.has(extension)) return ['sendPhoto', 'photo'];
  if (VIDEO.has(extension)) return ['sendVideo', 'video'];
  return ['sendDocument', 'document'];
}

/** Sends a file of the disk to a chat. */
export async function sendFile(token: string, chatId: number, file: string, caption = '', replyTo?: number): Promise<TelegramMessage> {
  const bytes = await readFile(file);
  if (bytes.length > MAX_SEND) throw new TelegramError(413, 'file too large');
  const [method, field] = sendMethod(file);
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, MAX_CAPTION));
  if (replyTo) form.append('reply_parameters', JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  form.append(field, new Blob([bytes]), path.basename(file));
  return answer<TelegramMessage>(await fetch(`${API}/bot${token}/${method}`, { method: 'POST', body: form }));
}

/** The file a message carries (the largest size of a photo), if any. */
export function attachedFile(message: TelegramMessage): (TelegramFile & { name: string }) | null {
  const photo = message.photo?.at(-1);
  if (photo) return { ...photo, name: `photo-${message.message_id}.jpg` };
  const other = message.document ?? message.video ?? message.audio ?? message.voice;
  if (!other) return null;
  const fallback = message.voice ? `voice-${message.message_id}.ogg` : `file-${message.message_id}`;
  return { ...other, name: other.file_name || fallback };
}

/** Downloads a file sent to the bot. */
export async function download(token: string, fileId: string): Promise<Buffer> {
  const found = await call<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId });
  if (!found.file_path || (found.file_size ?? 0) > MAX_DOWNLOAD) throw new TelegramError(413, 'file too large');
  const response = await fetch(`${API}/file/bot${token}/${found.file_path}`);
  if (!response.ok) throw new TelegramError(response.status, response.statusText);
  return Buffer.from(await response.arrayBuffer());
}

/** A text cut to what Telegram takes. */
export const fit = (text: string, max = MAX_TEXT) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A command and what follows it: "/run ticket PROJ-12" gives ['run', 'ticket PROJ-12']; null for plain words. */
export function parseCommand(text: string): [string, string] | null {
  const found = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return found ? [found[1]!.toLowerCase(), (found[2] ?? '').trim()] : null;
}
