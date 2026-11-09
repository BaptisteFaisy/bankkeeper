# Tidewater — API du relais

> Surface **construite du lot 0**, servie par `server/relay.py` (stdlib
> only, port 8785). L'UI appelle `/api` en same-origin ; en dev, Vite
> relaie vers le port 8785. Tout écart passe par `DECISIONS.md`.

## Authentification

`POST /api/auth` — `{email, pseudo}` : auth sociale, sans wallet ni
seed ni gas. Répond `{ok, token, pseudo}`. Première étape du parcours
de référence.

## État et monde

- `GET /api/health` — `{ok, mode, sim}` : le relais vit, le binaire
  `sim` est présent et exécutable.
- `GET /api/state` — vue joueur complète : semaine, jour, marée, or,
  valeur nette, quota restant, licences, zones (prise par sortie,
  tendance, bancs — jamais le stock réel, TW-C1-01), bateaux, capitaines,
  acheteurs, criée (dernier marteau, pas de lot en direct : l'horloge
  adjuge chaque débarquement aussitôt), débarquements du jour et lignes
  de raisonnement brutes.
- `GET /api/graph` — `{history, stocks, capacity}` : prises et prix du
  hareng par jour, stocks courants (TW-J-02).
- `GET /api/judges` — `{seed, day, week, actors, gold_total, ext_in,
  ext_out, licence_pool, proposal}` : or et licences par acteur, total
  de l'or, cumul des flux extérieurs, motion en attente (TW-J-03).

## Actions du joueur

- `POST /api/assign` — `{boat, zone | quay, mesh?}` : affecte un bateau
  à une zone ou le laisse à quai (TW-N-11). Le filet ne se change qu'à
  quai (TW-C2-02) ; sans `mesh`, le bateau garde son filet.
- `POST /api/survey` — `{zone}` : relevé payant, 80 or, estimation à
  10 % près valable une semaine (TW-C1-03).
- `POST /api/licence` — `{action: buy | sell, ref}` : échange de
  licences (token 3) au prix du jour, 70 caisses par semaine chacune
  (TW-N-20, TW-C4-04). `ref` vaut `pool` (le bassin des licences
  saisies, soldé par la banque) ou un nom de capitaine (`okoro`, …)
  pour un échange direct.
- `POST /api/debt` — `{action: buy | forbear | seize, ref}` : `ref` est
  un numéro de créance (token 100+). Rachat à son porteur, report
  (remise des arriérés à zéro) ou saisie anticipée du bateau dès une
  traite manquée (TW-C3-05).
- `POST /api/council` — `{action: propose | vote, rule, indemnity?}` :
  `propose` enregistre une motion `rule` (`quota50`,
  `quota50,close:greybank`, `ban-mesh`, combinables par virgules) avec
  une indemnité en or par licence et par semaine, versée aux votants
  pour (TW-C4-03) ; `vote` enregistre le bulletin du joueur (`yes` ou
  `no` — le silence appuie sa propre motion).
- Renflouement (TW-N-52) : uniquement via `sim refloat` en ligne de
  commande au lot 0, pas de route relais.

## Juges

- `POST /api/fastforward` — `{days: 7 | 28, seed}` : joue sans joueur
  sur une copie de l'état (l'état réel n'est jamais modifié) et répond
  `{summary, journal, series, markers}` : résumé (`days_run`, `seed`,
  `history_hash`, `events`), journal des événements, série graphe en
  colonnes (`days`, `stocks`, `herring_price`, `gold_total`), marqueurs
  de faillites et saisies (TW-J-01).

## Conventions

- JSON partout ; erreurs en enveloppes stables `{error, message}`.
  Un refus de règle du `sim` remonte en HTTP 409 avec le même corps.
- Lignes de raisonnement brutes pour chaque prix, chaque décision de
  capitaine et chaque vote (TW-UI-05).
- Les tendances à la baisse s'écrivent en toutes lettres (`falling`) et
  changent de couleur ; elles ne clignotent pas (TW-UI-06).
- Zéro erreur console et zéro requête en échec sur le parcours de
  référence (vérifié par `tests/e2e_tidewater.py`).
