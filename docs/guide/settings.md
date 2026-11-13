# Environment variables

[Français](settings.fr.md) · [Guide index](README.md)

Open Space reads these variables once, when the server starts (`server/config.ts`). Change one, then restart Open Space.

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `4848` | The server's port. |
| `OFFICE_HOOKS_PORT` | `PORT` + 1 | A port that only answers webhooks, to put behind a tunnel. See [Automations](automations.md). |
| `OFFICE_MODS_PORT` | `PORT` + 2 | The port the mods' pages are served on, each under `<mod>.localhost`. See [Mods](mods.md). |
| `OFFICE_ROOTS` | the folders chosen in the page | The folders sessions may work in, separated by `:` on macOS and Linux, `;` on Windows. `~` is expanded, and a folder that does not exist is dropped. When set, the page cannot change them. |
| `OFFICE_DIR` | `~/.open-space` | Where Open Space keeps its data: sessions and their logs, and the files the other pages name under `OFFICE_DIR`. |
| `OFFICE_MAX_LIVE` | `12` | The most `claude` processes alive at once. See [Sessions](sessions.md). |
| `OFFICE_IDLE_MINUTES` | `30` | After this many minutes, a waiting session releases its process. |
| `OFFICE_ENV_PASSTHROUGH` | none | Extra environment variable names handed to `claude`, separated by commas (for example `GH_TOKEN,AWS_PROFILE`). A name that is not a valid variable name, or that starts with `ANTHROPIC_`, is ignored. |

The numeric variables (`PORT`, `OFFICE_HOOKS_PORT`, `OFFICE_MODS_PORT`, `OFFICE_MAX_LIVE`, `OFFICE_IDLE_MINUTES`) must be positive whole numbers. Any other value falls back to the default.

## The agents' browser

`OFFICE_CHROME` (read in `server/browser.ts`, not in `server/config.ts`) is the path of the Chromium browser Open Space launches for agents. When it is set and the file does not exist, no browser is found. When it is not set, Open Space takes the first one installed among Google Chrome, Chromium, Microsoft Edge and Brave.
