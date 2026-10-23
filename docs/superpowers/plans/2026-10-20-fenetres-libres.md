# Fenêtres libres, grille réordonnable et salle déplaçable : plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** déplacer et zoomer la salle, réordonner et redimensionner la grille des fenêtres, et ajouter un mode libre avec aimants, sans perdre l'état des fenêtres.

**Architecture:** toute la géométrie est en fonctions pures testées (`src/state/room-frame.ts`, `src/state/windows.ts`, `src/state/stack.ts`). `Stack.tsx` cesse de placer les fenêtres par la grille CSS : il mesure sa zone et pose chaque fenêtre en absolu à partir d'un rectangle calculé (grille ou libre), ce qui rend les animations, le réordonnancement et le « Ranger » gratuits. `columns` reste l'ensemble et l'ordre des sessions ouvertes dans les deux modes.

**Tech Stack:** React 19, Zustand, TypeScript, CSS (tokens dans `src/design/`), Pointer Events, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-fenetres-libres-design.md`

## Global Constraints

- Styles dans `src/design/` (et `src/room/room.css` pour la salle) ; dans `src/command/`, aucun style en ligne sauf des variables CSS (`style={{ '--x': … } as CSSProperties}`, comme `CrewDialog.tsx:295`), aucune couleur littérale. Icônes via `src/command/Icons.tsx` (Lucide).
- Pas de `backdrop-filter`. Pas de bibliothèque de glisser-déposer.
- Les fenêtres ne sont jamais remontées : un enfant par session, clé = id de session, ordre DOM trié par id (`Stack.tsx`, `ordered`).
- Raccourcis clavier dans le listener unique de `App.tsx`.
- Tout ce qui est mémorisé passe par `readPreference` / `writePreference` (`src/lib/preferences.ts`) et survit à une valeur absente ou corrompue.
- Textes en français et en anglais (`src/i18n/fr/*.ts`, `src/i18n/en/*.ts`), sans tiret cadratin ni demi-cadratin.
- Sous `60rem` de large : rien ne change, gestes désactivés, rien d'effacé.
- `prefers-reduced-motion` : pas d'animation de placement.
- Vérifications de chaque tâche : `npm run check`, `npm run lint`, `npm test`. **Jamais** `npm run build`, `npm start` ni relance du serveur (le `dist` est servi en direct sur 4848, la relance coupe les sessions). Vérification visuelle : `npx vite --config vite.preview.local.ts` (port 5175, pages `src/zz-preview.html` et `src/zz-focus.html?open=4`) avec Playwright.
- **Ne pas commiter** : l'utilisateur commite lui-même. Chaque tâche finit par « laisser non commité ».

Valeurs fixées par ce plan (le spec les laisse au constructeur) :

| Nom | Valeur | Où |
|---|---|---|
| `GAP` | 12 px (`--gutter`) | windows.ts |
| `SNAP` | 8 px | windows.ts |
| `MIN_WINDOW` | 320 × 192 px | windows.ts |
| `KEEP_VISIBLE` | 120 px en largeur, toute la barre de titre (56 px) en hauteur | windows.ts |
| `CASCADE_STEP` | 32 px | windows.ts |
| `EDGE_ZONE` | 6 px du bord de la surface | windows.ts |
| `DRAG_THRESHOLD` | 4 px | src/lib/drag.ts |
| `MIN_ROOM_SCALE` | 0.4 | room-frame.ts |
| Animation de placement | 200 ms `cubic-bezier(0.2, 0.8, 0.2, 1)` | components.css |

## Review Focus

1. **Navigateur rétréci sous des fenêtres libres enregistrées** : chaque fenêtre est reclampée et rétrécie, sa barre de titre reste atteignable. Test `clampRect` (tâche 8).
2. **Clic contre glisser** : un clic ou un double-clic sur la barre de titre (zoom, crayon de renommage, menu) ne lance jamais de glisser ; seul un déplacement de plus de 4 px depuis une zone non interactive le fait. Test `startsDrag` (tâche 2) et vérification manuelle (tâches 6 et 10).
3. **Session fermée ou supprimée par le serveur pendant un glisser** : le glisser s'annule sans erreur. Test `moveIn` avec un id absent (tâche 3), annulation dans `useWindowDrag` (tâche 6).
4. **Préférences d'une ancienne version ou corrompues** (`poste:windows` absent, champs manquants, `NaN`) : valeurs par défaut. Test `sanitizeWindows` (tâche 9) et `sanitizeRoomFrames` (tâche 1).
5. **Aller-retour Bureau / Focus en mode libre** : les rectangles sont par session, une session ouverte entre-temps arrive en cascade. Test `tidy` avec des ids sans rectangle (tâche 8).

---

### Task 1: géométrie de la salle

**Files:**
- Create: `src/state/room-frame.ts`
- Create: `src/state/layout.test.ts` (tests de toute la géométrie de ce plan)

**Interfaces:**
- Produces:
  - `interface Box { left: number; top: number; width: number; height: number }`
  - `interface RoomFrame { x: number; y: number; scale: number }` : `x`, `y` en fraction de la taille de la salle à sa place par défaut (`home`), `scale` dans `[MIN_ROOM_SCALE, 1]`.
  - `const DEFAULT_ROOM_FRAME: RoomFrame = { x: 0, y: 0, scale: 1 }`, `const MIN_ROOM_SCALE = 0.4`
  - `roomBox(home: Box, frame: RoomFrame): Box` : `left = home.left + x * home.width`, `width = home.width * scale` (origine en haut à gauche).
  - `clampRoom(frame: RoomFrame, home: Box, bounds: Box): RoomFrame` : échelle bornée, puis la boîte ramenée entièrement dans `bounds`.
  - `zoomRoom(frame: RoomFrame, home: Box, bounds: Box, pointer: { x: number; y: number }, factor: number): RoomFrame` : le point sous le pointeur reste sous le pointeur, puis `clampRoom`.
  - `panRoom(frame: RoomFrame, home: Box, bounds: Box, dx: number, dy: number): RoomFrame`
  - `sanitizeRoomFrames(raw: unknown): Partial<Record<'office' | 'lounge', RoomFrame>>` : ignore tout ce qui n'est pas trois nombres finis.

- [ ] **Step 1: écrire les tests**

```ts
describe('room frame', () => {
  const home = { left: 0, top: 50, width: 800, height: 600 }, bounds = { left: 0, top: 50, width: 1400, height: 600 };
  it('keeps the room inside the bounds', () => {
    assert.deepEqual(roomBox(home, clampRoom({ x: 2, y: -1, scale: 1 }, home, bounds)), { left: 600, top: 50, width: 800, height: 600 });
  });
  it('bounds the scale', () => {
    assert.equal(clampRoom({ x: 0, y: 0, scale: 3 }, home, bounds).scale, 1);
    assert.equal(clampRoom({ x: 0, y: 0, scale: 0.1 }, home, bounds).scale, MIN_ROOM_SCALE);
  });
  it('zooms around the pointer', () => {
    const frame = zoomRoom(DEFAULT_ROOM_FRAME, home, bounds, { x: 400, y: 350 }, 0.5);
    const box = roomBox(home, frame);
    assert.deepEqual([box.left + box.width / 2, box.top + box.height / 2, box.width], [400, 350, 400]);
  });
  it('pans and stops at the edge', () => {
    assert.equal(roomBox(home, panRoom(DEFAULT_ROOM_FRAME, home, bounds, 900, 0)).left, 600);
  });
  it('a smaller window brings a saved room back in view', () => {
    const small = { left: 0, top: 50, width: 900, height: 600 };
    assert.equal(roomBox(home, clampRoom({ x: 0.75, y: 0, scale: 1 }, home, small)).left, 100);
  });
  it('drops saved frames that are not numbers', () => {
    assert.deepEqual(sanitizeRoomFrames({ office: { x: 0.1, y: 0, scale: 0.5 }, lounge: { x: 'a' } }), { office: { x: 0.1, y: 0, scale: 0.5 } });
    assert.deepEqual(sanitizeRoomFrames(null), {});
  });
});
```

- [ ] **Step 2:** `npm test` → les nouveaux tests échouent (module absent).
- [ ] **Step 3:** implémenter `src/state/room-frame.ts` avec les signatures ci-dessus ; ajouter `src/state/layout.test.ts` au glob déjà couvert par `npm test` (`src/**/*.test.ts`, rien à changer).
- [ ] **Step 4:** `npm test` → PASS ; `npm run check`, `npm run lint` → OK.
- [ ] **Step 5:** laisser non commité.

### Task 2: déplacer et zoomer la salle

**Files:**
- Create: `src/lib/drag.ts`
- Modify: `src/room/RoomView.tsx` (stage, `onClick` l.200, structure l.257-262), `src/room/room.css`, `src/design/components.css:133` (`.cp-main__content`), `src/room/Sky.tsx` (`frost`, l.60-109)
- Test: `src/state/layout.test.ts`

**Interfaces:**
- Consumes: tâche 1.
- Produces:
  - `src/lib/drag.ts` : `const DRAG_THRESHOLD = 4` ; `startsDrag(from: { x: number; y: number }, to: { x: number; y: number }): boolean` (distance > seuil) ; `useAltKey(): boolean` (⌥/Alt enfoncé, remis à `false` sur `blur`) qui pose aussi `data-alt` sur `document.documentElement` pour les curseurs CSS ; `swallowAltRelease()` : à appeler à la fin d'un ⌥ + glisser, empêche le `keyup` d'Alt suivant (`preventDefault`) pour que Windows ne donne pas le focus au menu du navigateur.
  - `src/room/Sky.tsx` : `export const refreshFrost = () => window.dispatchEvent(new Event(FROST_EVENT))` ; `frost()` écoute `FROST_EVENT` comme `resize` (le garde `waiting` limite déjà la cadence).

- [ ] **Step 1: test** `startsDrag({x:0,y:0},{x:3,y:2})` → false ; `{x:0,y:0},{x:4,y:3}` → true.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `src/lib/drag.ts`.
- [ ] **Step 4: brancher dans `RoomView`** (au-dessus de 60rem seulement, via `matchMedia('(min-width: 60.01rem)')`) :
  - `home` = boîte du stage sans transformation (centré dans `.cp-room__fit`, `offsetWidth`/`offsetHeight`) ; `bounds` = boîte de `.cp-main` rentrée de la gouttière.
  - `pointerdown` avec ⌥ sur le stage : capture du pointeur ; au-delà de `DRAG_THRESHOLD`, `panRoom` à chaque `pointermove`, puis `refreshFrost()` ; au relâchement, écrit `writePreference('roomFrames', …)` et `refreshFrost()`. Le `click` qui suit un glisser est avalé (capture, une fois).
  - `wheel` non passif sur le stage quand `altKey` ou `ctrlKey` (pincement du trackpad) : `preventDefault`, `zoomRoom` avec `factor = Math.exp(-deltaY / 300)`.
  - `dblclick` avec ⌥ : `DEFAULT_ROOM_FRAME`, animé (attribut `data-settling` le temps de la transition).
  - Le cadre s'applique en variables CSS sur le stage (`--room-x`, `--room-y` en px, `--room-scale`), `transform-origin: 0 0`. Reclamp sur le `ResizeObserver` existant (l.181). Une salle par clé : `room` (`'office' | 'lounge'`).
  - `scale`/`offset` des bulles (l.185-189) se basent sur `clientWidth`, non affecté par la transformation : rien à changer ; `roomPoint` lit `getBoundingClientRect`, déjà juste.
- [ ] **Step 5: CSS** : `room.css` : transformation du stage depuis les variables, `image-rendering: pixelated` conservé, curseur `grab` quand `:root[data-alt] .cp-room__stage`, `grabbing` pendant le glisser, transition 200 ms sur `[data-settling]`. `components.css` : en vue salle et repos au-dessus de 60rem, `.cp-main__content { overflow: visible }` pour que la salle passe sous les fenêtres.
- [ ] **Step 6: vérifier** dans la préversion (`src/zz-preview.html`) avec Playwright : ⌥ + glisser à fond à droite, la salle reste dans la fenêtre et passe sous les fenêtres ; ⌥ + molette rétrécit sous le pointeur ; un clic sur un perso ouvre toujours sa session ; ⌥ + double-clic recentre ; rechargement : position gardée ; le verre des fenêtres montre la salle à sa nouvelle place ; à 390 px de large, rien n'a changé. Captures avant et après.
- [ ] **Step 7:** `npm run check`, `npm run lint`, `npm test` → OK ; laisser non commité.

### Task 3: réordonner, la logique

**Files:**
- Modify: `src/state/stack.ts`
- Test: `src/state/layout.test.ts`

**Interfaces:**
- Produces:
  - `interface DropSlot { column: number; row: number }` : `column` dans l'ordre du tableau `columns` (pas `fromRight`), `row` = position d'insertion dans cette colonne ; `column === columns.length` = nouvelle colonne.
  - `moveIn(columns: Columns, id: string, to: DropSlot, max: number, tiling: Tiling): string[][]`
    - id absent : copie inchangée.
    - sans `spread` : retiré de sa colonne puis inséré à `to.row` (borné) ; si la colonne cible a déjà `perColumn` fenêtres sans lui, il **échange** sa place avec celle qui occupe `to.row` (ou la dernière) ; nouvelle colonne seulement si `columns.length < max` ; les colonnes vides partent.
    - avec `spread` : on retire l'id de l'ordre plat, on l'insère à l'indice plat de `to`, puis `layOut(ordre, columns.length, tiling)`.
  - `dropAt(slots: readonly { id: string; column: number; row: number; box: Box }[], point: { x: number; y: number }, columns: Columns): DropSlot | null` : la fenêtre sous le pointeur ; moitié haute → avant elle, moitié basse → après ; à côté de toutes les colonnes → nouvelle colonne ; `null` hors de la pile. (`Box` vient de `room-frame.ts`.)

- [ ] **Step 1: tests**

```ts
describe('moving a window in the grid', () => {
  it('moves into another column', () => assert.deepEqual(moveIn([['a', 'b'], ['c']], 'b', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['b', 'c']]));
  it('swaps with a full column', () => assert.deepEqual(moveIn([['a', 'b', 'c'], ['d']], 'd', { column: 0, row: 1 }, 2, ROOM_TILING), [['a', 'd', 'c'], ['b']]));
  it('opens a new column when there is room', () => assert.deepEqual(moveIn([['a', 'b']], 'b', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['b']]));
  it('focus mode keeps its cut and changes the order', () => assert.deepEqual(moveIn([['a', 'b'], ['c'], ['d']], 'd', { column: 0, row: 0 }, 3, FOCUS_TILING), [['d', 'a'], ['b'], ['c']]));
  it('ignores a session that left', () => assert.deepEqual(moveIn([['a']], 'z', { column: 0, row: 0 }, 2, ROOM_TILING), [['a']]));
});
```
  Plus deux tests `dropAt` : pointeur dans la moitié basse de la fenêtre `row: 0` → `{ column, row: 1 }` ; pointeur à gauche de toutes les colonnes de la salle → `{ column: columns.length, row: 0 }`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implémenter. **Step 4:** `npm test` → PASS. **Step 5:** laisser non commité.

### Task 4: la grille en rectangles

**Files:**
- Create: `src/state/windows.ts`
- Test: `src/state/layout.test.ts`

**Interfaces:**
- Consumes: `placement`, `Tiling`, `Columns` (stack.ts), `Box` (room-frame.ts).
- Produces:
  - `const GAP = 12`
  - `interface GridSizes { columns: number[]; rows: number[][] }` : fractions qui somment à 1 ; `columns` dans l'ordre du tableau `columns`, `rows[c]` une fraction par rangée de la grille (`placement().rows`).
  - `gridBoxes(columns: Columns, sizes: GridSizes | null, area: { width: number; height: number }, tiling: Tiling): Record<string, Box>` : reproduit exactement le placement actuel (colonnes depuis la droite pour la salle, depuis la gauche en focus, `span`, rangées vides gardées) ; `sizes` absent, ou de mauvaise longueur pour la grille courante, vaut partage égal. Coordonnées relatives à la zone de la pile.
  - `resizeTrack(fractions: readonly number[], index: number, delta: number, total: number, min: number): number[]` : déplace la frontière entre `index` et `index + 1` de `delta` px sur une longueur `total`, sans que l'une passe sous `min` px.

- [ ] **Step 1: tests** : deux colonnes de salle `[['a'], ['b', 'c']]` dans 1000 × 600 → `a` = `{ left: 506, top: 0, width: 494, height: 192 }` (colonne 0 à droite, trois rangées) ; focus `[['a', 'b'], ['c']]` → `c` occupe toute la hauteur (`span`) ; `resizeTrack([0.5, 0.5], 0, 100, 1000, 320)` → `[0.6, 0.4]` ; `resizeTrack([0.5, 0.5], 0, 400, 1000, 320)` → `[0.68, 0.32]` ; des `sizes` à deux colonnes pour une grille à trois → partage égal.
- [ ] **Step 2–4:** FAIL, implémenter, PASS. **Step 5:** laisser non commité.

### Task 5: la pile posée en absolu

**Files:**
- Modify: `src/command/Stack.tsx`, `src/design/components.css:293-310` (`.cp-stack`, `.cp-stack__slot`)

**Interfaces:**
- Consumes: `gridBoxes` (tâche 4).
- Produces: dans `Stack.tsx`, `boxes: Record<string, Box>` calculé à partir de la taille mesurée de `.cp-stack` (`ResizeObserver`) ; chaque slot reçoit `--x --y --w --h` (px) ; l'attribut `data-placed` sur `.cp-stack` dès la première mesure. Le lanceur (`LAUNCHER`) passe par le même calcul.

- [ ] **Step 1:** captures de référence avant modification, dans la préversion : salle avec 1, 3, 4 sessions ouvertes, focus avec 1, 3, 5, zoom, Tab, et 390 px.
- [ ] **Step 2:** implémenter : sans mesure, la grille CSS actuelle reste en repli ; avec `data-placed`, `.cp-stack__slot` en `position: absolute`, `translate: var(--x) var(--y)`, `width: var(--w)`, `height: var(--h)`, transition 200 ms (sauf `[data-dragging]` et `prefers-reduced-motion`) ; le zoom = la boîte de toute la zone ; sous 60rem, les règles mobiles existantes gagnent (slot statique, `grid-area: 1 / 1`).
- [ ] **Step 3:** captures après : identiques aux références au pixel près ou presque (la gouttière, les hauteurs). Ouvrir et fermer une session : les autres glissent au lieu de sauter, le brouillon et le défilement restent.
- [ ] **Step 4:** `npm run check`, `npm run lint`, `npm test` → OK ; laisser non commité.

### Task 6: réordonner à la souris

**Files:**
- Create: `src/command/useWindowDrag.ts`
- Modify: `src/command/Stack.tsx`, `src/command/Detail.tsx` (`.cp-detail__head`, l.117), `src/state/sessions.ts` (action), `src/App.tsx` (Échap), `src/design/components.css`

**Interfaces:**
- Consumes: `moveIn`, `dropAt` (tâche 3), `startsDrag`, `swallowAltRelease`, `useAltKey` (tâche 2).
- Produces:
  - store : `moveWindow: (id: string, to: DropSlot) => void` = `arrange(moveIn(columns, id, to, maxColumnsIn(view), tilingOf(view)))`.
  - `useWindowDrag()` : renvoie `{ dragging: DragState | null; onPointerDown(id: string, event: PointerEvent): void; cancel(): void }`, où `DragState = { id: string; grab: { x: number; y: number }; pointer: { x: number; y: number }; preview: Columns }`. Partagé par la grille et le mode libre (tâche 10 y ajoute la branche libre).
- Comportement :
  - Départ : `pointerdown` bouton principal sur `.cp-detail__head` hors `button, input, form, a, [role=menu]`, ou n'importe où dans la fenêtre avec ⌥ ; démarre après `startsDrag`. `Detail` reçoit le gestionnaire via le contexte de `Stack` (pas de prop sur chaque enfant du fil).
  - Pendant : `preview = moveIn(...)` recalculé quand `dropAt` change ; la pile se place sur `preview`, la fenêtre tirée garde sa case (contour fantôme `::before` en verre sur le slot `[data-dragging]`) et son `.cp-detail` suit le pointeur par `--drag-x --drag-y`, ombre `--shadow-overlay`, `scale: 1.02`.
  - Fin : relâcher → `moveWindow` ; Échap (listener de `App.tsx`, avant les autres cas d'Échap) ou disparition de l'id de `openIds` → `cancel()`, retour animé.
  - Désactivé si une seule fenêtre, en zoom, sous 60rem.
- [ ] **Step 1:** implémenter.
- [ ] **Step 2: vérifier** dans la préversion, salle et focus : tirer une fenêtre sur une autre, dans une colonne pleine (échange), hors des colonnes (nouvelle colonne) ; Échap annule ; un double-clic sur la barre zoome toujours ; le crayon renomme sans glisser ; un brouillon tapé reste après le déplacement. Captures pendant et après un glisser.
- [ ] **Step 3:** `npm run check`, `npm run lint`, `npm test` → OK ; laisser non commité.

### Task 7: redimensionner la grille

**Files:**
- Modify: `src/command/Stack.tsx`, `src/state/sessions.ts`, `src/design/components.css`
- Test: `src/state/layout.test.ts`

**Interfaces:**
- Consumes: `gridBoxes`, `resizeTrack` (tâche 4).
- Produces:
  - `type Arrangement = 'room' | 'focus'` et `arrangementOf(view: View): Arrangement` dans `sessions.ts`.
  - store : `gridSizes: Record<Arrangement, GridSizes | null>`, `resizeGrid(sizes: GridSizes | null): void` (pour l'arrangement courant), `stackWidth: number | null` (fraction de `innerWidth`, salle seulement), `setStackWidth(width: number | null): void`. Les tailles d'une colonne sont oubliées quand son nombre de fenêtres change (dans `arrange`).
  - Persistance : dans `poste:windows` (forme complète en tâche 9) ; d'ici là, `gridSizes` et `stackWidth` y sont déjà écrits.
- Comportement :
  - Des poignées invisibles de la largeur de la gouttière entre colonnes et entre fenêtres d'une colonne, curseur `col-resize` / `row-resize`, trait d'accent pendant le glisser ; double-clic → `null` pour cette dimension.
  - Bord gauche de la pile (salle) : `--stack-width` remplace la largeur calculée par CSS, borné entre une colonne minimale et `100vw - 20rem - 3 × gouttière` (la carte d'état).
  - Minimums : `minColumn` du tiling, 192 px de haut.
- [ ] **Step 1: test** : `arrange` qui fait passer une colonne de 2 à 3 fenêtres remet ses rangées à égalité (tester la fonction pure qui le décide : `keepSizes(previous: Columns, next: Columns, sizes: GridSizes | null): GridSizes | null` dans `windows.ts`).
- [ ] **Step 2–3:** FAIL, implémenter, PASS.
- [ ] **Step 4: vérifier** dans la préversion : tirer une gouttière, les deux fenêtres voisines suivent, aucune sous le minimum ; double-clic remet à égalité ; rechargement : tailles gardées. Captures.
- [ ] **Step 5:** checks → OK ; laisser non commité.

### Task 8: géométrie du mode libre

**Files:**
- Modify: `src/state/windows.ts`
- Test: `src/state/layout.test.ts`

**Interfaces:**
- Produces (toutes en px, relatives à la surface) :
  - `SNAP = 8`, `MIN_WINDOW = { width: 320, height: 192 }`, `KEEP_VISIBLE = 120`, `TITLE_HEIGHT = 56`, `CASCADE_STEP = 32`, `EDGE_ZONE = 6`
  - `type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'`
  - `interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }`
  - `type Zone = 'left' | 'right' | 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`
  - `clampBox(box: Box, surface: { width: number; height: number }): Box` : taille dans `[MIN_WINDOW, surface]`, `top` dans `[0, height - TITLE_HEIGHT]`, au moins `KEEP_VISIBLE` px visibles en largeur.
  - `resizeBox(start: Box, edge: Edge, dx: number, dy: number): Box` : bord opposé fixe, `MIN_WINDOW` respecté.
  - `snapMove(box: Box, others: readonly Box[], surface: { width: number; height: number }): { box: Box; guides: Guide[] }` : chaque axe s'accroche au candidat le plus proche à moins de `SNAP` : bords de la surface à `GAP` près, bords des autres alignés, côte à côte à `GAP` près, centre de la surface.
  - `snapResize(box: Box, edge: Edge, others: readonly Box[], surface: { width: number; height: number }): { box: Box; guides: Guide[] }` : seuls les bords tirés s'accrochent.
  - `zoneAt(point: { x: number; y: number }, surface: { width: number; height: number }): Zone | null` : à moins de `EDGE_ZONE` d'un bord ; coins sur 1/6 de la longueur du bord ; haut hors coins → `'full'`.
  - `zoneBox(zone: Zone, surface: { width: number; height: number }): Box` : moitiés et quarts séparés par `GAP`, marges `GAP`.
  - `cascade(last: Box | null, size: { width: number; height: number }, surface: { width: number; height: number }): Box` : `last` décalé de `CASCADE_STEP` en bas à droite ; repart de `{ left: GAP, top: GAP }` s'il sortirait.
  - `tidy(columns: Columns, boxes: Record<string, Box>, area: { width: number; height: number }, tiling: Tiling, sizes: GridSizes | null): string[][]` : même forme que `columns` ; chaque fenêtre va à la case de `gridBoxes` la plus proche de son centre (paires triées par distance, attribution gloutonne) ; une fenêtre sans boîte garde sa case.
- [ ] **Step 1: tests** (un `it` chacun) :
  - `clampBox({ left: 1500, top: 900, width: 2000, height: 300 }, { width: 1000, height: 700 })` → largeur 1000, `top` 644, au moins 120 px visibles.
  - `resizeBox` coin `nw` de −50, −50 sur 400 × 300 → 450 × 350, bord bas-droit inchangé ; vers +200, +200 → 320 × 192.
  - `snapMove` à 5 px du bord gauche → `left: 12` et un guide `x` à 12 ; à 5 px de « côte à côte » d'une autre → collé à `GAP` ; à 20 px → inchangé, aucun guide.
  - `zoneAt({ x: 2, y: 400 })` sur 1200 × 800 → `'left'` ; `{ x: 2, y: 5 }` → `'top-left'` ; `{ x: 600, y: 2 }` → `'full'` ; `{ x: 600, y: 400 }` → `null`.
  - `cascade` : décalage de 32 ; repli en `{12, 12}` quand il sortirait.
  - `tidy` : deux fenêtres croisées (A à gauche, B à droite alors que la grille les a dans l'autre ordre) → ordre échangé ; une id sans boîte garde sa case.
- [ ] **Step 2–4:** FAIL, implémenter, PASS. **Step 5:** laisser non commité.

### Task 9: état du mode libre et bascule

**Files:**
- Modify: `src/state/sessions.ts`, `src/state/windows.ts`, `src/command/Header.tsx`, `src/command/Icons.tsx`, `src/i18n/fr/common.ts`, `src/i18n/en/common.ts`, `src/design/components.css`
- Test: `src/state/layout.test.ts`

**Interfaces:**
- Consumes: `Arrangement`, `gridSizes`, `stackWidth` (tâche 7), `tidy` (tâche 8).
- Produces :
  - `type WindowMode = 'grid' | 'free'`
  - `interface FreeLayout { boxes: Record<string, Box>; order: string[] }` : boîtes en **fractions** de la surface, `order` du fond vers le premier plan.
  - `interface WindowsPreference { mode: Record<Arrangement, WindowMode>; free: Record<Arrangement, FreeLayout>; sizes: Record<Arrangement, GridSizes | null>; stackWidth: number | null }`, clé `poste:windows`.
  - `sanitizeWindows(raw: unknown): WindowsPreference` (windows.ts) : défauts `grid`, vide, `null`.
  - store : `windowMode: Record<Arrangement, WindowMode>`, `free: Record<Arrangement, FreeLayout>`, `freeWindows(boxes: Record<string, Box>): void` (passe l'arrangement courant en libre avec les boîtes données, en fractions), `tidyWindows(columns: Columns): void` (`arrange(columns)` puis mode `grid`), `placeWindow(id: string, box: Box): void`, `raiseWindow(id: string): void`. Une session supprimée (pas fermée) quitte `free` dans le handler qui retire déjà les sessions.
  - Bascule : dans `Header.tsx`, après le segment Bureau / Salle de repos / Focus, un second `cp-segmented data-icons` de deux boutons (`LayoutGridIcon`, `AppWindowIcon` de Lucide, exportés par `Icons.tsx`), `aria-pressed`, titres i18n « Fenêtres en grille » / « Fenêtres libres » (`Windows in a grid` / `Free windows`). Visible seulement au-dessus de 60rem et avec au moins une session ouverte. Le clic sur « libre » passe par un événement que `Stack` écoute (il a les boîtes mesurées) : `requestWindowMode(mode: WindowMode)` dans le store, que `Stack` exécute avec `freeWindows(boxes)` ou `tidyWindows(tidy(...))`.
- [ ] **Step 1: tests** `sanitizeWindows(undefined)` → défauts ; `{ mode: { room: 'free' }, free: { room: { boxes: { a: { left: NaN } } } } }` → `room` libre, boîte `a` écartée, `focus` en grille.
- [ ] **Step 2–3:** FAIL, implémenter, PASS.
- [ ] **Step 4: vérifier** : la bascule a la hauteur des pastilles voisines (`--pill-height`), le mode est gardé au rechargement, Bureau et Salle de repos partagent le mode, Focus a le sien. Capture de l'en-tête.
- [ ] **Step 5:** checks → OK ; laisser non commité.

### Task 10: le mode libre à la souris

**Files:**
- Modify: `src/command/Stack.tsx`, `src/command/useWindowDrag.ts`, `src/command/Detail.tsx`, `src/design/components.css`

**Interfaces:**
- Consumes: tâches 8 et 9, `useWindowDrag` (tâche 6).
- Comportement :
  - Surface : en salle, `.cp-stack[data-mode='free']` couvre toute `.cp-main` (`grid-column: 1 / -1`, marges `--gutter`) et passe au-dessus de `.cp-status` (z-index) ; en focus, la colonne 2 actuelle (la liste reste libre). Le conteneur est `pointer-events: none`, les fenêtres `auto`. Boîtes affichées = `clampBox` des fractions converties.
  - Bords à aimanter en plus des autres fenêtres : la boîte de `.cp-status` (salle) convertie dans le repère de la surface.
  - Déplacer : même départ que la tâche 6 ; `snapMove` (sauf ⌘ ou Ctrl enfoncé), guides affichés comme traits d'accent de 1 px ; `zoneAt` sur le pointeur → aperçu `zoneBox` en contour de verre, appliqué au relâchement ; `placeWindow` au relâchement ; Échap annule.
  - Redimensionner : huit poignées invisibles de 6 px (bords) et 12 px (coins) sur chaque fenêtre, curseurs `ns/ew/nesw/nwse-resize`, `resizeBox` puis `snapResize` (sauf ⌘/Ctrl).
  - `pointerdown` n'importe où dans une fenêtre → `raiseWindow` ; ordre d'empilement par `--z`.
  - Zoom (bouton existant et double-clic sur la barre) : boîte = toute la surface ; la boîte enregistrée ne change pas, donc dézoomer la rend.
  - Sans boîte (session ouverte en mode libre, ou ouverte en focus puis revenue en salle) : `cascade(boîte du premier plan, taille d'une colonne de la grille, surface)`, enregistrée aussitôt. Le lanceur s'affiche à la boîte de cascade que prendra la session.
  - Bascule grille → libre : aucune fenêtre ne bouge ; libre → grille : les fenêtres glissent (transition de la tâche 5) vers `tidy`.
  - Navigateur redimensionné : `clampBox` à l'affichage ; `fitOpen` ferme les fenêtres en trop comme en grille.
- [ ] **Step 1:** implémenter.
- [ ] **Step 2: vérifier** dans la préversion, salle puis focus : poser une fenêtre en bas à droite ; l'agrandir par le coin ; aimant sur un bord et sur une voisine avec le trait de repère ; ⌘ tenu : pas d'aimant ; pointeur contre le bord gauche : aperçu demi-écran puis appliqué ; coin : quart ; haut : plein ; ouvrir deux sessions : cascade ; rétrécir le navigateur à 1000 px : tout reste atteignable ; repasser en grille : tout se range, chaque fenêtre près de sa place ; recharger : dispositions gardées ; 390 px : rien n'a changé. Captures de chaque état clé.
- [ ] **Step 3:** `npm run check`, `npm run lint`, `npm test` → OK ; laisser non commité.

### Task 11: passe finale

- [ ] **Step 1:** relire le spec section par section et cocher chaque exigence contre ce qui a été fait ; corriger les écarts.
- [ ] **Step 2:** `npm run check && npm run lint && npm test` → tout passe.
- [ ] **Step 3:** captures finales (salle déplacée et zoomée, grille réordonnée, mode libre avec un guide visible, mobile 390 px) envoyées à l'utilisateur avec SendUserFile.
- [ ] **Step 4:** ne pas builder ni relancer : dire à l'utilisateur qu'il faut « relance le serv » pour voir la version en direct, et laisser non commité.
