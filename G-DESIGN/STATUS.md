# STATUS — bankkeeper · G-DESIGN

## Claude — V10 (2026-11-12, soir — l'entrée au port)

- Phase : relecture visuelle de la page de garde (opencode) ; round V10.
- Fait : photo du port derrière la page de garde et la connexion, voile
  allégé, formulaire masqué sous le voile, cartes opaques. Détail dans
  `DESIGN.md` § V10 et `HANDOFF.md`.
- V10.1 : tutoriel plus ouvert automatiquement (décision Gaia) ; e2e
  `e2e_tutorial.py` + 2 docs à aligner par opencode (voir HANDOFF).
- V10.2 : barre du haut en trois cadrans (choix Gaia : B), codée et
  vérifiée en capture ; `audit_web.py` à relancer sous Linux.
- Repéré : sous ~1100 px, étiquettes de bancs qui se chevauchent.
- Non commité.

## Claude — V9 / V9.1 (2026-11-12, réalisme — **direction validée par Gaia**)

- **V9.1** : occlusion ambiante, matières (crépi, tuiles, pierre, vitres),
  montagnes rocheuses enneigées, conifères, mâts en volume. Voir `DESIGN.md`.
- **Aperçu** : entrée `tidewater-design` de `HACKATONS/.claude/launch.json`
  (port 47310) → `http://localhost:47310/v9/`.

- **Retour Gaia** : les 10 planches V8 (bleu clair / blanc, moteur maison)
  « pas assez modernes, pas assez 3D ». Choix de Gaia : **réalisme (vraie eau,
  matières)** et **three.js autorisé** si nettement plus beau.
- **Livré** : `G-DESIGN/v9/` — scène three.js 0.187 (installée en local via
  npm, aucun CDN) : ciel physique, mer réfléchissante animée, ombres douces du
  soleil, matières peintes, ville blanche à toits bleus, montagnes, bouées
  blanches autour des bancs, chalutiers (les tiens à coque bleue). HUD clair.
  Vue par défaut : plan cinéma au ras de l'eau ; glisser = tourner, molette = zoom.
- **V8** (`G-DESIGN/v8/`, 10 planches) : abandonnée, gardée en archive.
- **À décider** : three.js dans `web/` = entorse à « zéro dépendance »
  (accord de Gaia donné, Baptiste à prévenir) ; la V7 jouable (`web/src/scene3d`)
  devra être re-rendue avec ce moteur si Gaia valide V9.
- **Lancer** : `python G-DESIGN/v5/serve.py 8790` → `http://localhost:8790/v9/`
- **Horodatage** : 2026-11-11

---

## Claude — V7 (2026-11-11, passe 1)

- **Phase** : V7 passe 1 livrée — **la 3D est le jeu**, branchée sur le moteur
  wasm de `web/`, jouable à la souris (clic bateau → clic banc / quai).
- **Round** : V7.1 (composition). En attente du retour de Gaia sur la
  composition avant tout ajout de détail.
- **Code modifié** (autorisé par `PROMPT-CLAUDE-V7.md` §4.2) : `web/src/scene3d/*`,
  `SeaMap.tsx`, `Books.tsx`, `DeckNav.tsx`, `seaPick2d.ts`, `App.tsx`,
  `main.tsx`, `v7.css`. Rien de commité ni poussé. Baptiste à prévenir.
- **Vérifié** : partie locale jouée, `ci_structural.py` OK.
- **Reste** : e2e, détail visuel, README juges, script vidéo, payload.
- **Lancer** : `cd web && VITE_ENGINE=wasm npx vite` (après `cargo build
  --target wasm32-unknown-unknown --release -p tidewater-wasm` et copie de
  `tidewater_wasm.wasm` vers `web/public/engine.wasm`).
- **Horodatage** : 2026-11-11

---

## Claude

*(Journal complet : `DESIGN.md` — V4 → V6. Archives V1 → V3.2 : `DESIGN-V1.md`.)*

- **Phase** : design — **V6, six variantes modernes sur le moteur v5**
- **Rounds** : V1 → V1.1 → V2 → V3 → V3.1 → V3.2 → V4 (opencode) →
  V5, V5.1 (Claude, réglé à l'œil) → **V6 (opencode, six variantes)**
- **Retour Gaia (6e)** : « les infos en gros c'est bien, mais il y a trop
  d'informations en même temps et tout le temps » + « le design n'est pas assez
  moderne » → `/variantes` 6 planches modernes et 3D.

### Ce qui a été livré (`G-DESIGN/v5/`)

- **`variants.js`** (nouveau) : les six variantes, chacune avec sa palette
  complète (accent, brume, eau profonde/haute, ciel zénith/horizon, ombre,
  lumière de ciel, lumière clé, encre), le traitement des arêtes, le sonar, le
  disque de diorama, la rotation, et sa classe de HUD. Plus `V5.FOCUS` : le
  point focal de chaque étape.
- **Une seule chose à la fois** : au repos = marque, horloge, **valeur nette +
  dette envers la mer**, bouton, sélecteur de variantes. Pendant une étape =
  l'événement + **l'échelle de temps active uniquement** + le **problème
  épinglé**. Le benchmark et la liste des problèmes **n'apparaissent qu'au
  bilan**, ou via le bouton `Everything`.
- **Le reste du port s'éteint** autour du sujet : chaque étape porte un point
  focal qui tamise ce qui n'est pas concerné (piège 1 → Greybank, piège 2 → le
  quai et la criée, conseil → l'hôtel de ville, saison 3 → les Deeps).
- **Six variantes** : `abyss` (cyan, sonar) · `blueprint` (cyan pâle, dessin
  technique, arêtes fortes) · `bone` (monochrome, encre, aucun glow) ·
  `ember` (nuit chaude, une braise) · `signal` (lime brutaliste) ·
  `diorama` (maquette circulaire qui tourne lentement).
- URL : `index.html?v=<variante>` ouvre une variante, `?step=<n>` saute à une
  étape, `?diag=1` renvoie le readback de contrôle.

### Corrections techniques

- **La palette n'était jamais envoyée aux shaders** : V5.2 attendait un
  `variants.js` qui n'existait pas, donc accent, brume, eau et ciel valaient 0.
  Branché dans `common()`.
- Point focal (`uFocus`), disque de diorama (`uClip`) et rotation lente pilotés.
- Contraste : l'eau était lavée d'accent (80 à 97 % de pixels éclairés) ;
  sonar, spéculaire, streak et bloom abaissés, eaux profondes assombries →
  33 à 57 % selon la variante.
- Arêtes mises à l'échelle par variante via `uA` (la géométrie n'est pas
  reconstruite).

### Vérification (sans image — opencode n'a pas d'entrée visuelle)

Console propre sur les six variantes. Dominantes mesurées par readback :
abyss (26,72,92) · blueprint (35,80,108) · bone (50,50,56) · ember (71,40,25) ·
signal (53,65,29) · diorama (22,51,66). Tous les identifiants du HUD présents.

- **En attente** : Gaia regarde les six variantes et en choisit une
  (`/lock <variante>`), ou donne des deltas numérotés (`/delta`).
- **Limite connue** : le réglage esthétique fin (ce qui est « moderne ») demande
  des yeux. Claude doit reprendre la main pour l'itération visuelle.
- **Deadline design** : 14/11 — soumission 15/11 00:59 Paris
- **Horodatage** : 2026-11-11
- **Note** : V1 → V4 et V6 rédigées en relais par opencode (combo cheap) ;
  V5 et V5.1 par Claude. Repo code intact (lecture seule), branche
  `design/v5-harbour`, rien de commité ni poussé.

---

## Relais V7 — 2026-11-11 (opencode → Claude)

- **Décision Gaia** : insatisfaite du rendu des variantes. Le design passe à
  Claude, avec deux exigences nouvelles :
  1. un rendu **beaucoup plus moderne**, en gardant le **contenu** de la
     variante `diorama` (`http://localhost:8790/v5/index.html?v=diorama`) ;
  2. **il faut pouvoir vraiment jouer** — la V6 est une cinématique scriptée,
     pas un jeu. Le jeu réel existe dans `web/` (React + wasm, hors-ligne) :
     la nouvelle interface doit être branchée dessus.
- **Prompt complet prêt à coller** : `G-DESIGN/PROMPT-CLAUDE-V7.md`
  (9 sections : mission, lectures, contenu à garder, ce qu'il faut changer
  dont les 3 niveaux de « vraiment jouer », règles/critères/livrables du
  NEAR HACKATHON vérifiés le 11/11, sources, méthode, définition de fini,
  commandes).
- **Règles officielles vérifiées** : fin de développement 2026-11-14T23:59Z ;
  dépôt public obligatoire ; post X par Gaia avec @NEARProtocol et
  #NEARHackathon + vidéo ; une seule soumission non modifiable via
  `POST /api/applications` (le champ `website` est un piège à spam) ;
  **Claude Code et Codex font un screening avant le jury humain** (Q-017) →
  le README doit être en « fais X, vois Y » ; track `games` jugé sur **la
  boucle de jeu, pas le jeton**.
- **Serveur de prévisualisation** : `python G-DESIGN/v5/serve.py 8790`
  (en ligne au moment de ce relais).
- **En attente** : Claude reprend la main sur `design/v5-harbour`.

---

## Relais V7 bis — 2026-11-11 (décision Gaia : une seule page, démo + jeu réel)

- **Exigence nouvelle** : « il faut que le projet marche en vrai aussi, qu'il
  soit vraiment utilisable, pas seulement qu'il puisse être simulé, et ce
  **sur la même page** que la simulation. »
- **C'est écrit noir sur blanc** dans `PROMPT-CLAUDE-V7.md` :
  - mission (section 1.B) ;
  - nouvelle section **4.3 — UNE SEULE PAGE**, avec les deux modes (DÉMO et
    JEU), le passage sans rechargement, la conséquence technique (la démo
    doit devenir un cas particulier du mode jeu : une politique qui pilote le
    vrai moteur, comme `crates/sim/src/policies.rs`), ce que ça interdit, et
    le **test d'acceptation en 6 étapes** ;
  - checklist de fini complétée (section 8) : une seule scène/HUD/URL, un
    seul mode de rechargement, une seule source de vérité.
- **Route d'intégration suggérée** : remplacer/augmenter la scène 2D existante
  (`web/src/scene/*` + `SeaMap.tsx`, cf. `docs/ART.md` « Vague 2 ») par la
  scène WebGL de `G-DESIGN/v5/`, en gardant le contrat DOM/a11y/e2e de
  `SeaMap.tsx`, et en dégradant proprement si WebGL est indisponible.
- **Prompt à coller** : `G-DESIGN/PROMPT-CLAUDE-V7.md` (mise à jour).
## Claude — V9.2 (2026-11-12, soir)

- **Phase** : décor réaliste three.js branché au vrai jeu dans `web/` — jouable, non commité.
- **Round** : V9.2 (direction V9 validée par Gaia, puis « Branche-la au jeu »).
- **Aperçu** : entrée `tidewater-game` de `HACKATONS/.claude/launch.json` → `http://localhost:47311/` (moteur wasm).
- **Vérifié** : clic bateau → banc, fin de journée, criée, zoom ; `ci_structural.py` OK.
- **Reste** : e2e Selenium, build de production (bloqué sous Windows par `proofs/Timeline.ts`), avenant `docs/ART.md`, prévenir Baptiste (dépendance `three`), README juges, script vidéo, payload.

---

## opencode — page de garde + deck lisible (2026-11-12)

- **Phase** : code — branche `feat/cover-page` (non fusionnée, poussee).
- **Décisions Gaia** : page de garde **à chaque chargement** ; « Scenario »
  = la **démo guidée qui existe déjà** ; boutons topbar **pas touchés**
  (« on décidera après »).
- **Livré** :
  - `web/src/components/Cover.tsx` + `web/src/cover.css` : voile
    semi-transparent sur toute la page, titre, slogan (« One harbour,
    one sea… »), « How to play » en 4 lignes ; **Play** lève le voile,
    **Scenario** ouvre `scene-preview.html` (la journée scriptée avec
    légendes). Échap ferme aussi.
  - Deck rendu compréhensible : `PanelHead.tsx` ajoute une phrase
    d'entrée en clair sous chaque titre de panneau (Auction, Boats,
    Ledger, Office, Chronicle) ; onglets renommés Auction / Boats /
    Today / Manage / History (les `aria-label` des sections ne bougent
    pas, les sélecteurs e2e restent valides) ; « Today landings » →
    « Today's landings », « Reasoning » → « Notes from the harbour ».
  - Tests e2e : `dismiss_cover()` (e2e_tidewater) appelé dans les
    scripts qui cliquent après un `driver.get` : offline, tutorial,
    chain_public, onchain, audit_web. `e2e_pwa` et `e2e_proofs` n'en
    ont pas besoin (aucun clic sur la page).
- **Vérifié ici** : `ci_structural.py` OK (3 nouveaux fichiers inclus) ;
  `npx vite build` OK via contournement temporaire du couple
  `Timeline.tsx` / `timeline.ts` (rien de ce contournement dans le
  commit) ; `tsc --noEmit` ne montre que l'erreur de casse pré-existante.
- **Reste (Linux / Baptiste)** : relancer les e2e Selenium ; build de
  production ; le détail des boutons topbar reste à trancher avec Gaia.
- **Horodatage** : 2026-11-12

---

## opencode — round 2 : barre du haut réduite, règles limpides (2026-11-12)

- **Décision Gaia** : supprimer **Skipper** (le champ « Captain name »),
  **Log out**, **Next lot** et **New harbour** ; rendre les règles
  « How to play » limpides et digestes.
- **Livré** :
  - `Auth.tsx` : un seul champ (email). Le capitaine prend le préfixe
    de l'adresse (`skip@tide.water` → « Skip ») ; plus rien à remplir.
  - `TopBar.tsx` : plus de `Log out` ni de `New harbour` (le
    recommencement reste sur l'écran de bilan et l'offre de lien
    partagé ; pas de déconnexion : le port appartient au navigateur).
  - `HeaderControls.tsx` : plus de `Next lot` — deux contrôles restent,
    `Go live` (1 lot / 30 s) et `End the day` (ferme le jour d'un coup).
  - `Cover.tsx` : la page de garde parle en gestes — **Send / Sell /
    Watch / Vote**, une phrase par geste, plus une ligne « Goal » claire.
  - `Tutorial.tsx` : les trois cartes réécrites en phrases courtes et
    sans jargon (titres inclus) : « One sea, shared by all », « The
    auction sells your catch », « The vote closes each season ».
  - Docs alignés : README, GAME-LOOP, COMPLIANCE, DEMO-JUGES, TUTORIAL,
    FONCTIONNALITES. Tests alignés : le champ nom n'est plus tapé dans
    les trois e2e ; audit_web : scénario A5 « Log out » remplacé par une
    note de retrait, les deux clics « Next lot » par un `End the day` ;
    e2e_tutorial attend les nouveaux titres de cartes.
- **Vérifié ici** : `ci_structural.py` OK ; `tsc --noEmit` propre ;
  `npx vite build` OK (contournement Timeline non commité).
- **À savoir** : le mode « lot par lot » n'existe plus côté UI —
  `End the day` lande le reste du jour en un clic ; si Gaia le veut en
  retour, `Next lot` se remonte depuis `game.nextLot` (hooks.ts).
- **Horodatage** : 2026-11-12
