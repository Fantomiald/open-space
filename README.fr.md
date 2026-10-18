# Open Space

[English](README.md) · **Français**

Un bureau en pixel art pour piloter plusieurs sessions Claude Code en même temps, depuis ton navigateur.

![Le bureau d'Open Space : des sessions à leur poste, deux lèvent la main pour une question](docs/images/office.png)

Chaque session est un perso assis à son poste. Il tape quand il travaille, lève la main quand il a besoin de toi, sourit quand il a fini. Un clic sur lui ouvre son fil à droite, et tu réponds sans changer de fenêtre. Plus besoin de jongler entre six terminaux pour savoir qui attend quoi.

Open Space lance le `claude` installé sur ta machine. Tes skills, tes plugins, ton `CLAUDE.md` et tes réglages de Claude Code s'appliquent comme dans ton terminal.

## Ce que tu y fais

- **Lancer des sessions** dans tes dossiers de projets, chacune avec un prénom de ton équipe. Leurs réponses s'écrivent en direct dans le fil.
- **Voir où en est chacun** dans le panneau État, en bas à gauche : ce qui t'attend et depuis quand, qui travaille et depuis combien de temps.
- **Répondre sans terminal** : les autorisations (Oui, Non, Toujours) et les questions de Claude, une par onglet comme dans Claude Code.
- **Écrire pendant qu'une session travaille** : ton message rejoint le tour en cours sans l’interrompre (Claude le lit à sa prochaine étape) ; une commande `/` attend la fin du tour, ou part tout de suite avec « Envoyer maintenant ». Et `/btw ta question` pose une question à côté, sans interrompre ni polluer la conversation.
- **Joindre n'importe quel fichier** : coller une capture (Cmd+V), glisser des fichiers sur le panneau, ou passer par le trombone. Les images partent comme images ; un zip, un PDF ou un CSV part avec son chemin, que Claude ouvre avec ses outils, comme dans le terminal.
- **Laisser les sessions se parler** : chacune porte son prénom, les autres la trouvent par lui (« demande à Charline où elle en est »). Leurs messages s'affichent dans le fil.
- **Suivre les sous-agents** : leurs têtes à côté du nom de la session, un onglet par sous-agent au travail avec ce qu'il écrit, puis son rapport dans « Terminés ».
- **Voir ce qu'une session a changé** : `+X −Y` dans son en-tête, puis chaque fichier avec son diff, comme dans Claude Code.
- **Garder un œil sur le contexte** : une jauge dans l'en-tête de la session change de couleur quand la conversation se remplit, et `/context` montre ce qui la remplit, avec les boutons pour compacter ou repartir de zéro (`/compact`, `/clear`).
- **Les vues de Claude Code dans la page** : `/mcp` liste les serveurs MCP et permet de les reconnecter, de s'y connecter ou de les couper ; `/usage` montre tes limites et ta semaine. Les commandes à option (`/model`, `/effort`…) proposent leurs valeurs.
- **Lancer une commande shell** avec `!` devant, dans le dossier de la session, sans passer par Claude : il la voit avec ton prochain message, comme dans le terminal.
- **Voir les fichiers que Claude t'envoie** dans le fil : images et schémas SVG, pages HTML en aperçu, en grand d'un clic. Les autres fichiers se téléchargent. Une page que Claude publie sur claude.ai (un artifact) s'affiche en aperçu : un clic pour la voir en grand, ou l'ouvrir sur claude.ai.
- **Ne pas perdre un message en cours** : ce que tu tapes reste dans le champ de chaque session quand tu passes d'une session à l'autre.
- **La reprendre sur ton téléphone** avec Remote Control : un bouton, et elle apparaît dans claude.ai/code et l'app Claude.
- **Ouvrir un terminal** en cliquant sur l'écran de ton bureau.
- **Lire et modifier tes notes du jour** sur le tableau blanc du bureau : un onglet par fichier Markdown de `~/Journal` (ou du dossier choisi dans les Réglages), que tes sessions peuvent aussi remplir.
- **Suivre un fichier de chiffres** (facultatif) : donne un fichier Markdown dans les Réglages, et une pile de billets apparaît sur ton bureau ; un clic affiche le fichier, un « ! » rouge flotte au-dessus quand il a changé depuis ta dernière visite.
- **Être prévenu** par un son et une notification macOS quand une session a fini ou t'attend, même onglet fermé.
- **Mettre une session au repos** dans la salle de repos, ou garder le bureau dans une mini-fenêtre au-dessus de tes autres apps.
- **Chercher** dans un fil avec Cmd+F, copier un bloc de code d'un clic.

Le tableau montre les fichiers `.md` de ton dossier de notes, un onglet par fichier, et tu peux y écrire directement. Tes sessions Claude peuvent les tenir à jour aussi : ajoute à ton `CLAUDE.md` une ligne comme `Quand une tâche est finie, ajoute une ligne dans ~/Journal/<projet>.md`. L'objet chiffres marche pareil avec n'importe quel fichier Markdown que tes scripts ou une session réécrivent (chiffres, stats, suivi) ; laisse son réglage vide et il n'apparaît pas dans le bureau.

## Ton équipe, ton bureau

Tu crées ton perso au premier lancement, puis toute ton équipe dans **Équipe** : 16 coiffures, 9 barbes, 14 hauts, des chapeaux, des lunettes de soleil, des peaux de toutes les couleurs. Une session qui porte le prénom d'un membre prend son look. Donne-leur un métier (Tech, Cyber, Produit, RH…) : une demande lancée sans choisir la personne va à quelqu'un de libre dont le métier colle, ou choisis-la toi-même dans le lanceur.

Un animal se balade dans le bureau : un chat, un chien (7 races), un canard en plastique pour le débogage, un capybara, un axolotl, Rocky de *Projet Dernière Chance*, ou Clawd, la mascotte de Claude Code. Clique dessus, il te répond à sa façon.

Le bureau suit l'heure de la journée et se déguise pour 14 fêtes : Noël, Halloween, le Nouvel An chinois, Songkran, le 14 juillet, et l'anniversaire de chaque membre de ton équipe. L'icône calendrier du bandeau te laisse les essayer toutes.

![La salle de repos décorée pour Noël](docs/images/christmas.png)

## Installer

Il te faut **Node.js 22.18 ou plus** et **Claude Code installé et connecté** ([la doc de Claude Code](https://code.claude.com/docs) explique comment).

```bash
git clone https://github.com/Fantomiald/open-space.git
cd open-space
npm ci --ignore-scripts
npm start
```

`npm start` construit l'interface, lance le serveur et ouvre ton navigateur sur **http://127.0.0.1:4848**. Mets cette adresse en favori : elle ne change pas, et un onglet ouvert se reconnecte tout seul quand le serveur redémarre. La toute première fois, le lien « Autoriser un navigateur » s'ouvre aussi : il pose un cookie qui reste valable 400 jours.

Le premier lancement te pose quatre questions : ton prénom et ton perso, les dossiers où les sessions ont le droit de travailler (Open Space te propose ceux qui contiennent des projets), puis tes habitudes : modèle et autorisations par défaut, son, notifications, animal. Tout se change ensuite dans **Équipe** et **Réglages**.

### Sur Mac : l'app du Dock

```bash
pip3 install pillow
python3 scripts/macos-app.py
```

Ça crée `~/Applications/Open Space.app`, avec ton perso en icône. L'ouvrir lance le serveur et la page, la quitter arrête le serveur. Les notifications s'affichent alors à son nom et avec ton perso. Relance le script si tu changes de look ou si tu déplaces le projet.

## Sécurité

- Le serveur n'écoute que sur ta machine (`127.0.0.1`) et refuse tout navigateur sans le cookie d'autorisation.
- Les sessions ne travaillent que dans les dossiers que tu as choisis.
- Un dossier dont les réglages lancent du code (hooks, serveurs MCP du projet) ne démarre qu'après ton accord. Sans accord, la session tourne sans ces réglages.
- Les variables `ANTHROPIC_*` et tes autres secrets de shell ne sont pas transmis aux sessions. Le serveur n'appelle rien sur internet.
- Les nouvelles sessions partent en mode **Auto** : Claude décide et te demande quand c'est risqué. Choisis « Demande à chaque fois » dans les réglages si tu préfères tout valider.

## Réglages avancés

| Variable | Rôle | Par défaut |
|---|---|---|
| `OFFICE_ROOTS` | Dossiers autorisés, séparés par `:`. Remplace ceux choisis dans la page | ceux de l'onboarding |
| `OFFICE_DIR` | Où vivent tes données (équipe, sessions, journaux) | `~/.open-space` |
| `PORT` | Port du serveur | `4848` |
| `OFFICE_MAX_LIVE` | Sessions Claude Code actives en même temps | `8` |
| `OFFICE_IDLE_MINUTES` | Après ce délai, une session inactive libère son processus (elle reprend au prochain message) | `30` |
| `OFFICE_ENV_PASSTHROUGH` | Variables de ton shell à transmettre en plus aux sessions | aucune |

## À savoir

- L'interface est en français ou en anglais (Réglages).
- Testé sur macOS, avec des navigateurs Chromium (Chrome, Arc). Les notifications et l'app du Dock sont propres à macOS.
- Open Space s'appuie sur le mode `claude -p` en stream-json, dont certaines options ne sont pas documentées. Tout a été vérifié avec Claude Code 2.1.302 : une version plus récente peut casser une fonction, ouvre une issue si ça t'arrive.

## Développer

| Commande | |
|---|---|
| `npm start` | build + serveur + navigateur |
| `npm run dev` | serveur + Vite avec rechargement à chaud (http://localhost:5174) |
| `npm run check` | types, client et serveur |
| `npm run lint` | linter ([Biome](https://biomejs.dev), règles expliquées dans `biome.jsonc`) |
| `npm test` | tests (`node:test`, sans dépendance) |
| `npm run build` | build de l'interface |

Le fonctionnement interne (serveur, protocole, salle, ce qui a été vérifié avec un vrai Claude Code) est décrit dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Les règles à suivre en modifiant le code sont dans [CLAUDE.md](CLAUDE.md).

## Crédits

- Parti de [bureau-des-agents](https://github.com/devlikemasta/bureau-des-agents) (MIT). Le serveur, le protocole et l'interface ont été réécrits ; le copyright d'origine reste dans [LICENSE](LICENSE).
- Polices [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) et [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (OFL), icônes [Lucide](https://lucide.dev) (ISC).
- Rocky vient du roman *Project Hail Mary* d'Andy Weir : un clin d'œil de fan, sans lien avec l'auteur ni l'éditeur.
- Clawd est la mascotte de Claude Code, redessinée ici en clin d'œil de fan. Open Space n'est pas un produit d'Anthropic. Claude et Claude Code sont des marques d'Anthropic.

Licence MIT, par [Fantomiald](https://github.com/Fantomiald).
