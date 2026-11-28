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
- **Repos** envoie la session en salle de repos. Claude Code s'arrête et la session ne prend plus de place. Son prochain message relance le processus sur la même conversation. Activer Remote Control la rappelle aussi. L'outil MCP `rest_session` fait la même chose.
- **Éteindre** retire la session d'Open Space. Ses clés sont oubliées. Si elle a sa propre branche, tu choisis de la fusionner, la garder ou la jeter. Tu peux la reprendre depuis **Reprendre** : elle revient avec son nom, et avec tout son fil pendant 30 jours. La transcription de Claude Code elle-même n'est pas touchée.

Si la session a lancé du travail en fond (sous-agents, tâches en arrière-plan, réveils programmés), Repos demande d'abord : ce qu'elle a lancé s'arrête avec elle.

## Les fenêtres et le panneau des sessions

Le panneau à gauche liste les sessions par projet, dans la salle comme en mode focus. Un clic sur une ligne, ou sur le personnage dans la salle, ouvre sa fenêtre. Si elle est déjà ouverte, elle passe devant. Si c'est celle où tu es, elle se ferme.

En bas du panneau, **Fenêtres 1 à 6** fixe combien de fenêtres de session restent ouvertes à la fois (6 par défaut, moins si l'écran est étroit). Les fenêtres flottantes comptent, les mods non. Une fois le nombre atteint, la session que tu ouvres prend la place de celle ouverte depuis le plus longtemps. Baisser le nombre ferme d'abord les plus anciennes.

Au survol d'une ligne, **Éteindre** fait comme le menu de la session. Le titre d'un projet propose son icône de dossier, qui ouvre le dossier dans le Finder (l'Explorateur sous Windows, le gestionnaire de fichiers ailleurs), et son **+**, une nouvelle session dedans. **Éteintes** ouvre **Reprendre** sur le projet en vue. Le bouton du haut, ou ⌘ B (Ctrl B), replie le panneau jusqu'aux visages. **Réglages › Apparence › Panneau des sessions** le coupe : la salle revient sans lui, le mode focus avec sa propre liste.

### Déplacer le panneau et le reste

Sur un écran large, ⌥ + glisser (Alt + glisser) déplace aussi ce qui entoure les fenêtres : le panneau des sessions, la carte **État**, l'astuce ⌥, et l'en-tête en trois morceaux (les pièces avec les projets, la radio, les outils à droite). Ils collent aux bords proches comme les fenêtres ; ⌘ (Ctrl) tenu enlève les aimants. Le panneau se prend aussi par son en-tête, sans ⌥ : tiré loin du bord, il flotte au-dessus de la salle et ne pousse plus rien ; lâché contre le bord gauche, il s'y range à nouveau. Rangé à gauche, son bord droit l'élargit. Flottant, le panneau se redimensionne par ses bords. Un appui sur un élément déplacé le passe devant les fenêtres flottantes, et un appui sur une fenêtre la repasse devant. La place et cet ordre sont gardés dans ce navigateur ; ⌘K **Remettre la disposition par défaut** remet tout à sa place.

Le lanceur bouge comme une fenêtre de session, dans la salle comme en mode focus : tiré par sa barre, il flotte là où tu le lâches et se redimensionne par ses bords ; lâché sur les fenêtres, il reprend la place de la prochaine session. Quand plus aucune fenêtre n'a de place, il les couvre et dit laquelle sa session remplacera.

L'astuce ⌥ s'en va une fois la salle ou une fenêtre déplacée avec ⌥, ou par son bouton de fermeture ; la déplacer elle-même ne compte pas. **Réglages › Apparence › Toujours afficher l'astuce Alt** la garde pour de bon, sans bouton pour la fermer.

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
