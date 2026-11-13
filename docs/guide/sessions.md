# Sessions and their lifecycle

[Français](sessions.fr.md) · [Guide index](README.md)

Each session is one `claude -p` process, shown as a character at a desk. This page explains when that process runs, when it stops, and what counts toward the limit.

## States

| State | What it means |
|---|---|
| `starting` | The process is starting. |
| `work` | Claude is working on a turn. |
| `perm` | Claude waits for you: a permission, a question or a key. |
| `wait` | Nothing runs: the turn is over, or the session has not started yet. It is your turn. A session whose process was released stays in `wait`. |
| `done` | The `claude` process ended by itself, cleanly. |
| `closed` | You closed it. It can be resumed. |
| `error` | The process died abnormally, or could not start. |

## Interrupt, Rest, Switch off

The session menu offers three ways to stop.

- **Interrupt** stops the current turn. The session stays open and keeps its process. The MCP tool `stop_session` and the Telegram `/stop` command do the same.
- **Rest** sends the session to the break room. Claude Code stops, and the session no longer takes a slot. Its next message starts the process again on the same conversation. Turning Remote Control on also brings it back. The MCP tool `rest_session` does the same.
- **Switch off** removes the session from Open Space. Its keys are dropped. If it has its own branch, you choose to merge, keep or discard it. You can pick it up again from **Resume**: it comes back with its name, and with its whole thread for 30 days. Claude Code's own transcript is not touched.

If the session started background work (sub-agents, background tasks, scheduled wake-ups), Rest asks first: what they started stops with them.

## The limit on active sessions

`OFFICE_MAX_LIVE` (default `12`) caps the number of live `claude` processes. Every live process counts, including a session in `wait` that is only waiting for your next message.

When a new session needs a process and the limit is reached, Open Space releases the live session that has been waiting the longest. It never releases a session that is working, asking you something, or keeping its process (see below). If none can be released, the new session does not start: "Too many sessions at work (12 at most): none is waiting, to make room. Stop one."

A released session keeps its place and its conversation. Its next message starts a new process.

## Idle release

A session in `wait` releases its process after `OFFICE_IDLE_MINUTES` (default `30`). It resumes with the next message. If it has a scheduled wake-up, the timer runs from that wake-up instead.

## What keeps a process alive

A session is not released, by the idle timer or to make room, while any of these is true:

- a sub-agent is still running;
- a background task is still running;
- Remote Control is on;
- a scheduled wake-up is pending: a `/loop` wake-up (between 1 minute and 1 hour) or a recurring cron job created by Claude (kept for 7 days).

These sessions count toward the limit for as long as they run. With **Remote Control by default** on, new sessions start without Remote Control when fewer than 2 slots would remain free. Their button still turns it on.

## Automation runs

A session started by a trigger closes on its own: 5 seconds after it calls `finish_run`, or after one hour left alone in `wait`. A new turn cancels that close. See [Automations](automations.md).
