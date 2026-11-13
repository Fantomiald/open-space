# Les mods et les dashboards

[English](mods.md) · [Sommaire du guide](README.fr.md)

Un mod est une petite fenêtre flottante d'Open Space, écrite par un de tes agents : tes coûts Claude de la semaine, un minuteur pomodoro, les sessions qui t'attendent. Un dashboard range plusieurs mods sur une grille.

## Créer un mod

1. Clique sur le bouton **Mods**.
2. Sous **Nouveau mod**, décris le mod que tu veux, puis **Créer**.
3. Un agent l'écrit dans une session. Pendant qu'il travaille, la fenêtre affiche « En fabrication… » et **Voir la session** ouvre cette session. La fenêtre se remplit dès que l'agent a fini.

Un agent peut aussi créer un mod par le [serveur MCP](mcp.fr.md) (`create_mod`).

## Gérer un mod

Dans le panneau des mods, chaque mod a :

- **Modifier** : rouvre la session qui l'écrit, pour demander un changement.
- **Réglages** : son nom, sa description, son icône, son rafraîchissement tout seul, et ses variables d'environnement.
- **Supprimer** : met son dossier à la corbeille, après **Confirmer**.

La fenêtre d'un mod a un bouton ↻. Il recharge la page, ou, quand le mod est lié à un déclencheur, relance ce déclencheur puis recharge. Le rafraîchissement tout seul (jamais, ou toutes les 1, 5, 15, 30 ou 60 minutes) ne fait que recharger, et seulement tant que la fenêtre est ouverte et dépliée.

Quand un fichier du dossier `data/` d'un mod change alors que sa fenêtre est fermée, Open Space affiche un « ! » sur le bouton Mods.

## Les variables

La page d'un mod peut avoir besoin d'une clé ou d'un réglage, une clé d'API par exemple. Tu les remplis dans les **Réglages** du mod, sous **Variables d'environnement**. Open Space les garde dans `mods-env.json` sous `OFFICE_DIR`, hors du dossier du mod : l'agent qui écrit le mod n'en voit jamais la valeur, et seule la page du mod les reçoit.

## Un mod qui lance un déclencheur

Un mod peut nommer un de tes déclencheurs. Sa page demande alors à le lancer, et Open Space te le demande à chaque fois (« Lancer … ? ») avant de le faire.

## Les dashboards

Un dashboard est une grille de tes mods. Crée-en un avec **Nouveau dashboard**, puis **Ajouter un mod**. Glisse un mod par son titre pour le déplacer, tire son coin pour le redimensionner. **Retirer** enlève un mod du dashboard. Supprimer un dashboard garde ses mods.

## Où vivent les mods

Chaque mod est un dossier sous `OFFICE_DIR/mods`, avec un `mod.json` et un `index.html`. Open Space sert les pages sur un port à elles (`OFFICE_MODS_PORT`, voir [Réglages](settings.fr.md)), chaque mod à sa propre adresse `<id>.localhost`.

## Écrire un mod à la main

Les règles que suit un agent pour écrire un mod sont dans [`public/mod-kit/GUIDE.md`](../../public/mod-kit/GUIDE.md). Open Space copie ce fichier en `CLAUDE.md` du dossier des mods : chaque session qui écrit un mod le lit.
