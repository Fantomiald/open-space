// The messengers (shared/messengers.ts): the user's Telegram bots, kept in OFFICE_DIR/messengers.json (readable by the
// user's account only: it holds their tokens, never sent to the page nor readable by a session's file tools).
//
// Each linked bot is told, every couple of seconds, about the sessions it follows (a trigger's runs that name it, the
// sessions it started, or every session when `allSessions`; not a session it started while Remote Control is on, since
// the Claude app already shows it, unless /follow asks for it, and never one /unfollow dropped): what they wait for, with buttons to answer (a permission,
// a question; keys are only given in Open Space), when they finish or stop on an error, and the files they send. An
// answer given in Open Space removes the buttons. A reply to one of these messages goes to its session, files included;
// commands start, stop and list sessions and triggers; plain words go to a small agent driving Open Space through its
// MCP server (server/messenger-agent.ts), which never answers a permission.
import { randomBytes, randomInt } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_MESSENGERS, MESSENGER_ID, type Messenger, type MessengerInput, type MessengerProblem } from '../shared/messengers.ts';
import type { LoggedEvent, PermissionDecision, PermissionPrompt, SessionInfo } from '../shared/protocol.ts';
import type { Trigger, TriggerRun } from '../shared/triggers.ts';
import { st } from './i18n/index.ts';
import * as telegram from './telegram.ts';
import type { Button, TelegramCallback, TelegramMessage, TelegramUpdate } from './telegram.ts';

/** How often the sessions are looked at. */
const TICK_MS = 2000;
/** The messages kept to route a reply to its session. */
const KEPT_REPLIES = 500;

interface Stored {
  id: string;
  kind: 'telegram';
  name: string;
  token: string;
  chatId: number | null;
  username: string | null;
  linkCode: string | null;
  allSessions: boolean;
  model: string;
  /** the agent's conversation, resumed from one message to the next */
  conversation: string | null;
}

export interface MessengersDeps {
  file: string;
  sessions: () => SessionInfo[];
  events: (sessionId: string, after: number) => LoggedEvent[];
  lastWords: (sessionId: string) => string;
  triggers: () => Trigger[];
  answer: (sessionId: string, requestId: string, decision: PermissionDecision) => void;
  reply: (sessionId: string, requestId: string, answers: Record<string, string>) => void;
  send: (sessionId: string, text: string, files: string[]) => void;
  interrupt: (sessionId: string) => void;
  remote: (sessionId: string, enabled: boolean) => void;
  fire: (triggerId: string, payload: string | null) => Promise<TriggerRun>;
  startSession: (cwd: string, prompt: string) => Promise<SessionInfo>;
  /** the project folders a session can start in */
  folders: () => string[];
  /** keeps a file sent to the bot, as an upload a session can open; its id */
  saveUpload: (name: string, bytes: Buffer) => string;
  /** where a file a session sent is kept */
  attachment: (stored: string) => string | null;
  /** answers plain words; `conversation`: to resume, null for a new one; gives back the conversation to resume next */
  agent: (bot: { id: string; model: string }, text: string, conversation: string | null) => Promise<{ text: string; conversation: string | null }>;
  onChange: () => void;
  log: (message: string, error?: unknown) => void;
  api?: typeof telegram;
}

/** A wait sent to a chat, and its message. */
interface Sent { chatId: number; messageId: number; text: string }
/** What a button stands for. */
interface Choice { botId: string; sessionId: string; requestId: string; questions?: PermissionPrompt['questions']; answers: Record<string, string>; picked: string[] }
type Question = NonNullable<PermissionPrompt['questions']>[number];

const linkCode = () => String(randomInt(100_000, 1_000_000));
const busy = (session: SessionInfo) => session.state === 'work' || session.state === 'starting';
/** Lowercase without accents, to match what is typed on a phone. */
const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** The item whose name `text` starts with (the longest), and what follows it; else the only one starting with its first word. */
export function matchByName<T>(items: readonly T[], name: (item: T) => string, text: string): { item: T; rest: string } | null {
  const typed = plain(text);
  const whole = items
    .filter((item) => { const known = plain(name(item)); return known && (typed === known || typed.startsWith(`${known} `)); })
    .sort((a, b) => name(b).length - name(a).length)[0];
  if (whole) return { item: whole, rest: text.trim().slice(name(whole).trim().length).trim() };
  const [first = '', ...others] = text.trim().split(/\s+/);
  const word = plain(first);
  const starting = word ? items.filter((item) => plain(name(item)).startsWith(word)) : [];
  return starting.length === 1 ? { item: starting[0]!, rest: others.join(' ') } : null;
}

/** A question's buttons: one per option, ticked when picked if several can be, then a button to send them. */
export function questionKeyboard(choice: number, question: Question, picked: readonly string[] = []): Button[][] {
  const rows = question.options.map((option, index) => [{
    text: `${question.multiSelect && picked.includes(option.label) ? '✓ ' : ''}${option.label}`.slice(0, 60), callback_data: `${question.multiSelect ? 'm' : 'q'}:${choice}:${index}`,
  }]);
  return question.multiSelect ? [...rows, [{ text: st.messengers.send, callback_data: `v:${choice}` }]] : rows;
}

/** What a session waits for, as a message and its buttons (`choice`: the number the buttons carry). */
export function waitMessage(session: SessionInfo, wait: PermissionPrompt, choice: number): { text: string; buttons: Button[][] } {
  const words = st.messengers;
  const who = session.trigger ? `${session.name} (${session.trigger.name})` : session.name;
  if (wait.secrets) return { text: words.keys(who), buttons: [] };
  const question = wait.questions?.[0];
  if (question) {
    return { text: telegram.fit(`${words.question(who, question.question)}\n\n${words.orReply}`), buttons: questionKeyboard(choice, question) };
  }
  const buttons: Button[] = [{ text: words.allow, callback_data: `p:${choice}:allow` }, { text: words.deny, callback_data: `p:${choice}:deny` }];
  if (wait.canAlways) buttons.push({ text: words.always, callback_data: `p:${choice}:always` });
  return { text: telegram.fit(words.permission(who, wait.tool ?? '', wait.detail ?? '')), buttons: [buttons] };
}

export class Messengers {
  private readonly deps: MessengersDeps;
  private readonly api: typeof telegram;
  private bots: Stored[] = [];
  private readonly problems = new Map<string, MessengerProblem>();
  private readonly polling = new Map<string, AbortController>();
  private readonly sent = new Map<string, Sent>();
  private readonly choices = new Map<number, Choice>();
  private nextChoice = 1;
  /** which session a message is about, by `bot|message`, for replies */
  private readonly about = new Map<string, string>();
  /** what was last seen of each session, by `bot|session` */
  private readonly seen = new Map<string, { seq: number; busy: boolean; state: SessionInfo['state'] }>();
  /** the sessions a bot started (by `/new` or its agent): it hears of them */
  private readonly started = new Set<string>();
  /** the sessions a bot was told to follow (`/follow`) or to leave alone (`/unfollow`), whatever else says: never both for one session */
  private readonly forced = new Map<string, boolean>();
  private timer: NodeJS.Timeout | null = null;
  /** the plain words of each bot, answered one after the other (they resume the same conversation) */
  private readonly asking = new Map<string, Promise<unknown>>();

  constructor(deps: MessengersDeps) {
    this.deps = deps;
    this.api = deps.api ?? telegram;
    try {
      const raw: unknown = JSON.parse(readFileSync(deps.file, 'utf8'));
      if (Array.isArray(raw)) this.bots = raw.filter((bot): bot is Stored => !!bot && typeof bot === 'object' && MESSENGER_ID.test(bot.id) && typeof bot.token === 'string').slice(0, MAX_MESSENGERS);
    } catch { /* none yet */ }
  }

  /** The bots as the page sees them. */
  list(): Messenger[] {
    return this.bots.map((bot) => ({
      id: bot.id, kind: bot.kind, name: bot.name, username: bot.username, linked: bot.chatId !== null,
      linkCode: bot.chatId === null ? bot.linkCode : null, allSessions: bot.allSessions, model: bot.model, problem: this.problems.get(bot.id) ?? null,
    }));
  }

  has(id: string) { return this.bots.some((bot) => bot.id === id); }

  start() {
    for (const bot of this.bots) this.listen(bot);
    this.timer ??= setInterval(() => { this.tick().catch((error: unknown) => this.deps.log('messengers: cannot tell the bots', error)); }, TICK_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const controller of this.polling.values()) controller.abort();
    this.polling.clear();
  }

  /** Adds a bot (no `id`) or changes one; false when there are too many, or the bot is unknown. */
  save(id: string | undefined, input: MessengerInput): boolean {
    const before = id ? this.bots.find((bot) => bot.id === id) : undefined;
    if (id && !before) return false;
    if (!before && (this.bots.length >= MAX_MESSENGERS || !input.token)) return false;
    const tokenChanged = !!input.token && input.token !== before?.token;
    const bot: Stored = {
      id: before?.id ?? randomBytes(8).toString('hex'), kind: 'telegram', name: input.name, token: input.token ?? before!.token,
      // a new token is another bot: its chat is linked again
      chatId: tokenChanged ? null : before?.chatId ?? null, username: tokenChanged ? null : before?.username ?? null,
      linkCode: tokenChanged || !before ? linkCode() : before.linkCode, allSessions: input.allSessions, model: input.model,
      conversation: tokenChanged ? null : before?.conversation ?? null,
    };
    this.bots = before ? this.bots.map((each) => (each.id === bot.id ? bot : each)) : [...this.bots, bot];
    this.write();
    if (tokenChanged || !before) { this.problems.delete(bot.id); this.listen(bot); }
    this.deps.onChange();
    return true;
  }

  remove(id: string) {
    if (!this.has(id)) return;
    this.polling.get(id)?.abort();
    this.polling.delete(id);
    this.problems.delete(id);
    this.bots = this.bots.filter((bot) => bot.id !== id);
    for (const key of [...this.sent.keys()]) if (key.startsWith(`${id}|`)) this.sent.delete(key);
    this.write();
    this.deps.onChange();
  }

  /** A message to check the bot reaches the phone. */
  async test(id: string) {
    const bot = this.bots.find((each) => each.id === id);
    if (bot?.chatId) await this.say(bot, st.messengers.test);
  }

  /** Forgets the linked chat: a new code links another one (another phone, another account). */
  relink(id: string) {
    const bot = this.bots.find((each) => each.id === id);
    if (!bot) return;
    bot.chatId = null;
    bot.linkCode = linkCode();
    bot.conversation = null;
    this.write();
    this.deps.onChange();
  }

  /** Sends a file to a bot's chat (its agent's send_file). */
  async sendFile(botId: string, file: string, caption: string) {
    const bot = this.bots.find((each) => each.id === botId);
    if (!bot?.chatId) throw new Error(st.messengers.notLinked);
    await this.api.sendFile(bot.token, bot.chatId, file, caption);
  }

  private write() {
    mkdirSync(path.dirname(this.deps.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.deps.file, `${JSON.stringify(this.bots, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.deps.file, 0o600);
  }

  private setProblem(bot: Stored, problem: MessengerProblem | null) {
    if ((this.problems.get(bot.id) ?? null) === problem) return;
    if (problem) this.problems.set(bot.id, problem);
    else this.problems.delete(bot.id);
    this.deps.onChange();
  }

  /** Reads the bot's messages for as long as it is kept. */
  private listen(bot: Stored) {
    this.polling.get(bot.id)?.abort();
    const controller = new AbortController();
    this.polling.set(bot.id, controller);
    void (async () => {
      let offset = 0;
      try {
        const me = await this.api.call<{ username?: string }>(bot.token, 'getMe', {}, controller.signal);
        if (me.username && me.username !== bot.username) { bot.username = me.username; this.write(); this.deps.onChange(); }
        await this.api.call(bot.token, 'setMyCommands', { commands: COMMANDS.map((command) => ({ command, description: st.messengers.commands[command] })) }, controller.signal);
      } catch { /* told by getUpdates below */ }
      while (!controller.signal.aborted) {
        try {
          const updates = await this.api.call<TelegramUpdate[]>(bot.token, 'getUpdates', { offset, timeout: telegram.POLL_SECONDS, allowed_updates: ['message', 'callback_query'] }, controller.signal);
          this.setProblem(bot, null);
          for (const update of updates) {
            offset = update.update_id + 1;
            await this.handle(bot, update).catch((error: unknown) => this.deps.log('messengers: cannot handle a message', error));
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          const code = error instanceof telegram.TelegramError ? error.code : 0;
          this.setProblem(bot, code === 401 ? 'token' : code === 409 ? 'elsewhere' : 'network');
          await new Promise((resolve) => setTimeout(resolve, code === 401 ? 60_000 : 5000));
        }
      }
    })();
  }

  private async handle(bot: Stored, update: TelegramUpdate) {
    if (update.callback_query) return this.onButton(bot, update.callback_query);
    const message = update.message;
    if (!message) return;
    const command = telegram.parseCommand(message.text ?? '');
    // a chat is linked by the code shown in Open Space; any other chat is ignored
    if (bot.chatId === null) {
      if (command?.[0] === 'start' && command[1] === bot.linkCode) {
        bot.chatId = message.chat.id;
        bot.linkCode = null;
        this.write();
        this.deps.onChange();
        await this.say(bot, st.messengers.linked(bot.name));
      }
      return;
    }
    if (message.chat.id !== bot.chatId) return;
    const files = await this.received(bot, message);
    const replyTo = message.reply_to_message && this.about.get(`${bot.id}|${message.reply_to_message.message_id}`);
    const text = (message.text ?? message.caption ?? '').trim();
    const question = message.reply_to_message && !command && text ? this.questionAt(bot, message.reply_to_message.message_id) : null;
    if (question) {
      await this.answerQuestion(bot, question.number, question.choice, text);
      return;
    }
    if (replyTo && !command) {
      const session = this.deps.sessions().find((each) => each.id === replyTo);
      if (!session) return void await this.say(bot, st.messengers.sessionGone);
      this.deps.send(session.id, text, files);
      return void await this.say(bot, st.messengers.passed(session.name), message.message_id);
    }
    if (command) return this.onCommand(bot, command[0], command[1], message);
    if (!text && !files.length) return;
    const previous = this.asking.get(bot.id) ?? Promise.resolve();
    const turn = previous.then(() => this.ask(bot, text, files, message.message_id));
    this.asking.set(bot.id, turn.catch(() => undefined));
    await turn;
  }

  private async ask(bot: Stored, text: string, files: readonly string[], messageId: number) {
    await this.api.call(bot.token, 'sendChatAction', { chat_id: bot.chatId, action: 'typing' }).catch(() => undefined);
    const before = new Set(this.deps.sessions().map((session) => session.id));
    const asked = files.length ? `${text}\n\n${st.messengers.filesSent(files)}` : text;
    const { text: answer, conversation } = await this.deps.agent({ id: bot.id, model: bot.model }, asked, bot.conversation);
    if (conversation !== bot.conversation) { bot.conversation = conversation; this.write(); }
    // the sessions its agent started are followed like those of /new
    for (const session of this.deps.sessions()) if (!before.has(session.id)) this.started.add(`${bot.id}|${session.id}`);
    await this.say(bot, answer || st.messengers.agentSilent, messageId);
  }

  /** The question a message of the bot asks, while it waits. */
  private questionAt(bot: Stored, messageId: number): { number: number; choice: Choice } | null {
    for (const [number, choice] of this.choices) {
      if (choice.botId === bot.id && choice.questions && this.sent.get(`${bot.id}|${choice.sessionId}|${choice.requestId}`)?.messageId === messageId) return { number, choice };
    }
    return null;
  }

  /** The files of a message, kept as uploads a session opens. */
  private async received(bot: Stored, message: TelegramMessage): Promise<string[]> {
    const file = telegram.attachedFile(message);
    if (!file) return [];
    try {
      return [this.deps.saveUpload(file.name, await this.api.download(bot.token, file.file_id))];
    } catch {
      await this.say(bot, st.messengers.fileTooLarge);
      return [];
    }
  }

  private async onCommand(bot: Stored, command: string, rest: string, message: TelegramMessage) {
    const words = st.messengers;
    const sessions = this.deps.sessions().filter((session) => session.state !== 'closed');
    const reply = (text: string) => this.say(bot, text, message.message_id);
    switch (command) {
      case 'start': case 'help': return reply(words.help);
      case 'sessions': {
        if (!sessions.length) return reply(words.noSessions);
        return reply(sessions.map((session) => `${session.name} · ${words.states[session.state] ?? session.state} · ${path.basename(session.cwd)}${session.trigger ? ` · ${session.trigger.name}` : ''}${session.remoteSession ? ' · RC' : ''}`).join('\n'));
      }
      case 'run': {
        const found = matchByName(this.deps.triggers(), (trigger) => trigger.name, rest);
        if (!found) return reply(words.whichTrigger(this.deps.triggers().map((trigger) => trigger.name)));
        const run = await this.deps.fire(found.item.id, found.rest || null);
        if (run.sessionId) this.started.add(`${bot.id}|${run.sessionId}`);
        return reply(run.outcome === 'started' ? words.runStarted(found.item.name) : run.outcome === 'queued' ? words.runQueued(found.item.name) : words.runFailed(found.item.name, run.error ?? run.outcome));
      }
      case 'new': {
        const found = matchByName(this.deps.folders(), (folder) => path.basename(folder), rest);
        if (!found?.rest) return reply(words.whichFolder(this.deps.folders().map((folder) => path.basename(folder))));
        try {
          const session = await this.deps.startSession(found.item, found.rest);
          this.started.add(`${bot.id}|${session.id}`);
          return reply(words.sessionStarted(session.name, path.basename(found.item)));
        } catch (error) {
          return reply(error instanceof Error ? error.message : String(error));
        }
      }
      case 'stop': case 'remote': {
        const found = matchByName(sessions, (session) => session.name, rest);
        if (!found) return reply(words.whichSession(sessions.map((session) => session.name)));
        if (command === 'stop') this.deps.interrupt(found.item.id);
        else this.deps.remote(found.item.id, true);
        return reply(command === 'stop' ? words.stopped(found.item.name) : words.remoteOn(found.item.name));
      }
      case 'follow': case 'unfollow': {
        const found = matchByName(sessions, (session) => session.name, rest);
        if (!found) return reply(words.whichSession(sessions.map((session) => session.name)));
        this.forced.set(`${bot.id}|${found.item.id}`, command === 'follow');
        return reply(command === 'follow' ? words.following(found.item.name) : words.unfollowed(found.item.name));
      }
      case 'reset':
        bot.conversation = null;
        this.write();
        return reply(words.reset);
      default: return reply(words.help);
    }
  }

  private async onButton(bot: Stored, button: TelegramCallback) {
    const [kind, number, value] = (button.data ?? '').split(':');
    const choice = this.choices.get(Number(number));
    const done = (text?: string) => this.api.call(bot.token, 'answerCallbackQuery', { callback_query_id: button.id, ...(text ? { text } : {}) }).catch(() => undefined);
    if (!choice || choice.botId !== bot.id || button.message?.chat.id !== bot.chatId) return done(st.messengers.expired);
    const key = `${bot.id}|${choice.sessionId}|${choice.requestId}`;
    const sent = this.sent.get(key);
    try {
      if (kind === 'p' && (value === 'allow' || value === 'deny' || value === 'always')) {
        this.deps.answer(choice.sessionId, choice.requestId, value);
        await this.settle(bot, key, st.messengers.decided[value]);
      } else if (choice.questions && (kind === 'q' || kind === 'm' || kind === 'v')) {
        const question = choice.questions[Object.keys(choice.answers).length];
        if (!question) return done(st.messengers.expired);
        const label = question.options[Number(value)]?.label;
        if (kind === 'm' && label) {
          // several can be picked: ticked or unticked, sent with the last button
          choice.picked = choice.picked.includes(label) ? choice.picked.filter((each) => each !== label) : [...choice.picked, label];
          if (sent) await this.api.call(bot.token, 'editMessageReplyMarkup', { chat_id: bot.chatId, message_id: sent.messageId, reply_markup: { inline_keyboard: questionKeyboard(Number(number), question, choice.picked) } });
          return done();
        }
        const answer = kind === 'v' ? choice.picked.join(', ') : label;
        if (!answer) return done(st.messengers.pickOne);
        const finished = await this.answerQuestion(bot, Number(number), choice, answer);
        if (!finished) return done();
      } else return done(st.messengers.expired);
      this.choices.delete(Number(number));
      return done();
    } catch (error) {
      return done(error instanceof Error ? error.message.slice(0, 190) : st.messengers.expired);
    }
  }

  /**
   * Answers the question a wait is at (a button, the ticked ones, or words replied to its message); the next one takes
   * the same message. True once every question is answered and the session told.
   */
  private async answerQuestion(bot: Stored, number: number, choice: Choice, answer: string): Promise<boolean> {
    const questions = choice.questions ?? [];
    const question = questions[Object.keys(choice.answers).length];
    if (!question) return false;
    choice.answers[question.question] = answer;
    choice.picked = [];
    const key = `${bot.id}|${choice.sessionId}|${choice.requestId}`;
    const next = questions[Object.keys(choice.answers).length];
    const sent = this.sent.get(key);
    if (next && sent) {
      const text = telegram.fit(`${st.messengers.answered(answer)}\n\n${next.question}\n\n${st.messengers.orReply}`);
      await this.api.call(bot.token, 'editMessageText', { chat_id: bot.chatId, message_id: sent.messageId, text, reply_markup: { inline_keyboard: questionKeyboard(number, next) } });
      this.sent.set(key, { ...sent, text });
      return false;
    }
    this.deps.reply(choice.sessionId, choice.requestId, choice.answers);
    this.choices.delete(number);
    await this.settle(bot, key, st.messengers.answered(Object.values(choice.answers).join(' · ')));
    return true;
  }

  /** The buttons of a wait taken off, and how it was answered added. */
  private async settle(bot: Stored, key: string, outcome: string) {
    const sent = this.sent.get(key);
    this.sent.delete(key);
    if (!sent) return;
    await this.api.call(bot.token, 'editMessageText', { chat_id: sent.chatId, message_id: sent.messageId, text: telegram.fit(`${sent.text}\n\n${outcome}`) }).catch(() => undefined);
  }

  private follows(bot: Stored, session: SessionInfo, triggers: readonly Trigger[]): { done: boolean } | null {
    const key = `${bot.id}|${session.id}`;
    const forced = this.forced.get(key);
    if (forced === false) return null;
    if (forced || bot.allSessions) return { done: true };
    // with Remote Control on, the user already follows a session it started in the Claude app
    const remoteOn = session.remote ? session.remote.state !== 'failed' : !!session.remoteSession;
    if (this.started.has(key) && !remoteOn) return { done: true };
    const trigger = session.trigger && triggers.find((each) => each.id === session.trigger!.id);
    return trigger?.messengers.includes(bot.id) ? { done: trigger.notifyDone } : null;
  }

  /** Tells each linked bot what changed in the sessions it follows. */
  async tick() {
    const sessions = this.deps.sessions();
    const triggers = this.deps.triggers();
    for (const bot of this.bots) {
      if (bot.chatId === null) continue;
      const pending = new Set<string>();
      for (const session of sessions) {
        const follow = this.follows(bot, session, triggers);
        if (!follow) continue;
        for (const wait of session.permissions) {
          const key = `${bot.id}|${session.id}|${wait.requestId}`;
          pending.add(key);
          if (!this.sent.has(key)) await this.sendWait(bot, session, wait, key);
        }
        await this.news(bot, session, follow.done);
      }
      for (const key of [...this.sent.keys()]) {
        if (key.startsWith(`${bot.id}|`) && !pending.has(key)) await this.settle(bot, key, st.messengers.answeredElsewhere);
      }
    }
  }

  private async sendWait(bot: Stored, session: SessionInfo, wait: PermissionPrompt, key: string) {
    const choice = this.nextChoice++;
    const { text, buttons } = waitMessage(session, wait, choice);
    if (buttons.length) this.choices.set(choice, { botId: bot.id, sessionId: session.id, requestId: wait.requestId, ...(wait.questions ? { questions: wait.questions } : {}), answers: {}, picked: [] });
    // kept before sending: the next tick does not send it twice while this one waits for Telegram
    this.sent.set(key, { chatId: bot.chatId!, messageId: 0, text });
    try {
      const message = await this.api.call<TelegramMessage>(bot.token, 'sendMessage', { chat_id: bot.chatId, text, ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });
      this.sent.set(key, { chatId: bot.chatId!, messageId: message.message_id, text });
      this.remember(bot, message.message_id, session.id);
    } catch (error) {
      this.sent.delete(key);
      throw error;
    }
  }

  /** The files a session sent since last time, and whether it finished or stopped on an error. */
  private async news(bot: Stored, session: SessionInfo, tellDone: boolean) {
    const key = `${bot.id}|${session.id}`;
    const before = this.seen.get(key);
    const events = this.deps.events(session.id, before?.seq ?? 0);
    const seq = events.at(-1)?.seq ?? before?.seq ?? 0;
    this.seen.set(key, { seq, busy: busy(session), state: session.state });
    // first sight: only what comes next is told
    if (!before) return;
    for (const { ev } of events) {
      if (ev.k !== 'files') continue;
      for (const file of ev.files) {
        const stored = file.stored && this.deps.attachment(file.stored);
        if (!stored) continue;
        const message = await this.api.sendFile(bot.token, bot.chatId!, stored, `${session.name} : ${ev.caption ?? file.title}`).catch(() => null);
        if (message) this.remember(bot, message.message_id, session.id);
      }
    }
    if (session.state === 'error' && before.state !== 'error') await this.tell(bot, session, st.messengers.failed(session.name));
    else if (tellDone && before.busy && session.state === 'wait') await this.tell(bot, session, st.messengers.done(session.name, this.deps.lastWords(session.id)));
  }

  private async tell(bot: Stored, session: SessionInfo, text: string) {
    const message = await this.say(bot, text);
    if (message) this.remember(bot, message.message_id, session.id);
  }

  private async say(bot: Stored, text: string, replyTo?: number): Promise<TelegramMessage | null> {
    if (bot.chatId === null) return null;
    return this.api.call<TelegramMessage>(bot.token, 'sendMessage', {
      chat_id: bot.chatId, text: telegram.fit(text), ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    }).catch((error: unknown) => { this.deps.log('messengers: cannot send', error); return null; });
  }

  private remember(bot: Stored, messageId: number, sessionId: string) {
    this.about.set(`${bot.id}|${messageId}`, sessionId);
    if (this.about.size > KEPT_REPLIES) this.about.delete(this.about.keys().next().value!);
  }
}

/** The bot's commands, in English like Telegram's own. */
export const COMMANDS = ['sessions', 'run', 'new', 'stop', 'remote', 'follow', 'unfollow', 'reset', 'help'] as const;
