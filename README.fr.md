# Open Space

[English](README.md) · **Français**

Un bureau en pixel art pour piloter plusieurs sessions Claude Code en même temps.

[![Dernière version](https://img.shields.io/github/v/release/Fantomiald/open-space)](https://github.com/Fantomiald/open-space/releases/latest)
![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-lightgrey)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

**[Télécharger pour Mac](https://github.com/Fantomiald/open-space/releases/latest)** · [Lancer depuis le code](#lancer-depuis-le-code) · [Nouveautés](CHANGELOG.md)

![Lina lève la main pour une autorisation Bash, un clic sur elle ouvre la conversation, Oui, et elle se remet au travail pendant que les autres tapent](docs/images/office.gif)

Chaque session est un perso assis à son poste. Il tape quand il travaille, lève la main quand il a besoin de toi, sourit quand il a fini. Un clic sur lui ouvre son fil, et tu réponds sans changer de fenêtre. Plus besoin de jongler entre six terminaux pour savoir qui attend quoi.

Open Space lance le `claude` installé sur ta machine : tes skills, tes plugins, ton `CLAUDE.md` et tes réglages s'appliquent comme dans ton terminal.

## Ton poste

![Cmd+. remplace la salle par le mode focus : les sessions à gauche, les conversations côte à côte ; Tab les écarte pour voir la salle](docs/images/focus.gif)

- **Voir qui a besoin de toi.** Le panneau État liste ce qui t'attend et depuis quand, qui travaille, et qui est prêt pour un nouveau message.
- **Ouvrir jusqu'à six conversations** côte à côte. Tab les fait glisser hors de vue pour voir la salle, Tab les ramène.
- **Le mode focus** (Cmd+.) remplace la salle par la liste de tes sessions, rangées selon ce qu'elles attendent. La liste se replie aux seules têtes quand tu veux de la place.
- **Tout chercher** avec Cmd+K : sessions, messages, commandes et réglages.
- **Être prévenu** par un son et une notification macOS quand une session a fini ou t'attend, même fenêtre fermée.
- **Continuer sur ton téléphone** avec Remote Control : un bouton, et la session apparaît dans claude.ai/code et l'app Claude.

### Range-le à ta façon

![Fenêtres libres : trois conversations posées à la main au-dessus de la salle, celle de Lina devant](docs/images/free-windows.png)

Prends une fenêtre par sa barre de titre pour réordonner la grille, ou passe le bandeau en fenêtres libres et pose chacune où tu veux. Les fenêtres s'aimantent entre elles (Cmd enfoncé pour couper) ; lâchée contre un bord, une fenêtre prend la moitié de l'écran, dans un coin le quart, en haut tout l'écran. Retour à la grille, tout se range.

Option + glisser déplace la salle, Option + molette ou pincement la zoome. Tailles et positions restent d'une visite à l'autre.

## Dans la conversation

- **Répondre sans terminal** : les autorisations (Oui, Non, Toujours) et les questions de Claude, une par onglet comme dans Claude Code.
- **Écrire pendant qu'une session travaille.** Ton message rejoint le tour en cours (Claude le lit à sa prochaine étape). `/btw ta question` pose une question à côté sans encombrer le fil.
- **Joindre n'importe quel fichier** : coller une capture avec Cmd+V, glisser des fichiers, ou passer par le trombone. Les images partent comme images, un zip ou un PDF part avec son chemin.
- **Taper `/`** pour choisir une commande ou un skill du dossier de la session, avec ses options. Taper `!` pour lancer une commande shell dans ce dossier.
- **Changer le modèle, l'effort et les permissions** d'une session dans un seul panneau, même en pleine tâche.
- **Suivre les sous-agents** : leurs têtes sur l'étiquette de la session, un onglet pour chacun, puis son rapport.
- **Voir ce qui a changé** : `+X −Y` dans l'en-tête, puis chaque fichier avec son diff.
- **Surveiller le contexte** : une jauge se remplit et le champ propose de compacter. `/context`, `/mcp` et `/usage` s'ouvrent en vues dans la page.
- **Voir ce que Claude t'envoie** : images, schémas, vidéos, pages Markdown et HTML s'affichent dans le fil. Une page publiée sur claude.ai s'affiche en aperçu vivant.
- **Faire parler les sessions entre elles** par leur prénom (« demande à Margot où elle en est »).
- **Envoyer une session en salle de repos** : elle libère son processus et revient avec ton prochain message. **La dupliquer** pour tenter une autre piste pendant que l'originale continue.

## Une branche par session

Plusieurs sessions dans le même projet ne se marchent plus dessus. Quand une autre session travaille déjà dans le dossier, le lanceur propose **Isoler sur une branche**, déjà coché : la nouvelle session part sur sa propre branche (`os/lina-apple-pay`), dans son propre dossier (un worktree git dans `.claude/worktrees/`), avec les `.env` et les `node_modules` du projet copiés en un instant.

- **Tu ne touches jamais à git.** Quand elle a fini, une carte « Prête à fusionner dans main » arrive à la fin du fil. **Fusionner** demande à la session de tout regrouper en un commit et de se remettre à jour ; Open Space vérifie, avance `main` et supprime le dossier. La session continue dans le projet, sur `main`. **Ouvrir une PR** pousse la branche et ouvre la pull request avec `gh`.
- **Rien ne se perd sans que tu le saches.** Éteindre une session dont la branche a du travail demande quoi en faire : fusionner puis éteindre, garder la branche (son travail est commité, elle revient si tu reprends la conversation), ou tout jeter.
- **Le ménage** : la pastille de branche, ⌘K « Branches » ou un rappel dans le lanceur ouvrent les branches du projet, avec qui, depuis quand, fusionnée ou non. Les fusionnées sont cochées, le reste attend ton accord.
- Le réglage **Isoler les sessions** (Réglages > Sessions) : quand le dossier est déjà pris, toujours, ou jamais. Le panneau des réglages de la session (Dossier : Partagé / Isolé) force le choix pour une session.

## Ton équipe

![La fenêtre Équipe : Léo, punk à la peau verte, crête rose, œil cyborg et guitare dans le dos, avec son anniversaire et ses métiers](docs/images/crew.png)

Tu crées ton perso au premier lancement, puis toute ton équipe : 28 coiffures, 34 hauts, 22 chapeaux, 18 accessoires (jetpack, perroquet sur l'épaule, katana, guitare…), des peaux de toutes les couleurs, et des tenues d'anime à porter pièce par pièce. Une session au prénom d'un membre prend son look.

Donne-leur un anniversaire et les salles leur font une fête. Donne-leur un métier (Tech, Design, Data, Cyber…) : une demande lancée sans choisir personne part à un membre libre dont le métier colle.

Choisis un animal parmi 25 : un chat, un chien (7 races), un renard, un hibou, un dragon, un slime, un canard en plastique pour déboguer, Rocky de *Projet Dernière Chance*, Clawd… Clique dessus, il te répond à sa façon.

## Ta salle

![Les six thèmes l'un après l'autre : navette spatiale, Tokyo néon, donjon, plage, bateau pirate et cabane en forêt](docs/images/themes.gif)

Six thèmes dans **Réglages > Bureau** : une navette spatiale, une rue de Tokyo au néon, un donjon, un bar de plage, un bateau pirate et une cabane en forêt. Murs, sol, meubles, ciel et lumières changent, au bureau comme en salle de repos.

![Le ciel au-dessus du bureau de l'aube à la nuit : des nuages le jour, puis les étoiles, la lune et les lampes allumées](docs/images/sky.gif)

Le ciel suit ton heure : nuages le jour, étoiles et bureau éclairé la nuit. Les salles se déguisent pour 14 occasions, de Noël et Halloween à Songkran et à l'anniversaire de chaque membre de l'équipe. L'icône calendrier du bandeau permet de toutes les essayer.

Dans le bureau, clique sur l'écran de ton poste pour ouvrir un terminal, et sur le tableau blanc pour lire et modifier tes notes (un onglet par fichier Markdown de `~/Journal`, que tes sessions peuvent aussi remplir). Indique un fichier de chiffres dans les Réglages et une pile de billets apparaît sur ton bureau, avec un « ! » rouge quand le fichier a changé. La radio joue du lo-fi, ou pilote Musique ou Spotify sur Mac.

## Installer

Il te faut **Claude Code installé et connecté** ([la doc de Claude Code](https://code.claude.com/docs) explique comment).

### Sur Mac

Télécharge le `.dmg` de la [dernière version](https://github.com/Fantomiald/open-space/releases/latest) : `arm64` pour les Mac Apple Silicon, `x64` pour les Mac Intel. Glisse Open Space dans Applications et ouvre-le. L'app est signée et notarisée, et se met à jour toute seule.

Fermer la fenêtre laisse tourner tes sessions : l'icône du Dock la rouvre et les notifications arrivent toujours. Quitter l'app les arrête, et elles reprennent au prochain lancement.

### Lancer depuis le code

Il te faut **Node.js 22.18 ou plus récent**.

```bash
git clone https://github.com/Fantomiald/open-space.git
cd open-space
npm ci --ignore-scripts
npm start
```

`npm start` construit l'interface, démarre le serveur et ouvre **http://127.0.0.1:4848**. La première fois, le lien « Autoriser un navigateur » s'ouvre aussi : il pose un cookie valable 400 jours. Si l'app Mac est installée, elle s'ouvre sur ce serveur au lieu de lancer le sien.

Le premier lancement demande ton prénom et ton perso, les dossiers où les sessions peuvent travailler, puis tes habitudes (modèle, permissions, son, animal). L'interface est en français ou en anglais selon ton navigateur, et tout se change dans les **Réglages**.

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1` et refuse tout navigateur sans le cookie d'autorisation.
- Les sessions ne travaillent que dans les dossiers que tu as choisis.
- Un dossier dont les réglages font tourner du code (hooks, serveurs MCP du projet) ne démarre qu'avec ton accord. Sans ton accord, la session tourne sans ces réglages.
- Les variables `ANTHROPIC_*` et tes autres secrets de shell ne sont pas transmis aux sessions. Le serveur n'appelle rien sur internet (la radio passe directement par ton navigateur).
- Les nouvelles sessions démarrent en mode **Auto** : Claude décide, et te demande quand quelque chose est risqué. Choisis « Demande à chaque fois » dans les Réglages pour tout valider.

## Bon à savoir

- Testé sur macOS avec les navigateurs Chromium (Chrome, Arc). Les notifications, l'app et la télécommande Musique et Spotify ne marchent que sur macOS.
- Open Space s'appuie sur `claude -p` en mode stream-json, dont certaines options ne sont pas documentées. Une version plus récente de Claude Code peut casser une fonction : [ouvre une issue](https://github.com/Fantomiald/open-space/issues) si ça t'arrive.
- Les commentaires du code et la doc interne ([ARCHITECTURE.md](docs/ARCHITECTURE.md), [CLAUDE.md](CLAUDE.md)) sont en partie en français.

<details>
<summary><b>Réglages avancés</b></summary>

| Variable | Rôle | Par défaut |
|---|---|---|
| `OFFICE_ROOTS` | Dossiers autorisés, séparés par `:`. Remplace ceux choisis dans la page | ceux de l'onboarding |
| `OFFICE_DIR` | Où vivent tes données (équipe, sessions, journaux) | `~/.open-space` |
| `PORT` | Port du serveur | `4848` |
| `OFFICE_MAX_LIVE` | Sessions Claude Code qui tournent en même temps | `8` |
| `OFFICE_IDLE_MINUTES` | Au-delà, une session inactive libère son processus (elle reprend au prochain message) | `30` |
| `OFFICE_ENV_PASSTHROUGH` | Variables de ton shell à passer en plus aux sessions | aucune |

</details>

<details>
<summary><b>Développer</b></summary>

| Commande | |
|---|---|
| `npm start` | build + serveur + navigateur |
| `npm run dev` | serveur + Vite avec rechargement à chaud (http://localhost:5174) |
| `npm run check` | types : client, serveur et app |
| `npm run lint` | linter ([Biome](https://biomejs.dev), règles expliquées dans `biome.jsonc`) |
| `npm test` | tests (`node:test`, sans dépendance) |
| `npm run app:dev` | l'app Mac depuis le repo, sans l'empaqueter |
| `npm run app` | un `.dmg` Apple Silicon et Intel, signé ad hoc (sur un autre Mac : **Réglages Système > Confidentialité et sécurité > Ouvrir quand même**) |
| `npm run app:release` | pareil, signé avec un certificat « Developer ID Application » et notarisé par Apple : demande une clé API App Store Connect dans `APPLE_API_KEY` (chemin du `.p8`), `APPLE_API_KEY_ID` et `APPLE_API_ISSUER` |
| `npm run app:publish` | pareil, envoyé sur une release GitHub en brouillon (`GH_TOKEN`) ; les apps installées se mettent à jour depuis la dernière release publiée |

Le fonctionnement interne (serveur, protocole, bureau, et ce qui a été vérifié sur un vrai Claude Code) est décrit dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Les règles pour modifier le code sont dans [CLAUDE.md](CLAUDE.md).

</details>

## Crédits

- Parti de [bureau-des-agents](https://github.com/devlikemasta/bureau-des-agents) (MIT). Le serveur, le protocole et l'interface ont été réécrits ; le copyright d'origine reste dans [LICENSE](LICENSE).
- Polices [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) et [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (OFL), icônes [Lucide](https://lucide.dev) (ISC).
- Les tenues d'anime sont un clin d'œil de fan à *Naruto* et *One Piece*, sans lien avec leurs auteurs ni leurs éditeurs. Rocky vient du roman d'Andy Weir *Projet Dernière Chance*, même esprit.
- Clawd est la mascotte de Claude Code, dessinée ici en clin d'œil de fan. Open Space n'est pas un produit d'Anthropic. Claude et Claude Code sont des marques d'Anthropic.

Licence MIT, par [Fantomiald](https://github.com/Fantomiald).

### Installer sur Windows

Installer Git pour Windows et Claude Code, puis exécuter `npm ci` et `npm run app:win`. L’assistant NSIS x64 se trouve dans `release/`. Pour ARM64 : `npm run app:win:arm64`. Les installateurs locaux ne sont pas signés. Voir [les détails et limites Windows](docs/windows/windows-runtime.md).
