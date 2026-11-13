# Automations and triggers

[Français](automations.fr.md) · [Guide index](README.md)

A trigger starts a session on its own, at a set time (cron) or when another program calls its webhook. You manage triggers in the **Automata** panel, **Triggers** tab. It opens from the automaton in the room, or from **Settings > Automatons and connections**.

## Creating a trigger

| Field | What it does | Default |
|---|---|---|
| Name | As it shows in the list. Its runs take this name, with a number when it is taken. 60 characters at most. | |
| Project folder | Where the session runs. It must be inside one of the allowed folders. | |
| First message | Sent to the session each time it starts. 20,000 characters at most. | |
| Starts | At a set time (cron) or from a webhook. | cron |
| Schedule | A 5-field cron, local time: minute hour day month weekday. | `0 8 * * 1-5` (8 am on weekdays) |
| Claude Code role | A `.claude/agents/<role>.md` file of the project or of `~/.claude`, run with `--agent`. | none |
| Model | The session's model. | empty |
| Permission mode | What the session may do without asking you. | `auto` |
| Rules | Tools it may use without asking, on top of its mode. One rule per line in Claude Code's format, 40 at most. | none |
| Keys | Values handed to every run through `os-secret` (see below). | none |
| Remote Control | Follow the run and approve from the Claude app on your phone. | on |
| Tell | The Telegram bots that get what its runs wait for and the files they send. | none |
| Tell when done | Also sends the last answer of each run to those bots. | on |
| Cost cap ($) | The run stops once it has spent this much, estimated at list prices. 1,000 at most. | no cap |
| Time cap (min) | The run stops after this many minutes. 1,440 at most. | no cap |
| On | Off, the trigger no longer starts on its own. | on |

You can have 50 triggers at most.

The rule shortcuts add these rules:

| Shortcut | Rules |
|---|---|
| Read the code | `Read`, `Grep`, `Glob` |
| Edit files | `Edit`, `Write` |
| Run npm scripts | `Bash(npm test *)`, `Bash(npm run *)` |
| Commit | `Bash(git add *)`, `Bash(git commit *)` |
| Push | `Bash(git push *)` |
| Open a PR | `Bash(gh pr create *)` |

Anything not covered by the mode or the rules waits for your go, in Open Space, on Telegram, or in the Claude app with Remote Control.

The folder must have been approved once if its settings run code (hooks, MCP servers). Nobody is there to answer that question when a trigger fires, so the run fails until you open a session in that folder from Open Space and approve it.

## Cron triggers

Open Space checks the schedules every 20 seconds and starts each matching trigger once per minute. One run at a time: while the previous run works or waits for your go, the next start is skipped.

## Webhook triggers

Each webhook trigger has its own address, shown in the trigger once it is created:

```
http://127.0.0.1:<port>/hooks/<trigger id>/<token>
```

A `POST` to that address starts a run. The request body (64 KB at most, otherwise `413`) is added to the first message as data inside a fenced block, never as instructions. JSON is pretty-printed. The server answers `202` with `{"outcome": "..."}`, or `404` when the trigger does not exist, is paused, or the token is wrong.

```
curl -X POST --data '{"issue": "PROJ-123"}' http://127.0.0.1:4848/hooks/<trigger id>/<token>
```

Each call starts its own session, up to 3 at once. The next calls wait in a queue, in order, 20 at most. Calls beyond that are skipped. A queue lives in memory: calls still waiting when Open Space stops are lost and marked as such.

### From an online service

The address above only answers this computer. For Jira, GitHub or another online service:

1. Run a tunnel to the webhooks port. That port is `PORT + 1` (`4849` by default, `OFFICE_HOOKS_PORT` to change it) and only answers webhooks. For a quick try: `cloudflared tunnel --url http://localhost:4849`.
2. Paste the public address the tunnel gives you in **Settings > Automatons and connections > Webhooks public address**. It must start with `https://`.
3. Copy the trigger's address again: it now starts with the public address.

## Running and testing

- **Run now** starts a real run right away, with the first message.
- **Simulate a call** (webhook triggers) sends a body as if the webhook had received it, in plan mode and without any rule: the session says what it would do and changes nothing.

The trigger keeps its last 100 runs. Each has a source (`cron`, `webhook`, `manual`, `agent`, `test`) and an outcome: started, queued, cancelled, skipped or failed. A queued call can be cancelled.

## Keys

The keys of a trigger are given to each run's `os-secret` when it starts. The session uses them without seeing their value. Once saved they cannot be read again, only replaced. They never go through the MCP server. See [Secrets](secrets.md).

## Ending a run

A run's session can call the MCP tool `finish_run` once its task is done and nothing waits for you. It closes 5 seconds after the end of that turn, and its conversation stays in Resume. A run that never calls it closes after one hour left alone in `wait`. A new turn cancels the close.

## From an agent

Sessions, an external program and a Telegram bot can manage triggers through the MCP server: `list_triggers`, `create_trigger`, `update_trigger`, `run_trigger`. Only the external program can set a trigger's rules. See [MCP server](mcp.md).
