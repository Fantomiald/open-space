# Versions

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
