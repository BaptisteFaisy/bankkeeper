# Tidewater — La criée commune

> Service `market/`, protocole et point d'accroche moteur. Écrit le
> 2026-11-10, branche `feat/market`. **Rien n'est encore branché sur le jeu** :
> ce document décrit ce qui existe (le service, ses tests, la démo) et ce
> qu'il faudrait pour que le moteur s'y alimente. Aucun fichier de
> `crates/`, `web/`, `server/` ou `contracts/` n'a été touché.

## Le problème

Aujourd'hui la criée est **locale** : chaque lot descend l'horloge néerlandaise
et le premier marchand dont la limite est atteinte l'emporte
(`crates/rules/src/auction.rs`, TW-N-30). Un joueur qui inonde le port ne
baisse donc que *ses* prix — au pire il sature son propre stock, et la
conséquence reste chez lui.

Dans la criée commune, le prix d'une fenêtre est calculé sur le **tonnage
total** de tous les joueurs et s'applique à **tout le monde**. Inonder la
criée fait baisser le prix payé à chacun : l'externalité devient humaine, et
c'est le sujet du jeu.

## La formule

On ne réécrit pas une courbe : on réutilise **la famille du marchand**
(`crates/rules/src/merchant.rs`, TW-N-31), en remplaçant la boutique par le
tonnage de la fenêtre.

```text
Rust (marchand)                        market/ (criée commune)
factor = 1 + gain  × (target − stock) / target   →  facteur = 1 + élasticité × (profondeur − tonnage) / profondeur
limit  = base × factor                            →  prix     = mémoire × facteur
floor  = base × floor_bps / 10 000                →  plancher = base × MARKET_FLOOR_BPS / 10 000
```

| Symbole | Marchand | Criée commune | Défaut |
|---|---|---|---|
| `stock` | caisses chez l'acheteur | caisses débarquées par tous dans la fenêtre (plafonnées par joueur) | — |
| `target` | cible de stock de l'acheteur | `MARKET_DEPTH_CRATES` | `600` |
| `gain` | `stock_gain_bps` | `MARKET_ELASTICITY_BPS` | `5000` (50 %) |
| `base` | prix de base de l'espèce | idem, ou **mémoire** du marché | hareng `400`, morue `1200` |
| `floor_bps` | `Config::floor_bps` | `MARKET_FLOOR_BPS` | `2500` (25 %) |

Le haut est borné par le départ de l'horloge néerlandaise (`base × 200 %`,
`clock_herring = 800`), le bas par le plancher du port (TW-N-33). Le facteur
s'annule quand `tonnage ≥ 3 × profondeur` : la criée ne paie jamais moins que
le plancher, elle ne paie pas zéro.

Tout est en **centigold entiers**, troncature vers zéro, exactement comme
`merchant::stock_factor_bps` — même arithmétique, même résultat sur toute
machine.

### Deux exemples chiffrés (valeurs exactes, testées)

1. **Calme** — hareng, mémoire `4.00`, 270 caisses.
   `facteur = 1 + 0.50 × (600 − 270) / 600 = 1.275` → `4.00 × 1.275 = 5.10`.
   A (150 caisses) touche `765.00`, C (120) touche `612.00`.
2. **Inondée** — hareng, mémoire `5.10` (fenêtre précédente close), 1 170
   caisses (A 150, C 120, B 900).
   `facteur = 1 + 0.50 × (600 − 1 170) / 600 = 0.525` → `5.10 × 0.525 =
   2.6775` → **`2.67`**. A touche `400.50` au lieu de `975.00`, sans avoir
   changé sa pêche : `-574.50` pour lui, `-459.60` pour C.

## Le protocole

Service Node ESM, sans dépendance (`node:http`, `node:crypto`, `node:fs`),
démarré par `node market/server.mjs` (`MARKET_PORT`, défaut 8790).

| Route | Corps / requête | Réponse |
|---|---|---|
| `POST /land` | `{player, species, crates, price_floor?, signature?}` | `201` : `{window, species, crates_total, crates_counted, over_cap, price, projected_payout, closes_at}` |
| `GET /price?species=herring` | — | `{window, species, crates_total, crates_counted, price, players[], closes_at, closes_in_secs, …}` |
| `GET /window` | — | `{current: {id, opens_at, closes_at, species{}}, previous: <fenêtre close figée>, memory{}}` |
| `GET /health` | — | `{ok, window_secs, signatures}` |

Erreurs : `400` (`bad_player`, `unknown_species`, `bad_crates`,
`bad_price_floor`), `409 price_below_floor` (le prix commun est sous le
plancher demandé : le lot est perdu, TW-N-33), `401 bad_signature`.

- `price_floor` est un **garde-fou au dépôt**, pas une garantie : le prix est
  collectif et figé à la clôture, donc un joueur peut être payé sous son
  plancher si d'autres inondent après lui. La fenêtre close le dit
  (`paid_below_floor`), sans le corriger.
- `signature` est une HMAC-SHA256 de `player|species|crates|price_floor|window`,
  vérifiée **si et seulement si** l'hôte a posé `MARKET_SECRET`. Sans secret,
  le reçu dit `signature: "none"` au lieu de faire semblant.
- Un joueur peut débarquer plusieurs fois dans la même fenêtre : les caisses
  s'additionnent, le plafond s'applique au total.

## Le plafond par joueur

`MARKET_CAP_CRATES` (défaut `2000`, par joueur, par espèce, par fenêtre).

Au-delà, le surplus est **accepté** mais payé au **prix plancher**, et il
**ne pèse plus sur le prix commun** : `crates_counted = min(caisses, plafond)`
est seul utilisé dans `f(tonnage)`, `crates_total` reste le tonnage réel.
C'est la parade au « un joueur ruine la journée de tout le monde » : le
surdébarquement est absorbé hors criée, au plancher, sans déplacer la courbe.

Exemple testé (`capCrates: 500`, 900 caisses d'un seul joueur) : tonnage
compté 500, 400 caisses au plancher, prix `433` au lieu de `300` si les 900
caisses avaient pesé — paiement `256 500` = `500 × 433 + 400 × 100`.

## Fenêtres, mémoire, redémarrage

- Fenêtre de **10 minutes** (`MARKET_WINDOW_SECS`), `id = floor(temps / durée)`.
- Le prix est **figé à la clôture** et rangé dans `previous` (24 fenêtres
  d'historique, soit 4 h).
- La fenêtre suivante part du **prix figé** précédent (`memory`), pas du prix
  de base : une matinée inondée se paie encore après.
- Une fenêtre **sans aucun débarquement ne produit pas de prix** et ne touche
  pas la mémoire : le marché n'a pas ouvert. C'est aussi ce qui évite de
  faire dériver le prix pendant une nuit d'inactivité.
- L'état est un fichier JSON unique (`MARKET_STATE`), écrit **atomiquement**
  (`tmp` + `fsync` + `rename`). Au redémarrage, la fenêtre traversée pendant
  l'arrêt est close à son prix : rien n'est perdu, rien n'est réécrit.
- L'horloge est **injectée** (`createMarket({now})`) : les tests et la démo
  pilotent le temps, aucun test ne dépend de l'heure de la machine.

## Ce qui est on-chain — rien

Aucun contrat, aucune signature de chaîne, aucun frais, aucune écriture :
`contracts/tidewater` n'est pas modifié et le service ne parle à aucun
réseau. Ce qui vit hors chaîne aujourd'hui : l'identité des `player`, la
réception des débarquements, l'état du marché, le calcul du prix.

C'est un choix assumé, et il laisse la porte ouverte : la formule ne dépend
que de données **publiques** (les débarquements de la fenêtre) et d'entiers,
sans flottant ni aléa. Un contrat pourrait donc recalculer le même prix à
partir de la même liste, et un simple hash des débarquements suffirait à
prouver qu'aucun hôte n'a triché sur le total. Rien de tout cela n'est
implémenté.

## Comment le moteur s'y branchera

**État actuel : non, `rules::merchant` n'accepte pas de prix imposé.**
`merchant::limit(base, stock, target, gain_bps)` ne prend que la boutique du
marchand ; `auction::clear(lot, buyers, config)` en dérive la limite et fait
descendre l'horloge. Il n'existe aucune couture pour un prix venu de
l'extérieur.

La fonction à ajouter (décrite, **pas codée**) — dans
`crates/rules/src/merchant.rs`, à côté de `limit` :

```rust
/// Le prix commun de la fenêtre, confronté à la limite de ce marchand.
/// `None` : ce marchand ne prend pas le lot à ce prix (limite trop basse,
/// ou prix sous le plancher du port).
pub fn bid_at(
    market_price: u64, base: u64, stock: u64, target: u64, gain_bps: u64, floor_bps: u64,
) -> Option<u64> {
    let limit = limit(base, stock, target, gain_bps);
    let floor = floor(base, floor_bps);
    (market_price >= floor && market_price <= limit).then_some(market_price)
}
```

et trois retouches, dans l'ordre :

1. **`auction::Lot`** gagne `market_price: Option<u64>` (ou une variante
   `Lot::Shared`). Quand il est `Some`, `clear` ne fait plus descendre
   l'horloge : tous les lots de la fenêtre partent au **même** prix, et le
   premier acheteur en ordre canonique du roster dont `bid_at` rend `Some`
   l'emporte. `None` = comportement actuel, intact.
2. **`sale_reasoning`** gagne une phrase : « prix commun de la fenêtre 2.67,
   limite du marchand 3.60 » — le joueur doit voir les deux nombres, sinon la
   baisse paraît arbitraire.
3. **Le relais** (`server/relay.py`) interroge `GET /price?species=…` **une
   fois par fenêtre**, garde le prix en cache, et l'injecte dans l'état avant
   le tick. Jamais un appel réseau par lot : la simu reste pure et
   déterministe, le prix est une entrée comme une autre.

Côté `web/`, seule la ligne de raisonnement change (un champ de plus dans
l'état). Rien d'autre.

## Ce qui reste fragile

- **Horloge.** La fenêtre vient de `Date.now()` sur l'hôte. Horloge fausse ou
  décalée, et deux joueurs ne voient pas la même fenêtre. En vrai
  multijoueur il faudra un **numéro de fenêtre** émis par l'hôte (et signé),
  pas un calcul sur l'heure locale.
- **Frontière de fenêtre.** Un débarquement à 10 ms de la clôture tombe d'un
  côté ou de l'autre ; il n'y a pas de marge de grâce. Un lot reçu après la
  clôture part dans la fenêtre suivante, au prix suivant, sans recours.
- **Triche côté client.** `player` est une chaîne libre : rien ne prouve que
  le joueur avait ces caisses dans sa cale (pas de rejeu wasm, pas de quota,
  pas de licence vérifiée ici). La signature HMAC, quand elle est active, lie
  bien joueur/espèce/caisses/plancher/fenêtre — mais la clé est partagée par
  tous les clients, donc un client peut signer pour un autre. Il faudrait une
  clé par joueur. Et il n'y a **pas de nonce** : une signature reste
  rejouable pendant sa fenêtre.
- **Un seul écrivain.** Pas de verrou, pas de réplication : deux processus
  sur le même fichier d'état s'écrasent. Le service suppose un seul hôte.
- **Perte bornée.** Si le processus meurt avant le `rename`, le dernier
  `POST /land` est perdu (au plus un lot). Rien de plus.
- **Pas de règlement.** Le service calcule des paiements, il ne détient ni or
  ni caisses : le transfert réel reste à faire côté moteur ou contrat.
- **Profondeur et élasticité sont des choix**, pas des mesures : `600` caisses
  et `50 %` reproduisent l'ordre de grandeur du port (≈ 400 caisses par
  fenêtre à quota plein, 1 400 caisses/semaine) mais demandent un réglage en
  simulation multi-graines avant d'être montrés comme équilibrés.
- **Historique court.** 24 fenêtres = 4 h : au-delà, `GET /window` ne remonte
  plus la précédente si personne n'a débarqué pendant une journée.
