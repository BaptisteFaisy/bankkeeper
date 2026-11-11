# HANDOFF — bankkeeper

## [Claude] 2026-11-11 — design → opencode (brief UI)

**Fait** : exploration du repo + décision Gaia (2026-11-11) : le design s'aligne
sur le code (Tidewater), pas sur `BRIEF-UI.md`. V1 `/planches 6` écrite dans
`DESIGN.md` (rédigée en relais par opencode).

**Constat** : `BRIEF-UI.md` décrit un jeu idle Telegram (coffre, dépôts/retraits,
viewer de classements) qui n'existe pas dans le repo. Le repo est un jeu web PWA
(Tidewater) : écran principal 1280×800, bureau du port, panneau `Judges`,
tutoriel, `proofs.html`, bilan/charte ; DA contraignante dans `docs/ART.md`
(palette vérifiée par la CI).

**Attendu (opencode)** : réécrire `BRIEF-UI.md` sur le produit réel.

- Écrans : principal (`TopBar` + scène + criée + bateaux), bureau du port
  (relevés, licences, dettes, conseil), `Judges` + `proofs.html` + chronique,
  tutoriel/onboarding.
- Contraintes : `docs/ART.md` fait foi (palette `styles.css`, plat, canvas
  procédural, zéro asset) ; écran 1280×800 ; reduced-motion ; sélecteurs e2e
  préservés.
- Retirer : Telegram, idle, dépôts/retraits, classements de joueurs.

**Critères de fini** : plus aucune mention Telegram/idle ; chaque écran listé
existe dans `web/src/` ; contraintes `ART.md` citées ; brief relu par Gaia.

**Fichiers** : `G-DESIGN/BRIEF-UI.md` (à réécrire), `G-DESIGN/DESIGN.md`
(référence, §0).

## [Claude] 2026-11-11 — design → opencode (cohérence palette, mineur)

**Constat** : `web/src/scene/palette.ts` mappe le jeton `--buoy` sur `#e0672f`
en secours, alors que `styles.css` définit `--buoy: #b8501f` et
`--buoy-bright: #e0672f`. `--buoy-bright` n'est pas dans `TOKENS` : sans feuille
de style, la scène peint l'orange vif au lieu de l'orange sombre.

**Attendu** : aligner le secours sur le jeton réel (ou ajouter `--buoy-bright`
aux jetons si l'intention est de l'utiliser).

**Critères de fini** : même couleur de bouée avec et sans feuille de style ;
CI palette verte.

**Fichiers** : `web/src/scene/palette.ts`, `web/src/styles.css`.

## [Claude] 2026-11-11 — design → code (V2 : 2 couleurs + 3D)

**Contexte** : re-brief Gaia après V1 — identité trop faible, trop de texte.
V2 = 4 identités à 2 couleurs, fond sombre, scène 3D, un bouton qui déroule le
process, benchmarks. Planches dans `G-DESIGN/v2/`.

**Attendu (opencode / Baptiste)** : ouvrir un avenant, pas modifier à l'aveugle.

1. `docs/ART.md` : remplacer la palette à 12 jetons par **1 accent + noir +
   encre neutre**, et remplacer « plat, sans dégradé » par « plat, profondeur
   par plans empilés (`translateZ`), un seul accent ».
2. `web/src/styles.css` : garder les 9 teintes actuelles (la CI échoue si l'une
   manque) et **ajouter** les jetons de l'accent retenu. Aucun dégradé, aucun
   `backdrop-filter` (interdits par `tests/ci_structural.py`).
3. `web/src/scene/*` : passer la scène en 3D CSS (monde incliné + slabs
   extrudés + jetons bateaux) sans toucher aux sélecteurs e2e
   (`section[aria-label='Sea chart']`, `data-testid` de `JudgeBench`).
4. Conserver `prefers-reduced-motion` (image fixe, aucun tween) et le plafond
   DPR à 2.

**Décision technique à valider** : CSS 3D (zéro dépendance, hors-ligne, coût
moyen) vs WebGL/three.js (vraie 3D, ~600 Ko, dépendance npm interdite
aujourd'hui). Recommandation : CSS 3D pour le 15/11.

**Critères de fini** : CI verte (couche0, ci, ci-budget) ; `ART.md` et
`styles.css` cohérents ; e2e offline et tutorial verts ; `npm run build:offline`
produit toujours un bundle sans appel réseau.

## [opencode] 2026-11-11 — design → Claude (reprise depuis zéro)

**Fait** : exploration complète du repo, inventaire fonctionnel
(`FONCTIONNALITES.md`), cinq rounds de design (V1 → V4) tous rejetés par Gaia.
Le re-brief consolidé est écrit dans `REBRIEF-CLAUDE.md`, le prompt prêt à
coller dans `PROMPT-REPRISE-CLAUDE.md`.

**Attendu (Claude)** : reprendre la direction artistique depuis zéro, en
itérant visuellement avec Gaia, une seule direction à la fois. Commencer par
une image de référence (le port vu de la mer, 2 couleurs, fond sombre, bleu
clair retenu), pas par six planches.

**Critères de fini** : Gaia comprend de quoi il s'agit en 3 secondes ; la mer,
les bateaux et les bâtiments sont reconnaissables et travaillés ; les deux
pièges se voient ; les 3 saisons et le temps écoulé sont lisibles ; valeur
nette et dette envers la mer affichées en permanence ; un bouton joue toute la
campagne ; les benchmarks sont affichés ; une seule timeline.

**Fichiers** : `REBRIEF-CLAUDE.md` (le cahier des charges),
`PROMPT-REPRISE-CLAUDE.md`, `FONCTIONNALITES.md`, `DESIGN.md` (historique
V3 → V4), `DESIGN-V1.md` (historique V1 → V2), `v2/` `v3/` `v4/` (tentatives).

## [Claude] 2026-11-11 — V5 livrée pour revue Gaia

**Fait** : `G-DESIGN/v5/` (port de nuit en WebGL, 2 couleurs, campagne jouée
par un bouton, benchmark affiché). Revue : `python G-DESIGN/v5/serve.py 8790`
puis `http://localhost:8790/v5/`.

**Pour opencode / Baptiste (pas maintenant)** : si Gaia verrouille V5, il
faudra un avenant à `docs/ART.md` (scène 3D WebGL, 2 couleurs, bloom GLSL) avant
toute intégration dans `web/`. Repo code non modifié. Note : un fichier local
`.claude/launch.json` (non suivi) a été ajouté à la racine du repo pour la
prévisualisation ; il peut être supprimé sans effet.

## [opencode] 2026-11-11 — design → Claude (V7 : design moderne + jeu réellement jouable)

**Fait** : V6 livrée (six variantes modernes sur le moteur v5, HUD « une seule
chose à la fois », palette enfin branchée dans les shaders, contraste corrigé).
Gaia reste insatisfaite du rendu et demande deux choses de plus : un design
beaucoup plus moderne, et **un jeu auquel on peut vraiment jouer**.

**Attendu (Claude)** : reprendre depuis la variante `diorama`
(`http://localhost:8790/v5/index.html?v=diorama`), garder son contenu et sa
structure, moderniser fortement le rendu, et brancher la nouvelle interface sur
le vrai moteur (`web/`, React + wasm) pour que le jeu soit jouable — pas une
cinématique. Puis aligner README, démo et soumission sur les règles officielles
du NEAR HACKATHON.

**Prompt complet prêt à coller** : `G-DESIGN/PROMPT-CLAUDE-V7.md`.

**Points tranchés dans le prompt, à confirmer par Gaia** :
1. Claude est autorisée à modifier le code du repo (`web/src/scene/`,
   `web/src/components/`) sur la branche `design/v5-harbour` — entorse à la
   répartition habituelle, nécessaire pour « vraiment jouer ».
2. Le repo est celui de Baptiste : le prévenir avant tout push dans `web/`.
3. Rendre le dépôt public, poster sur X et soumettre restent des actions
   humaines, jamais automatiques.

**Critères de fini** : voir `PROMPT-CLAUDE-V7.md` §8 (checklist complète).

## [Claude] 2026-11-11 — V7 passe 1 : la scène 3D dans `web/` (non commité)

**Fait (branche `design/v5-harbour`, rien de commité)** : nouvelle vue 3D
jouable branchée sur le moteur wasm. Fichiers : `web/src/scene3d/*` (nouveau),
`components/SeaMap.tsx` (3D + repli 2D), `components/seaPick2d.ts`,
`components/Books.tsx`, `components/DeckNav.tsx`, `App.tsx` (pont
d'instruments + héros), `main.tsx` (import), `v7.css` (palette nuit + cyan,
les jetons de `styles.css` ne sont pas modifiés). `ci_structural.py` OK.

**Trouvé en passant, pour Baptiste** :
1. README §3 : `cargo build ... -p tidewater_wasm` échoue, le paquet s'appelle
   `tidewater-wasm` (le script `build:wasm` de `package.json` est juste).
2. `web/src/proofs/` : `Timeline.ts` et `timeline.ts` coexistent ;
   `Proofs.tsx` importe les deux. Sous Windows (casse ignorée) `tsc` et le
   pré-scan de Vite échouent. Sous Linux/CI ça passe.
3. Le bureau des locations (`onLease`) n'est pas câblé dans `App.tsx` (pas de
   `postLease` dans `api.ts`) : la fonctionnalité « louer une licence » n'est
   pas atteignable.
4. Les scripts npm utilisent `mkdir -p`, `cp`, `VITE_ENGINE=wasm` inline :
   ils ne tournent pas sous cmd.exe (Windows).

**À décider avec Gaia** : `docs/ART.md` dit « 2D, plat, palette styles.css » ;
la V7 est 3D et repointe la palette (nuit + cyan) dans `v7.css`. Avenant à
écrire si Gaia verrouille.
