# Worktrees : une branche et un dossier à part par session

21/10/2026. Maquettes validées par Julien : https://claude.ai/artifact/BwFbL6yVDANKFg8G2DJgBE (variante 1 pour le lancement, la 1 bis gardée en plus comme réglage manuel). Il ne relit pas le code : il ne doit jamais avoir à toucher git, et rien ne doit se perdre sans qu'on le lui dise.

## Vérifié avec Claude Code 2.1.306

- `claude --worktree <nom>` crée `<repo>/.claude/worktrees/<nom>` sur la branche `worktree-<nom>`, verrouillé (`locked`), et **n'ajoute rien à `.git/info/exclude`** : le dossier principal voit `?? .claude/` dans `git status`. On ne l'utilise pas (Open Space crée lui-même le worktree), mais on garde son emplacement pour que le terminal et Claude Code retrouvent les mêmes dossiers.
- Une conversation née dans un worktree vit sous `~/.claude/projects/<clé du worktree>/`. `claude -p --resume <id>` lancé depuis le dossier principal la retrouve, **même après `git worktree remove`**, et continue d'écrire dans le fichier d'origine. Open Space, lui, cherche les journaux par `projectFolder(cwd)` (`server/conversations.ts`) : quand une session quitte son worktree, on **déplace** ses fichiers `<id>.jsonl` (et le dossier `<id>/` des sous-agents, s'il existe) vers la clé du dossier principal, processus arrêté, pour que contexte, diff et historique se retrouvent.

## Décisions

1. **Emplacement** : `<racine du repo>/.claude/worktrees/os-<prénom>-<slug>`, branche `os/<prénom>-<slug>`. Open Space ajoute une fois la ligne `.claude/worktrees/` à `.git/info/exclude` (local, rien de commité). Une session lancée dans un sous-dossier du repo (`lilies/mobile`) travaille dans le même sous-dossier du worktree.
2. **Slug** : le tag s'il y en a un, sinon les 3 premiers mots utiles du premier message ; ASCII, minuscules, accents retirés, 24 caractères au plus ; sans message, le prénom seul. Suffixe `-2`, `-3` si la branche ou le dossier existe.
3. **Base** : la branche courante du dossier principal au lancement (le lien « Changer » propose les branches locales). La base est retenue dans la session.
4. **Ce qui est copié** : si la racine a un `.worktreeinclude` (format gitignore, la convention de Claude Code), ses fichiers ignorés ; sinon les `.env*` (hors `node_modules`) et les dossiers `node_modules` et `Pods` du dossier principal. Copie en clone APFS (`cp -c -R`, instantané, sans place en plus) ; ailleurs, ou si le clone échoue, rien n'est copié et la session installe elle-même. La session reste en « démarrage » pendant la préparation (« Préparation de la branche… » dans le fil).
5. **Fusion** : un seul commit propre, en avance rapide. La session fait la partie qui demande de l'intelligence, Open Space la partie qui doit être sûre :
   - Open Space envoie à la session la consigne : regrouper son travail en un seul commit sur sa branche avec un message clair, se remettre à jour sur la base (`git rebase <base>`), régler les conflits, lancer les vérifications rapides du projet s'il en a, ne jamais écrire dans le dossier principal. Le fil montre une bulle courte (« Fusionne dans main »), pas la consigne entière.
   - À la fin de ce tour, Open Space vérifie : worktree propre, base ancêtre de la branche. Puis avance la base : `git -C <principal> merge --ff-only <branche>` si la base y est sortie, `git update-ref` si elle n'est sortie nulle part, échec si elle est sortie dans un autre worktree.
   - Réussite : processus arrêté, `git worktree remove`, `git branch -d`, journaux déplacés, la session continue dans le dossier principal (même sous-dossier), note « Fusionnée dans main » dans le fil.
   - Échec : la carte le dit en clair avec « Réessayer ». Base qui a encore bougé : une seule relance automatique de la consigne. Dossier principal avec des modifs pas commitées sur les mêmes fichiers : « Commit d'abord les modifs de lilies (3 fichiers en commun), puis Réessayer ».
6. **Port** : rien d'automatique. La consigne donnée aux sessions isolées dit qu'un serveur de dev du dossier principal tient peut-être déjà le port, de vérifier avant d'en lancer un et de ne jamais lancer un second Metro.

## Le parcours (voir les maquettes)

### 1. Lancer
- Réglage **Isoler les sessions** : « Quand le dossier est déjà pris » (défaut), « Toujours », « Jamais ».
- Dans le lanceur, pour un dossier dans un repo git : si une autre session (pas éteinte, au repos comprise) travaille dans le dossier principal de ce repo, la ligne « Isoler sur une branche » apparaît, déjà cochée (selon le réglage) : « Hugo travaille déjà dans lilies » (« Hugo et 2 autres »), le nom de la branche, « depuis main », le lien « Changer ». Si le dossier principal a des fichiers pas commités : « Les 12 fichiers pas commités de lilies restent dans lilies » (ton ambre, discret).
- Dans le panneau de réglages de la session (TuneMenu), une ligne **Dossier : Partagé / Isolé**, pour un repo git seulement, pour forcer à la main. Les deux pilotent le même choix.
- Le serveur répond à une question du lanceur sur le dossier : est-ce un repo, sa racine principale, sa branche, ses branches locales, combien de fichiers pas commités.

### 2. Pendant
- En-tête : une pastille de branche (icône Lucide `GitBranch`, police mono, couleur d'accent) après le tag ; un clic ouvre les branches du projet.
- Salle : une petite icône de branche en pixel art sur l'étiquette, après le prénom (le tag cède la place s'il n'y en a pas).
- Liste du mode focus et carte État : l'icône après le tag.
- La consigne d'identité d'une session isolée dit : son worktree, sa branche, sa base, le dossier principal où elle ne doit pas écrire, le point sur le port.
- La vue des changements `+X −Y` compare au point de départ de la branche (`merge-base` avec la base), commits compris, pas seulement au dernier commit.

### 3. Fini
- Quand la session attend et que sa branche a du nouveau (commits d'avance ou modifs), une carte verte « Prête à fusionner dans main » à la fin du fil : branche, nombre de commits, de fichiers, « rien en cours » ou « N fichiers pas commités ». Boutons : **Fusionner**, **Ouvrir une PR** (seulement s'il y a un remote et `gh`), menu ⋯ : **Plus tard** (masque la carte jusqu'au prochain changement), **Jeter la branche** (confirmation dans la carte même).
- Pendant la fusion : carte ambre « main a bougé depuis » si la base a avancé, l'activité habituelle dans le fil, puis carte verte « Fusionnée dans main ».
- Ouvrir une PR : consigne à la session (pousser la branche, `gh pr create` vers la base, donner le lien).
- Jeter : processus arrêté, worktree et branche supprimés, journaux déplacés, la session continue dans le dossier principal.

### 4. Éteindre
- Si la branche a des commits pas fusionnés ou des modifs : un dialogue « Éteindre Lina ? » qui dit ce qu'il y a, et trois choix : **Fusionner puis éteindre**, **Garder la branche** (Open Space commit lui-même les modifs en « wip: <prénom> », supprime le dossier, garde la branche ; si la session est rallumée plus tard, son worktree est recréé depuis la branche), **Tout jeter** (en rouge).
- Rien à perdre : extinction normale, worktree et branche supprimés sans question.
- Repos : aucune question, le dossier reste.
- Oublier une session dont le worktree existe encore : jamais de perte silencieuse (commit « wip » et branche gardée s'il y a du travail).

### 5. Le ménage
- Panneau **Branches de <repo>** : chaque worktree d'Open Space et de Claude Code (`.claude/worktrees/`) et chaque branche `os/*` sans dossier. Par ligne : la tête et le prénom de la session s'il y en a, la branche, l'âge (dernier commit), un état (au travail, fusionnée, N commits pas fusionnés, modifs pas commitées), l'état de la session (au travail, au repos, éteinte).
- Cochées d'office : les fusionnées sans session au travail. Une session au travail ne se coche pas. Cocher une branche pas fusionnée passe le bouton en rouge avec ce qui sera perdu (« 2 commits perdus »). Rien n'est supprimé avant le clic sur **Nettoyer N branches**.
- Une session au repos dont la branche est nettoyée est rebranchée sur le dossier principal.
- On l'ouvre par la pastille de branche, par ⌘K « Branches », et par un rappel discret dans le lanceur quand au moins 3 branches fusionnées traînent dans le repo du dossier choisi.

## Hors du périmètre
SSH, plusieurs repos par session, ports attribués automatiquement, une session dupliquée a son propre worktree (elle reste dans celui de l'originale).
