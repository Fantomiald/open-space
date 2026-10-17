# Versions

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
