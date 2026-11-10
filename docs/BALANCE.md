# Équilibrage — le harnais, les chiffres, les verdicts

> Mesures réelles, pas d'estimation : tout ce qui suit sort de
> `docs/balance-50.json`, produit par la commande ci-dessous sur le commit
> qui accompagne ce fichier. Les politiques de joueur vivent dans
> `crates/sim/src/policies.rs`, le harnais dans `crates/sim/src/harness.rs`.

## La commande

```
make balance
# équivalent exact :
cargo build --release -p sim
./target/release/sim harness --seeds 50 --seasons 3 --json docs/balance-50.json
```

Durée mesurée : **0,8 s à 4,4 s de jeu** selon la charge de la machine, pour
50 graines × 4 politiques × 3 saisons de 28 jours (200 campagnes, 16 800
journées), plus 5 à 15 s de compilation incrémentale : `make balance` complet
tient entre 6 s et 20 s observés. Build release à froid : ~70 s, donc la cible
reste sous les deux minutes dans tous les cas.

Chaque campagne part d'un état neuf (`seed_game`), joue 3 saisons de 28 jours
(`days_per_week` 7 × `weeks_per_season` 4) et s'arrête à la fin de la campagne.
La politique du joueur est une **décision du matin** prise sur le journal
seulement (prises de la veille, lignes de zone, prix des licences) : aucune
politique ne lit les stocks réels, donc le harnais n'offre pas au joueur le
sondage que le jeu facture 80 or. Les ordres passent par `Game::assign_boat`,
ce qui conserve la règle « les filets se changent à quai » (TW-C2-02) : une
politique qui veut un autre filet rentre d'abord au port, comme une main.

## Les quatre politiques

| politique | ce qu'elle fait chaque matin |
|---|---|
| `passive` | rien : les bateaux restent à quai (c'est le `ff` actuel, sans joueur) |
| `greedy` | tout sur la zone à la meilleure prise par sortie de la veille, **petit maillage** tant que le quota hebdomadaire le permet |
| `steward` | deux bateaux fixes sur le banc qui décroche le plus vite dans le journal, **grand maillage**, achète une licence par semaine pour la laisser à quai, vote la baisse de quota (50 au lieu de 70) |
| `mixed` | `greedy` la première saison, `steward` les suivantes |

## Résultats — valeur nette finale (or)

Net worth = bourse + licences au prix courant + coques au prix du neuf, la
formule exacte du bilan de fin de saison (`season::season_bilan`).

| politique | médiane | p10 | p90 | min | max |
|---|---:|---:|---:|---:|---:|
| `passive` | 782,0 | 782,0 | 782,0 | 782,0 | 782,0 |
| `greedy` | 16 752,2 | 15 942,1 | 17 859,5 | 13 779,7 | 18 398,8 |
| `steward` | **16 837,2** | 15 422,7 | 18 634,2 | 12 726,0 | 19 696,7 |
| `mixed` | 14 476,9 | 12 891,8 | 16 705,0 | 12 605,8 | 17 843,6 |

Mise de départ du joueur : **150 or**. Le passif finit à 782 or (deux coques,
une bourse négative de 18 or et zéro licence).

## Résultats — la mer, stock final par zone (caisses)

Capacités de départ : Shallows 3 000, Greybank 5 000, Deeps 2 000.

| politique | zone | médiane | p10 | p90 | min | max |
|---|---|---:|---:|---:|---:|---:|
| `passive` | Shallows | 1 526 | 1 285 | 1 811 | 1 172 | 2 530 |
| | Greybank | 982 | 862 | 1 175 | 663 | 1 385 |
| | Deeps | 744 | 607 | 954 | 519 | 1 614 |
| `greedy` | Shallows | 805 | 633 | 1 256 | 581 | 2 052 |
| | Greybank | **469** | 351 | 621 | **0** | 715 |
| | Deeps | 365 | 316 | 549 | 201 | 1 056 |
| `steward` | Shallows | 1 431 | 926 | 2 184 | 809 | 2 504 |
| | Greybank | 732 | 606 | 1 091 | 363 | 1 231 |
| | Deeps | 330 | 233 | 444 | 190 | 1 380 |
| `mixed` | Shallows | 1 370 | 850 | 2 272 | 636 | 2 751 |
| | Greybank | 694 | 426 | 971 | 360 | 1 125 |
| | Deeps | 318 | 222 | 432 | 177 | 836 |

Médiane du stock à chaque fin de saison (S/G/D) — la pente compte plus que le
point d'arrivée :

| politique | fin saison 1 | fin saison 2 | fin saison 3 |
|---|---|---|---|
| `passive` | 2 772 / 1 934 / 1 952 | 1 947 / 1 300 / 1 254 | 1 526 / 982 / 744 |
| `greedy` | 2 856 / 1 248 / 1 920 | 1 771 / 651 / 857 | 805 / 469 / 365 |
| `steward` | 2 865 / 1 560 / 1 809 | 2 244 / 1 074 / 597 | 1 431 / 732 / 330 |
| `mixed` | 2 856 / 1 248 / 1 920 | 2 160 / 854 / 585 | 1 370 / 694 / 318 |

## Résultats — faillites et licences

| politique | faillites (runs) | part | jour médian de la 1re faillite | licences (médiane) | or final (médiane) |
|---|---:|---:|---:|---:|---:|
| `passive` | 50 / 50 | **100 %** | **13** | 0 | −18,0 |
| `greedy` | 0 / 50 | 0 % | — | 4 | 14 244,3 |
| `steward` | 0 / 50 | 0 % | — | 6 | 14 100,8 |
| `mixed` | 0 / 50 | 0 % | — | 6 | 11 728,5 |

Une faillite = mise à sec (`lay_up`) du joueur en cours de campagne ; un joueur
à sec ne se relève pas, donc le compte vaut 0 ou 1.

## Déterminisme

Deux campagnes identiques (même graine, même politique) donnent le même
`history_hash` — vérifié par `same_seed_same_campaign_hash`. Empreintes de la
graine 1 :

| politique | `history_hash` |
|---|---|
| `passive` | 16229480967261795005 |
| `greedy` | 13800243507755941065 |
| `steward` | 5930461453468913131 |
| `mixed` | 2877246375283126811 |

## Verdict 1 — la mer tient-elle ? **Non.**

Sous toute politique active, les deux bancs réellement exploités finissent entre
**9 % et 18 % de leur capacité** : Greybank 469 en `greedy`, 732 en `steward`
pour 5 000 au départ (9,4 % et 14,6 %) ; Deeps 318–365 pour 2 000 (16–18 %).
Les Shallows, moins pêchés, s'en sortent mieux mais restent à 27 % (`greedy`) et
48 % (`steward`) de leurs 3 000 caisses. La pente ne s'inverse pas pendant la
campagne : entre la saison 2 et la saison 3, `greedy` reperd 28 % de Greybank et
`steward` 32 %. Aucun plancher n'est atteint — le stock continue de descendre
tant que quelqu'un pêche.

Deux nuances, toutes deux dans les chiffres :

- la mer s'effondre **aussi sans le joueur** : en `passive`, Greybank passe de
  5 000 à 982 en trois saisons, uniquement à cause de la flotte PNJ et du
  maillage que Brandt prend quand il est à court. Le joueur accélère la chute,
  il n'en est pas la cause unique ;
- l'effondrement peut être **définitif** : sur la graine 47 en `greedy`,
  Greybank finit à **0 caisse**, et un stock à zéro ne repousse jamais (TW-N-04).
  Un seul run sur 50, mais la porte est ouverte.

## Verdict 2 — une politique écrase-t-elle les autres ? **Non, sauf l'inaction.**

- `greedy` **0,51 %** sous `steward` en médiane (16 752 contre 16 837) : très
  loin du seuil de 40 % qui signalerait une stratégie dominante. En appariement
  par graine, `steward` gagne 27 fois sur 50, écart médian **+72 or**. Autrement
  dit : la différence entre piller et ménager est du bruit à l'échelle d'une
  campagne. C'est en soi un résultat d'équilibrage : le jeu ne récompense pas
  la prudence.
- `passive` est écrasé — **21 fois moins** que les politiques actives — mais ce
  n'est pas une comparaison de stratégies, c'est le joueur qui ne joue pas.
- `mixed` est dominé par **chacune de ses deux moitiés** (−14 % contre
  `steward`, −14 % contre `greedy`) : commencer gourmand abîme la mer, et le
  steward des saisons 2–3 hérite d'un banc déjà cassé. Faire les deux n'est pas
  un compromis, c'est le pire des deux.

## Verdict 3 — le joueur peut-il perdre ? **Seulement s'il ne joue pas.**

`passive` : **100 % de faillites, toujours au jour 13** (le joueur paie 12 or de
salaires par jour pour deux coques qui ne sortent pas ; il est à −18 or quand la
semaine tombe). C'est le seul chemin vers la perte que le harnais trouve.

Toute politique active : **0 faillite sur 50 graines**, et le pire run actif
(`greedy`, 13 779,7 or) vaut encore **92 fois la mise de départ**. Le quota
bloque la pêche à 280 caisses par semaine (4 licences × 70), soit 40 caisses par
jour ; à 4–8 or la caisse, cela fait 160 à 320 or de recettes quotidiennes pour
12 or de salaires (2 coques × 6) et 12 à 42 or de sorties (6 sorties à 2–7 or),
soit une marge brute d'un facteur 3 à 13. Mesuré sur la campagne : +170 or nets
par jour en médiane. **Le risque est à sens unique** : le jeu punit brutalement
l'inaction et jamais l'action.

## Ce qui reste fragile

- **50 graines, mais peu de variance entre graines** : les p10/p90 des
  politiques actives tiennent dans ±7 % de la médiane. La graine change peu la
  partie ; ce sont les politiques qui font la variété. Un `--seeds 200` coûte
  ~15 s et resserrerait les médianes sans changer les verdicts.
- **Politiques volontairement simples** : pas de sondage, pas de note de prêt
  achetée, pas de sauvetage, pas de rachat de coque, pas d'indemnité au
  conseil.
- **`steward` ne gagne pas vraiment plus que `greedy`** : l'écart médian
  apparié (+72 or) tombe à **+13 or** une fois les licences retirées de la
  valeur nette. Le reste est un effet de valorisation : le prix de la licence
  va de 248 à 950 or selon le run (médiane 431,6 en `greedy`, 353,5 en
  `steward`), donc comparer des valeurs nettes qui contiennent des licences
  revient en partie à comparer des cours, pas des pêches. La conclusion tient :
  à la mer, les deux politiques se valent.
- **Le plafond de 8 licences par capitaine fuit** : il n'est vérifié qu'aux
  échanges de gré à gré et à l'appariement des vendeurs ; l'enchère du pool du
  lundi (`season::auction_pool`) ne le vérifie pas. Graine 7, jour 14 : Brandt
  détient **12 licences sur 20** pour un plafond de 8. Le conseil votant une
  voix par licence, un seul capitaine peut alors porter une motion à lui seul.
  Constaté par le harnais, **non corrigé** (aucune règle touchée dans ce lot).
- **`mixed` est un choix de conception, pas une mesure** : une seule façon
  d'alterner a été testée (greedy puis steward) ; alterner par semaine ou par
  marée donnerait autre chose.
- **Le harnais n'observe rien d'autre** : il ne dit pas *pourquoi* la mer
  s'effondre (quota, maillage, cibles d'achat), seulement *qu'elle s'effondre*.
  Les leviers candidats, dans l'ordre où les chiffres les désignent, sont le
  quota par licence (il mord sur tout le monde, mais Brandt en porte 8 et les
  autres 4), le prix de la caisse (4–8 or contre 12 or de salaires quotidiens)
  et la cible de stock de la conserverie. **Aucune constante n'a été touchée
  dans ce lot.**
