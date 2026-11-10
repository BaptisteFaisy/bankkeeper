# Tidewater — Le fonds du port (barreau 2 : PAYER)

> Barreau 2 de la colonne « ce que je prends aujourd'hui coûte à quelqu'un
> d'autre et à demain ». L'externalité a un prix ; le prix paie la réparation.
> Code : `crates/rules/src/config.rs` (le taux), `crates/sim/src/fund.rs` (le
> livre), `crates/sim/src/cycle.rs` (le prélèvement), `crates/rules/src/council.rs`
> et `crates/sim/src/season.rs` (la motion), `crates/sim/src/views.rs` (les vues).

## 1. La redevance de débarquement

Chaque lot vendu à la criée paie une redevance avant que le capitaine ne garde
le reste :

```
redevance = min(config.levy_per_crate x caisses, montant_de_la_vente)
```

`levy_per_crate` est en **centigold par caisse** (40 = 0,4 or la caisse). Le
défaut est **0** : la redevance n'est pas un impôt silencieux, c'est une motion
que le port vote. Le profil navigateur (`crates/wasm/src/lib.rs`) démarre à
`DEMO_LEVY_PER_CRATE = 40` pour que le fonds se remplisse dès la première
vente ; `sim init --levy 0.4` fait la même chose en CLI.

Ordre exact dans `settle_sale` : le vendeur est crédité du montant total, puis
`Game::levy_on_sale` reprend la redevance de sa bourse et la verse au fonds.
Une ligne de journal par lot vendu, jamais une ligne par jour — le livre montre
le prix à chaque marteau :

```
Levy: 8.0 on 20 crates to the port fund.
```

La redevance ne peut jamais dépasser le montant de la vente : un lot qui part
au plancher paie ce qu'il vaut, pas plus. Un lot perdu (sous le plancher) ne
paie rien.

## 2. Ce qu'elle paie

`Game::pay_from_fund(to, amount, reason)` verse du fonds vers une bourse du
port et écrit la ligne au journal. Elle **refuse un fonds à sec** : le fonds
n'est pas un découvert, une promesse que le port ne peut pas tenir vaut moins
que pas de promesse.

```
Port fund pays 2.0 to the townsfolk: net mending.
```

Les emplois visés par le barreau : remaillage des filets, remise en état d'une
zone fermée, radoub d'un capitaine échoué. Aucun n'est encore branché
automatiquement sur une motion : aujourd'hui c'est le tableau de bord et le
relais qui décident de la dépense, pas une règle.

## 3. Conservation de l'or (TW-N-42)

Le fonds **fait partie du circuit** : c'est de l'or que le port détient en
commun, pas de l'or qui sort.

```
or_total = somme(or des acteurs) + fonds
```

`Game::gold_total()` inclut `fund.balance`, et c'est ce total que
`check_conservation` compare au petit matin et au soir. Une redevance déplace
l'or d'une bourse vers le fonds : le total ne bouge pas. Un versement du fonds
vers un acteur le déplace dans l'autre sens : le total ne bouge pas non plus.
Seuls les flux extérieurs déclarés (`Flows` : export de la conserverie,
voyageurs de l'auberge, carburant et appâts) font varier le total, comme avant.

## 4. Deux exemples chiffrés (relevés réels, `sim init --seed 7 --levy 0.4`)

**Un lot.** Le 20 caisses de hareng de « You » partent à la criée à 6,0 or la
caisse, soit 120,0 or. Redevance : 0,4 x 20 = **8,0 or** au fonds. Le capitaine
garde 112,0 or, soit 93,3 % du montant.

**Une journée.** Les 30 lots du jour 0 versent **212,4 or** au fonds
(`paid_in = 212,4`, `paid_out = 0`). Les bourses de tous les acteurs totalisent
**12 594,6 or** ; `or + fonds = 12 807,0 or`, exactement le `gold_total` que la
vue juges affiche. Rien n'est apparu, rien n'a disparu.

**Le plafond.** Un lot de 10 caisses à 0,4 vaudrait 4,0 or de redevance ; s'il
ne s'est vendu que 2,5 or, la redevance est ramenée à 2,5 or et le vendeur
garde 0.

## 5. La motion

`Proposal` gagne `levy_per_crate: Option<u64>` (`None` = la motion ne touche
pas à la redevance). Une motion `levy` se vote comme les autres, à la majorité
strictement pondérée par licence, et si elle passe elle s'applique **à la
saison suivante**, jamais au milieu d'une saison — exactement la règle du
quota (TW-C4-01) :

```
Levy set at 0.8 a crate from next season.
```

Les capitaines NPC votent leur propre profit, redevance comprise (`season_profit`
la soustrait). Le raisonnement affiché nomme l'instrument de la motion :

```
Brandt votes no: a 0.8 levy costs him 640 a week, your offer pays 400.
```

Côté joueur : `sim council --action propose --rule "quota70,levy:0.8"` (le
relais et le moteur web passent le même jeton `levy:<or par caisse>`), ou le
champ numérique « Levy a crate » du panneau Harbour (0 → 1,2 or).

## 6. Les vues

- `GET /api/state` : `fund: {balance, paid_in, paid_out}` et `levyPerCrate`
  (or, une décimale).
- `GET /api/judges` : `fund: {balance, paid_in, paid_out}` à côté de `actors`
  et `gold_total` — c'est là que le fonds se lit comme partie du circuit.
- `sim judges`, `sim state` : les mêmes objets.

## 7. Ce qui reste fragile

- **Plomberie des juges côté UI** : `JudgesPanel.tsx` sait afficher le fonds
  (`fund?: PortFund` dans `JudgeRun`), mais `App.tsx` — hors périmètre de ce
  barreau — ne le passe pas encore à `ffToRun`. La ligne existe donc et reste à
  « — » tant que `App.tsx` n'ajoute pas `fund: judges?.fund` au `JudgeRun`.
- **Sauvegardes antérieures** : `Game::fund` et `Config::levy_per_crate` ont
  `#[serde(default)]` (fonds vide, redevance 0), et `Proposal::levy_per_crate`
  aussi. Une vieille sauvegarde se recharge donc sans redevance, ce qui est le
  comportement voulu.
- **Motions enchaînées** : une motion `levy` et une motion `quota` sont la même
  motion ; on ne peut pas voter deux taux de redevance différents dans le même
  conseil. Un taux voté reste en vigueur jusqu'à la saison suivante.
- **Conservation sous dépense** : le fonds peut payer n'importe quel acteur
  (`pay_from_fund` ne vérifie pas que la dépense est une réparation) ; la
  discipline est dans l'appelant, pas dans le livre.
