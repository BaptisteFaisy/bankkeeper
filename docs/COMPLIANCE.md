# Conformité — track *Games With Real Economies* (id: `games`)

> Écrit le **10 novembre 2026 à 21:30 (Europe/Paris)** par b, sur `main` =
> **`11f7a0d`** (PR #68, moteur 2D). Ce document est la grille que nous
> soumettons : il dit **ce qui est fait, ce qui est démontré, ce qui manque**.
>
> **Règle de rédaction** : une ligne n'est écrite que si la preuve a été
> rejouée par l'auteur de ce document. Chaque preuve est un fichier, une
> commande ou une URL. Quand la preuve n'a pas pu être produite dans le
> temps imparti, la ligne dit « à vérifier » — jamais une estimation.
>
> **Barème** : ✅ tenu et prouvé · 🟡 tenu mais incomplet (l'exigence
> n'est pas entièrement couverte) · ❌ non tenu.

## Comment tout rejouer (30 secondes)

```sh
git clone https://github.com/BaptisteFaisy/bankkeeper.git && cd bankkeeper
cargo test --workspace                      # 236 tests, 0 échec (11f7a0d)
python3 tests/ci_structural.py              # 136 fichiers < 500 lignes, fn < 50
cd web && npm ci && npm run build:offline   # moteur wasm + front hors-ligne
python3 tests/e2e_offline.py                # parcours de référence, 0 erreur console
```

Le jeu jouable est public : **<https://tidewater-play.vercel.app>**.
Les empreintes du déploiement sont dans [`docs/deployments.md`](deployments.md),
la page de preuves publique est **<https://tidewater-play.vercel.app/proofs.html>**.

## 1. Le track, exigence par exigence

### 1.1 « Un jeu de ville-marché » — le sujet

| Ce que le track demande | Ce que Bankkeeper fait | État | Preuve vérifiable | Ce qui manque |
|---|---|---|---|---|
| Un jeu où des marchands sont des agents | Un **port de pêche** : mêmes mécaniques de marché, autre fiction. Le joueur est capitaine, pas marchand | ✅ | `crates/rules/src/merchant.rs` (formule unique), `crates/rules/src/auction.rs` (criée) ; 62 tests dans `crates/rules` | — |
| Chaque marchand a un portefeuille et un inventaire | `Fishmonger`, `Cannery`, `The Gull` : or, stock et cible propres (`Config::buyer_targets`, `crates/rules/src/config.rs:170`) | ✅ | `crates/rules/src/state.rs` (`Harbour.gold`, acheteurs) ; test `crates/rules/src/merchant.rs` | — |
| Le prix dépend du stock et de la demande récente | `stock_factor_bps(stock, target, gain)` → `limit(base, stock, target)` ; le stock monte après l'achat, la limite baisse (TW-N-32) | ✅ | `crates/rules/src/merchant.rs:32-47`, `crates/rules/src/auction.rs:56-61` | — |
| Inonder le marché fait chuter le prix | Exemple chiffré du brief §4.4 : 180 caisses pour une cible de 150 → facteur 0,90 → limite 3,6 ; après l'achat, 3,4 | ✅ | `crates/rules/src/merchant.rs:76` (`a_flooded_merchant_pays_less`) ; `crates/sim/tests/lot0_core.rs:95` (`assert_eq!(rules::format_price(after), "3.4")`) | — |
| Un marchand ruiné ferme, jusqu'à réinvestissement | Or ≤ 0 → `Closed`, il n'enchérit plus (TW-N-51) ; le joueur peut **renflouer** et prendre une part (TW-N-52) | ✅ | `crates/rules/src/bankruptcy.rs:13-60` ; `crates/sim/src/main.rs:182` (`sim refloat`) | Le **bouton** de renflouement n'est pas câblé dans le client web : la commande existe, l'UI ne l'expose pas encore |

**Pourquoi un port et pas une ville** : c'est un choix de fiction, pas un
contournement. Le banc de poisson n'appartient à personne, ce qui rend la
tragédie des communs lisible sans une ligne d'explication. Décision datée
dans [`docs/DECISIONS.md`](DECISIONS.md).

### 1.2 « Les objets sont des NEP-245 multi-tokens, un seul contrat pour tous les types »

**État : 🟡 — le contrat est écrit, compilé, testé ; il n'est pas déployé et le jeu joué ne l'utilise pas.**

| Attendu | Réel | Preuve vérifiable |
|---|---|---|
| Un seul contrat pour or, poissons, licences, actes de bateau, notes de dette, parts | `contracts/tidewater/` — 37 points d'entrée | `cargo near build non-reproducible-wasm` : **419 648 o**, sha256 `48ae95ee…689b`, ABI embarquée (`target/near/tidewater/tidewater_abi.zst`) ; `contracts/tidewater/src/nep245.rs` |
| Le jeu manipule les tokens | **Non.** Le navigateur tourne sur le moteur Rust en wasm : stocks, criée et NPC sont hors chaîne | `crates/wasm/src/lib.rs` (le pont wasm n'appelle aucune chaîne) ; `docs/ONCHAIN.md` le dit noir sur blanc |
| Le contrat est sur le testnet | **Non.** Le faucet public répond `429` | Mesuré le 10/11 à 20:19 UTC : `POST https://helper.testnet.near.org/account` → **HTTP 429**, `x-ratelimit-limit: 10`, `x-ratelimit-remaining: 0`, `retry-after: 22130`, réouverture à **2026-11-11 02:27:52 UTC** (03:27 Paris) |
| Un rejeu on-chain existe | Les scripts sont là, ils n'ont jamais tourné | `scripts/testnet/{testnet-lib,deploy,e2e}.mjs` ; `docs/deployments.md` § « Transactions du scénario » : *« Aucun rejeu enregistré »* |

**Ce qui manque, nommément** : (1) le déploiement testnet — bloqué par le
faucet, pas par le code ; (2) le branchement du jeu sur les tokens ;
(3) `docs/deployments.md` annonce encore « 412 350 octets » alors que le
build vérifié aujourd'hui fait **419 648 octets** (le contrat a changé depuis
le 10/11 matin, commit `7b2c542`) — **à corriger dans `docs/deployments.md`** ;
(4) 6 défauts majeurs du contrat sont encore ouverts (droits de l'acte de
bateau, note de dette cessible, poids de vote figé, indemnités aux bons
votants, plafond de 8 licences, dépôt de storage). Le détail un par un est
dans la branche d'audit (`docs/AUDIT-CONTRACT.md`, encore non mergée).

### 1.3 « Connexion sociale ou email, sans phrase de récupération, sans popup de wallet, sans demande de gas »

**État : 🟡 — l'expérience est conforme ; l'authentification ne l'est pas.**

| Attendu | Réal | Preuve vérifiable |
|---|---|---|
| Pas de wallet, pas d'extension, pas de phrase | Un champ email + un pseudo, rien d'autre | `web/src/components/Auth.tsx` ; testé au navigateur sur le site public le 10/11 : le formulaire ne demande qu'un email et un nom |
| Pas de demande de gas | Rien n'est appelé on-chain dans le jeu joué, donc aucun gas demandé | `docs/ONCHAIN.md` ; parcours headless : **0 appel `/api/`** (`tests/e2e_offline.py`) |
| L'identité est réelle | **Non.** L'email est une étiquette : `/api/auth` répond `{ok:true, token:"local"}` | `crates/wasm/src/lib.rs:267` ; `web/src/session.ts` |

**Ce qui manque** : une identité qui signe sans que le joueur la voie —
**FastAuth** (email → clé en enclave) ou un **relayeur sponsor** qui détient
la clé du compte et paie le gas. Le relayeur est déjà écrit dans un dépôt
voisin (`~/mandat/relayer`) et se transpose ; cela dépend du déploiement
testnet. Délai : **à vérifier** après le premier déploiement.

### 1.4 « Les règles de prix des marchands dans un seul fichier lisible, et le raisonnement d'un marchand en infobulle »

**État : ✅.**

| Attendu | Réal | Preuve vérifiable |
|---|---|---|
| Un seul fichier de règles de prix | `crates/rules/src/merchant.rs` (74 lignes) : `stock_factor_bps`, `limit`, `floor`, `reasoning`. Le moteur (`auction.rs`) et le contrat (`contracts/tidewater/src/game.rs`) appellent le **même** module ; aucune copie | `crates/rules/src/merchant.rs` ; `crates/rules/src/auction.rs:53-61` ; `contracts/tidewater/src/game.rs:37-42` |
| Infobulle de raisonnement par marchand | Chaque acheteur de la criée porte un « why » (survol **et** focus clavier) : `Fishmonger: limit 6.0 = base 4.0 x 1.50 — store 0 against a target of 60.` | `web/src/components/AuctionPanel.tsx:60-68` (balise `role="tooltip"` + `tip-mark`) ; testé au navigateur sur le site public le 10/11 : infobulle présente sur les trois marchands, 0 erreur console |

### 1.5 « Un mode fast-forward qui simule une semaine de commerce en une minute »

**État : ✅.**

| Attendu | Réal | Preuve vérifiable |
|---|---|---|
| 7 jours sans joueur, en une minute | `sim ff --days 7` : **3 ms** mesurés sur le binaire de debug ; `sim ff --days 28` : **5 ms** | Commandes réellement lancées : `sim init --seed 7 --out s.json && sim ff --days 7 --state s.json` → `{"days_run":7,"seed":7,"history_hash":"18199874787840155475"}` ; 28 j → `history_hash "13271621533040960709"` |
| Le même panneau dans le jeu | Boutons `Fast-forward 7 days` / `Fast-forward 28 days` dans le panneau `Judges bench`, puis graphe des stocks réels, du prix du hareng et des faillites | `web/src/components/JudgesPanel.tsx:176-190` ; vérifié au navigateur sur le site public le 10/11 : `Seed 839689206 · 7 days · 0 event(s)`, signature `3455655248798445433` |
| Rejouable au bit près | Même graine → même `history_hash`, prouvé par test | `crates/sim/tests/seed_variety.rs:39` (`same_seed_replays_the_same_season`) ; `crates/sim/src/fastforward.rs:192` |

### 1.6 « La boucle de jeu sur papier d'abord » — l'exigence de méthode

**État : ✅.**

| Attendu | Réal | Preuve vérifiable |
|---|---|---|
| La boucle est écrite avant le code, aux trois échelles | `docs/GAME-LOOP.md` § « Rythmes » : 30 s / 5 min / session | `docs/GAME-LOOP.md` |
| 30 s par lot, 5 min par journée, une session | `Go live` → 1 lot / 30 s ; 10 bateaux × 1 sortie = 10 lots = **5 min** par jour ; le fast-forward des juges est hors horloge | `crates/rules/src/config.rs:201` (`seconds_per_lot: 30`) ; `crates/wasm/src/lib.rs:29` (`DEMO_TRIPS = 1`) ; `web/src/components/HeaderControls.tsx:28` (`Live · next lot 12s`) |

## 2. Le brief, exigence par exigence

Le brief [`tidewater.md`](../tidewater.md) fait foi pour les règles du jeu.
Chaque exigence y porte une référence (`TW-N-xx`, `TW-C1-xx`, …). Voici la
grille complète, telle que le dépôt la respecte aujourd'hui.

### 2.1 Noyau — les règles (TW-N-01 à TW-N-53)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-N-01 | Trois zones, un stock en caisses, commun à tous | ✅ | `crates/rules/src/stocks.rs`, `state.rs:288` | — |
| TW-N-02 | Une sortie prend 0,4 % du stock | ✅ | `Config::catch_share_bps: 40`, `stocks.rs:16` | — |
| TW-N-03 | Repousse logistique 5 %/2 % par jour | ✅ | `Config::regrow_herring_bps: 500`, `regrow_cod_bps: 200`, `stocks.rs:31` | — |
| TW-N-04 | Un stock à zéro ne repousse plus | ✅ | `stocks.rs:32` (retour 0 si stock nul) | — |
| TW-N-05 | Le stock n'est pas affiché au joueur | ✅ | `web/src/components/LedgerPanel.tsx` : la prise par sortie, pas le stock ; le stock réel n'est que dans le panneau `Judges` | — |
| TW-N-10 | 3 sorties max par bateau et par jour, au prix de la zone | ✅ | `Config::trips_per_boat_day: 3`, `zone_trip_cost: [200,400,700]` | — |
| TW-N-11 | Le joueur affecte un bateau à une zone ou au quai | ✅ | `web/src/components/SeaMap.tsx`, `BoatsPanel.tsx` | — |
| TW-N-12 | Chaque sortie débarque un lot, vendu aussitôt ; le poisson ne se garde pas | ✅ | `crates/sim/src/cycle.rs` (`try_tick` → criée) | — |
| TW-N-13 | Dix bateaux : deux au joueur, huit aux NPC | ✅ | `Config::starting_boats = [2,2,4,2,…]` | — |
| TW-N-20 | 20 licences, 70 caisses par semaine chacune | ✅ | `Config::licence_count: 20`, `quota_per_licence: 70` ; test `port_quota_is_1400_crates` | — |
| TW-N-21 | Quota épuisé → le capitaine reste à quai jusqu'au lundi | ✅ | `crates/rules/src/trips.rs:18-33` (`quota_left`, `can_sail`) | — |
| TW-N-22 | Une licence s'échange ; les NPC en vendent et en achètent | ✅ | `crates/rules/src/licences.rs:135-142` ; `crates/sim/src/season.rs:108-150` | — |
| TW-N-23 | Une licence détenue et non pêchée retire 70 caisses/semaine de pression | ✅ | `licences.rs:123` (`pressure_removed`) ; `crates/sim/src/policies.rs:163-166` (le « steward » achète une licence pour ne pas pêcher) | — |
| TW-N-30 | Prix descendant, premier acheteur à la limite | ✅ | `crates/rules/src/auction.rs:75-95` | — |
| TW-N-31 | Limite = prix de base × facteur de stock | ✅ | `merchant.rs:32-47` | — |
| TW-N-32 | Après l'achat, le stock monte donc la limite baisse | ✅ | `auction.rs:191` (test 194 → 3,4) | — |
| TW-N-33 | Un lot que personne ne prend au-dessus du plancher est perdu | ✅ | `auction.rs:221` (`lot_below_floor_is_lost`) ; `crates/sim/src/cycle.rs:461` (journal « Lot lost ») | — |
| TW-N-40 | L'or n'entre que par les conserves et les voyageurs, ne sort que par le carburant et l'appât | ✅ | `crates/rules/src/goldflow.rs:10-50` ; `crates/sim/src/cycle.rs:351` | — |
| TW-N-41 | Un lot invendu est un bien perdu : ni or créé ni détruit | ✅ | `cycle.rs:461-476` | — |
| TW-N-42 | À chaque cycle, la variation de l'or total = somme des flux extérieurs | ✅ | `crates/rules/src/goldflow.rs:56-58` (`check_conservation`), appelé par `cycle.rs:249` | — |
| TW-N-50 | Capitaine à zéro en fin de semaine : bateaux désarmés, licences aux enchères | ✅ | `crates/rules/src/bankruptcy.rs:33-43` | — |
| TW-N-51 | Acheteur à zéro : fermeture, il n'enchérit plus | ✅ | `bankruptcy.rs:45-49` | — |
| TW-N-52 | Le joueur renfloie un acteur arrêté et prend une part de ses bénéfices | 🟡 | Règle et commande présentes : `bankruptcy.rs:51-60`, `crates/sim/src/main.rs:182` (`sim refloat`) | **Pas de bouton dans le client web** : la mécanique existe côté moteur, pas dans l'UI jouable |
| TW-N-53 | Un arrêt se lit sur la carte sans texte | 🟡 | Bateaux couchés à quai et zones sans bancs sont dessinés (`SeaMap.tsx`, `views.rs:70` : `schools = stock × 4 ÷ capacité`) | La **conserverie sans fumée** n'est pas rendue : l'arrêt d'un acheteur se lit par le tableau `Judges`, pas sur la carte |

### 2.2 Couche 1 — le stock caché (TW-C1-01 à TW-C1-05)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C1-01 | Le stock réel n'est jamais montré au joueur | ✅ | `web/src/components/LedgerPanel.tsx` (prise par sortie + tendance) ; le stock n'apparaît que dans `Judges` | — |
| TW-C1-02 | Chaque zone affiche sa prise par sortie et sa tendance | ✅ | `crates/rules/src/survey.rs:51-79` (`catch_per_trip`, `trend` → `rising`/`steady`/`falling`) | — |
| TW-C1-03 | Un relevé coûte 80 or, porte sur une zone, à 10 % près, valable une semaine | ✅ | `Config::survey_cost: 8000`, `survey_tolerance_bps: 1000`, `survey_valid_days: 7` ; test `estimate_stays_within_10_percent` | — |
| TW-C1-04 | Chaque NPC lit le signal à sa façon | ✅ | `crates/sim/src/reading.rs` et `bots.rs` : Hale (moyenne 4 semaines), Brandt (la veille), Okoro (le voisin) — les lignes de raisonnement le disent | — |
| TW-C1-05 | Le panneau des juges montre le stock réel à côté de ce que voit le joueur | ✅ | `web/src/components/JudgesPanel.tsx:108-131` (table « Your catch per trip » / « Real stock ») | — |

### 2.3 Couche 2 — les espèces liées (TW-C2-01 à TW-C2-04)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C2-01 | Capacité en morue = 2 000 × (stock hareng ÷ 5 000) | ✅ | `crates/rules/src/species.rs:18-27` | — |
| TW-C2-02 | Chaque bateau porte un filet, changé à quai | ✅ | `crates/rules/src/state.rs:122-135` ; le client refuse le changement en mer (`web/src/App.tsx:86-91`) | — |
| TW-C2-03 | La repousse dépend de la part de petit maillage sur 4 semaines | ✅ | `crates/rules/src/species.rs:15` (`MESH_WINDOW_WEEKS = 4`), `species.rs:46` | — |
| TW-C2-04 | Le registre indique le filet de chaque bateau | ✅ | `web/src/components/LedgerPanel.tsx` (mention « large mesh » / « small mesh » par débarquement) ; `web/src/components/BoatsPanel.tsx:51-58` | — |

### 2.4 Couche 3 — la dette (TW-C3-01 à TW-C3-06)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C3-01 | Chaque bateau coûte 6 or par jour, qu'il sorte ou non | ✅ | `Config::daily_charge: 600` ; `cycle.rs` (`Hale pays 12.0 in crew wages` = 2 bateaux) | — |
| TW-C3-02 | La banque prête jusqu'à 300 or pour un bateau de 400, à 3 %/semaine | ✅ | `Config::loan_max: 30000`, `new_boat_cost: 40000`, `loan_rate_weekly_bps: 300` | — |
| TW-C3-03 | Après deux traites manquées : saisie et mise aux enchères | ✅ | `Config::seizure_after_missed: 2` ; `crates/rules/src/debt.rs:52-60` | — |
| TW-C3-04 | Un NPC à court pour sa traite sort tous ses bateaux, au petit maillage | ✅ | `crates/rules/src/debt.rs:73-92` ; `crates/sim/src/bots.rs:125` | — |
| TW-C3-05 | Une dette est un token ; le joueur la rachète, accorde un report ou saisit | ✅ | `contracts/tidewater/src/loans.rs` (`buy_loan`, `forbear_loan`, `seize_boat`) ; côté moteur `crates/rules/src/debt.rs:84` (`transfer_note`) | Le contrôle on-chain n'a pas été rejoué : le contrat n'est pas déployé |
| TW-C3-06 | Le raisonnement s'affiche | ✅ | `debt.rs:92` : `Brandt sends every boat with small mesh: loan payment due in 2 days, 140 short.` (chaîne exacte, test `debt.rs:153`) | — |

### 2.5 Couche 4 — le conseil (TW-C4-01 à TW-C4-05)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C4-01 | Le conseil vote le quota par licence ; il peut fermer une zone ou interdire le petit maillage | ✅ | `crates/rules/src/council.rs` ; formulaire de proposition : `web/src/components/HarbourPanel.tsx:214-253` | — |
| TW-C4-02 | Chaque NPC vote pour ce qui lui rapporte le plus, selon sa propre estimation | ✅ | `crates/rules/src/council.rs` (`npc_vote`) | — |
| TW-C4-03 | Le joueur propose une règle **et son indemnité**, en or par licence et par semaine | ✅ | `HarbourPanel.tsx:181-198` (« Paid by » : fonds du port ou redevance supplémentaire) ; `crates/sim/src/govern.rs:73-98` (`motion_bill`, `admission` : une motion sans son argent n'est pas recevable) | — |
| TW-C4-04 | Le prix d'une licence suit le revenu qu'elle laisse espérer | ✅ | `council.rs:126` (`licence_price`) | — |
| TW-C4-05 | Le vote de chacun s'affiche avec son calcul | ✅ | `council.rs:237` : `Brandt votes no: a 50-crate quota costs him 640 a week, your offer pays 400.` | — |

### 2.6 Interface (TW-UI-01 à TW-UI-07) et panneau juges (TW-J-01 à TW-J-04)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-UI-01 | Un seul écran en 1280×800 | ✅ | `web/src/App.tsx` : une seule page, panneaux empilés | — |
| TW-UI-02 | La carte marine est dessinée sur un canvas maison | ✅ | `web/src/components/SeaMap.tsx` (canvas 2D maison, aucun moteur externe) | — |
| TW-UI-03 | Affecter un bateau en deux clics | ✅ | `SeaMap.tsx` (bateau puis zone) ; testé au navigateur | — |
| TW-UI-04 | La criée montre l'horloge, la limite de chaque acheteur et le prix de vente | ✅ | `web/src/components/AuctionPanel.tsx` | — |
| TW-UI-05 | Chaque prix, décision et vote a sa ligne de raisonnement brut | ✅ | `AuctionPanel.tsx:60` (infobulle), `LedgerPanel.tsx` (bloc « Reasoning ») | — |
| TW-UI-06 | Une tendance à la baisse s'écrit en toutes lettres et change de couleur | ✅ | `web/src/types.ts:36` (`'rising' \| 'steady' \| 'falling'`) ; `SeaMap.tsx:303` (couleur) | — |
| TW-UI-07 | `prefers-reduced-motion` respecté | ✅ | `web/src/styles.css:326,371` ; `SeaMap.tsx:77` | — |
| TW-J-01 | Fast-forward 7 jours et 28 jours, sans joueur | ✅ | `JudgesPanel.tsx:176-190` | — |
| TW-J-02 | Graphe du stock réel de chaque zone et du prix du hareng, faillites marquées | ✅ | `web/src/components/Chart.tsx:26-32` (4 séries), `ff_markers` | — |
| TW-J-03 | Or de chaque acteur, licences, total de l'or, cumul des flux extérieurs | ✅ | `JudgesPanel.tsx:216-222` (« Live gold in port … outside in … outside out … net ») | — |
| TW-J-04 | La graine est affichée | ✅ | `JudgesPanel.tsx:192-200` (« Seed … · N days · N event(s) ») | — |

### 2.7 La colonne vertébrale — les cinq barreaux (`docs/SPINE.md`)

| Barreau | État | Preuve | Manque |
|---|---|---|---|
| 1 — Voir (l'attribution) | ✅ | `crates/sim/src/attribution.rs` ; panneau « Who took what » (`LedgerPanel.tsx:191`) ; exemple mesuré sur la graine 7 après 28 jours : *Greybank : Brandt 42,0 %, Hale 33,5 %, Okoro 24,5 %* | — |
| 2 — Payer (redevance + fonds du port) | ✅ | `crates/sim/src/fund.rs` ; la redevance du profil démo vaut 0,4 or/caisse (`Config::DEMO_LEVY_PER_CRATE = 40`) ; mesuré : `sim init --levy 0.8` puis 28 jours → `fund: {"balance": 3984.0, "paid_in": 3984.0, "paid_out": 0.0}` | — |
| 3 — Gouverner (motion financée) | ✅ | `crates/sim/src/govern.rs` ; vérifié au navigateur sur le site public le 10/11 : motion *quota 50 · levy 0,5 · indemnité 2,00 · paid by an extra levy* → *« Costs 128.0g over the season: 16 licences paid for 4 weeks »* → au conseil : *« Tally: 4 for, 16 against; the motion fails »*, ou *« 20 for, 0 against; the motion passes »* avec une indemnité de 150 | — |
| 4 — Hériter (dette envers la mer) | ✅ | `crates/sim/src/sea.rs`, `crates/sim/tests/sea_debt.rs` (8 tests) ; `docs/DEBT.md` ; au bilan : *« Debt to the sea · 1 431 caisses »* (mesuré au navigateur, saison 1) | — |
| 5 — Réparer (jachère collective + contentieux) | 🟡 | La **dette** se rembourse déjà par jachère ou réensemencement côté moteur (`sim fallow`, `sim reseed`) | **La jachère collective votée et le contentieux n'existent pas encore.** Le paiement n'est pas exposé dans le client web : `pay_in_fallow` / `pay_in_reseed` ne sont câblés qu'en CLI |

## 3. Résumé

| Exigence | État | Ce qui manque |
|---|---|---|
| Sujet : marché d'agents, prix par stock et demande, marchand ruiné qui ferme | ✅ | Le bouton de renflouement n'est pas dans l'UI |
| NEP-245 multi-tokens, un seul contrat | 🟡 | Déploiement testnet (faucet 429 jusqu'au 11/11 03:27 Paris), puis branchement du jeu sur les tokens, 6 majeurs du contrat ouverts |
| Connexion email sans friction, sans wallet ni gas | 🟡 | Authentification réelle (FastAuth ou relayeur sponsor) |
| Règles de prix dans un seul fichier + infobulle | ✅ | — |
| Fast-forward : une semaine de commerce sans joueur | ✅ | — |
| Boucle 30 s / 5 min / session | ✅ | — |
| Brief : noyau (TW-N), couches 1 à 4 (TW-C), UI (TW-UI), panneau juges (TW-J) | ✅ | TW-N-52 et TW-N-53 partiels (UI) ; barreau 5 à construire |
| La colonne SPINE | 🟡 | Barreau 5 (jachère collective + contentieux) |

**Les trous 🟡, dans cet ordre** : déployer (le faucet rouvre à 03:27
Paris, un job automatique est armé pour 03:40 sous `bankkeeper.testnet`),
puis brancher le jeu sur les tokens, puis le relayeur sponsor pour que la
connexion soit réelle sans popup.

## 4. En cours (rien de ce qui suit n'est mergé dans `main`)

Ces éléments sont **annoncés comme en cours**, jamais comme des faits :

- **8 majeurs du client web** + le bloquant `E_IMPORT` (branche
  `feat/fix-web`, non mergée).
- **6 majeurs du contrat** (droits de l'acte de bateau, indemnités aux
  bons votants, note de dette cessible, poids de vote figé, plafond de 8
  licences, dépôt de storage) — une PR est en préparation.
- **Barreau 5** : jachère collective et contentieux.
- **Équilibrage** : 50 graines × 4 politiques (`make balance`) ; le curseur
  de repousse, la part prise par sortie, la redevance et le seuil de jachère
  sont encore à régler.
- **Moteur graphique 2D** : le moteur est mergé (`11f7a0d`), son
  **intégration dans l'écran de jeu** (vague 2) ne l'est pas.
- **Login réel** : FastAuth ou relayeur sponsor.

## 5. Ce que nous ne montrons pas, et pourquoi

- **Pas de vidéo de démo.** Décision du propriétaire (10/11) : la
  démonstration passe par le lien public, le fast-forward et la page de
  preuves. Aucun document de ce dossier ne renvoie à une vidéo.
- **Le contrat n'est pas on-chain** : la page `/proofs.html` affiche
  « pas encore déployé » plutôt qu'un faux badge live.
- **Le login est décoratif** : le texte de la page de preuves le dit
  explicitement.
- **Pas de multi-joueur** : hors périmètre assumé du brief (`tidewater.md`
  §1.4) ; la piste 12 de `docs/VISION.md` (politique asynchrone) est un
  chantier d'un autre horizon.

Le détail des parcours de démonstration est dans
[`docs/DEMO-JUGES.md`](DEMO-JUGES.md) ; l'état daté du dépôt est dans
[`docs/PLAN.md`](PLAN.md).
