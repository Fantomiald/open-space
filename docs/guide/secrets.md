# Secrets: `/secret` and `os-secret`

[Français](secrets.fr.md) · [Guide index](README.md)

You can hand a session a key (a token, an API key, a password) without Claude ever reading its value. Claude only knows the key's name, and uses it through the `os-secret` command.

## Giving a key

- Type `/secret` in the composer, or `/secret NAME` to have the name already filled in. `/secrets`, `/key` and `/cle` do the same.
- Or open **Keys** in the session's menu.
- Or let the session ask: it runs `os-secret ask NAME`, and a box opens in Open Space. You give the value or refuse.

In the Keys window you can paste a block copied from a `.env` file (`NAME=value` lines, `export NAME=value` too). Each line becomes a key. Quotes around a value are taken off, comments and blank lines skipped.

Then tell the session what to do with it: "put it in the .env", "use it to sign in".

## Rules

- A name is a valid environment variable name: letters, digits and `_`, not starting with a digit, 100 characters at most.
- A value is 20,000 characters at most. A session holds 50 keys at most.
- Keys are kept in memory only, never written to disk, logged or sent to the page.
- A key is kept 12 hours at most after it was given. It also goes when you switch the session off or Open Space stops.
- The Keys window lists the keys already given. You can forget one, or all.

## `os-secret`

Open Space puts `os-secret` first in each session's `PATH`. Claude runs it like any command:

| Command | What it does |
|---|---|
| `os-secret ask NAME... [--why "what it is for"]` | Asks you for keys (a box in Open Space). Waits up to 10 minutes. |
| `os-secret list` | The names of the keys given, never their values. |
| `os-secret env NAME [FILE] [--as VAR]` | Writes the key into a `.env` file (`.env` in the current folder by default), replacing its line. The file must be inside a folder sessions may work in. |
| `os-secret run NAME... -- COMMAND...` | Runs a command with the keys as environment variables. Their values are masked in its output. |
| `os-secret cookie NAME URL [--as COOKIE]` | Puts the key as a cookie for that URL in the session's Open Space browser. |
| `os-secret auth NAME URL [--user USER]` | Signs the session's browser in to that site with basic auth. The key is `user:password`, or the password alone with `--user`. |
| `os-secret type NAME [URL] [--any-field]` | Types the key into the password field that has focus in the browser tab on that site. The URL is needed with several tabs. `--any-field` allows another field too. |
| `os-secret forget NAME` | Forgets a key. |

`cookie` and `type` take `--shared` to act in the shared browser instead of the session's own. `auth` refuses `--shared`: the shared browser would keep the login after the session.

## Keys of a trigger

A trigger can hold keys of its own, given to every run when it starts. They are saved in `trigger-keys.json` under `OFFICE_DIR`, readable by your account only. Once saved they cannot be read again, only replaced, so prefer keys with limited rights. See [Automations](automations.md).

## Mod variables

A mod's variables (an API key its page needs) are not session keys. You fill them in the mod's settings, and only its page gets them. See [Mods](mods.md).
