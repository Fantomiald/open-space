# Accessibilité : respecter la réduction des animations du système

## Problème

Le réglage d’animations citait macOS et plusieurs animations du décor/aperçus ne suivaient pas de manière cohérente la préférence système et celle d’Open Space.

## Changements et périmètre

- Introduire useReducedMotion : réduire si la préférence utilisateur OU prefers-reduced-motion le demande.
- Écouter les changements de préférence système et appliquer le résultat à l’interface, la scène, le ciel, le mobilier animé et les aperçus d’animaux.
- Remplacer les aides macOS par des textes FR/EN adaptés au système, avec explication du comportement Windows.
- Ne pas changer le format des préférences sauvegardées.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `src/App.tsx`
- `src/command/PreferenceFields.tsx`
- `src/i18n/en/settings.ts`
- `src/i18n/fr/settings.ts`
- `src/lib/motion.ts`
- `src/lib/platform.ts`
- `src/room/RoomView.tsx`
- `src/room/Sky.tsx`
- `src/room/pixel-furniture.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`node --test src/room/room.test.ts` : 55 tests réussis, 0 échec, 0 ignoré(s).

## Observations natives antérieures

La propagation de la préférence a été vérifiée dans la version agrégée ; les media queries et la logique de salle ont également été inspectées.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/system-reduced-motion` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Activer la réduction des animations dans Windows pendant que l’app est ouverte ; vérifier une réaction sans rechargement.
- Faire les quatre combinaisons préférence système/utilisateur : les mouvements ne doivent être actifs que si les deux autorisent les animations.
- Vérifier ciel, scène, mobilier et aperçus des animaux, puis navigation et changement de langue.
- Répéter avec prefers-reduced-motion sur macOS/Linux et vérifier le nettoyage des listeners lors des démontages.

## Limites et problèmes non résolus

- Les tests de salle sont des régressions de logique pure ; ils ne testent pas le hook React, les media queries ni la perception visuelle.
- Aucun audit lecteur d’écran et aucun inventaire exhaustif de toutes les animations n’a été effectué.
- La préférence utilisateur ne réactive pas les animations lorsque le système les interdit : ce choix est intentionnel.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Vérifier les abonnements matchMedia, le nettoyage et les dépendances React. Éviter un état capturé qui ne suivrait plus les changements système.
- Confirmer que le décor et les aperçus utilisent la même règle que le CSS et que les animations d’interaction essentielles restent compréhensibles.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
