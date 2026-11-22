# Secrets: `/secret` and `os-secret`

[Français](secrets.fr.md) · [Guide index](README.md)

You can hand a session a key (a token, an API key, a password) without Claude ever reading its value. Claude only knows the key's name, and uses it through the `os-secret` command.

## Giving a key

- Type `/secret` in the composer, or `/secret NAME` to have the name already filled in. `/secrets`, `/key` and `/cle` do the same.
- Or open **Keys** in the session's menu.
- Or let the session ask: it runs `os-secret ask NAME`, and a box opens in Open Space. You give the value or refuse.

In the Keys window you can paste a block copied from a `.env` file (`NAME=value` lines, `export NAME=value` too). Each line becomes a key. Quotes around a value are taken off, comments and blank lines skipped.

You can paste a whole `.p8` file too: it is kept whole and shown as "N lines pasted".

Then tell the session what to do with it: "put it in the .env", "use it to sign in".

## Where a key is kept

Each key you paste has a scope, chosen in the window (**This session** by default):

| Scope | Kept | Given to |
|---|---|---|
| This session | In memory, 12 hours at most. Forgotten when the session switches off or Open Space stops. | This session. |
| This project | In the vault. | The sessions of this project. |
| Everywhere | In the vault. | Every session. |

A project is the main checkout of the git repository the session works in (a worktree counts as its main checkout), else the git root, else the folder. The match is exact, never by path prefix. When a name exists at several scopes, the session's own key wins, then the project's, then the one for everywhere.

The vault is the file `keys-vault.json` in the desktop app's own folder (`npm run app:dev` has its own). Each value in it is encrypted by your system (the macOS Keychain, your Windows account, the Linux keyring); names, scopes, consents and last uses are in clear. A value that cannot be decrypted counts as missing, so it is asked again, but it stays in the file. On macOS only this signed app gets the Keychain's key. On Windows and Linux the encryption keeps the values off the disk in clear, but any program running under your account can decrypt them.

Without the desktop app (`npm start`, the server alone), or on Linux with no keyring, there is no vault: keys given to sessions stay in memory, and **Settings › Keys** says so. If the app already moved the triggers' and mods' keys into its vault, a server started outside the app cannot read them: Settings › Keys, the trigger and the mod say they are out of reach, and a run of a trigger whose keys are there does not start (start Open Space from its app). Keys typed meanwhile never replace a value the vault holds.

## Consent

A saved key is handed to a session without asking only when that session's project is allowed for it. You allow it with **Always for this project**, or by saving the key from a session of that project. Otherwise the session's request shows a card, "X wants N saved keys", with **Always for this project**, **Just this once** and **Refuse**.

A session in a folder you have not approved never gets a saved key without the card, and the card has no **Always**. Trigger runs do not reach the vault by scope: they only get the keys of their own trigger.

When a request mixes saved keys and keys to paste, the saved ones show as chips you can untick (✕ keeps one back), and each key to paste has its own line with its scope.

A key given through Telegram is good for the session only. A request that only concerns saved keys is answered in Open Space.

## Rules

- A name is a valid environment variable name: letters, digits and `_`, not starting with a digit, 100 characters at most.
- A value is 20,000 characters at most. A session holds 50 keys at most.
- Keys are never logged or sent to the page. Only the vault's encrypted copies reach the disk.
- The Keys window lists the keys the session has, in two lists: "Given to this session" and "Inherited (project or everywhere)", with a link to **Settings › Keys**. You can forget one, or all.

## Settings › Keys

All the saved keys, each with its name, a scope chip (Everywhere, the project's name, the trigger's or the mod's), where it is used and its last use (in amber after 30 days). You can replace or delete a key. Filters: All, Everywhere, This project (the project of the session shown). **Add a key** saves one for everywhere or for a project. A line at the bottom says how keys are stored. On a narrow window the list becomes cards.

## `os-secret`

Open Space puts `os-secret` first in each session's `PATH`. Claude runs it like any command:

| Command | What it does |
|---|---|
| `os-secret ask NAME... [--why "what it is for"]` | Takes the saved keys, or asks you for them (a box in Open Space), and says where each came from (`saved` or `pasted`). Waits up to 10 minutes. |
| `os-secret ask NAME --again --why "..."` | The key it was given no longer works: the card offers to replace it, at its current scope. |
| `os-secret list` | The names of the keys given, never their values. |
| `os-secret env NAME [FILE] [--as VAR]` | Writes the key into a `.env` file (`.env` in the current folder by default), replacing its line. The file must be inside a folder sessions may work in. In a git repository, it refuses a file git does not ignore. |
| `os-secret run NAME... -- COMMAND...` | Runs a command with the keys as environment variables. Their values are masked in its output, a multi-line one too (each line of 8 characters or more, except `-----BEGIN/END-----` lines). |
| `os-secret file NAME -- COMMAND...` | Writes the key in a temporary file (600), puts its path in `$NAME_FILE`, runs the command, then deletes the file, even if it fails or you press Ctrl-C. Output masked. |
| `os-secret cookie NAME URL [--as COOKIE]` | Puts the key as a cookie for that URL in the session's Open Space browser. |
| `os-secret auth NAME URL [--user USER]` | Signs the session's browser in to that site with basic auth. The key is `user:password`, or the password alone with `--user`. |
| `os-secret type NAME [URL] [--any-field]` | Types the key into the password field that has focus in the browser tab on that site. The URL is needed with several tabs. `--any-field` allows another field too. |
| `os-secret forget NAME` | Forgets the session's copy of a key. A saved key stays in the vault. |

In a trigger run nobody follows, `ask` fails at once, unless a messaging bot follows that run (it waits as before).

`cookie` and `type` take `--shared` to act in the shared browser instead of the session's own. `auth` refuses `--shared`: the shared browser would keep the login after the session.

## Keys of a trigger

A trigger can hold keys of its own, given to every run when it starts. They go in the vault, with the scope "this trigger". Without a vault they are saved in `trigger-keys.json` under `OFFICE_DIR`, readable by your account only. Once saved they cannot be read again, only replaced, so prefer keys with limited rights. See [Automations](automations.md).

## Mod variables

A mod's variables (an API key its page needs) are not session keys. You fill them in the mod's settings, and only its page gets them. They go in the vault, with the scope "this mod" (without a vault, in `mods-env.json`). At start, an old `trigger-keys.json` or `mods-env.json` is moved into the vault, then deleted once the write succeeded. See [Mods](mods.md).
