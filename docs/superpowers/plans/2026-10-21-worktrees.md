# Worktrees : plan

Spec : `docs/superpowers/specs/2026-10-21-worktrees-design.md`. Maquettes : (lien privé retiré)

## Fichiers

| Où | Quoi |
|---|---|
| `shared/worktrees.ts` | logique pure partagée : slug de la branche, nom du dossier, mots vides (le serveur nomme, le lanceur montre le même nom avant) |
| `server/worktrees.ts` | tout git : infos d'un dossier, création (exclude, `worktree add`, copie en clone APFS), état d'une branche, vérification et avance de la base, wip, suppression, branches d'un repo, ménage, déplacement des journaux de Claude Code |
| `server/worktrees.test.ts` | tests sur de vrais repos git temporaires |
| `shared/protocol.ts` | `SessionInfo.worktree`, `SessionOptions.isolate`, `Preferences.isolate`, événement `branch`, messages `folderInfo`, `branch`, `branches`, `cleanBranches`, `forget.branch` |
| `server/session.ts` | préparation (état `starting` sans processus, messages en file), consigne envoyée avec une bulle courte (`instruct`), changement de dossier (`relocate`), note de lieu au message suivant, fin de tour signalée |
| `server/sessions.ts` | orchestration : création isolée, recréation à la reprise d'une branche gardée, état après chaque tour, fusion (consigne puis vérification), PR, jeter, extinction sans perte, ménage |
| `server/claude-process.ts`, `server/i18n/*` | consigne d'identité d'une session isolée, consignes de fusion et de PR, notes du fil |
| `server/changes.ts` | diff depuis le point de départ de la branche (`merge-base`), commits compris |
| `server/messages.ts`, `server/settings.ts`, `server/index.ts` | validation, réglage `isolate` (défaut `busy`), câblage |
| `src/state/worktrees.ts` (+ test) | quand proposer d'isoler, coché ou non, qui occupe le dossier, état de la carte, signature « Plus tard », lignes du ménage cochées d'office, ce qui sera perdu |
| `src/command/Launcher.tsx`, `TuneMenu.tsx` | ligne « Isoler sur une branche », Dossier Partagé / Isolé, rappel du ménage |
| `src/command/BranchCard.tsx` | cartes du fil (prête, a bougé, fusionnée, échec) |
| `src/command/BranchesDialog.tsx` | panneau Branches de <repo> |
| `src/command/SwitchOffDialog.tsx` | Éteindre une session isolée (trois choix) |
| `Detail.tsx`, `Feed.tsx`, `SessionList.tsx`, `StatusPanel.tsx`, `SearchPalette.tsx`, `room/draw.ts`, `room/cast.ts` | pastille, icône pixel, ⌘K Branches |
| `src/design/components.css`, `room-palette.ts` | styles sur les tokens existants |

## Étapes

1. `shared/worktrees.ts` + tests (slug).
2. `server/worktrees.ts` + tests sur repos jetables : création, copie, état, fusion ff / update-ref / autre worktree / modifs en commun, wip, suppression, liste, journaux.
3. Protocole, réglage, validation des messages (+ tests).
4. Session / SessionManager : création isolée, consigne, fusion, PR, jeter, extinction, ménage, reprise (+ tests avec le faux processus de `sessions.test.ts` et de vrais repos).
5. Client : état pur + tests, lanceur, Tune, en-tête, fil, salle, liste, État, palette, dialogues.
6. Docs : ARCHITECTURE, README EN/FR, CHANGELOG « Prochaine version ».
7. `npm run check`, `npm run lint`, `npm test`.
8. Essai réel `--model haiku` dans un repo jetable (lancer, travailler, carte, fusionner, nettoyer), instance à part (PORT 4961, Vite 5174, OFFICE_DIR temporaire) et captures Chrome headless.

## Choix faits en route

- Le slug vit dans `shared/worktrees.ts` (pas `src/state/`) : le serveur nomme la branche et le lanceur montre le même nom avant.
- Ce qu'Open Space retient d'une branche (pour qui, base, conversation) est dans la config locale du repo (`branch.<nom>.openspace-*`), pas dans un fichier d'OFFICE_DIR : `git branch -D` l'emporte avec la branche, et le panneau nomme les branches sans session.
- Le cwd d'une session isolée est dans son worktree (`worktree.home` garde le dossier demandé) : processus, `!`, terminal, commandes et changements y travaillent sans cas particulier.
- Un chemin dans le premier message compte pour son nom de fichier (`src/checkout.js` donne `checkout`), et « fonction / fichier » sont des mots vides : le vrai essai avait donné `os/iris-src-checkout-js`.
- « Plus tard » est gardé dans le navigateur (signature de la branche : tête, commits, modifs), comme les autres « vu ».
- Une fusion échouée a un bouton « Laisser » (action `dismiss`) en plus de Réessayer, sinon la carte d'échec ne partait jamais.
- Le bouton « Ouvrir une PR » se recalcule à chaque relecture de la branche (un remote ajouté après coup).
- Pas de taille des dossiers dans le panneau (« 1,4 Go » de la maquette) : `du` compte plein les clones APFS, le chiffre serait faux. Le panneau dit combien de dossiers partent.
- Une fusion interrompue par l'utilisateur (Échap) annule la fusion (la carte « Prête » revient) ; un processus parti seul la marque échouée.
- Un worktree supprimé à la main pendant qu'Open Space était arrêté : la session revient dans le dossier principal au démarrage, avec une note.
