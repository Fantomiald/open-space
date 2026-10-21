# Versions

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
