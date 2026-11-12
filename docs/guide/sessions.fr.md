# Les sessions et leur cycle de vie

[English](sessions.md) · [Sommaire du guide](README.fr.md)

Chaque session est un processus `claude -p`, affiché comme un personnage à son bureau. Cette page explique quand ce processus tourne, quand il s'arrête, et ce qui compte dans la limite.

## Les états

| État | Ce que ça veut dire |
|---|---|
| `starting` | Le processus démarre. |
| `work` | Claude travaille sur un tour. |
| `perm` | Claude t'attend : une permission, une question ou une clé. |
| `wait` | Rien ne tourne : le tour est fini, ou la session n'a pas encore démarré. C'est à toi. Une session dont le processus a été libéré reste en `wait`. |
| `done` | Le processus `claude` s'est terminé de lui-même, proprement. |
| `closed` | Tu l'as fermée. Elle peut être reprise. |
| `error` | Le processus est mort anormalement, ou n'a pas pu démarrer. |

## Interrompre, Repos, Éteindre

Le menu de la session propose trois façons d'arrêter.

- **Interrompre** arrête le tour en cours. La session reste ouverte et garde son processus. L'outil MCP `stop_session` et la commande Telegram `/stop` font la même chose.
- **Repos** envoie la session en salle de repos. Claude Code s'arrête et la session ne prend plus de place. Son prochain message relance le processus sur la même conversation. Activer Remote Control la rappelle aussi.
- **Éteindre** retire la session d'Open Space. Ses clés sont oubliées. Si elle a sa propre branche, tu choisis de la fusionner, la garder ou la jeter. Tu peux la reprendre depuis **Reprendre** : elle revient avec son nom, et avec tout son fil pendant 30 jours. La transcription de Claude Code elle-même n'est pas touchée.

La mise au repos se fait depuis l'interface uniquement. Aucun outil MCP ne la fait.

Si la session a lancé du travail en fond (sous-agents, tâches en arrière-plan, réveils programmés), Repos demande d'abord : ce qu'elle a lancé s'arrête avec elle.

## La limite de sessions actives

`OFFICE_MAX_LIVE` (par défaut `12`) plafonne le nombre de processus `claude` vivants. Chaque processus vivant compte, y compris une session en `wait` qui attend seulement ton prochain message.

Quand une nouvelle session a besoin d'un processus et que la limite est atteinte, Open Space libère la session vivante qui attend depuis le plus longtemps. Il ne libère jamais une session qui travaille, qui te demande quelque chose, ou qui garde son processus (voir plus bas). S'il n'y en a aucune à libérer, la nouvelle session ne démarre pas et un message dit d'en arrêter une.

Une session libérée garde sa place et sa conversation. Son prochain message lance un nouveau processus.

## La libération après inactivité

Une session en `wait` libère son processus au bout de `OFFICE_IDLE_MINUTES` (par défaut `30`). Elle reprend au prochain message. Si elle a un réveil programmé, le délai court à partir de ce réveil.

## Ce qui garde un processus en vie

Une session n'est pas libérée, ni par l'inactivité ni pour faire de la place, tant que l'un de ces cas est vrai :

- un sous-agent tourne encore ;
- une tâche en arrière-plan tourne encore ;
- Remote Control est activé ;
- un réveil programmé est en attente : un réveil de `/loop` (entre 1 minute et 1 heure) ou une tâche cron récurrente créée par Claude (gardée 7 jours).

Ces sessions comptent dans la limite tant qu'elles tournent. Avec **Remote Control par défaut** activé, les nouvelles sessions démarrent sans Remote Control quand il resterait moins de 2 places libres. Leur bouton l'active quand même.

## Les runs des automates

Une session lancée par un déclencheur se ferme toute seule : 5 secondes après son appel à `finish_run`, ou au bout d'une heure laissée seule en `wait`. Un nouveau tour annule cette fermeture. Voir [Automates](automations.fr.md).
