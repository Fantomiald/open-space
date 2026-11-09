// The messengers: a chat app (Telegram for now) where the user follows and drives Open Space from the phone. A bot the
// user made sends what the sessions wait for (with buttons to answer), what they finished and the files they send;
// the user answers, writes to a session, or asks in plain words a small agent that drives Open Space (server/messengers.ts).

export const MESSENGER_KINDS = ['telegram'] as const;
export type MessengerKind = (typeof MESSENGER_KINDS)[number];
/** The chat apps that can come next: they reach Open Space without a public address (an outgoing connection), like Telegram. */
export const SOON_MESSENGERS = ['slack', 'discord'] as const;
export type SoonMessenger = (typeof SOON_MESSENGERS)[number];

/** A bot as the page sees it: never its token. */
export interface Messenger {
  id: string;
  kind: MessengerKind;
  name: string;
  /** its @username, once Telegram said it */
  username: string | null;
  /** a chat is linked: only that one is listened to */
  linked: boolean;
  /** what to send it (`/start <code>`) to link the chat, while none is */
  linkCode: string | null;
  /** it hears of every session, not only the runs of the triggers that name it */
  allSessions: boolean;
  /** the model of the agent answering plain words ('' : Haiku) */
  model: string;
  /** why it cannot reach Telegram now: its token refused, another program reading the same bot, or no network */
  problem: MessengerProblem | null;
}

/** What the user gives to add a bot, or to change one (the token only when adding or replacing it). */
export interface MessengerInput { name: string; token?: string; allSessions: boolean; model: string }

export type MessengerProblem = 'token' | 'elsewhere' | 'network';

export const MESSENGER_ID = /^[a-z0-9]{8,32}$/;
export const MAX_MESSENGERS = 10;
export const MAX_MESSENGER_NAME = 40;
/** The token @BotFather gives: the bot's number, a colon, then its secret. */
export const TELEGRAM_TOKEN = /^\d{5,16}:[\w-]{30,80}$/;
/** The agent's model by default: quick and cheap, enough to understand a request and call Open Space's tools. */
export const MESSENGER_MODEL = 'haiku';
const MODEL_NAME = /^[\w.[\]-]{0,80}$/;

export type MessengerError = 'token' | 'model' | 'tooMany' | 'unknown';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A bot's input from the page; `adding`: a token is then required. */
export function parseMessengerInput(raw: unknown, adding: boolean): { input: MessengerInput } | { error: MessengerError } {
  if (!isRecord(raw)) return { error: 'token' };
  // a bot without a name is called after its app
  const name = (typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_MESSENGER_NAME) : '') || 'Telegram';
  const token = typeof raw.token === 'string' ? raw.token.trim() : undefined;
  if ((adding || token) && !TELEGRAM_TOKEN.test(token ?? '')) return { error: 'token' };
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  if (!MODEL_NAME.test(model)) return { error: 'model' };
  return { input: { name, ...(token ? { token } : {}), allSessions: raw.allSessions === true, model } };
}

/** The bots a trigger names, as given: known ids only, without doubles. */
export function parseMessengerIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_MESSENGERS || !raw.every((id) => typeof id === 'string' && MESSENGER_ID.test(id))) return null;
  return [...new Set(raw as string[])];
}
