# Interface : dropdowns sombres et lisibles pour les paramètres et anniversaires

## Problème

Les listes natives Windows rendaient le texte des jours/mois et des paramètres presque illisible sur fond clair, alors que le menu des métiers était lisible.

## Changements et périmètre

- Créer un Select sombre réutilisable, avec options, valeur contrôlée, états désactivés et callback compatible avec les usages existants.
- Afficher les menus de réglages avec popover/CSS anchors pour éviter leur découpage par les panneaux scrollables.
- Remplacer les selects des réglages, onboarding et menus associés, et donner aux anniversaires une liste sombre inspirée du menu des métiers.
- Conserver les interactions clavier (flèches, début/fin, recherche de préfixe pour Select, Escape, retour du focus) et les libellés accessibles.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `src/command/CrewDialog.tsx`
- `src/command/PreferenceFields.tsx`
- `src/command/PreviewFields.tsx`
- `src/command/Select.tsx`
- `src/command/SettingsDialog.tsx`
- `src/command/TuneMenu.tsx`
- `src/design/components.css`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

Pas de nouveau test automatisé DOM/natif pour cette fonctionnalité : exécuter les scénarios manuels ci-dessous. Ne pas présenter la compilation comme une validation de ces interactions.

## Observations natives antérieures

Les menus d’anniversaire et de réglages ont été vérifiés dans Electron, notamment les longs menus en bas du panneau et le changement FR/EN.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/readable-dropdowns` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Ouvrir les menus jour/mois puis chaque famille de réglages en français et anglais ; contrôler contraste, sélection et sauvegarde.
- Tester flèches, Home/End, Escape, Tab, clic extérieur et changement de langue.
- Ouvrir une longue liste près du bord inférieur d’un panneau scrollé et dans une petite fenêtre ; vérifier qu’elle reste utilisable.
- Contrôler les boutons et libellés au lecteur d’écran sur Windows, puis la navigation clavier sur macOS.

## Limites et problèmes non résolus

- Pas de suite DOM/lecteur d’écran automatisée ajoutée ; les validations de contraste et focus sont manuelles.
- Popover et CSS anchors nécessitent un navigateur moderne ; Electron 44 a servi aux vérifications, les anciens navigateurs autonomes ne sont pas validés.
- Le menu des branches du lanceur reste natif : il n’était pas dans le périmètre des menus de réglages.
- BirthdaySelect et Select sont encore deux implémentations ; leur consolidation éventuelle doit préserver les comportements clavier.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Auditer focus, scroll et noms accessibles. Ne pas attribuer les résultats de tests de logique aux interactions DOM.
- Le Select commun est aussi inclus par la PR terminal ; garder une seule copie identique lors de la fusion.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
