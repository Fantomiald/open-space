# Windows : sélecteur natif pour ajouter un dossier autorisé

## Problème

L’onboarding et les paramètres exigeaient la saisie manuelle d’un chemin, alors que l’utilisateur demandait à sélectionner un dossier dans l’explorateur Windows.

## Changements et périmètre

- Ajouter Parcourir dans le composant partagé des dossiers (onboarding et réglages), avec ajout du dossier choisi, gestion d’annulation, d’erreur et des doublons.
- Exposer uniquement pickFolder par un preload Electron avec contextIsolation/sandbox conservés.
- Vérifier le sender, le frame principal, l’origine locale, le verrou OFFICE_ROOTS et l’absence d’une autre sélection en cours avant dialog.showOpenDialog.
- Copier les assets desktop disponibles lors du build ; ne jamais donner au renderer un accès général à Node ou à ipcRenderer.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `desktop/main.ts`
- `desktop/preload.cjs`
- `package.json`
- `scripts/copy-desktop-assets.mjs`
- `shared/paths.ts`
- `src/command/PreferenceFields.tsx`
- `src/env.d.ts`
- `src/i18n/en/settings.ts`
- `src/i18n/fr/settings.ts`
- `src/lib/format.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

Pas de nouveau test automatisé DOM/natif pour cette fonctionnalité : exécuter les scénarios manuels ci-dessous. Ne pas présenter la compilation comme une validation de ces interactions.

## Observations natives antérieures

Le sélecteur a été vérifié avec une instance Electron isolée pendant la migration ; annulation, doublons et autorisations étaient séparés de la sélection de chemin.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/windows-folder-picker` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Dans une app Windows construite après le socle, tester Parcourir depuis l’onboarding puis depuis Réglages > Dossiers.
- Sélectionner un dossier avec espaces, annuler, sélectionner deux fois le même chemin et provoquer une erreur du dialogue.
- Démarrer avec OFFICE_ROOTS : vérifier que les réglages verrouillés ne permettent pas d’ouvrir ce sélecteur.
- Confirmer qu’une pièce jointe, un sous-frame ou une autre origine ne peut pas déclencher l’IPC.

## Limites et problèmes non résolus

- Disponible dans l’app Electron Windows ; le serveur ouvert dans un navigateur ordinaire conserve la saisie manuelle.
- Pas de test automatisé complet d’un dialogue natif hostile : les contrôles de frame/origine nécessitent une revue explicite.
- La copie des assets est commune aux PRs zone de notification/barre des tâches. Lors du rebase après le socle, conserver le nettoyage Node ET la copie des assets dans app:build.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Relire les contrôles IPC avant toute simplification ; ne pas élargir l’API preload.
- Vérifier le montage du preload dans l’archive construite et le comportement quand aucun preload n’est disponible.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
