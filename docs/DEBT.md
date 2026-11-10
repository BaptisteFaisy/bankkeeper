# Barreau 4 — Hériter : la dette envers la mer

> Quatrième barreau de la colonne vertébrale (`docs/SPINE.md`). Le barreau 1
> montrait qui prenait quoi face à la prise durable ; le barreau 2 levait
> l'argent ; le barreau 3 liait la motion à son budget. Le barreau 4 écrit
> **la facture que tu laisses à la mer**, la porte d'une saison à l'autre dans
> la campagne, et donne au bilan sa deuxième colonne : **valeur nette et dette
> envers la mer**.

## 1. Principes

1. **Unité en caisses** : la dette se compte en caisses de poisson, pas en or.
   C'est l'unité que le joueur lit, celle de la mer. La conversion en or
   n'intervient qu'au moment de payer un réensemencement.
2. **Zéro sermon** : pas de moralisation, pas d'adjectif. Un relevé comptable
   brut : « Greybank a perdu 1 200 caisses ; la prise durable était de 62 par
   jour ; la dette envers la mer s'élève à 3 683 caisses ».
3. **Deux sorties collectives** :
   - **La jachère** : fermer une zone N semaines. La mer garde ce qu'elle
     aurait repoussé ; le port perd le revenu de la zone.
   - **Le réensemencement** : le fonds du port achète des alevins à l'étranger
     au prix du marché, les réintroduit dans la zone, et la dette baisse du
     même nombre de caisses.
4. **Continuité de la campagne** : la campagne (3 saisons par défaut) démarre
   chaque saison suivante avec le passif non apuré.

---

## 2. Formule de la dette de saison

Pour chaque zone $z \in \{\text{shallows}, \text{greybank}, \text{deeps}\}$ :

$$\text{debt}_z = \max\left(0, \text{taken}_z - \text{sustainable}_z \times \text{days}\right)$$

où :
- $\text{taken}_z$ est la somme des caisses débarquées de la zone $z$ au cours
  des $\text{days}$ jours de la saison (28 jours par défaut) ;
- $\text{sustainable}_z$ est la **prise durable journalière** de la zone,
  calculée par la formule logistique de repousse du barreau 1 (`stocks::sustainable_catch`) :

$$\text{sustainable}(S, K, r) = \left\lfloor \frac{S \times (K - S) \times r}{K \times 10\,000} \right\rfloor$$

avec :
- $S$ = stock actuel de la zone ;
- $K$ = capacité de la zone (`zone_capacity`, par ex. 5 000 pour Greybank) ;
- $r$ = taux de repousse en bps (500 bps = 5 % par jour pour le hareng).

La dette totale de la saison est la somme sur les trois zones :

$$\text{season\_debt} = \sum_{z} \text{debt}_z$$

Elle s'accumule dans le passif porté par la campagne :

$$\text{sea\_debt} \leftarrow \text{sea\_debt} + \text{season\_debt}$$

---

## 3. Les deux modes de paiement

### Mode A : La jachère (`pay_in_fallow`)

Une zone fermée pendant $W$ semaines produit un crédit de jachère égal à la
repousse que la mer effectue pendant ces jours :

$$\text{credit} = \text{regrow}(S, K, r) \times (W \times 7)$$

- La dette est diminuée de $\min(\text{credit}, \text{sea\_debt})$ ;
- La zone reste fermée (`closed[z] = true`) pendant les $W$ semaines ;
- Zéro or ne bouge : le coût est le manque à gagner des bateaux qui ne peuvent
  plus pêcher sur ce banc.

### Mode B : Le réensemencement (`pay_in_reseed`)

Le fonds du port finance l'achat de juvéniles :

$$\text{gold} = \text{crates} \times P_{\text{last\_week}}$$

- Le solde du fonds baisse de $\text{gold}$ ;
- Le stock de la zone $z$ augmente de $\text{crates}$ (plafonné à sa capacité $K$) ;
- Les flux extérieurs enregistrent la dépense sortante (`flows.reseed`) ;
- La dette envers la mer baisse de $\text{crates}$.
- **L'invariant de conservation de l'or est préservé** : la sortie de caisse du
  fonds est exactement égale au flux extérieur sortant.

---

## 4. Affichage au bilan

Le bilan (`Bilan`) porte désormais deux axes :
1. **Valeur nette** : or + licences au cours + coques au prix neuf (en or).
2. **Dette envers la mer** : passif accumulé (en caisses).

Dans l'interface web (`App.tsx`, `EndCardBody`) :
`Debt to the sea : X,XXX crates`
sans jugement moral, à côté des stocks restants et de la valeur nette.

---

## 5. Ce que le harnais mesure (50 graines × 4 politiques)

`docs/BALANCE.md` porte les chiffres complets. En résumé, sur une campagne de
3 saisons :

| politique | dette portée S1 → S2 → S3 | dette finale | fonds du port |
|---|---|---:|---:|
| `greedy` | 3 134 → 4 562 → 5 356 | 5 356 | 4 960 or (intact) |
| `steward` | 3 080 → 2 400 → 1 488 | 1 488 | 2 439 or (dépensé) |
| `passive` | 2 437 → 3 599 → 4 420 | 4 420 | 5 048 or (intact) |

- **La dette se paie** : dès qu'un joueur met un banc en jachère (le seuil
  mesuré est 1 000 caisses), la dette **baisse** au lieu de grossir. Le
  réensemencement (le fonds du port achète des alevins) paie le reste.
- **Sans paiement, elle est une punition** : avant le réglage, elle grossissait
  de +1 878 caisses par saison dans *toutes* les politiques, et le fonds du
  port était à zéro (redevance à 0 dans le harnais), donc le
  réensemencement était impossible.
- **La dette est de port, pas de joueur** : le joueur qui ne joue jamais finit
  quand même avec 4 420 caisses de dette — ce sont les PNJ qui ont pêché.
  Point de game design ouvert.

