# Telegram bots

[Français](telegram.fr.md) · [Guide index](README.md)

A Telegram bot you create tells you when a session needs you, with buttons to answer, when it is done, and sends you its files. You can also write to it in plain words. Telegram is the only outgoing connection Open Space makes, and only once you add a bot.

## Adding a bot

1. In Telegram, open @BotFather and send `/newbot`. It asks for a name, then a username ending in `bot`.
2. Copy the token it gives you (a long string like `123456789:AAH…`).
3. In Open Space, open **Automata > Connections**, choose **New Telegram bot**, paste the token and add the bot.

The token stays on this computer, in `messengers.json` under `OFFICE_DIR`, readable by your account only. It is never shown again. You can add 10 bots at most.

## Linking your phone

A new bot is linked to no chat. Open it in Telegram and tap **Start**. If the button does not work, send the bot the message shown in Open Space: `/start <code>`, with a 6-digit one-time code. Only the chat that sends this code drives the bot. Every other chat is ignored.

**Link another phone** makes a new code. **Send a test** checks the bot writes to you.

## What the bot tells you

Open Space looks at the sessions every 2 seconds and tells each linked bot about the sessions it follows:

- a permission, with **Allow**, **Deny** and **Always** buttons;
- a question, with a button per option. You can also reply to the message with your own answer;
- a request for keys: only a notice. Keys are given in Open Space, never in Telegram;
- the files a session sends;
- a session that stops on an error;
- a session that finishes its turn, with its last words.

When you answer in Open Space, the buttons in Telegram are taken off.

A bot follows:

- the runs of the triggers that name it (**Tell** in the trigger). It says when they are done if the trigger has **Tell when done** on;
- the sessions it started, unless Remote Control is on for them (the Claude app already shows those);
- every session, when **Every session** is on in the bot's settings;
- a session you chose with `/follow`, and not one you dropped with `/unfollow`.

## Writing to a session

Reply to one of the bot's messages to write to its session. Files you attach go with it, 20 MB at most each.

## Commands

| Command | What it does |
|---|---|
| `/sessions` | Who does what: name, state, folder, trigger, `RC` when Remote Control is on. |
| `/run <trigger> [text]` | Starts a trigger. The text, if any, is passed like a webhook body. |
| `/new <folder> <task>` | Starts a session in one of your folders, with Remote Control. |
| `/stop <name>` | Interrupts what a session is doing. It stays open. |
| `/remote <name>` | Turns Remote Control on for a session. |
| `/follow <name>` | Tells you about a session. |
| `/unfollow <name>` | Stops telling you about a session. |
| `/reset` | Forgets the conversation with the agent. |
| `/help` | Lists the commands. |

Without a name, `/run`, `/new`, `/stop` and the others list what you can pick.

## Plain words

Anything else goes to a small agent: a `claude -p` of its own, Haiku by default. You can change its model in the bot's settings (**Agent model**). Its only tools are Open Space's MCP server. It can list sessions, write to them, stop them, put them to rest, turn Remote Control on, start sessions and triggers, and send you files. It never answers a permission or a question: you do that with the buttons. It keeps its conversation from one message to the next, until `/reset`.

## Problems

The bot shows a problem in Open Space when:

- Telegram refuses the token: copy it again from @BotFather (`/mybots`, then API Token) and use **New token**;
- another program already reads the same bot: stop it, or make a bot just for Open Space;
- Telegram does not answer: it picks up on its own.

Deleting the bot in Open Space stops the messages. The bot stays on Telegram: delete it with @BotFather.
