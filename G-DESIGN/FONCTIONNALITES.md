# FONCTIONNALITÉS — bankkeeper / Tidewater

Inventaire complet de ce que fait le produit, lu dans le code (`web/src/`,
`crates/`, `contracts/`, `docs/`). Sert de référence aux planches HTML :
chaque écran des planches doit montrer tout ce qui est listé ici.

Vocabulaire : **barreau** = les cinq niveaux de la colonne vertébrale
(`docs/SPINE.md`) : voir, payer, gouverner, hériter, réparer.

---

## 1. Ce qu'est le jeu, en une page

Tu es **capitaine et armateur** dans le port de **Tidewater**. Dix bateaux,
trois bancs de pêche, une criée où inonder le port fait chuter les cours, un
Conseil du port où chaque licence donne une voix. Le poisson en mer n'appartient
à personne : ce que tu prends aujourd'hui coûte à quelqu'un d'autre, et à demain.

Le jeu ne juge pas. Le score est la **valeur nette**, avec une deuxième colonne
au bilan : la **dette envers la mer** (caisses prises au-dessus de la prise
durable), en caisses, jamais en morale.

Trois échelles de temps (`docs/GAME-LOOP.md`) :

| Rythme | Ce qui se passe | Ce que fait le joueur |
|---|---|---|
| ~30 s | un lot arrive à la criée, l'horloge descend, un marchand achète ou le lot est perdu | regarde la prise et le prix, réaffecte un bateau |
| 5 min | la journée ferme : repousse, charges, faillites | lit le registre, décide la journée suivante |
| session | une semaine remet les quotas à zéro, une saison se clôt par un vote | licences, dettes, motions, puis la saison suivante |

Deux façons de jouer, même moteur : **live** (un lot toutes les 30 s, une
journée en 5 min) ou **au tour par tour** (`Next lot`, `End the day`).

---

## 2. Écran principal (1280 × 800)

### 2.1 Barre du haut (`components/TopBar.tsx`)

- `Tidewater`, `Week · Day · tide` (marée).
- Or du joueur (en `g`), **quota restant de la semaine**, `Season X of N`.
- Nom du capitaine connecté.
- **Contrôles d'horloge** (`HeaderControls.tsx`) : `Go live` / `Live · next lot
  Ns`, `Next lot`, `End the day`.
- `How to play` (rouvre le tutoriel), `New harbour` (recommencer),
  `Judges` (ouvre le tiroir juges), `Log out`.
- Bandeau `Relay unreachable` si le relais ne répond pas (mode hors-ligne).

### 2.2 Carte marine / scène (`components/SeaMap.tsx`, `scene/*`)

Carte 760 × 440 dessinée en canvas maison, plus un HUD de scène de 116 px.

- **Trois zones** empilées : `The Shallows` (hareng, 3 000 caisses),
  `Greybank` (hareng, 5 000), `The Deeps` (morue, 2 000). Chaque zone a un coût
  de sortie (2 / 4 / 7 or).
- **La mer** : vagues lentes, plus claires sur les hauts-fonds, plus sombres
  dans les Deeps ; ligne de marée sur la côte.
- **Densité de poisson sans chiffre** : silhouettes de poissons qui
  disparaissent quand la zone s'épuise (0 à 4 bancs).
- **Bateaux** : coque + mât + voile, teintés par capitaine (toi = orange
  bouée), sillage en mer, navigation vers le quai au retour.
- **Débarquement** : une caisse décrit un arc du bateau vers le quai,
  éclaboussure à l'amerrissage.
- **Le quai** : trois étals de marchands (`Fishmonger`, `Cannery`, `The Gull`) ;
  l'étal qui achète s'allume en or pendant l'enchère ; une mouette tourne
  au-dessus du lot.
- **Cadran jour/nuit** (aube, jour, soir) + voile de teinte chaude/froide.
- **Coffre du fonds du port** sur le quai : son niveau monte avec la redevance,
  il s'ouvre quand une motion paie.
- **Ancre brisée** sur une zone surexploitée tant que sa dette n'est pas payée.
- **Accessibilité** : le canvas est décoratif ; toutes les actions existent en
  DOM (boutons de zone, liste de bateaux), clavier + lecteur d'écran,
  `prefers-reduced-motion` = image fixe.
- **Lectures de zone en texte** sous la carte (`ZoneReadings.tsx`) :
  `14.2 crates/trip · steady · 3 boats · 2g/trip · survey …`.

### 2.3 Criée (`components/AuctionPanel.tsx`)

- Le lot : `Lot 31/40 : 14 crates of herring (Brandt, small mesh)`.
- **Horloge descendante** : prix en gros chiffres (34 px), barre qui chute,
  `hammer` (prix d'adjudication).
- **Limite de chaque marchand** + infobulle `why` (raisonnement brut, calculé
  par `crates/rules/src/merchant.rs`) : `Cannery 3.6 · base 4.0 × 0.90 (stock
  180 of 150)`, `Fishmonger 3.2`, `The Gull — Closed` (n'achète pas de hareng).
- Ligne de vente : `Sold lot 31 to Cannery: 14 × 3.6 = 50.4g`, ou
  `Lot unsold below the floor`.
- `Next landing` / `Skip` : rejoue les lots du jour un par un.
- Ligne de raisonnement de la criée.

### 2.4 Tes bateaux (`components/BoatsPanel.tsx`)

- Une carte par bateau : nom, état (`At sea: Greybank`, `Trip to … (60%)`,
  `At the quay`, `Disarmed`), filet (`Large mesh` / `Small mesh`),
  `Last catch: 12 crates`.
- **Affectation en deux clics** : sélectionne le bateau, puis une zone sur la
  carte — ou les boutons `The Shallows` / `Greybank` / `The Deeps` / `Quay`.
- **Le filet ne change qu'à quai** (`Nets change at the quay only`).
- Garde-fous : bateau non possédé, désarmé, mauvais filet → toast d'erreur.

### 2.5 Registre du port (`components/LedgerPanel.tsx`)

Cinq blocs :

1. **Today landings** : une ligne par lot (`Brandt · 14 herring @ 3.6g (small)`).
2. **Reasoning** : les phrases brutes derrière les prix et les décisions NPC
   (`Brandt sends 4 boats to Greybank: best catch per trip yesterday.`,
   `Hale stays at the quay: catch per trip 9.8, below 70% of her average (15.2).`,
   `Okoro copies Brandt: 31 gold per boat yesterday, the best in port.`).
3. **Who took what** (barreau 1, voir) : par zone, `took 214 · durable 62/day ·
   1.8x` puis `You 46% · Brandt 31% · Hale 23%`. Une mer morte affiche
   `capital` au lieu d'un multiplicateur.
4. **Debt to the sea** (barreau 4, hériter) : `1 240 crates carried · 210 added
   this season`, puis par zone `took · durable/day · owes`, et `resting Nw`.
5. **Pay the debt** (`SeaPayBlock.tsx`) : deux sorties seulement —
   **jachère** (zone au repos N semaines, la repousse paie, aucun or ne bouge,
   la zone ne rapporte rien) et **réensemencement** (le fonds achète des
   juvéniles au prix courant). Les deux boutons annoncent avant le clic :
   caisses payées, or dépensé, plafond, solde du fonds insuffisant.
6. **Repairs & claims** (`DisputeBlock.tsx`, barreau 5, réparer) : zones en
   jachère collective, indemnités versées par le fonds, **une réclamation par
   saison** contre le fonds (`Claim against fund`), crédibilité.

### 2.6 Bureau du port (`components/HarbourPanel.tsx`)

- **Surveys** : 80 or, une zone, estimation à ±10 %, valable une semaine
  (barreau « voir » : le stock réel n'est jamais montré au joueur).
- **Licences** : pool et prix courant (`pool: 6, yours: 4, 96g each`),
  `Buy licence` / `Sell licence` ; par capitaine (`Hale (4)`, `Brandt (8)`,
  `Okoro (4)`) : `Buy` / `Sell` / `Rent`.
- **Lease desk** : louer une licence à un capitaine (2 semaines par défaut),
  `End lease` ; la liste affiche loyer hebdomadaire et semaines restantes.
- **Loan notes** : `Note 104: Brandt owes 96g, held by Harbour Bank, 2 missed`
  → `Buy` ; une note que tu détiens → `Forbear` (accorder un report) /
  `Seize` (saisir).
- **Council** (barreaux 2 et 3) : motion en cours (`quota 50 · close greybank
  2w · ban small mesh · levy 0.4g a crate · indemnity 0.50g · paid by the port
  fund`), formulaire `Quota`, `Close`, `Ban small mesh`, `Indemnity`,
  `Levy a crate`, `Paid by` (port fund / extra levy), coût total de la motion
  sur la saison, `Propose`, `Vote yes` / `Vote no`.
- **Minutes** : le dernier conseil, vote par vote, avec le calcul de chacun
  (`Brandt votes no: a 50-crate quota costs him 640 a week, your offer pays 400.`).

### 2.7 Chronique et charte (`components/ChroniclePanel.tsx`)

- **The port's chronicle** : une ligne par saison close — valeur nette, stocks
  restants (3 zones), capitaines arrêtés, règle votée.
- `This campaign sails under: quota 50 · small mesh banned` (la charte en cours).

### 2.8 Tiroir Judges (`components/JudgeBench.tsx`, `JudgesPanel.tsx`, `Chart.tsx`)

- Graine affichée, `28 days a season : same seed, same season`, `Copy season
  link` (graine + semaines dans l'URL).
- **Fast-forward 7 jours / 28 jours sans joueur**.
- Résumé : `Seed 7 · 7 days · 3 events`, **signature de rejeu déterministe**
  (`history_hash`).
- **Graphe maison** : stock réel des trois zones + prix du hareng, marqueurs de
  faillites, légende à cases.
- `Live gold in port · outside in · outside out · net` (invariant de l'or).
- **Port fund** : solde, entrées, sorties.
- **Live standings** : or, licences, statut (`Active` / `Stopped`) par acteur.
- **Table de vérité** : `Zone · Your catch per trip · Real stock` — ce que le
  joueur voit à côté de la vérité.
- Le dernier run est conservé après rechargement.

---

## 3. Autres écrans

### 3.1 Porte d'entrée (`AuthGate`, `App.tsx`)

- `Take command`, email, nom de capitaine, `Set sail`.
- `Sign in with your email. No wallet, no seed phrase, no gas.`
- `SeedOffer` : un lien partagé (`?seed=7&weeks=2`) propose d'ouvrir la saison
  partagée ou de garder son port ; l'ancien port est mis de côté
  (`tidewater-game-v1.previous`), jamais perdu.

### 3.2 Tutoriel (`components/Tutorial.tsx`)

Trois cartes, une fois, puis `How to play` pour le rouvrir.

1. `The stock is shared` — six jours d'un banc, la prise par sortie décroche
   avant l'effondrement.
2. `The auction pays what the merchant can afford` — trois jauges de limite,
   `next price` qui descend, l'infobulle `why`.
3. `The council, and the campaign` — trois saisons, un vote à chaque clôture,
   la mer garde ce que la saison lui a laissé.

Clavier : Entrée/Espace avancent, Échap ferme, Tab piégé, focus rendu.

### 3.3 Bilan de saison et charte (`EndScreen`, `CharterScreen.tsx`)

- **Bilan** : `Net worth`, `Gold`, `Licences`, `Stocks left` (3 zones),
  **`Debt to the sea`** (caisses), `Last council` (pour/contre, passé ou
  rejeté), `Sail the next season` / `New harbour`.
- **Charte** (fin de campagne, 3 saisons) : trois phrases, un choix —
  `The quota falls` (50 au lieu de 70), `The small mesh is banned`,
  `Idle licences pay` (10 % du prix par lundi, sinon retour au pool).
  La charte est gardée dans le navigateur et gouverne la campagne suivante.

### 3.4 Preuves publiques (`/proofs.html`, `web/src/proofs/*`)

- `Preuves publiques`, ton : « rien ici ne demande de nous croire ».
- **Carte contrat** : NEP-245, adresse, fonctions, taille wasm, refresh.
- **Jetons** : or (0), hareng (1), morue (2), licences (3, offre 20),
  actes de bateau (10-19), notes de dette (100+), parts de renflouement (200+),
  avec offre lue on-chain.
- **Frise des transactions** (timeline).
- **Saison partagée** : `?seed=` et `?weeks=`, lien « rejouer cette saison »,
  hash à confronter dans `Judges`.
- **On-chain / hors chaîne** : deux colonnes honnêtes (ce qui vit dans le
  contrat, ce qui tourne dans le wasm du navigateur).
- **Invariants** : quatre preuves reproductibles (`cargo test`, déterminisme,
  fast-forward, parcours headless) avec la commande exacte.

---

## 4. Économie et règles visibles

- **Stock commun** : une sortie prend 0,4 % du stock ; repousse logistique
  (5 %/jour hareng, 2 %/jour morue) ; à zéro, plus de repousse.
- **Licences** : 20 licences, 70 caisses/semaine chacune, plafond 8 par
  capitaine, une licence = une voix.
- **Criée néerlandaise** : prix qui descend, limite = base × facteur de stock ;
  inonder fait baisser le prix pour tout le monde.
- **Filets** : `Large mesh` (normal) / `Small mesh` (+40 % de prise, repousse
  réduite) — visible dans le registre, interdit par une charte possible.
- **Dette** : la banque prête, deux traites manquées = saisie ; un capitaine à
  court sort tous ses bateaux au petit maillage (raisonnement affiché).
- **Or conservé** : entrées = conserves exportées + voyageurs ; sorties =
  carburant + appâts ; l'invariant est vérifié à chaque cycle et affiché.
- **Faillite** : or à zéro en fin de semaine → bateaux désarmés, licences aux
  enchères ; un marchand à zéro ferme (`Closed`).
- **Fonds du port** : redevance prélevée à la source sur chaque lot vendu ;
  paie relevés, jachères, indemnisations ; motion = quota + financement.

---

## 5. Technique (ce que les juges peuvent vérifier)

- Moteur Rust déterministe compilé en wasm (868 Ko), **zéro serveur, zéro
  appel `/api/` en production**, PWA installable + page hors-ligne.
- Contrat NEAR NEP-245 multi-tokens (`contracts/tidewater/`, 37 fonctions,
  ABI embarquée), relais sponsorisé (pas de wallet, pas de gas).
- Persistance `localStorage`, reprise après rafraîchissement, graine
  partageable par URL, `history_hash` reproductible.
- 238 tests Rust verts (au 10/11), 31 tests contrat, e2e headless zéro erreur
  console, CI < 5 min.
- Accessibilité : canvas décoratif + contrôles DOM, focus visible,
  `prefers-reduced-motion` respecté partout.
- DA contrainte : `docs/ART.md` — palette de `styles.css` uniquement, plat,
  canvas procédural, aucun asset externe, aucun dégradé, aucun verre dépoli.

---

## 6. Ce qui n'existe pas (à ne pas dessiner)

- Pas de Telegram, pas de bot, pas de jeu idle, pas de coffre-fort de dépôts.
- Pas de classement entre joueurs humains (le solo contre NPC est le mode).
- Pas de mobile dédié (hors périmètre, `tidewater.md` §1.4) : responsive
  jusqu'à une colonne sous 1100 px, pas de maquette téléphone.
- Pas de criée commune multi-joueurs (piste 1 de `docs/VISION.md`, non codée).
- Pas de son.
