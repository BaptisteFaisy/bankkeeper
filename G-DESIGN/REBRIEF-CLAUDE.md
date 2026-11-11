# REBRIEF-CLAUDE.md — bankkeeper / Tidewater : reprendre le design à zéro

> Écrit par opencode (combo cheap) le 2026-11-11, à la demande de Gaia, pour
> passer la main à Claude. **Le design est à reprendre depuis zéro.** Ce fichier
> contient : ce que Gaia veut, ce que le produit est réellement, ce qui a échoué
> et pourquoi, les contraintes dures, et les fichiers à lire.

---

## 1. Mission

Reprendre la direction artistique du projet **bankkeeper** (jeu **Tidewater**,
hackathon NEAR, track *Games With Real Economies*) **depuis zéro**.

Les tentatives précédentes (V1 → V4, dans `G-DESIGN/DESIGN.md` et les dossiers
`v2/`, `v3/`, `v4/`) n'ont pas convaincu. Elles restent consultables comme
historique et comme matériel technique réutilisable, **mais ne pas les prendre
comme référence visuelle**.

Deadline design : **14/11**. Soumission : **15/11 00:59 Paris**.

---

## 2. Ce que Gaia veut (le brief réel, consolidé sur 5 retours)

C'est la partie la plus importante. Chaque point vient d'un retour explicite.

### 2.1 Lisibilité immédiate
- « **On doit comprendre d'un coup d'œil de quoi il s'agit.** » Un port de
  pêche, une économie partagée. Si un inconnu ouvre la page et ne sait pas en
  3 secondes de quoi il s'agit, c'est raté.
- **Visuel d'abord, texte ensuite.** Tout doit être *montré*, pas expliqué en
  prose. Garder l'essentiel en texte, mais **toutes les fonctionnalités doivent
  rester visibles** (rien ne disparaît, tout est représenté).

### 2.2 Identité visuelle
- **2 couleurs maximum**, quelque chose d'**extrêmement moderne, avant-gardiste**.
- **Fond sombre** de préférence.
- **Le visuel du jeu doit être en 3D**, « extrêmement moderne comme 3D ».
- **Version retenue par Gaia : le bleu clair** (cyan `#19e3ff` sur fond
  bleu-nuit). C'est le seul thème à garder.

### 2.3 Rendu « travaillé », pas « neuf »
- Les **bâtiments, la mer et les bateaux doivent être reconnaissables** et
  avoir une apparence **très travaillée**. Gaia ne demande pas du neuf/reluisant,
  mais du **soigné, crédible, détaillé**.
- Retours successifs : « pas assez poussé », « pas assez réaliste »,
  « on dirait pas un port ».

### 2.4 Cadrage
- **Voir la mer de plus loin**, avec **les bateaux moins proches du port au
  départ**. La mer doit occuper le cadre, pas seulement le port.

### 2.5 Identification des acteurs
- Chaque bateau doit porter un **signe distinctif selon son propriétaire** :
  une **icône pour le joueur** (« Moi »), des **icônes d'humains**, et des
  **icônes d'agent pour les NPC** (les capitaines NPC sont bien des agents
  automatisés — c'est fidèle au code).

### 2.6 Les deux pièges doivent se voir
- **Piège 1** (dès le début) : tout le monde va sur le même banc parce qu'il
  payait le mieux la veille → la prise par sortie s'effondre.
- **Piège 2** (quand ils se dirigent vers le port) : tout le monde débarque en
  même temps → le prix s'effondre pour tous.

### 2.7 Le temps et la campagne
- **Montrer les 3 saisons.**
- **Indiquer très clairement combien de temps après le début on est.**

### 2.8 La tragédie des communs, visuellement
- Trouver **un moyen visuel** de faire comprendre qu'il s'agit d'une
  **tragédie des biens communs**, avec les effets à **court, moyen et long
  terme**, et que le joueur (appelé **« Moi »**) doit **arbitrer entre les trois**.

### 2.9 Affichage permanent
- **Toujours afficher, tout du long du jeu** :
  - **Valeur nette** — combien tu vaux, en or ;
  - **Dette envers la mer** — combien de caisses tu as prises au-dessus de ce
    que le banc pouvait refaire.

### 2.10 Interaction et déroulé
- **Interactif à la souris** : au minimum regarder à gauche/droite et en
  haut/bas.
- **Un bouton qui déclenche tout le process jusqu'au résultat**, avec des
  **animations beaucoup plus limpides et représentatives** de ce qui se passe.
- **Ne pas montrer deux fois la même étape** (une fois sous le bouton, une fois
  sur la carte) : **une seule timeline**.
- **Les benchmarks doivent être affichés.**

### 2.11 Pédagogie
- Gaia a dit : « je n'ai rien compris ». **Le design doit expliquer le jeu
  fonctionnellement par lui-même**, sans qu'on ait besoin de lire un texte.

---

## 3. Ce qu'est réellement le produit (ne pas inventer)

**Le brief initial `G-DESIGN/BRIEF-UI.md` est faux** : il décrit un jeu idle
sur Telegram avec un coffre-fort et des classements. **Rien de cela n'existe
dans le code.** Décision de Gaia (2026-11-11) : **le design s'aligne sur le code**.

### 3.1 Le jeu, en clair
Tu es **capitaine et armateur** d'un port de pêche. **Dix bateaux** (2 à toi,
8 à des NPC) pêchent sur **trois bancs que personne ne possède**. Le poisson en
mer n'appartient à personne tant qu'il n'est pas débarqué.

- **Toutes les ~30 s** : un bateau rentre, son lot passe à la **criée
  hollandaise** (le prix part haut et **descend** jusqu'à ce qu'un marchand
  accepte). Trois marchands : Fishmonger, Cannery, The Gull. Chacun a une
  **limite** = prix de base × facteur de stock.
- **Toutes les 5 min** : la journée ferme. Les bancs repoussent, les équipages
  sont payés, les faillites sont vérifiées.
- **Chaque semaine** : les quotas repartent à zéro.
- **Chaque saison** : le **conseil du port** vote (une licence = une voix).
- **Une campagne = 3 saisons.** À la fin, tu écris une **charte** (une règle)
  qui gouverne la campagne suivante. La mer garde ce que la saison lui a laissé.

### 3.2 Le score
**Deux colonnes, pas de morale** : la **valeur nette** (or) et la **dette envers
la mer** (caisses prises au-dessus de la prise durable). Une mer vide ne rapporte
simplement plus rien.

### 3.3 Les cinq barreaux (la colonne vertébrale, `docs/SPINE.md`)
1. **Voir** — le registre chiffre l'externalité : qui a pris quoi, contre la
   prise durable (`Greybank 214 prises · 62 durables/jour → 1,8× ; toi 46 %`).
2. **Payer** — une **redevance** par caisse vendue alimente un **fonds du port**
   (le coffre sur le quai), qui paie relevés, jachères, indemnisations.
3. **Gouverner** — chaque motion **vote son financement** et chaque vote affiche
   son calcul (`Brandt vote non : le quota lui coûte 640/semaine, l'offre paie 400`).
4. **Hériter** — la **dette envers la mer**, en caisses, reportée de saison en
   saison.
5. **Réparer** — **jachère** collective, **réensemencement** par le fonds,
   **une réclamation par saison** contre le fonds (avec crédibilité).

### 3.4 Les leviers du joueur
Affecter un bateau (2 clics) · choisir le filet (grand / petit : +40 % de prise
mais repousse réduite, changement à quai seulement) · acheter un **relevé**
(80 or, ±10 %, le stock réel n'est **jamais** affiché) · acheter/vendre/**louer**
des **licences** (20 en circulation, plafond 8, une licence = une voix) ·
racheter une **note de dette** puis accorder un report ou saisir · proposer et
voter une **motion** (quota, fermeture de zone, interdiction du petit filet,
redevance, indemnité, et qui paie) · **jachère** / **réensemencement** ·
**réclamation** · écrire la **charte**.

### 3.5 Les acteurs NPC
- **Marta Hale** — prudente : pêche tant que la prise par sortie reste au-dessus
  de 70 % de sa moyenne sur 4 semaines.
- **Brandt Brothers** — voraces et endettés : tout sur la zone qui payait le
  mieux hier, petit maillage.
- **Pim Okoro** — suiveur : copie celui qui a le mieux gagné par bateau la veille.
- **Marchands** : Fishmonger, Cannery, The Gull (ferment à zéro).
- **Harbour Bank** (prête, saisit après deux traites manquées), **Chandlery**,
  **Habitants** (équipages et ouvriers).

### 3.6 Les écrans réels
Écran principal 1280×800 (barre du haut, carte marine, criée, tes bateaux,
registre du port, bureau du port, chronique) · tiroir **Judges** (fast-forward
7/28 jours, graphe, table de vérité, `history_hash`) · **tutoriel** 3 cartes ·
porte d'entrée « Take command » (email, pas de wallet) + offre de saison
partagée · **bilan** de saison · **charte** · `/proofs.html` (preuves publiques).

### 3.7 Réponses aux questions déjà tranchées
- **Y a-t-il plusieurs ports ?** **Non.** Un seul port, trois bancs, trois
  marchands, un conseil. Le « port voisin » n'existe que dans `docs/VISION.md`
  (piste 7), **non codé**. Ne pas l'inventer.
- **« Changer de zone → effet dans 30 s »** : formulation fausse que j'avais
  écrite. La zone ne change pas le prix directement ; elle change **ce que tu
  débarques** (quantité + espèce, la morue vaut ~3× le hareng), et c'est ce
  débarquement, 30 s plus tard, qui fixe le prix (la limite de l'acheteur dépend
  de son stock). L'effet « trop de bateaux sur la même zone » est à **5 minutes**
  (le stock baisse).

### 3.8 Technique (ce qui est vérifiable par les juges)
Moteur **Rust déterministe compilé en wasm** (868 Ko), **zéro serveur**, zéro
`/api/`, PWA installable et hors-ligne. Contrat **NEAR NEP-245** (or, hareng,
morue, licences, actes de bateau, notes de dette, parts de renflouement).
Relais sponsorisé : pas de wallet, pas de gas. Graine partageable par URL,
`history_hash` reproductible. 238 tests Rust verts au 10/11.

### 3.9 Benchmarks réels (`docs/BALANCE.md`, à afficher)
50 graines × 4 politiques × 3 saisons = **200 campagnes, 16 800 jours, 0,4 s**.

| politique | valeur nette | Greybank restant | dette mer | fonds du port | effondrement |
|---|---|---|---|---|---|
| passive | 782 g | 1 236 | 4 420 | 5 048 g | 0 % |
| greedy | **16 257 g** | 606 | 5 356 | 4 960 g | **34 %** |
| steward | 14 729 g | 2 444 | 1 488 | 2 439 g | 0 % |
| mixed | 13 751 g | 1 768 | 1 814 | 2 206 g | 0 % |

Verdicts mesurés : aucune politique n'écrase les autres (greedy +10,4 %, gagne
165/200 et **perd 18/200**) ; la surexploitation coûte (3,6× la dette, banc à
12 % de capacité au lieu de 49 %) ; la dette est payable (−1 592 caisses en deux
saisons avec la jachère).

---

## 4. Ce qui a échoué, et pourquoi (à ne pas reproduire)

| Version | Ce que c'était | Pourquoi ça n'a pas pris |
|---|---|---|
| **V1** | 6 planches textuelles (chart room, table du port, almanach, passerelle, diorama, journal) | Aucune identité, trop de texte, allure de tableau de bord |
| **V1.1** | Les 6 mêmes en HTML statique | Idem : ce sont des maquettes de panneaux, pas un jeu |
| **V2** | 4 identités à 2 couleurs, scène en **CSS 3D** (plans empilés) | Le CSS 3D ne rend pas un jeu : ça reste des plaques |
| **V3 / V3.1** | Vrai WebGL maison | Trois bugs majeurs trouvés tard : **la mer n'était jamais dessinée** (attribut inexistant activé → draw annulé), **le brouillard partait du centre local** du maillage, **les bancs passaient l'accent en couleur de base**. Résultat : des dalles flottantes, « on dirait pas un port » |
| **V3.2 / V4** | Port détaillé, ciel shader, eau à 4 vagues, badges, pièges, 3 saisons, trois horloges | Toujours « pas assez poussé / réaliste ». Le détail s'est ajouté **sans que la composition ne soit jamais vue** |

### La cause racine, à transmettre honnêtement
**opencode ne peut pas voir les images** (pas d'entrée visuelle). Toute la
composition a été réglée à l'aveugle, par readback de pixels (moyenne RGB,
% de pixels éclairés) et par un rendu ASCII 132×40, plus une sonde projetant 16
points-clés. C'est suffisant pour débuguer un moteur, **pas pour diriger une
direction artistique**. C'est la raison principale de la non-convergence.

**Claude doit donc repartir de zéro sur le visuel**, en pouvant itérer
visuellement avec Gaia (captures, allers-retours), ce que opencode ne pouvait pas.

### Ce qui reste réutilisable (technique, pas esthétique)
- `v4/gl-core.js` : maths 4×4, compilation de shaders, fabriques de maillages
  (boîte, **coque à tonture**, pavois, prisme, toit à deux pans, toit en shed,
  voile, plan, grille). WebGL1, zéro dépendance.
- `v4/harbour.js` : renderer, caméra orbitale (glisser/molette), shader de ciel,
  shader d'eau à 4 vagues avec normales analytiques + reflet + écume, projection
  monde→écran pour les étiquettes, readback de diagnostic.
- `v4/day.js` : machine à états en 10 étapes (aube, piège 1, lots, piège 2, soir,
  la mer, conseil, saison 2, saison 3), avec mouvements de bateaux, caisses,
  horloge de campagne.
- `v4/harbour.html` : HUD (bilan permanent, horloge, trois horloges, timeline
  unique, badges d'armateur, panneau « THE BOOKS »).
- **Bug connu à ne pas reproduire** : n'activer que les attributs réellement
  déclarés par le shader (sinon `enableVertexAttribArray(-1)` annule le draw).

---

## 5. Contraintes dures

### 5.1 Propriété des fichiers
- Repo code (`web/`, `crates/`, `contracts/`, `docs/`, `tests/`) : **lecture
  seule**, c'est le travail de Baptiste.
- Claude écrit : `G-DESIGN/DESIGN.md`, les planches/maquettes, les assets
  design, sa section `## Claude` de `G-DESIGN/STATUS.md`.
- Retours croisés vers le code : `G-DESIGN/HANDOFF.md`, préfixe auteur,
  **ajout uniquement**.

### 5.2 Direction artistique en vigueur (`docs/ART.md`) — et sa marge réelle
`docs/ART.md` dit : plat, maritime, charpenté ; palette limitée aux jetons de
`web/src/styles.css` plus leurs teintes plus sombres/claires ; aucun dégradé ;
aucun effet verre ; aucun asset externe (tout procédural) ; aucune police web ;
pas de violet/indigo, pas de fond crème uni, pas de grille de cartes identiques,
pas d'emoji en guise d'icône.

**Ce que la CI vérifie réellement** (`tests/ci_structural.py`) :
- elle **exige seulement que les 9 teintes existantes restent présentes** dans
  `web/src/styles.css` → **ajouter un accent est permis** ;
- elle **interdit** `linear-gradient|radial-gradient|conic-gradient`,
  `backdrop-filter`, `violet|indigo`, `repeat(auto-fill|auto-fit)`, les emoji,
  dans les fichiers `.rs .py .ts .tsx .css` ;
- elle exige `prefers-reduced-motion` dans `styles.css` et `SeaMap.tsx`, et un
  DPR plafonné à 2 dans `SeaMap.tsx` et `Chart.tsx`.

**Conséquence** : une identité à 2 couleurs est faisable **sans casser la CI**,
mais demande un **avenant à `docs/ART.md`**. Les shaders GLSL dans un `.js` ne
sont pas scannés par la CI (un dégradé de ciel en GLSL passe), mais il faut le
signaler dans le handoff plutôt que jouer dessus.

### 5.3 Autres contraintes
- **Aucune dépendance npm ajoutée** (le build doit rester hors-ligne). WebGL
  brut ou canvas 2D seulement ; three.js coûterait ~600 Ko et violerait la règle.
- **Hors-ligne** : zéro appel réseau, zéro asset externe, zéro police web.
- **Accessibilité non négociable** : le canvas est informatif/décoratif, toutes
  les actions restent disponibles au clavier et aux lecteurs d'écran via des
  contrôles DOM ; `prefers-reduced-motion` = image fixe, aucun tween ; les
  sélecteurs des e2e (`tests/e2e_offline.py`, `e2e_pwa.py`, `e2e_tutorial.py`,
  `audit_web.py`) sont **préservés**.
- Fichiers < 500 lignes, fonctions < 50 lignes, zéro duplication.
- Écran nominal 1280×800 ; une colonne sous 1100 px ; **pas de mobile** (hors
  périmètre, `tidewater.md` §1.4).
- Le jeu **ne juge pas** : aucun écran ne doit dire « vous avez trop pêché ».
  Les chiffres suffisent.

---

## 6. Fichiers à lire, dans l'ordre

1. `HACKATONS/CLAUDE.md` — consignes permanentes (ronds, propriété, fin de session).
2. `HACKATONS/prompts/07-design.md` — les 6 commandes et la règle des ronds.
3. `HACKATONS/AGENTS.md` — contexte usine (règles d'exécution).
4. **`G-DESIGN/FONCTIONNALITES.md`** — l'inventaire fonctionnel complet du
   produit, écrit depuis le code. **C'est le document le plus utile**, il est à
   jour et fiable.
5. `G-DESIGN/REBRIEF-CLAUDE.md` — ce fichier.
6. Repo (lecture seule) : `README.md`, `tidewater.md` (§2.2 écran, §9 direction
   visuelle), `docs/ART.md`, `docs/SPINE.md`, `docs/GAME-LOOP.md`,
   `docs/ECONOMY.md`, `docs/BALANCE.md`, `docs/TUTORIAL.md`, `docs/DEMO-JUGES.md`,
   `docs/PROOFS.md`, `docs/COMPLIANCE.md`.
7. Code pour connaître l'existant : `web/src/styles.css` (palette réelle),
   `web/src/App.tsx`, `web/src/components/*`, `web/src/scene/*`.
8. Historique design : `G-DESIGN/DESIGN.md` (V3 → V4), `G-DESIGN/DESIGN-V1.md`
   (V1, V1.1, V2), `G-DESIGN/v4/` (dernière tentative).

**À ignorer** : `G-DESIGN/BRIEF-UI.md` (obsolète, décrit un produit qui
n'existe pas). Un avenant est demandé à opencode dans `HANDOFF.md`.

---

## 7. Ce que Gaia attend comme première livraison

Recommandation : **ne pas repartir sur 6 planches**. Gaia a déjà rejeté deux
fois des planches multiples sans identité.

1. **Une seule image de référence** : le port vu de la mer, en 3D, qui se
   comprend en 3 secondes. Bateaux identifiables par propriétaire, mer
   reconnaissante, bâtiments crédibles. Format : une page HTML autonome,
   1280×800, fond sombre, **2 couleurs** (le bleu clair retenu).
2. Autour de cette image, le **minimum de HUD** : valeur nette + dette envers
   la mer en permanence, l'horloge de campagne (saison/semaine/jour/temps
   écoulé), et les **trois horloges** (30 s / 5 min / saisons) qui matérialisent
   l'arbitrage.
3. **Un bouton** qui joue toute la campagne, avec des animations limpides :
   les deux pièges visibles, les 3 saisons, le conseil, le bilan.
4. **Les benchmarks** affichés, avec leurs chiffres réels.
5. Puis seulement : décliner (`/variantes`), cibler un écran (`/cible`),
   itérer par deltas numérotés (`/delta`), verrouiller (`/lock`).

**Méthode conseillée** : itérer **visuellement avec Gaia** (capture → retour →
correction), une seule direction à la fois, plutôt que produire six directions
en parallèle. Ne pas ajouter du détail avant que la composition soit juste.

---

## 8. Commandes design (vocabulaire fixe)

`/planches N` · `/variantes` · `/delta` · `/cible <écran>` · `/compare A B` · `/lock`

Fin de session : mettre à jour la section `## Claude` de `G-DESIGN/STATUS.md`,
terminer par un résumé + un prompt relais prêt à coller, et rappeler les six
commandes. Langue : français pour les échanges, anglais pour les textes du jeu.
