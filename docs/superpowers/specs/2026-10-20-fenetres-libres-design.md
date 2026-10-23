# Fenêtres libres, grille réordonnable et salle déplaçable

20/10/2026. Demande de l'utilisateur, qui laisse carte blanche sur l'UX tant que c'est « le mieux du mieux possible ».

## Pourquoi

Aujourd'hui tout est rangé d'office : les fenêtres de session suivent `src/state/stack.ts` (colonnes de trois depuis la droite au-dessus de la salle, colonnes depuis la gauche en mode focus) et la salle est centrée dans sa zone. l'utilisateur veut disposer son poste lui-même, comme sur le bureau d'un Mac : agrandir ou réduire une fenêtre, la poser en bas à droite, réordonner la grille, et déplacer la salle avec tout le monde dedans.

Réussi si : on arrange tout à la souris sans lire de mode d'emploi, rien ne sort de l'écran, rien ne saute, et la disposition est retrouvée au rechargement.

Raté même si ça marche si : une fenêtre se perd hors de l'écran, une fenêtre se remonte en perdant son brouillon ou son défilement, le verre décroche pendant un déplacement, ou le langage visuel actuel (verre foncé, hauteurs égales, gouttière de 12 px) est cassé.

## Ordre de livraison (décidé par l'utilisateur)

1. Déplacer la salle.
2. Grille : réordonner et redimensionner.
3. Mode libre.

Chaque étape est livrable seule.

## 1. Déplacer et redimensionner la salle

- ⌥ + glisser sur la salle la déplace (Alt sur Windows et Linux). Curseur « main » quand ⌥ est enfoncé au-dessus de la salle, « main fermée » pendant le glisser.
- Bornes : la salle reste entièrement dans la fenêtre du navigateur, sous l'en-tête. Elle peut passer derrière les fenêtres de session.
- ⌥ + molette sur la salle la rétrécit ou l'agrandit, centré sur le pointeur (validé par l'utilisateur). Le pincement du trackpad (événement `wheel` avec `ctrlKey`) fait pareil au-dessus de la salle, sans zoomer la page.
- Taille bornée (choix de JBP) : au plus sa taille actuelle (le plus grand 4:3 qui tient dans sa zone), au moins assez grande pour que les persos restent lisibles (le constructeur fixe le minimum). Le pixel art reste net (pas de lissage).
- Double-clic avec ⌥ sur la salle : elle revient à sa place et à sa taille par défaut, animée.
- Position et taille mémorisées par salle (Bureau, Salle de repos), en coordonnées relatives à la zone pour survivre à un redimensionnement du navigateur ; reclampée si la fenêtre du navigateur rétrécit.
- Un ⌥ + clic sans mouvement ne doit pas déclencher le clic habituel de la salle (`onClick` du canvas dans `RoomView.tsx`) ni l'inverse : un seuil de quelques pixels sépare clic et glisser.
- Le verre (`--frost`, calculé dans `Sky.tsx` toutes les secondes) doit suivre pendant le glisser : recalcul forcé, au moins par image ou limité si trop coûteux, et un recalcul final au relâchement.
- Les bulles et le clic sur les persos (`scale`, `offset`, `roomPoint`) restent justes après un déplacement.
- Sur Windows, relâcher Alt seul donne le focus au menu du navigateur : empêcher ce comportement après un ⌥ + glisser.

## 2. Grille

Le mode actuel, rendu `Grille` dans l'interface.

**Réordonner**
- On attrape une fenêtre par sa barre de titre (`.cp-detail__head`), sans touche, ou par n'importe où avec ⌥.
- La fenêtre se soulève (ombre, légère mise à l'échelle) et suit le pointeur ; les autres glissent en direct pour montrer où elle tombera. Un emplacement fantôme en contour de verre marque la place.
- Lâcher la pose. Échap annule et la remet d'où elle vient.
- Au-dessus de la salle (colonnes qui gardent leurs fenêtres) : lâcher sur une fenêtre l'insère à sa place dans cette colonne ; si la colonne est pleine, les deux s'échangent. Lâcher sur une colonne vide ou à côté de la dernière crée une colonne si la largeur le permet.
- En mode focus (ordre plat, `layOut`) : le glisser change l'ordre plat, la découpe en colonnes reste celle d'aujourd'hui (1re colonne, puis 2e, puis 3e). Une session nouvellement ouverte arrive toujours en premier, comme aujourd'hui.
- Contrainte forte : les fenêtres ne doivent jamais être remontées (brouillon et défilement perdus). `Stack.tsx` garde déjà un ordre DOM stable et place par attributs `data-*` ; le réordonnancement doit rester un changement de placement, animé (FLIP ou équivalent).
- Un double-clic sur la barre de titre garde son rôle actuel (zoom).

**Redimensionner**
- Les gouttières entre colonnes et entre fenêtres d'une même colonne se tirent : curseur de redimensionnement au survol, trait d'accent pendant le glisser.
- Bornes : aucune colonne sous `minColumn`, aucune fenêtre sous une hauteur lisible (le constructeur fixe le minimum).
- Double-clic sur une gouttière : retour au partage égal.
- Le bord extérieur de la pile (côté salle) se tire aussi, pour élargir les fenêtres sur la salle ou l'inverse ; borné par la carte d'état et `maxColumns` (choix de JBP).
- Une colonne ne répartit que ses fenêtres présentes ; le placement actuel (`placement`, `data-span`) reste tel quel (choix de JBP).
- Les proportions sont mémorisées par vue ; elles se réinitialisent pour une colonne quand le nombre de fenêtres de cette colonne change (choix de JBP, pour éviter des proportions qui n'ont plus de sens).

## 3. Mode libre

**Basculer** (choix de JBP, qui remplace l'idée de « devient libre dès qu'on la tire », incompatible avec le glisser de la grille) : une bascule Grille / Libre en deux icônes, à côté du sélecteur Bureau / Salle de repos / Focus, même hauteur de pastille. (La palette ⌘K ne liste que des commandes slash, la bascule n'y va pas.) Le mode est mémorisé par vue : Bureau et Salle de repos partagent le même (ils partagent déjà `columns`), le focus a le sien (choix de JBP). Les positions libres sont rangées par session, donc elles survivent à un aller-retour Bureau / Focus malgré `retile`.
- Grille → Libre : chaque fenêtre garde exactement sa place et sa taille, rien ne bouge.
- Libre → Grille : c'est le « Ranger ». Les fenêtres glissent vers la grille, animées ; l'ordre de la grille se déduit de leur position (de gauche à droite, puis de haut en bas).

**Source de vérité** (choix de JBP) : `columns` reste l'ensemble et l'ordre des sessions ouvertes, dans les deux modes ; le mode libre ajoute seulement un rectangle et un ordre d'empilement par session. Quand le navigateur rétrécit, la règle de la grille s'applique aussi en libre (`fitColumns` ferme les fenêtres en trop, sans les supprimer), pour que « Ranger » marche toujours.

**Surface** (choix de JBP) : tout l'espace sous l'en-tête. Une fenêtre libre peut couvrir la salle et la carte d'état, pas la liste des sessions du mode focus. Les bords de la carte d'état et de la liste aimantent ; l'aperçu demi-écran et quart d'écran se calcule dans la surface.

**Lanceur** (choix de JBP) : il ne se réordonne pas. En mode libre il apparaît à la place de la cascade où la session va arriver, comme il prend en grille la case de la future session.

**Déplacer**
- Par la barre de titre, ou par n'importe où avec ⌥.
- Bornes : la barre de titre reste toujours atteignable (jamais sous l'en-tête, jamais entièrement hors de l'écran ; au moins une bonne part de la largeur reste visible).
- Un clic n'importe où sur une fenêtre la passe au premier plan.

**Redimensionner**
- Par les quatre bords et les quatre coins, avec les curseurs du système. Zone de prise fine, invisible au repos.
- Mêmes tailles minimales que la grille ; jamais plus grande que la zone visible.

**Aimants**
- À moins de quelques pixels, un bord accroche : bords de l'écran (à la gouttière près), bords des autres fenêtres (alignés, ou côte à côte à la gouttière près), axe central. Un trait de repère apparaît le temps de l'accroche.
- Garder ⌘ (Ctrl sur Windows) pendant le glisser coupe les aimants : c'est le « désaligner ».
- Pointeur contre un bord de l'écran : aperçu en verre de la demi-largeur ; contre un coin : du quart ; contre le haut : plein écran. Lâcher applique. C'est le comportement de Windows et de macOS Sequoia.
- Le bouton zoom existant devient en mode libre « plein écran / revenir à la taille d'avant ».

**Ouvrir et fermer**
- Une session ouverte en mode libre arrive en cascade : décalée en bas à droite de la dernière ouverte, à la taille d'une colonne de la grille ; la cascade repart du haut quand elle sortirait de l'écran.
- Fermer une fenêtre ne bouge aucune autre.
- Même nombre maximal de fenêtres que la grille de la vue, pour que « Ranger » puisse toujours tout ranger.

**Mémoire**
- Positions et tailles par session et par vue, relatives à la zone visible ; au redimensionnement du navigateur, les fenêtres sont reclampées et rétrécies si besoin, jamais perdues.

## Hors champ

- Mobile et écrans sous `60rem` : rien ne change (une fenêtre en plein écran, salle masquée). Le mode libre et le déplacement de la salle y sont ignorés, sans effacer ce qui est mémorisé pour le grand écran.
- Pas de gestes tactiles.
- Pas de bibliothèque de glisser-déposer : le projet n'en a pas et Pointer Events suffit (choix de JBP, à revoir par le constructeur s'il a une raison forte).
- Pas de synchronisation serveur : tout reste en `localStorage` comme `poste:layout`.

## Contraintes du projet

- Logique pure et testée sans DOM dans `src/state/` (`node --test`), comme `stack.ts` et `logic.test.ts` : placement, réordonnancement, bornes, aimants, cascade, déduction de l'ordre au « Ranger ».
- Styles dans `src/design/` seulement, aucun style inline ni couleur littérale dans `src/command/`, icônes via `Icons.tsx`.
- Pas de `backdrop-filter`.
- Raccourcis dans le listener unique de `App.tsx`.
- Vérifications : `npm run check`, `npm run lint`, `npm test`. Ne jamais lancer `npm run build` ni relancer le serveur sans que l'utilisateur le demande : `dist` est servi en direct et la relance coupe les sessions en cours.

## Laissé au constructeur

- Les valeurs exactes : seuils d'aimant, tailles minimales, décalage de cascade, durées d'animation, zones de prise.
- La forme du modèle de données (nouvelle clé `poste:*`, migration depuis `poste:layout`).
- Comment limiter le coût du recalcul du verre pendant un glisser.
- Le raccourci clavier de la bascule Grille / Libre, s'il en faut un en plus de la palette.
