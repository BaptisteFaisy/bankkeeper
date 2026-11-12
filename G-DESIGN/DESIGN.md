# DESIGN.md — bankkeeper / Tidewater (NEAR, Games With Real Economies)

Direction artistique du jeu web (`web/`) : écran principal 1280×800, bureau du
port, panneau `Judges`, tutoriel, `proofs.html`, bilan/charte.

- Brief : `G-DESIGN/BRIEF-UI.md` — **écart constaté, voir §0**.
- Repo code : lecture seule (Baptiste). DA contraignante : `docs/ART.md`
  (palette vérifiée par la CI, plat maritime, canvas procédural, zéro asset).
- Ton imposé : **jeu (fun, lisible) + finance crédible (chiffres clairs)**.
- Juges : implémentation, design, impact, originalité.

---

## 0. Écart brief ↔ code (décision Gaia 2026-11-11)

`BRIEF-UI.md` décrit un jeu *idle* sur Telegram (coffre, dépôts/retraits,
viewer de classements). Le repo est **Tidewater** : jeu web PWA déjà en ligne
(tidewater-play.vercel.app), capitaine de pêche, tragédie des communes, contrat
NEP-245. Aucun code Telegram, aucune mécanique idle.

Décision Gaia : **aligner le design sur le code**. Les 6 planches portent donc
sur les écrans réels. Le brief est à corriger par opencode (voir `HANDOFF.md`).

Correspondance écrans du brief → écrans réels :

| Brief | Écran réel |
|---|---|
| HUD jeu | Écran principal : `TopBar` + scène (carte) + `Fish auction` + `Your boats` |
| Banque / coffre-fort | Bureau du port : relevés, licences, dettes, conseil + coffre du fonds + registre |
| Viewer web (classements, état global) | Panneau `Judges` + `proofs.html` + chronique |
| Onboarding | Tutoriel 3 étapes + porte d'entrée « Take command » |

Contrainte forte : `docs/ART.md` **fait foi** — seuls les jetons de
`web/src/styles.css` et leurs teintes plus sombres ou plus claires. Pas de
nouvelle couleur, pas de dégradé, pas de verre dépoli, pas de police web, pas
d'asset externe, pas de violet/indigo, pas de fond crème uni, pas de grille de
cartes identiques, pas d'emoji-icône. Les 6 planches contrastent donc par la
**composition, la typographie, la densité, le traitement de la scène et le
rapport jeu/finance** — pas par la palette. Sortir de la palette = re-brief
(modifier `ART.md` + la CI), pas un round de plus.

---

## V1, V1.1 et V2 — archives

Les premières explorations vivent dans DESIGN-V1.md : V1 (six directions
textuelles), V1.1 (six planches HTML à plat), V2 (quatre identités en CSS 3D),
V3 / V3.1 / V3.2 (premier WebGL maison et ses trois bugs). Ce fichier ne garde
que V4 → V6 et reste sous les 500 lignes.

## V4 — 2026-11-11 · la mer de loin, trois horloges, la campagne

**Retour Gaia (5e)** : apparence plus « travaillée » (pas neuve, mais soignée) ;
voir la mer de plus loin, bateaux loin du port au départ ; signes distinctifs
par armateur (icône joueur, icônes humains, icônes agents pour les NPC) ;
montrer les deux pièges ; montrer les 3 saisons + le temps écoulé ; montrer la
tragédie des communs et les effets court/moyen/long terme à arbitrer ; afficher
en permanence valeur nette et dette envers la mer.

### Réponses aux questions

- **Plusieurs ports ?** Non. Un port, trois bancs, trois marchands, un conseil.
  Le « port voisin » n'existe que dans `docs/VISION.md` (piste 7, non codé).
- **« Changer de zone → effet dans 30 s »** : la zone ne change pas le prix
  directement. Elle change ce que tu débarques (quantité + espèce), et c'est ce
  débarquement, 30 s plus tard, qui fixe le prix (la limite de l'acheteur
  dépend de son stock). L'effet « trop de bateaux sur la même zone » est, lui,
  à 5 minutes (le stock baisse).

### Ce qui a changé (`G-DESIGN/v4/`)

1. **Scène plus grande, mer dominante.** Caméra reculée (dist ~176), bancs à
   z=44..96 (loin du quai à z=-16), la mer occupe l'essentiel du cadre.
2. **Détail poussé** : ciel shader (zénith, horizon, halo solaire, brume), eau
   à 4 vagues + reflet solaire + écume ; port : quai en assises avec échelles,
   pare-battages, bittes, trois étals avec auvent et balance, coffre du fonds
   cerclé, caisses et tonneaux, filets sur perches, lampe à poteau, grue à
   treillis, halle à marée en shed, halle au sel, conserverie avec cheminée,
   château d'eau, réservoirs, onze maisons à fenêtres, hôtel de ville à flèche
   (siège du conseil), jetée et phare avec faisceau nocturne ; bateaux avec
   coque à tonture, pavois, préceinte, timonerie vitrée, mât, flèche, voile,
   haubans, radar, pavillon, cheminée fumante, bastingage, caisses de pont,
   chalut et sillage.
3. **Badges d'armateur** posés au-dessus de chaque bateau : **MOI** (icône
   humaine, accent cyan), les capitaines NPC (icône d'agent, teinte distincte).
   Les marchands et la banque sont des agents.
4. **Les deux pièges, joués** : `TRAP 1 · THE CROWD` — les dix bateaux
   convergent sur Greybank, le stock fond, la prise par sortie tombe de 16 à
   9,8 ; `TRAP 2 · THE FLOOD` — tout le monde accoste en même temps, le prix
   s'effondre de 4,0 à 3,2, un lot se perd sous le plancher.
5. **La campagne complète** : 10 étapes, de DAWN au BILAN de la saison 3, avec
   `SEASON 1/2/3` et `T+` écoulé, hebdo/jour affichés en permanence.
6. **Les trois horloges** (permanentes) : COURT TERME (30 s · le prix), MOYEN
   TERME (5 min · la prise durable), LONG TERME (saisons · la dette). Le joueur
   arbitre les trois en direct.
7. **Bilan permanent** en haut à droite : NET WORTH (or) et DEBT TO THE SEA
   (caisses), toujours visibles.

### Changelog V4

- Scène élargie (mer dominante), ciel shader, eau + écume + reflet solaire.
- Bateaux et bâtiments nettement plus détaillés ; badges d'armateur (MOI vs NPC).
- Timeline = la campagne (10 étapes, 3 saisons) ; les deux pièges nommés.
- HUD : horloge de campagne + trois horloges d'arbitrage + bilan permanent.

---

## V5 — 2026-11-11 · Claude · reprise depuis zéro (`G-DESIGN/v5/`)

Première version réglée **à l'œil** (captures à chaque passe), pas au readback.
Une seule direction : **« le port de nuit vu du large »**. Nuit bleue + cyan
`#19e3ff`, rien d'autre. Le cyan = la lumière (fenêtres, fanaux, contours,
poissons, anneaux des bancs) ; le bleu = la matière (coques, murs, mer).

### Ce qui se voit en 3 secondes
- **Un port** au fond (quai, criée à horloge, conserverie à toit en shed et
  cheminée, poissonnerie, The Gull, conseil à tour d'horloge, grue à treillis,
  phare, village en terrasses, église) ; **la mer** devant, qui occupe le cadre.
- **Trois bancs** = trois anneaux pointillés sur l'eau, avec le banc de
  poissons qui tourne dedans et **s'éclaircit quand le stock baisse**. Jauge de
  stock sous chaque nom. **Jachère** = l'anneau devient plein.
- **Dix chalutiers** (coque à tonture, timonerie éclairée, mât, tangons,
  potence) ; au-dessus de chacun, un **badge** : icône humaine pleine **ME**
  pour tes 2 bateaux, icône d'**agent** pour les 8 des capitaines NPC.

### HUD (minimum)
- Haut gauche : titre + légende des propriétaires ; dessous, **les trois
  horloges** (30 s le prix · 5 min la prise · saisons le stock).
- Haut centre : **3 segments de saison** + `SEASON · WEEK · DAY` + `T+` en
  heures de jeu (1 jour = 5 min) et `DAY n OF 84`.
- Haut droite : **NET WORTH** et **DEBT TO THE SEA**, permanents ; dessous le
  **benchmark** (`docs/BALANCE.md`, chiffres réels) ; ta ligne **YOU** s'y
  ajoute au bilan.
- Bas : **un bouton** `PLAY THE CAMPAIGN` + **une seule timeline** (8 étapes)
  + une phrase par étape. Aucune étape montrée deux fois.

### Le déroulé (≈ 47 s)
DAWN → TRAP 1 · CROWD (les 10 bateaux sur Greybank, prise 16 → 9,8) →
TRAP 2 · FLOOD (tous à quai, caisses en arc vers la criée, prix 4,0 → 3,2) →
DAY CLOSES (214 prises / 62 durables, ta part sur la dette) → COUNCIL (motion
jachère payée par le fonds, calcul de Brandt, 11–9) → SEASON 2 (Greybank se
repeuple 40 → 71 %) → SEASON 3 (Brandt endetté vide les Deeps au petit
maillage) → THE BOOKS (13 751 g / 1 814 caisses, comparés au benchmark).

### Interaction
Souris = regarder autour (parallaxe), glisser = orbiter, molette = zoom.
`prefers-reduced-motion` : image fixe, étapes sans tween. `?step=N` ouvre une
étape (revue). Canvas `aria-hidden`, bouton et légendes en DOM.

### Technique
WebGL1 neuf, zéro dépendance : `gl.js` (maths, géométrie, FBO), `shaders.js`
(faces à normales par dérivées, eau 5 vagues, ciel étoilé, bancs de poissons
GPU, bloom 2 passes), `port.js`, `boat.js`, `scene.js`, `run.js`. Fichiers
< 220 lignes. Les 3 bugs V3 évités (attributs actifs seulement, brouillard en
coordonnées monde, accent hors couleur de base). `serve.py` = serveur sans
cache pour la revue.

### Limites connues
- Les chiffres de la campagne sont une **mise en scène** cohérente avec
  BALANCE, pas une sortie du moteur wasm.
- Le bloom et le ciel sont en GLSL (non scannés par la CI) : à signaler si ce
  rendu passe dans `web/` (avenant `docs/ART.md` requis : 3D, 2 couleurs).

### Changelog V5 (vs V4)
- Tout refait : palette réduite à 2 couleurs vraies, nuit, lumière = cyan.
- Caméra au large, port en arrière-plan, mer au premier plan.
- Bancs lisibles sans texte (anneaux + poissons qui disparaissent).
- Badges ME (humain) / agents ; HUD regroupé dans le ciel, la mer reste libre.
- Benchmark visible en permanence, la ligne YOU s'y ajoute au bilan.
- Timeline unique de 8 étapes au lieu de 10.

---

## V5.1 — 2026-11-11 · Claude · delta Gaia sur V5

**Retour Gaia** : déplacements des bateaux = très bien, mais ils ne doivent
pas se traverser ; afficher **en gros** les échelles de temps, les événements
et les problèmes rencontrés ; beaucoup plus **moderne**, aussi précis.
Référence de modernité : `labkit-ponts.html` (low-poly facetté éclairé, cartes
flottantes arrondies, pilules, gros chiffres + petite unité).

### Deltas appliqués
1. **Collisions** : les coques gardent 9,5 m d'écart (séparation par paire à
   chaque image, biais latéral pour que deux bateaux face à face se
   contournent). Slots des bancs élargis.
2. **Échelles de temps en grand** : contrôle segmenté en haut au centre,
   `30 s · 5 min · 3 seasons`, chacun avec son anneau et sa mesure (prix,
   prise, stock). L'échelle de l'étape en cours **s'allume en cyan plein**.
3. **Événements en grand** : carte en bas à gauche, pastille `STEP n/8 · nom ·
   échelle`, titre 28 px, **chiffre clé 30 px** (`16 → 9.8`, `4.0 → 3.2`,
   `passed 11 – 9`…), une phrase.
4. **Problèmes rencontrés** : carte « Problems met » à droite, compteur, une
   ligne par problème avec son échelle de temps (Crowding, Price crash,
   Overfishing, Conflict, Debt spiral). Le plus récent en haut, cerclé.
5. **Moderne** : volumes pleins facettés éclairés (lumière clé + ciel), arêtes
   réduites à une couture discrète, **mer en facettes low-poly**, bloom
   adouci. HUD en cartes arrondies (20 px) et pilules, ombres portées douces,
   typo Bahnschrift (système, pas de police web), chiffres tabulaires.
   Étiquettes du monde en pilules. Toujours 2 couleurs, aucun dégradé CSS,
   aucun verre dépoli.
6. HUD redistribué : légende des propriétaires et benchmark à gauche, bilan et
   problèmes à droite, timeline + bouton sur toute la largeur en bas.

Fichiers : `hud.css` (nouveau, le style sort du HTML), `index.html`, `run.js`,
`scene.js`, `boat.js`, `gl.js`, `shaders.js`.

---

## V6 — 2026-11-11 · six variantes modernes, une seule chose à la fois

**Retour Gaia (6e)** : les infos en gros c'est bien, mais **trop d'informations
en même temps et tout le temps**, et le design n'est pas assez moderne.
Commande : `/variantes` — 6 planches modernes et 3D.

### Le principe appliqué : une seule chose à la fois

| État | Ce qui est à l'écran |
|---|---|
| **Au repos** | la marque, l'horloge de campagne, **valeur nette + dette envers la mer**, le bouton, le sélecteur de variantes |
| **Pendant une étape** | l'événement en cours (grand), **l'échelle de temps active uniquement** (30 s *ou* 5 min *ou* saisons, jamais les trois), le **problème épinglé** dans la scène |
| **Au bilan seulement** | le benchmark et la liste des problèmes |
| **Sur demande** | le bouton `Everything` révèle tout |

Le reste du port **s'éteint** autour du sujet : chaque étape porte un point
focal (`V5.FOCUS`) qui tamise tout ce qui n'est pas concerné — le piège 1
n'éclaire que Greybank, le piège 2 que le quai et la criée, le conseil que
l'hôtel de ville, la saison 3 que les Deeps.

### Les six variantes (`G-DESIGN/v5/`)

| # | Variante | Dominante | Caractère |
|---|---|---|---|
| 1 | `abyss` | cyan `#19e3ff` | nuit portuaire, sonar sur l'eau, cartes douces |
| 2 | `blueprint` | cyan pâle `#8fe9ff` | dessin technique, filets, arêtes fortes, mono |
| 3 | `bone` | bone `#eceae4` | monochrome, arêtes à l'encre, aucun glow, éditorial |
| 4 | `ember` | orange `#ff6a2b` | nuit chaude, une seule braise |
| 5 | `signal` | lime `#c8ff2e` | brutaliste, carré, mono, très contrasté |
| 6 | `diorama` | cyan `#59d8ff` | **maquette circulaire** (le monde est découpé par un disque) qui tourne lentement |

Chaque variante fournit : la palette (accent, brume, eau profonde/haute, ciel
zénith/horizon, ombre, lumière de ciel, lumière clé, encre), le traitement des
arêtes, le sonar, le disque de diorama, la rotation, et sa classe de HUD.
Un seul moteur, six habillages — `variants.js` est la seule source de vérité.

### Corrections techniques apportées

- **La palette n'était jamais envoyée aux shaders** (V5.2 attendait un
  `variants.js` qui n'existait pas) : `common()` ne posait que la matrice et le
  temps, donc accent, brume, eau et ciel valaient zéro. Branché.
- Le point focal (`uFocus`) et le disque de diorama (`uClip`) sont maintenant
  pilotés ; la rotation lente de la variante diorama aussi.
- Contraste : l'eau était lavée d'accent (80 à 97 % de pixels éclairés). Sonar,
  reflet spéculaire, streak et bloom abaissés, eaux profondes assombries →
  33 à 57 % selon la variante.
- Les arêtes sont mises à l'échelle par variante (`uA`), la géométrie n'est pas
  reconstruite.

### Vérification (sans image)

Console propre sur les six variantes. Dominantes mesurées par readback :
abyss (26,72,92) · blueprint (35,80,108) · bone (50,50,56) · ember (71,40,25) ·
signal (53,65,29) · diorama (22,51,66). Tous les identifiants du HUD présents.
`?diag=1` donne la moyenne RGB, le % de pixels éclairés et l'ASCII 120×34.
`?v=<variante>` ouvre une variante directement, `?step=<n>` saute à une étape.

### Changelog V5

- `variants.js` créé : 6 variantes + les points focaux par étape.
- `scene.js` : palette branchée, focus/clip/rotation, `sample()` de contrôle.
- `index.html` + `hud.css` : HUD progressif (une seule chose à la fois),
  sélecteur de variantes, bouton `Everything`, problème épinglé.
- `run.js` : une seule échelle de temps affichée, focus par étape, benchmark
  et problèmes réservés au bilan.
- `shaders.js` : contraste (sonar, spéculaire, streak, bloom) revu à la baisse.

---

## V7 — 2026-11-11 · Claude · passe 1 : la 3D devient le jeu (composition)

**Brief** : `PROMPT-CLAUDE-V7.md` — contenu de la variante diorama, design
beaucoup plus moderne, et surtout **on peut vraiment jouer**.

### Ce qui change de nature
- La 3D n'est plus une cinématique : elle est **branchée sur le vrai moteur
  wasm** de `web/` (niveau 2 du prompt). Les bateaux sont là où le moteur les
  met, les agents NPC jouent leur règle, la criée vend pour de vrai.
- **Jouer à la souris en 3D** : clic sur un de tes chalutiers → il est
  sélectionné (badge cerclé, carte allumée) ; clic sur un banc → il y part ;
  clic sur le quai → il rentre. Glisser = tourner, molette = zoom, survol =
  le banc visé s'allume. Clavier et boutons DOM inchangés.
- Le moteur WebGL v5 est porté en TypeScript strict : `web/src/scene3d/`
  (`math`, `geo`, `glx`, `shaders`, `harbour`, `fleet`, `camera`, `view`,
  `labels`, `scene3d`). Même contrat que la scène 2D (`setState / emit /
  destroy`) ; repli 2D automatique sans WebGL.

### Composition (une chose à la fois)
- **Plein écran** : le port en diorama (disque découpé, socle à liseré cyan)
  flotte dans le noir ; décalage d'objectif pour le loger entre le héros et
  le pont d'instruments.
- **Un seul héros** : VALEUR NETTE en 76 px condensé cyan, DETTE ENVERS LA MER
  dessous en 34 px. Saison · semaine · jour au-dessus, en mono.
- **Un pont d'instruments** à droite (384 px) : onglets Auction · Boats ·
  Ledger · Office · Chronicle ; toutes les cartes restent dans la page
  (clavier, lecteurs d'écran, e2e), l'œil en lit une à la fois.
- Barre du haut flottante en pilule ; un seul bouton plein (End the day).
- Étiquettes du monde : bancs (nom, espèce, jauge, nombre de bateaux), badge
  humain « You » sur tes 2 bateaux, badge d'agent discret sur les 8 autres,
  l'étal qui achète et la criée s'allument à chaque vente.

### Vérifié
Partie locale (`VITE_ENGINE=wasm`) : connexion, sélection en 3D, envoi sur
The Shallows (le moteur confirme), lot débarqué et vendu (1 350 → 1 458 g),
étals allumés. `tests/ci_structural.py` OK (190 fichiers). `tsc` OK hormis
une erreur de casse préexistante dans `proofs/` (voir HANDOFF).

### Pas encore fait
e2e Selenium non relancés ; animation non observée en continu (panneau du
navigateur masqué pendant la session) ; README, script vidéo, payload de
soumission ; détail visuel (on valide d'abord la composition).


---

## V8 — 2026-11-11 · Claude · /planches 10, bleu clair / blanc (rejeté)

`G-DESIGN/v8/` : dix rendus du même port sur un moteur maison « plein jour »
avec ombres portées (Porcelain, Lagoon, Blueprint, Frost, Toybox, Mist,
Halftone, Deep cut, Chart, Gloss). **Retour Gaia : pas assez moderne, pas assez
3D → changer de direction.** Archive.

## V9 — 2026-11-11 · Claude · réalisme avec three.js

Re-brief express (2 questions) : ce qui manque = **le réalisme** (vraie eau,
matières) ; three.js **autorisé**. `G-DESIGN/v9/` : ciel physique (Sky), mer
réfléchissante (Water, carte de normales générée, aucun asset), soleil avec
ombres douces 4096, tone mapping ACES, environnement PMREM, peinture
clearcoat sur les coques, ville blanche / toits bleus, montagnes calcaires,
bouées autour des trois bancs, plan cinéma au ras de l'eau.
Géométrie toujours procédurale (port.js, boat.js). HUD clair repris de V8.

**Changelog** : moteur maison → three.js ; nuit/cyan → jour bleu et blanc ;
vue maquette → plan cinéma ; anneaux dessinés → bouées réelles.
**Pas encore** : campagne animée, branchement au moteur de jeu, poissons,
écume/sillages, détail des façades.

## V9.1 — 2026-11-12 · Claude · « plus réaliste » (V9 validée par Gaia)

**Retour Gaia** : « let's go sur celui-ci, peux-tu faire encore plus réaliste ? »

1. **Occlusion ambiante** (GTAO) : les bâtiments, quais et bateaux se posent
   enfin au sol, les creux s'assombrissent.
2. **Matières** générées (aucune image) : crépi patiné, **tuiles** bleues en
   relief, pavés, blocs de quai avec ligne de marée ; **vitres** sombres qui
   reflètent le ciel ; coques laquées (carène sombre, pont bois).
3. **Montagnes** : relief à arêtes, roche bleu-gris sur les pentes, neige sur
   les hauteurs ; **520 conifères** sur les bas versants ; nuages.
4. **Bateaux** : mâts, tangons et potences en volume (tubes), gréement fin.
5. Soleil un peu plus bas (26°), ombres plus longues, lumière plus chaude.
6. Le bilan (valeur nette / dette) reçoit un fond blanc pour rester lisible.

Vues : `?view=wide` (défaut, celle validée), `?view=hero`, `?view=town`.
`?noao` coupe l'occlusion. Fichiers : `v9/main.js`, `v9/env.js`.
**Pas encore** : façades détaillées (balcons, portes, volets), écume et
sillages, poissons, campagne animée, branchement au moteur du jeu.

---

## V9.2 — 2026-11-12 — le décor réaliste branché au vrai jeu

**Demande de Gaia** : « Branche-la au jeu ».

**Ce qui est livré (dans `web/`, rien de commité)** : la scène three.js de la
V9.1 remplace le rendu WebGL écrit à la main. Le jeu est le même (moteur
wasm, panneaux, criée, tutoriel) ; seul le décor et la palette changent.

- Décor : ciel physique, mer réfléchissante, soleil bas et ombres, ombres de
  contact, crépi / tuiles bleues / pavés / blocs de quai, vitres, montagnes
  enneigées, conifères, nuages. Grue, lampadaires et échelles en volume.
- Jeu : clic sur un bateau puis sur un banc ou le quai (inchangé). Dans un
  groupe serré, ce sont tes bateaux qui gagnent le clic. Bateau choisi =
  anneau blanc sur l'eau. Banc survolé = ses bouées passent au bleu.
  Débarquement = caisses qui volent vers la criée. Sillage derrière un
  bateau en route.
- Caméra : basse sur l'eau, ciel visible, les trois bancs dégagés du pont
  d'instruments. Glisser = tourner, molette = approcher.
- Interface : thème jour (`v9.css`, remplace `v7.css`) — cartes blanches,
  un seul bleu d'action, bilan (valeur nette + dette à la mer) sur plaque
  blanche.
- Garde-fou : si la machine ne suit pas (images trop lentes), les ombres de
  contact se coupent seules ; le jeu reste jouable.

**Vérifié à l'écran** (aperçu local, moteur wasm) : connexion hors ligne,
tutoriel, envoi de Skua puis Tern vers un banc par clic dans la scène,
« End the day » (10 débarquements, criée rejouée, valeur nette 1 350 → 2 204),
zoom. Console sans erreur. `tests/ci_structural.py` OK.

**Non vérifié / non fait** : tests e2e Selenium non relancés ; build de
production non obtenu sur ce poste (échec déjà connu de `proofs/`, casse
`Timeline.ts` / `timeline.ts` sous Windows) donc poids du bundle non
mesuré ; fluidité non mesurée proprement ; repli 2D et mouvement réduit non
re-testés ; écran étroit non re-testé.

### Changelog V9.1 → V9.2
1. Le rendu réaliste passe de la planche (`G-DESIGN/v9/`) au jeu (`web/src/scene3d/`).
2. `three` devient une dépendance de `web/` (entorse à « zéro dépendance », validée par Gaia).
3. Palette nuit + cyan abandonnée dans le jeu : thème jour blanc / bleu clair.
4. Caméra basse avec ciel, à la place de la vue plongeante sur diorama.
5. Sélection, survol, caisses et sillages refaits pour le nouveau rendu.
6. Poissons, faisceau du phare et socle du diorama retirés.
