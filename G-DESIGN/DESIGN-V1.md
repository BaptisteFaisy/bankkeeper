# DESIGN.md V1 — bankkeeper / Tidewater (archive des 6 planches initiales)

Archive de la V1 (six directions textuelles) extraite de DESIGN.md, qui dépasse
les 500 lignes. Les versions V1.1 (HTML), V2, V3 et V3.1 restent dans
DESIGN.md.

## V1 — 2026-11-11 · `/planches 6` : six directions contrastées

### Planche 1 — « Chart room » (la salle des cartes, l'existant affirmé)

**Concept.** La salle où le port se pilote : la carte marine est la table, les
panneaux sont les instruments posés autour. On garde la DA actuelle et on la
rend rigoureuse — densité calme, filets fins, zéro effet. L'identité n'est pas
« tableau de bord », c'est « bureau du port ».

- **Palette** : `--bg #0f2a30`, `--panel #163940`, `--sea #24616c`, côte
  `--sand #c9b083`, texte `--ink #e4ede6`, `--buoy #e0672f` réservé au joueur
  et au prix, `--gold #e3b65a` pour l'or, `--kelp`/`--red` pour les tendances.
- **Typo** : Avenir Next / Segoe UI ; libellés en capitales espacées couleur
  sable ; chiffres tabulaires ; titre 24 px lettrespacé.
- **Signature** : écran principal en deux colonnes (carte 760 × 440 + colonne
  360 : criée puis bateaux) ; lectures de zone en texte sous le canvas ; criée
  = barre qui chute + prix 34 px ; registre = lignes réglées + barres
  proportionnelles.
- **Message juges** : économie réelle, lisible, sérieuse ; rien de décoratif.
- **Risque** : le moins différenciant pour l'originalité ; si la densité monte,
  ça glisse vers le dashboard que `ART.md` refuse.

### Planche 2 — « Table du port » (jeu de plateau)

**Concept.** L'écran est une table de jeu dans le bureau du port : la carte est
une carte imprimée posée sur le feutre sombre, les panneaux sont des cartes de
papier sable avec des épingles de laiton, la criée est un jeu de cartes de
marchands qu'on retourne, le coffre du fonds est posé sur le môle. Tactile,
joueur, assumé « jeu de plateau ».

- **Palette** : feutre = `--bg` ; cartes-panneaux = `--sand` (texte `--bg`
  dessus, contraste AA à tenir) ; mer `--sea` ; côte `--sand` ; orange
  `--buoy` uniquement pour tes bateaux et la carte de la criée ; `--gold` pour
  les pièces ; `--kelp` pour la repousse.
- **Typo** : Avenir/Segoe ; libellés façon tampon (capitales, sable sur sombre,
  encre sur sable) ; chiffres tabulaires ; pas de police manuscrite (police web
  interdite) — le « imprimé » se fait par filets et interlettrage.
- **Signature** : carte à cadre franc (bord irrégulier dessiné, pas de PNG) ;
  jetons bateau coque + voile avec ombre **dure** décalée (pas de flou) ;
  cartes de marchands au quai ; coffre du fonds à niveau ; conseil = cartes de
  motion.
- **Message juges** : c'est un jeu d'abord, une économie ensuite — mémorable.
- **Risque** : contraste texte sur sable à surveiller ; coût d'implémentation
  élevé (habillage CSS + sprites de scène + composants).

### Planche 3 — « Almanach du port » (l'imprimé, inversion papier)

**Concept.** Le port tient un almanach : tables de marée, registre des licences,
minutes du conseil. Les panneaux sont des pages de papier (`--sand`), les filets
et colonnes sont à l'encre (`--bg`), les chiffres sont composés comme un livre
de comptes. La carte reste une planche sombre ; le contraste est
**carte sombre / instruments papier**.

- **Palette** : page = `--sand` ; encre = `--bg` (sarcelle profond) ; accents
  `--buoy` (joueur), `--gold` (or), `--red` (pertes) ; mer inchangée. Le fond
  de page reste sombre : pas de fond crème uni (interdit), le papier ne vit
  que sur les panneaux.
- **Typo** : serif système (Georgia) pour titres et chiffres de registre,
  Avenir pour l'UI ; chiffres tabulaires ; titres courants en petites
  capitales.
- **Signature** : écran principal en double page — à gauche la planche carte,
  à droite la page du jour ; criée = colonne de prix avec un filet qui descend ;
  conseil = minutes avec tampon (dessiné, pas d'asset) ; bilan = page imprimée
  à deux colonnes (valeur nette / dette envers la mer).
- **Message juges** : l'économie est un registre public — finance crédible,
  identité imprimée rare dans un hackathon.
- **Risque** : peut figer le jeu (moins « vivant ») ; serif + encre sur sable
  doit passer le contraste ; motion à garder nette.

### Planche 4 — « Passerelle » (console d'instruments)

**Concept.** La passerelle du capitaine : chaque chiffre a son instrument. Le
cadran de marée est un vrai cadran, la criée une aiguille de prix verticale, le
quota une jauge, l'or un compteur à rouleaux, la carte une table radar. Dense,
précis, calme — mais **groupé par instrument**, pas une grille de cartes.

- **Palette** : sombre `--bg`/`--panel` ; filets `--line` ; aiguilles `--buoy` ;
  or `--gold` ; tendances `--kelp`/`--red` ; cadrans = teinte claire de `--sand`
  (autorisée).
- **Typo** : Consolas (mono système) pour les chiffres, Avenir pour les
  libellés ; très gros chiffres tabulaires (prix 40-48 px) ; libellés capitales.
- **Signature** : carte encadrée comme table radar ; criée = aiguille verticale
  avec encoches des limites marchands ; bateaux = rangées de tableau de bord ;
  bureau du port = panneau de commutateurs ; `Judges` = enregistreur de vol.
- **Message juges** : crédibilité d'ingénierie + sensation de machine qu'on lit.
- **Risque** : dérive dashboard (explicitement refusée par `ART.md`) ; les
  cadrans doivent garder leurs valeurs en DOM (accessibilité, e2e).

### Planche 5 — « Diorama » (la scène d'abord)

**Concept.** La mer prend tout l'écran ; le HUD est un mince cadre (bandeau haut
+ dock bas) et les instruments sont des étiquettes ancrées à la scène : étiquette
du lot au-dessus du quai, étiquette de zone sur chaque banc, étiquette du bateau
à la sélection. L'écran est une fenêtre sur le port, pas une page de panneaux.

- **Palette** : identique ; bandes de mer sans dégradé ; côte `--sand` ;
  étiquettes `--panel` + filet `--line` ; orange uniquement bateau joueur + lot.
- **Typo** : petits libellés 12-13 px, chiffres moyens ; la hiérarchie vient de
  la position, pas de la taille ; titre réduit au minimum.
- **Signature** : carte pleine largeur (760 × 440 mise à l'échelle ~1280 × 700),
  dock bas avec les bateaux en jetons, carte de criée qui glisse sur le quai,
  `Judges` en surcouche, chronique en dépliant.
- **Message juges** : image forte, originalité maximale ; on retient l'écran.
- **Risque** : densité (registre, raisons, conseil) à loger en tiroirs ;
  accessibilité et sélecteurs e2e à préserver ; coût de refonte élevé.

### Planche 6 — « Journal de bord » (le récit par les chiffres)

**Concept.** La journée se lit comme un journal : entrées dans l'ordre du temps
(aube, lot, soir), chacune avec son acteur, son chiffre et son « pourquoi ». La
carte est une planche dépliée ; le conseil une page de minutes ; le bilan la
dernière page. Récit d'abord, mais chaque ligne porte son chiffre.

- **Palette** : fond sombre, filets `--sand` ; texte `--ink` ; entrées du joueur
  en `--buoy` ; or `--gold` ; pertes `--red` ; reprise `--kelp`.
- **Typo** : Georgia pour les titres d'entrée, Avenir pour le corps ; chiffres
  tabulaires ; libellés « Dawn / Lot 31 / Dusk ».
- **Signature** : colonne journal (~420 px) à gauche, planche carte + instrument
  de criée à droite ; chronique et charte comme continuation naturelle du
  journal ; écran de fin comme page de clôture.
- **Message juges** : le jeu raconte une histoire avec des chiffres — original
  et mémorable.
- **Risque** : le journal-first ralentit la boucle de 30 s ; la criée doit
  rester lisible d'un coup d'œil.

---

## Tableau de décision

| # | Direction | Jeu | Finance | Originalité | Fidélité `ART.md` | Coût | Risque principal |
|---|---|---|---|---|---|---|---|
| 1 | Chart room | ●●○ | ●●●● | ●●○ | ●●●● | faible | peu différenciant |
| 2 | Table du port | ●●●● | ●●●○ | ●●●● | ●●●○ | élevé | contraste / lisibilité |
| 3 | Almanach | ●●○ | ●●●● | ●●●● | ●●●○ | moyen-élevé | fige le jeu |
| 4 | Passerelle | ●●●○ | ●●●● | ●●●○ | ●●●○ | moyen | dérive dashboard |
| 5 | Diorama | ●●●● | ●●○ | ●●●● | ●●●● | élevé | densité / accès |
| 6 | Journal de bord | ●●●○ | ●●●○ | ●●●● | ●●●● | moyen-élevé | ralentit la boucle |

**Recommandation** : **Planche 2 « Table du port » comme identité** — c'est la
phrase même de `ART.md` (« un jeu de plateau animé vu du dessus, pas un tableau
de bord »), avec les **instruments chiffrés de la planche 4** pour la criée et le
quota (lisibilité en 30 s) et la **densité calme de la planche 1** pour le
registre et la chronique (le registre reste du texte). Hybride 2+4+1, mais chaque
planche reste lockable seule.

**Prochaine action suggérée** : `/cible` écran principal de la planche 2, ou
`/compare 2 4` pour trancher jeu vs instrument avant de décliner.

---

## Checklist de fini (à `/lock`)

- [ ] Cohérence : une seule direction sur les 6 écrans (principal, bureau,
      judges, proofs, tutoriel, bilan/charte).
- [ ] Lisibilité : criée et quota compris en moins de 3 s ; contraste AA.
- [ ] Responsive : 1280 × 800 nominal, une colonne sous 1100 px (breakpoint
      existant), pas de mobile (hors périmètre `tidewater.md` §1.4).
- [ ] Branding hackathon : mention NEAR/track sur la porte d'entrée et
      `proofs.html`, sans polluer le jeu.
- [ ] Fidélité au code : palette `styles.css` uniquement, zéro asset, canvas
      procédural, reduced-motion, sélecteurs e2e préservés.


---

## V1.1 — 2026-11-11 · planches HTML (même chat, opencode)

Les six directions sont désormais **rendues en HTML autonome**, avec tout le
contenu réel du jeu (pas de placeholder) :

| # | Fichier | Matière |
|---|---|---|
| 0 | [`planches/index.html`](planches/index.html) | sommaire : projet, inventaire, palette, liens |
| 1 | [`planches/01-chart-room.html`](planches/01-chart-room.html) | instruments calmes, densité actuelle |
| 2 | [`planches/02-table-du-port.html`](planches/02-table-du-port.html) | cartes sable, ombre dure, jeu de plateau |
| 3 | [`planches/03-almanach.html`](planches/03-almanach.html) | papier, serif, filets doubles, registre |
| 4 | [`planches/04-passerelle.html`](planches/04-passerelle.html) | cadrans, jauges, mono, console |
| 5 | [`planches/05-diorama.html`](planches/05-diorama.html) | scène plein écran, étiquettes ancrées, dock |
| 6 | [`planches/06-journal-de-bord.html`](planches/06-journal-de-bord.html) | récit de la journée + instruments |

- Chaque planche montre **l'écran principal complet** (barre, carte, criée,
  bateaux, registre, dette, réparations, bureau, conseil, chronique) **et** les
  cinq écrans secondaires (entrée, tutoriel, judges, bilan, charte, preuves).
- Inventaire de référence : `G-DESIGN/FONCTIONNALITES.md`.
- Contrainte tenue : palette de `web/src/styles.css` uniquement, plat, aucune
  police web, aucun asset externe, aucun dégradé, aucun verre dépoli.
- `base.css` partagé (tokens + primitives) ; chaque planche n'ajoute que sa
  matière (~40-60 lignes de CSS).

**Prochaine action** : `/compare 2 4` (jeu vs instrument) ou `/cible` sur
l'écran principal de la planche 2, puis `/delta` numéroté.

## Changelog V1 (2026-11-11)

- Création : 6 directions contrastées, tableau de décision, recommandation
  hybride 2+4+1.
- Décision amont actée : design aligné sur le code (Tidewater), pas sur
  `BRIEF-UI.md` (Telegram idle) — voir §0 et `HANDOFF.md`.

## Changelog V1.1 (2026-11-11)

- `FONCTIONNALITES.md` : inventaire complet (écrans, leviers, économie,
  technique, ce qui n'existe pas).
- `planches/` : `index.html` + 6 planches HTML complètes + `base.css`.
- Aucun fichier du repo code modifié (lecture seule).

---

## V2 — 2026-11-11 · re-brief après retour Gaia

**Retour** : les six planches V1 manquent d'identité visuelle, ne sont pas
assez marquantes, trop de texte. Demande : **2 couleurs max, très moderne /
avant-gardiste, fond sombre, jeu en 3D**, tout le process visible, un **bouton
qui déclenche le déroulé jusqu'au résultat**, benchmarks affichés, et tout
comprendre d'un coup d'œil.

C'est un **re-brief** au sens du pack design (pas un round de plus) : nouveau
mood, nouvelle grammaire. Quatre identités, volontairement peu nombreuses mais
radicalement différentes.

### Les quatre identités (`v2/`)

| # | Fichier | Couleur | Grammaire |
|---|---|---|---|
| 1 | `v2/01-signal.html` | lime `#c8ff2e` sur noir | mono partout, capitales, arêtes vives, zéro rayon. Terminal de marché. |
| 2 | `v2/02-abyss.html` | cyan `#19e3ff` sur minuit | bas de casse, interlettrage large, pastilles 999px, halos, anneaux sonar. |
| 3 | `v2/03-ember.html` | orange `#ff4d14` sur charbon | display très gras, blocs épais, ombre dure portée, fonderie. |
| 4 | `v2/04-bone.html` | bone `#efeae0` sur noir | monochrome, serif d'édition, filets 1px, vide assumé, zéro glow. |

Sommaire : `v2/index.html` (hero + « at a glance » + comparatif + benchmarks +
coût de fabrication).

### Ce qui est nouveau, écran par écran

- **Scène 3D** : un monde incliné (`rotateX(56deg) rotateZ(-24deg)`), les bancs,
  le quai et les étals sont des **slabs extrudés** (8 plans empilés en
  `translateZ`), les bateaux des jetons 3D avec ombre portée. CSS pur, zéro
  dépendance, hors-ligne, `prefers-reduced-motion` respecté.
- **Un bouton = tout le process** : `RUN THE DAY` joue 8 événements (aube, lot 28,
  lot 31, lot 33, soir, la mer, conseil, bilan). Chaque étape allume sa ligne,
  met à jour les KPI et **fait réagir la scène** via un seul `data-phase`
  (le bateau de Brandt s'allume quand son lot passe, Greybank se ternit, le
  monde recule au bilan).
- **Texte réduit au strict** : des chiffres, des libellés de 2-4 mots, une ligne
  « what just happened » qui dit le *pourquoi* de chaque événement.
- **Tous les leviers sur une ligne** : affecter, filet, relevé, licence, note de
  dette, motion, jachère, réensemencement, réclamation, charte — 10 blocs, un
  chiffre chacun.
- **Benchmarks réels et déclenchables** : `RUN THE HARNESS` rejoue les chiffres
  de `docs/BALANCE.md` (50 graines × 4 politiques × 3 saisons) et anime les
  barres : passive 782g, greedy 16 257g, steward 14 729g, mixed 13 751g ;
  Greybank 606 vs 2 444 caisses ; dette 5 356 vs 1 488 ; effondrement 34 % vs 0 %.

### Réponse technique (à trancher)

- **2 couleurs : faisable sans casser la CI.** `tests/ci_structural.py` vérifie
  seulement que les 9 teintes existent dans `web/src/styles.css`, et interdit
  les dégradés et le `backdrop-filter`. Ajouter un accent est donc autorisé ;
  il faut mettre à jour `docs/ART.md` (le document qui « fait foi »).
- **3D réelle : trois niveaux possibles.**
  1. **CSS 3D** (retenu ici) : profondeur vraie, aucun paquet, marche dans le
     build hors-ligne actuel. Coût : moyen (refonte de `scene/`).
  2. **Canvas 2D isométrique** : ce que `ART.md` décrit ; on peut le pousser
     très loin (ombres dures, extrusion, occlusion) sans changer de techno.
  3. **WebGL / three.js** : vraie 3D, vraies lumières, mais ~600 Ko ajoutés,
     une dépendance npm (interdite aujourd'hui) et un risque de rendu sur les
     machines des juges. À ne faire que si la 3D est le critère principal.
- **Conséquence** : les planches V2 sortent volontairement de la palette
  actuelle pour montrer l'identité ; leur implémentation exige un avenant à
  `docs/ART.md` + un ajout de teintes dans `styles.css`. Rien n'est modifié
  dans le repo code à ce stade.

### Recommandation

**02 ABYSS** pour l'identité (la 3D + le cyan donnent le plus « avant-gardiste »
sans tomber dans le cliché web3), avec le **bouton RUN et la grammaire de
données de 01 SIGNAL** (les chiffres sont plus lisibles en mono) et le **vide
éditorial de 04 BONE** pour le bilan et les preuves.

### Changelog V2

- Re-brief : 4 identités 2 couleurs, fond sombre, 3D CSS, texte minimal.
- `v2/base.css` (système + scène 3D), `v2/identities.css` (4 thèmes),
  `v2/run.js` (déroulé 8 étapes + harnais), `v2/index.html` + 4 planches.
- Benchmarks issus de `docs/BALANCE.md` (chiffres réels, pas d'estimation).

---


---

## V3 — 2026-11-11 · le port en 3D (WebGL maison)

**Retour Gaia (2e)**: « pas assez visuel, pas assez représentatif, on ne comprend
pas de quoi il s'agit au premier coup d'œil ». Les V1 (tableaux) et V2 (scène
CSS 3D) échouent là-dessus : une scène 3D en CSS ne rend pas un jeu, elle rend
des plaques. Il fallait **un vrai moteur**.

### Ce qui est livré (`G-DESIGN/v3/`)

| Fichier | Contenu |
|---|---|
| `index.html` | page de présentation : 3D en direct, les 4 thèmes, ce que la scène montre, le bouton, les benchmarks |
| `harbour.html` | le port en 3D, interactif (thème, books, déroulé) |
| `01-signal.html` … `04-bone.html` | le même port, un thème chacun |
| `gl-core.js` | moteur WebGL écrit à la main : maths 4×4, shaders, maillages, ~230 lignes |
| `tide-scene.js` | la scène : mer, côte, quai, étals, coffre, bancs, poissons, bateaux, caisses, ~490 lignes |

**Zéro dépendance.** WebGL1, pas de three.js, pas de npm, pas d'asset, pas de
police web. Le rendu tient dans 2 fichiers JS et fonctionne hors-ligne.

### La scène

- **Mer** : grille de 120×120, vagues au vertex shader, fresnel, soleil spéculaire,
  brouillard vers le noir.
- **Côte** à gauche (sable), **quai** en pierre avec **trois étals** de marchands,
  un lampadaire et le **coffre du fonds** dont la hauteur est la redevance.
- **Trois bancs** en relief sur l'eau, chacun couvert d'un **ban de poissons** dont
  la densité suit le stock : le banc s'épuise, ses poissons disparaissent.
- **Dix bateaux** : coque, mât, voile ; les deux vôtres sont à l'accent, les huit
  autres gris. Un **crate** part en arc du bateau vers le quai à chaque débarquement.
- **L'ancre brisée** se dresse sur un banc surexploité tant que la dette n'est pas
  payée : l'argument du jeu, en un objet.

### Le déroulé

`RUN THE DAY` joue 8 événements (aube → lot 28 → lot 31 → lot 33 → soir → la mer
→ conseil → bilan). À chaque étape : les bancs se vident, le coffre monte, le
prix descend, l'ancre apparaît, et une ligne dit **pourquoi** (« le prix de la
criée : la limite de la conserverie passe à 3,6 »). Le même état que le moteur.

### `THE BOOKS`

Le reste n'a pas disparu : un panneau ouvre **12 leviers**, les **benchmarks**
(50 graines × 4 politiques × 3 saisons, chiffres réels de `docs/BALANCE.md`) et
les **6 écrans** qu'un juge peut ouvrir. Le 3D est le jeu, les livres sont le
reste.

### Les quatre thèmes (2 couleurs, fond sombre)

| # | Accent | Grammaire |
|---|---|---|
| 01 SIGNAL | lime `#c8ff2e` | terminal de marché, arêtes vives |
| 02 ABYSS | cyan `#19e3ff` | nuit profonde, lumière basse |
| 03 EMBER | orange `#ff4d14` | fonderie au bord de l'eau |
| 04 BONE | bone `#efeae0` | gravure, aucun glow |

### Comment c'a été vérifié

Je ne peux pas lire les images. J'ai donc instrumenté la page : `?diag=1` fait
un `readPixels` de la frame et renvoie la moyenne RGB, le pourcentage de pixels
éclairés et **un rendu ASCII** de l'image (56×22). C'est ce qui a permis de
corriger, à l'aveugle : les locations d'attributs Shader (rien ne s'affichait),
la composition (mur de sable à gauche, mer noire), la lisibilité des bancs, et
l'orientation de la caméra. Les 4 thèmes sont vérifiés par leur moyenne RGB
(33/39/24, 14/38/45, 43/22/15, 38/38/36).

### Coût et faisabilité pour le 15/11

- Le moteur (`gl-core.js`) est réutilisable tel quel dans `web/src/`.
- La scène remplace `web/src/scene/*` (canvas 2D) : ~490 lignes à réécrire.
- Les e2e ne touchent pas au canvas (sélecteurs DOM conservés) : `Sea chart`,
  `data-testid` du judges-bench, `aria-label` restent valides.
- `prefers-reduced-motion` : la scène se fige (pas d'animation de vagues).
- **Point à trancher** : le joueur passe d'un canvas 2D à WebGL. Le bundle
  reste hors-ligne et sans dépendance ; le risque est un navigateur sans WebGL
  (rare) — la page affiche un repli.

### Recommandation

**03 EMBER** : la couleur la plus « jeu », et la lisibilité de la scène (bancs
clairs, mer sombre) est la même dans les quatre thèmes. `01 SIGNAL` si le jury
veut du sérieux finance. Le reste de la DA (typographie, books, panneaux) suit
la planche choisie.

### Changelog V3

- Re-brief : « le visuel du jeu doit être en 3D, extrêmement moderne ».
- `v3/` : moteur WebGL maison, scène du port, déroulé 8 étapes, panneau
  « THE BOOKS » (leviers + benchmarks + écrans), 4 thèmes.
- Vérification sans image : readback RGB + rendu ASCII de la frame.

---

## V3.1 — 2026-11-11 · « ça ne ressemble pas à un port » → le plan du port

**Retour Gaia** : ça ne ressemblait pas à un port. Vrai : les bancs flottaient
comme des dalles et la mer était un trou noir. Deux bugs réels trouvés et
corrigés, plus un vrai plan de port.

### Les trois bugs trouvés (par vérification numérique, pas par goût)

1. **La mer n'était jamais dessinée** : le shader d'eau ne déclare pas `aNor`,
   mais `drawWater` activait quand même l'attribut → `enableVertexAttribArray(-1)`
   → `GL_INVALID_VALUE` → le draw était annulé. La scène était des objets sur du
   vide. Corrigé.
2. **Le brouillard était faux** : `vWorld = aPos` (position *locale* du maillage,
   donc ~0) au lieu de la position monde. Tout l'éloignement était cassé. Corrigé
   avec `uModel`.
3. **Les bancs étaient 100 % accent** : je passais la couleur d'accent comme
   couleur de base, donc `mix(couleur, accent, 0.1)` = accent quand même. Corrigé.

### Le plan du port (le contenu)

| Zone | Ce qu'il y a |
|---|---|
| Devant (la mer) | les trois bancs avec leur banc de poissons, la flotte |
| Au milieu | le mur de quai (112 unités), les bornes d'amarrage, les trois étals, le coffre du fonds, les caisses empilées, les barils, les lampadaires, 5 bateaux amarrés |
| Derrière (la ville) | 11 maisons de hauteurs variées, la halle à marée, la halle au sel, la conserverie avec sa cheminée et sa fumée |
| À droite | la jetée et le phare (lanterne à l'accent) |
| Au-dessus | la grue : mât 20 m, flèche de 19 m sur l'eau, câble et crochet |

Caméra : **sur l'eau, au sud-ouest, en contre-plongée** (eye −30, 16, 36 →
target 6, 5, −12) : le quai court en diagonale du bas-gauche vers la
mi-droite, la ville derrière, la mer devant.

### Vérification sans image

- `?diag=1` renvoie la moyenne RGB, le % de pixels éclairés, un rendu ASCII
  132×40 de la frame, et la **position projetée des 16 points-clés** (quai ouest/est,
  halle, conserverie, grue, phare, coffre, 3 étals, 3 bancs, 2 bateaux).
- Composition validée par les nombres : quayE (66, 45), cannery (49, 35),
  crane (39, 29), light (84, 31), stalls (24/42/53, 44-49), shallows (54, 62),
  greybank (80, 60), Mistral (61, 58) — tout dans le cadre, le quai en diagonale.
- Les 4 thèmes vérifiés par leur dominante : signal (39,48,40), abyss (20,47,58),
  ember (54,30,21), bone (45,45,44).

### Fichiers

`gl-core.js` (266 l. : maths, shaders, maillages : boîte, **coque de bateau à
proue pointue**, prisme, toit à deux pans, voile), `harbour.js` (450 l. : mer,
bancs, poissons, flotte, caisses, ancre brisée, caméra, diag), `port.js`
(159 l. : le port lui-même), `harbour.html` + 4 planches thèmes.

### Reste à trancher par Gaia (en regardant)

- l'angle et la hauteur de caméra (`this.eye` / `this.target` dans `harbour.js`) ;
- la force de l'accent dans la mer (`uDeep *`, `fres *`) ;
- la densité des poissons (`seedShoals`, 30 par banc).

### Changelog V3.1

- 3 bugs de rendu corrigés (mer invisible, brouillard faux, bancs sur-accentés).
- Vrai plan de port : mur de quai, ville à skyline variée, grue, conserverie
  fumante, jetée + phare, 5 bateaux amarrés, bornes, caisses, barils, lampadaires.
- Probe de 16 points-clés pour composer sans image ; ASCII 132×40.

### V3.1 — les trois bugs qui expliquaient « ça ne ressemble pas à un port »

1. **La mer n'était jamais dessinée** : le shader d'eau ne déclare pas
   `aNor`, mais `drawWater` activait quand même l'attribut →
   `enableVertexAttribArray(-1)` → `GL_INVALID_VALUE` → draw annulé. La scène
   était des objets sur du vide. Corrigé.
2. **Le brouillard était faux** : `vWorld = aPos` (position *locale*, ~0) au
   lieu de la position monde → rien n'était atténué au loin, tout se collait.
   Corrigé avec `uModel`.
3. **Les bancs étaient 100 % accent** : la couleur d'accent était passée comme
   *couleur de base*, donc `mix(couleur, accent, 0.1)` = accent quand même.
   Corrigé : base sombre, l'accent monte avec le stock.

Plus le **plan du port** : mur de quai 112 unités + bornes + 3 étals + coffre
du fonds + caisses/barils + lampadaires + 5 bateaux amarrés ; la ville derrière
(11 maisons de hauteurs variées, halle à marée, halle au sel, conserverie
fumante) ; la grue (mât 20 m, flèche sur l'eau, câble, crochet) ; la jetée et
son phare. Caméra **sur l'eau, en contre-plongée** : le quai court en diagonale
du bas-gauche vers la mi-droite, la ville derrière, la mer devant.

Vérification sans image : `?diag=1` renvoie la moyenne RGB, le % de pixels
éclairés, un ASCII 132×40, et la **position projetée de 16 points-clés** (quai
ouest/est, halle, conserverie, grue, phare, coffre, 3 étals, 3 bancs, 2 bateaux).
Composition validée par les nombres : quayE (66,45), cannery (49,35),
crane (39,29), light (84,31), shallows (54,62), greybank (80,60), Mistral (61,58).
Quatre thèmes vérifiés par leur dominante : signal (39,48,40), abyss (20,47,58),
ember (54,30,21), bone (45,45,44).

### V3.2 — 2026-11-11 · « pas assez poussé / réaliste », plus interactif

**Retour Gaia (4e)** : la 3D n'est pas assez poussée, pas réaliste ; il faut
regarder autour à la souris ; les animations du RUN doivent être limpides ;
ne pas montrer chaque étape deux fois ; garder la version bleu clair.

#### Ce qui a été reconstruit

- **L'eau** : quatre vagues sommées au vertex shader (houle longue, clapot,
  vague courte), normale analytique recalculée, fresnel, reflet spéculaire du
  soleil, écume sur les crêtes, brouillard de distance. La houle est partagée :
  la même fonction animerate les coques, le mât, les voiles.
- **Les bateaux** : coque à tonture (pont plus haut à la proue), pavois,
  timonerie vitrée, mât, flèche de charge, voile, haubans, cheminée cerclée,
  bastingage, chalut qui file, sillage en huit nappes qui s'élargissent.
  Les coques **flottent** : houle recalculée en JS, montée/descente + roulis.
- **Le port** : mur de quai en assises de pierre, bornes avec collier, halle à
  marée **à toit en shed** avec cinq baies vitrées, halle au sel, conserverie
  haute avec sa cheminée et sa fumée, **grue à treillis** (mât, flèche qui
  oscille, câble, crochet, contrepoids, cabine), trois étals (auvent, comptoir,
  caisses de poisson, balance), le **coffre du fonds** qui monte, caisses
  empilées, tonneaux, **filets qui sèchent sur des perches**, lampadaires,
  jetée et **phare avec lanterne et faisceau qui tourne**, onze maisons de
  hauteurs variées avec fenêtres allumées la nuit et cheminées.
- **La nuit** : à l'étape DUSK les lampadaires et les fenêtres s'allument.
- **Le thème** : ABYSS (cyan #19e3ff sur noir bleuté) seul, verrouillé.

#### La caméra orbitale

Glisser à la souris = regarder autour ; molette = zoomer ; tangage borné
(0,06 à 1,35 rad) pour rester au-dessus de l'eau. Le RUN anime la caméra
elle-même, mais le joueur peut la reprendre à tout instant.

#### Le RUN THE DAY, en huit étapes animées

Une seule timeline (à gauche), l'étape courante se déplie avec sa raison.
Chaque étape anime la scène :

1. **DAWN** — les lampadaires s'éteignent, la houle se calme, la grue bouge.
2. **LOT 28** — Egret quitte son banc, **navigate** jusqu'à quai, trois caisses
   volent en arc vers l'étal, le poissonnier s'allume, le prix tombe de 8,0 à 4,0.
3. **LOT 31** — Anvil (petit maillage) débarque : la limite de la conserverie
   passe à 3,6. Le compteur de prix descend au-dessus de l'étal, en 3D.
4. **LOT 33** — **ton** bateau débarque et est payé 3,5 : l'externalité.
5. **DUSK** — les lampadaires s'allument, la houle grossit.
6. **THE SEA** — la caméra part sur Greybank, **l'ancre brisée se dresse**, le
   banc s'appauvrit, les poissons se rarefient.
7. **COUNCIL** — la caméra monte sur la ville, l'étal de la conserverie
   s'allume, le coffre grossit (la motion paie).
8. **BILAN** — la caméra recule en hauteur, les trois bancs montrent leur état,
   l'ancre reste dressée.

Les étapes sont portées par une machine à états (`day.js`) : chaque étape
animera la scène et porte sa raison en une phrase. Le sillage, les caisses,
l'éclaboussure et le faisceau du phare sont dessinés, pas des images.

#### Le doublon supprimé

Une seule timeline à gauche ; l'étape courante s'y déplie avec sa raison. Le
texte répété sous le bouton a disparu — le bouton ne fait plus qu'une chose.

#### Le bleu clair verrouillé

ABYSS seul : `#19e3ff` sur noir bleuté, encre `#eaf6fa`. Les quatre anciens
thèmes ont été retirés.

### Changelog V3.2

- Eau : 4 vagues sommées + normales analytiques + fresnel + écume.
- Bateaux : coque détaillée, flottaison et houle partagées, sillage, chalut.
- Port : pierre de taille, toits en shed, fenêtres, treillis de grue, fumée,
  faisceau de phare, filets sur perches.
- Caméra orbitale à la souris + molette ; la caméra du RUN reste reprise à la main.
- Une seule timeline ; doublon supprimé.
- ABYSS seul (bleu clair) ; les autres thèmes retirés.

---

