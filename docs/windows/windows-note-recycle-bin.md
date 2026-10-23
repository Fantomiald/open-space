# Windows : envoyer les notes supprimées à la Corbeille

## Problème

La suppression cherchait ~/.Trash, propre à macOS. Ce dossier étant généralement absent sur Windows, une note était effacée par unlink sans passer par la Corbeille.

## Changements et périmètre

- Utiliser une opération native Windows SendToRecycleBin via Microsoft.VisualBasic.FileIO pour la suppression par défaut.
- Faire transiter le chemin par l’environnement et lancer un script PowerShell statique masqué.
- Propager les erreurs de l’opération native sans repli explicite sur unlink.
- Conserver la validation du nom et du chemin réel de la note ainsi que le dossier de corbeille explicite utilisé par les tests.

## Dépendances et ordre de fusion

Cette PR est autonome pour la lecture et la compilation et vise `Fantomiald/open-space:main`. Fusionner le socle Windows avant de valider les parcours complets de l’application installée. Rebaser après cette fusion : ses changements ne sont pas dupliqués ici.

Base de préparation : Open Space 1.16.4, commit `abae1fd25f9fdbcc90f25c82d10a127c620c2155`. La version du paquet n’est pas abaissée à 1.16.2 et aucune release n’est créée.

Les changements de la migration initiale ont été séparés en PRs par fonctionnalité. Certains points d’intégration sont communs (imports de main.ts, scripts de copie d’assets, aides de réglages et helpers partagés). Résoudre les chevauchements en gardant chaque fonctionnalité ; ne pas restaurer un fichier entier depuis une ancienne version.

## Fichiers à lire

- `server/journal.test.ts`
- `server/journal.ts`
- `server/recycle.ts`
- `server/windows.ts`

## Vérifications exécutées sur cette branche

`npm run check`, `npm run lint` et `npm run build` réussis sur cette branche isolée sous Windows x64.

`node --test server/journal.test.ts` : 13 tests réussis, 0 échec, 0 ignoré(s).

## Observations natives antérieures

Une note temporaire a été envoyée à la vraie Corbeille Windows, son contenu lu et restauré avec succès, y compris dans un dossier avec caractères spéciaux.

Ces observations proviennent de la version agrégée utilisée pendant la migration. Elles sont des éléments de contexte, pas une preuve que tous les parcours natifs de cette PR isolée et rebâsée sur 1.16.4 ont été rejoués. Les builds ARM64 ne constituent pas un test matériel ARM64. La CI distante doit encore être examinée après publication.

## Reproduire et vérifier

Après checkout de `codex/windows-note-recycle-bin` : `npm ci`, `npm run check`, `npm run lint`, `npm run build`, puis les tests ciblés cités ci-dessus et `npm test` après intégration du socle. Pour les essais desktop, utiliser un port libre, un `OFFICE_DIR` temporaire et un `--user-data-dir` temporaire. Ne pas prendre les réglages ou sessions de l’application quotidienne comme fixtures.

- Créer une note temporaire au nom unique, la supprimer, vérifier sa présence et son contenu dans la Corbeille, puis la restaurer.
- Tester un dossier contenant espaces, apostrophe et caractères non ASCII.
- Tester fichier verrouillé, droits insuffisants, disque externe et partage réseau ; vérifier qu’un échec ne déclenche jamais un repli applicatif vers unlink.

## Limites et problèmes non résolus

- La validation native a porté sur un disque local Windows, pas sur tous les lecteurs amovibles, partages réseau ou politiques de Corbeille.
- Les comportements Windows lorsque la Corbeille est désactivée ou indisponible doivent être examinés avant de promettre une restauration universelle.
- Le comportement des autres plateformes hors macOS n’est pas changé ; la suppression explicite avec un dossier de test conserve sa logique historique.

## Reprise par Claude Code

Lire d’abord `CLAUDE.md` et `docs/ARCHITECTURE.md`, examiner le diff de cette seule PR puis les dépendances. Vérifier la branche sur sa base courante, conserver les modifications amont de 1.16.4 et réexécuter les tests après toute résolution de conflit. Les observations ci-dessus ne dispensent pas de relire les contrôles de chemins, de processus et d’IPC.

- Contrôler la sémantique native SendToRecycleBin et les dialogues d’erreur sur volumes sans Corbeille. Ne pas ajouter de suppression définitive silencieuse de secours.
- Le helper windowsScript est identique à celui des PRs musique et récupération de navigateur ; l’opération corbeille est séparée dans recycle.ts pour éviter une dépendance à ces fonctionnalités.

Si un scénario ne peut pas être vérifié sur la machine de revue, le signaler précisément dans le compte rendu ; ne pas le déclarer réussi. Les scénarios natifs macOS/Linux, l’ARM64 matériel et la distribution signée restent à traiter selon les limites propres à la fonctionnalité.
