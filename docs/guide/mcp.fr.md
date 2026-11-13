# Le serveur MCP `open-space`

[English](mcp.md) · [Sommaire du guide](README.fr.md)

Open Space sert un serveur MCP nommé `open-space` (Streamable HTTP). Par lui, un agent gère les déclencheurs, lance des sessions, ajoute quelqu'un à l'équipe, crée des mods et des dashboards, et change quelques réglages d'affichage. Il n'atteint jamais les clés, les secrets, les dossiers autorisés, les réglages de sécurité ni la confiance des dossiers.

## Qui s'en sert

| Appelant | Adresse | Comment il l'obtient |
|---|---|---|
| Chaque session | `/mcp/<session>/<clé>` | Donnée d'office à chaque session. Une session dans un dossier que tu n'as pas approuvé ne l'a pas. Ses appels passent par les permissions de Claude Code comme n'importe quel outil. |
| Un programme externe | `/mcp/external/<clé>` | Activé par toi, voir plus bas. |
| L'agent d'un bot Telegram | `/mcp/messenger/<bot>/<clé>` | Donnée d'office à l'agent du bot. Voir [Bots Telegram](telegram.fr.md). |

Le serveur n'écoute que sur `127.0.0.1`. Un programme sur un autre ordinateur ne peut pas l'atteindre.

## L'accès externe

1. Ouvre **Automates > Accès externe**.
2. Choisis **Activer l'accès externe**. Le panneau affiche l'adresse MCP (garde-la secrète : elle contient la clé), une configuration JSON, et la commande pour Claude Code :

   ```
   claude mcp add --transport http open-space <adresse>
   ```

3. **Régénérer la clé** la remplace : l'ancienne adresse cesse de marcher aussitôt. **Désactiver** la supprime.

La clé est gardée dans `mcp-key` sous `OFFICE_DIR`.

## Les outils

« Tous » veut dire les sessions, le programme externe et l'agent d'un bot.

| Outil | Appelants | Ce qu'il fait |
|---|---|---|
| `list_triggers` | Tous | Liste les déclencheurs et leurs derniers runs, sans leurs tokens. |
| `create_trigger` | Tous | Crée un déclencheur cron ou webhook. `name`, `prompt` et `kind` sont obligatoires. Le dossier est par défaut celui de l'appelant. |
| `update_trigger` | Tous | Modifie un déclencheur. Seuls les champs donnés changent. |
| `run_trigger` | Tous | Lance un déclencheur tout de suite. Un déclencheur webhook qui tourne déjà 3 fois le met en file. Un déclencheur cron dont le run précédent travaille encore l'ignore. |
| `create_session` | Tous | Lance une session avec un premier message. `prompt` est obligatoire. Facultatifs : `cwd`, `name`, `model`, `permissionMode`, `role`, `remote` (par défaut `false`). |
| `list_roles` | Tous | Liste les rôles Claude Code (`.claude/agents`) qu'un dossier peut utiliser. |
| `list_crew` | Tous | Liste l'équipe : les noms donnés aux sessions, et leurs métiers. |
| `create_agent` | Tous | Ajoute quelqu'un à l'équipe, avec des métiers facultatifs parmi `cyber`, `devops`, `tech`, `product`, `design`, `data`, `marketing`, `hr`. |
| `list_mods` | Tous | Liste les mods avec leur id, leur nom et leur dossier. |
| `create_mod` | Tous | Crée un mod à partir d'une demande. Depuis une session, par défaut la session reçoit le dossier et écrit le mod elle-même. `build: "session"` le confie plutôt à une nouvelle session, ce qui se passe aussi depuis l'extérieur. |
| `update_mod` | Tous | Demande une modification d'un mod. Sa session, ou une nouvelle dans son dossier, la fait. |
| `delete_mod` | Tous | Supprime un mod. Son dossier part à la Corbeille. |
| `list_dashboards` | Tous | Liste les dashboards : des grilles de mods. |
| `save_dashboard` | Tous | Crée un dashboard, ou remplace ses tuiles. La grille a 12 colonnes. |
| `delete_dashboard` | Tous | Supprime un dashboard. Ses mods restent. |
| `get_settings` | Tous | Lit les réglages listés plus bas. |
| `update_settings` | Tous | Change certains de ces réglages. Toute autre clé fait refuser toute la demande. |
| `list_sessions` | Externe, bot | Liste les sessions : état, ce qu'elles attendent, ce qu'elles ont dit en dernier. |
| `send_message` | Externe, bot | Envoie un message à une session, comme tapé dans Open Space. Il attend la fin d'un tour en cours. |
| `stop_session` | Externe, bot | Interrompt ce que fait une session, comme Interrompre dans Open Space. La session reste ouverte et garde sa place. |
| `rest_session` | Externe, bot | Met une session au repos, comme Repos dans Open Space : son processus et son navigateur s'arrêtent, ce qui libère sa place. Un tour en cours est coupé, sans demander. Son prochain message la réveille. |
| `set_remote` | Externe, bot | Active ou coupe Remote Control pour une session. |
| `answer_permission` | Externe | Répond à ce qu'une session attend : une permission avec `allow`, `deny` ou `always` (quand c'est proposé), ou une question avec ses réponses. Une demande de clés ne se répond que dans Open Space. |
| `send_file` | Session, bot | Envoie un fichier dans ta conversation Telegram par son chemin absolu, avec une légende facultative. Le bot est facultatif quand tu n'en as qu'un. |
| `rename_session` | Session | Renomme la session qui appelle. |
| `set_pending` | Session | Dit ce que la session qui appelle laisse en suspens, une ligne courte par point (8 au plus), à la place de la liste d'avant : une PR à ouvrir, une clé à fournir. Une liste vide l'efface. Les lignes s'affichent dans le panneau État, sous « En suspens ». |
| `finish_run` | Session | Pour le run d'un déclencheur seulement : dit que la tâche est faite. La session se ferme à la fin du tour, et sa conversation reste dans Reprendre. Ailleurs, il renvoie une erreur. |

Aucun outil n'éteint une session : ça se fait depuis l'interface. Voir [Sessions](sessions.fr.md).

Une session ou un bot ne peut pas fixer les règles d'un déclencheur (`allowedTools`). Seul le programme externe le peut.

## Les réglages accessibles par MCP

`language`, `theme`, `pet`, `festivals`, `officeLife`, `notifications`, `autoTag`, `autoTagRule`, `remoteByDefault`, `model`, `effort`, `idleCompact`, `timeFormat`, `timestamps`, `turnDuration`, `detailedActions`, `reduceMotion`, `glassOpacity`, `windowStyle`, `tagColors`, `copyOnSelect`, `autoPip`.
