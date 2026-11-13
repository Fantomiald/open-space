# The `open-space` MCP server

[Français](mcp.fr.md) · [Guide index](README.md)

Open Space serves an MCP server named `open-space` (Streamable HTTP). Through it an agent can manage triggers, start sessions, add someone to the crew, make mods and dashboards, and change a few display settings. It never reaches keys, secrets, the allowed folders, security settings or folder trust.

## Who uses it

| Caller | Address | How it gets it |
|---|---|---|
| Each session | `/mcp/<session>/<key>` | Given automatically to every session. A session in a folder you have not approved does not get it. Its calls go through Claude Code's permissions like any tool. |
| An external program | `/mcp/external/<key>` | Turned on by you, see below. |
| A Telegram bot's agent | `/mcp/messenger/<bot>/<key>` | Given automatically to the bot's agent. See [Telegram bots](telegram.md). |

The server only listens on `127.0.0.1`. A program on another computer cannot reach it.

## External access

1. Open **Automata > External access**.
2. Choose **Turn on external access**. The panel shows the MCP address (keep it secret: it holds the key), a JSON configuration, and the command for Claude Code:

   ```
   claude mcp add --transport http open-space <address>
   ```

3. **Regenerate the key** replaces it: the old address stops working at once. **Turn off** deletes it.

The key is kept in `mcp-key` under `OFFICE_DIR`.

## Tools

"All" means sessions, the external program and a bot's agent.

| Tool | Callers | What it does |
|---|---|---|
| `list_triggers` | All | Lists the triggers and their latest runs, without their tokens. |
| `create_trigger` | All | Creates a cron or webhook trigger. `name`, `prompt` and `kind` are required. The folder defaults to the caller's. |
| `update_trigger` | All | Changes a trigger. Only the fields given change. |
| `run_trigger` | All | Starts a trigger now. A webhook trigger that already runs 3 times queues it. A cron trigger whose previous run still works skips it. |
| `create_session` | All | Starts a session with a first message. `prompt` is required. Optional: `cwd`, `name`, `model`, `permissionMode`, `role`, `remote` (default `false`). |
| `list_roles` | All | Lists the Claude Code roles (`.claude/agents`) a folder can use. |
| `list_crew` | All | Lists the crew: the names sessions are given, and their jobs. |
| `create_agent` | All | Adds someone to the crew, with optional jobs among `cyber`, `devops`, `tech`, `product`, `design`, `data`, `marketing`, `hr`. |
| `list_mods` | All | Lists the mods with their id, name and folder. |
| `create_mod` | All | Makes a new mod from a request. From a session, by default the session gets the folder and writes the mod itself. `build: "session"` hands it to a new session instead, which is also what happens from outside. |
| `update_mod` | All | Asks for a change to a mod. Its session, or a new one in its folder, makes it. |
| `delete_mod` | All | Deletes a mod. Its folder goes to the Trash. |
| `list_dashboards` | All | Lists the dashboards: grids of mods. |
| `save_dashboard` | All | Makes a dashboard, or replaces the tiles of one. The grid has 12 columns. |
| `delete_dashboard` | All | Deletes a dashboard. Its mods stay. |
| `get_settings` | All | Reads the settings listed below. |
| `update_settings` | All | Changes some of those settings. Any other key refuses the whole request. |
| `list_sessions` | External, bot | Lists the sessions: state, what they wait for, what they said last. |
| `send_message` | External, bot | Sends a message to a session, as if typed in Open Space. It waits for the end of a turn under way. |
| `stop_session` | External, bot | Interrupts what a session is doing, like Interrupt in Open Space. The session stays open and keeps its place. |
| `rest_session` | External, bot | Puts a session to rest, like Rest in Open Space: its process and browser stop, which frees its place. A turn under way is cut short, without asking. Its next message wakes it up. |
| `set_remote` | External, bot | Turns Remote Control on or off for a session. |
| `answer_permission` | External | Answers what a session waits for: a permission with `allow`, `deny` or `always` (when offered), or a question with its answers. A request for keys can only be answered in Open Space. |
| `send_file` | Session, bot | Sends a file to your Telegram chat by its absolute path, with an optional caption. The bot is optional when you have only one. |
| `rename_session` | Session | Renames the calling session. |
| `set_pending` | Session | Sets what the calling session leaves pending, one short line per item (8 at most), replacing the previous list: a PR to open, a key to provide. An empty list clears it. The lines show in the Status panel, under « Left pending ». |
| `finish_run` | Session | For a trigger's run only: says the task is done. The session closes at the end of the turn, and its conversation stays in Resume. Anywhere else it returns an error. |

No tool switches a session off: do that from the interface. See [Sessions](sessions.md).

A session or a bot cannot set a trigger's rules (`allowedTools`). Only the external program can.

## Settings reachable over MCP

`language`, `theme`, `pet`, `festivals`, `officeLife`, `notifications`, `autoTag`, `autoTagRule`, `remoteByDefault`, `model`, `effort`, `idleCompact`, `timeFormat`, `timestamps`, `turnDuration`, `detailedActions`, `reduceMotion`, `glassOpacity`, `windowStyle`, `tagColors`, `copyOnSelect`, `autoPip`.
