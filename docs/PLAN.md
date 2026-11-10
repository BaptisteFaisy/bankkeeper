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

## 2. Ce qui reste — état à 15:15

Les trois audits ont rendu leur verdict : **33 défauts prouvés par des tests qui
échouent**. Le projet est riche en fonctionnalités et pauvre en robustesse ;
c'est exactement ce qu'un audit sert à corriger avant une démo.

| Source | Bloquants | Majeurs | Mineurs | Rapport |
|---|---|---|---|---|
| Contrat NEAR | **3** | 8 | 4 | `docs/AUDIT-CONTRACT.md` |
| Moteur (règles + sim) | 0 | 5 | 1 | `docs/AUDIT-ENGINE.md` |
| Client web | **1** | 8 | 3 | `docs/AUDIT-WEB.md` |

### Étage 0 — avant tout déploiement public (aujourd'hui)

1. **Contrat, 3 bloquants** : `mt_transfer` payable (aucun token ne circule),
   la banque sans licences (`buy_licence` mort), et `mt_batch_transfer` qui
   frappe des tokens ex nihilo (même solde de départ pour chaque jambe).
2. **Web, 1 bloquant** : une sauvegarde d'une version antérieure tue l'écran
   (`E_IMPORT` non rattrapé) — le jeu ne redémarre plus jamais.
3. **Moteur, conservation** : l'auberge encaisse deux fois les mêmes caisses
   (l'or se déplace vers un acteur qui ne l'a pas gagné).

### Étage 1 — avant la soumission

- **Contrat, 8 majeurs** : événement `mt_batch_transfer` sans `amounts` ; `memo`
   non échappé (injection dans `EVENT_JSON`) ; la propriété d'un acte de bateau
  ne suit pas le token (on vend un bateau, l'ancien pêche encore) ; les
  indemnités sont versées aux votants « non » ; la note de dette transférée ne
  transfère aucun droit ; le plafond de 8 licences **n'est appliqué nulle part** ;
  aucun dépôt de storage ; le poids de vote lu au moment du vote (double vote par
  transfert).
- **Moteur, 5 majeurs restants** (les correctifs 1-3 et 4-6 sont en cours) :
  pool de licences sans plafond, plan du jour non figé, coque saisie créditée au
  mauvais capitaine, `history_hash` incomplet, bilan archivé avant refus.
- **Web, 8 majeurs** : double-clic qui ferme deux journées ou achète deux
  licences, `End the day` qui n'arrête pas l'horloge, horloge qui tourne déconnecté,
  deux onglets qui s'écrasent, `?seed=` qui écrase la partie en cours, carte
  inaccessible au clavier, toasts non annoncés.
- **Intégrer les branches restantes** (`chronicle`, `favours`, `balance`,
  `rung1`, `rung2`, `rung3`) et les 3 PR de docs.

### Étage 2 — la suite

- **Barreaux 4 et 5** de la colonne : la dette envers la mer (en caisses, payée
  en jachère) puis la jachère collective et le contentieux.
- **Équilibrage** avec `make balance` (50 graines × 4 politiques) : les quatre
  curseurs qui comptent — repousse, part prise par sortie, redevance, seuil de
  jachère.
- **Soumission** : vidéo de 90 s (dont le fast-forward), page `/proofs.html`
  branchée sur le contrat, README de présentation.

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
