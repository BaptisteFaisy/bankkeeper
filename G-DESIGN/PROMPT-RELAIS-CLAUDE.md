# PROMPT DE RELAIS — opencode → Claude (2026-11-12)

> À coller tel quel dans une conversation Claude Code / Claude Desktop.
> Contexte + état des lieux + décisions + ce qu'il reste à faire + fichiers à lire.

---

## Prompt

Tu prends la main sur **Tidewater**, le jeu du repo `BaptisteFaisy/bankkeeper`
(hackathon NEAR, track `games`). Je suis Gaia, je pilote les décisions design ;
Baptiste tient le repo GitHub ; un agent opencode a fait la passe de code
ci-dessous et te laisse la main sur la suite.

### 1. Le jeu, en trois lignes

Tidewater : tu es capitaine de pêche dans un port où **trois bancs de poissons
sont partagés par tous les capitaines** (tragédie des commons jouable). Tu
envoies tes bateaux, tu fermes la journée, la criée vend ta prise lot par lot,
et à chaque fin de saison **la flotte vote le quota suivant**. But : la plus
grande valeur nette à la fin de la campagne, avec une mer encore pêchable.
Boucle : 1 lot / 30 s (`Go live`), une journée en 5 min (`End the day`),
saison = quelques semaines, vote du conseil au clos.

### 2. État des lieux (branche `feat/cover-page`, 2 commits poussés)

- `dd6c9eb` — **page de garde + deck lisible**
  - `web/src/components/Cover.tsx` + `web/src/cover.css` : voile
    semi-transparent **à chaque chargement** sur toute la page (le port 3D
    reste visible derrière). Contenu : titre *Tidewater*, slogan (« One
    harbour, one sea… »), ligne « Goal », **How to play en 4 verbes**
    (Send / Sell / Watch / Vote, une phrase par geste), boutons **Play**
    (lève le voile) et **Scenario** (ouvre `scene-preview.html`, la démo
    guidée existante : une journée scriptée avec légendes). Échap ferme aussi.
  - `web/src/components/PanelHead.tsx` : une phrase d'entrée en clair sous
    chaque titre de panneau du deck. Onglets renommés **Auction / Boats /
    Today / Manage / History** (les `aria-label` des sections n'ont pas
    bougé : les sélecteurs e2e restent valides).
- `31a854c` — **barre du haut réduite, règles limpides**
  - Supprimés : le champ **« Captain name »** (le capitaine prend le préfixe
    de l'email : `skip@tide.water` → « Skip »), et les boutons **Log out**,
    **Next lot**, **New harbour** de la barre du haut (le recommencement reste
    sur l'écran de bilan). Il reste : stats, `Go live`, `End the day`,
    `How to play`, `Judges`.
  - `Tutorial.tsx` réécrit : 3 cartes en phrases courtes sans jargon,
    nouveaux titres — *One sea, shared by all*, *The auction sells your
    catch*, *The vote closes each season*.
  - Docs alignés (README, `docs/GAME-LOOP.md`, `docs/COMPLIANCE.md`,
    `docs/DEMO-JUGES.md`, `docs/TUTORIAL.md`, `G-DESIGN/FONCTIONNALITES.md`)
    et tests e2e patchés (`dismiss_cover()`, plus de saisie du nom, scénario
    audit A5 « Log out » remplacé, clics « Next lot » remplacés).

### 3. Ce qui est vérifié / pas vérifié

- Vérifié sur ce poste (Windows) : `tests/ci_structural.py` OK (tailles,
  goûts, palette) ; `tsc --noEmit` propre ; `vite build` OK ; docs UTF-8 OK.
- **Pas vérifié** : les e2e Selenium (`tests/e2e_*.py`, `tests/audit_web.py`).
  Ils sont écrits pour le runner Linux (`chrome-profile-guard`, `/tmp`) et
  selenium n'est pas installé sur le poste Windows de Gaia. **À relancer sous
  Linux**, ils ont été patchés pour la page de garde et le formulaire à un
  seul champ.
- **Bug bloquant connu (pré-existant)** : `web/src/proofs/Timeline.tsx` et
  `web/src/proofs/timeline.ts` ne coexistent pas sous Windows (casse) :
  `npm run build` y échoue. Contournement local utilisé ici (renommage
  temporaire, non commité). À traiter proprement sous Linux.

### 4. Décisions de Gaia déjà actées (ne pas remettre en cause sans lui demander)

1. La page de garde revient **à chaque chargement**.
2. « Scenario » = la **démo guidée qui existe déjà** (`scene-preview.html`).
3. Les boutons supprimés le restent (« supprime skipper, log out, next lot,
   new harbour »).
4. Les règles du jeu doivent être **limpides et digestes** : la page de garde
   et le tutoriel ont été réécrits dans cet esprit.

### 5. Ce qui reste ouvert (à trancher ou à produire)

1. **Relecture visuelle du rendu** : la page de garde et le deck simplifié
   sont nouveaux — Gaia veut du lisible et du beau (direction validée :
   V9.1/V9.2 réaliste three.js, thème jour blanc/bleu clair dans
   `web/src/v9.css`, une seule couleur d'action, le bleu `#1565c8`).
2. **Le mode « lot par lot »** a disparu avec `Next lot` : `End the day`
   lande le reste du jour en un clic. Si Gaia le réclame, `game.nextLot`
   existe encore dans `web/src/hooks.ts`.
3. **« Scenario » reste la démo 2D** (`scene-preview.html`, moteur 2D
   maison) alors que le jeu est en 3D three.js : à confirmer, ou avenant
   pour la même scène.
4. **Avenant `docs/ART.md`** : il dit encore « 2D, plat, palette
   styles.css » ; la réalité est 3D three.js + thème jour `v9.css`. À écrire.
5. **Pour la soumission** (deadline dev 2026-11-14T23:59Z) : relancer les
   e2e, README juges, script vidéo, payload — voir `G-DESIGN/STATUS.md`.
6. Prévenir Baptiste des changements dans `web/` (dépendance `three`
   déjà introduite avant nous, cette branche ajoute surtout du
   composant/CSS et des tests).

### 6. Contraintes non négociables (`tests/ci_structural.py`)

- Fichiers < 500 lignes, fonctions < 50 lignes.
- Interdits dans `web/` : dégradés (`linear-gradient` etc.), `backdrop-filter`,
  violet/indigo, emojis-icônes, `repeat(auto-fill/auto-fit)`, fond crème.
- Palette `web/src/styles.css` (9 teintes) intacte ; `prefers-reduced-motion`
  respecté ; DPR plafonné à 2 dans les canvas.
- Ne casse pas les sélecteurs e2e : `section[aria-label='Sea chart' |
  'Fish auction' | 'Your boats' | 'Harbour ledger' | 'Harbour office' |
  'Chronicle']`, `[data-testid='cover-play']`, `.cover`,
  `form.auth-card`, `[data-testid='fallow-preview']`, `#tutorial-title`…

### 7. Fichiers à lire en premier

- `G-DESIGN/STATUS.md` (journal des décisions et de ce qui reste)
- `G-DESIGN/HANDOFF.md` (historique des passages de relais)
- `G-DESIGN/DESIGN.md` (direction artistique validée)
- `web/src/components/Cover.tsx`, `Tutorial.tsx`, `TopBar.tsx`, `Auth.tsx`,
  `DeckNav.tsx`, `PanelHead.tsx`
- `web/src/cover.css`, `web/src/v9.css`
- `docs/TUTORIAL.md`, `docs/DEMO-JUGES.md`, `docs/GAME-LOOP.md`

### 8. Commandes utiles

- Lancer le jeu (moteur wasm, hors-ligne) :
  `cd web && $env:VITE_ENGINE='wasm'; npx vite` (un serveur tourne déjà sur
  http://localhost:5180 à l'instant du relais).
- Vérifs : `python tests/ci_structural.py` depuis la racine du repo ;
  `npx tsc --noEmit` dans `web/` (échoue uniquement sur le bug Timeline sous
  Windows) ; e2e : `python3 tests/e2e_tidewater.py` etc. sous Linux après
  `npm run build`.

### 9. Ta tâche maintenant

Reprendre la main sur l'interface : regarder le rendu (page de garde + deck
sous la scène 3D), itérer visuellement avec Gaia pour le rendre encore plus
clair et soigné, **sans toucher à la boucle de jeu ni aux sélecteurs e2e**,
puis relancer les vérifs (`ci_structural.py`, build) avant de committer sur la
branche `feat/cover-page`.
