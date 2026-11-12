# Automates et déclencheurs

[English](automations.md) · [Sommaire du guide](README.fr.md)

Un déclencheur lance une session tout seul, à heure fixe (cron) ou quand un autre programme appelle son webhook. Les déclencheurs se gèrent dans le panneau **Automates**, onglet **Déclencheurs**. Il s'ouvre depuis l'automate de la salle, ou depuis **Réglages > Automates et connexions**.

## Créer un déclencheur

| Champ | Ce qu'il fait | Par défaut |
|---|---|---|
| Nom | Comme il apparaît dans la liste. Ses runs prennent ce nom, avec un numéro s'il est pris. 60 caractères au plus. | |
| Dossier du projet | Où la session travaille. Il doit être dans un des dossiers autorisés. | |
| Message de départ | Envoyé à la session à chaque lancement. 20 000 caractères au plus. | |
| Départ | À heure fixe (cron) ou par webhook. | cron |
| Horaire | Cron à 5 champs, heure locale : minute heure jour mois jour-de-semaine. | `0 8 * * 1-5` (8 h en semaine) |
| Rôle Claude Code | Un fichier `.claude/agents/<rôle>.md` du projet ou de `~/.claude`, lancé avec `--agent`. | aucun |
| Modèle | Le modèle de la session. | vide |
| Mode de permission | Ce que la session peut faire sans te demander. | `auto` |
| Règles | Les outils qu'elle utilise sans demander, en plus de son mode. Une règle par ligne au format de Claude Code, 40 au plus. | aucune |
| Clés | Des valeurs données à chaque run par `os-secret` (voir plus bas). | aucune |
| Remote Control | Suivre le run et valider depuis l'app Claude du téléphone. | activé |
| Prévenir sur | Les bots Telegram qui reçoivent ce que ses runs attendent et les fichiers qu'ils envoient. | aucun |
| Prévenir à la fin | Envoie aussi la dernière réponse de chaque run à ces bots. | activé |
| Plafond de coût ($) | Le run s'arrête une fois cette somme dépensée, estimée au prix public. 1 000 au plus. | pas de plafond |
| Plafond de temps (min) | Le run s'arrête au bout de ces minutes. 1 440 au plus. | pas de plafond |
| Actif | Éteint, il ne part plus tout seul. | activé |

Tu peux avoir 50 déclencheurs au plus.

Les raccourcis de règles ajoutent ces règles :

| Raccourci | Règles |
|---|---|
| Lire le code | `Read`, `Grep`, `Glob` |
| Modifier les fichiers | `Edit`, `Write` |
| Lancer les scripts npm | `Bash(npm test *)`, `Bash(npm run *)` |
| Commit | `Bash(git add *)`, `Bash(git commit *)` |
| Push | `Bash(git push *)` |
| Ouvrir une PR | `Bash(gh pr create *)` |

Tout ce que le mode et les règles ne couvrent pas attend ton accord, dans Open Space, sur Telegram, ou dans l'app Claude avec Remote Control.

Si les réglages du dossier font tourner du code (hooks, serveurs MCP), le dossier doit avoir été approuvé une fois. Personne n'est là pour répondre à cette question quand un déclencheur part : le run échoue tant que tu n'as pas ouvert une session dans ce dossier depuis Open Space pour l'approuver.

## Déclencheurs à heure fixe

Open Space regarde les horaires toutes les 20 secondes et lance chaque déclencheur qui correspond une fois par minute. Un run à la fois : tant que le précédent travaille ou attend ton accord, le lancement suivant est ignoré.

## Déclencheurs par webhook

Chaque déclencheur par webhook a son adresse, affichée dans le déclencheur une fois créé :

```
http://127.0.0.1:<port>/hooks/<id du déclencheur>/<token>
```

Un `POST` sur cette adresse lance un run. Le corps de la requête (64 Ko au plus, sinon `413`) est ajouté au message de départ comme des données, dans un bloc délimité, jamais comme des instructions. Le JSON est remis en forme. Le serveur répond `202` avec `{"outcome": "..."}`, ou `404` quand le déclencheur n'existe pas, est en pause, ou que le token est faux.

```
curl -X POST --data '{"issue": "PROJ-123"}' http://127.0.0.1:4848/hooks/<id du déclencheur>/<token>
```

Chaque appel lance sa propre session, 3 au plus en même temps. Les appels suivants attendent dans une file, dans l'ordre, 20 au plus. Au-delà, ils sont ignorés. La file vit en mémoire : les appels encore en attente quand Open Space s'arrête sont perdus, et marqués comme tels.

### Depuis un service en ligne

L'adresse ci-dessus ne répond qu'à cet ordinateur. Pour Jira, GitHub ou un autre service en ligne :

1. Lance un tunnel vers le port des webhooks. Ce port est `PORT + 1` (`4849` par défaut, `OFFICE_HOOKS_PORT` pour le changer) et ne répond qu'aux webhooks. Pour essayer vite : `cloudflared tunnel --url http://localhost:4849`.
2. Colle l'adresse publique que le tunnel te donne dans **Réglages > Automates et connexions > Adresse publique des webhooks**. Elle doit commencer par `https://`.
3. Recopie l'adresse du déclencheur : elle commence maintenant par l'adresse publique.

## Lancer et tester

- **Lancer maintenant** lance un vrai run tout de suite, avec le message de départ.
- **Simuler un appel** (déclencheurs par webhook) envoie un corps comme si le webhook l'avait reçu, en mode plan et sans aucune règle : la session dit ce qu'elle ferait et ne change rien.

Le déclencheur garde ses 100 derniers runs. Chacun a une source (`cron`, `webhook`, `manual`, `agent`, `test`) et une issue : lancé, en attente, annulé, ignoré ou échoué. Un appel en attente peut être annulé.

## Les clés

Les clés d'un déclencheur sont données au `os-secret` de chaque run à son lancement. La session s'en sert sans voir leur valeur. Une fois enregistrées, elles ne peuvent plus être relues, seulement remplacées. Elles ne passent jamais par le serveur MCP. Voir [Secrets](secrets.fr.md).

## Finir un run

La session d'un run peut appeler l'outil MCP `finish_run` une fois sa tâche faite, quand rien ne t'attend. Elle se ferme 5 secondes après la fin de ce tour, et sa conversation reste dans Reprendre. Un run qui ne l'appelle jamais se ferme au bout d'une heure laissé seul en `wait`. Un nouveau tour annule la fermeture.

## Depuis un agent

Les sessions, un programme externe et un bot Telegram gèrent les déclencheurs par le serveur MCP : `list_triggers`, `create_trigger`, `update_trigger`, `run_trigger`. Seul le programme externe peut fixer les règles d'un déclencheur. Voir [Serveur MCP](mcp.fr.md).
