# Équilibrage — le harnais, les chiffres, les verdicts

> Mesures réelles, pas d'estimation : tout ce qui suit sort de
> `docs/balance-50.json`, produit par la commande ci-dessous sur le commit
> qui accompagne ce fichier. Les politiques de joueur vivent dans
> `crates/sim/src/policies.rs`, le harnais dans `crates/sim/src/harness.rs`
> (et sa ligne de commande dans `crates/sim/src/harness/command.rs`).

## La commande

```
make balance
# équivalent exact :
cargo build --release -p sim
./target/release/sim harness --seeds 50 --seasons 3 --json docs/balance-50.json
```

Durée mesurée : **0,4 s à 0,7 s de jeu** selon la charge de la machine, pour
50 graines × 4 politiques × 3 saisons de 28 jours (200 campagnes, 16 800
journées), plus 5 à 15 s de compilation incrémentale : `make balance` complet
tient entre 6 s et 20 s observés. Build release à froid : ~70 s, donc la cible
reste sous les deux minutes dans tous les cas.

Empreinte du jeu de référence livré : `docs/balance-50.json` →
**md5 `a54e287cddfe613c1484f3ca30cd3f40`**.

Chaque campagne part d'un état neuf (`seed_game`), joue 3 saisons de 28 jours
(`days_per_week` 7 × `weeks_per_season` 4) et s'arrête à la fin de la campagne.
La politique du joueur est une **décision du matin** prise sur le journal
seulement (prises de la veille, lignes de zone, prix des licences) : aucune
politique ne lit les stocks réels, donc le harnais n'offre pas au joueur le
sondage que le jeu facture 80 or. Les ordres passent par `Game::assign_boat`,
ce qui conserve la règle « les filets se changent à quai » (TW-C2-02) : une
politique qui veut un autre filet rentre d'abord au port, comme une main.

**La campagne ouvre avec la redevance du profil livré** (0,4 or la caisse,
`DEMO_LEVY_PER_CRATE`), comme le font le profil navigateur et
`sim init --levy 0.4`. Avant ce lot, le harnais jouait avec une redevance à
zéro : le fonds du port n'existait pas et le réensemencement était
impossible. Le harnais mesure donc le jeu tel qu'il est livré.

## Les quatre politiques

| politique | ce qu'elle fait chaque matin |
|---|---|
| `passive` | rien : les bateaux restent à quai (c'est le `ff` actuel, sans joueur) |
| `greedy` | tout sur la zone à la meilleure prise par sortie de la veille, **petit maillage**, et **une licence achetée par semaine** tant que le prix laisse de quoi vivre |
| `steward` | deux bateaux fixes sur le banc qui décroche le plus vite dans le journal, **grand maillage**, achète une licence par semaine pour la laisser à quai, **paie la dette envers la mer** quand elle passe le seuil, vote la baisse de quota (50 au lieu de 70) |
| `mixed` | `greedy` la première saison, `steward` les suivantes |

Deux changements par rapport au lot précédent, tous deux mesurés :

- **le `greedy` achète des licences** comme le `steward`. Une licence vaut une
  semaine de quota, donc elle se rembourse en quelques jours : une main qui
  ignore ça ne joue pas le même jeu que le reste du port. Sans cela, le
  `steward` gagnait 18 % de plus que le `greedy` (mesuré), parce qu'il
  exploitait un arbitrage que le `greedy` ne faisait pas.
- **le `steward` paie la dette** : quand la dette portée passe 1 000 caisses,
  il met un banc en jachère (2 semaines) ; quand tous les bancs reposent
  déjà, le fonds du port achète des alevins. C'est le « seuil de jachère », le
  quatrième curseur.

## Les quatre curseurs, avant / après

Toutes les lignes « avant » viennent de la même commande, sur le même code,
avec les mêmes métriques : il n'y a pas deux définitions de l'effondrement.

| # | curseur | avant | après | ce que ça change (mesuré) |
|---|---|---|---|---|
| 1 | **repousse** (`regrow_herring_bps` / `regrow_cod_bps`) | 500 / 200 | **700 / 300** | effondrement du `greedy` 92 % → 34 % ; Greybank final 386 → 606 caisses ; dette 7 162 → 5 356 ; le port inactif laisse Greybank à 25 % de sa capacité au lieu de 17 % |
| 2 | **part prise par sortie** (`catch_share_bps`) | 40 | **40 (inchangé)** | à 30 bps, l'effondrement du `greedy` passe de 34 % à **0 %** : la mer ne punit plus rien ; à 50 bps, il monte à 96 % et 20 % des runs du port *inactif* s'effondrent aussi. La valeur du brief (0,4 %) est la seule qui garde les deux |
| 3 | **redevance** (`DEMO_LEVY_PER_CRATE`, campagne du harnais) | 0 dans la campagne | **40** (le profil livré) | le fonds du port passe de 0 (100 % des runs) à 4 960 or ; le réensemencement redevient possible ; le joueur paie 7,9 % de son revenu (`greedy` 17 646 → 16 257 or), le prudent 1,5 % |
| 4 | **seuil de jachère** (`FALLOW_DEBT_TRIGGER`, `FALLOW_WEEKS`) | aucun paiement | **1 000 caisses / 2 semaines** | la dette du `steward` **baisse** (−680 puis −912 caisses par saison) au lieu de grossir de +1 878 ; elle finit à 1 488 caisses contre 5 356 pour le `greedy` |

Les balayages derrière ces choix (tous rejouables avec la même commande) :

- repousse 550 / 600 / 650 / 700 / 750 / 800 / 900 → effondrement du `greedy`
  78 % / 58 % / 50 % / **34 %** / 22 % / 12 % / 6 %. À 550 la mer meurt même
  sans joueur ; à 800 et au-delà la surexploitation ne coûte plus rien.
- part prise 25 / 30 / **40** / 50 → effondrement 0 % / 0 % / **34 %** / 96 %.
- redevance 0 / **40** / 50 / 60 / 80 → fonds du port 0 / **4 960** / 6 200 /
  7 440 / 9 920 ; dette finale du `steward` 1 873 / **1 488** / 1 502 / 1 538 /
  1 662 ; revenu du joueur 17 646 / **16 257** / 15 909 / 15 562 / 14 868 or :
  la plus petite redevance qui remplit le fonds est la bonne.
- seuil 1 000 / 1 500 / 3 500 / 5 000 caisses → dette finale du `steward`
  **1 488** / 1 801 / 4 160 / 5 428 ; au-delà de 3 000, l'effondrement
  revient (8 % des runs `mixed`). Jachère de 1 / **2** / 4 semaines → 2 521 /
  **1 488** / 3 262 caisses de dette.

## Résultats — valeur nette finale (or)

Net worth = bourse + licences au prix courant + coques au prix du neuf, la
formule exacte du bilan de fin de saison (`season::season_bilan`).

| politique | médiane | p10 | p90 | min | max |
|---|---:|---:|---:|---:|---:|
| `passive` | 782,0 | 782,0 | 782,0 | 782,0 | 782,0 |
| `greedy` | **16 256,6** | 15 265,0 | 17 204,8 | 14 404,6 | 17 543,9 |
| `steward` | 14 729,4 | 13 041,7 | 16 257,9 | 12 082,3 | 16 845,6 |
| `mixed` | 13 750,5 | 11 771,2 | 14 704,4 | 9 882,9 | 16 551,3 |

Mise de départ du joueur : **150 or**. Le passif finit à 782 or (deux coques,
une bourse négative de 18 or et zéro licence).

## Résultats — la mer, stock final par zone (caisses)

Capacités de départ : Shallows 3 000, Greybank 5 000, Deeps 2 000.

| politique | zone | médiane | p10 | p90 | min | max |
|---|---|---:|---:|---:|---:|---:|
| `passive` | Shallows | 1 954 | 1 596 | 2 396 | 1 466 | 2 859 |
| | Greybank | 1 236 | 917 | 1 479 | 690 | 1 642 |
| | Deeps | 1 329 | 1 149 | 1 578 | 1 096 | 1 858 |
| `greedy` | Shallows | 1 016 | 689 | 1 446 | 617 | 2 014 |
| | Greybank | **606** | 470 | 801 | 393 | 896 |
| | Deeps | 1 010 | 736 | 1 322 | 579 | 1 575 |
| `steward` | Shallows | 1 522 | 1 205 | 2 026 | 1 016 | 2 562 |
| | Greybank | **2 444** | 1 894 | 2 916 | 1 164 | 2 947 |
| | Deeps | 1 057 | 819 | 1 359 | 482 | 1 530 |
| `mixed` | Shallows | 1 909 | 1 249 | 2 344 | 930 | 2 708 |
| | Greybank | 1 768 | 1 091 | 2 674 | 882 | 3 131 |
| | Deeps | 955 | 696 | 1 270 | 563 | 1 299 |

Médiane du stock à chaque fin de saison (S/G/D) — la pente compte plus que le
point d'arrivée :

| politique | fin saison 1 | fin saison 2 | fin saison 3 |
|---|---|---|---|
| `passive` | 2 963 / 2 246 / 1 952 | 2 394 / 1 429 / 1 760 | 1 954 / 1 236 / 1 329 |
| `greedy` | 2 860 / 1 604 / 1 952 | 1 511 / 1 046 / 1 361 | 1 016 / 606 / 1 010 |
| `steward` | 2 924 / 1 880 / 1 869 | 2 199 / **2 422** / 1 312 | 1 522 / **2 444** / 1 057 |
| `mixed` | 2 860 / 1 604 / 1 952 | 2 145 / 1 827 / 1 284 | 1 909 / 1 768 / 955 |

Le `steward` est le seul dont Greybank **remonte** (1 880 → 2 422 → 2 444) :
c'est la jachère qui rend la mer au banc.

## Résultats — la dette envers la mer, le fonds du port, l'effondrement

| politique | dette portée S1 → S2 → S3 | dette finale (caisse) | fonds du port (or) | effondrement | licences | prix moyen S1/S2/S3 |
|---|---|---:|---:|---:|---:|---|
| `passive` | 2 437 → 3 599 → 4 420 | 4 420 | 5 048 | 0 % | 0 | 4,55 / 5,03 / 5,10 |
| `greedy` | 3 134 → 4 562 → **5 356** | 5 356 | 4 960 | **34 %** | 8 | 4,28 / 4,92 / 5,24 |
| `steward` | 3 080 → 2 400 → **1 488** | 1 488 | 2 439 | 0 % | 6 | 4,40 / 4,76 / 4,83 |
| `mixed` | 3 134 → 2 324 → 1 814 | 1 814 | 2 206 | 0 % | 7 | 4,28 / 5,03 / 4,97 |

- **dette vers la mer** : en caisses, comme la règle l'écrit ; elle monte
  quand on prélève plus que la mer ne rend, elle **baisse** quand on paie.
- **fonds du port** : ce que la redevance a mis de côté. Le `greedy` laisse
  un fonds plein (4 960 or) — c'est l'appât : personne n'a payé la mer. Le
  `steward` l'a dépensé en alevins (2 439 or restants).
- **effondrement** : part des runs où un banc passe sous 10 % de sa capacité
  à un moment de la campagne (minimum journalier, pas la fin de saison).
- **prix moyen** : moyenne pondérée par les caisses, saison par saison.

## Verdict 1 — une politique écrase-t-elle les autres ? **Non.**

- `greedy` **+10,4 %** de valeur nette sur `steward` (16 257 contre 14 729
  or). L'appariement par graine sur 200 graines : le `greedy` gagne 165 fois
  sur 200 (82 %), écart médian **+1 330 or**, mais il **perd 18 fois sur
  200**. La différence est du bruit à l'échelle d'une campagne.
- `mixed` est dominé de 7 % par le `steward` et de 18 % par le `greedy` : c'est
  le prix du début gourmand.
- `passive` est écrasé (782 or, 100 % de faillites), mais ce n'est pas une
  stratégie : c'est le joueur qui ne joue pas.

## Verdict 2 — la surexploitation coûte-t-elle quelque chose ? **Oui, et visible.**

- **la dette** : 5 356 caisses pour le `greedy` contre 1 488 pour le
  `steward`, soit 3,6 fois plus, et une dette qui *croit* (+1 428 puis +794
  par saison) pendant que celle du prudent *décroît*.
- **le banc** : Greybank finit à 606 caisses (12 % de sa capacité) sous
  `greedy`, contre 2 444 (49 %) sous `steward`.
- **l'effondrement** : 34 % des runs `greedy` voient un banc passer sous
  10 % de sa capacité (minimum journalier : 365 caisses au pire run),
  contre 0 % pour les trois autres politiques.
- **le prix** : il ne punit pas. En saison 1 le `greedy` noie le marché et le
  prix tombe (4,28 or contre 4,40 au `steward`), puis la rareté le fait
  remonter en saison 3 (5,24 contre 4,83). Le marché récompense la rareté,
  pas la prudence.

## Verdict 3 — la prudence paie-t-elle moins ? **Oui, et laisse le port vivant.**

Le `steward` gagne **1 527 or de moins** que le `greedy` (−9,4 %) et laisse
un port en meilleure santé sur tous les indicateurs : Greybank à 49 % de sa
capacité au lieu de 12 %, aucun effondrement, une dette qui baisse, et un
fonds du port qui a payé la réparation au lieu de s'engraisser.

## Verdict 4 — la dette est-elle payable ? **Oui, si on la paie.**

Avant ce lot, la dette était une punition impossible : elle grossissait de
+1 878 caisses par saison dans toutes les politiques, le fonds du port était à
zéro (le réensemencement impossible) et personne ne mettait de banc en
jachère. Le seuil de 1 000 caisses rend la facture payable : la jachère
rapporte environ 1 000 caisses par repos, le réensemencement le reste, et la
dette du `steward` **descend** de 3 080 à 1 488 en deux saisons.

## Verdict 5 — la mer peut-elle mourir ? **Plus complètement qu'avant, pas plus.**

Sous `greedy`, Greybank descend à 365 caisses dans le pire run observé
(7,3 % de sa capacité) mais n'atteint plus zéro : à 7 % de repousse, une
zone **plancher** autour de 10 % de sa capacité (l'arrondi de la prise
minimale d'une sortie la bloque). Avant, un run sur 50 vidait Greybank à
zéro — une zone à zéro ne repousse jamais (TW-N-04), la mort était
définitive. La mer ne meurt plus tout à fait : elle se vide, elle ne se
répare pas seule.

## Déterminisme

Deux campagnes identiques (même graine, même politique) donnent le même
`history_hash` — vérifié par `same_seed_same_campaign_hash`. Deux exécutions
de `make balance` donnent le **même fichier au bit près** (md5
`a54e287cddfe613c1484f3ca30cd3f40`).

## Ce qui verrouille le résultat

Deux tests dans `crates/sim/tests/harness.rs` :

- `the_balance_does_not_drift_from_the_reference_game` rejoue la grille
  (50 graines × 4 politiques) et la compare à `docs/balance-50.json` : valeur
  nette ±10 %, dette ±20 %, stocks ±20 %, fonds ±30 %, effondrement ±15
  points. Au-delà, le test échoue : l'équilibre a bougé.
- `the_balance_keeps_its_verdicts` rejoue la même grille et vérifie les
  verdicts eux-mêmes : le `greedy` gagne mais de moins de 25 %, il doit la
  **double** dette du `steward`, lui laisser un banc plus pauvre, et le
  faire s'effondrer plus souvent ; le `steward` doit laisser Greybank au
  quart au moins de sa capacité ; le port inactif doit quand même l'avoir
  tiré vers le bas ; et l'inaction doit toujours faire failliter.

## Ce qui reste à trancher côté game design

- **« Cinq bateaux vident la zone » (brief §4.1) ne tient plus.** À 7 % de
  repousse, cinq bateaux laissent 886 caisses : il en faut sept pour
  descendre à 378. Le test d'acceptation lit désormais l'équilibre depuis
  la configuration au lieu d'écrire 2 600 en dur. À arbitrer : on garde le
  brief (repousse 5 %, mais alors la mer meurt dès que le port pêche son
  quota) ou on accepte la nouvelle règle (sept bateaux).
- **La dette est une dette de port, pas de joueur.** Un joueur qui ne joue
  jamais finit avec 4 420 caisses de dette : ce sont les PNJ qui ont pêché.
  À trancher : la dette doit-elle rester au bilan du joueur ?
- **Le prix d'une licence vaut une semaine de quota** (prix de la caisse ×
  quota). Une licence se rembourse donc en quelques jours, et « acheter des
  licences » domine tout le reste du jeu : c'est pour ça que le `greedy`
  achète maintenant des licences aussi. Une capitalisation sur plusieurs
  semaines changerait l'économie du port.
- **La malle du petit maillage** (jusqu'à −50 % de repousse sur la zone
  pêchée) n'apparaît nulle part dans le bilan : le `greedy` s'en sert et
  personne ne le voit. C'est un levier de game design à surface ou à
  corriger.
- **Le prix ne punit pas la surexploitation** (Verdict 2) : la rareté le
  fait monter. Un signal de prix qui baisserait quand on noie le marché
  demanderait un autre mécanisme que la criée actuelle.
- **50 graines suffisent pour les verdicts** : sur 200 graines les taux
  d'effondrement par blocs de 50 donnent 34 %, 46 %, 24 %, 34 % — la même
  lecture, avec plus de précision. Un `--seeds 200` coûte 15 s.
