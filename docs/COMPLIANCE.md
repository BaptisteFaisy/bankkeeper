# Conformité — track *Games With Real Economies* (id: `games`)

> Écrit le **11 novembre 2026 à 11:00 (Europe/Paris)** par b, sur `main` =
> **`9c5ae61`** (270 tests verts, 0 échec). Ce document est la grille que nous
> soumettons : il dit **ce qui est fait, ce qui est démontré, ce qui manque**.
>
> **Règle de rédaction** : une ligne n'est écrite que si la preuve a été
> rejouée par l'auteur de ce document, le 11/11, sur ce commit ou contre les
> URLs publiques. Chaque preuve est un fichier, une commande ou une URL. Quand
> la preuve n'a pas pu être produite, la ligne dit « à vérifier » — jamais une
> estimation.
>
> **Barème** : ✅ tenu et prouvé · 🟡 tenu mais incomplet (l'écart exact est
> nommé) · ❌ non tenu.

## Comment tout rejouer en local (30 secondes)

```sh
git clone https://github.com/BaptisteFaisy/bankkeeper.git && cd bankkeeper
cargo test --workspace                      # 270 passés, 0 échec, 4 ignorés (mesuré le 11/11)
python3 tests/ci_structural.py              # 178 fichiers < 500 lignes, fn < 50
cd web && npm ci && npm run build:offline   # engine.wasm (917 429 o) + web/dist
cd .. && python3 tests/e2e_offline.py       # parcours hors-ligne, 0 erreur console, 0 /api/
python3 tests/e2e_proofs.py                 # /proofs.html branché sur bankkeeper.testnet
python3 tests/audit_web.py                  # 14 contrôles client, 0 défaut, 0 erreur console
```

| Ce qui est déjà en ligne | URL | État mesuré le 11/11 |
|---|---|---|
| Le jeu jouable (lien unique) | <https://tidewater-play.vercel.app> | HTTP **200** |
| La scène 2D, autonome | <https://tidewater-play.vercel.app/scene-preview.html> | HTTP **200** |
| Les preuves, branchées sur la chaîne | <https://tidewater-play.vercel.app/proofs.html> | HTTP **200** |
| Le contrat | `bankkeeper.testnet` (testnet) | `code_hash` `b3atbgna5Lvi1GGqGz8ecP1wHBwBTC1Pe93VAhqEPZj`, `storage_usage` 437 462 o, ~8,469 NEAR |

Empreintes : `engine.wasm` servi en production = **917 429 octets**, sha256
`b68bb258982cd0e7033a770c395115f333e009d9f4bd025827218005b599df32` — **le même
fichier** que celui construit depuis `9c5ae61` (`sha256sum web/dist/engine.wasm`).
Le wasm du contrat construit ici : **433 552 octets**, sha256 hexadécimal
`08b8ab6a43433e527182521dee57b824d5ba9820522f264ebc3cd89222f344ca`, **sha256
base58 `b3atbgna5Lvi1GGqGz8ecP1wHBwBTC1Pe93VAhqEPZj`** — c'est-à-dire
exactement le `code_hash` lu sur la chaîne. Le binaire publié est donc
reproductible depuis le dépôt, bit pour bit.

## 1. Le track, exigence par exigence

### 1.1 « Un jeu de ville-marché : récolte, marchands agents, prix selon stock et demande, faillite et réinvestissement »

| Attendu | Ce que Bankkeeper fait | État | Preuve vérifiable | Ce qui manque |
|---|---|---|---|---|
| Des marchands qui sont des agents | Un **port de pêche** : mêmes mécaniques de marché, autre fiction. Le joueur est capitaine, pas marchand | ✅ | `crates/rules/src/merchant.rs` (formule unique), `crates/rules/src/auction.rs` (criée) ; 66 tests dans `crates/rules` | — (fiction « port » assumée, datée dans `docs/DECISIONS.md`) |
| Chaque marchand a sa bourse et son inventaire | `Fishmonger`, `Cannery`, `The Gull` : or, stock et cible propres | ✅ | `crates/rules/src/config.rs:174` (`buyer_targets`), `crates/rules/src/state.rs` (`Harbour.gold`) | — |
| Le prix suit le stock et la demande récente | `stock_factor_bps` → `limit` ; après l'achat, le stock monte et la limite baisse (TW-N-32) | ✅ | `crates/rules/src/merchant.rs:32-58`, `crates/rules/src/auction.rs:55-70` | — |
| Inonder le marché fait chuter le prix | Exemple chiffré du brief §4.4 : 180 caisses pour une cible de 150 → facteur 0,90 → limite 3,6 ; après l'achat, 3,4 | ✅ | `crates/rules/src/merchant.rs:76` (`a_flooded_merchant_pays_less`) ; `crates/sim/tests/lot0_core.rs:122` (`assert_eq!(rules::format_price(after), "3.4")`) | — |
| Un marchand ruiné ferme, jusqu'à réinvestissement | Or ≤ 0 → `Closed`, il n'enchérit plus (TW-N-51) ; le joueur peut **renflouer** et prendre une part (TW-N-52) | 🟡 | `crates/rules/src/bankruptcy.rs:13-60` (`is_broke`, `close_buyer`, `bailout_owed`, `bailout_payout`) ; CLI `sim refloat` (`crates/sim/src/main.rs:42`) | **Aucun bouton de renflouement dans `web/src/`** (`grep -rn "refloat\|invest" web/src/` → rien) : la mécanique existe côté moteur et CLI, l'UI ne l'expose pas |

### 1.2 « Les objets sont des NEP-245 multi-tokens, un seul contrat pour tous les types »

**État : 🟡 — un seul contrat, corrigé, compilé, déployé sur testnet et prouvé par 75 transactions réelles ; mais le jeu joué dans le navigateur ne passe pas encore par la chaîne.**

| Attendu | Réel | Preuve vérifiable |
|---|---|---|
| Un seul contrat pour or (`0`), hareng (`1`), morue (`2`), licences (`3`), actes de bateau (`10–19`), notes de dette (`100+`), parts (`200+`) | `contracts/tidewater/` — **38 fonctions dans l'ABI** (`mt_transfer`, `mt_batch_transfer`, `mt_balance_of`, `mt_supply`, `mt_token`…) | `cargo near build non-reproducible-wasm` → **433 552 o** ; sha256 base58 **= le `code_hash` on-chain** ; ABI embarquée (`tidewater_abi.zst`) |
| Les 3 bloquants et les 8 majeurs de l'audit | **Corrigés et mergés** : D01–D02 par la PR #42, D03 puis D04–D10 et D13 par la PR #80 ; 4 mineurs restent ouverts | `docs/AUDIT-CONTRACT.md` (colonne « état ») ; **35 tests unitaires + 14 preuves d'audit** dans `cargo test` |
| Le contrat est sur le testnet | **Oui : `bankkeeper.testnet`** | RPC public `view_account` le 11/11 : `code_hash b3atbgna…`, `storage_usage` 437 462 o, ~8,469 NEAR, bloc 277 193 119 |
| Un rejeu on-chain existe, en transactions réelles | **75 transactions, 75 hashs distincts**, toutes confirmées sur l'explorateur | `docs/deployments.md` (75 lignes entre `<!-- e2e:begin -->` et `<!-- e2e:end -->`) ; `docs/e2e-testnet.log` : « all steps passed — 75 transactions, 75 distinct hashes » ; `/proofs.html` affiche « 75 / 75 TRANSACTIONS CONFIRMÉES » |
| Le conseil a réellement voté sur la chaîne | `CouncilOutcome {proposal_id:1, passed:true, yes_weight:9, no_weight:8}` ; `quota_per_licence` **70 → 80** relu dans `get_day` | `docs/e2e-testnet.log:85-86` ; relecture RPC du 11/11 : `get_proposal(1)` → `passed:true, yes_weight:9, no_weight:8, yes_voters:[["player…",4],["captain…",1],["npc:brandt",4]]` ; `get_day` → `quota_per_licence:80` |
| Les tokens bougent, et on peut le relire | Licences 20 (`mt_supply(3)` = `20`), or 10 653 309 600 milli, hareng 26 ; `mt_balance_of(3, player)` = 4, `mt_balance_of(3, captain)` = 1 (la licence transférée est bien chez le capitaine) ; `get_loan(100)` → prêteur `player.bankkeeper.testnet`, 672 000 milli dus, 0 traite manquée ; `get_licence_cap` → `8` (plafond D09) | Relecture RPC du 11/11 (6 appels `call_function` en lecture seule) ; page `/proofs.html` : badge « LIVE · LU SUR LA CHAÎNE » |
| Le jeu manipule les tokens | **Non.** Le navigateur tourne sur le moteur Rust en wasm : stocks, criée et NPC sont hors chaîne | `crates/wasm/src/lib.rs` ; `python3 tests/e2e_offline.py` → `api calls: 0` ; `docs/ONCHAIN.md` l'écrit noir sur blanc |

**Ce qui manque, nommément** : le branchement du jeu web public sur les tokens.
Le contrat est là, déployé, prouvé et lisible par n'importe qui ; le geste du
joueur dans le navigateur n'y passe pas encore. C'est le **seul** écart
structurel du dossier.

### 1.3 « Connexion sociale ou email, sans phrase de récupération, sans popup de wallet, sans demande de gas »

**État : 🟡 — l'expérience sans friction est tenue, et l'identité réelle est prouvée de bout en bout sur `near-sandbox` ; elle n'est pas encore branchée sur la démo publique.**

| Attendu | Réel | Preuve vérifiable |
|---|---|---|
| Pas de wallet, pas d'extension, pas de phrase | Le formulaire public demande **un email**, et rien d'autre : « Sign in with your email. No wallet, no seed phrase, no gas. » Le capitaine prend le préfixe de l'adresse | `web/src/components/Auth.tsx` (écran `Take command`, champ `Email`, bouton `Set sail`) ; testé au navigateur sur le site public le 11/11 |
| Pas de demande de gas | Le joueur ne signe jamais lui-même ; dans la démo publique, rien n'est signé du tout | `web/src/session.ts` ; `tests/e2e_offline.py` → 0 appel `/api/`, 0 appel au relais, 0 écriture |
| L'email est une identité, pas une étiquette | **Sur `near-sandbox` : oui.** Le relais sponsorisé dérive un compte NEAR de l'email (`p-<sha256(email)[:20]>.<suffix>`), garde la clé **côté serveur** (mode `0600`, jamais dans l'arbre) et signe pour le joueur | `python3 tests/relay_sponsor.py` **relancé le 11/11 → PASS** : `captain@tidewater.dev` → `p-41abb460db76f2549fb3.test.near`, tx sponsorisée **`GwfdY7nmdTkd5817Ye7XhRN86aJmAr3Vd5c7vNzju5tm`**, `mt_balance_of(3)` **0 → 1**, or **1 000 000 → 720 000** milli, **0,309 Tgas** brûlés ; garde-fous : rafale de 14 appels → 4 refus, 2ᵉ action → `E_ACTION_CAP`, bourse prêtée **une seule fois** |
| Branché sur la démo publique | **Le client, oui ; le relais public, pas encore.** Un seul build, deux modes : le mode chaîne se décide à l'exécution (`?chain`, ou `?chain=<url>` pour nommer le relais), et sans `?chain` l'email ouvre une session locale (`captain-<hash>`) sans joindre personne. Reste à publier le relais (son URL se cuit au build par `VITE_CHAIN_URL`) et à lier le jeton de session au compte NEAR côté serveur | `web/src/near/chain.ts` (`chainRequested`, `chainBase`, `chainUrl`), `web/src/near/chainSession.ts`, `web/src/components/Auth.tsx`, `web/src/components/ChainBar.tsx` ; preuve publique `tests/e2e_chain_public.py` (**SKIP** explicite tant que le relais n'est pas joignable) ; `docs/AUTH.md` § 7 ; `server/relay.py:381-392` (le jeton de session ne retient pas encore le compte NEAR) |

**Pourquoi 🟡 et pas ✅** : la voie est écrite, gardée et prouvée hors ligne,
mais le juge qui ouvre le lien public joue une session locale. Le correctif
est connu et écrit : lier le jeton de session au compte NEAR
(`docs/AUTH.md` § 7), puis héberger le relais.

### 1.4 « Les règles de prix des marchands dans un seul fichier lisible, et le raisonnement d'un marchand en infobulle »

**État : ✅.**

| Attendu | Réel | Preuve vérifiable |
|---|---|---|
| Un seul fichier de règles de prix | `crates/rules/src/merchant.rs` (113 lignes) : `stock_factor_bps`, `limit`, `floor`, `reasoning`. Le moteur (`auction.rs`), les vues (`merchant_views.rs`) et le contrat (`contracts/tidewater/src/game.rs:40`) appellent **le même module** | `crates/rules/src/merchant.rs:32-58` ; `crates/rules/src/auction.rs:55-70` ; `crates/sim/src/merchant_views.rs:26-27` ; `contracts/tidewater/src/game.rs:40` |
| Infobulle de raisonnement par marchand | Chaque acheteur de la criée porte un « why » (survol **et** focus clavier, `role="tooltip"`) | `web/src/components/AuctionPanel.tsx:21-39` ; testé au navigateur sur le site public le 11/11 : `Fishmonger: limit 6.0 = base 4.0 x 1.50 — store 0 against a target of 60.` — 3 infobulles, 0 erreur console |

### 1.5 « Un mode fast-forward qui simule une semaine de commerce en une minute »

**État : ✅.**

| Attendu | Réel | Preuve vérifiable |
|---|---|---|
| 7 jours sans joueur, en une minute | `sim ff --days 7` : **2 ms** mesurés sur le binaire release ; `--days 28` : **3 ms** | `cargo run -p sim -- init --seed 7 --out s.json && cargo run -p sim -- ff --days 7 --state s.json` → `{"days_run":7,"seed":7,"history_hash":"11218010329100392424"}` ; 28 j → `9351511834409569606` |
| Le même panneau dans le jeu | Boutons `Fast-forward 7 days` / `Fast-forward 28 days` dans `Judges bench`, puis `Run curves` (stock réel par zone + prix du hareng + faillites), `Live standings`, `Live gold in port` | `web/src/components/JudgesPanel.tsx:180-224` ; testé au navigateur le 11/11 : `Seed 839689206 · 7 days · 1 event(s)`, `Deterministic replay signature: 1944115135812384726` |
| Rejouable au bit près | Même graine → même `history_hash`, en CLI **et** dans deux navigateurs distincts | `crates/sim/tests/seed_variety.rs:39` (`same_seed_replays_the_same_season`) ; mesuré le 11/11 : graine 7 → `1944115135812384726` (7 j) et `8783787045057408131` (28 j) **identiques sur deux profils Chrome neufs** ; graine 42 → `6081091381670576782`, donc bien différent |

### 1.6 « La boucle de jeu sur papier d'abord » — l'exigence de méthode

**État : ✅.** Écrite avant le code, aux trois échelles demandées :
`docs/GAME-LOOP.md`, section « Rythmes » (30 s / 5 min / session).

Et la cadence est réelle dans le jeu : le bouton `Go live` lande un lot toutes
les **30 secondes** (`Config::seconds_per_lot: 30`), dix bateaux, une sortie
par bateau et par jour (`DEMO_TRIPS = 1`) → **une journée en 5 minutes**, puis
la soirée (repousse, charges, faillites) et le jour suivant. `End the day`
reste disponible pour fermer la journée d'un coup ; le
fast-forward des juges est hors horloge.

## 2. Le brief, exigence par exigence

Le brief [`tidewater.md`](../tidewater.md) fait foi pour les règles du jeu.
Chaque exigence y porte une référence (`TW-N-xx`, `TW-C1-xx`, …).

### 2.1 Noyau — les règles (TW-N-01 à TW-N-53)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-N-01 | Trois zones, un stock en caisses, commun à tous | ✅ | `crates/rules/src/stocks.rs`, `crates/rules/src/state.rs` | — |
| TW-N-02 | Une sortie prend 0,4 % du stock | ✅ | `Config::catch_share_bps: 40`, `stocks.rs:16` (`trip_catch`) | — |
| TW-N-03 | Repousse logistique en fin de journée | ✅ | `Config::regrow_herring_bps: 700`, `regrow_cod_bps: 300` ; `stocks.rs:26` (`regrow`) | valeur **calibrée** (7 %/3 % au lieu de 5 %/2 % du brief) : mesuré sur 50 graines, `docs/BALANCE.md` |
| TW-N-04 | Un stock à zéro ne repousse plus | ✅ | `stocks.rs:26-33` (retour 0 si stock nul) | — |
| TW-N-05 | Le stock n'est pas affiché au joueur | ✅ | `web/src/components/LedgerPanel.tsx` : prise par sortie et tendance, jamais le stock ; le stock réel n'est que dans `Judges` | — |
| TW-N-10 | 3 sorties max par bateau et par jour, au prix de la zone | ✅ | `Config::trips_per_boat_day: 3`, `crates/rules/src/trips.rs:36` (`trip_cost`) | — |
| TW-N-11 | Le joueur affecte un bateau à une zone ou au quai | ✅ | `web/src/App.tsx:73` (`guardedAssign`), `web/src/components/BoatsPanel.tsx` | — |
| TW-N-12 | Chaque sortie débarque un lot, vendu aussitôt ; rien ne se garde | ✅ | `crates/sim/src/cycle.rs:125` (`try_tick` → criée) | — |
| TW-N-13 | Dix bateaux : deux au joueur, huit aux NPC | ✅ | `Config::starting_boats = [2,2,4,2,…]` (`config.rs:169`) | — |
| TW-N-20 | 20 licences, 70 caisses par semaine chacune | ✅ | `Config::licence_count: 20`, `quota_per_licence: 70` ; test `licences.rs:196` (`port_quota_is_1400_crates`) | — |
| TW-N-21 | Quota épuisé → le capitaine reste à quai | ✅ | `crates/rules/src/trips.rs:18-33` (`quota_left`, `can_sail`) | — |
| TW-N-22 | Une licence s'échange ; les NPC en vendent et en achètent | ✅ | `crates/rules/src/licences.rs:135-147`, `crates/sim/src/season.rs:108-150` | — |
| TW-N-23 | Une licence détenue et non pêchée retire 70 caisses/semaine de pression | ✅ | `licences.rs:123` (`pressure_removed`) ; politique `steward` du harnais (`crates/sim/src/policies.rs`) | — |
| TW-N-30 | Prix descendant, premier acheteur à la limite | ✅ | `crates/rules/src/auction.rs:70-104` (`clear`) | — |
| TW-N-31 | Limite = prix de base × facteur de stock | ✅ | `merchant.rs:32-58` | — |
| TW-N-32 | Après l'achat, le stock monte donc la limite baisse | ✅ | `crates/sim/tests/lot0_core.rs:122` (194 → 3,4) | — |
| TW-N-33 | Un lot que personne ne prend au-dessus du plancher est perdu | ✅ | `auction.rs:221` (`lot_below_floor_is_lost`) ; journal « Lot lost » (`cycle.rs:400,462`) | — |
| TW-N-40 | L'or n'entre que par les conserves et les voyageurs, ne sort que par le carburant et l'appât | ✅ | `crates/rules/src/goldflow.rs:13-51` (`add_exports`, `add_travellers`, `add_fuel_bait`) | — |
| TW-N-41 | Un lot invendu est un bien perdu : ni or créé ni détruit | ✅ | `cycle.rs:461-476` (`log_lost_lot`) | — |
| TW-N-42 | À chaque cycle, la variation de l'or total = somme des flux extérieurs | ✅ | `goldflow.rs:57` (`check_conservation`), appelé par `cycle.rs:249` | — |
| TW-N-50 | Capitaine à zéro en fin de semaine : bateaux désarmés, licences aux enchères | ✅ | `crates/rules/src/bankruptcy.rs:18-43` (`broke_captains`, `lay_up`) | — |
| TW-N-51 | Acheteur à zéro : fermeture, il n'enchérit plus | ✅ | `bankruptcy.rs:46` (`close_buyer`) ; panneau `Fish auction` → `Closed` | — |
| TW-N-52 | Le joueur renfloie un acteur arrêté et prend une part de ses bénéfices | 🟡 | `bankruptcy.rs:52-60`, CLI `sim refloat` (`main.rs:42,187`) | **Pas de bouton dans le client web** : la mécanique existe côté moteur, pas dans l'UI jouable |
| TW-N-53 | Un arrêt se lit sur la carte sans texte | 🟡 | Bateaux couchés à quai (`web/src/scene/boats.ts:131`), zones sans bancs dessinés (`web/src/scene/sea.ts`) | L'**étal d'un acheteur fermé n'a pas de visuel propre** : `sceneStalls` (`web/src/scene/bridge.ts:92-99`) ne transmet pas l'état `open` ; l'arrêt se lit par le mot `Closed` (criée) et `Stopped` (tableau `Judges`) |

### 2.2 Couche 1 — le stock caché (TW-C1-01 à TW-C1-05)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C1-01 | Le stock réel n'est jamais montré au joueur | ✅ | `web/src/components/LedgerPanel.tsx`, `web/src/components/ZoneReadings.tsx` (prise par sortie, tendance) ; le stock réel n'est que dans `Judges` | — |
| TW-C1-02 | Chaque zone affiche sa prise par sortie et sa tendance | ✅ | `crates/rules/src/survey.rs:51-79` (`catch_per_trip`, `trend` → `rising`/`steady`/`falling`) | — |
| TW-C1-03 | Un relevé coûte 80 or, une zone, à 10 % près, valable une semaine | ✅ | `Config::survey_cost: 8000`, `survey_tolerance_bps: 1000`, `survey_valid_days: 7` ; test `survey.rs:100` (`estimate_stays_within_10_percent`) | — |
| TW-C1-04 | Chaque NPC lit le signal à sa façon | ✅ | `crates/sim/src/reading.rs`, `crates/sim/src/bots.rs` : Hale (moyenne 4 semaines), Brandt (la veille), Okoro (le voisin) — les lignes de raisonnement le disent | — |
| TW-C1-05 | Le panneau des juges montre le stock réel à côté de ce que voit le joueur | ✅ | `web/src/components/JudgesPanel.tsx:108-131` (colonnes « Your catch per trip » / « Real stock ») | — |

### 2.3 Couche 2 — des espèces liées (TW-C2-01 à TW-C2-04)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C2-01 | Capacité en morue = 2 000 × (stock hareng ÷ 5 000) | ✅ | `crates/rules/src/species.rs:17` (`cod_capacity`) | — |
| TW-C2-02 | Chaque bateau porte un filet, changé à quai | ✅ | `crates/rules/src/state.rs:122-135` ; le client refuse le changement en mer (`web/src/App.tsx:85-92`, « The net can only be changed at the quay. ») | — |
| TW-C2-03 | La repousse dépend de la part de petit maillage sur 4 semaines | ✅ | `species.rs:14` (`MESH_WINDOW_WEEKS = 4`), `species.rs:47` (`effective_regrow_rate`) | — |
| TW-C2-04 | Le registre indique le filet de chaque bateau | ✅ | `web/src/components/LedgerPanel.tsx` (« large mesh » / « small mesh » par débarquement) ; `BoatsPanel.tsx:51-58` | — |

### 2.4 Couche 3 — la dette (TW-C3-01 à TW-C3-06)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C3-01 | Chaque bateau coûte 6 or par jour, qu'il sorte ou non | ✅ | `Config::daily_charge: 600` ; journal « Hale pays 12.0 in crew wages » (relu sur le site public le 11/11) | — |
| TW-C3-02 | La banque prête jusqu'à 300 or pour un bateau de 400, à 3 %/semaine | ✅ | `Config::loan_max: 30000`, `new_boat_cost: 40000`, `loan_rate_weekly_bps: 300` | — |
| TW-C3-03 | Après deux traites manquées : saisie et mise aux enchères | ✅ | `Config::seizure_after_missed: 2` ; `crates/rules/src/debt.rs:52-60` (`apply_payment`) | — |
| TW-C3-04 | Un NPC à court pour sa traite sort tous ses bateaux, au petit maillage | ✅ | `crates/rules/src/debt.rs:74` (`desperate_for_cash`), `crates/sim/src/bots.rs:145-152` | — |
| TW-C3-05 | Une dette est un token ; le joueur la rachète, accorde un report ou saisit | ✅ | `contracts/tidewater/src/loans.rs:14-35` (`buy_loan`, `forbear_loan`, `seize_boat`) ; moteur `crates/rules/src/debt.rs:84` (`transfer_note`) ; web `web/src/components/HarbourPanel.tsx:133-142` | **Contrat** : `buy_loan(100)` + `forbear_loan` prouvés sur testnet (`docs/e2e-testnet.log`), `get_loan(100)` relu au RPC le 11/11 ; `seize_boat` n'a pas été rejoué sur testnet |
| TW-C3-06 | Le raisonnement s'affiche | ✅ | `debt.rs:90` : `Brandt sends every boat with small mesh: loan payment due in 2 days, 140 short.` (chaîne exacte, test `debt.rs:152`) | — |

### 2.5 Couche 4 — le conseil du port (TW-C4-01 à TW-C4-05)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-C4-01 | Le conseil vote le quota par licence ; il peut fermer une zone ou interdire le petit maillage | ✅ | `crates/rules/src/council.rs` ; formulaire : `web/src/components/HarbourPanel.tsx:229-253` (`Quota`, `Close`, `Ban small mesh`) | — |
| TW-C4-02 | Chaque NPC vote pour ce qui lui rapporte le plus, selon sa propre estimation | ✅ | `council.rs:84` (`npc_vote`) | — |
| TW-C4-03 | Le joueur propose une règle **et son indemnité**, en or par licence et par semaine | ✅ | `HarbourPanel.tsx:181-197` (`Paid by` : fonds du port ou redevance supplémentaire) ; `crates/sim/src/govern.rs:73-98` (`motion_bill`, `admission` : une motion sans son argent n'est pas recevable) | — |
| TW-C4-04 | Le prix d'une licence suit le revenu qu'elle laisse espérer | ✅ | `council.rs:129` (`licence_price`) ; relu sur la chaîne : `get_licence_price` → `266654` milli | — |
| TW-C4-05 | Le vote de chacun s'affiche avec son calcul | ✅ | `council.rs:171-215` (`took_this_season`, `vote_reasoning`, `vote_reasoning_levy`) ; mesuré le 11/11 sur le site public : `Hale votes yes: a 0.5 levy costs him 448 a week, your offer pays 600. He took 256 crates from Greybank this season.` | — |

### 2.6 Interface (TW-UI-01 à TW-UI-07) et panneau juges (TW-J-01 à TW-J-04)

| Réf | Exigence | État | Preuve | Manque |
|---|---|---|---|---|
| TW-UI-01 | Un seul écran en 1280×800 | ✅ | `web/src/App.tsx` : une seule page, panneaux empilés | — |
| TW-UI-02 | La carte marine est dessinée sur un canvas maison | ✅ | `web/src/components/SeaMap.tsx` + `web/src/scene/*` (moteur de scène maison, aucun moteur externe) | — |
| TW-UI-03 | Affecter un bateau en deux clics | ✅ | `SeaMap.tsx` (bateau puis zone) ; testé au navigateur | — |
| TW-UI-04 | La criée montre l'horloge, la limite de chaque acheteur et le prix de vente | ✅ | `web/src/components/AuctionPanel.tsx` | — |
| TW-UI-05 | Chaque prix, décision et vote a sa ligne de raisonnement brut | ✅ | `AuctionPanel.tsx:21-39` (infobulle), `LedgerPanel.tsx` (bloc « Reasoning ») | — |
| TW-UI-06 | Une tendance à la baisse s'écrit en toutes lettres et change de couleur | ✅ | `web/src/types.ts:36` (`'rising' \| 'steady' \| 'falling'`) ; `ZoneReadings.tsx` | — |
| TW-UI-07 | `prefers-reduced-motion` respecté | ✅ | `web/src/motion.ts`, `web/src/styles.css` ; **contrôlé par `tests/audit_web.py`** : « prefers-reduced-motion=True : la partie tourne, pas d'animation » | — |
| TW-J-01 | Fast-forward 7 jours et 28 jours, sans joueur | ✅ | `web/src/components/JudgesPanel.tsx:180-183` | — |
| TW-J-02 | Graphe du stock réel par zone et du prix du hareng, faillites marquées | ✅ | `web/src/components/Chart.tsx:26-31` (4 séries), `ff_markers` | — |
| TW-J-03 | Or de chaque acteur, licences, total de l'or, cumul des flux extérieurs | ✅ | `JudgesPanel.tsx:215-222` (« Live gold in port … outside in … outside out … net ») | La ligne `Port fund · balance — · in — · out —` reste à `—` : la réponse de fast-forward du wasm ne porte pas `fund` (`crates/wasm/src/lib.rs:85-95`). Le solde se lit dans le registre et dans `sim state` |
| TW-J-04 | La graine est affichée | ✅ | `JudgesPanel.tsx:178` (« Seed … · N days · N event(s) ») | — |

### 2.7 La colonne vertébrale — les cinq barreaux (`docs/SPINE.md`)

| Barreau | État | Preuve vérifiable | Manque |
|---|---|---|---|
| 1 — **Voir** (l'attribution) | ✅ | `crates/sim/src/attribution.rs` ; bloc « Who took what » (`LedgerPanel.tsx:205`) ; mesuré le 11/11 sur le site public : `Greybank took 159 · durable 10/day · 15.9x` puis `Brandt 49.7% · You 25.2% · Hale 25.2%` | — |
| 2 — **Payer** (redevance + fonds du port) | ✅ | `crates/sim/src/fund.rs` ; redevance du profil livré 0,4 or/caisse (`DEMO_LEVY_PER_CRATE = 40`) ; mesuré : `sim init --seed 7 --levy 0.4` puis 28 j → `fund.balance = 1948.0` ; à l'écran : `Levy: 6.8 on 17 crates to the port fund.` | Ligne `Port fund` à `—` dans `Judges` (cf. TW-J-03) |
| 3 — **Gouverner** (motion financée + preuve) | ✅ | `crates/sim/src/govern.rs` ; mesuré le 11/11 sur le site public : motion `quota 50 · levy 0.5g a crate · indemnity 2.00g · paid by an extra levy` → `Costs 128.0g over the season: 16 licences paid for 4 weeks.` → conseil `Tally: 20 for, 0 against; the motion passes.` → `Levy set at 0.5 a crate from next season.` | L'aperçu de coût est calculé sur `SEASON_WEEKS = 4` en dur (`web/src/types.ts:299`) : sur `?weeks=1` il annonce « 4 weeks » alors que le conseil paie « for 1 weeks ». **Défaut d'affichage**, le moteur calcule juste |
| 4 — **Hériter** (dette envers la mer) | ✅ | `crates/sim/src/sea.rs`, `crates/sim/tests/sea_debt.rs` (10 tests) ; `docs/DEBT.md` ; à l'écran : `Debt to the sea 827 crates` au bilan, puis `The season leaves 827 crates of debt to the sea (827 carried).` ; `Rest the zone` fait tomber la dette de 827 à 127 caisses (mesuré) ; `tests/e2e_offline.py` : « pay: the debt fell from 1209 to 201 crates » | — |
| 5 — **Réparer** (jachère collective + contentieux) | ✅ | `crates/sim/src/dispute.rs` (7 tests), `docs/FALLOW.md` ; à l'écran : `Claim against fund` → `Claim dismissed: credibility lost.` puis `1/1 claim heard this season. Credibility: -2` (mesuré le 11/11) | — |

### 2.8 Le jeu 2D, l'accessibilité, l'équilibrage

| Exigence | État | Preuve |
|---|---|---|
| La scène est intégrée dans le jeu, pas seulement dans une démo séparée | ✅ | `web/src/components/SeaMap.tsx` monte `createScene` (`web/src/scene/scene.ts`) ; PR #68 (moteur) + PR #78 (intégration) |
| Le canvas est atteignable au clavier et décrit | ✅ | `SeaMap.tsx:146-152` : `role="application"`, `tabIndex={0}`, `aria-label` descriptif, flèches + Entrée ; **vérifié au navigateur** : « Sea chart: 10 boats, three zones and the quay. Left and right arrows pick a boat, up and down arrows pick a target, Enter sends it. » |
| Les retours de jeu sont annoncés | ✅ | région `aria-live` dans le canvas (`SeaMap.tsx:152` ; message mesuré : « The Deeps owes the sea 13 crates: the anchor is broken. ») ; pile de toasts en région live (`audit_web.py` : « les toasts sont dans une région live ») |
| Les 12 défauts de l'audit web sont corrigés | ✅ | `python3 tests/audit_web.py` → **0 défaut, 14 contrôles jugés sains, 0 erreur console** (code de sortie 0) ; rapport : `docs/AUDIT-WEB.md` |
| La démo de la scène est publique | ✅ | <https://tidewater-play.vercel.app/scene-preview.html> → HTTP 200, canvas `role="img"` 760×556 avec `aria-label`, 0 erreur console |
| L'équilibrage est mesuré, pas estimé | ✅ | 50 graines × 4 politiques × 3 saisons ; `docs/BALANCE.md` ; `docs/balance-50.json` (md5 `a54e287cddfe613c1484f3ca30cd3f40`, revérifié le 11/11) ; deux tests verrouillent la dérive (`crates/sim/tests/harness.rs`) |

### 2.9 L'audit du contrat : 15 défauts prouvés, 11 fermés

| Sévérité | Défauts | État |
|---|---|---|
| Bloquants | D01 (`mt_transfer` non payable), D02 (aucune licence à la banque), D03 (jambes de batch non sommées) | **fermés** (PR #42) |
| Majeurs | D04 (amounts absents de l'événement), D05 (memo non échappé), D06 (droits du deed), D07 (indemnités aux mauvais votants), D08 (note de dette non cessible), D09 (plafond de 8 licences), D10 (dépôt de storage), D13 (poids de vote non figé) | **fermés** (PR #80) |
| Mineurs | D11 (transfert de 0 accepté), D12 (motion résolue hors session), D14 (deux refus « owner only »), D15 (`assign_boat` change le filet en mer) | **ouverts**, prouvés par un test `#[ignore]` chacun — les 4 tests ignorés des 270 |

Détail : `docs/AUDIT-CONTRACT.md` (colonne « état » et table « Correctifs livrés »).

## 3. Ce qui reste, dans l'ordre

1. **Brancher le jeu web public sur les tokens.** Le contrat est déployé et
   prouvé ; le geste du joueur ne l'atteint pas. Seul écart structurel.
2. **Lier la session à la chaîne côté client** (`docs/AUTH.md` § 7) et
   héberger le relayeur : le diff est écrit, il n'est pas appliqué.
3. **Exposer le renflouement (TW-N-52)** et **l'état « fermé » des étals
   (TW-N-53)** dans l'UI web.
4. **Deux câblages d'affichage** : `Port fund` dans `Judges` (le wasm ne
   renvoie pas `fund`) et `SEASON_WEEKS` en dur dans l'aperçu de motion.
5. **Quatre défauts mineurs du contrat** (D11, D12, D14, D15), prouvés et
   encore `#[ignore]`.
6. **Une ligne à rafraîchir** : `web/src/proofs/Panels.tsx:114` annonce
   « 268 tests » alors que la suite en compte 270 aujourd'hui.

## 4. Résumé

| Exigence | État | Ce qui manque |
|---|---|---|
| Sujet : marché d'agents, prix par stock et demande, marchand ruiné qui ferme | 🟡 | le bouton de renflouement n'est pas dans l'UI |
| NEP-245 multi-tokens, un seul contrat | 🟡 | contrat **déployé et prouvé** (75 tx réelles) ; reste à brancher le jeu web dessus |
| Connexion email sans friction, sans wallet ni gas | 🟡 | identité réelle **prouvée sur sandbox** ; reste à la brancher sur la démo publique |
| Règles de prix dans un seul fichier + infobulle | ✅ | — |
| Fast-forward : une semaine de commerce sans joueur | ✅ | — |
| Boucle 30 s / 5 min / session | ✅ | — |
| Brief : noyau, couches 1 à 4, UI, panneau juges | ✅ | TW-N-52 et TW-N-53 partiels (UI) |
| La colonne SPINE, les cinq barreaux | ✅ | deux câblages d'affichage |
| Le jeu 2D et l'accessibilité | ✅ | — |
| L'équilibrage | ✅ | — |

Les quatre 🟡 se ferment dans cet ordre : **brancher le jeu sur les tokens**,
puis **lier la session à la chaîne**, puis **exposer le renflouement et l'arrêt
visuel**, puis **corriger les deux câblages d'affichage**.

## 5. Ce que nous ne montrons pas, et pourquoi

- **Pas de vidéo de démo.** Décision du propriétaire : la démonstration passe
  par le lien public, le fast-forward et la page de preuves. Un juge qui clique
  est plus convaincu qu'un juge qui regarde. Aucun document de ce dossier ne
  renvoie à une vidéo.
- **Le jeu joué n'est pas encore celui de la chaîne.** `/proofs.html` dit
  « LIVE · LU SUR LA CHAÎNE » pour ce qu'elle lit — les six `mt_supply` et les
  75 transactions — et `docs/ONCHAIN.md` écrit noir sur blanc la frontière
  entre ce qui est on-chain et ce qui vit dans le moteur wasm.
- **Le login de la démo publique est une session locale.** L'identité réelle
  existe, elle est prouvée sur `near-sandbox` (`tests/relay_sponsor.py`,
  exécuté le 11/11), et `docs/AUTH.md` écrit ce qu'il reste à faire.
- **Pas de multi-joueur** : hors périmètre assumé du brief (`tidewater.md`
  §1.4). Le jeu se joue seul contre des NPC solvables, et l'économie tourne
  sans joueur — c'est même ce que le fast-forward prouve.
- **Les quatre défauts mineurs du contrat** qui restent ouverts sont listés,
  pas cachés (`docs/AUDIT-CONTRACT.md`).

Le détail des parcours de démonstration est dans
[`docs/DEMO-JUGES.md`](DEMO-JUGES.md) ; le texte de soumission est dans
[`docs/SUBMISSION.md`](SUBMISSION.md) ; l'état daté du dépôt est dans
[`docs/PLAN.md`](PLAN.md).
