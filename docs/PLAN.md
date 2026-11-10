# Bankkeeper — état et plan

> Écrit le 10 novembre 2026, 14:50. Ce document dit **ce qui est fait et
> vérifié**, **ce qui reste** (dans l'ordre), et **comment l'idée continue**.
> Rien ici n'est une intention : chaque ligne « fait » renvoie à une preuve.

## 1. Ce qui est fait, et vérifié

| Domaine | État | Preuve |
|---|---|---|
| Moteur (règles + sim) | 137 tests verts, déterministe à graine | `cargo test --workspace` |
| Contrat NEP-245 | compile en wasm, 412 Ko, ABI embarquée, 23 tests | `cargo near build non-reproducible-wasm` |
| **Le jeu dépense le contrat** | login email → achat de licence → `mt_balance_of` 0 → 1, hash à l'écran | `tests/e2e_onchain.py` (sandbox), PR #25 |
| Jeu hors-ligne | moteur wasm, 0 serveur, 0 `/api/` | `tests/e2e_offline.py` |
| Horloge live | 1 lot / 30 s, 10 lots = 5 min / jour | PR #18, vérifié en navigateur |
| Campagne 3 saisons | capital reporté, la mer garde ce qu'elle a perdu | PR #15 |
| Persistance + lien de saison | `?seed=&weeks=`, reprise après reload | PR #10 |
| Conformité au track | 4 exigences sur 6 tenues, 2 à moitié, nommées | `docs/COMPLIANCE.md` |
| Nom | dépôt **`BaptisteFaisy/bankkeeper`** | GitHub |

## 2. Ce qui reste à faire, dans l'ordre

### Bloquant — cette après-midi

1. **Intégrer 10 branches** (prêtes, commits poussés, arbre propre) :
   `balance`, `market`, `lease`, `chronicle`, `favours`, `proofs`, `pwa`,
   `tutorial`, `rung1` (attribution), `rung2` (redevance + fonds).
   Conflits attendus sur `config.rs`, `views.rs`, `season.rs`, `App.tsx`,
   `hooks.ts`, `styles.css` : résolution à la main, tests après chaque merge.
2. **Corriger les défauts trouvés par l'audit** (ci-dessous) — chacun avec un
   test de non-régression, dans des PR séparées.
3. **Déployer sur testnet** dès que le faucet rend un slot (job automatique à
   15:35 ; fenêtre à 15:27). Puis rebrancher `docs/ONCHAIN.md` et la page
   `/proofs.html` sur l'adresse publique.
4. **Redéployer la démo** (`tidewater-play.vercel.app`) depuis `main`, vérifier
   le parcours complet en headless.

### Défauts connus à corriger

**Contrat (2, bloquants pour une économie réelle)**
- `mt_transfer` / `mt_batch_transfer` appellent `assert_yocto()` sans `#[payable]`
  → aucun or ne circule entre comptes. Correctif : `#[payable]` + rembourser
  l'excédent.
- `new()` sème 20 licences aux capitaines, **0 à la banque** → `buy_licence` ne
  peut rien vendre avant une faillite. Correctif : semer quelques licences à
  `npc:bank`.

**Moteur (6, dont 5 majeurs — `crates/sim/tests/audit.rs`)**
- La criée de l'auberge paie **deux fois** les mêmes caisses (`evening.rs:134`) ;
- l'adjudication du lundi **ignore le plafond de 8 licences** (`season.rs:151`) ;
- le plan du jour **n'est pas figé à l'aube** : une coque achetée à midi pêche
  des rondes déjà closes (`cycle.rs:133`) ;
- une coque saisie en cours de journée **crédite son acheteur** des trajets de
  l'ancien propriétaire (`cycle.rs:189`) ;
- `history_hash` **n'incorpore pas les licences** : deux saisons différentes
  peuvent avoir la même empreinte (`fastforward.rs:152`) ;
- `open_next_season` archive le bilan **avant** de refuser : appeler deux fois
  `next-season` duplique une entrée de campagne (`season.rs:448`).

**Interface** : rapport d'audit en cours (`docs/AUDIT-WEB.md`).

### Ensuite — la semaine

5. **Barreaux 3, 4, 5** de la colonne (motion financée, dette envers la mer,
   jachère et contentieux) : 3 à 4 jours, dans cet ordre.
6. **Équilibrage** avec le harnais (`make balance`) : 50 graines × 4 politiques,
   puis régler les quatre curseurs qui comptent (repousse, part prise par
   sortie, redevance, seuil de jachère).
7. **Soumission** : README de présentation, page `/proofs.html` à jour, script
   de démonstration en 90 secondes (dont le fast-forward), et la vidéo si elle
   est demandée. **Date d'échéance à confirmer** — 14/11 18:00 UTC était
   l'échéance d'un autre track.

## 3. Comment l'idée continue

Trois documents, un seul axe : **`docs/SPINE.md`** est le plan de référence.

> L'idée de base : *ce que je prends aujourd'hui coûte à quelqu'un d'autre, et à
> demain.* Tout le reste est une manière de répondre.

**La colonne (en cours)** — cinq barreaux qui s'empilent :

| Barreau | Ce qu'il ajoute | État |
|---|---|---|
| 1. **Voir** | l'attribution : `Greybank −1 200 caisses : toi 46 %, Brandt 31 %` | en cours (branche prête) |
| 2. **Payer** | redevance de débarquement → fonds du port | en cours (branche prête) |
| 3. **Gouverner** | toute motion votée avec son financement | à faire |
| 4. **Hériter** | la dette envers la mer, payée en jachère | à faire (après le harnais) |
| 5. **Réparer** | jachère collective + contentieux | à faire |

**Ce que la colonne absorbe** : la criée commune devient le prix après
redevance ; la chronique devient le registre de la dette ; la science devient un
service payé par le fonds ; les habitants deviennent les ayants droit du fonds.
On n'ajoute pas de systèmes, on **donne un ordre**.

**Le deuxième horizon** (`docs/VISION.md`) — après les cinq barreaux :
les gens du port comme second score (non monétaire), gagner en devenant rentier
(et que le bilan le dise), la science qui se ment, le banc qui ne s'arrête pas
au môle (deux ports, un stock), le basculement d'écosystème, la politique
asynchrone entre joueurs.

### Les trois phrases que le jeu doit pouvoir dire

1. « Mes prises ont fait baisser le prix payé à tout le monde pendant trois
   jours. » — l'externalité, humaine.
2. « La règle que j'ai fait voter en saison 2 tient toujours. » — l'institution.
3. « Vous laissez le registre le plus riche et le port le plus vide. » — le
   verdict, jamais prononcé.

## 4. Décisions à prendre

1. **Date de soumission** : à confirmer (14/11 18:00 UTC ?).
2. **Testnet** : on garde `tidewater26.testnet` comme compte public, ou on le
   renomme `bankkeeper.testnet` pour la cohérence de marque ?
3. **Renommage interne** (crates, tokens, clés de stockage) : après le gel, ou
   jamais ?
4. **Barreau 4** : la dette envers la mer en caisses (lisible), avec conversion
   en or au moment de payer — tu confirmes ?
