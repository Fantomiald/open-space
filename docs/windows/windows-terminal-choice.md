# Windows : ouvrir et choisir cmd, PowerShell ou Git Bash

## Problème

Le terminal lancé sans console depuis le processus utilitaire Electron se fermait immédiatement. Le clic sur l’écran du personnage semblait donc ne rien faire.

## Changements et périmètre

- Lancer une console indépendante et visible via un bootstrap PowerShell masqué et Start-Process -WindowStyle Normal.
- Détecter cmd, PowerShell 7/Windows PowerShell et Git Bash depuis les emplacements connus et le PATH ; préférer PowerShell 7 lorsqu’il est présent.
- Ajouter une préférence terminal facultative et un message terminals contenant les choix détectés. Les anciens réglages continuent d’utiliser cmd.
- Valider un enum de terminaux, jamais un exécutable fourni par le renderer. Faire transiter les chemins dans l’environnement, pas dans du code shell.
- Utiliser le terminal choisi pour le moniteur et Ctrl+Alt+T. Conserver cmd pour les commandes !.
- Inclure le composant Select sombre nécessaire au nouveau réglage ; il est identique à celui de la PR dropdowns.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `server/desktop.test.ts`
- `server/desktop.ts`
- `server/i18n/en.ts`
- `server/i18n/fr.ts`
- `server/index.ts`
- `server/settings.ts`
- `shared/protocol.ts`
- `shared/terminal.ts`
- `src/command/Select.tsx`
- `src/command/SettingsDialog.tsx`
- `src/design/components.css`
- `src/i18n/en/settings.ts`
- `src/i18n/fr/settings.ts`
- `src/lib/platform.ts`
- `src/state/sessions.ts`
- `src/state/settings-index.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`node --test server/desktop.test.ts` : 3 tests réussis, 0 échec, 0 ignoré(s).

## Observations natives antérieures

Les trois terminaux ont été réellement ouverts depuis un processus utilitaire Electron sur cette machine, y compris avec des caractères spéciaux dans le dossier.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/windows-terminal-choice` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Tester séparément cmd, PowerShell 7, Windows PowerShell et Git Bash installés ; vérifier l’absence de choix non installés.
- Cliquer le moniteur : le terminal s’ouvre dans le dossier par défaut. Sélectionner une session puis Ctrl+Alt+T : son dossier doit être utilisé.
- Tester un chemin avec espaces, &, %, apostrophe et un dossier disparu. Fermer Open Space : le terminal doit rester indépendant.
- Supprimer un terminal après sauvegarde du choix et vérifier l’indication de choix introuvable.

## Limites et problèmes non résolus

- Pas de choix d’exécutable arbitraire ; Windows Terminal, WSL et les autres shells ne sont pas ajoutés.
- Les installations portables ou atypiques hors des emplacements détectés peuvent ne pas être proposées.
- Le socle reste nécessaire pour livrer et utiliser l’app Windows complète. La préférence ne change pas le shell de Claude Code ou des commandes !.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Vérifier la citation de --cd pour Git Bash et l’absence de commandes interpolées.
- Le protocole, le store et la validation doivent évoluer ensemble. Le composant Select et ses styles sont partagés avec la PR dropdowns.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
