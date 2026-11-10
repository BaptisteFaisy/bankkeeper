# Bankkeeper — Gouverner (barreau 3 : GOUVERNER)

> Barreau 3 de la colonne « ce que je prends aujourd'hui coûte à quelqu'un
> d'autre et à demain ». Les barreaux 1 (voir l'attribution) et 2 (la redevance
> et le fonds) ont donné au port des chiffres et un compte. Le barreau 3 en fait
> un **budget** : toute motion se vote avec son financement, et chaque vote
> s'affiche avec ce que le capitaine gagne, ce que le capitaine perd, et ce
> qu'il a pris au banc.
>
> Code : `crates/rules/src/council.rs` (`Funding`, `Proposal::funding`,
> `took_this_season`), `crates/sim/src/govern.rs` (recevabilité, paie du lundi),
> `crates/sim/src/season.rs` (le vote et l'application de la motion),
> `crates/sim/src/views.rs` (`council`), `web/src/components/HarbourPanel.tsx`
> (le choix de la source).

## 1. Deux sources de financement

Une motion qui promet une indemnité porte **sa source**, et le conseil vote les
deux ensemble :

| Source | Qui paie | Quand | Contrôle avant le vote |
|---|---|---|---|
| `Fund` — *Port fund* | le fonds du port, alimenté par la redevance déjà perçue | au lundi de chaque semaine de la saison suivante | le fonds doit **couvrir toute la promesse** |
| `Levies` — *Extra levy* | une redevance **supplémentaire** prélevée sur les débarquements de la saison | à mesure que les lots se vendent, puis au lundi | pas de contrôle de solde : la redevance se fixe, elle ne se puise pas |

Une motion **sans indemnité** n'a pas de source (`funding: null`) et fonctionne
exactement comme avant. Une motion écrite avant que la règle existe (sauvegarde
ancienne, `funding` absent) est lue comme payée par le fonds : une promesse a
toujours un payeur.

### La redevance supplémentaire, en clair

`Levies` ne puise pas dans un compte : elle augmente le taux de la redevance de
la saison suivante du montant nécessaire pour lever la facture, réparti sur les
caisses débarquées la saison précédente (le seul volume que le port connaisse
avant la saison) :

```
nouveau_taux = taux_voté + arrondi_sup(facture / caisses_debarquees_saison_precedente)
```

Exemple : facture 12 800 or, 3 864 caisses débarquées → 331 centigold
supplémentaires par caisse (3,31 or). C'est cher, et c'est le point : le port
voit le prix de sa politique.

## 2. La règle de recevabilité

Le coût d'une motion se calcule sur **toutes les licences qui pourraient dire
oui** — les capitaines qui votent, moins le proposant, qui ne se paie pas
lui-même :

```
licences_payees   = somme des licences des capitaines en mer sauf toi
facture           = indemnite_par_licence_semaine x licences_payees x semaines_de_la_saison
```

On retient ce maximum parce qu'au moment de la recevabilité les bulletins ne
sont pas encore dans l'urne : le port doit pouvoir tenir la promesse même si
tout le monde dit oui.

Si la source est `Fund` et que `fonds < facture`, **la motion est irrecevable** :
`tabled: false`, une raison chiffrée dans les minutes, **aucun bulletin ouvert**,
et les règles en vigueur continuent. Elle n'est pas rejetée en silence, elle
n'est pas votée « non » : elle ne monte pas à l'ordre du jour.

Depuis la ligne de raisonnement :

```
Council of season 1: the motion is not tabled — the port fund holds 2166.8, the motion promises 2560.0 for 4 weeks.
```

## 3. La preuve au bas de chaque bulletin

Chaque ligne de vote gagne, après le coût et l'offre qui existaient déjà, **ce
que le capitaine a pris au banc cette saison** — la donnée du barreau 1,
recalculée localement à partir du journal (`DayRecord.captain_crates`, réparti
sur la première zone pêchée de la journée) :

```
You vote yes: your own motion.
Hale votes yes: a 100-crate quota costs him 0 a week, your offer pays 80. He took 963 crates from Greybank this season.
Brandt votes yes: a 100-crate quota costs him 0 a week, your offer pays 160. He took 2 270 crates from Greybank this season.
Okoro votes yes: a 100-crate quota costs him 0 a week, your offer pays 80. He took 1 140 crates from Greybank this season.
Tally: 20 for, 0 against; the motion passes.
Indemnity: 1280.0 from the port fund, 320.0 a week on the Monday for 4 weeks.
```

Forme attendue :

```
Brandt votes no: a 50-crate quota costs him 640 a week, your offer pays 400. He took 1 800 crates from Greybank this season.
```

## 4. Le paiement, au lundi

La motion passée n'ouvre pas un chèque : elle ouvre une **paie**
(`Game::payroll`). À chaque règlement du lundi de la saison qu'elle engage, une
semaine d'indemnité sort du fonds vers les capitaines qui ont voté oui :

```
Port fund pays 80.0 to Hale: week 1 indemnity.
Port fund pays 160.0 to Brandt: week 1 indemnity.
Port fund pays 80.0 to Okoro: week 1 indemnity.
```

Quatre semaines, quatre versements. Le fonds ne devient **jamais négatif** : ce
qu'il ne peut pas payer ce lundi-là reste écrit dans `unpaid` et se rattrape au
lundi suivant s'il y a de quoi ; sinon la ligne le dit :

```
The port fund is short 3050.0 of the week 2 indemnity; it stays owed.
```

## 5. La démonstration, chiffrée

Partie neuve, graine 7, redevance de démonstration 0,4 or la caisse
(`sim init --seed 7 --levy 0.4`), 27 jours joués. Le fonds tient alors
**2 166,8 or**, et les licences qui votent valent 16 (Hale 4, Brandt 8,
Okoro 4).

**Motion irrecevable** — `quota50,pay:fund`, indemnité 40 or par licence et par
semaine :

```
facture = 40 x 16 x 4 = 2 560,0 or     fonds = 2 166,8 or
```

```
{"line":"Motion tabled: quota 50.","ok":true}
Council of season 1: the motion is not tabled — the port fund holds 2166.8, the motion promises 2560.0 for 4 weeks.
```

**Motion recevable** — `quota100,pay:fund`, indemnité 20 or par licence et par
semaine :

```
facture = 20 x 16 x 4 = 1 280,0 or     fonds = 2 166,8 or  ->  recevable
```

Le vote passe 20 pour / 0 contre, la paie s'ouvre (`320,0 or par lundi`), et le
lundi suivant :

```
fund {'balance': 2430.4, 'paid_in': 2750.4, 'paid_out': 320.0}
payroll weeks_left 3 owed 960.0
Port fund pays 80.0 to Hale: week 1 indemnity.
Port fund pays 160.0 to Brandt: week 1 indemnity.
Port fund pays 80.0 to Okoro: week 1 indemnity.
```

Le fonds a bien bougé de 320,0 or vers les trois capitaines, et il reste trois
lundis à payer.

## 6. Ce que le joueur doit comprendre

1. **Une promesse a un payeur.** Choisir « port fund » ou « extra levy » n'est
   pas un réglage d'interface : c'est ce que le conseil vote.
2. **On ne promet pas ce qu'on n'a pas.** Une motion que le fonds ne couvre pas
   ne monte pas à l'ordre du jour ; le port le dit avec deux chiffres, sans
   jugement.
3. **La politique se voit.** Chaque capitaine vote avec son coût, l'offre qu'on
   lui fait, et **ce qu'il a pris** : une majorité se construit sur des chiffres,
   pas sur des promesses.
4. **La dépense est étalée.** L'indemnité sort semaine après semaine ; un fonds
   qui se vide à la troisième semaine se voit, au lieu de se découvrir au bilan.

## 7. Interface

`web/src/components/HarbourPanel.tsx`, bloc *Council* : dès qu'une indemnité est
saisie, un choix **Paid by** apparaît (`Port fund` / `Extra levy`) et le coût
total s'affiche en or avant validation :

```
Costs 16.g over the season: 16 licences paid for 4 weeks. The fund must hold it when the council sits.
```

Le choix part au relais dans la chaîne de règles (`pay:fund`, `pay:levies`), donc
le serveur et le moteur hors-ligne n'ont pas eu à changer de payload : le relais
lit le jeton (`crates/sim/src/relay.rs`).

## 8. Ce qui reste fragile

- **Les semaines d'indemnité** sont celles de la saison suivante et s'arrêtent
  avec la campagne : une paie ouverte à la dernière saison s'arrête sans être
  soldée (l'argent reste dans le fonds, rien ne fuit).
- **Les motions enchaînées** : une seule paie à la fois. Une nouvelle motion qui
  passe écrase la précédente (`Game::payroll`), comme le conseil ne siège qu'en
  fin de saison, ça ne se voit pas aujourd'hui — mais ça se verrait si on
  ouvrait un conseil en cours de saison.
- **L'attribution** de la ligne de vote est approximative : les caisses d'un
  capitaine sont portées à la **première zone pêchée de sa journée**, le journal
  ne gardant pas les caisses par zone et par capitaine. Le chiffre « prises de
  la saison » est juste ; la zone est une indication.
- **Les sauvegardes** : `payroll` et `funding` sont `#[serde(default)]`, une
  partie ancienne se relit sans paie et sans source (lue comme le fonds).
- **L'aperçu de coût** dans l'interface répète `weeks_per_season = 4`
  (`SEASON_WEEKS`) : la règle fait foi côté moteur, l'aperçu est une aide.
