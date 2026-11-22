# Les secrets : `/secret` et `os-secret`

[English](secrets.md) · [Sommaire du guide](README.fr.md)

Tu peux donner une clé à une session (un token, une clé d'API, un mot de passe) sans que Claude lise jamais sa valeur. Claude ne connaît que le nom de la clé, et s'en sert par la commande `os-secret`.

## Donner une clé

- Tape `/secret` dans la zone de saisie, ou `/secret NOM` pour avoir le nom déjà rempli. `/secrets`, `/key` et `/cle` font la même chose.
- Ou ouvre **Clés** dans le menu de la session.
- Ou laisse la session demander : elle lance `os-secret ask NOM`, et une fenêtre s'ouvre dans Open Space. Tu donnes la valeur ou tu refuses.

Dans la fenêtre des clés, tu peux coller un bloc copié d'un fichier `.env` (des lignes `NOM=valeur`, `export NOM=valeur` aussi). Chaque ligne devient une clé. Les guillemets autour d'une valeur sont retirés, les commentaires et les lignes vides ignorés.

Tu peux aussi coller un fichier `.p8` entier : il est gardé entier et affiché « N lignes collées ».

Dis ensuite à la session quoi en faire : « mets-la dans le .env », « sers-t'en pour te connecter ».

## Où une clé est gardée

Chaque clé collée a une portée, choisie dans la fenêtre (**Cette session** par défaut) :

| Portée | Gardée | Donnée à |
|---|---|---|
| Cette session | En mémoire, 12 heures au plus. Oubliée quand la session s'éteint ou qu'Open Space s'arrête. | Cette session. |
| Ce projet | Dans le coffre. | Les sessions de ce projet. |
| Partout | Dans le coffre. | Toutes les sessions. |

Un projet est le checkout principal du dépôt git où travaille la session (un worktree compte comme son checkout principal), sinon la racine git, sinon le dossier. La correspondance est exacte, jamais par préfixe de chemin. Quand un nom existe à plusieurs portées, la clé de la session passe d'abord, puis celle du projet, puis celle de partout.

Le coffre est le fichier `keys-vault.json` du dossier propre à l'app de bureau (`npm run app:dev` a le sien). Chaque valeur y est chiffrée par ton système (le Trousseau macOS, ton compte Windows, le trousseau Linux) ; les noms, portées, consentements et derniers usages sont en clair. Une valeur qu'on n'arrive pas à déchiffrer compte comme absente, donc elle est redemandée, mais elle reste dans le fichier. Sur macOS, seule l'app signée obtient la clé du Trousseau. Sur Windows et Linux, le chiffrement évite des valeurs en clair sur le disque, mais un programme lancé sous ton compte peut les déchiffrer.

Sans l'app de bureau (`npm start`, le serveur seul), ou sur Linux sans trousseau, il n'y a pas de coffre : les clés données aux sessions restent en mémoire, et **Réglages › Clés** le dit. Si l'app a déjà mis les clés des déclencheurs et des mods dans son coffre, un serveur lancé hors de l'app ne peut pas les lire : Réglages › Clés, le déclencheur et le mod disent qu'elles sont hors d'atteinte, et un run d'un déclencheur dont les clés y sont ne part pas (lance Open Space depuis son app). Ce qu'on ressaisit entre-temps ne remplace jamais une valeur du coffre.

## Le consentement

Une clé enregistrée n'est donnée sans rien demander qu'à une session dont le projet est autorisé pour elle. Tu l'autorises avec **Toujours pour ce projet**, ou en enregistrant la clé depuis une session de ce projet. Sinon la demande de la session affiche une carte, « X veut N clés enregistrées », avec **Toujours pour ce projet**, **Cette fois** et **Refuser**.

Une session d'un dossier que tu n'as pas approuvé ne reçoit jamais de clé enregistrée sans la carte, et la carte n'a pas **Toujours**. Les runs des déclencheurs n'accèdent pas au coffre par portée : ils ne reçoivent que les clés de leur déclencheur.

Quand une demande mêle des clés enregistrées et des clés à coller, les enregistrées apparaissent en pastilles que tu peux décocher (✕ en retient une), et chaque clé à coller a sa ligne avec sa portée.

Une clé donnée par Telegram vaut pour la session seulement. Une demande qui ne porte que sur des clés enregistrées se répond dans Open Space.

## Les règles

- Un nom est un nom de variable d'environnement valide : lettres, chiffres et `_`, sans chiffre au début, 100 caractères au plus.
- Une valeur fait 20 000 caractères au plus. Une session garde 50 clés au plus.
- Les clés ne sont jamais écrites dans les journaux ni envoyées à la page. Seules les copies chiffrées du coffre arrivent sur le disque.
- La fenêtre des clés liste les clés de la session, en deux listes : « Données à cette session » et « Héritées (projet ou partout) », avec un lien vers **Réglages › Clés**. Tu peux en oublier une, ou toutes.

## Réglages › Clés

Toutes les clés enregistrées, chacune avec son nom, une pastille de portée (Partout, le nom du projet, du déclencheur ou du mod), où elle sert et son dernier usage (en ambre après 30 jours). Tu peux remplacer ou supprimer une clé. Filtres : Toutes, Partout, Ce projet (le projet de la session affichée). **Ajouter une clé** en enregistre une pour partout ou pour un projet. Une ligne en bas dit comment les clés sont gardées. Sur une fenêtre étroite, la liste devient des fiches.

## `os-secret`

Open Space met `os-secret` en tête du `PATH` de chaque session. Claude le lance comme n'importe quelle commande :

| Commande | Ce qu'elle fait |
|---|---|
| `os-secret ask NOM... [--why "à quoi elle sert"]` | Prend les clés enregistrées, ou te les demande (une fenêtre dans Open Space), et dit d'où vient chacune (`saved` ou `pasted`). Attend jusqu'à 10 minutes. |
| `os-secret ask NOM --again --why "..."` | La clé reçue ne marche plus : la carte propose de la remplacer, à sa portée actuelle. |
| `os-secret list` | Les noms des clés données, jamais leurs valeurs. |
| `os-secret env NOM [FICHIER] [--as VAR]` | Écrit la clé dans un fichier `.env` (`.env` du dossier courant par défaut), en remplaçant sa ligne. Le fichier doit être dans un dossier où les sessions peuvent travailler. Dans un dépôt git, elle refuse un fichier que git n'ignore pas. |
| `os-secret run NOM... -- COMMANDE...` | Lance une commande avec les clés en variables d'environnement. Leurs valeurs sont masquées dans sa sortie, une valeur sur plusieurs lignes aussi (chaque ligne de 8 caractères ou plus, sauf les lignes `-----BEGIN/END-----`). |
| `os-secret file NOM -- COMMANDE...` | Écrit la clé dans un fichier temporaire (600), met son chemin dans `$NOM_FILE`, lance la commande, puis efface le fichier, même en cas d'échec ou de Ctrl-C. Sortie masquée. |
| `os-secret cookie NOM URL [--as COOKIE]` | Pose la clé comme cookie pour cette URL dans le navigateur Open Space de la session. |
| `os-secret auth NOM URL [--user UTILISATEUR]` | Connecte le navigateur de la session à ce site en authentification basique. La clé est `utilisateur:motdepasse`, ou le mot de passe seul avec `--user`. |
| `os-secret type NOM [URL] [--any-field]` | Tape la clé dans le champ mot de passe qui a le focus, dans l'onglet ouvert sur ce site. L'URL est nécessaire avec plusieurs onglets. `--any-field` accepte un autre champ. |
| `os-secret forget NOM` | Oublie la copie de la session d'une clé. Une clé enregistrée reste dans le coffre. |

Dans un run de déclencheur que personne ne suit, `ask` échoue tout de suite, sauf si un bot de messagerie suit ce run (il attend comme avant).

`cookie` et `type` acceptent `--shared` pour agir dans le navigateur partagé plutôt que dans celui de la session. `auth` refuse `--shared` : le navigateur partagé garderait la connexion après la session.

## Les clés d'un déclencheur

Un déclencheur peut avoir ses propres clés, données à chaque run à son lancement. Elles vont dans le coffre, avec la portée « ce déclencheur ». Sans coffre, elles sont enregistrées dans `trigger-keys.json` sous `OFFICE_DIR`, lisible par ton compte seulement. Une fois enregistrées, elles ne peuvent plus être relues, seulement remplacées : préfère des clés aux droits limités. Voir [Automates](automations.fr.md).

## Les variables des mods

Les variables d'un mod (une clé d'API dont sa page a besoin) ne sont pas des clés de session. Tu les remplis dans les réglages du mod, et et seule sa page les reçoit. Elles vont dans le coffre, avec la portée « ce mod » (sans coffre, dans `mods-env.json`). Au démarrage, un ancien `trigger-keys.json` ou `mods-env.json` est migré dans le coffre, puis supprimé une fois l'écriture réussie. Voir [Mods](mods.fr.md).
