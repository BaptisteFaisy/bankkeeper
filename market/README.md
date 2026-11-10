# market/ — la criée commune

Un prix par espèce et par fenêtre de dix minutes, calculé sur le **tonnage
total** débarqué par tous les joueurs, et payé à **tout le monde**. Inonder la
criée fait baisser le prix de chacun : c'est l'externalité humaine du port.

Zéro dépendance npm : `node:http`, `node:crypto`, `node:fs`. Node ≥ 20.

## Deux commandes

```sh
node market/server.mjs                    # le service, http://localhost:8790
node market/demo_three_players.mjs        # la preuve : trois joueurs, deux fenêtres
```

Et les tests :

```sh
node --test market/test_market.mjs        # 9 tests, horloge injectée
```

## La formule

Même famille que la criée du jeu (`crates/rules/src/merchant.rs`, TW-N-31) :
la boutique du marchand est remplacée par le tonnage de la fenêtre.

```text
facteur   = 1 + élasticité × (profondeur − tonnage) / profondeur     (en bps)
prix      = mémoire × facteur, borné à [base × 25 %, base × 200 %]
paiement  = caisses × prix, plus les caisses au-delà du plafond au prix plancher
```

- `profondeur` = `MARKET_DEPTH_CRATES` (600 caisses) : le tonnage qu'une
  fenêtre absorbe au prix de base.
- `élasticité` = `MARKET_ELASTICITY_BPS` (5 000 = 50 %, le `gain` du jeu).
- `mémoire` = le prix de la dernière fenêtre close, ou le prix de base du
  port au démarrage (hareng 4.00, morue 12.00 l'or).
- Tout est en **centigold entiers**, troncature vers zéro comme le Rust : à
  entrées égales, au centigold près, même prix.

Deux exemples chiffrés, pris dans le code (`market/price.mjs`, valeurs exactes
vérifiées par les tests) :

1. **Fenêtre calme.** Hareng, mémoire 4.00, 270 caisses débarquées.
   `facteur = 1 + 0.50 × (600 − 270) / 600 = 1.275` →
   `4.00 × 1.275 = 5.10`. Les 270 caisses sont payées **5.10** l'or,
   soit 765.00 pour un joueur à 150 caisses.
2. **Fenêtre inondée.** Hareng, mémoire 5.10 (prix de la fenêtre précédente),
   1 170 caisses (A 150, C 120, B 900).
   `facteur = 1 + 0.50 × (600 − 1 170) / 600 = 0.525` →
   `5.10 × 0.525 = 2.6775` → **2.67**. A, qui n'a pas changé sa pêche, passe
   de 975.00 à 400.50.

À partir de `3 × profondeur` (1 800 caisses), le facteur tombe à zéro et le
prix reste au plancher (`base × 25 %`, TW-N-33) : le hareng ne descend jamais
sous 1.00.

## L'API

| Route | Réponse |
|---|---|
| `POST /land` `{player, species, crates, price_floor?, signature?}` | `201` reçu de débarquement : fenêtre, totaux, prix courant, `projected_payout` |
| `GET /price?species=herring` | `{window, species, crates_total, crates_counted, price, players: [{player, crates}], closes_at, …}` |
| `GET /window` | la fenêtre courante (par espèce) et la précédente, close et figée |
| `GET /health` | `{ok, window_secs, signatures}` |

Codes : `400` entrée invalide, `409 price_below_floor` quand le prix commun
passe sous le plancher demandé par le joueur (le lot est perdu, TW-N-33),
`401 bad_signature` si l'hôte a configuré un secret.

## Réglages

| Variable | Défaut | Rôle |
|---|---|---|
| `MARKET_WINDOW_SECS` | `600` | longueur de la fenêtre |
| `MARKET_CAP_CRATES` | `2000` | plafond par joueur, par espèce et par fenêtre |
| `MARKET_DEPTH_CRATES` | `600` | tonnage de référence (facteur 1.00) |
| `MARKET_ELASTICITY_BPS` | `5000` | pente du prix par rapport au tonnage |
| `MARKET_FLOOR_BPS` | `2500` | plancher, en part du prix de base |
| `MARKET_CEILING_BPS` | `20000` | plafond, en part du prix de base |
| `MARKET_STATE` | `market/var/state.json` | fichier d'état |
| `MARKET_PORT` | `8790` | port d'écoute |
| `MARKET_SECRET` | — | active la vérification des signatures HMAC |

## Le plafond, la mémoire, le redémarrage

- **Plafond** : au-delà de `MARKET_CAP_CRATES` par joueur et par fenêtre, le
  surplus est **accepté** mais payé au **prix plancher**, et il ne pèse plus
  sur le prix commun (`crates_counted` ≠ `crates_total`). Un seul joueur ne
  peut donc pas ruiner la fenêtre de tous les autres : son surdébarquement
  ne déplace plus la courbe.
- **Prix figé** : à la clôture, le prix de la fenêtre est écrit dans
  l'historique (`GET /window` → `previous`) et ne bouge plus.
- **Mémoire** : la fenêtre suivante part de ce prix figé, pas du prix de
  base. Une fenêtre vide ne crée pas de prix (le marché n'a pas ouvert) et
  ne touche pas la mémoire.
- **Redémarrage** : l'état (fenêtre courante, débarquements, mémoire,
  24 dernières fenêtres closes) vit dans un seul fichier JSON, écrit
  atomiquement (`tmp` + `fsync` + `rename`). Un `Ctrl-C` entre deux
  débarquements ne perd rien ; la fenêtre traversée pendant l'arrêt est
  close au redémarrage, à son prix.
