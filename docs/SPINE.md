# Bankkeeper — la colonne vertébrale

> Troisième document de conception. Les deux premiers empilaient des frontières :
> marché, licences, mémoire, faveurs, écologie, science, politique. Celui-ci fait
> l'inverse — il cherche **l'axe unique** de l'idée de base et propose de le
> creuser jusqu'au bout, en absorbant les autres idées comme des conséquences.

## L'idée de base, en une phrase

**Ce que je prends aujourd'hui coûte à quelqu'un d'autre, et à demain.** Tout le
reste — licences, dettes, conseil, criée commune, science, population — n'est
qu'une manière de répondre à cette phrase. Le jeu a déjà l'externalité ; il ne
l'a pas encore **montrée, chiffrée, gouvernée, ni léguée**.

## L'étoile polaire, troisième

> À la fin, le jeu peut te présenter **la facture que tu laisses**, détaillée,
> avec ton nom sur la ligne.

Pas un sermon : un relevé. « Greybank a perdu 1 200 caisses cette saison. 46 %
viennent de tes bateaux. La redevance que tu as votée a payé 3 relevés et deux
semaines de jachère. Il reste 8 400 caisses de dette envers la mer. »

## Les cinq barreaux

Chaque barreau **utilise** le précédent. On ne passe au suivant que quand le
précédent est lisible à l'écran.

### Barreau 1 — Voir : l'attribution

**Mécanique.** Le registre du port décompose la baisse d'une zone par capitaine :
`Greybank, cette saison : −1 200 caisses. Toi 46 %, Brandt 31 %, Hale 23 %.`
Et à côté, la **prise durable** de la zone (ce que la repousse peut donner sans
s'appauvrir) : `tu as pris 1,8 × la part durable`.

**Pourquoi c'est le premier.** Sans attribution, tout le reste est de la
morale. Avec elle, le joueur *voit* son externalité, chiffrée, à côté de celle
des autres. C'est aussi la donnée dont dépendent les quatre barreaux suivants.

**Ce qui existe déjà.** `DayRecord.captain_crates[captain]`, `record.crates[zone]`,
`record.trips[zone]`, la repousse logistique. Tout est là ; il manque l'agrégat
et l'écran.

**Coût.** Faible (½ journée). **Risque.** Aucun — sauf de rendre le jeu triste.

### Barreau 2 — Payer : la redevance et le fonds

**Mécanique.** Le conseil vote une **redevance de débarquement** (or par caisse,
par exemple 0,2 à 1,0). Elle est prélevée sur chaque lot vendu et versée à un
**fonds du port** — un compte séparé, visible, avec un solde. Le fonds paie :
les relevés (barreau 1 et science), la jachère (barreau 5), le secours aux
habitants, et les **indemnisations** de ceux que les règles pénalisent.

**Pourquoi c'est le deuxième.** C'est la réponse classique à l'externalité :
la mettre en prix. Et ça transforme le conseil : on ne vote plus seulement un
quota, on vote **qui paie et qui reçoit**. Un quota sans indemnité est un vote
perdu ; une redevance sans quota est un fonds vide.

**Ce qui existe déjà.** `port.gold` par acteur, `roll_week` (prélèvements),
`round_season` (vote). Il faut un compte `Fund`, deux motions et l'affichage.

**Coût.** Moyen (1 journée). **Risque.** La redevance peut être capturée : celui
qui détient les licences vote la redevance qui frappe les autres. C'est
intéressant — mais il faut que le joueur puisse le dénoncer (barreau 3).

### Barreau 3 — Gouverner : la motion et la preuve

**Mécanique.** Toute motion est votée **avec son financement** : « quota 50 +
indemnité 400 par licence, payée par le fonds ». Et le vote de chaque capitaine
s'affiche avec **ce qu'il gagne et ce qu'il perd** — déjà fait — plus une ligne
nouvelle : `ce qu'il a pris au banc cette saison` (barreau 1). Le joueur peut
donc construire une majorité sur des chiffres, pas sur des promesses.

**Pourquoi c'est le troisième.** C'est là que l'attribution et la redevance
deviennent politiques : on vote en sachant qui a causé quoi et qui paiera.

**Ce qui existe déjà.** `council.rs` (motions, indemnité, lignes de
raisonnement), les votes pondérés par licence. Il faut lier la motion au fonds.

**Coût.** Faible-moyen (½ journée), une fois le barreau 2 en place.
**Risque.** La complexité des motions (quota + redevance + indemnité) : deux
curseurs suffisent, pas trois.

### Barreau 4 — Hériter : la dette envers la mer

**Mécanique.** À la fin de chaque saison, on calcule une **dette envers la mer** :
la somme des caisses prises **au-dessus de la prise durable**, accumulée. Elle
ne se paie pas en or : elle se paie en **jachère** (une zone fermée un temps,
ce qui coûte du revenu) ou en **réensemencement** (payé par le fonds). La
campagne suivante commence avec ce passif.

**Pourquoi c'est le quatrième.** C'est la continuité pure : l'externalité n'est
plus « les autres », c'est « ceux qui viennent après ». Et ça donne au bilan sa
deuxième colonne : valeur nette **et** dette envers la mer.

**Ce qui existe déjà.** `open_next_season` garde déjà les stocks ; la chronique
(en cours) note la valeur nette et les stocks. Il faut la formule de la prise
durable, le calcul du passif et la jachère.

**Coût.** Moyen (1 journée) — et **le harnais d'équilibrage est indispensable** :
c'est le barreau qui peut rendre une partie impossible.

### Barreau 5 — Réparer : la jachère et le contentieux

**Mécanique.** Deux sorties seulement, et elles sont collectives :
la **jachère** (fermer une zone N semaines : la repousse repart, le revenu
s'arrête, le fonds indemnise) et le **contentieux** (un capitaine lésé par une
règle peut réclamer au fonds ; le joueur peut être le plaignant ou celui qui
paie). Un recours perdu coûte de la crédibilité — celle qui fait passer les
motions suivantes.

**Pourquoi c'est le dernier.** Parce que c'est la seule chose qui rende le jeu
*juste* plutôt que seulement lucide : on peut réparer, et la réparation a un
prix politique.

**Coût.** Moyen-élevé (1 à 2 jours). **Risque.** Le contentieux peut devenir
une machine à ralentir le jeu ; une réclamation par saison, pas plus.

---

## Ce que cette colonne absorbe

Elle n'ajoute pas de nouveaux systèmes : elle **reclasse** les idées déjà
écrites.

| Idée déjà planifiée | Devient, dans la colonne |
|---|---|
| Criée commune (piste 1) | le prix que paie le lot **après** redevance : l'externalité est déjà dans le prix |
| Licence louable (piste 2) | la rente que le fonds peut taxer (redevance sur licences dormantes) |
| Chronique et charte (piste 3) | le registre du barreau 4 : la dette envers la mer, saison après saison |
| Faveurs des NPC (piste 4) | la crédibilité qui fait passer ou échouer un recours (barreau 5) |
| Mer irréversible (piste 5) | le cas extrême du barreau 4 : quand la jachère ne suffit plus |
| Science qui se ment (piste 8) | un service payé par le fonds, donc une dépense publique à défendre |
| Les gens du port (piste 10) | les ayants droit du fonds : ceux qu'on indemnise |
| Deux ports (piste 7) | la redevance doit être concertée, sinon on fuit la règle par le voisin |
| Gagner en rentier (piste 11) | un bilan qui ventile : revenus du travail, de la rente, du fonds |

Autrement dit : **la colonne vertébrale n'ajoute rien, elle donne un ordre.**

## Ordre de construction

| # | Barreau | Coût | Débloque |
|---|---|---|---|
| 1 | Attribution | ½ j | tout le reste : sans chiffres, rien n'est politique |
| 2 | Redevance + fonds | 1 j | le conseil devient un budget |
| 3 | Motion financée + preuve | ½ j | la politique devient lisible |
| 4 | Dette envers la mer | 1 j | le bilan a deux colonnes |
| 5 | Jachère + contentieux | 1-2 j | la réparation |

**Soit 4 à 5 jours**, et les barreaux 1 à 3 tiennent en deux jours : c'est là que
se joue l'essentiel de l'idée.

## Ce que la colonne interdit

- **Un troisième axe de score.** Deux colonnes : valeur nette, dette envers la
  mer. La population (piste 10) devient un **ayant droit du fonds**, pas un
  score.
- **Des règles qui ne se paient pas.** Toute motion a un financement, ou elle
  n'existe pas.
- **Cacher les chiffres.** Si le joueur ne peut pas voir qui a pris quoi, le jeu
  redevient une leçon de morale.

## Décisions à prendre

1. **La prise durable** : calculée par zone (repousse nette à l'équilibre) ou
   fixée par le conseil (un chiffre politique, donc discutable) ?
2. **La dette envers la mer** : en caisses (lisible) ou en or (payable) ? Je
   recommande les caisses, avec une conversion seulement au moment de payer.
3. **Le contentieux** : ouvert à tous les capitaines, ou seulement au joueur et
   aux NPC lésés par une motion qu'ils ont combattue ?
