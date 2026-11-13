# Les secrets : `/secret` et `os-secret`

[English](secrets.md) · [Sommaire du guide](README.fr.md)

Tu peux donner une clé à une session (un token, une clé d'API, un mot de passe) sans que Claude lise jamais sa valeur. Claude ne connaît que le nom de la clé, et s'en sert par la commande `os-secret`.

## Donner une clé

- Tape `/secret` dans la zone de saisie, ou `/secret NOM` pour avoir le nom déjà rempli. `/secrets`, `/key` et `/cle` font la même chose.
- Ou ouvre **Clés** dans le menu de la session.
- Ou laisse la session demander : elle lance `os-secret ask NOM`, et une fenêtre s'ouvre dans Open Space. Tu donnes la valeur ou tu refuses.

Dans la fenêtre des clés, tu peux coller un bloc copié d'un fichier `.env` (des lignes `NOM=valeur`, `export NOM=valeur` aussi). Chaque ligne devient une clé. Les guillemets autour d'une valeur sont retirés, les commentaires et les lignes vides ignorés.

Dis ensuite à la session quoi en faire : « mets-la dans le .env », « sers-t'en pour te connecter ».

## Les règles

- Un nom est un nom de variable d'environnement valide : lettres, chiffres et `_`, sans chiffre au début, 100 caractères au plus.
- Une valeur fait 20 000 caractères au plus. Une session garde 50 clés au plus.
- Les clés restent en mémoire seulement, jamais écrites sur le disque, dans les journaux ni envoyées à la page.
- Une clé est gardée 12 heures au plus après avoir été donnée. Elle part aussi quand tu éteins la session ou qu'Open Space s'arrête.
- La fenêtre des clés liste les clés déjà données. Tu peux en oublier une, ou toutes.

## `os-secret`

Open Space met `os-secret` en tête du `PATH` de chaque session. Claude le lance comme n'importe quelle commande :

| Commande | Ce qu'elle fait |
|---|---|
| `os-secret ask NOM... [--why "à quoi elle sert"]` | Te demande des clés (une fenêtre dans Open Space). Attend jusqu'à 10 minutes. |
| `os-secret list` | Les noms des clés données, jamais leurs valeurs. |
| `os-secret env NOM [FICHIER] [--as VAR]` | Écrit la clé dans un fichier `.env` (`.env` du dossier courant par défaut), en remplaçant sa ligne. Le fichier doit être dans un dossier où les sessions peuvent travailler. |
| `os-secret run NOM... -- COMMANDE...` | Lance une commande avec les clés en variables d'environnement. Leurs valeurs sont masquées dans sa sortie. |
| `os-secret cookie NOM URL [--as COOKIE]` | Pose la clé comme cookie pour cette URL dans le navigateur Open Space de la session. |
| `os-secret auth NOM URL [--user UTILISATEUR]` | Connecte le navigateur de la session à ce site en authentification basique. La clé est `utilisateur:motdepasse`, ou le mot de passe seul avec `--user`. |
| `os-secret type NOM [URL] [--any-field]` | Tape la clé dans le champ mot de passe qui a le focus, dans l'onglet ouvert sur ce site. L'URL est nécessaire avec plusieurs onglets. `--any-field` accepte un autre champ. |
| `os-secret forget NOM` | Oublie une clé. |

`cookie` et `type` acceptent `--shared` pour agir dans le navigateur partagé plutôt que dans celui de la session. `auth` refuse `--shared` : le navigateur partagé garderait la connexion après la session.

## Les clés d'un déclencheur

Un déclencheur peut avoir ses propres clés, données à chaque run à son lancement. Elles sont enregistrées dans `trigger-keys.json` sous `OFFICE_DIR`, lisible par ton compte seulement. Une fois enregistrées, elles ne peuvent plus être relues, seulement remplacées : préfère des clés aux droits limités. Voir [Automates](automations.fr.md).

## Les variables des mods

Les variables d'un mod (une clé d'API dont sa page a besoin) ne sont pas des clés de session. Tu les remplis dans les réglages du mod, et seule sa page les reçoit. Voir [Mods](mods.fr.md).
