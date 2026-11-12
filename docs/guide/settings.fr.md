# Les variables d'environnement

[English](settings.md) · [Sommaire du guide](README.fr.md)

Open Space lit ces variables une fois, au démarrage du serveur (`server/config.ts`). Changes-en une, puis relance Open Space.

| Variable | Par défaut | Effet |
|---|---|---|
| `PORT` | `4848` | Le port du serveur. |
| `OFFICE_HOOKS_PORT` | `PORT` + 1 | Un port qui ne répond qu'aux webhooks, à placer derrière un tunnel. Voir [Automates](automations.fr.md). |
| `OFFICE_MODS_PORT` | `PORT` + 2 | Le port où sont servies les pages des mods, chacune sous `<mod>.localhost`. Voir [Mods](mods.fr.md). |
| `OFFICE_ROOTS` | les dossiers choisis dans la page | Les dossiers où les sessions peuvent travailler, séparés par `:` sous macOS et Linux, `;` sous Windows. `~` est développé, et un dossier qui n'existe pas est écarté. Une fois fixés, la page ne peut plus les changer. |
| `OFFICE_DIR` | `~/.open-space` | Où Open Space garde ses données : les sessions et leurs journaux, et les fichiers que les autres pages placent sous `OFFICE_DIR`. |
| `OFFICE_MAX_LIVE` | `12` | Le nombre maximal de processus `claude` en vie en même temps. Voir [Sessions](sessions.fr.md). |
| `OFFICE_IDLE_MINUTES` | `30` | Après ce nombre de minutes, une session en attente libère son processus. |
| `OFFICE_ENV_PASSTHROUGH` | aucune | Des noms de variables d'environnement en plus, passés à `claude`, séparés par des virgules (par exemple `GH_TOKEN,AWS_PROFILE`). Un nom qui n'est pas un nom de variable valable, ou qui commence par `ANTHROPIC_`, est ignoré. |

Les variables numériques (`PORT`, `OFFICE_HOOKS_PORT`, `OFFICE_MODS_PORT`, `OFFICE_MAX_LIVE`, `OFFICE_IDLE_MINUTES`) doivent être des nombres entiers positifs. Toute autre valeur fait prendre la valeur par défaut.

## Le navigateur des agents

`OFFICE_CHROME` (lue dans `server/browser.ts`, pas dans `server/config.ts`) est le chemin du navigateur Chromium qu'Open Space lance pour les agents. Quand elle est fixée et que le fichier n'existe pas, aucun navigateur n'est trouvé. Sans elle, Open Space prend le premier installé parmi Google Chrome, Chromium, Microsoft Edge et Brave.
