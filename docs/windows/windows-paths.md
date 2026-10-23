# Windows : chemins natifs, dossiers connus et textes des paramètres

## Problème

Les exemples /Users/…, l’affichage ~/Desktop et la validation des chemins rendaient les réglages trompeurs ou invalides sur Windows, notamment pour Journal, les chiffres et les dossiers redirigés.

## Changements et périmètre

- Accepter les chemins de lecteur, UNC et les anciennes formes ~/ et ~\, sans accepter les chemins relatifs ou les NUL.
- Utiliser les dossiers connus Bureau/Documents fournis par Electron, avec repli PowerShell pour le serveur autonome ; prendre en compte les redirections OneDrive.
- Afficher les chemins Windows complets, normaliser les séparateurs pour la recherche et la comparaison de racines, et conserver l’affichage ~ sur Unix.
- Adapter les exemples et aides FR/EN ; masquer l’entrée de création d’app Dock hors macOS. Le dossier Journal est créé à l’enregistrement de la première note.
- Ne pas parcourir automatiquement AppData/OneDrive ; les dossiers proposés ne deviennent autorisés que lorsqu’ils sont cochés.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `desktop/main.ts`
- `server/config.ts`
- `server/index.ts`
- `server/journal.test.ts`
- `server/metrics.test.ts`
- `server/paths.ts`
- `server/settings.test.ts`
- `server/settings.ts`
- `server/system-folders.test.ts`
- `server/system-folders.ts`
- `shared/folders.ts`
- `shared/metrics.ts`
- `shared/paths.test.ts`
- `shared/paths.ts`
- `shared/worktrees.ts`
- `src/command/Changes.tsx`
- `src/command/FolderPicker.tsx`
- `src/command/PreferenceFields.tsx`
- `src/command/SettingsDialog.tsx`
- `src/i18n/en/settings.ts`
- `src/i18n/fr/settings.ts`
- `src/lib/format.test.ts`
- `src/lib/format.ts`
- `src/lib/platform.ts`
- `src/state/folders.ts`
- `src/state/search.ts`
- `src/state/settings-index.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`node --test shared/paths.test.ts server/system-folders.test.ts server/metrics.test.ts server/journal.test.ts server/settings.test.ts src/lib/format.test.ts` : 28 tests réussis, 0 échec, 0 ignoré(s).

## Observations natives antérieures

Les chemins et paramètres ont été vérifiés dans la version Windows agrégée. Journal était confirmé comme un dossier du profil utilisateur, pas comme une syntaxe réservée à macOS.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/windows-paths` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Tester Bureau/Documents locaux, puis redirigés vers OneDrive ; vérifier les chemins réels proposés et l’absence de scan du reste de OneDrive.
- Saisir un lecteur complet, une racine de lecteur, un partage UNC et un chemin avec espaces. Refuser un chemin relatif et un dossier hors des racines autorisées.
- Enregistrer une note dans un Journal encore absent et configurer un fichier de chiffres .md sous Windows.
- Vérifier les aides en français/anglais et le maintien des chemins ~/… sur macOS/Linux.

## Limites et problèmes non résolus

- Les tests de dossiers connus simulent les redirections ; une installation Windows avec redirection réelle et un partage réseau authentifié restent à vérifier.
- La comparaison d’appartenance est insensible à la casse pour les chemins Windows ; le contrôle serveur continue de résoudre les chemins réels.
- Cette PR ne fournit pas le bouton natif Parcourir ni le comportement de réduction des animations.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Tester les racines de lecteurs, UNC, chemins avec séparateurs mixtes et dossiers frères dont le préfixe se ressemble.
- Ne pas transformer un dossier suggéré en autorisation implicite. Préserver OFFICE_ROOTS et son verrouillage.
- Le helper partagé de containment est également utilisé dans les PRs socle/worktrees ; conserver une seule version identique à la fusion.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
