# Windows : contrôler Spotify et Apple Music via les sessions multimédias

## Problème

La télécommande de la radio dépendait d’AppleScript et n’offrait aucun lecteur sous Windows. La radio web fonctionnait déjà et reste inchangée.

## Changements et périmètre

- Détecter les installations Spotify classiques, les packages AppX Spotify/Apple Music et les lecteurs ayant une session multimédia Windows.
- Lire état, titre, artiste, album, durée/position et capacités via GlobalSystemMediaTransportControlsSessionManager.
- Piloter seulement la session de l’application sélectionnée : lecture/pause, précédent et suivant. Ne pas injecter de touches multimédias globales.
- Ajouter des capacités facultatives à NowPlaying pour désactiver les commandes non proposées et masquer volume/bibliothèque Windows.
- Réutiliser un worker PowerShell caché : initialisation WinRT unique, requêtes JSON par stdin/stdout, lectures concurrentes de la même application regroupées, commandes sérialisées sans rejeu automatique. File limitée à huit requêtes en attente, timeout de 12 s par requête active, fermeture après 30 s sans requête et à la sortie du serveur ; redémarrage paresseux après échec.
- Rafraîchir l’état toutes les 500 ms sous Windows, toujours sans polling si la page est masquée. Le délai macOS reste à 2 s. Le premier appel reste un démarrage à froid.
- Adapter les messages FR/EN quand le lecteur doit être ouvert ou que Windows refuse la commande.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `server/index.ts`
- `server/music.ts`
- `server/media-worker.ts`
- `server/media-worker.test.ts`
- `server/windows-music.test.ts`
- `server/windows-music.ts`
- `server/windows.ts`
- `shared/music.ts`
- `src/command/Radio.tsx`
- `src/i18n/en/common.ts`
- `src/i18n/fr/common.ts`
- `src/lib/platform.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`node --test server/media-worker.test.ts server/windows-music.test.ts` avec `OPEN_SPACE_TEST_WINDOWS_MEDIA=1` : **6 tests réussis, 0 échec**. Couverture : réutilisation du processus, ordre des commandes, Unicode/JSON, refus de commande, crash, timeout, file bornée, absence de rejeu, redémarrage après inactivité, capabilities et lectures SMTC natives. Sans cette variable, le test natif est ignoré (les cinq autres restent exécutés).

Mesure locale en lecture seule : cinq cycles liste des sessions + état Spotify, sans session média active, environ **334 ms au premier cycle puis 1 ms par cycle**. Ce microbenchmark ne mesure ni le rendu navigateur ni le délai propre à Spotify/Apple Music pendant la lecture. Aucun lecteur personnel n’a été commandé pour ce correctif.

`npm test` sur cette branche : **540 réussites, 25 échecs, 1 test natif ignoré**, 566 tests au total. Comparaison avec le même environnement Windows/Git 2.53 sur la base amont `abae1fd` : **535 réussites et les mêmes 25 échecs**, 560 tests au total. Aucun nouvel emplacement de test en échec. Les échecs concernent les chemins Windows, les fixtures CRLF et les commandes Unix/arrêts de processus, pris en charge par le socle #2 ; cette PR isolée ne doit donc pas être présentée comme passant toute la suite Windows. Rejouer la suite après intégration du socle.

## Observations natives antérieures

Les API Windows ont été réellement appelées : détection de Spotify, lecture du titre et commandes pause/reprise sur un lecteur temporaire muet et isolé. Le test n’a commandé aucun lecteur personnel.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/windows-media-control` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Sur Windows 10 1809+ ou Windows 11, ouvrir Spotify et lancer un morceau ; sélectionner cette source dans la radio et tester lecture/pause/précédent/suivant.
- Répéter avec Apple Music si installé. Lancer deux lecteurs et vérifier qu’une commande ne touche que la source choisie.
- Fermer le lecteur, supprimer sa session, refuser une commande et vérifier les états sans plantage de l’app.
- Mesurer les commandes et changements externes dans Spotify/Apple Music : le démarrage à froid peut rester visible, mais les requêtes suivantes doivent réutiliser le même PowerShell. Vérifier les changements externes dans l’UI au prochain rafraîchissement de 500 ms, sous réserve de la propagation SMTC du lecteur.
- Ouvrir plusieurs onglets, cliquer rapidement suivant/lecture/précédent, puis tuer seulement le worker média de test : vérifier l’ordre, l’absence de rejeu et la reprise au prochain appel. Fermer les onglets et vérifier sa sortie après 30 s ; tester aussi la sortie du serveur.
- Contrôler que radio web, AppleScript macOS et anciens messages NowPlaying sans capabilities continuent de fonctionner.

## Limites et problèmes non résolus

- Volume, playlists et recherche de bibliothèque ne sont pas exposés par l’API SMTC utilisée : aucune autre intégration n’a été ajoutée pour eux.
- Les pochettes ont été essayées mais leur chargement a bloqué dans le test natif ; ce code a été retiré. artwork reste null sous Windows.
- Le lecteur doit publier une session : ouvrir un morceau dans l’application avant de le piloter. Les installations atypiques peuvent ne pas être détectées.
- Spotify a été détecté sur la machine, mais la validation réelle lecture/pause/métadonnées a utilisé un lecteur Windows muet temporaire ; Apple Music n’a pas été validé sur une installation réelle.
- Le coût PowerShell par interrogation et le polling de 2 s ont été corrigés. Restent le démarrage à froid, la propagation des changements par le lecteur, et l’attente possible pendant la détection des packages AppX. Aucun benchmark UI avec Spotify/Apple Music réellement en lecture ou charge multi-onglets n’a été fait sur cette révision. Un timeout/crash abandonne les commandes en attente sans les rejouer ; le prochain appel peut recréer le worker.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Vérifier les versions Windows/WinRT, les limites de file et la gestion des erreurs/timeout. Préserver le regroupement des lectures et la sérialisation des commandes sans rejeu. Vérifier que la fermeture du worker et son stdin ne laissent pas de processus orphelin.
- Conserver le script du worker statique et ses données en JSON (app/action validées), sans interpolation de code. La découverte AppX conserve windowsScript et ses arguments en environnement. Ne pas ajouter d’appel réseau sortant du serveur ni élargir le contrôle à tous les lecteurs.
- Le helper windowsScript est identique aux PRs corbeille et navigateur. Conserver la compatibilité de capabilities facultatif pour le client macOS.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
