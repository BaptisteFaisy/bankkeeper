# Tidewater — les faveurs (le conseil n'est plus une addition de votes)

> Lot « favours », branche `feat/favours`, partie de `main` @9858ce2.
> Code : `crates/sim/src/favours.rs` (+ crochets dans `lib.rs`, `relay.rs`,
> `season.rs`, `bots.rs`, `views.rs`), seuils dans `crates/rules/src/config.rs`.

## Le livre de chaque capitaine

Hale, Brandt et Okoro tiennent chacun un livre envers le joueur :
`Favour { actor, score, reason }`, score **borné à [−5, +5]**, exposé par
`GET /api/state` sous `favours: [{actor, score, reason}]` (slug d'acteur :
`hale`, `brandt`, `okoro`).

| Événement joueur | Δ | Ligne enregistrée |
| --- | --- | --- |
| Renflouer un capitaine arrêté (`refloat`) | **+3** | `You put Brandt back on its feet.` |
| Acheter sa dette puis accorder un report (`defer`) | **+2** | `You gave Brandt time on his note.` |
| Acheter sa dette puis saisir la coque (`seize`) | **−4** | `You seized his hull.` |
| Lui vendre une licence sous le prix courant | **+1** | `You sold Brandt a licence under the going price (50 against 70).` |
| Lui acheter une licence au prix courant | **0** | — (commerce, pas de rancune) |

Chaque mouvement journalise `Brandt remembers: <ligne> Favour +3 (was 0).`

## Effet au conseil (`season::roll_season`)

Le score décale le seuil économique, il ne le remplace jamais :

- `score >= +3` : vote **pour** sauf si la motion lui coûte plus de **20 %**
  (`favour_owe_slack_bps = 2 000`) du profit que les règles en vigueur lui
  verseraient ;
- `score <= −3` : vote **contre** sauf si l'indemnité du joueur dépasse son
  coût de **30 %** (`favour_grudge_premium_bps = 3 000`, soit `1,3 × coût`) ;
- entre les deux : comportement économique inchangé (non-régression testée).

La ligne de vote gagne sa clause : `Brandt votes yes: … (he owes you one)`,
`Okoro votes no: … (you seized his hull)`. La saisie étant le seul événement
négatif, une rancune se lit toujours comme une coque prise.

## Effet sur la pêche (`bots::decide_all` → `favours::book_kept`)

- `score <= −3` : dès qu'il est à court pour sa traite (`desperate_for_cash`,
  TW-C3-04), le capitaine passe au **petit maillage** par dépit — jamais si le
  conseil l'a interdit.
- `score >= +3` : il **quitte la zone du joueur** (dernière zone où le joueur a
  péché, lue au journal) pour le meilleur rendement **hors** celle-ci, si
  l'écart est inférieur à **15 %** (`favour_zone_slack_bps = 1 500`).

## Seuils mesurés (graine 11, saison réelle de 28 jours)

Brandt, quota 60 : profit 8 003 pièces contre 9 507 sous les règles en
vigueur, soit **1 504 pièces abandonnées = 15,8 %** → un Brandt à +3 accepte ;
au quota 56 la perte monte à **22,1 %** et il refuse. Le seuil de 20 % tombe
donc entre 58 (19,0 %, accepté) et 56 (22,1 %, refusé).

Rancune : coût 1 504 → il faut `> 1,3 × 1 504 = 1 955` pièces d'indemnité sur
la saison, soit **62 pièces par licence et par semaine** (8 licences × 4
semaines = 1 984) ; à 61 (1 952) il vote encore non. Mesuré en CLI : 61 →
`Brandt votes no … (you seized his hull)`, 62 → `Brandt votes yes …`.

## Démonstration CLI (même motion, même graine)

```
sim init --seed 11 --out a.json && sim council --state a.json --action propose --rule quota60
sim init --seed 11 --out b.json && sim council --state b.json --action propose --rule quota60
sim favour --state b.json --actor brandt --score 3     # debug : écrit le livre
# 28 × sim day --state {a,b}.json
```

- score 0 : `Brandt votes no: a 60-crate quota costs him 376 a week, your offer pays 0.`
  → **4 pour, 16 contre, la motion échoue** ;
- score +3 : `Brandt votes yes: … (he owes you one)` → **12 pour, 8 contre, la motion passe**.

Le score +3 se gagne en jeu par `sim refloat --investor you --actor brandt` sur
un capitaine arrêté (voir le test `a_rescue_puts_a_captain_in_credit_and_flips_a_borderline_motion`).

## Fragile

- Le livre **dérive** : +3 (renflouement) puis −4 (saisie) laisse −1, donc
  neutre — un capitaine peut être successivement sauvé et dépouillé sans
  garder trace du premier geste. C'est voulu (le dernier geste parle) mais
  c'est le point à trancher si l'on veut une mémoire longue.
- Un score positif ne protège pas d'une motion franchement mauvaise : au-delà
  de 20 % de perte, l'intérêt reprend la main.
- La clause « you seized his hull » est déduite du **signe** du score : tant
  que la saisie est le seul événement négatif, elle est vraie.
- Le `--price` de `sim licence` n'est pas encore exposé par le relais web
  (`server/simclient.py` inchangé) : la remise se donne en CLI seulement.
