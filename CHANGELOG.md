# Versions

## 1.32.2

- Fenêtres : chaque mode garde sa grille. Passer du mode focus à la salle (bureau, repos, automates) et revenir retrouve les fenêtres où on les avait laissées, et bouger une fenêtre ou un mod d'un côté ne change plus la disposition de l'autre.
- Pièces jointes : elles tiennent sur une ligne qui défile au lieu de pousser la conversation, une vidéo montre sa première image, et un clic sur une vidéo ou un PDF l'ouvre en grand avant l'envoi.
- Les fichiers qu'on envoie s'affichent dans la conversation : vidéos en vignettes à lire en grand, PDF dans la visionneuse, sons, textes et images à ouvrir, le reste à télécharger.
- Les navigateurs intégrés n'ont plus de son : une vidéo ou une musique qu'un agent teste ne sort plus à fond dans les haut-parleurs.
- Vient de la PR de GC : Open Space répond aux demandes des serveurs MCP qui posent une question en cours de route (élicitation).

## 1.32.1

- Mods : chaque mod est servi à une adresse à lui (`<mod>.localhost`, sur le port d'Open Space + 2), qui n'est ni celle d'Open Space ni celle d'un autre mod. Il peut donc intégrer un lecteur YouTube, Spotify, une carte ou tout site qui accepte d'être intégré. Un site qui le refuse reste vide : le guide du kit dit à l'agent de proposer un lien à la place.

## 1.32.0

- Un seul modèle de fenêtre : une conversation ou un mod glissé vers les autres se range dans la grille, tiré dehors il flotte. La bascule Grille / Libre disparaît. Un mod rangé ne recharge pas sa page. « Ranger les fenêtres » dans ⌘K.
- Mode focus : la liste se groupe par état ou par projet (icône filtre), sur deux lignes avec les tags en entier. La session qu'on vient d'ouvrir reste à sa place dans « À toi ». En vue Tout, chaque fenêtre dit son projet.
- En-tête : la jauge montre deux anneaux, les 5 heures et la plus remplie des limites longues. Le bouton Équipe part dans les Réglages, la radio se coupe dans Réglages > Apparence.
- Haut des fenêtres allégé : Agrandir, Sortir et Renommer dans ⋯, renommer aussi au double-clic sur le nom. Interrompre passe dans le champ, à la place d'Envoyer quand le champ est vide. Les tags s'ajoutent dans un petit champ à part. L'en-tête des mods a la même hauteur et les mêmes boutons que celui des conversations, avec ⋯.
- Réglages réorganisés : Général, Apparence (thème, ambiance, « Cacher les prénoms » dans la salle, radio), Sessions, Claude, Dossiers et notes, Automates et connexions (Telegram et accès externe y passent), Usage, Raccourcis, À propos.
- Salle : le panneau État se redimensionne (poignée en haut à droite, double-clic pour revenir), la carte des automates dit combien sont actifs et quand part le prochain. « Lire X » dans la liste des choses à faire.
- Telegram : une session lancée depuis le bot n'est plus suivie quand Remote Control est allumé, `/follow` et `/unfollow` choisissent.
- Corrigé : Échap sur la jauge n'interrompt plus la session ouverte, l'en-tête reste au-dessus des fenêtres flottantes, qui ne passent plus dessous, et le bouton rafraîchir d'un mod tourne pendant le chargement.
- Vient des PR de Quentin et GC : Reprendre liste les conversations de Claude Desktop et les reprend dans leur worktree, sur leur branche, avec une fusion vers la branche d'où elles sont parties ; un `/clear` retire les tags de la session et en propose de nouveaux au premier message.

## 1.31.0

- Quoi de neuf : à la première ouverture d'une nouvelle version, une fenêtre montre ses nouveautés, avec un dessin, ses points forts et un bouton vers chaque fonction quand il y en a un. Elle ne revient pas sur un patch de la même version, et se rouvre depuis Réglages > À propos.
- L'onboarding refait : la salle dessinée dès l'accueil (au travail, t'attend, fini), puis une étape Découvrir après les réglages : sessions en parallèle, automates et Telegram, mods, navigateur en mini-fenêtre, Tab, mode focus et fenêtres sorties. On peut la passer, et on peut la refaire depuis Réglages > À propos (« Revoir la visite »).
- Sortir une version : une version mineure doit avoir ses nouveautés dans la fenêtre, et les tests échouent tant qu'elles manquent.

## 1.30.1

- Le message écrit dans « Nouvelle conversation » reste quand on va voir une session et qu'on revient (N).
- Suggestions de message : elles arrivent aussi sur les comptes où Anthropic ne les a pas encore ouvertes (le réglage force `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`).
- Vient de la PR de GC : l'icône du Dock à la taille et à l'arrondi des autres icônes macOS.

## 1.30.0

- Sortir une fenêtre : une conv, un mod ou le navigateur sort d'Open Space dans sa propre fenêtre, gardée au-dessus des autres apps (même en plein écran) ou non, et revient d'un clic.
- Tab masque tout sauf la salle : l'en-tête, les états, les convs, le lanceur et les mods. Un rappel en haut à droite dit comment tout réafficher, puis s'efface quand la souris ne bouge plus.
- Tag auto : une consigne libre dans les Réglages (« si on parle d'un ticket, mets sa clé »), visible quand le tag auto est allumé.
- Mods : `OpenSpace.store` garde leurs données (une check-list, un post-it) d'une ouverture à l'autre, et la fenêtre d'un mod n'est plus plus haute que son contenu.
- `create_mod` appelé depuis une session : la session construit le mod elle-même au lieu d'en lancer une autre.
- Vient des PR de JB et GC : suggestions de message prises avec Tab, comme dans Claude Code ; `/clear` vide le fil ; limite hebdo Fable dans l'en-tête ; agents des workflows parmi les sous-agents ; CI Windows réparée.

## 1.29.1

- Une session peut t'envoyer un fichier sur Telegram tout de suite (`send_file` du MCP), au seul bot que tu as ou à celui que tu nommes ; avec plusieurs bots, elle te demande lequel. Elle ne crée plus d'automate pour un envoi ponctuel : `create_trigger` est réservé aux tâches qui reviennent ou qu'un webhook lance.

## 1.29.0

Vient de Mouhrad, repris pour servir à tout le monde :

- Déclencheurs : une session qui part toute seule, à heure fixe (cron à 5 champs, heure locale) ou quand un autre programme appelle son webhook (un ticket Jira assigné, par exemple). Un déclencheur a un nom, un dossier de projet, un message de départ, et au choix un agent de l'équipe, un rôle Claude Code (`.claude/agents/<rôle>.md`, lancé avec `--agent`), un modèle, un mode de permission et Remote Control (allumé par défaut : on suit et on valide depuis l'app Claude du téléphone). Ses runs sont des sessions Open Space normales, créées comme depuis la page (mêmes règles de confiance des dossiers) : on y répond, on valide, on reprend. Ce qu'il fait sans demander : des règles de permission de Claude Code (`Edit`, `Bash(git push *)`), avec des raccourcis (lire le code, modifier les fichiers, scripts npm, commit, push, ouvrir une PR) et la liste modifiable ligne à ligne ; données à ses sessions avec `--allowedTools`, en plus de leur mode. Une session ne peut pas les régler par le MCP, et un test n'en utilise aucune. Un webhook lance une session par appel, jusqu'à 3 en même temps ; les appels suivants attendent leur tour dans l'ordre, affichés « en attente » et annulables. Un déclencheur à heure fixe fait un run à la fois : tant que le précédent travaille ou attend un accord, le départ suivant est sauté et noté. Ses clés : données à chaque run, qui s'en sert avec `os-secret` sans voir leur valeur ; gardées dans `trigger-keys.json` du dossier d'Open Space (lisible par ton compte seul), jamais relues par la page une fois enregistrées, seulement remplacées ou retirées.
- Connexions : un bot Telegram (le token de @BotFather, puis `/start <code>` pour relier ta conversation) te prévient de ce que les sessions attendent, avec des boutons pour répondre, des fins de run et des fichiers qu'elles envoient. Tu réponds à un message pour écrire à sa session, tu lances avec `/run`, `/new`, `/stop`, `/remote`, ou tu parles normalement : un petit agent (Haiku) pilote Open Space pour toi (« où en est JD ? », « dis-lui d'ajouter les tests »), sans jamais valider une permission. Une réponse donnée dans Open Space retire les boutons sur Telegram. Chaque déclencheur choisit ses bots ; un bot peut aussi suivre toutes les sessions. Plusieurs bots, suppression confirmée. Slack et Discord à venir. Seul appel sortant d'Open Space, vers Telegram, et seulement quand un bot existe.
- Les sessions ne peuvent plus lire ni modifier les clés d'Open Space (clés des déclencheurs, clé MCP, secret de jumelage) avec leurs outils de fichiers.
- Le webhook : `POST http://127.0.0.1:<port>/hooks/<id>/<jeton>`, un jeton long et aléatoire par déclencheur, corps de 64 Ko au plus, donné à la session comme donnée encadrée et jamais comme consigne. Le serveur reste sur 127.0.0.1 : pour Jira ou un autre service en ligne, il faut un tunnel (cloudflared, ngrok) vers cette adresse.
- Le panneau Automates (bouton à robot de l'en-tête, toujours là), rangé comme les Réglages et l'Équipe, gère les déclencheurs : liste, création, modification (enregistrée toute seule), suppression, l'adresse du webhook à copier, et les derniers runs avec un lien vers leur session. Une barre sous l'en-tête dit où en est le déclencheur (prêt, en pause, au travail, attend ton accord) et le pilote : Lancer maintenant, Mettre en pause ou Reprendre, et Arrêter tant que la session de son dernier run travaille. Un déclencheur webhook peut aussi simuler un appel avec un faux corps, en mode plan : la session dit ce qu'elle ferait sans rien modifier.
- La salle des serveurs accueille les sessions lancées par un déclencheur, en robots (une couleur par rôle ou par déclencheur) : un clic ouvre leur panneau de session comme pour les autres. Elle, son portail et le droïde existent dès qu'il y a un déclencheur ou un dossier de runs externes.
- Le serveur MCP `open-space` est donné à chaque session (sauf celles d'un dossier pas approuvé) : lister, créer, modifier et lancer des déclencheurs, créer une session, ajouter un agent à l'équipe, lire et changer quelques réglages d'affichage. Jamais les clés, les dossiers autorisés, la sécurité ni la confiance des dossiers ; chaque appel passe par les permissions de la session. Par exemple, une session à qui on parle domotique depuis longtemps peut proposer de créer un agent dédié, puis le faire.
- Accès externe au MCP : un autre programme de l'ordinateur (un bot Telegram, un script) peut piloter Open Space avec les mêmes outils, par une adresse à clé générée à la demande dans le panneau Automates (désactivé par défaut, « Régénérer » révoque l'ancienne clé, toujours sur 127.0.0.1). Le panneau donne l'adresse, la configuration MCP et la commande `claude mcp add` à copier. Ce programme peut aussi suivre les sessions et leur répondre (`list_sessions`, `send_message`, `answer_permission`, `stop_session`) : un bot Telegram relaie ainsi les demandes de permission et les réponses. Une session n'a jamais ces outils, et une demande de clés ne se répond que dans Open Space.
- Runs externes, en option : le réglage « Dossier des runs externes » (Réglages > Notes, vide par défaut) montre en lecture seule, dans la salle des serveurs, les `claude -p` qu'un autre programme lance hors d'Open Space. Contrat réduit au générique : un fichier `runs/<id>.json` (ou `state/runs/<id>.json`) par run avec `id`, `sessionId` (passé en `--session-id`), `cwd`, `status` (`running`, `done`, `failed`), `pid`, `startedAt`, `endedAt`, et `role` et `task` facultatifs ; les rôles sont lus dans `.claude/agents/*.md` du dossier. Le fil d'un run et de ses sous-agents se lit dans son transcript Claude Code.
- Un portail relie l'open space et la salle des serveurs : un anneau dressé à l'avant de la salle, un vortex dedans ; un clic, une colonne de lumière, et on arrive dans l'anneau jumeau de l'autre salle.
- Le droïde des automates roule de salle en salle (par la porte ou le portail), fait bip de temps en temps, et ouvre le panneau des automates au clic. Il se règle dans l'équipe, à côté de l'animal : dôme rond, tête carrée ou sphère, sa couleur, ou aucun.
- Mods par le MCP : `list_mods`, `create_mod` (comme « Nouveau mod »), `update_mod` (la session du mod fait le changement) et `delete_mod` (à la Corbeille). Le bouton Mods de l'en-tête n'a plus que son icône, comme les autres.
- Plafonds d'un automate, chacun facultatif : un coût (en dollars, estimé au prix public d'après les tokens de chaque réponse) et un temps (en minutes). Passé l'un d'eux, le run s'arrête et se ferme, et son fil dit pourquoi. Réglables sur sa page ou par le MCP (`maxCost`, `maxMinutes`).
- Le fichier des chiffres (Réglages, rubrique renommée « Notes ») et son panneau disparaissent : l'objet de la salle ouvre les mods, et des chiffres se font maintenant en mod.
- Réglages d'un mod : nom, description, icône, rafraîchissement automatique et variables d'environnement que sa page demande.
- Le contour au survol suit la forme dessinée par le thème : l'objet des mods, le portail, le tableau, le poste de l'utilisateur (laptop, grimoire, journal de bord…) et la porte.

## 1.28.0

- Mods : des petites fenêtres que tes agents fabriquent pour toi. Le bouton Mods, à côté d'Équipe, ouvre la liste de tes mods et un champ « Nouveau mod » : tu décris ce que tu veux (« mes coûts Claude de la semaine », « un minuteur pomodoro »), une session le fabrique dans son propre dossier et la fenêtre s'ouvre dès qu'il est prêt.
- Une fenêtre de mod se déplace, se redimensionne, se replie, se recharge et se ferme ; elle prend le style, l'opacité et le contour de tes fenêtres, et la hauteur de son contenu. Le crayon rouvre la session qui l'écrit pour le modifier.
- Les mods sont aussi dans ⌘K, et un point sur le bouton Mods (comme le « ! » de l'objet de la salle) dit quand les données d'un mod fermé ont changé.
- Un kit pour les agents : des composants testés de 240 à 960 px (chiffres clés, courbes, barres, jauges, listes, tableaux, états vide, chargement et erreur), leur galerie, et un guide que chaque session de mod suit. Un mod peut lire tes sessions, ton quota et tes coûts.
- Chaque page de mod tourne isolée, sans accès à Open Space ni à ses cookies.
- Dans la salle, l'objet des chiffres devient celui des mods et ouvre leur fenêtre : la télé du bureau descend un peu, et chaque thème a le sien (hologramme, borne d'arcade, grimoire, planches de surf, carte au trésor, cabane à oiseaux, terminal). Les décorations de fête du mur gauche s'en écartent. Le fichier de chiffres des Réglages reste une carte de la fenêtre des mods.

## 1.27.4

- Récap de la semaine : la flèche « Semaine précédente » ne fait plus planter l'affichage.

## 1.27.3

Vient de Mouhrad :

- Les worktrees faits à la main (`git worktree add`) ne sont plus proposés comme des projets à part dans le choix du dossier, et une session lancée dans l'un d'eux est rangée dans son projet principal (filtre du header, recherche ⌘K, panneau Branches).
- Le choix du dossier ne propose plus l'intérieur d'un projet : `app/src` ou `app/mobile` n'apparaissent plus, seulement `app`. Un dossier qui regroupe plusieurs projets montre toujours ses sous-dossiers.

## 1.27.2

Vient de GC :

- Tâches en fond : une pastille sous le champ dit ce qui tourne (« 1 shell en fond », « 1 moniteur en fond », « 3 tâches en fond »). Un clic ouvre la liste, avec un bouton Arrêter pour chaque tâche. Le panneau d'état et les questions de Repos et Éteindre emploient les mêmes mots.
- Le fil suit une entrée qui grandit : la fin d'un diff ne reste plus sous le bord. Déplier un diff garde sa place.
- Le style de fenêtre « Terminal » s'appelle maintenant « Claude Code ».

## 1.27.1

Vient de GC :

- Style Terminal : chaque élément du fil s'aligne sur la colonne du texte. Une autorisation passe sous son action avec « ⎿ », ce que l'agent envoie (images, fichiers, page) prend le « ● » d'un message, une commande `!` met son « ! » à la place du « ❯ », et les sous-agents suivent la même colonne.

## 1.27.0

Vient de GC :

- Le champ de message grandit avec ce qu'on écrit, comme dans Claude Code : jusqu'à douze lignes dans une fenêtre seule, six dans une petite, puis il défile. Quand trois fenêtres sont empilées, il s'arrête à deux lignes et les boutons restent à sa gauche, pour garder le fil lisible. Le champ du lanceur grandit aussi.
- Dans une petite fenêtre, les boutons passent sous le champ.
- Après un rechargement, toutes les fenêtres retrouvent leur conversation : seule celle qui avait le clavier la chargeait, les autres restaient sur « Chargement… ».

## 1.26.0

Tout vient de GC :

- Plusieurs tags par session : jusqu'à cinq, chacun de sa couleur si « Couleur sur les tags » est activé. Une pastille avec sa croix dans l'en-tête de la fenêtre, « + Tag » pour en ajouter, `/tag Pro, PDF` pour les remplacer. La salle et les listes en montrent deux puis « +N », et `@` trouve une session par n'importe lequel de ses tags.
- Mon Chrome (Sessions > Navigateur, coupé par défaut) : une session peut passer par ton vrai Chrome, déjà connecté à tes comptes, via l'extension Claude in Chrome, au lieu du navigateur partagé. Pour toutes les sessions ou une seule, depuis son onglet Navigateur. L'extension peut ne rien demander avant d'agir : c'est le mode de la session qui garde tes comptes.
- Actions détaillées dans le fil (Général > Fils, coupé par défaut) : chaque action s'affiche à part, comme dans Claude Code, avec ce qu'elle a rendu, et le diff des fichiers modifiés.
- Blocs de code colorés selon leur langage, dans tous les styles. Les listes à puces retrouvent leurs puces, et le code n'est plus tout en gras.
- Style Terminal : le Markdown se lit comme dans Claude Code (titres, code en couleur, listes, cases à cocher, tableaux).

## 1.25.0

- Style des fenêtres (Général > Affichage) : l'habillage des fenêtres et du fil se choisit à part du thème du bureau. Classique, Terminal (le fil se lit comme Claude Code dans un terminal), Hacker, Tokyo néon, Donjon, Navette spatiale, Plage, Pirate, Forêt, ou Assorti au bureau, qui suit le thème. Seul l'habillage change, tous les boutons restent.
- Opacité des fenêtres (Général > Affichage) : un curseur règle d'un coup tout le verre, en-tête, fenêtres et menus compris.
- Nouveau thème de bureau : la cave de hackers, avec ses écrans, ses câbles et du code en fond.
- Remote Control par défaut (Sessions > Par défaut) : chaque nouvelle conversation est joignable depuis ton téléphone et claude.ai. Elle garde son process actif : à 6 sessions actives sur 8, les suivantes démarrent sans, et leur bouton l'active quand même.
- Couleur sur les tags (Général > Affichage, coupé par défaut) : chaque tag a sa couleur, tirée de son nom, donc la même partout, dans les fenêtres, les listes et la salle.

## 1.24.4

- Open Space ne redémarre plus tout seul après avoir téléchargé une mise à jour, ce qui coupait les sessions en cours : elle s'installe quand tu redémarres depuis les réglages ou quand tu quittes l'app.

## 1.24.3

- Navigateur des sessions, grâce à JB : le point, l'apostrophe, les parenthèses, `&`, `%`, `$` et `#` se tapent enfin (le point effaçait le caractère suivant, les autres faisaient bouger le curseur).
- La vue du navigateur montre chaque image dès qu'elle arrive : elle ne reste plus sur l'étape d'avant quand la page ne bouge plus (connexion Google par exemple).

## 1.24.2

- Le tag automatique d'une nouvelle session n'affiche plus de bout de phrase comme « je n » quand Haiku répond une phrase au lieu d'un tag : la session reste sans tag.

## 1.24.1

- Les demandes d'un agent (clé, question, autorisation) s'affichent en bas de la conversation, juste au-dessus du champ, comme dans Claude Code. En petite fenêtre, les boutons de la demande de clé restent visibles.
- Un clic sur une image jointe dans le champ de message l'ouvre en grand.
- La copie à la sélection ne marche plus que dans les conversations et le champ de message, plus dans le reste de l'app.
- La pastille « nouveau message » et la barre des questions ne laissent plus voir le texte qui défile dessous.

## 1.24.0

- Clés sans fuite : `/secret` (ou « Clés » dans le menu ⋯) ouvre une box où tu colles le nom et la valeur d'une clé. Un bloc `NOM=valeur` de plusieurs lignes remplit tout d'un coup. L'agent ne voit jamais la valeur, seulement le nom.
- Quand un agent a besoin d'une clé, il la demande lui-même et la box s'ouvre comme une question. Il peut ensuite l'écrire dans un `.env`, lancer une commande avec (la valeur est masquée dans ce qu'elle affiche) ou la poser en cookie dans son navigateur pour un token de session.
- Les clés restent en mémoire seulement : 12 h au plus, effacées quand la session s'éteint ou qu'Open Space s'arrête, jamais écrites dans le journal.

## 1.23.0

- Navigateur partagé, grâce à JB : un onglet « Partagé » dans le navigateur de chaque session ouvre un Chrome commun où tu te connectes une fois à tes propres comptes (Google Tag Manager, Analytics…). La connexion tient après un redémarrage, et toutes les sessions et leurs testeurs s'en servent sans te redemander mot de passe ni 2FA.
- Chaque session n'y voit que ses onglets. Quand elle s'arrête, ses onglets se ferment et ce qu'elle a laissé sur les autres sites que Google est effacé.
- Les agents ne s'en servent que pour tes comptes, en lecture : jamais pour tester une app ni pour publier ou modifier quoi que ce soit sans ta demande. Les sessions d'un dossier non approuvé ne l'ont pas.

## 1.22.4

- Les photos que le navigateur ne sait pas afficher (RAW .dng, HEIC d'iPhone, SVG, TIFF…) se joignent maintenant comme fichiers au lieu d'afficher « Impossible de joindre ».

## 1.22.3

- Dans un lanceur étroit, le bouton Lancer n'est plus qu'une flèche ronde : tout tient sur une ligne.

## 1.22.2

- Clic droit sur une image dans l'app : « Enregistrer l'image sous… » et « Copier l'image ». La visionneuse a aussi un bouton Télécharger pour les images et les vidéos.
- Dans le lanceur, le modèle et l'effort passent dans une icône de réglages, entre la personne et le dossier.

## 1.22.1

- Avec beaucoup de dossiers, la barre du haut ne passe plus à la ligne sur grand écran : la pastille des projets rétrécit et défile, puis le titre de la musique, et les outils restent en place.

## 1.22.0

- Tes messages s'affichent comme ceux des agents : Markdown (gras, italique, code, listes), liens cliquables et sessions nommées par « @ » en couleur. Les « @ » sont aussi en couleur dans les messages des agents.
- Entrée lance l'action des confirmations (éteindre, mettre au repos, supprimer, abandonner une branche, se déconnecter, redémarrer, faire confiance au dossier) au lieu d'Annuler. Échap annule toujours.
- Échap ferme la visionneuse même après un clic dans une page ouverte, qui gardait la touche pour elle.

## 1.21.0

- Le bouton Agents n'affiche plus que le robot, avec plus d'air avant la pastille verte.
- Petit écran : la fenêtre ouverte prend toute la hauteur même avec plusieurs sessions ouvertes, au lieu de la moitié ou du tiers.
- Petit écran : l'en-tête se range en deux lignes nettes, les salles et les outils en haut, la radio dessous. Le détail de l'usage reste dans l'écran et la page ne défile plus de côté.
- L'état d'une session réduit à sa pastille reste à côté de son nom.
- Mode Focus : la croix du lanceur passe dans le coin de la fenêtre, ronde comme celle des sessions, et « Maj N » ne se coupe plus en deux.

## 1.20.0

- Chaque fenêtre de session a des onglets en icônes : Conversation, Fichiers, Navigateur. Le nom ne s'affiche que sur l'onglet ouvert, et chaque fenêtre garde son onglet quand tu passes sur une autre.
- Fichiers : l'arborescence du dossier de la session à côté d'un éditeur (coloration, recherche ⌘F, enregistrement ⌘S). On crée, renomme et met à la corbeille fichiers et dossiers, à la souris ou au clavier (flèches, F2, Suppr). Si la session a changé le fichier pendant que tu l'éditais, un bandeau te laisse garder ta version ou prendre la sienne.
- Les images, PDF, vidéos et sons s'ouvrent en aperçu, un SVG bascule entre aperçu et code, et les autres fichiers ont un bouton « Montrer dans le Finder ». Le fil d'Ariane au-dessus du fichier ramène au dossier dans l'arbre.
- « Terminés » devient « Agents », à droite des onglets : une pastille verte compte ceux qui travaillent, la liste s'ouvre au survol, un clic ouvre le fil d'un agent.
- Le champ de message se cache dans Fichiers et Navigateur.
- Le globe à côté du contexte disparaît : c'est l'onglet Navigateur qui pulse quand l'agent y travaille. En quittant l'onglet Navigateur, la mini-fenêtre ne s'ouvre plus si le navigateur n'a aucune page.

## 1.19.3

- Un long texte collé (un log, un document) part enfin : la limite passe de 20 000 à 500 000 caractères. Au-delà, un message le dit et le texte reste dans le champ, au lieu de disparaître sans rien envoyer (merci JbPons).

## 1.19.2

- Reprendre une session : un champ de recherche, juste au-dessus de la zone d'écriture, retrouve une conversation par un mot ou une phrase (un ticket, un nom de fichier…) dans tous ses messages, avec l'extrait trouvé surligné. Un indicateur tourne pendant la recherche.
- Les noms au-dessus des agents dans la salle passent en Fredoka, plus lisible.

## 1.19.1

- Échap ferme d'abord le panneau d'une question /btw, puis une vue latérale (Navigateur, Changements, MCP, Contexte, Usage), avant d'interrompre la session.

## 1.19.0

- Dans la salle, un appui long sur un agent le soulève : il agite bras et jambes et tu peux le poser sur un fauteuil libre. Lâché sur quelqu'un d'autre, ils échangent leurs places. Les places sont gardées après un rechargement.
- Tag automatique, dans Réglages > Sessions : une nouvelle session reçoit un tag d'un ou deux mots tiré de son premier message (Haiku, moins d'un centime). Désactivé par défaut, et un tag mis à la main n'est jamais remplacé.
- On peut mentionner une session par son tag : `@paywall` vise la session taguée « paywall », et l'agent reçoit son nom pour lui écrire. L'autocomplétion montre le nom et le tag de chaque session, avec le dossier en dessous.

## 1.18.0

- Un filtre par projet dans l'en-tête, dès que des sessions travaillent dans au moins deux dossiers : un clic sur un projet ne garde que ses sessions dans la liste Focus et le panneau État, les autres restent dans la salle en gris, sans nom. Un projet où une session t'attend a son compteur en orange.
- Une nouvelle session part dans le projet sélectionné. Si tu en lances une ailleurs, le filtre passe sur son projet.
- La radio de l'en-tête n'a plus de curseur de volume, pour laisser la place à l'usage.

## 1.17.1

- Quand la limite de session est atteinte, la compaction des longues conversations au repos ne se relance plus toutes les 30 minutes et n'écrit plus « Error during compaction » dans le fil : elle reprend après le premier tour qui se termine bien.

## 1.17.0

- Open Space tourne sous Windows, grâce à Quentin : un installateur `.exe` sur la page des versions, qui se met à jour tout seul.
- Sous Windows, fermer la fenêtre garde les sessions en route : l'icône près de l'horloge la rouvre et sert à quitter. L'icône de la barre des tâches est celle de ton personnage, avec une pastille quand une session t'attend.
- Sous Windows aussi : les notifications, la radio qui pilote Spotify ou Apple Music, le choix du terminal (cmd, PowerShell ou Git Bash) dans Réglages > Général, le bouton Parcourir pour ajouter un dossier, et les notes supprimées qui vont dans la Corbeille.
- Le lanceur affiche le nom du dossier, et son chemin complet quand tu tapes dedans.
- Quand le système demande moins d'animations, la salle, le ciel et l'équipe se figent aussi, sans toucher au réglage.
- Le bouton Terminer d'une note n'est plus vide en édition : la coche et le texte se voient sur le fond violet.

## 1.16.5

- Le panneau État montre le tag de chaque session à côté de son nom.
- Chaque ligne du panneau État tient sur une seule ligne : quand les sous-agents ou les commandes en fond ne rentrent pas, ils défilent comme le titre de la musique.

## 1.16.4

- Éteindre une session qui avait ouvert un navigateur n'affiche plus l'erreur « ENOTEMPTY: directory not empty » : son profil est effacé une fois Chrome fermé, plus pendant qu'il se ferme.

## 1.16.3

- Le tag ne s'affiche plus deux fois : à côté du nom dans les petites fenêtres, en dessous dans les grandes.
- Le menu « ⋯ » d'une fenêtre n'est plus coupé par son bord : il en sort, et s'ouvre vers le haut quand il manque de place en bas.
- Quand un agent ou un testeur redimensionne sa page (une taille mobile par exemple), le navigateur l'affiche à cette taille, au lieu d'un coin de page sur fond noir. Le bouton ordinateur ou mobile suit, et un clic dessus reprend la main sur la taille.

## 1.16.2

- Plus de navigateur qui traîne à l'écran : quand une session ferme sa dernière page, son navigateur s'arrête et disparaît des vues et de la mini-fenêtre.
- Le navigateur d'un testeur se ferme dès que le testeur a fini, et pas seulement quand on le coupe.
- Les agents savent qu'ils doivent fermer leur navigateur quand ils ont fini de s'en servir.

## 1.16.1

- La mini-fenêtre ne s'ouvre plus toute seule quand une session vérifie ses propres pages, artifacts compris : seule sa pastille globe clignote. L'ouverture automatique est réservée aux testeurs.
- Nouveau réglage Sessions > Navigateur > « Mini-fenêtre automatique » pour la couper complètement.

## 1.16.0

- Navigateur intégré : chaque session a son Chrome, que pilotent ses outils Playwright. Tu le vois en direct dans sa fenêtre et tu peux cliquer et taper dedans.
- Jusqu'à quatre testeurs en parallèle, chacun avec son propre navigateur. Leurs noms permettent de passer de l'un à l'autre, et le navigateur d'un testeur coupé se ferme avec lui.
- La page s'affiche en format ordinateur (1920 × 1080) ou mobile (390 × 844), quelle que soit la taille de la fenêtre.
- Mini-fenêtre au-dessus du bureau : elle s'ouvre toute seule quand un agent va sur une page. Tu peux la déplacer, la redimensionner, la replier ou la remettre dans la fenêtre de la session. Elle se cache quand tu es dans la vue Navigateur et revient quand tu en sors.
- Tableau : recherche dans les notes (sans tenir compte des accents ni des majuscules), renommer, mettre à la corbeille, favoris, mode écriture avec ⌘E et date de dernière modification.
- Une session éteinte se reprend avec son nom, et avec tout son fil pendant 30 jours.

## 1.15.0

- Accessoires : un onglet rangé par endroit du corps (yeux, visage, cou, épaule, dos, taille, main), et on porte une pièce par endroit en même temps. L'onglet Tête y passe.
- Neuf nouvelles pièces : carapace de tortue, ailes et bouclier viking (couleur au choix), carquois, écharpe, chat sur l'épaule, lanterne. Le bâton de mage change de main pour laisser l'épaule au perroquet.
- « Ouvrir l’original » ouvre bien le fichier dans une fenêtre de l’app au lieu de le renvoyer au navigateur.

## 1.14.1

- Animal : chaque animal en tuile avec son aperçu (le choisi marche), motif du chat et race du chien en tuiles aussi, et les couleurs en haut.
- Équipe : les onglets Visage, Cheveux… Chaussures restent visibles quand on fait défiler.
- Le casque audio et la montre passent dans les accessoires, en tuiles, et se portent avec n'importe quel autre accessoire.

## 1.14.0

- Les pages publiées par une session montrent enfin leurs images dans le fil : Open Space garde une copie des images et fichiers de la page avec elle.
- « Ouvrir l’original » sur une image ou un fichier ouvre une fenêtre de l’app au lieu d’une page vide dans le navigateur.

## 1.13.2

- Dans la liste du mode focus, « Au repos » est trié comme « Prêtes » : la plus récente en haut.

## 1.13.1

- Le menu « @ » montre le visage de chaque session (grisé si elle est au repos).
- Les sessions nommées avec « @ » restent en couleur dans le message envoyé.

## 1.13.0

- Mentionner une autre session avec « @ » : le champ propose les sessions, le nom s'affiche en couleur, et la session nommée est réveillée si elle était au repos. Claude sait à qui écrire (« va demander à @PL comment elle a fait »).
- Des commandes à nous dans le champ et dans ⌘K : `/tag front` pose le tag tout de suite, `/rename`, `/focus` (bascule focus et bureau), `/rc` (contrôle à distance), `/status`, `/login`, `/logout`, `/copy` (copie la dernière réponse), `/export` (la conversation en .md), `/diff`, `/cost`, `/fork`, `/stop`, `/resume`, `/stats`, `/theme`, `/help`, `/release-notes`, `/plan` et `/review`.
- Mettre une session au repos (la lune) ferme aussi sa fenêtre de conversation.
- À propos dit aussi par quoi passe le compte Claude (Bedrock, Vertex, clé API…) quand ce n'est pas un compte claude.ai.
- Sécurité : la demande de confiance d'un dossier montre aussi les réglages du projet qui peuvent lancer du code (variables d'`env`, mode de permission…), git n'exécute plus le `core.fsmonitor` d'un repo, et une commande à autoriser ne peut plus se cacher derrière des centaines de lignes vides.

## 1.12.0

- Compte Claude dans Réglages > À propos : qui est connecté (e-mail, organisation, offre), avec Se connecter / Changer de compte (ouvre le navigateur) et Se déconnecter, sans passer par un terminal.

## 1.11.0

- Une branche par session (worktrees) : quand une autre session travaille déjà dans le dossier, le lanceur propose « Isoler sur une branche ». La session travaille sur `os/<prénom>-<sujet>`, dans son propre dossier sous `.claude/worktrees/`, avec les `.env`, `node_modules` et `Pods` copiés en clone APFS (ou ce que nomme `.worktreeinclude`).
- Une pastille de branche dans l'en-tête de la session, une petite branche en pixel art sur son étiquette dans la salle, dans le mode focus et la carte État.
- La carte « Prête à fusionner dans main » à la fin du fil : Fusionner (la session regroupe son travail en un commit et se remet à jour, Open Space vérifie et avance main), Ouvrir une PR, Plus tard, Jeter la branche. Si main a bougé, une carte le dit ; si la fusion ne passe pas, la carte dit pourquoi, avec Réessayer.
- Éteindre une session isolée avec du travail demande quoi faire de la branche : fusionner puis éteindre, la garder (le travail est commité, la branche revient si on reprend la conversation), ou tout jeter. Rien n'est jamais perdu sans le dire.
- Le panneau Branches d'un projet (pastille, ⌘K « Branches », rappel dans le lanceur) range les branches des sessions et les worktrees de Claude Code.
- Les changements `+X −Y` d'une session isolée comptent depuis le départ de sa branche, commits compris. Le terminal (⌥⌘T) s'ouvre dans son dossier.
- Réglage « Isoler les sessions » (Réglages > Sessions) : quand le dossier est déjà pris, toujours ou jamais ; « Dossier : Partagé / Isolé » dans le panneau de la session pour forcer.
- Un bouton Aléatoire dans l'éditeur de perso (Équipe) : peau, cheveux, yeux, barbe, habits, chapeaux, accessoires et tenues, tout est tiré au hasard à chaque clic.
- ⌥⌘T ouvre un terminal dans le dossier de la session active (sinon le dossier par défaut), aussi depuis ⌘K et le menu ⋯ d'une conversation (« Ouvrir un terminal ici »). Le raccourci est dans Réglages > Raccourcis.

## 1.10.1

- Les liens des pages publiées sur claude.ai par une conversation : une pastille « N liens » sous son nom, qui ouvre leur liste ; un clic ouvre la page.
- Mise à jour d'Open Space : bouton « Chercher une mise à jour » dans À propos, barre de téléchargement, puis Redémarrer, avec un avertissement si des sessions travaillent. L'app redémarre aussi toute seule sur la nouvelle version dès qu'aucune session ne travaille.
- Les boutons de mise à jour (Open Space et Claude Code) tournent pendant qu'ils cherchent et disent eux-mêmes « À jour », plus de texte sous la ligne.
- Le champ du dossier d'une nouvelle conversation n'a plus de double contour.

## 1.10.0

- Thèmes du bureau (Réglages > Bureau) : Navette spatiale, Tokyo néon, Donjon, Plage, Bateau pirate et Cabane en forêt. Murs, sol, porte, fenêtres, ciel, lumières et tous les meubles changent, au bureau comme au salon ; les fêtes s'y posent toujours.
- Ce qui bouge et brille dans un thème (flammes, néons, hologrammes) passe derrière les gens et les meubles devant.
- 71 nouveaux habits dans l'équipe : coiffures, yeux, hauts, bas, chaussures, chapeaux et accessoires (jetpack, perroquet sur l'épaule, katana, guitare…).
- 18 nouveaux animaux : renard, panda roux, lapin, hérisson, hibou, perroquet, pingouin, tortue, crabe, poulpe, luciole, chat fantôme, maneki-neko, chien robot, alien, dragon, slime et golem.

## 1.9.2

- Un clic sur une session l'ouvre à côté des autres, sans Maj ; au-delà de six fenêtres, elle prend la place de la fenêtre active.
- Le bouton Équipe revient dans l'en-tête, à côté de l'usage.
- L'astuce ⌥ en bas de la salle passe en verre foncé, comme le reste.

## 1.9.1

- Mise à jour d'Open Space dans les réglages : l'app vérifie toutes les heures, télécharge en fond, puis une pastille rouge sur la roue et un bouton Redémarrer pour l'installer.
- « À l'instant » au lieu des secondes pendant la première minute, et les durées bougent moins souvent.
- Mode focus replié : survoler une tête montre son nom, son tag, son état et son dernier message.
- Les têtes de la liste ont les mêmes pictos d'état que la salle, avec les points qui bougent.
- Bureau / Salon / Focus gardent la même largeur d'une vue à l'autre, et l'ombre de la salle ne traîne plus en passant en focus.
- Les réglages s'ouvrent toujours sur Général.

## 1.9.0

- Recherche partout (⌘K) : sessions, messages, commandes et réglages dans une seule fenêtre, centrée, qui ne bouge pas pendant qu'on tape.
- Réglages refaits en rubriques, avec leur propre recherche. Nouvelle rubrique Claude Code : les réglages du /config (réflexion, style de sortie, langue, compactage auto, workflows…) pour les sessions d'Open Space, avec leur nom dans /config pour s'y retrouver.
- Usage et coûts : le temps passé, les sessions et ce que ça aurait coûté, par jour, par projet et par modèle.
- Mise à jour de Claude Code depuis les réglages : une pastille rouge sur la roue quand une nouvelle version est installée, et un bouton pour relancer les sessions dessus.
- Compactage au repos (réglable, désactivé par défaut) : une longue conversation restée sans message est compactée toute seule. Une icône de compactage s'affiche partout pendant un compactage, manuel ou automatique.
- Dupliquer une session (menu ⋯) : une copie repart de la conversation sous un autre nom, l'originale continue de son côté.
- Copie à la sélection, dans les conversations et dans les champs.
- Une session qui a une commande en fond reste « au travail », son processus est gardé pour les /loop et les crons, et Repos ou Éteindre préviennent de ce qui s'arrête.
- Fenêtre Équipe refaite : la liste à gauche avec « Ajouter » toujours visible, chaque choix (coiffure, haut, chaussures…) montré sur un mannequin en pointillés, un clic sur le perso ouvre sa partie, le métier dans un menu à cocher.
- En-tête allégé : Grille / Libre dans sa bulle, un vrai champ Rechercher, son, notifications et équipe rangés dans les réglages.
- Réglages : format de l'heure, réduire les animations, heure des messages, durée des tours, effort par défaut.

## 1.8.0

- Open Space devient une vraie app Mac (Electron) : `npm run app` construit un `.dmg` Apple Silicon et Intel. Le serveur tourne dans l'app, plus besoin de terminal ni d'onglet ; fermer la fenêtre laisse tourner les sessions, quitter l'app les arrête.
- Notifications natives à son nom (un clic ouvre la session), ton perso en icône du Dock et le nombre de sessions qui t'attendent en pastille.
- Si `npm start` tourne déjà, l'app s'ouvre dessus au lieu d'en lancer un second.
- `npm run app:release` : app signée Developer ID et notarisée par Apple, qui s'ouvre sans avertissement sur n'importe quel Mac ; `app:publish` la met sur une release GitHub, d'où les apps installées se mettent à jour seules.

## 1.7.0

- La salle se déplace (⌥ + glisser) et se zoome (⌥ + molette ou pincement), sans sortir de la page ; ⌥ + double-clic la remet à sa place. Une astuce en bas de page le dit, jusqu'au premier usage.
- Les fenêtres se prennent par leur barre de titre (ou n'importe où avec ⌥) : en grille, on les réordonne, on les change de colonne, on en met une seule dans sa colonne en la lâchant près du bord d'une colonne ; dans la salle comme en mode focus.
- Les gouttières entre colonnes et entre fenêtres se tirent pour redimensionner, le bord de la pile aussi ; double-clic pour répartir. Une colonne partage toute sa hauteur entre ses fenêtres.
- Mode libre (bascule Grille / Libre dans l'en-tête) : on place et redimensionne chaque fenêtre où on veut, avec des aimants (⌘ pour les couper) ; contre un bord elle prend la moitié de l'écran, dans un coin le quart, en haut tout l'écran. Repasser en Grille range tout.
- Mode focus : la liste des sessions se replie aux seules têtes, et les conversations prennent la place ; « Nouvelle session » passe en bas.
- Tailles, positions et cadrage de la salle restent d'une visite à l'autre.

## 1.6.0

- L'en-tête d'une conversation ne garde qu'agrandir, pause (quand elle travaille), « ⋯ » et fermer : chercher (⌘F), activer Remote Control, repos et éteindre passent dans le menu « ⋯ ». Remote Control allumé reste visible avec son état.
- Sous-agents dans la mosaïque : les onglets restent en fenêtre pleine ou demi-hauteur ; en tiers de hauteur, une pastille flèche + tête dans l'en-tête montre qu'on est dans un sous-agent et ramène à la conversation.
- Les sessions « Prêtes » (carte État et liste du mode focus) sont rangées de la plus récente à la plus ancienne.
- README à jour (EN et FR) : fonctions rangées en quatre parties, nouvelles captures (salle, mode focus, Noël).

## 1.5.4

- Un seul panneau pour le modèle, l'effort, les permissions et ultracode, dans une conversation (tout change tout de suite, même les permissions) et dans Nouvelle session, qui tient de nouveau sur une ligne.
- Ultracode se coche par session (un éclair sur le bouton quand il est actif) ; il n'est proposé que si les workflows dynamiques sont activés dans Claude Code.
- Le curseur d'effort chauffe en montant (couleur et lueur), et le max pulse et scintille.
- Dans la salle, un clic sur un agent compte jusqu'en haut de son chapeau, et l'agent devant l'animal prend le clic.

## 1.5.3

- Un sous-agent relancé par un message (SendMessage) revient dans la salle avec son type et sa tâche, même s'il avait été lancé par un process précédent de la conversation, et son rapport arrive à sa place.
- Une conversation qui change de taille (mode focus, autre disposition des fenêtres) reste collée en bas si elle y était, et réordonner les fenêtres ne remet plus leur fil en haut.

## 1.5.2

- Une fenêtre agrandie se remet à sa place quand on clique une autre session dans la liste ou la carte État, même quand les six places sont prises : la session cliquée prend la main, sans être agrandie.

## 1.5.1

- Mode focus : un clic sur une session déjà ouverte dans la liste va sur sa fenêtre au lieu de la fermer ; on la ferme avec sa croix.

## 1.5.0

- Mode focus, pour bosser en public sans le pixel art : l'icône après le trait de l'en-tête (ou ⌘ . / Ctrl .) remplace la salle par la liste de toutes les sessions, rangées en À voir, Au travail, Prêtes (lues, en attente d'un message) et Au repos (arrêtées). Chacune avec la tête de son perso, son état en signe sur la tête, son prénom, son tag, ses derniers mots et depuis quand (« il y a 10 min » pour celles qui attendent). Chaque groupe se replie. Le ciel reste, à l'heure, sans personne.
- En mode focus, un clic sur une session l'ouvre à côté des autres. La dernière ouverte arrive en haut à gauche et les autres glissent : trois colonnes, puis la première se coupe en deux, puis la deuxième, puis la troisième (six au plus). Nouvelle session (N) ne ferme rien : le lanceur s'ouvre comme une fenêtre de plus, Échap le ferme. Rien d'ouvert : le lanceur au milieu. Le champ de message reste sous une question ou une autorisation en attente.
- La carte État a un groupe « Prêtes », et chacun de ses groupes se replie d'un clic sur son titre.

## 1.4.0

- Maj+clic sur un agent (dans la salle ou la liste d'état) ouvre sa conversation avec celles déjà ouvertes : trois l'une au-dessus de l'autre, puis une nouvelle colonne vers la gauche, sans jamais couvrir la carte d'état ; les colonnes rétrécissent pour tenir (6 au plus, pour que la salle reste visible). Dans ces petites fenêtres, les outils passent en icônes à gauche d'un champ d'une ligne (commandes, modèle et effort, pièce jointe), sans onglets de sous-agents. Remote Control remonte dans l'en-tête, à droite de la loupe. Chaque fenêtre fait un tiers de la hauteur dès la deuxième colonne. Tab, hors d'un champ, les fait glisser hors de vue pour voir et cliquer la salle, Tab les ramène ; Maj+Tab garde la navigation au clavier. Un clic dans le vide ne ferme rien quand plusieurs sont ouvertes. Chaque fenêtre garde sa place : en fermer une ne fait remonter que celles du dessous, et rien n'est rechargé. Un clic sur un agent le montre à la place de la fenêtre active, un clic dans le vide ne ferme rien. Le bouton Agrandir (ou un double-clic sur l'en-tête) en montre une seule, Échap revient. Une fenêtre ouverte mais pas active qui finit sonne et reste « à voir ». La disposition revient au rechargement de la page.
- La mini-fenêtre (la salle au-dessus des autres apps) est retirée.
- La pastille du nombre de choses à voir, en haut à gauche, disparaît : la carte État le montre déjà.
- Le bouton Commandes du champ n'est plus que son icône, et la ligne du dossier et du modèle sous le nom disparaît.
- Le modèle et l'effort d'une session se changent sous son champ, à côté de « Commandes », et s'appliquent tout de suite. `/model` et `/effort` tapés dans le champ font pareil, et la session les garde quand elle repart.
- Les commandes du champ sont celles du dossier de la session (ses commandes et skills à lui compris), connues dès son ouverture, avant le premier message. Les sous-commandes d'un skill sont proposées après son nom (`/impeccable polish`), et un skill de plugin se tape par son nom court.
- Un « / » tapé au milieu d'une phrase propose aussi les commandes, et les complète à cet endroit.

## 1.3.0

- Nouveau look : la salle flotte sur un socle de pierre, dans un ciel pixel art qui suit l'heure (nuages qui dérivent, étoiles, lune, neige à Noël, feux d'artifice au Nouvel An et au 14 juillet). Les panneaux sont en verre foncé, les pastilles ont toutes la même hauteur, les murs ont de l'épaisseur et les prénoms sont des pastilles. Le soleil ne passe plus par la fenêtre cachée derrière le tableau.
- Sur mobile : la salle, la liste d'état, puis un champ compact flottant en bas, rien collé aux bords.
- Le verre ne clignote plus : son flou est une image du ciel et de la salle calculée par la page, plus le flou en direct du navigateur.
- Sur Mac, la radio pilote aussi Musique ou Spotify : un clic sur son libellé choisit la source, la pastille montre la pochette et le morceau, avec lecture, précédent, suivant et volume ; pour Musique, tes playlists et une recherche dans ta bibliothèque. Un titre trop long défile.
- Une session dont les sous-agents travaillent en arrière-plan est au travail : son perso tape au clavier.
- Quand le contexte se remplit, le champ propose de compacter, avec ce que le résumé doit garder pour continuer ; on peut masquer ce rappel.
- Les étiquettes au-dessus des têtes ne se cachent plus entre elles : celle de derrière monte.
- Tenues de Naruto, Zoro, Luffy, Sanji et Kakashi dans l'éditeur d'équipe, pièce par pièce, et une mèche sur l'œil.

## 1.2.2

- Le mode shell ressemble à celui de Claude Code : « ! » tapé en premier devient un « ! » rose devant la commande, et Retour arrière au tout début le retire d'un coup.
- Les fichiers texte qu'une session envoie (Markdown, txt, json, csv…) s'ouvrent en grand dans la visionneuse, le Markdown mis en forme avec ses blocs de code copiables.

## 1.2.1

- Échap arrête aussi les commandes `!` de la session ouverte qui tournent encore, en plus d'interrompre son tour.

## 1.2.0

- Un tableau blanc sur roulettes remplace l'imprimante et la baie serveur ; la fontaine à eau rejoint la machine à café. Au survol il s'entoure de blanc (caché derrière ceux qui passent devant), et un clic ouvre tes notes sur le même tableau, en pixel art (cadre alu, feutres et brosse, titres écrits au marqueur) : un onglet par fichier `.md` du dossier des notes (`~/Journal` par défaut, à changer dans les Réglages), affiché en Markdown, modifiable et enregistré tout seul. Ce qu'une session y écrit pendant ce temps n'est jamais écrasé : la note se recharge avec un mot pour le dire. Le tableau change avec les fêtes (« HBD » et le prénom avec des ballons à un anniversaire, citrouille, sapin, lanternes, gouttes, drapeau…).
- Le tableau dit à quoi il sert : un « i » en haut à droite, et sa page vide, expliquent qu'il montre les fichiers `.md` du dossier des notes et comment tes sessions peuvent y écrire (une ligne dans ton `CLAUDE.md` suffit).
- Un objet « Chiffres », facultatif : donne dans les Réglages un fichier Markdown que tes scripts ou une session Claude mettent à jour (chiffres, stats, suivi), et une pile de billets devant un carnet à courbe montante apparaît sur ton bureau. Un clic affiche le fichier en lecture seule, tableaux alignés ; un « ! » rouge flotte au-dessus quand il a changé depuis la dernière fois que tu l'as ouvert (retenu par le serveur, d'un navigateur à l'autre). Sans fichier, rien ne change dans la salle.
- `/mcp` ouvre la liste des serveurs MCP de la session, avec leur état : connecté, en connexion, en échec avec son erreur, connexion requise ou désactivé. On peut reconnecter un serveur, se connecter (la page s'ouvre dans le navigateur), l'activer ou le désactiver pour le dossier.
- `/context` montre ce qui remplit la fenêtre de contexte, à l'échelle, avec les outils chargés à la demande et les fichiers de mémoire. `/usage` montre les limites du forfait et quand elles repartent à zéro, ce que coûte la session et ce qui a pesé ces 7 jours.
- Pendant qu'une session travaille, la fin du fil dit depuis combien de temps et ce qu'elle fait (« Mijote… 12 s · réfléchit », ou l'outil en cours), et chaque tour finit par sa durée et son heure (« Mijoté pendant 10 s · fini à 22:53 »), comme dans Claude Code.
- Le fil ne suit plus une réponse pendant qu'elle s'écrit : elle grandit sans bouger la page, pour être lue à ton rythme. Il suit de nouveau quand tu redescends ou que tu envoies un message.
- Remonté dans le fil, une pastille « 2 nouveaux messages » montre ce qui est arrivé depuis et ramène en bas ; envoyer un message y ramène aussi.
- Les sessions peuvent t'envoyer des fichiers (l'outil SendUserFile de Claude Code, comme dans l'app mobile) : une image ou un schéma SVG s'affiche dans le fil, une page HTML en aperçu qu'on ouvre en grand (sauf si Claude l'envoie comme simple pièce jointe), les autres fichiers se téléchargent sous leur nom. Open Space en garde une copie, même si l'original change.
- Un clic sur une image du fil, la tienne ou celle d'une session, l'ouvre en grand ; Échap, la croix ou un clic à côté la referment.
- Une page qu'une session publie sur claude.ai (un artifact) s'affiche dans le fil en aperçu ; un clic l'ouvre en grand, l'icône l'ouvre sur claude.ai dans un nouvel onglet. claude.ai refuse d'être affiché ailleurs : Open Space montre sa propre copie de la page, isolée (elle n'a accès ni à Open Space ni à ton cookie).
- Les nouvelles sessions savent qu'Open Space affiche leurs images et leurs pages : elles envoient une capture quand elles changent quelque chose de visible et peuvent la prendre.
- `!commande` dans le champ d'une session la lance tout de suite dans son dossier, sans Claude, comme le mode bash du terminal : la sortie s'affiche dans le fil, et Claude la voit avec ton prochain message. Un bouton l'arrête tant qu'elle tourne.
- Ce que tu tapes dans le champ d'une session est gardé quand tu passes à une autre et que tu reviens ; une session éteinte emporte son brouillon.
- Le remplissage du contexte de chaque session s'affiche dans son en-tête (« Contexte 34 % »), mis à jour à chaque réponse. Il passe à l'orange quand le contexte se remplit (la moitié de la fenêtre, ou 300 k jetons) et au rouge avec un « ! » aux trois quarts ; un clic ouvre `/context`, qui conseille alors de compacter, de vider si la tâche change ou de passer à une autre session, avec les boutons pour le faire. Les sessions déjà ouvertes l'affichent dès le démarrage, lu dans leur conversation sur le disque.
- `/clear` marche : Open Space suit la nouvelle conversation que Claude Code démarre (et la reprend après une mise en veille). Le fil dit « Nouvelle conversation », et « Conversation compactée : 51 k → 6 k jetons » après `/compact` ou un compactage automatique.
- Plus de « Tour terminé · 0 s » au milieu d'une réponse : les tours vides que Claude Code envoie parfois (au réveil d'une session, après le rapport d'un sous-agent) ne sont plus annoncés ni notifiés.
- Une session qui attend reste « en attente » pendant qu'un sous-agent travaille en arrière-plan, au lieu de passer « au travail » : tes messages partent tout de suite au lieu d'attendre dans la file. « Envoyer maintenant » envoie la file même quand il n'y a aucun tour à interrompre.
- Le rapport d'un sous-agent lancé en arrière-plan n'apparaît plus dans la conversation comme un message d'une autre session : il reste dans l'onglet de l'agent (les anciens fils sont nettoyés aussi).
- Les images et fichiers gardés pour une session oubliée sont supprimés, au démarrage et quand tu l'oublies.
- Un clic dans le noir autour de la salle ferme la session ouverte, comme la croix du panneau.
- On peut joindre n'importe quel fichier à un message (zip, PDF, CSV…, 200 Mo au plus), pas seulement des images. Comme dans le terminal, Claude reçoit son chemin et l'ouvre avec ses outils : Open Space le garde dans son dossier `uploads/`, que chaque session peut lire.
- Les messages qu'un sous-agent envoie en cours de route (« Done: … Left: … ») sont repliés dans la conversation, à son nom, au lieu d'apparaître comme le message d'une autre session. Son rapport se déplie sous sa carte.
- Une vidéo qu'une session t'envoie (mp4, webm, mov) s'affiche dans le fil avec sa première image ; un clic la lit en grand, avec les contrôles du navigateur, et un bouton la télécharge. Les fichiers envoyés sont gardés jusqu'à 200 Mo (25 Mo avant).
- Un message envoyé pendant qu'une session travaille lui arrive tout de suite, sans l'interrompre : Claude le lit à sa prochaine étape, te répond, et continue en général sa tâche. Seules les commandes `/` attendent la fin du tour.
- La checklist en bas à gauche devient un panneau « État » : ce qui t'attend (questions, autorisations, tours à lire, erreurs) avec depuis quand, puis qui est au travail, depuis combien de temps et avec combien de sous-agents. Son titre le replie à ses deux compteurs.
- Sur claude.ai et dans l'app Claude, une session en Remote Control s'appelle « tag - prénom » (« Site vitrine - Margot »), ou « dossier - prénom » sans tag, au lieu du seul prénom.
- Un nouvel animal : Clawd, la mascotte de Claude Code, en pixel art orange. Il fait coucou d'un bras, dort à plat ventre et parle comme Claude (« Tu as tout à fait raison ! », « ✻ Mijote… »).
- Remote Control survit à un redémarrage du serveur : la session se rallume et retrouve la même conversation sur ton téléphone. Couper, éteindre ou mettre au repos la session y met fin pour de bon.
- Le bouton Remote Control passe dans la barre du champ, à côté de « Commandes » : un téléphone avec un point gris (coupé) ou vert (connecté).
- Le README est en anglais, la version française passe dans `README.fr.md`.
- `/effort`, `/model`, `/advisor` et `/output-style` proposent leurs valeurs dans le champ, avec ce que fait chacune. Les commandes qui ne font rien ici sont masquées, et le nom tapé en entier passe avant les plugins qui le mentionnent.

## 1.1.1

- L'écran de chaque session assise à son bureau reste allumé, qu'elle travaille ou non. Sa main et sa bulle disent déjà si elle travaille.

## 1.1.0

- Open Space parle anglais. La langue se choisit au premier lancement et dans les Réglages ; au départ, c'est celle du navigateur. Les messages du serveur et les consignes données aux nouveaux agents suivent la langue choisie.
- Remote Control : un bouton dans l'en-tête d'une session la rend joignable depuis claude.ai/code et l'app Claude. Elle reste allumée tant qu'il est actif, même sans rien faire.
- Ce qu'une session a changé : un compteur `+X −Y` dans son en-tête ouvre la liste des fichiers qu'elle et ses sous-agents ont écrits, avec leur diff par rapport au dernier commit.
- Vie au bureau : les membres de l'équipe sans session passent de temps en temps. Ils prennent un café (parfois à deux), un verre à la fontaine, passent à l'imprimante, regardent par la fenêtre, lisent, s'assoient sur le canapé ou vont à la table de fête. Il y a plus de monde le matin et à midi, presque personne le soir, personne la nuit. Un clic sur l'un d'eux lance une session avec lui. Ça se coupe dans les Réglages.
- Un clic sur l'écran de ton bureau ouvre un terminal (iTerm s'il est installé, sinon Terminal) dans ton dossier par défaut. La porte et l'écran s'entourent de blanc au survol, avec une étiquette qui dit ce que fait le clic.
- « C'est moi » dans l'Équipe fait d'un membre ton perso ; au premier lancement, tu peux te choisir dans une équipe déjà importée.
- Seuls les sous-agents au travail ont un onglet ; les autres passent dans le menu « Terminés », avec leur tête et leur statut. Leurs têtes dans la salle sont de nouveau bien visibles.

## 1.0.2

- Le choix du dossier dans le lanceur s'ouvre au-dessus du champ, assez large pour lire les chemins. Sous Safari, la liste du navigateur était trop étroite et sortait de la fenêtre.
- Un dossier tapé avec `~` (`~/Projects/truc`) est accepté.

## 1.0.1

- Les sessions se parlent : chacune est lancée sous son prénom (`claude --name`), les autres la trouvent par lui. Un message reçu d'une autre session s'affiche dans le fil, avec la tête de l'expéditeur.
- Un métier par membre de l'équipe (Tech, Cyber, DevOps, Produit, Design, Data, Marketing, RH). Une session lancée sans personne choisie va à quelqu'un de libre dont le métier colle à la demande.
- Un sélecteur dans le lanceur pour choisir qui s'en occupe, avec qui est déjà au bureau ou au repos.
- Équipe, Animal et Réglages s'enregistrent tout seuls, sans bouton.
- Le nombre de sessions de chaque pièce à côté de son icône. Les noms dans la salle sont discrets tant que la souris n'est pas dessus.
- Les lumières du serveur ne passent plus devant les persos.

## 1.0.0

Première version publique d'Open Space.

- Plusieurs sessions Claude Code en même temps, chacune un perso dans un bureau en pixel art, avec une salle de repos pour celles en pause.
- Autorisations et questions dans la page, file des messages envoyés pendant un tour, `/btw` pour une question à côté, réponses écrites en direct, sous-agents suivis un par un.
- Images collées ou glissées, recherche dans le fil, copie des blocs de code, son et notifications macOS.
- Premier lancement guidé : ton perso, tes dossiers, tes habitudes. Réglages et équipe modifiables ensuite.
- Persos à composer (coiffures, barbes, vêtements, chapeaux, peaux), un animal au choix, 14 fêtes et les anniversaires de l'équipe.
- App du Dock pour macOS, mini-fenêtre au-dessus des autres apps.
- Serveur limité à la machine, dossiers autorisés choisis par toi, accord demandé avant de lancer un dossier qui exécute du code.

Open Space est parti de [bureau-des-agents](https://github.com/devlikemasta/bureau-des-agents) v0.1.0 (MIT).
