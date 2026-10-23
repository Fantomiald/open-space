# Worktrees : copier les fichiers inclus sur Windows et hors APFS

## Problème

Les .env, dépendances et entrées .worktreeinclude n’étaient copiés que par cp -c sous macOS. Sur Windows/Linux, la copie était entièrement ignorée.

## Changements et périmètre

- Conserver les clones APFS sur macOS et utiliser une copie récursive indépendante sur les autres plateformes ou en repli d’un clone échoué.
- Ne pas utiliser de hardlinks : modifier les secrets ou dépendances d’une session ne doit pas modifier le checkout principal.
- Conserver les fichiers déjà présents et compter les copies/échecs ; enlever une copie partielle lorsque possible.
- Exécuter les tests de copie sur toutes les plateformes et vérifier l’indépendance des modifications et l’absence d’écrasement.
- Inclure le contrôle d’appartenance Windows nécessaire à la reconnaissance des branches/worktrees et les fixtures Git sans conversion CRLF.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `server/worktrees.test.ts`
- `server/worktrees.ts`
- `shared/worktrees.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`node --test server/worktrees.test.ts` : 15 tests réussis, 0 échec, 0 ignoré(s).

## Observations natives antérieures

Les tests ont réellement créé des worktrees et vérifié la copie indépendante de fichiers/dossiers sur Windows.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/portable-worktree-copies` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Créer un dépôt avec .env, node_modules, Pods et .worktreeinclude ; lancer une session isolée et vérifier les fichiers disponibles.
- Modifier .env et une dépendance dans le worktree puis confirmer que le checkout principal est intact.
- Tester liens symboliques/jonctions, permissions refusées, disque plein et dépendances volumineuses ; contrôler le signalement d’échec.
- Sous macOS, vérifier qu’un clone APFS reste utilisé et que le repli fonctionne sur un autre système de fichiers.

## Limites et problèmes non résolus

- Les copies ordinaires prennent davantage de temps et de place ; il n’y a pas de clone instantané Windows fourni.
- La recréation de symlinks peut échouer selon les droits Windows. Les très gros arbres n’ont pas été benchmarkés.
- Les tests couvrent des dépôts temporaires de petite taille ; ne pas assimiler cela à une validation de toutes les arborescences npm/pnpm.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Vérifier les chemins inclus, les symlinks et le nettoyage partiel. Confirmer qu’aucun fichier existant du checkout cible n’est écrasé.
- Le helper isInside est aussi corrigé dans les PRs socle/chemins ; garder une version cohérente lors des fusions.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
