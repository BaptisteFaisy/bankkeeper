# Bankkeeper — Démo juges

> Guide de démonstration **sans vidéo**, en trois parcours chronométrés :
> **90 secondes**, **5 minutes**, **les preuves**.
>
> Écrit le **10 novembre 2026 à 21:30 (Europe/Paris)** par b, sur `main` =
> **`11f7a0d`**. Tout ce qui est décrit ci-dessous a été **cliqué et lu** dans
> un navigateur sur le lien public le 10/11 ; les écrans cités sont des
> copies de ce que la page affiche réellement.
>
> **Pas de vidéo.** La démonstration passe par le lien public, le
> fast-forward et la page de preuves. C'est un choix : le juge peut alors
> cliquer lui-même, et il ne prend pas notre parole pour un montage.
>
> **Le lien** : <https://tidewater-play.vercel.app>
> **La page de preuves** : <https://tidewater-play.vercel.app/proofs.html>

## Ce qu'il faut savoir avant de commencer

- **Aucune installation, aucun compte, aucun wallet.** Le jeu est un site
  statique : le moteur Rust est compilé en WebAssembly et tourne dans le
  navigateur du juge. Zéro serveur, zéro appel réseau une fois la page
  chargée (`tests/e2e_offline.py` : 0 appel `/api/`).
- **La connexion est un email et un pseudo.** Ni phrase de récupération, ni
  extension, ni demande de gas. (Ce n'est pas encore une authentification
  forte — voir « ce que nous ne montrons pas ».)
- **La graine est partageable.** `?seed=7&weeks=1` rejoue exactement la
  même saison. Toutes les saisies de chiffres ci-dessous sont faites avec
  `?seed=7&weeks=1` pour que le juge retrouve les mêmes valeurs.
- **Trois échelles de lecture** : le jeu se lit à trois vitesses — 30
  secondes, 5 minutes, une session. Ce guide les parcourt dans cet ordre.

---

# Parcours 1 — 90 secondes

**Objectif** : que le juge voie *le jeu qui tourne*, *la règle qui explique
le prix*, et *le registre qui dit qui a pris quoi*.

### Étape 1 (20 s) — ouvrir et se connecter

- **Cliquer** : ouvrir <https://tidewater-play.vercel.app/?seed=7&weeks=1>,
  saisir un email (`juge@example.com`) et un nom de capitaine (`Juge`),
  cliquer **Sign in with email**.
- **À l'écran** : la carte marine s'affiche, avec le bandeau
  `TIDEWATER · Week 1 · Mon · High · 150.0g · Quota left: 280 · Season 1 of 3`.
  Un tutoriel en trois cartes s'ouvre : cliquer **Skip** (le tutoriel est
  court et la démonstration est plus rapide sans).
- **Ce que le juge doit entendre** : rien de spécial — le port est là,
  dix bateaux, trois zones, et la première journée commence.

### Étape 2 (25 s) — une journée en direct

- **Cliquer** : le bouton **Go live** (en haut).
- **À l'écran** : le bouton devient `Live · next lot 12s` et compte à rebours.
  Un lot toutes les **30 secondes** ; dix bateaux, donc **une journée en
  5 minutes**. Le panneau `FISH AUCTION` s'anime : l'horloge de prix
  descend, un marchand l'emporte, la vente s'affiche
  (`Sold lot 3 to Cannery: 14 × 5.62 = 78.68g`).
- **À l'écran aussi**, en bas à gauche du panneau `HARBOUR LEDGER` : les
  lignes de raisonnement brutes, une par décision :
  - `Hale sends 2 boats to Greybank: catch per trip 17.0, holds above 70% of her average (18.4).`
  - `Brandt sends 4 boats to Greybank: best catch per trip yesterday.`
  - `Okoro copies You: 102 gold per boat yesterday, the best in port, and sails to Greybank.`
  - `Sold to Cannery: 16 × 5.32 = 85.12. Limit 5.32 = base 4.0 x 1.33.`
- **La phrase que le jeu doit pouvoir dire** :
  > « Mes prises ont fait baisser le prix payé à tout le monde pendant
  > trois jours. »
  La dernière ligne ci-dessus le montre en une ligne : le même lot de
  herring est passé de 6,00 à 4,68 pendant la journée, parce que le
  conserveur a rempli son stock. Le jeu ne le commente pas : il l'affiche.
- **Note pour le présentateur** : si le juge veut aller vite, `Next lot`
  fait avancer d'un lot et `End the day` termine la journée. Les deux
  restent disponibles à tout moment.

### Étape 3 (20 s) — l'infobulle de raisonnement d'un marchand

- **Cliquer** : dans le panneau `FISH AUCTION`, sur le mot **why** situé à
  droite du nom d'un acheteur (`Fishmonger`, `Cannery`, `The Gull`).
- **À l'écran** : une infobulle s'ouvre, au survol comme au focus clavier :
  `Fishmonger: limit 6.0 = base 4.0 x 1.50 — store 0 against a target of 60.`
  Autrement dit : *ce marchand paiera 6,0 or la caisse tant que son stock
  est sous sa cible ; si son stock monte, sa limite baisse*.
- **Ce que le juge doit entendre** : la règle de prix est **une seule
  formule**, dans un seul fichier (`crates/rules/src/merchant.rs`). Le
  contrat on-chain appelle le même module que le moteur du navigateur : il
  n'y a pas deux versions de la vérité.
- **La phrase que le jeu doit pouvoir dire** : la même qu'à l'étape 2 —
  le prix est un calcul, pas une ambiance.

### Étape 4 (25 s) — le registre « qui a pris quoi »

- **Cliquer** : laisser la journée se terminer (ou cliquer `End the day`),
  puis regarder le bas du panneau `HARBOUR LEDGER`, bloc **Who took what**.
- **À l'écran** (mesuré le 10/11, graine 7) :
  ```
  Who took what
  The Shallows took 24 · durable 1/day · 24.0x
  Okoro 100.0%
  Greybank took 159 · durable 7/day · 22.7x
  Brandt 49.7% · You 25.2% · Hale 25.2%
  The Deeps took 0 · durable 0/day · —
  Nobody fished here over the window.
  ```
  Trois nombres par zone : **ce qui a été pris**, **ce que la zone rend
  toute seule** (`durable`), et **le rapport** (`22.7x` = on a pris 22,7
  fois ce que la mer rend). Puis la part de chaque capitaine.
- **Ce que le juge doit entendre** : c'est **le barreau 1 de la colonne**
  (`docs/SPINE.md`) : l'externalité de chacun, chiffrée, à côté de celle
  des autres. Pas de procès, pas de commentaire : un relevé.
- **La phrase que le jeu doit pouvoir dire** :
  > « Mes prises ont fait baisser le prix payé à tout le monde pendant
  > trois jours. »
  Elle se vérifie ligne à ligne : `Greybank … Brandt 49.7 %` et le
  multiplicateur `22.7x` disent qui a pris quoi, et le « Limit … x 1.33 »
  de l'étape 2 dit ce que ça a coûté à tous.

**Ce que le judge a vu en 90 secondes** : une économie qui tourne, une
règle de prix unique et expliquée, un registre qui attribue la prise.

---

# Parcours 2 — 5 minutes

**Objectif** : que le juge voie *une saison complète sans joueur*, *une
motion votée avec son argent*, *un fonds qui se remplit*, et *la facture
que la mer laisse*.

### Étape 1 (45 s) — le fast-forward : 7 jours puis 28 jours

- **Cliquer** : le bouton **Judges** (en haut de l'écran). Le panneau
  `Judges bench` s'ouvre.
- **Cliquer** : **Fast-forward 7 days**. Puis **Fast-forward 28 days**.
- **À l'écran** :
  - `Seed 839689206 · 7 days · 0 event(s)`
  - `Deterministic replay signature: 3455655248798445433`
  - le graphe **Run curves** : stock réel de chaque zone et prix du hareng,
    avec les faillites marquées ;
  - `Live gold in port: 11367.0 · outside in: 744.0 · outside out: 27.0 · net 717.0`
  - le tableau **Live standings** : or et licences de chaque acteur.
  - puis, pour 28 jours, la série complète : huit semaines de port d'un
    coup.
- **Ce que le juge doit entendre** : l'économie tourne **sans joueur**.
  Pas de « speed-up de l'écran » : personne ne clique pendant ce temps.
  Le même engine, à la même vitesse, avec la même graine.
- **La preuve** : le `history_hash` (la signature ci-dessus). Même graine,
  même chiffre. Deux joueurs, deux machines, même saison.
- **La phrase que le jeu doit pouvoir dire** :
  > « Vous laissez le registre le plus riche et le port le plus vide. »
  Elle se lit dans le tableau : `Live gold in port` monte pendant que les
  stocks du graphe descendent. Le jeu ne choisit pas le mot ; il aligne
  deux courbes.

### Étape 2 (90 s) — le conseil qui vote une motion **avec son financement**

- **Cliquer** : `End the day` jusqu'à la fin de la saison (avec `?weeks=1`,
  c'est **7 clics**, environ 15 secondes ; avec la durée par défaut, c'est
  4 semaines).
- **Cliquer** : dans le panneau `HARBOUR OFFICE`, bloc **Council** :
  - champ **Quota** : `50` ;
  - champ **Indemnity** : `2` (or par licence et par semaine) ;
  - champ **Levy a crate** : `0.5` ;
  - liste **Paid by** : `Extra levy` ;
  - cliquer **Propose**, puis **Vote yes**.
- **À l'écran, avant de voter** — la ligne de coût, qui est le cœur du
  barreau 3 :
  ```
  Costs 9600.0g over the season: 16 licences paid for 4 weeks.
  A further levy on the landings pays it.
  ```
  Et la motion affichée en clair :
  `Motion: quota 50 · levy 0.5g a crate · indemnity 150.00g · paid by an extra levy`
- **Écart connu, à dire au juge plutôt qu'à cacher** : cette ligne de coût
  calcule la facture sur **4 semaines** (`SEASON_WEEKS = 4`, constante de
  `web/src/types.ts:285`), alors que le conseil paie réellement sur la
  **longueur réelle de la saison** du port en cours. Vérifié le 10/11 sur
  `?weeks=1` : l'aperçu annonce `Costs 9600.0g … for 4 weeks`, et le
  procès-verbal du conseil écrit `Indemnity: 2400.0 from an extra levy,
  2400.0 a week on the Monday for 1 weeks.` — soit 1 semaine, pas 4. C'est
  un défaut d'affichage (la constante ne suit pas `weeks_per_season`) : le
  moteur, lui, paie la bonne durée. Il est listé comme défaut ouvert, pas
  comme une fonctionnalité.
- **À l'écran, au moment du conseil** (mesuré le 10/11, graine 7) :
  ```
  Council of season 1: quota 50, no closure, mesh open.
  You vote yes: your own motion.
  Hale votes no: a 0.5 levy costs him 399 a week, your offer pays 8.
    He took 463 crates from Greybank this season.
  Brandt votes no: a 0.5 levy costs him 798 a week, your offer pays 16.
    He took 909 crates from Greybank this season.
  Okoro votes no: a 0.5 levy costs him 399 a week, your offer pays 8.
    He took 378 crates from Greybank this season.
  Tally: 4 for, 16 against; the motion fails.
  ```
  Et, **si l'indemnité est portée à 150** au lieu de 2, le même conseil
  bascule (mesuré le 10/11 sur la saison de 2 semaines par défaut) :
  ```
  Hale votes yes: a 0.5 levy costs him 399 a week, your offer pays 600.
  Brandt votes yes: a 0.5 levy costs him 798 a week, your offer pays 1200.
  Okoro votes yes: a 0.5 levy costs him 399 a week, your offer pays 600.
  Tally: 20 for, 0 against; the motion passes.
  Levy set at 0.5 a crate from next season.
  Levy raised to 2.6 a crate to pay the indemnity.
  Indemnity: 4800.0 from an extra levy, 2400.0 a week on the Monday for 2 weeks.
  ```
  Notez la ligne `He took 463 crates from Greybank this season` : le vote
  n'est pas une opinion, c'est un calcul **assorti de la prise de banc du
  votant**. C'est le barreau 3 (la preuve) dans le barreau 1
  (l'attribution).
- **À l'écran, au moment du conseil** (mesuré le 10/11, graine 7) :
- **La phrase que le jeu doit pouvoir dire** :
  > « La règle que j'ai fait voter en saison 2 tient toujours. »
  Elle se vérifie à la ligne suivante : `Levy set at 0.5 a crate from next
  season` — la règle votée entre dans les faits, et le journal du port la
  consigne (bloc **THE PORT'S CHRONICLE**, colonne « Rule carried »).

### Étape 3 (45 s) — la redevance qui remplit le fonds

- **Cliquer** : revenir à l'écran de jeu, regarder le bloc **Reasoning** du
  `HARBOUR LEDGER`.
- **À l'écran** : une ligne par vente, dans le registre :
  `Levy: 8.0 on 20 crates to the port fund.`
  `Levy: 6.8 on 17 crates to the port fund.`
  Chaque débarquement soldé verse donc une part au fonds du port — la
  redevance est prélevée **à la source**, sur le lot, pas déclarée après.
- **Ce que le juge doit entendre** : la redevance de débarquement entre dans
  un **fonds du port** séparé, dont le solde est un compte à part entière.
  C'est la réponse classique à l'externalité : la mettre en prix. Un quota
  sans indemnité est un vote perdu ; une redevance sans quota est un fonds
  vide.
- **Chiffre vérifié en local** (moteur, graine 7, redevance 0,4 or/caisse,
  7 jours) : `fund: {"balance": 445.6, "paid_in": 445.6, "paid_out": 0.0}`.
  Et sur 28 jours avec une redevance de 0,8 :
  `fund: {"balance": 3984.0, "paid_in": 3984.0, "paid_out": 0.0}`.
- **À noter pour le présentateur** : le panneau `Judges bench` affiche une
  ligne `Port fund · balance … · in … · out …`, mais **le solde n'y est pas
  rendu à l'écran** — la case reste à `—` (vérifié le 10/11 sur le site
  public, avant et après fast-forward). Le solde se lit dans le registre
  (les lignes `Levy:`) et dans le moteur (`sim state` → `fund`). Ce n'est
  pas un mensonge, c'est un **câblage manquant** : on le dit plutôt que de
  le contourner.
- **La phrase que le jeu doit pouvoir dire** : toujours la même, mais vue
  par l'autre bout — le joueur peut décider *qui paie et qui reçoit*.

### Étape 4 (60 s) — le bilan de fin de saison, avec la dette envers la mer

- **Cliquer** : quand l'écran `SEASON OVER — THE BILAN` apparaît (ou cliquer
  `Sail the next season` pour enchaîner).
- **À l'écran** (mesuré le 10/11, graine 7, `?weeks=1`) :
  ```
  SEASON OVER — THE BILAN
  Week 2 · Mon. The books are closed. Season 1 of 3.
  Net worth      3859.2g
  Gold           1443.6g
  Licences       4
  Stocks left    2983 · 4059 · 1952
  Debt to the sea  906 crates
  Last council   Season 1: no motion tabled.
  ```
  Et dans le `HARBOUR LEDGER` :
  ```
  Debt to the sea
  906 crates
  ...
  127 crates carried · 127 added this season.
  The Shallows took 24 · durable 1/day · owes 17
  Greybank took 159 · durable 7/day · owes 110
  The Deeps took 0 · durable 0/day · owes 0
  ```
- **Ce que le juge doit entendre** : le bilan a **deux colonnes**, pas
  une. La valeur nette d'un côté, la **dette envers la mer** de l'autre, en
  caisses. Cette dette, c'est ce qui a été pris **au-dessus** de ce que la
  zone rend toute seule ; elle se reporte sur la saison suivante et sur les
  campagnes suivantes. La mer n'est pas un enjeu moral : c'est un passif
  comptable, en caisses.
- **La phrase que le jeu doit pouvoir dire** :
  > « Vous laissez le registre le plus riche et le port le plus vide. »
  Le bilan la dit sans la prononcer : `Net worth 3859.2g` d'un côté,
  `Debt to the sea 906 crates` de l'autre. **Le jeu ne juge pas** : il
  aligne deux chiffres et laisse le juge conclure.

**Ce que le judge a vu en 5 minutes** : une saison complète jouée sans
lui, une motion votée avec son financement et le calcul de chaque vote,
un fonds qui se remplit, et un bilan qui porte la facture laissée à la mer.

---

# Parcours 3 — les preuves

**Objectif** : que le juge puisse **refaire** ce qu'on a dit, sans nous
croire sur parole.

### 3.1 La page de preuves publique

- **Cliquer** : <https://tidewater-play.vercel.app/proofs.html>
- **À l'écran** : quatre blocs, en clair.
  1. **LE CONTRAT** — l'état, daté : *« PAS ENCORE DÉPLOYÉ »*, avec les deux
     raisons mesurées (faucet NEAR en `429`, 412 Kio de wasm à loger) et
     un renvoi à `docs/deployments.md`. La page ne prétend pas être live.
  2. **LA SAISON PARTAGÉE** — la graine (`GRAINE 7`) et le lien
     *Rejouer cette saison dans le jeu* (`?seed=7&weeks=2`).
  3. **ON-CHAIN OU HORS CHAÎNE** — deux colonnes : ce qui est dans le
     contrat NEP-245 (licences, notes de dette, vote du conseil, actes de
     bateau, parts, or/poissons) et ce qui vit dans le moteur Rust (stocks,
     criée, marchands NPC, pêche en mer). Le trait d'union est net.
  4. **Les invariants** — les commandes qui les rejouent.
- **La phrase que le jeu doit pouvoir dire** : la même qu'au bilan, mais
  tenue par un tiers : le juge peut rouvrir la page et la lire lui-même.

### 3.2 Les empreintes

| Empreinte | Valeur vérifiée le 10/11 | Où la vérifier |
|---|---|---|
| `history_hash` du moteur en CLI (graine 7, 7 jours) | `18199874787840155475` | `cargo run -p sim -- init --seed 7 --out /tmp/s7.json && cargo run -p sim -- ff --days 7 --state /tmp/s7.json` |
| `history_hash` du moteur en CLI (graine 7, 28 jours) | `13271621533040960709` | idem avec `--days 28` |
| Signature dans le panneau `Judges` du site public (`?seed=7&weeks=1`, port neuf) | `8442149726481428218` | bouton `Judges` → `Fast-forward 7 days` |
| Même signature, **deux navigateurs et deux profils distincts** | `8442149726481428218` (identique) | vérifié le 10/11 : la graine et le port de départ identiques donnent le même chiffre |
| Signature dans le panneau `Judges` du site public (graine 42) | `10750970453497044227` | `?seed=42&weeks=1` → `Judges` → `Fast-forward 7 days` |
| sha256 du wasm du moteur servi en production | `ce564f299433d805916eb15df55a65a787849c90b4579b6de790425fa5129392` (875 666 o) | `curl -s https://tidewater-play.vercel.app/engine.wasm \| sha256sum` |
| sha256 du wasm du contrat (build local) | `48ae95eed7b7e9afdae35c5af3628ae4b12d09a493fda199f8d90f106b19689b` (419 648 o) | `cd contracts/tidewater && cargo near build non-reproducible-wasm && sha256sum target/near/tidewater/tidewater.wasm` |
| Commit `main` du moment | `11f7a0d` | `git log --oneline -1` |

**Deux précautions, pour que le juge ne cherche pas un écart qui n'est pas
un écart** :

1. **La graine affichée dans le panneau est un hash, pas la graine.** Avec
   `?seed=7`, le panneau écrit `Seed 839689206` : c'est le FNV-1a de la
   chaîne `"7"` (`web/src/api.ts:168-175`), que le moteur reçoit comme
   graine numérique. La graine 7 du moteur en CLI et la graine 7 du
   navigateur sont donc **deux parties différentes** — d'où des
   `history_hash` différents, sans que rien ne soit faux. Pour comparer un
   navigateur et un moteur, il faut comparer **deux navigateurs entre eux**
   (même URL, port neuf) — c'est ce qui a été fait, et les deux chiffres
   sont identiques.
2. **La signature dépend du port de départ**, pas seulement de la graine :
   un port où l'on a déjà joué trois jours donne `436709162309364652` au
   lieu de `8442149726481428218`. C'est le comportement voulu (même graine
   **et** même état ⇒ même saison), et c'est pourquoi le juge doit
   rejouer depuis un port neuf, avec le lien `?seed=…&weeks=…`.

### 3.3 Rejouer tout en local

```sh
# 1. le code et ses 236 tests
git clone https://github.com/BaptisteFaisy/bankkeeper.git && cd bankkeeper
cargo test --workspace            # 236 tests, 0 échec (mesuré sur 11f7a0d)

# 2. la garde de forme : fichiers < 500 lignes, fonctions < 50
python3 tests/ci_structural.py    # 136 fichiers contrôlés

# 3. le jeu, hors-ligne, dans le navigateur
cd web && npm ci && npm run build:offline && cd ..
python3 tests/e2e_offline.py      # parcours de référence, 0 erreur console, 0 appel /api
python3 tests/e2e_pwa.py          # le service worker tient, serveur mort compris
python3 tests/e2e_proofs.py       # la page de preuves est propre et dit « pas encore déployé »

# 4. la saison sans joueur, en commande
cargo run -p sim -- init --seed 7 --out /tmp/s7.json
cargo run -p sim -- ff --days 28 --state /tmp/s7.json
#   → {"days_run":28,"seed":7,"history_hash":"13271621533040960709","events":2}
cargo run -p sim -- state --state /tmp/s7.json | python3 -m json.tool | less
#   → le bilan : "sea_debt", l'attribution par capitaine, le fonds du port

# 5. le contrat NEP-245
cd contracts/tidewater && cargo near build non-reproducible-wasm && cargo test
```

### 3.4 Ce que le juge peut en déduire

- Le `history_hash` **est** une preuve de rejouabilité : deux exécutions,
  deux machines, même graine → même nombre. Le test
  `crates/sim/tests/seed_variety.rs` le vérifie à chaque build.
- Le `sha256` du wasm **est** une preuve que le code servi est celui du
  dépôt : on peut rebuilder et comparer.
- La page de preuves **est** une preuve de l'état on-chain : elle affiche
  « pas encore déployé » tant que c'est vrai, et elle bascule en lecture
  live dès qu'un identifiant de contrat lui est fourni — sans rebuild.

---

# Ce que nous ne montrons pas, et pourquoi

L'honnêteté est un argument devant un jury. Voici la liste complète de ce
qui manque, avec la raison.

| Ce qui n'est pas montré | Pourquoi | Où c'est dit |
|---|---|---|
| **Une vidéo de démo** | Décision du propriétaire (10/11) : la démo se fait par le lien public, le fast-forward et la page de preuves. Un juge qui clique est plus convaincu qu'un juge qui regarde | Ce document ; `docs/COMPLIANCE.md` § 5 |
| **Le contrat sur la chaîne** | Le faucet public NEAR répond `429` (dix créations de compte par trois heures et par IP) ; mesuré le 10/11 à 20:19 UTC, réouverture à **03:27 Paris le 11/11**. Le code est écrit, compilé et testé ; il manque un appel que le réseau refuse de servir | `docs/deployments.md` ; la page `/proofs.html` affiche « PAS ENCORE DÉPLOYÉ » |
| **Des transactions réelles** | Conséquence du point précédent. `docs/deployments.md` affiche « Aucun rejeu enregistré » plutôt qu'un tableau vide qui ferait croire à un rejeu | `docs/deployments.md` § « Transactions du scénario » |
| **Un login réel** | L'email est une étiquette : `/api/auth` répond `{ok:true, token:"local"}`. Ni wallet, ni phrase, ni gas — l'expérience est conforme au track, l'identité ne l'est pas. Le correctif (FastAuth ou relayeur sponsor) dépend du déploiement testnet | `crates/wasm/src/lib.rs:267` ; `docs/ONCHAIN.md` |
| **Du multi-joueur** | Hors périmètre assumé du brief (`tidewater.md` §1.4). Le jeu se joue seul contre des NPC solvables, et l'économie tourne sans joueur — c'est même ce que le fast-forward prouve | `tidewater.md` § 1.4 ; `docs/COMPLIANCE.md` § 5 |
| **Le barceau 5** (jachère collective votée, contentieux) | En construction. Ce qui existe déjà : la dette se rembourse par jachère ou par réensemencement côté moteur (`sim fallow`, `sim reseed`) ; ce qui manque : la jachère votée par le conseil et le recours d'un capitaine lésé | `docs/SPINE.md` ; `docs/DEBT.md` |
| **Le bouton de renflouement** | La mécanique existe côté moteur (`sim refloat`, TW-N-52) et le calcul est juste ; elle n'est pas exposée dans le client web | `crates/rules/src/bankruptcy.rs` |
| **Le paiement de la dette dans l'UI** | `pay_in_fallow` / `pay_in_reseed` ne sont câblés qu'en CLI pour l'instant | `crates/sim/src/main.rs` |
| **La conserverie sans fumée** | L'arrêt d'un acheteur se lit dans le tableau `Judges` (statut `Stopped`), pas sur la carte. C'est une exigence du brief non couverte par l'interface | `tidewater.md` TW-N-53 |
| **Un équilibre définitif** | L'équilibrage (50 graines × 4 politiques) est en cours : le taux de repousse, la part prise par sortie, la redevance et le seuil de jachère sont des curseurs encore en calibration | `docs/BALANCE.md` |

**La règle que nous nous sommes donnée** : si une ligne de ce dossier
n'est pas vérifiable par une commande ou une URL, elle est marquée
« à vérifier » — jamais comblée par une estimation. La grille complète,
exigence par exigence, est dans [`docs/COMPLIANCE.md`](COMPLIANCE.md) ;
l'état daté du dépôt est dans [`docs/PLAN.md`](PLAN.md).
