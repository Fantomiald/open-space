# Mods d'Open Space : règles pour l'agent qui en écrit un

Open Space copie ce fichier en `CLAUDE.md` du dossier des mods à chaque lancement : ne le modifie pas ici, il serait écrasé.

Un mod est une petite fenêtre flottante d'Open Space. Tu travailles dans **son dossier** (celui où ta session a démarré, sous ce dossier-ci). Open Space l'affiche dans un cadre isolé, à côté des fenêtres des sessions, et le recharge tout seul dès que tu enregistres un fichier.

## Ce que contient le dossier

- `mod.json` : `name` (court, 2 ou 3 mots, sans « mod »), `description` (une ligne, ce qu'on y voit), `icon` (un parmi `puzzle chart bars coins timer list bell calendar star heart bolt globe note terminal`), `width` et `height` en pixels (la taille d'ouverture, sans la barre de titre ; 240 à 960 et 120 à 900 ; la fenêtre prend ensuite la hauteur de son contenu et ne la dépasse jamais, même redimensionnée ; laisse donc le contenu à sa hauteur naturelle, sans `height: 100%` ni `100vh` sur la page), `draft`, et au besoin :
  - `refresh` : tous les combien la fenêtre rafraîchit le mod, en secondes, parmi `0` (jamais), `60`, `300`, `900`, `1800`, `3600`. Choisis-le selon la donnée (des ventes : `900` ; un minuteur : `0`). L'utilisateur le change dans les réglages du mod.
  - `env` : les variables dont la page a besoin (une clé d'API, un identifiant), par exemple `[{ "name": "STRIPE_KEY", "label": "Clé secrète Stripe, dans Développeurs > Clés API" }]`. Le `label` dit à l'utilisateur ce que c'est et où la trouver. Il remplit les valeurs dans les réglages du mod (l'engrenage) ; tu ne les vois jamais.
  - `trigger` : l'identifiant d'un déclencheur Open Space que la page peut lancer (un bouton « Lancer… » qui démarre une session), par exemple `"f0bbff1129e1da16"`. L'identifiant est dans la liste des déclencheurs (outil `list_triggers`). Seulement si l'utilisateur le demande.

  L'utilisateur peut aussi changer `name`, `description` et `icon` dans les réglages : relis `mod.json` avant de le réécrire, et garde ce qu'il y a mis.
- `index.html` : la page. Elle part du modèle déjà là ; garde ses deux lignes `kit.css` et `kit.js`.
- `data/` (facultatif) : les fichiers de données que tu écris ou qu'un script met à jour. Quand un fichier de `data/` change alors que la fenêtre est fermée, Open Space affiche un « ! » sur le bouton Mods et sur l'objet de la salle.

## Le déroulé

1. Lis la demande, puis ce fichier en entier.
2. Remplis `mod.json` (nom, description, icône, taille qui convient au contenu). Laisse `draft: true` pendant que tu travailles : la fenêtre affiche « en fabrication ».
3. Écris `index.html` avec les composants ci-dessous. Une donnée externe (une API) : deux façons.
   - **Depuis la page**, si l'API accepte les appels d'un navigateur (CORS ouvert ; la page a son origine à elle, `http://<id>.localhost:<port>`) : déclare la clé dans `env` de `mod.json`, lis-la avec `await OpenSpace.env()` et appelle l'API en `https`. Branche le rechargement avec `OpenSpace.onRefresh`. Sans clé remplie, affiche un `<os-empty>` qui dit d'ouvrir les réglages du mod (l'engrenage de sa fenêtre) pour la donner.
   - **Par un script**, si l'API refuse les navigateurs : demande la clé avec `os-secret ask NOM --why "…"`, écris un petit script qui dépose les données dans `data/`, et dis à l'utilisateur comment il tourne (un déclencheur Open Space, par exemple).
   Dans les deux cas, jamais de clé dans un fichier du dossier.
   Un contenu d'un autre site (une vidéo YouTube, une playlist Spotify, une carte) : son lecteur intégré, dans une `<iframe>` en `https` (l'adresse « embed » que le site donne pour l'intégrer ailleurs). Un site qui refuse d'être intégré (`X-Frame-Options`, `frame-ancestors`) reste vide dans une iframe, et sa connexion aussi : propose plutôt un lien qui l'ouvre dans le navigateur.
4. Teste : ouvre la page dans ton navigateur à **trois largeurs**, 260, 400 et 720 px (`browser_resize`), vérifie qu'aucun texte ne déborde, qu'aucune barre de défilement horizontale n'apparaît, que les états vide et erreur s'affichent. L'adresse de la page est dans le fichier `.address` du dossier (sans cookie : elle marche dans ton navigateur). Hors d'Open Space, la page prend le style classique et ne reçoit pas les données d'`OpenSpace.watch` : teste la mise en page avec des données d'exemple, puis retire-les.
5. Passe `draft` à `false`. Le mod apparaît dans la fenêtre de l'utilisateur.
6. Dis en une ou deux phrases ce que fait le mod, et d'où viennent ses données.

Pour modifier un mod plus tard, la même règle : l'utilisateur te le demande dans la session ouverte sur ce dossier.

## Les règles qui ne se discutent pas

- **Rien que le kit pour le style** : pas de couleur, de police ni de rayon en dur. Les couleurs viennent des variables (`--color-text`, `--color-text-muted`, `--color-accent`, `--tone-good`, `--tone-warn`, `--tone-bad`, `--tone-info`, `--series-1` à `--series-8`, `--glass-tint`, `--glass-edge`). Open Space les remplace par celles du style de fenêtre de l'utilisateur : ton mod change de thème avec lui.
- **Pas de fond** : la page est transparente, le verre est celui de la fenêtre. Pas de `background` sur `body`, pas de grande carte qui l'entoure.
- **Pas de titre en haut** : le nom est déjà dans la barre de la fenêtre.
- **Compact** : un mod se lit d'un coup d'œil. Trois ou quatre chiffres clés au plus, un graphique, une liste courte. Rien qui défile de côté.
- **Toutes les largeurs** : de 240 à 960 px, le kit s'adapte (il mesure le mod, pas l'écran). N'impose pas de largeur fixe.
- **Les trois états** : chargement (`<os-loading>`), vide (`<os-empty>`), erreur (`<os-error>`). Jamais une page blanche ni un « undefined ».
- **Pas de bibliothèque externe** quand le kit suffit. Si une vraie raison l'impose, une seule, depuis un CDN en `https`, version figée.
- **Pas de secret dans le dossier** : les clés passent par `env` et `OpenSpace.env()`. Pas d'appel à Open Space autre que ceux du kit : la page est servie à part, sans cookie ni accès au serveur d'Open Space, c'est voulu.
- **Les textes dans la langue de l'utilisateur**, courts, sans emoji.
- Formate nombres, sommes, dates et durées avec `OpenSpace.format` (il suit la langue d'Open Space).

## Le kit

Une page de mod commence toujours ainsi (c'est le modèle) :

```html
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="/mod-kit/kit.css">
<script src="/mod-kit/kit.js"></script>
```

Tous les composants, avec des données d'exemple, sont dans la galerie : `/mod-kit/gallery.html` à la même adresse que ta page (remplace `/mods/…` par `/mod-kit/gallery.html`). Regarde-la avant d'écrire.

Les composants sont des balises `os-*`. Les données passent en attribut JSON (`data='[…]'`) ou par la propriété du même nom en JavaScript (`el.data = […]`), ce qui redessine. Tous se redessinent quand la fenêtre change de taille.

### Mise en page

- `<os-section title="Par app" action="30 jours">…</os-section>` : un titre discret au-dessus d'un bloc.
- `<os-row>…</os-row>` : des blocs côte à côte quand il y a la place, l'un sous l'autre sinon.

### Chiffres

- `<os-stats>` contenant des `<os-stat label="30 jours" value="1 284 $" delta="+18 %" tone="good" hint="vs mois dernier">`. `tone` : `good`, `bad` (la couleur du delta). `size="large"` pour un seul chiffre héros.
- `<os-spark values='[3,4,6,5,9]' tone="good">` : une mini-courbe à côté d'un chiffre.
- `<os-meter label="Quota 5 h" value="62" max="100" text="62 %" tone="warn">` : une jauge.
- `<os-ring label="Objectif" value="41" max="60" text="41">` : la même en anneau.

### Graphiques

- `<os-line series='[{"name":"SteadyMen","values":[1,2,3]}]' labels='["1 nov","2 nov","3 nov"]' unit="$" legend area>` : courbes avec axe, grille, info-bulle au survol. `area` remplit sous une courbe seule ; `legend` sous plusieurs.
- `<os-bars data='[{"label":"lun","value":12}]' unit="$">` : barres verticales avec info-bulle.
- `<os-rows data='[{"label":"Ismaël","value":6.1,"text":"6,10 $"}]' colors>` : barres horizontales classées (un nom, sa barre, son nombre). `max="100"` pour une échelle fixe, `colors` pour une couleur par ligne.
- Les couleurs des séries suivent `--series-1…8` dans l'ordre : ne les choisis pas à la main, sauf `color` pour une donnée qui a déjà sa couleur.

### Listes

- `<os-list data='[{"title":"…","text":"…","value":"…","tone":"good","href":"https://…"}]' wrap empty="Rien aujourd'hui">` : des lignes (un point de couleur si `tone`, un lien si `href`). `wrap` laisse le texte sur trois lignes.
- `<os-table columns='[{"key":"app","label":"App","wide":true},{"key":"mrr","label":"MRR","align":"right"}]' rows='[…]'>`.

### Petits éléments

- `<os-badge tone="good">en hausse</os-badge>`, `<os-updated at="2026-11-10T08:00:00Z" label="RevenueCat">` (« RevenueCat · il y a 4 min », tenu à jour).
- `<os-tabs options='["Jour","Semaine","Mois"]' value="Jour">` : émet `change` avec `event.detail`.
- `<button class="os-button">`, `<button class="os-button" data-variant="primary">`, `<input class="os-input">`, `<select class="os-select">`, `<p class="os-note">`.

### États

- `<os-loading rows="3" block>` : des lignes qui respirent (et un bloc pour un graphique).
- `<os-empty title="Pas encore de ventes" text="Elles s'afficheront ici.">`, `<os-error title="Impossible de lire les ventes" text="…">`.

### JavaScript : `window.OpenSpace`

- `OpenSpace.json('data/sales.json')` : lit un fichier du mod, à jour.
- `OpenSpace.watch(nom, (valeur) => …)` : ce qu'Open Space sait, maintenant puis à chaque changement. Renvoie de quoi arrêter.
  - `sessions` : `[{ id, name, state ('starting' | 'work' | 'perm' | 'wait' | 'done' | 'closed' | 'error'), resting, folder, tags, model, turns, createdAt, stateSince, busySince, subagents, context: { used, max } | null }]`.
  - `quota` : `{ fiveHour (0 à 1), resetsAt, windows: [{ name, utilization, resetsAt }] }` ou `null`.
  - `costs` : `{ scanning, today, total, days: [{ day, usd, turns }] (30 jours), models: [{ name, usd }], projects: [{ name, usd }] }` en dollars au prix de l'API, ou `null` au premier chargement.
- `OpenSpace.data(nom)` : la même chose une seule fois (une promesse).
- `OpenSpace.env()` : les variables que l'utilisateur a remplies dans les réglages du mod, `{ NOM: valeur }` (une promesse, relue à chaque appel ; `{}` hors d'Open Space). Une variable vide n'y est pas.
- `OpenSpace.runTrigger()` : lance le déclencheur nommé dans `trigger` de `mod.json`. Open Space demande d'abord à l'utilisateur de confirmer ; sans `trigger`, il ne se passe rien. Ne l'appelle que sur un clic.
- `OpenSpace.onRefresh(() => …)` : appelé quand la fenêtre rafraîchit le mod (son bouton ↻, ou le rythme `refresh`). Sans lui, la fenêtre recharge la page entière. Recharge tes données dedans, sans effacer ce qui est affiché avant d'avoir la réponse. Renvoie une promesse (une fonction `async`) : le bouton ↻ tourne jusqu'à ce qu'elle se termine. `onRefresh` renvoie de quoi arrêter.
- `OpenSpace.store` : ce que le mod enregistre (une liste cochée, des réglages), gardé par Open Space dans son dossier (`.store/`, à ne pas écrire toi-même) et retrouvé à la réouverture. `await OpenSpace.store.get('nom')` (null si rien), `OpenSpace.store.set('nom', valeur)` (JSON, 256 Ko au plus, nom en lettres, chiffres, `-` et `_`), `OpenSpace.store.watch('nom', (valeur) => …)` pour suivre les autres fenêtres du même mod (renvoie de quoi arrêter). Préfère-le à `localStorage` : celui-ci reste dans un seul navigateur et repart à zéro si l'adresse du mod change.
- `OpenSpace.format` : `number`, `compact` (1,3 k), `money(v, 'USD')`, `percent(0.62)`, `ago(date)`, `duration(minutes)`, `date(date)`.
- `OpenSpace.h(tag, attributs, ...enfants)` : crée un élément.
- `OpenSpace.ready` : une promesse tenue une fois le thème appliqué.
- Pour des données qui changent sans Open Space (un fichier de `data/`, une API), relis-les dans `OpenSpace.onRefresh` et donne un `refresh` à `mod.json`, plutôt qu'un `setInterval` à toi : l'utilisateur garde la main sur le rythme.

## Exemple complet

```html
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="/mod-kit/kit.css">
<script src="/mod-kit/kit.js"></script>

<os-loading id="loading" rows="2" block></os-loading>
<div id="content" hidden>
  <os-stats>
    <os-stat id="today" label="Aujourd'hui"></os-stat>
    <os-stat id="month" label="30 jours"></os-stat>
  </os-stats>
  <os-section title="Par jour"><os-bars id="days" unit="$"></os-bars></os-section>
  <os-section title="Par projet"><os-rows id="projects"></os-rows></os-section>
</div>

<script>
  const { watch, format } = OpenSpace;
  watch('costs', (costs) => {
    if (!costs) return;
    loading.hidden = true;
    content.hidden = false;
    today.setAttribute('value', format.money(costs.today));
    month.setAttribute('value', format.money(costs.total));
    days.data = costs.days.slice(-14).map((day) => ({ label: format.date(day.day, { day: 'numeric' }), value: day.usd }));
    projects.data = costs.projects.slice(0, 5).map((project) => ({ label: project.name, value: project.usd, text: format.money(project.usd) }));
  });
</script>
```
