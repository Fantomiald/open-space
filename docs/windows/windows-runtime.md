# Windows : exécution, installation NSIS et CI

## Problème

Le projet était livré et exécuté principalement sur macOS. Les scripts de build utilisaient rm -rf, le lancement du CLI et les signaux de processus supposaient Unix, et aucun installateur Windows n’était configuré.

## Changements et périmètre

- Ajouter NSIS x64/ARM64, un nettoyage de build en Node et une matrice CI Linux/macOS/Windows avec artifacts Windows.
- Reconnaître claude.exe et les shims npm claude.cmd ; lancer le JavaScript du shim directement par Node pour ne pas interpréter les arguments via cmd.
- Conserver les variables Windows nécessaires et terminer les arbres de processus avec taskkill. Arrêter proprement le serveur Electron par IPC shutdown, y compris avant une mise à jour.
- Détecter Chrome/Edge/Brave sous Windows, adapter le lancement du MCP Playwright et laisser Ctrl+V suivre l’événement de collage.
- Masquer le menu natif sous Windows et conserver le comportement macOS. Adapter les fixtures aux chemins natifs et aux fins de ligne de Git.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Elle fournit le socle de livraison pour les autres fonctionnalités Windows, chacune proposée séparément.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `.github/workflows/ci.yml`
- `desktop/main.ts`
- `electron-builder.yml`
- `package.json`
- `scripts/clean-app.mjs`
- `server/app-port.ts`
- `server/browser.test.ts`
- `server/browser.ts`
- `server/changes.test.ts`
- `server/claude-process.test.ts`
- `server/claude-process.ts`
- `server/config.test.ts`
- `server/environment.test.ts`
- `server/environment.ts`
- `server/index.ts`
- `server/journal.test.ts`
- `server/metrics.test.ts`
- `server/normalizer.test.ts`
- `server/process-tree.ts`
- `server/security.test.ts`
- `server/sessions-worktrees.test.ts`
- `server/sessions.test.ts`
- `server/settings.test.ts`
- `server/shell.test.ts`
- `server/shell.ts`
- `server/worktrees.test.ts`
- `server/worktrees.ts`
- `shared/worktrees.test.ts`
- `shared/worktrees.ts`
- `src/command/BrowserView.tsx`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`npm test` : 562 tests réussis, 0 échec, 1 ignoré(s). Le test ignoré concerne un comportement de signal Unix.

## Observations natives antérieures

La version agrégée de migration a été installée et utilisée sous Windows x64. Les builds x64/ARM64 ont été produits ; l’arrêt IPC a été vérifié avec une instance Electron isolée.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/windows-runtime` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Sur Windows, installer Git pour Windows et Claude Code, puis se connecter avec claude. Tester une installation native et une installation npm du CLI.
- Exécuter npm ci puis npm run app:win ; installer le .exe sur un compte Windows standard, lancer une session, l’interrompre et quitter l’app.
- Vérifier qu’aucun processus enfant ne reste actif et que les sessions reprennent au lancement suivant. Tester aussi la fermeture quand le serveur était lancé séparément.
- Construire également avec npm run app:win:arm64. Sur macOS, reconstruire l’app et vérifier le Dock et les sessions.

## Limites et problèmes non résolus

- Installateurs locaux non signés : aucun certificat Windows ni publication de release n’a été configuré.
- x64 testé nativement pendant la migration ; ARM64 construit mais jamais exécuté sur matériel ARM64. macOS/Linux doivent être confirmés par leurs runners et par le mainteneur.
- Mise à jour automatique Windows non validée de bout en bout : elle exige une release et ses métadonnées adaptées.
- Les tests Git nécessitent un Git récent (les fixtures utilisent git init -b). Les vérifications locales ont utilisé Git 2.53 et Node 26 sur Windows x64.
- Cette PR ne comprend pas le choix du terminal, la radio SMTC, la corbeille, les dropdowns ni le maintien en zone de notification. Sans la PR dédiée, fermer la dernière fenêtre quitte l’app sur Windows.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Revoir l’allowlist d’environnement et le traitement des shims npm sans interpolation de commandes.
- Vérifier l’arrêt IPC et les opérations taskkill avec des processus enfants réellement actifs.
- Conserver les correctifs navigateur de la version 1.16.4, déjà présents dans la base de cette PR.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
