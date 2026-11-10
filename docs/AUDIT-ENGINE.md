# Audit du moteur — règles + simulation

> Audit en lecture seule du moteur (`crates/rules` + `crates/sim`), branche
> `feat/audit-engine`, 10 novembre 2026. **Aucun fichier de production n'a été
> modifié.** La preuve de chaque défaut est un test qui échoue aujourd'hui :
> `crates/sim/tests/audit.rs`.

```bash
# la suite de non-régression (doit rester verte) : 6 tests
cargo test -p sim --test audit
# les preuves, qui échouent sur le code d'aujourd'hui : 6 tests ignorés
cargo test -p sim --test audit -- --ignored --test-threads=1
```

Les tests `defect_*` portent `#[ignore = "audit defect N: …"]` pour que
`cargo test --workspace` reste vert (CI). Ce sont des constats, pas des
non-régressions : ils doivent **échouer**, et ils échouent.

## Tableau des défauts

| # | Sévérité | Défaut | Fichier:ligne | Test |
|---|----------|--------|---------------|------|
| 1 | **majeur** | La criée de l'auberge encaisse **deux fois** le même or : les ventes locales du Gull sont débitées aux gens du port et créditées au Gull par `serve_species`, puis rejouées par `drain_gull` | `crates/sim/src/evening.rs:134` (avec `:131`) | `defect_01_the_gull_is_paid_twice_for_the_same_crates` |
| 2 | **majeur** | L'adjudication du lundi (`auction_pool`) **ignore le plafond de 8 licences** par capitaine : un capitaine riche rafle tout le pool et peut seul battre le conseil (brief §13 q3) | `crates/sim/src/season.rs:151-170` | `defect_02_pool_auction_breaks_the_licence_cap` |
| 3 | **majeur** | Le plan du jour n'est **pas figé à l'aube** : `day_plan` est recalculé à chaque tick depuis `boats.len()`, donc une coque achetée à midi pêche les **3 lots du jour** (y compris les rondes déjà closes) et la journée s'allonge de 3 lots | `crates/sim/src/cycle.rs:133` + `:168` | `defect_03_hull_bought_at_noon_fishes_finished_rounds` |
| 4 | **majeur** | La clôture crédite `boats_fished[propriétaire_actuel]` pour des trajets faits par l'ancien propriétaire : une coque saisie en cours de journée fait « pêcher » son acheteur | `crates/sim/src/cycle.rs:189-195` | `defect_04_seized_hull_credits_the_buyer_with_someone_elses_trip` |
| 5 | **majeur** | `history_hash` — l'empreinte de déterminisme épinglée par la CI et affichée par `sim ff` — **n'incorpore pas `point.licences`** (ni `ext_in`/`ext_out`) : deux saisons qui ne diffèrent que par la carte des licences ont le même hash | `crates/sim/src/fastforward.rs:152-165` | `defect_06_history_hash_ignores_licences` |
| 6 | mineur | `open_next_season` archive le bilan **avant** de refuser : chaque `next-season` supplémentaire en fin de campagne duplique une entrée de `campaign` (visible en mode WASM/local, qui garde l'état malgré l'erreur) | `crates/sim/src/season.rs:448-454` | `defect_05_refused_next_season_duplicates_the_campaign` |

### Détail, reproduction, effet joueur, correctif

#### 1. L'auberge encaisse deux fois le même or — majeur

`serve_species` (evening.rs:94) transfère déjà `locals × base` des gens du port
vers l'acheteur ; `drain_gull` refait le débit (`:134`) et crédite
`local_revenue + travel_revenue` au Gull (`:135`). Le pêcheur (fishmonger,
`:105-122`) ne refait rien : les deux chemins divergent.

- **Repro** : `cargo test -p sim --test audit defect_01 -- --ignored`
  → `left: 24000, right: 12000` : 10 caisses de morue (base 12,0 = 120 or)
  servies aux gens du port rapportent **240 or** au Gull et coûtent **240 or**
  à la bourse des gens du port.
- **Effet joueur** : la bourse des gens du port (qui finance *toutes* les
  ventes du soir, poissonnerie comprise) se vide deux fois plus vite ; le Gull
  s'enrichit sans contrepartie ; le poisson pourrit plus tôt. **L'invariant de
  conservation reste vert** (le total ne bouge pas, c'est un transfert
  interne) : le bug est invisible pour TW-N-42 et pour les juges.
- **Correctif (2 lignes)** : supprimer `gold[Townsfolk] -= local_revenue` et
  créditer le Gull de `travel_revenue` seul — `serve_species` a déjà payé le
  local.

#### 2. Le pool de licences casse le plafond par capitaine — majeur

`auction_pool` prend « le capitaine le plus riche » sans `cap_reached`,
contrairement à `match_licence_traders` (:112), `trade_licence` et
`buy_from_pool`. Un capitaine parti en faillite reverse ses licences au pool,
et le plus riche les rafle toutes.

- **Repro** : `cargo test -p sim --test audit defect_02 -- --ignored`
  → « one captain holds **18** licences, the ceiling is 8 ».
- **Effet joueur** : la garantie de conception du brief §13 q3 (« aucun
  capitaine ne peut emporter le conseil seul », 8/20) tombe : un capitaine peut
  détenir 18 licences, soit 90 % du collège, et voter seul les quotas à venir.
- **Correctif** : ajouter `if cap_reached(game.port.licences[c.idx()], cap, 1)
  { continue; }` dans la boucle de sélection du meilleur acheteur.

#### 3. Le plan du jour n'est pas figé à l'aube — majeur

`tick` (cycle.rs:133) recalcule `day_plan` à chaque lot depuis
`game.port.boats.len()` ; seul le curseur `lots_landed` persiste. Une coque
achetée (`fleet.rs::buy_boat`) et affectée en cours de journée prend donc ses
**trois** trajets du jour, dont la ronde 0 déjà close au moment de l'achat, et
la journée passe de 30 à 33 lots (90 s de plus, 16,5 min au lieu de 15).

- **Repro** : `cargo test -p sim --test audit defect_03 -- --ignored`
  → « a hull bought at noon must not land a lot today : left: 3, right: 0 »,
  puis `left: 33, right: 30`.
- **Effet joueur** : acheter une coque à la dernière minute rapporte une
  journée de pêche entière le jour même ; le « plan que le joueur a vu »
  n'est plus celui qui se déroule — alors que le commentaire de `tick` promet
  « landing one lot at a time changes the rhythm, **never the result** ».
  Le même curseur scalaire **sauterait** des lots si la flotte rétrécissait
  (voir remarque R6 : aujourd'hui `seize_boat` change le propriétaire sans
  retirer la coque, donc aucun saut n'est observable — la fragilité reste).
- **Correctif** : figer le plan dans `PendingDay` à l'aube (`Vec<(usize, u64)>`
  sérialisé) et ne plus le recalculer ; les lots d'une coque absente à l'aube
  n'existent pas ce jour-là.

#### 4. Une coque saisie crédite son acheteur de trajets qu'il n'a pas faits — majeur

`close_day` parcourt `trips_today[index]` (un compteur **par indice**) et
crédite `boats[index].owner`, c'est-à-dire le propriétaire **à la clôture**.
Une saisie en cours de journée (`debt seize`) fait donc compter à l'acheteur un
bateau qui a pêché pour le vendeur.

- **Repro** : `cargo test -p sim --test audit defect_04 -- --ignored`
  → « a seized hull must not count as a boat of yours that fished :
  left: 1, right: 0 ».
- **Effet joueur** : `boats_fished` alimente la lecture d'Okoro
  (`reading::best_captain_yesterday` → or par bateau, bots.rs:198) : il copie
  un capitaine dont le rendement par coque est faux ; le panneau « juges » et
  le last catch de l'UI (`views::boat_view`) héritent du même biais.
- **Correctif** : créditer le propriétaire **au moment du trajet** — stocker
  `owner` dans un compteur par (coque, propriétaire), ou créditer
  `boats_fished` dans `land_catch` (là où le trajet est compté).

#### 5. L'empreinte de déterminisme ignore les licences — majeur

`DayPoint` porte `licences`, `ext_in`, `ext_out` ; `history_hash` ne mélange
que `day`, `stocks`, `herring_price`, `gold_total`, `gold`. Deux saisons qui
ne diffèrent que par la répartition des 20 licences ont **exactement le même
hash**.

- **Repro** : `cargo test -p sim --test audit defect_06 -- --ignored`
  → `left == right` (2011677239095626860 des deux côtés).
- **Effet joueur** : aucun directement — mais c'est la **garde de la CI** et
  l'argument « même graine, même saison » des juges : une régression sur les
  licences (ou sur les flux extérieurs) passe le golden hash sans être vue.
  Toute comparaison de deux exécutions par `history_hash` est donc incomplète
  (cet audit a dû comparer les `Game` sérialisés pour prouver l'équivalence des
  deux horloges).
- **Correctif** : ajouter `for licences in point.licences { hash = mix(hash,
  licences) }` (et `ext_in`/`ext_out`), puis re-épingler les golden hashes.

#### 6. `next-season` refuse mais archive quand même — mineur

`open_next_season` pousse `game.bilan` dans `game.campaign` (`:448`) **avant**
de tester `campaign.len() >= campaign_seasons` (`:451`). Un appel refusé
mute donc l'état, contre la convention de la crate (« nothing moves on
failure »).

- **Repro** : `cargo test -p sim --test audit defect_05 -- --ignored`
  → `left: 4, right: 3` : deux clics sur « saison suivante » en fin de
  campagne laissent 4 bilans pour 3 saisons.
- **Effet joueur** : le journal de campagne affiche des saisons fantômes en
  mode WASM/local (l'état en mémoire est conservé malgré l'erreur ; le CLI,
  lui, n'écrit pas le fichier en cas d'erreur — voir remarque R7).
- **Correctif** : déplacer le test de fin de campagne **avant** le `push` (ou
  pousser dans un clone et ne committer qu'en cas de succès).

## Sortie brute des preuves

```
$ cargo test -p sim --test audit -- --ignored --test-threads=1
running 6 tests
test defect_01_the_gull_is_paid_twice_for_the_same_crates ... FAILED
test defect_02_pool_auction_breaks_the_licence_cap ... FAILED
test defect_03_hull_bought_at_noon_fishes_finished_rounds ... FAILED
test defect_04_seized_hull_credits_the_buyer_with_someone_elses_trip ... FAILED
test defect_05_refused_next_season_duplicates_the_campaign ... FAILED
test defect_06_history_hash_ignores_licences ... FAILED

---- defect_01_the_gull_is_paid_twice_for_the_same_crates stdout ----
assertion `left == right` failed: the Gull must earn what the locals paid
  left: 24000
 right: 12000

---- defect_02_pool_auction_breaks_the_licence_cap stdout ----
one captain holds 18 licences, the ceiling is 8

---- defect_03_hull_bought_at_noon_fishes_finished_rounds stdout ----
assertion `left == right` failed: a hull bought at noon must not land a lot today
  left: 3
 right: 0
(et, si l'on passe cette assertion : left: 33, right: 30 sur le nombre de ticks)

---- defect_04_seized_hull_credits_the_buyer_with_someone_elses_trip stdout ----
assertion `left == right` failed: a seized hull must not count as a boat of yours that fished
  left: 1
 right: 0

---- defect_05_refused_next_season_duplicates_the_campaign stdout ----
assertion `left == right` failed: one bilan per closed season, whatever the player clicks
  left: 4
 right: 3

---- defect_06_history_hash_ignores_licences stdout ----
assertion `left != right` failed: two seasons with a different licence map must not fingerprint the same
  left: 2011677239095626860
 right: 2011677239095626860

test result: FAILED. 0 passed; 6 failed; 0 ignored; 0 measured; 6 filtered out
```

## Remarques (pas de test qui échoue : rien d'observable aujourd'hui)

| # | Sévérité | Remarque | Fichier:ligne |
|---|----------|----------|---------------|
| R1 | remarque | **L'invariant TW-N-42 est mesuré avant le règlement du soir** : `report.invariant_ok` est calculé (`:205`) *avant* `settle_boundaries` (`:217`), qui ouvre `roll_week` (notes, saisies, pool de licences) puis `roll_season` (indemnités du conseil). Une fuite d'or dans ces trois chemins ne serait vue par personne. **Vérifié sain aujourd'hui** : le test `gold_is_conserved_…` mesure l'or total avant/après la journée *entière* contre les flux extérieurs, sur 28 jours, 3 saisons, 1 et 3 trajets, et en live. | `cycle.rs:205` vs `:217` |
| R2 | remarque | `spoil_closed` tourne **avant** `close_broke_buyers` : un acheteur qui tombe en faillite le soir garde ses stocks une nuit de plus avant qu'ils ne pourrissent. Sans effet observable aujourd'hui (la conserverie vide son hareng chaque nuit). | `cycle.rs:202-203` |
| R3 | remarque | L'estimation de profit du conseil code en dur **7 jours × 3 trajets** (`boats * 7 * 3 * cpt / 10`) au lieu d'utiliser `config.days_per_week` et `config.trips_per_boat_day`. Avec `trips_per_boat_day = 1`, les NPC votent sur un profit 3 fois trop optimiste. | `season.rs:278` |
| R4 | remarque | Divisions par une valeur de configuration non gardée : `fail - pass / weeks_per_season` (`season.rs:364`), `principal / loan_term_weeks` (`rules/src/debt.rs`), `day % days_per_week` (`bots.rs`). Un `state.json` édité à la main avec 0 **panique** (`/0`, `%0`). Le CLI borne `--weeks` mais pas ces champs. | `season.rs:364`, `debt.rs:37` (et `:61`), `bots.rs:149` |
| R5 | remarque | `lots_landed` est un **curseur scalaire** dans un plan recalculé : si la flotte rétrécissait un jour (retrait de coque, `seize_boat` qui supprime au lieu de transférer), les lots restants seraient **sautés** et `trips_today` décalé d'un indice (deux coques créditées pour une). Aucun chemin ne rétrécit la flotte aujourd'hui — d'où « remarque » et non « défaut ». | `cycle.rs:133-134` |
| R6 | remarque | Un capitaine renfloué (`refloat`) **sans coque** ne paie plus de charges, ne peut plus faire faillite (`broke_captains` exige `!stopped`), et garde ses licences : zombie qui vote et bloque 70 caisses/semaine de quota. | `lib.rs:292`, `rules/src/bankruptcy.rs:18` |
| R7 | remarque | `sim next-season` renvoie 1 **sans réécrire** `state.json` en cas d'erreur, alors que la route WASM conserve la mutation : le défaut 6 n'est donc visible qu'en mode local/WASM, pas via le relais CLI. | `main.rs:334`, `wasm/src/lib.rs:263` |
| R8 | remarque | `PendingDay.gold_at_dawn` est `#[serde(default)]` (0) : un state sauvegardé par une version antérieure (avant le champ) rechargerait une journée en cours avec une base 0 et afficherait `invariant_ok = false` à la clôture, sans qu'aucun or ne manque. | `cycle.rs:75` |

## Ce qui a été vérifié et jugé sain

Tous ces points sont couverts par des tests qui **passent** :

- **Les deux horloges sont équivalentes.** Sur la même graine, `run_day` et
  N appels à `tick` (N = lots du jour + 1) laissent un `Game` **identique au
  JSON près** (jour, or, stocks, licences, `history`, `last_report`,
  `pending`, `lots_landed`, `flows_total`), pas seulement le même
  `history_hash`. Test : `run_day_equals_n_ticks_on_a_whole_week` (7 jours,
  graine 11).
- **La reprise en cours de journée est exacte.** Un `Game` sérialisé après 5
  ticks (avec `pending`, `record`, `report`, `flows`, `gold_at_dawn`) recharge
  à l'identique et termine la journée exactement comme l'exécution sans
  coupure. Test : `a_midday_save_resumes_identically`.
- **L'or est conservé** (a) par jour, (b) sur 28 jours, (c) sur une campagne de
  3 saisons, (d) avec `trips_per_boat_day = 1` et `3`, (e) en live (chaque
  journée close tick par tick a `invariant_ok`). La mesure est faite **avant
  et après la journée entière** (règlement du soir inclus) contre les flux
  extérieurs — plus stricte que `check_conservation` (R1). Aucune fuite
  trouvée : criée, charges, redevances, renflouement, saisies et
  `next-season` sont des transferts internes ou des flux comptabilisés.
  Test : `gold_is_conserved_by_day_week_season_campaign_and_live`.
- **Cas dégénérés sans panique** : 0 coque (la journée se clôt au premier
  tick et le port avance), `trips_per_boat_day = 0` (plan vide, soirée
  normale), saison de 1 semaine (conseil au jour 7, `next-season` → saison 2),
  tous les acteurs arrêtés avec 0 or / 0 stock / 0 licence sur 3 jours, 50
  licences dans une main. Test : `degenerate_setups_do_not_panic`.
- **Déterminisme** : même graine → même `history_hash` (28 jours, deux
  exécutions), deux graines → saisons différentes. Et les vues (`view_state`,
  `view_graph`, `view_judges`) sont **purement en lecture** : l'état sérialisé
  est identique avant/après. Test : `seeds_replay_and_reads_are_read_only`.
- **Arithmétique** : pas de soustraction `u64` non gardée trouvée dans le
  chemin chaud (`stocks -= landed` borné par `.min(stock)` ; `store - sold`
  borné par `townsfolk_afford` ; `licence_pool -= 1` et `licences -= 1`
  gardés ; `quota_left`, `daily_charges`, `weekly_due`, `regrow`,
  `trip_catch`, `mesh_catch` saturants ou en `u128`). Les divisions par
  `boats.len()`, `trips`, `licences` sont gardées (`.max(1)`, `checked_div`,
  `unwrap_or(0)`). Les seules divisions dangereuses sont des champs de
  configuration (R4). Pas d'index hors bornes : la flotte ne rétrécit jamais
  (`seize_boat` et `reauction_bank_boats` changent `owner`, ne retirent rien).
- **Bornes** : jour 7 (semaine), 14 (saison 2 semaines, test existant), 28
  (saison + conseil + bilan), bord de campagne (3 saisons, test existant
  `a_campaign_ends_after_three_seasons`), `tick`/`day` après la fin de saison
  refusés par `try_tick`/`try_day`, sans avancer le jour ni laisser de
  `pending` derrière (test : `the_season_gate_closes_both_doors`).

## Non couvert par cet audit

- `contracts/tidewater` (le contrat NEAR a sa propre copie des règles : la
  divergence sim/contrat n'était pas dans le périmètre).
- `crates/wasm` au-delà de la route `next-season` (R7).
- `web/`, `server/` (relais Python) : seule la persistance en cas d'erreur a
  été lue (R7).
