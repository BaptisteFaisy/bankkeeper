# Bankkeeper — Démo juges

> Guide de démonstration **sans vidéo**, en trois parcours chronométrés :
> **90 secondes**, **5 minutes**, **les preuves**.
>
> Écrit le **11 novembre 2026 à 11:00 (Europe/Paris)** par b, sur `main` =
> **`9c5ae61`** (270 tests verts, 0 échec). Tout ce qui est décrit
> ci-dessous a été **cliqué et lu** dans un navigateur sur les URLs publiques
> le 11/11 ; les noms des boutons et les textes cités sont des copies
> exactes de ce que l'écran affiche.
>
> **Pas de vidéo.** La démonstration passe par le lien public, le
> fast-forward et la page de preuves. Un juge qui clique lui-même ne prend
> pas notre parole pour un montage.
>
> - **Le jeu (lien unique)** : <https://tidewater-play.vercel.app>
> - **La scène 2D** : <https://tidewater-play.vercel.app/scene-preview.html>
> - **La page de preuves** : <https://tidewater-play.vercel.app/proofs.html>

## Avant de commencer

- **Aucune installation, aucun wallet.** Le jeu est un site statique : le
  moteur Rust tourne en WebAssembly (`engine.wasm`, 917 429 octets) dans le
  navigateur du juge (`tests/e2e_offline.py` : 0 appel `/api/`, 0 erreur
  console).
- **La graine est partageable.** `?seed=7&weeks=1` (ou `&weeks=4`) rejoue
  exactement la même saison.
- **Une convention d'écran** : le panneau **Harbour office** contient deux
  champs déjà pré-remplis (`Quota` = `50`, `Indemnity` = `0`) — si vous
  saisissez une valeur, sélectionnez le champ (`Ctrl+A`) avant de taper.

---

# Parcours 1 — 90 secondes

**Objectif** : voir *le jeu 2D qui tourne*, *la règle qui explique le prix*,
et *le registre qui dit qui a pris quoi*.

### Étape 1 (20 s) — ouvrir et prendre le commandement

- **Cliquer** : ouvrir <https://tidewater-play.vercel.app/?seed=7&weeks=1>.
  La **page de garde** (un voile semi-transparent sur le port) présente le
  jeu : cliquer **Play** (ou **Scenario** pour la démo guidée d'une journée).
  Dans l'écran **Take command**, saisir un email (`juge@example.com`) — le
  capitaine prend le préfixe de l'adresse — puis cliquer **Set sail**.
- **À l'écran** : la carte marine 2D s'ouvre (`Sea chart`), avec les
  bateaux à la voile sur fond sarcelle, la bande du haut
  `TIDEWATER · Week 1 · Mon · High · 150.0g · Quota left: 280 · Season 1 of 3`.
  Le tutoriel ne s'ouvre plus tout seul : **How to play** dans la barre du
  haut ouvre les trois cartes si besoin (les fermer avec **Done**).
- **La phrase que le jeu doit pouvoir dire** : aucune encore — la scène
  pose le port, dix bateaux et un stock partagé.

### Étape 2 (25 s) — une journée en direct (1 lot / 30 s)

- **Cliquer** : dans la barre du haut, **Go live** (pour lancer un lot
  toutes les 30 s ; il affiche le compte à rebours `Live · next lot 28s`).
  Pour ne pas attendre 30 s devant un jury pressé, cliquer **End the day**.
- **À l'écran** : dans le panneau **Fish auction**, la jauge de prix
  descend, une caisse décrit un arc sur le canvas 2D vers le quai et
  l'étal qui achète s'allume ; la vente s'inscrit au format
  `Sold lot 5 to Cannery: 17 × 5.32 = 90.44g` (relevé en cours de saison),
  avec les boutons **Next landing** et **Skip** pour revoir les lots un à
  un.
  Dans **Harbour ledger → Reasoning** (le jour 1 sur `?seed=7&weeks=1`), les
  motifs apparaissent en clair :
  - `Hale sends 2 boats to Greybank: first outing, no catch history yet.`
  - `Brandt sends 4 boats to Greybank: best catch per trip yesterday.`
  - `Okoro tries The Shallows: nobody has fished it for 2 weeks.`
  - `Sold to Cannery: 12 x 4.5 = 54.0. Limit 4.5 = base 4.0 x 1.125.`
- **La phrase que le jeu doit pouvoir dire** :
  > « Mes prises ont fait baisser le prix payé à tout le monde pendant
  > trois jours. »
  On voit le même hareng passer de **6,00g** à **4,50g** dès le premier
  jour (`6.0` → `5.73` → `5.46` → `5.33` → `5.2` → `4.93` → `4.66` →
  `4.5`) à mesure que les marchands remplissent leurs réserves. Le jeu ne
  moralise pas : il aligne les limites.

### Étape 3 (20 s) — l'infobulle *why* d'un marchand

- **Cliquer / pointer** : dans **Fish auction**, amener la souris (ou le
  focus clavier par `Tab`) sur le badge **why** à droite de **Fishmonger**,
  **Cannery** ou **The Gull**.
- **À l'écran** : l'infobulle affiche le calcul exact du module
  `crates/rules/src/merchant.rs` :
  `Fishmonger: limit 6.0 = base 4.0 x 1.50 — store 0 against a target of 60.`
- **La phrase que le jeu doit pouvoir dire** : le prix n'est ni aléatoire
  ni opaque — une seule formule Rust, partagée entre le moteur navigateur
  et le contrat NEAR.

### Étape 4 (25 s) — le registre *Who took what*

- **Cliquer** : **End the day** (si ce n'est pas déjà fait), puis lire le
  bloc **Who took what** dans **Harbour ledger**.
- **À l'écran** (relevé réel le 11/11, graine 7) :
  ```text
  Who took what
  The Shallows took 24 · durable 1/day · 24.0x
  Okoro 100.0%
  Greybank took 159 · durable 10/day · 15.9x
  Brandt 49.7% · You 25.2% · Hale 25.2%
  The Deeps took 0 · durable 0/day · —
  Nobody fished here over the window.
  ```
- **La phrase que le jeu doit pouvoir dire** :
  > « Mes prises ont fait baisser le prix payé à tout le monde pendant
  > trois jours. »
  C'est le barreau 1 (`Voir`) : ce qui a été pris face à ce que la zone
  rend toute seule (`durable 10/day · 15.9x`), ventilé capitaine par
  capitaine.

---

# Parcours 2 — 5 minutes

**Objectif** : voir le fast-forward sans joueur (7 j puis 28 j), une
motion financée qui passe au conseil, la redevance qui remplit le fonds,
le bilan avec la dette envers la mer, puis une jachère et un recours.

**Un seul lien pour tout le parcours** :
<https://tidewater-play.vercel.app/?seed=7&weeks=4> (saison de 28 jours).
Tous les chiffres ci-dessous ont été relevés sur ce lien le 11/11/2026.

### Étape 1 (45 s) — fast-forward 7 jours puis 28 jours

- **Cliquer** : après le login et **Skip**, cliquer **Judges** dans la
  barre du haut.
- **Cliquer** : **Fast-forward 7 days**, puis **Fast-forward 28 days**.
- **À l'écran** :
  - à 7 j : `Seed 839689206 · 7 days · 0 event(s)` ·
    `Deterministic replay signature: 1944115135812384726` ;
  - à 28 j : `Seed 839689206 · 28 days · 2 event(s)` ·
    `Deterministic replay signature: 8783787045057408131` ;
  - le graphe **Run curves** trace le stock réel des 3 zones et le prix du
    hareng (faillites marquées) ; `Live gold in port: 10650.0 · outside in:
    0.0 · outside out: 0.0 · net 0.0` ; **Live standings** liste l'or et les
    licences des 10 acteurs ; le tableau du joueur oppose
    `Your catch per trip` au `Real stock` (3000 / 5000 / 2000 au départ).
  *(Note honnête : la ligne `Port fund · balance —` reste à `—` dans ce
  panneau — le rejeu wasm ne renvoie pas le fonds. Le solde réel se lit à
  l'étape 3.)*
- **La phrase que le jeu doit pouvoir dire** :
  > « Vous laissez le registre le plus riche et le port le plus vide. »
  Les courbes de stocks descendent pendant que l'or du port se conserve —
  sans qu'aucun joueur humain n'ait cliqué.

### Étape 2 (2 min) — une motion votée **avec son financement**

- **Cliquer** : refermer **Judges**, puis dans **Harbour office → Council** :
  - **Quota** : laisser `50` ;
  - **Indemnity** : sélectionner la valeur et saisir `150` ;
  - **Levy a crate** : saisir `0.5` ;
  - **Paid by** : choisir `Extra levy` ;
  - cliquer **Propose**.
- **À l'écran** (avant le vote) :
  - l'aperçu de coût : `Costs 9600.0g over the season: 16 licences paid for 4 weeks. A further levy on the landings pays it.` ;
  - la motion déposée : `Motion: quota 50 · levy 0.5g a crate · indemnity 150.00g · paid by an extra levy` ;
  - le toast : `Motion tabled: quota 50, levy:0.5, pay:levies.`
- **Cliquer** : **End the day** 28 fois (une fois par seconde, ~34 s
  mesurées) jusqu'à l'écran **Season over — the bilan**.
- **À l'écran**, dans **Harbour office → Council** (relevé réel du 11/11) :
  ```text
  Council of season 1: quota 50, no closure, mesh open.
  You vote yes: your own motion.
  Hale votes yes: a 0.5 levy costs him 434 a week, your offer pays 600.
    He took 825 crates from Greybank this season.
  Brandt votes yes: a 0.5 levy costs him 868 a week, your offer pays 1200.
    He took 1 631 crates from Greybank this season.
  Okoro votes yes: a 0.5 levy costs him 434 a week, your offer pays 600.
    He took 709 crates from Greybank this season.
  Tally: 20 for, 0 against; the motion passes.
  Levy set at 0.5 a crate from next season.
  Levy raised to 2.9 a crate to pay the indemnity.
  Indemnity: 9600.0 from an extra levy, 2400.0 a week on the Monday for 4 weeks.
  ```
  Et **The port's chronicle** écrit la saison : `1 · 6103.68g · 2981 · 2996
  · 1904 · none · quota 50` (colonne `Rule carried`).
  Pour voir la motion **échouer**, recommencer sur un port neuf avec
  **Indemnity** = `2` : le tally tombe à `4 for, 16 against — rejected`
  (mesuré le 11/11 sur `?seed=7&weeks=1`).
- **La phrase que le jeu doit pouvoir dire** :
  > « La règle que j'ai fait voter en saison 2 tient toujours. »
  Chaque vote affiche son calcul **et** ce que le capitaine a pris au banc
  cette saison ; la règle votée entre en vigueur (`Levy set at 0.5 a crate
  from next season`) et s'inscrit dans **The port's chronicle**
  (`Rule carried : quota 50`).

### Étape 3 (30 s) — la redevance qui remplit le fonds

- **Lire** : dans **Harbour ledger → Reasoning**, une ligne par vente :
  `Levy: 4.8 on 12 crates to the port fund.` (redevance prélevée à la
  source sur chaque lot vendu, créditée au fonds du port).
- **À l'écran** : dès l'ouverture de la saison 2, le solde exact du fonds
  est écrit dans **Pay the debt** :
  `100 crates put back into Greybank for 558.0g out of the port fund (holds 1582.0g)`
  — **1 582 or** amassés par la redevance en une saison de 28 jours.

### Étape 4 (90 s) — bilan, dette envers la mer, jachère et recours

- **À l'écran** (panneau **Season over — the bilan**, relevé réel) :
  ```text
  Net worth        6103.68g
  Gold             4187.68g
  Licences         4
  Stocks left      2981 · 2996 · 1904
  Debt to the sea  1,559 crates
  Last council     Season 1: 20 for, 0 against — passed.
  Your purse, licences and hulls carry over. The sea keeps what this season left it.
  ```
- **Cliquer** : **Sail the next season**. La dette est reportée :
  **Harbour ledger → Debt to the sea** affiche `1,559 crates carried.`
- **Cliquer** (bloc **Pay the debt**) : laisser **Zone** sur `Greybank` et
  **Weeks** sur `2`, lire l'aperçu
  `1,176 crates paid to the sea over 2 week(s) · no gold moves · Greybank earns nothing meanwhile`,
  puis cliquer **Rest the zone**.
- **À l'écran** : toast `Greybank rests 2 week(s): 1176 crates paid to the sea.` ;
  la dette tombe de **1 559 à 383 caisses** (`383 crates carried.`) et la
  ligne de zone gagne `· resting 2w` ; sur la carte, la zone porte une
  **ancre brisée** tant qu'elle doit à la mer.
- **Cliquer** (bloc **Repairs & claims**) : saisir `120` dans **Claim** et
  cliquer **Claim against fund**.
- **À l'écran** (relevé réel) :
  ```text
  Claim upheld: 120.0g paid by the fund.
  Claim of 120.0 by You: settled for 120.0 paid by the port fund.
  Last claim (season 2): Claim of 120.0 by You: settled for 120.0 paid by the port fund.
  1/1 claim heard this season. Credibility: 0
  ```
  Une demande abusive est rejetée et coûte de la crédibilité : sur un port
  où la règle ne lèse personne, le même clic rend
  `Claim dismissed: credibility lost.` et `Credibility: -2` (mesuré le 11/11).
- **La phrase que le jeu doit pouvoir dire** :
  > « Vous laissez le registre le plus riche et le port le plus vide. »
  Le bilan aligne la valeur nette (`6103.68g`) et la dette envers la mer
  (`1,559 crates`) sans un mot de jugement ; la jachère et le recours sont
  les deux sorties, et elles sont collectives.

---

# Parcours 3 — les preuves

**Objectif** : permettre au juge de contrôler le contrat testnet, les 75
transactions réelles, le déterminisme et le code source, sans nous croire
sur parole.

### 3.1 La page de preuves publique (`/proofs.html`)

- **Ouvrir** : <https://tidewater-play.vercel.app/proofs.html>.
- **À l'écran** (vérifié en navigateur headless le 11/11, 0 erreur console) :
  1. **1 · LE CONTRAT** : badge `LIVE · LU SUR LA CHAÎNE`, contrat
     `bankkeeper.testnet` (lu dans `docs/deployments.md`), lecture directe
     en RPC sur `https://rpc.testnet.fastnear.com` (bouton **Rafraîchir**).
  2. **JETONS DU CONTRAT NEP-245** : 6 cartes live lues au RPC :
     - Or `#0` : `10 653 309 600` milli-or ;
     - Hareng `#1` : `26` caisses ;
     - Cabillaud / Morue `#2` : `0` caisses ;
     - Licences de pêche `#3` : **`20`** (`Offre cible : 20`) ;
     - Actes de bateaux `#10` : `1` ; Notes de dette `#100` : `1`.
  3. **TRANSACTIONS DU SCÉNARIO E2E** : **`75 / 75 TRANSACTIONS CONFIRMÉES`**,
     chacune liée vers `https://testnet.nearblocks.io/txns/<hash>`.
  4. **LA SAISON PARTAGÉE & LES INVARIANTS** : lien de rejeu (`?seed=7&weeks=2`)
     et commandes locales.

### 3.2 Les hashs et empreintes vérifiés le 11/11/2026

| Élément | Valeur mesurée le 11/11 | Comment la vérifier |
|---|---|---|
| Compte contrat testnet | `bankkeeper.testnet`, `storage_usage` 437 462 o, ~8,469 NEAR | RPC `view_account` (voir § 3.3) |
| `code_hash` on-chain | `b3atbgna5Lvi1GGqGz8ecP1wHBwBTC1Pe93VAhqEPZj` | Identique au sha256 base58 de `tidewater.wasm` compilé localement |
| Wasm du contrat (build local) | **433 552 o**, sha256 hex `08b8ab6a43433e527182521dee57b824d5ba9820522f264ebc3cd89222f344ca` | `cd contracts/tidewater && cargo near build non-reproducible-wasm` |
| Conseil on-chain (`get_proposal(1)`) | `passed: true`, `yes_weight: 9`, `no_weight: 8`, `quota_per_licence` **70 → 80** | `docs/deployments.md` (`ETsUigsAeyG2ySCZVcwvSiChvZXTASrCCUJSAsJYkEw2`) et `docs/e2e-testnet.log` |
| Transactions du rejeu testnet | **75 hashs distincts** (`assign_boat`, `land_lot`, `run_day`, `buy_licence`, `mt_transfer`, `buy_loan`, `forbear_loan`, `propose_rule`, `vote`, `cast_npc_votes`, `resolve_council`) | [`docs/deployments.md`](deployments.md) |
| `engine.wasm` en production | **917 429 o**, sha256 `b68bb258982cd0e7033a770c395115f333e009d9f4bd025827218005b599df32` | `curl -s https://tidewater-play.vercel.app/engine.wasm \| sha256sum` = build `9c5ae61` |
| `history_hash` CLI (`sim ff`, graine 7) | 7 j : **`11218010329100392424`** (2 ms) ; 28 j : **`9351511834409569606`** (3 ms) | `sim init --seed 7` puis `sim ff --days 7` / `28` |
| `history_hash` navigateur (`?seed=7&weeks=4`, port neuf) | 7 j : **`1944115135812384726`** ; 28 j : **`8783787045057408131`** | Vérifié identique sur deux profils Chrome neufs ; différent avec `?seed=42` (`6081091381670576782`) |

### 3.3 Rejouer tout en local

```sh
# 1. Suite Rust complète (270 passés, 0 échec, 4 ignorés volontaires)
git clone https://github.com/BaptisteFaisy/bankkeeper.git && cd bankkeeper
cargo test --workspace

# 2. Gardes structurels (< 500 lignes, fn < 50, palette)
python3 tests/ci_structural.py

# 3. Build hors-ligne + tests navigateur headless (0 erreur console, 0 /api/)
cd web && npm ci && npm run build:offline && cd ..
python3 tests/e2e_offline.py
python3 tests/e2e_proofs.py
python3 tests/audit_web.py

# 4. Déterminisme CLI + bilan
cargo run --release -p sim -- init --seed 7 --levy 0.4 --out /tmp/s7.json
cargo run --release -p sim -- ff --days 28 --state /tmp/s7.json
cargo run --release -p sim -- state --state /tmp/s7.json | python3 -m json.tool | head -n 40

# 5. Reproductibilité du contrat NEP-245 + vérification RPC testnet
cd contracts/tidewater && cargo near build non-reproducible-wasm && cd ../..
curl -s -X POST https://rpc.testnet.near.org -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"bankkeeper.testnet"}}'
```

*(Note pour les preuves du relayeur sponsorisé sur `near-sandbox` : installer
les dépendances de `scripts/` via `cd scripts && npm ci`, puis exécuter
`NEAR_SANDBOX_BIN=<chemin> python3 tests/relay_sponsor.py`.)*

---

# Ce que nous ne montrons pas, et pourquoi

| Ce qui n'est pas montré | Pourquoi | Où c'est vérifiable |
|---|---|---|
| **Une vidéo de démo** | Décision explicite du propriétaire : aucune vidéo n'est produite ni liée. Le jury dispose du jeu public en ligne, du fast-forward et des preuves vérifiables | Ce document ; [`docs/COMPLIANCE.md`](COMPLIANCE.md) § 5 |
| **Un login email relié à la chaîne sur le site public** | Le **client est branché** : un seul build public porte les deux modes, et `?chain` (ou `?chain=<url>` du relais) fait de l'email un vrai compte NEAR testnet signé par le relayeur sponsorisé — sans wallet, sans phrase, sans gaz, prouvé sur `near-sandbox` (`tests/relay_sponsor.py`, PASS le 11/11). Ce qui manque est **l'hébergement du relais** : tant qu'il n'a pas d'URL publique, la démo reste en mode hors-ligne (le défaut) et `tests/e2e_chain_public.py` se désactive proprement (SKIP) | [`docs/AUTH.md`](AUTH.md) § 7 ; `web/src/near/chain.ts` (`chainRequested`, `chainBase`) ; `tests/e2e_chain_public.py` |
| **Le jeu web public qui écrit sur `bankkeeper.testnet`** | Le contrat NEP-245 est déployé et prouvé par 75 transactions réelles, et `/proofs.html` le lit en direct ; le jeu joué dans le navigateur reste volontairement sur `engine.wasm` hors chaîne (`0` appel `/api/`) | [`docs/ONCHAIN.md`](ONCHAIN.md) ; [`docs/deployments.md`](deployments.md) |
| **Du multi-joueur humain** | Hors périmètre assumé du brief (`tidewater.md` § 1.4). Le jeu oppose le joueur à des capitaines et marchands NPC solvables, et tourne sans joueur en fast-forward | `tidewater.md` § 1.4 |
| **Bouton de renflouement et étals fermés sur la carte** | `refloat` fonctionne dans le moteur et en CLI (`sim refloat`), sans bouton dans l'UI web ; l'arrêt d'un acheteur s'affiche en texte (`Closed` / `Stopped`) plutôt qu'en fumée sur l'étal | [`docs/COMPLIANCE.md`](COMPLIANCE.md) § 2.1 |
| **Deux câblages d'affichage mineurs** | La ligne `Port fund` du panneau `Judges` reste à `—` (le wasm ne renvoie pas `fund` dans `fastforward_reply`), et l'aperçu de motion affiche `4 weeks` même sur `?weeks=1` (le conseil paie la vraie durée) | [`docs/COMPLIANCE.md`](COMPLIANCE.md) § 2.7 |
