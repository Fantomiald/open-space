# Open Space : notes pour Claude Code

Open Space pilote plusieurs sessions Claude Code depuis un bureau en pixel art, dans le navigateur. Lis `docs/ARCHITECTURE.md` avant de toucher au serveur, au protocole ou à la salle.

## Commandes

- `npm run check` (types client + serveur), `npm run lint` (Biome, règles dans `biome.jsonc`), `npm test` (node:test, sans dépendance), `npm run build`. Les quatre doivent passer.
- `npm start` / `npm run dev`. Node 22.18+ exécute le TypeScript du serveur directement : dans `server/` et `shared/`, imports avec extension `.ts`, pas d'`enum`, de `namespace` ni de paramètres-propriétés.

## Règles

- Le serveur reste lié à `127.0.0.1` et exige le cookie de session (secret de `OFFICE_DIR/secret`, posé par `/pair`), le Host et l'Origin (`server/security.ts`). Ne jamais passer `--tools`. Le mode de permission est choisi par session, par défaut celui des réglages ; `bypassPermissions` et `dontAsk` ne sont pas proposés.
- Un dossier dont les réglages font tourner du code (hooks, `.mcp.json`) n'est lancé qu'avec l'accord de l'utilisateur, sinon sans ses réglages (`server/trust.ts`) : `claude -p` saute la question de confiance de Claude Code. Ce contrôle reste côté serveur.
- Les dossiers où les sessions travaillent sont choisis par l'utilisateur (onboarding, Réglages) ou fixés par `OFFICE_ROOTS`. Tout chemin venant du client passe par `server/paths.ts` (realpath). L'environnement de `claude` vient de `server/environment.ts` (liste blanche).
- Aucun prénom, chemin ni réglage d'une personne en dur : tout vient de l'équipe (`crew.json`, le membre `self`) et des réglages (`settings.json`).
- Le design vit dans `src/design/` (tokens, composants, palettes) ; `src/command/` n'a pas de style en ligne et les couleurs littérales n'existent que sous `design/`. La salle (`src/room/`) prend les siennes dans `room-palette.ts` et `people-palette.ts`. Les icônes passent par `src/command/Icons.tsx` (Lucide). Pas d'emoji comme marqueurs.
- La salle : logique pure (`geometry`, `floor`, `paths`, `seats`, `cast`, `scene`, `bubbles`, `pet`, `visitors`, `outfits`, `shared/festivals.ts`) testée sans DOM dans `src/room/room.test.ts` ; le dessin des gens passe par `SpriteSource` (`src/room/sprites.ts`). ~15 images/s, pause quand l'onglet est caché, pas de flou animé.
- Un look ou un réglage enregistré doit rester valable quand on en ajoute : un nouveau trait est facultatif dans le fichier, avec une valeur par défaut (`LATER_TRAITS` dans `shared/look.ts`).
- La logique pure (états, file « à toi », fil d'événements) est testée sans DOM : `server/session-state.ts`, `src/state/*.ts`, `src/room/*.ts`.
- Le serveur ne fait aucun appel réseau sortant (la salle est dessinée en code, sans image externe) ; garder ça.
- Les fixtures `server/fixtures/*.jsonl` sont de vraies sorties de `claude -p` (nettoyées) : les régénérer si le format du CLI change.

## L'app Mac (Electron)

- `desktop/main.ts` ouvre une fenêtre sur le serveur, lancé dans l'app (`utilityProcess`). Si un serveur répond déjà sur le port (`npm start`), l'app s'y branche et ne l'arrête pas en quittant. Le code de l'app est construit dans `out/` (`vite.desktop.config.ts`), jamais dans `dist/`.
- L'app installée tourne sur le code de sa version. Pour voir une modif sans publier : quitter l'app, `npm start`, rouvrir l'app (elle se branche dessus). `npm run app:dev` lance l'app depuis le repo.
- Tester l'app sans toucher à l'Open Space en cours : `PORT=4949`, `OFFICE_DIR` et `--user-data-dir` dans un dossier temporaire.
- Sortir une version : passer `version` dans `package.json`, une section dans `CHANGELOG.md`, commit « Open Space x.y.z » et push. Puis `GH_TOKEN=$(gh auth token)` et `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (clé API App Store Connect) avec `npm run app:publish` : signe, notarise et crée la release GitHub en brouillon. Enfin `gh release edit vx.y.z --draft=false --latest`. Les apps installées se mettent à jour seules à partir de la release publiée (`latest-mac.yml` + zip).
- Sans certificat Developer ID : `npm run app` fait un dmg signé ad hoc (clic droit, Ouvrir la première fois, pas de mise à jour auto).
