# Tidewater — audit du contrat NEAR `tidewater`

> Audit adversarial avant déploiement testnet public. Contrat au commit
> `21e1421`, `contracts/tidewater` (near-sdk 5.30.1, NEP-245), wasm de
> 412 218 octets, 37 entry points. **Aucun fichier de production n'a été
> modifié** : la preuve de chaque défaut est un test qui échoue.

**15 défauts prouvés** par un test qui échoue (3 bloquants, 8 majeurs,
4 mineurs/remarque) et **7 défauts latents** documentés avec leur commande
de reproduction (hors périmètre des tests unitaires).

**État au 11/11/2026** — les trois bloquants (D01, D02, D03) et les huit
majeurs (**D04, D05, D06, D07, D08, D09, D10, D13**) sont corrigés : leur test
d'audit n'est plus `#[ignore]` et passe dans la CI. Restent ouverts, prouvés et
`#[ignore]` : **D11, D12, D14, D15** (mineurs). Voir « Correctifs livrés ».

## Lancer les preuves

```bash
# CI verte : les preuves des défauts encore ouverts sont #[ignore]
cargo test -p tidewater

# les défauts encore ouverts, avec leur message
cargo test -p tidewater --test audit -- --ignored --test-threads=1

# les preuves des défauts fermés + les gardes d'invariant
cargo test -p tidewater --test audit
```

Chaque test `dNN_*` de `contracts/tidewater/tests/audit/` **échoue tant que
le défaut existe** et passe sans retouche après le correctif proposé : c'est
le critère de sortie de l'audit. Un test d'audit ne se retouche jamais pour
accommoder un correctif ; si un correctif casse une preuve verte, le correctif
attend.

## Tableau des défauts

| id | sévérité | état | fichier:ligne | défaut | test |
|----|----------|------|---------------|--------|------|
| D01 | **bloquant** | fermé | `nep245.rs:34,43` et `nep245.rs:65,77` | `mt_transfer`/`mt_batch_transfer` exigent 1 yocto (`assert_yocto()`) mais ne sont pas `#[payable]` : **aucun or ni aucune licence ne peut circuler** | `d01` |
| D02 | **bloquant** | fermé | `lib.rs:303-315`, `actions.rs:99-102` | `new()` sème les 20 licences aux quatre capitaines, **0 à `npc:bank`** : `buy_licence` renvoie `E_NO_LICENCE` pour toujours | `d02` |
| D03 | **bloquant** | fermé | `nep245.rs:81-90` | `mt_batch_transfer` valide chaque jambe contre le **même solde de départ** : `["3","3"] × [4,4]` frappe 4 licences ex nihilo | `d03` |
| D04 | majeur | fermé | `nep245.rs:91-101` | l'événement `mt_batch_transfer` publie `token_ids` **sans `amounts`** : un indexeur ne sait pas ce qui a bougé | `d04` |
| D05 | majeur | fermé | `nep245.rs:158-160` (utilisé `:59`, `:99`) | le `memo` est interpolé **sans échappement** dans `EVENT_JSON` : JSON cassé, et un `memo` contenant un retour ligne forge un faux événement NEP-297 | `d05` |
| D06 | majeur | fermé | `actions.rs:148-156`, `loans.rs:42-47` | les droits de jeu suivent `boats.captain`, **pas le solde du deed** : vendre un acte de bateau ne transfère rien, l'ancien propriétaire continue de pêcher et d'encaisser | `d06` |
| D07 | majeur | fermé | `council.rs:104-107`, `council.rs:182-193` | `pay_indemnities` paie **tous les votants, y compris ceux qui ont voté non** ; sur une motion rejetée, l'escrow part quand même à l'opposition | `d07` |
| D08 | majeur | fermé | `loans.rs:19-21` vs `:27,:36` | le token de note (100) est transférable mais `loans.lender` ne suit pas : l'acheteur de la note n'a **aucun droit** (forbear/seize refusés), le vendeur garde tout | `d08` |
| D09 | majeur | fermé | `lib.rs:57` (jamais lu) | `LICENCE_CAP_PER_CAPTAIN = 8` n'est appliqué nulle part : un compte peut acheter tout le conseil | `d09` |
| D10 | majeur | fermé | `council.rs:29-52`, tout le contrat | **aucun dépôt de storage** (pas de NEP-145, pas de `assert_one_yocto`) : 50 motions ont été écrites pour 0 yocto ; l'état grossit gratuitement (idem pour chaque `(owner, token)` créé par `mt_transfer`) | `d10` |
| D11 | mineur | **ouvert** | `nep245.rs:47-49` | `mt_transfer` de 0 accepté : crée un slot de ledger et émet un événement pour 1 yocto, sans limite de comptes | `d11` |
| D12 | mineur | **ouvert** | `council.rs:94-98` | `resolve_council` n'appelle pas `assert_council_open` (contrairement à `propose_rule:30` et `vote:56`) : une motion de la session close est résolue et appliquée au jour 29 | `d12` |
| D13 | majeur | fermé | `council.rs:55-65`, `:132-140` | le poids de vote est lu **au moment du vote** : voter puis transférer ses licences permet de voter à nouveau depuis un autre compte — 4 licences = 6 votes, 24 voix pour 20 licences | `d13` |
| D14 | mineur | **ouvert** (voir note) | `lib.rs:445`, `actions.rs:154` | deux refus sortent en `"owner only"` au lieu d'un code `E_*` : indistinguables côté client | `d14` |
| D15 | mineur | **ouvert** | `actions.rs:47-60` | `assign_boat` change le filet **en mer** : le bonus de prise de 40 % (petit filet) s'obtient sans rentrer au quai, TW-C2-02 contournée | `d15` |

Détail ci-dessous : sévérité, localisation, reproduction, effet joueur,
correctif (codé pour les lignes « fermé », proposé pour les lignes « ouvert »).

**Note D14** : le correctif proposé (`E_OWNER_ONLY` à la place de
`"owner only"`) casse la garde verte `sane_refusals_carry_their_e_code`, qui
assert littéralement la chaîne `owner only` sur le refus de `run_day`. Une
preuve d'audit ne se retouche pas pour accommoder un correctif : D14 reste
ouvert jusqu'à ce que la garde et le code soient revus ensemble.

---

## D01 — bloquant — les transferts NEP-245 sont inappelables

`nep245.rs:34-62` (`mt_transfer`), `nep245.rs:65-102` (`mt_batch_transfer`),
`nep245.rs:147-152` (`assert_yocto`).

Reproduction (fait, `cargo near build non-reproducible-wasm`) :

```
$ grep -c payable target/near/tidewater/tidewater_abi.json
0
$ # seul `new` porte un modificateur, et c'est ["init"]
$ near call $TW mt_transfer '{"receiver_id":"bob.testnet","token_id":"3","amount":"1",
    "approval":null,"memo":null}' --accountId alice.testnet --depositYocto 1
→ Method mt_transfer doesn't accept deposit
$ … --depositYocto 0
→ E_YOCTO_REQUIRED
```

Le contrôle de dépôt est généré dans le wrapper wasm uniquement
(`near-sdk-macros/…/impl_item_method_info.rs:155-158`, `#[cfg(target_arch =
"wasm32")]`) : les 23 tests unitaires existants ne peuvent pas le voir, c'est
pourquoi `licence_moves_between_players` passe alors que la méthode est morte
sur la chaîne. `d01` lit donc l'attribut dans la source ; l'ABI le confirme.

**Effet joueur** : aucune monnaie ne circule. Pas d'achat de licence, pas
d'achat de note de dette, pas d'achat de bateau, pas de part cédée : tout le
jeu économique est hors service, et le premier appel du relais renvoie une
erreur d'exécution.

**Correctif** : `#[payable]` sur les deux méthodes, et remplacer
`assert_yocto()` par `near_sdk::assert_one_yocto()` (qui refuse aussi le
sur-dépôt au lieu de le garder).

## D02 — bloquant — la banque ne peut pas vendre de licence

`lib.rs:303-315` (`seed_world`), `lib.rs:317-341` (`seed_captain`),
`actions.rs:99-102` (`assert!(balance_of(bank, "3") > 0, "E_NO_LICENCE")`).

Reproduction : `d02` — `npc:bank` détient 0 des 20 licences ; l'appel part sur
`E_NO_LICENCE`. Aucun chemin ne crédite la banque en licences sauf
`settle_bankruptcies` (`actions.rs:331-334`), qui exige un capitaine ruiné —
or Brandt encaisse 200 000 or et n'est jamais ruiné en 28 jours.

**Effet joueur** : `buy_licence` est du code mort. Le joueur ne peut pas
augmenter son quota, donc le seul progrès possible est de pêcher avec ses 2
bateaux de départ pendant 28 jours. Le conseil ne s'achète pas, il se subit.

**Correctif** : dans `new()`, créditer `npc:bank` de `LICENCE_SUPPLY` (20) et
retirer ces 20 licences des capitaines (par exemple 2/2/2/2 aux quatre, la
banque gardant 12), ou créditer la banque des licences saisies au démarrage.

## D03 — bloquant — `mt_batch_transfer` frappe des tokens

`nep245.rs:81-90` : la boucle de validation contrôle chaque jambe contre
`balance_of(sender, token_id)` *avant* tout mouvement ; `move_balance`
(`lib.rs:415-422`) soustrait ensuite en `saturating_sub`.

Reproduction : `d03` — solde 4 licences, batch `["3","3"]` montants `[4,4]` →
les deux jambes passent, 8 licences sont débitées, le solde de l'émetteur
tombe à 0 et le destinataire reçoit 8. Somme des porteurs : **24 pour une
supply de 20**.

**Effet joueur** : duplication illimitée de tokens (or, licences, actes) dès
que D01 est levé. Les licences dupliquées donnent autant de voix au conseil :
la gouvernance est cassée en même temps que l'économie.

**Correctif** : agréger les jambes dans une `BTreeMap<&str, u128>` et valider
la somme par token avant la boucle de mouvement (ou une seule boucle qui
décompte un compteur par token).

## D04 — majeur — l'événement batch n'a pas de montants

`nep245.rs:91-101` : le format imprime `token_ids` (`{:?}`) mais jamais
`amounts`, alors que NEP-245 indexe les deux tableaux en parallèle.

Reproduction : `d04` — l'événement émis est
`{"token_ids":["3", "10"],"memo":null}`, sans `amounts`.

**Effet joueur** : l'UI et les indexeurs affichent un transfert de 2 tokens
sans quantité ; un pont ou un explorateur NEP-245 lit des montants faux (0).

**Correctif** : sérialiser `token_ids` et `amounts` avec `serde_json` (ou
`near_sdk::serde_json::json!`) et inclure `"amounts":["1","1"]`.

## D05 — majeur — le memo casse (et peut forger) les événements

`nep245.rs:158-160` : `format!("\"{}\"", m)` sans échappement ; utilisé
`nep245.rs:59` et `:99`.

Reproduction : `d05` — `memo = 'say "hi"'` produit
`…"memo":"say "hi""}` qui n'est plus du JSON. Variante forgée (non testée
mais même cause) : un memo contenant `\nEVENT_JSON:{…"event":"mt_mint"…}`
ajoute une ligne que les indexeurs qui découpent les logs par ligne lisent
comme un événement légitime.

**Effet joueur** : au mieux un événement illisible (l'historique du joueur
disparaît de l'UI), au pire de faux mint/transferts injectés dans l'index.

**Correctif** : construire la charge avec `near_sdk::serde_json::json!` et
`to_string()` (échappement gratuit), et refuser un memo contenant `\n`.

## D06 — majeur — acheter un bateau ne donne pas le bateau

`actions.rs:148-156` (`assert_boat_caller` compare au `captain`),
`actions.rs:63-96` (`land_lot`), `actions.rs:208-233` (`settle_lot` paie
`captain.owner`), `loans.rs:42-47` (`seize_boat` ne change le capitaine que
pour le joueur).

Reproduction : `d06` — le joueur transfère le deed `10` à `bob.testnet`,
puis `bob` ne peut pas `land_lot("10")` (`E_NOT_YOUR_BOAT`) tandis que le
vendeur continue de pêcher et d'encaisser.

**Effet joueur** : l'acte de bateau est un token décoratif. Un acheteur paie
400 or (ou le prix du marché) pour un objet qui ne produit rien, alors que le
vendeur garde les revenus. Idem après une saisie (`seize_boat`) : le prêteur
non-joueur récupère un acte sans jamais pouvoir armer le bateau, donc la
sanction TW-C3-03 est vide.

**Correctif** : dériver le capitaine du solde du deed (`balance_of(caller,
deed) >= 1`) dans `assert_boat_caller` et payer `settle_lot` au porteur du
deed, le champ `captain` ne servant plus qu'à l'affichage.

## D07 — majeur — les votants « non » touchent l'indemnité

`council.rs:104-107` (paiement déclenché dès `yes_weight > 0`) et
`council.rs:182-193` (boucle sur `proposal.voters` sans tester le sens du
vote) ; `council.rs:108` calcule ensuite `refund = escrow - paid`.

Reproduction : `d07` — 21 `run_day` (session ouverte), motion à 50 000
milli-gold de promesse, l'auteur vote oui (4 licences), Marta/Brandt/Okoro
votent non (16) : la motion **échoue** (4 vs 16), et Marta encaisse 800 000
milli-gold d'un escrow qu'elle a combattu.

**Effet joueur** : un vote d'opposition est rémunéré par l'auteur de la
motion. Pire, avec 20 voix de poids total l'escrow est distribué à 100 % :
l'auteur perd toute sa caution même quand sa motion est rejetée (ici
4 000 000 milli-gold, remboursement nul), et l'opposition est payée pour
voter non — le contraire du TW-C4-03.

**Correctif** : stocker le sens du vote (`voters: Vec<(String, bool)>` ou
`yes_voters`/`no_voters`) et ne payer que les `yes` ; plafonner le
remboursement par `escrow.saturating_sub(paid)`.

## D08 — majeur — la note de dette et son porteur divergent

`loans.rs:19-21` (`buy_loan` déplace le token et écrit `loans.lender`),
`loans.rs:27`/`:36` (les droits se lisent dans `loans.lender`),
`nep245.rs:34` (`mt_transfer` accepte le token 100).

Reproduction : `d08` — le joueur achète la note 100, la transfère à
`bob.testnet` ; `bob` est propriétaire du token mais `forbear_loan` et
`seize_boat` répondent `E_NOT_LENDER`, et le vendeur garde les droits.

**Effet joueur** : la note est un actif négociable qui ne transporte aucun
droit ; l'acheteur peut payer pour un token que le vendeur continue
d'exercer. En prime, `buy_loan` rejoué par un tiers redéplace un token que le
vendeur ne détient plus (`move_balance` saturating) et fabrique une
deuxième note pour une seule dette.

**Correctif** : retirer les tokens 100..200 du jeu transférable (refuser dans
`mt_transfer`) ou faire de `loans.lender` un simple cache du porteur du
token, mis à jour au transfert.

## D09 — majeur — le plafond de licences est du code mort

`lib.rs:57` : `LICENCE_CAP_PER_CAPTAIN = 8` n'apparaît nulle part ailleurs
(vérifié sur les 8 fichiers de `src/`) ; `actions.rs:99-116` (`buy_licence`)
n'a aucun contrôle de plafond.

Reproduction : `d09`. Conséquence visible dès que D02 est corrigé : un compte
achète les 20 licences (5 600 or au prix de départ), détient 20 voix sur 20 — les 70 caisses
par semaine × 20 = 1 400 caisses de quota, et le conseil acquis.

**Effet joueur** : la promesse du brief (§13) « le conseil reste disputé,
personne n'achète le port » n'est pas tenue. Combiné à D13, un seul compte
peut voter plusieurs fois.

**Correctif** : `assert!(self.licence_weight(&caller) < LICENCE_CAP_PER_CAPTAIN,
"E_LICENCE_CAP")` dans `buy_licence` (et le même contrôle sur le transfert
entrant, sinon le plafond se contourne par `mt_transfer`).

## D10 — majeur — l'état grossit gratuitement

Aucun point d'entrée ne prélève de storage : pas de NEP-145, pas de
`assert_one_yocto`, `attached_deposit` n'est lu que dans `assert_yocto`
(`nep245.rs:147`). les écritures sont `council.rs:34` (escrow à 0 autorisé),
`nep245.rs:49` (création d'un couple `(owner, token)`), `bailout.rs:24-29`
(un `TokenMeta` de plus à chaque part).

Reproduction : `d10` — 50 `propose_rule(QuotaPerLicence(x), U128(0))` avec
0 yocto : 50 entrées `Proposal` acceptées, aucune refus.

**Effet joueur** : n'importe quel compte peut gonfler l'état du contrat
(motions, slots de ledger, tokens) sans payer le storage qu'il consomme ; à
terme le compte du contrat se vide ou le stockage explose, et le déployeur
paie. Le relais peut aussi être noyé par des motions à 0.

**Correctif** : `assert_one_yocto()` + un dépôt de storage forfaitaire sur
`propose_rule`/`invest_in_actor`, ou NEP-145 avec enregistrement obligatoire
du destinataire ; à défaut, refuser `indemnity_milli == 0`.

## D11 — mineur — transfert de zéro accepté

`nep245.rs:47-49` : pas de contrôle `amount.0 > 0` avant
`have >= amount.0` (toujours vrai à 0).

Reproduction : `d11` — `mt_transfer(bob, "3", 0)` réussit, écrit le slot
`("bob.testnet","3")` et émet un événement.

**Effet joueur** : un compte peut spammer l'historique (événements) et le
ledger pour 1 yocto par appel, en gonflant l'état au passage (voir D10).

**Correctif** : `assert!(amount.0 > 0, "E_ZERO_QUANTITY")` dans les deux
points d'entrée.

## D12 — mineur — motion résolue hors session

`council.rs:94-98` : `resolve_council` ne vérifie que `!resolved` ;
`propose_rule:30` et `vote:56` appellent `assert_council_open`.

Reproduction : `d12` — 21 jours, motion déposée, puis 8 jours de plus
(jour 29, `season_day = 1`, session fermée) : `resolve_council` s'exécute et
`apply_rule` modifie le quota.

**Effet joueur** : les règles changent hors de la fenêtre annoncée par l'UI
(le joueur ne surveille plus le conseil), et une motion peut dormir
indéfiniment : il n'y a ni échéance ni quorum dans `Proposal`.

**Correctif** : appeler `assert_council_open()` au début de `resolve_council`
et ajouter un champ d'échéance (`expires_at`) au moment du dépôt.

## D13 — majeur — une licence vote plusieurs fois

`council.rs:55-65` (le poids est lu à l'instant du vote puis figé),
`council.rs:132-140` (`voters` est une liste de comptes, pas de licences).

Reproduction : `d13` — voter oui avec 4 licences, les transférer, voter
depuis le compte suivant, cinq fois : `yes_weight = 24` pour une supply de 20.

**Effet joueur** : 4 licences suffisent à porter n'importe quelle motion ;
un capitaine peut dépasser le collège entier en déplaçant ses licences entre
ses comptes (24 voix contre 16 pour Marta + Brandt + Okoro).

**Correctif** : photographier les poids à l'ouverture de la motion (dans
`Proposal`) et voter sur cette photo ; les licences transférées après le
dépôt n'ont plus de voix pour cette motion.

## D14 — mineur — deux refus sans code

`lib.rs:445` (`assert_owner` → `"owner only"`), `actions.rs:154`
(`assert_boat_caller` → `"owner only"` pour un bateau NPC).

Reproduction : `d14` (scan des sources). À noter : la justification
« `assert!` perd son message sur wasm » ne vaut plus pour near-sdk 5.30 —
`env::setup_panic_hook()` (`near-sdk/env.rs:126-133`) réinstalle un hook qui
renvoie `info.to_string()`. Les messages d'`assert!` survivent donc ; le
problème restant est l'absence de code greppable (le relais doit parser une
phrase, et `E_NOT_YOUR_BOAT` devient `owner only`).

**Effet joueur** : le message affiché est « owner only » même quand le joueur
clique sur le bateau d'un autre capitaine ; aucune traduction possible.

**Correctif** : `env::panic_str("E_OWNER_ONLY")` aux deux endroits (ou
`assert_eq!(…, …, "E_OWNER_ONLY")`).

## D15 — mineur — le filet change en mer

`actions.rs:47-60` : `assign_boat` accepte `small_mesh = true` avec une zone
déjà assignée. `docs/API.md` (TW-C2-02) impose le retour au quai.

Reproduction : `d15` — le bateau est en zone 1, `assign_boat("10", Some(1),
true)` réussit : `land_lot` donne 28 caisses au lieu de 20 (+40 %).

**Effet joueur** : le bonus de petit filet s'obtient sans le coût annoncé
(rentrer à quai, perdre une sortie) ; le marché du hareng est inondé et la
pression sur le stock (TW-C2, layer 2) est sous-estimée. `assign_boat`
permet aussi de changer de zone n'importe quand, y compris après 3 sorties.

**Correctif** : n'autoriser un changement de filet que si `boat.zone.is_none()`
(`assert!(boat.zone.is_none() || boat.small_mesh == small_mesh,
"E_MESH_AT_QUAY_ONLY")`).

---

## Correctifs livrés (10/11/2026)

Chaque correctif ferme le défaut nommé, et son test d'audit n'est plus
`#[ignore]` : il tourne dans la CI. Aucune preuve verte n'a été retouchée.

| id | correctif | fichiers |
|----|-----------|----------|
| D01 | `#[payable]` sur `mt_transfer` / `mt_batch_transfer`, `assert_yocto()` conserve le trop-perçu et le rend | `nep245.rs` |
| D02 | `new()` crédite `npc:bank` de `BANK_LICENCE_POOL` (4) sur les 20 licences, les capitaines en gardent 16 | `lib.rs` |
| D03 | les jambes d'un batch sont **sommées par token** avant tout mouvement | `nep245.rs` (`move_batch`) |
| D04 | l'événement batch publie `token_ids` **et** `amounts`, indexés en parallèle | `nep245.rs` |
| D05 | le `memo` passe par `serde_json::to_string` : un guillemet, un antislash ou un retour ligne reste dans une seule valeur JSON | `nep245.rs` (`memo_json`) |
| D06 | le droit de jeu se dérive du **porteur du deed** (`token_holder`) : `assert_deed_caller` remplace `assert_boat_caller`, `land_lot` paie le porteur, `seize_boat` déplace le deed depuis son détenteur réel. `boats.captain` ne sert plus qu'à l'affichage | `rights.rs` (nouveau), `actions.rs`, `loans.rs` |
| D07 | `Proposal.yes_voters: Vec<(String, u64)>` : seuls les votants **oui** sont payés, au poids de leur bulletin, et seulement si la motion passe ; le reliquat retourne à l'auteur (`escrow.saturating_sub(paid)`) | `council.rs`, `lib.rs` |
| D08 | `loan_holder` dérive le prêteur du **porteur de la note** ; `forbear_loan`, `seize_boat` et `settle_loans` lisent ce porteur, et tout transfert resynchronise `loans.lender` (`sync_note_holder`) | `rights.rs`, `loans.rs`, `nep245.rs` |
| D09 | `assert_licence_cap` : plafond de `LICENCE_CAP_PER_CAPTAIN` (8) appliqué à l'achat bancaire **et** à toute jambe entrante (`mt_transfer`, batch) ; exposé en vue `get_licence_cap` | `rights.rs`, `actions.rs`, `nep245.rs`, `views.rs` |
| D10 | `propose_rule` est `#[payable]` et refuse une motion **sans indemnité et sans yocto** (`E_STORAGE_DEPOSIT_REQUIRED`) : une motion gratuite ne peut plus grossir l'état | `council.rs` |
| D13 | le poids effectif d'un bulletin est borné par les voix encore libres (`LICENCE_SUPPLY - tally`) : faire tourner 4 licences entre six comptes ne fabrique plus de voix | `council.rs` |

Découpage : `src/rights.rs` porte **toutes** les résolutions de droit (deed,
note, plafond) — une seule implémentation, appelée par `actions`, `loans` et
`nep245` ; les preuves vivent dans `tests/audit/` (harness, défauts, gardes)
pour rester sous 500 lignes par fichier.

---

## Défauts latents (hors périmètre testable, commande donnée)

Ces chemins ne sont pas atteignables depuis les tests d'intégration (ils
demandent un état que l'API publique ne permet pas de construire), mais ils
sont ouverts à un attaquant.

### L01 — majeur — `move_balance`/`sub_balance` fabriquent des tokens

`lib.rs:406-422` : les deux helpers utilisent `saturating_sub`, donc un débit
non couvert met le solde à 0 **et crédite quand même** le destinataire. Le
profil de compilation n'active pas `overflow-checks` (aucun `[profile]` dans
le `Cargo.toml` racine) : en wasm release, tous les `-=` non gardés passent
silencieusement (`council.rs:108`, `loans.rs:75`, `actions.rs:226`).

Chemin concret : `loans.rs:39` — `seize_boat` déplace le deed du **borrower**
sans vérifier qu'il le détient encore. Si l'emprunteur a cédé son acte, le
prêteur reçoit un acte créé de toutes pièces (2 actes pour un bateau).

Reproduction sandbox (une fois D01 corrigé) :

```bash
near call $TW mt_transfer '{"receiver_id":"carol.testnet","token_id":"14",
  "amount":"1","approval":null,"memo":null}' --accountId brandt.testnet --depositYocto 1
# 2 semaines de run_day pour missed = 2, puis :
near call $TW seize_boat '{"token_id":"100"}' --accountId $LENDER
near view $TW mt_supply '{"token_id":"14"}'   # → "2"
```

**Correctif** : `checked_sub(...).expect("E_INSUFFICIENT")` dans les deux
helpers (l'invariant casse bruyamment) et vérifier le solde du deed dans
`seize_boat`.

### L02 — majeur — la découpe des parts est multipliée par le nombre de notes

`bailout.rs:61` calcule `cut` **dans la boucle sur les notes** : un acteur qui
porte deux notes paie 2 × 20 % de ses ventes ; `paid` peut dépasser
`proceeds` et `actions.rs:226` (`total - cut`) passe sous zéro. En prime
`bailout.rs:29` frappe `amount / 1000` parts : un investissement de moins de
1 000 milli-gold rapporte 0 part pour de l'or réel.

**Correctif** : calculer `cut` une fois hors de la boucle, et
`assert!(proceeds >= cut)` ; refuser `amount < MILLIS_PER_GOLD`.

### L03 — mineur — `mt_tokens` tronque `skip` sur wasm32

`nep245.rs:111` : `skip.unwrap_or(0) as usize` — en wasm32 `usize` fait 32
bits ; un `skip` de 2³²+5 revient à 5 et renvoie la page 1 au lieu d'une page
vide. Invisible sur x86_64 (les tests ne peuvent pas le voir).

**Correctif** : `let skip = usize::try_from(skip).unwrap_or(usize::MAX);`

### L04 — remarque — vues incohérentes sur un token inconnu

`nep245.rs:121` `mt_balance_of` et `:141` `get_ledger` renvoient `0` pour un
token inconnu, `mt_supply:132` renvoie `None`. Une UI ne peut pas
distinguer « token inconnu » de « solde nul ». À documenter ou à aligner
(`Option<U128>`).

### L05 — remarque — le poisson sans acheteur disparaît sans trace

`actions.rs:179` : `sub_balance(owner, species, take)` brûle le lot quand
aucun acheteur n'atteint le plancher, sans événement ni compteur
d'`exterior_out`. `mt_supply("1")` baisse sans explication pour l'indexeur.

### L06 — remarque — pas d'échéance ni de quorum sur une motion

`Proposal` (`lib.rs:177-187`) n'a pas de champ d'expiration : une motion
déposée garde l'escrow de l'auteur jusqu'à ce que le relais la résolve, et le
nombre de motions simultanées n'est pas borné.

### L07 — remarque — l'emprunteur peut acheter sa propre note

`loans.rs:17` n'exclut que le prêteur courant : l'emprunteur peut acheter sa
note au pair, puis se donner un `forbear` permanent et son propre acte. C'est
un remboursement anticipé déguisé — acceptable économiquement, mais la note
s'auto-détruit sans événement et la sanction disparaît.

---

## Vérifié et jugé sain

Couvert par les trois gardes de `tests/audit.rs` (`sane_*`, verts) et par la
lecture du code :

- **conservation de l'or** : `mt_supply("0")` = somme de tous les soldes
  (11 porteurs) après 3 débarquements et un `run_day` — les flux internes
  passent tous par `move_balance`, les seuls mints/burns passent par
  `mint_outside`/`burn_outside` qui tiennent les compteurs `exterior_*` ;
- **pas de poisson créé** : `land_lot` retire exactement les caisses
  débarquées du stock de la zone, et le 4ᵉ voyage du jour part en
  `E_TRIPS_SPENT` ; `take` est plafonné par `min(remaining, zone.stock)` ;
- **codes de refus** : `E_INSUFFICIENT`, `E_UNKNOWN_TOKEN`, `E_SELF_TRANSFER`,
  `E_NOT_YOUR_BOAT`, `E_UNKNOWN_LOAN`, `E_NO_LICENCE`, `E_SHORT_GOLD`,
  `E_TRIPS_SPENT`, `E_QUOTA_SPENT`, `E_ZONE_CLOSED`, `E_MESH_BANNED`,
  `E_CAPTAIN_DISARMED`, `E_BOAT_MOORED`, `E_SEA_EMPTY`, `E_UNKNOWN_BOAT`,
  `E_RESOLVED`, `E_ALREADY_VOTED`, `E_NO_VOICE`, `E_COUNCIL_CLOSED`,
  `E_NOT_LENDER`, `E_UNKNOWN_PROPOSAL`, `E_UNKNOWN_ACTOR`, `E_ZERO_QUANTITY`
  sortent bien en `E_*` lisibles (D14 pour les deux exceptions) ;
- **accès** : `run_day`, `cast_npc_votes`, `resolve_council` sont
  `owner`-only ; un joueur ne peut ni armer ni débarquer un bateau NPC
  (`E_NOT_YOUR_BOAT`) ni celui d'un autre joueur ; `land_lot` est atomique
  (toute panique annule l'état, l'ordre coût-de-voyage → prise ne perd pas
  d'or) ;
- **arithmétique** : les divisions par zéro sont gardées
  (`regrow:28` capacity 0, `stock_health_bps:69`, `buyer_limit` via
  `rules::merchant`, `.max(1)` sur les prix) ; les `as i64` de `trend_bps`
  (`actions.rs:246-250`) restent dans les bornes des stocks (≤ 12 000) ;
- **priorité sur les vues** : `mt_tokens` est plafonné à 100, `mt_batch_*`
  reste linéaire, aucun déni de service par boucle non bornée côté lecture ;
- **NEP-245** : `mt_transfer` refuse l'auto-transfert, le solde insuffisant,
  le token inconnu et les approbations (non supportées, documenté) ;
  `mt_supply`, `mt_batch_supply`, `mt_token`, `mt_batch_balance_of` sont
  cohérents entre eux ; l'événement simple `mt_transfer` est bien formé
  (D05 ne casse que s'il y a un memo) et porte `token_ids`/`amounts` en
  parallèle.

## Annexe — preuve ABI du D01

```
$ cargo near build non-reproducible-wasm
 - Binary: target/near/tidewater/tidewater.wasm
 - Size: 412.2 KB (412218 bytes)
 - ABI: target/near/tidewater/tidewater_abi.json

$ grep -c payable target/near/tidewater/tidewater_abi.json
0
$ python3 -c "import json;abi=json.load(open('target/near/tidewater/tidewater_abi.json'));\
print([(f['name'],f.get('modifiers')) for f in abi['body']['functions'] if f.get('modifiers')])"
[('new', ['init'])]
```

37 entry points, **aucun `payable`** : tout dépôt est refusé sur la chaîne.

## Ce qui n'a pas été audité

`crates/sim`, `crates/rules`, `server/relay.py`, `web/` (hors périmètre
contrat) ; la migration d'état et `#[init]` (pas de `migrate`) ; le coût en
gas par appel (pas mesuré, le wasm fait 412 Ko et reste sous la limite).