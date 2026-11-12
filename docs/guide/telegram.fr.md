# Les bots Telegram

[English](telegram.md) · [Sommaire du guide](README.fr.md)

Un bot Telegram que tu crées te prévient quand une session a besoin de toi, avec des boutons pour répondre, quand elle a fini, et t'envoie ses fichiers. Tu peux aussi lui écrire normalement. Telegram est la seule connexion sortante d'Open Space, et seulement une fois un bot ajouté.

## Ajouter un bot

1. Dans Telegram, ouvre @BotFather et envoie `/newbot`. Il te demande un nom, puis un identifiant qui finit par `bot`.
2. Copie le token qu'il te donne (une longue suite comme `123456789:AAH…`).
3. Dans Open Space, ouvre **Automates > Connexions**, choisis **Nouveau bot Telegram**, colle le token et ajoute le bot.

Le token reste sur cet ordinateur, dans `messengers.json` sous `OFFICE_DIR`, lisible par ton compte seulement. Il n'est jamais réaffiché. Tu peux ajouter 10 bots au plus.

## Relier ton téléphone

Un nouveau bot n'est relié à aucune conversation. Ouvre-le dans Telegram et appuie sur **Démarrer**. Si le bouton ne marche pas, envoie au bot le message affiché dans Open Space : `/start <code>`, avec un code à usage unique de 6 chiffres. Seule la conversation qui envoie ce code pilote le bot. Toutes les autres sont ignorées.

**Relier un autre téléphone** crée un nouveau code. **Envoyer un test** vérifie que le bot t'écrit.

## Ce que le bot te dit

Open Space regarde les sessions toutes les 2 secondes et prévient chaque bot relié pour les sessions qu'il suit :

- une permission, avec les boutons **Autoriser**, **Refuser** et **Toujours** ;
- une question, avec un bouton par option. Tu peux aussi répondre au message avec ta propre réponse ;
- une demande de clés : un simple avis. Les clés se donnent dans Open Space, jamais dans Telegram ;
- les fichiers qu'une session envoie ;
- une session qui s'arrête sur une erreur ;
- une session qui finit son tour, avec ses derniers mots.

Quand tu réponds dans Open Space, les boutons disparaissent de Telegram.

Un bot suit :

- les runs des déclencheurs qui le nomment (**Prévenir sur** dans le déclencheur). Il dit quand ils ont fini si le déclencheur a **Prévenir à la fin** activé ;
- les sessions qu'il a lancées, sauf si Remote Control est activé pour elles (l'app Claude les montre déjà) ;
- toutes les sessions, quand **Toutes les sessions** est activé dans les réglages du bot ;
- une session choisie avec `/follow`, et pas une retirée avec `/unfollow`.

## Écrire à une session

Réponds à un des messages du bot pour écrire à sa session. Les fichiers joints partent avec, 20 Mo au plus chacun.

## Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| `/sessions` | Qui fait quoi : nom, état, dossier, déclencheur, `RC` quand Remote Control est activé. |
| `/run <déclencheur> [texte]` | Lance un déclencheur. Le texte, s'il y en a un, est passé comme le corps d'un webhook. |
| `/new <dossier> <tâche>` | Lance une session dans un de tes dossiers, avec Remote Control. |
| `/stop <nom>` | Interrompt ce que fait une session. Elle reste ouverte. |
| `/remote <nom>` | Active Remote Control pour une session. |
| `/follow <nom>` | Te prévient pour une session. |
| `/unfollow <nom>` | Arrête de te prévenir pour une session. |
| `/reset` | Oublie la conversation avec l'agent. |
| `/help` | Liste les commandes. |

Sans nom, `/run`, `/new`, `/stop` et les autres listent ce que tu peux choisir.

## En langage normal

Tout le reste va à un petit agent : un `claude -p` à lui, Haiku par défaut. Tu changes son modèle dans les réglages du bot (**Modèle de l'agent**). Ses seuls outils sont ceux du serveur MCP d'Open Space. Il peut lister les sessions, leur écrire, les arrêter, activer Remote Control, lancer des sessions et des déclencheurs, et t'envoyer des fichiers. Il ne répond jamais à une permission ni à une question : tu le fais avec les boutons. Il garde sa conversation d'un message à l'autre, jusqu'à `/reset`.

## Les problèmes

Le bot affiche un problème dans Open Space quand :

- Telegram refuse le token : recopie-le depuis @BotFather (`/mybots`, puis API Token) et utilise **Nouveau token** ;
- un autre programme lit déjà le même bot : arrête-le, ou crée un bot rien que pour Open Space ;
- Telegram ne répond pas : ça reprend tout seul.

Supprimer le bot dans Open Space arrête les messages. Le bot reste sur Telegram : supprime-le avec @BotFather.
