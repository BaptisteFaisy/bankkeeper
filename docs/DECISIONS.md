# Tidewater — Décisions

> Registre des décisions datées. Toute décision nouvelle s'ajoute ici
> avec sa date et sa justification ; on n'y réécrit jamais le passé.

## 2026-11-09 — Scaffold lot 0 (branche `feat/tidewater-lot0`)

- **Layout miroir de near-games, adapté** : workspace `crates/rules` +
  `crates/sim` + `contracts/tidewater` (pas de pricing/ledger/harness
  séparés : les règles Tidewater vivent dans un seul module `rules`
  partagé par la simu et le contrat, brief §8).
- **Crate contrat nommée `tidewater`** (NEP-245 §6), crates `rules` et
  `sim` aux noms simples comme la référence.
- **Relais de dev sur le port 8785**, jamais 8775 (live Market Town) ni
  8765 ; proxy Vite `/api → 8785` dans `web/vite.config.ts`.
- **`.github/` gelé** : la CI reste docs + gardes, aucun workflow
  modifié ; Rust et web vérifiés en local par les agents.
- **Web** : React 18 + Vite 5 + TS strict, mêmes versions que la
  référence (socle éprouvé), paquet renommé `tidewater`.
- **`.gitignore`** : `target/`, `node_modules/`, `web/dist/`,
  `__pycache__/`, `*.pyc`, états `server/state.json` — rien de généré
  ni d'éphémère n'est commité.

## 2026-11-09 — Lectures des questions ouvertes (brief §13, spec §7)

| Question | Lecture retenue | Motif |
|---|---|---|
| Conservation (glace/fumoir) | Non | Hors périmètre (§1.4), le poisson ne se garde pas (TW-N-12) |
| Score | Valeur nette seule | Le jeu ne juge pas ; une mer vide ne rapporte plus rien (§11) |
| Plafond de licences/joueur | Aucun | Levier assumé : racheter des licences pèse plus que les bateaux (§11) |
| Défaite du joueur | Bateaux désarmés = fin de session (écran bilan) | Simple, lisible, pas de reprise équipier |
| Saison de 2 h 20 | Atténuée par fast-forward (28 j en 1 min) + bouton « prochain débarquement » | La démo juges ne joue jamais 2 h 20 (§11) |
| Relevé « vaut une semaine » | Estimation figée 7 jours, rejouable ensuite | Évite le spam de relevés à 80 or |
| Facteur de stock acheteur | `1 + 0,5 × écart relatif à la cible` | Formule du §12 |
| Écoulement et paies | Chaque fin de journée | Conserves exportées → or extérieur ; paies dépensées → poissonnier/auberge |

## 2026-11-10 — Round 1 : journée atomique (critic-1 B1, règles §11/TW-UI-04)

Le temps direct avance par journées atomiques (`POST /api/day`, bouton
« End the day ») : les trois sorties, les débarquements, la criée et le
registre se résolvent d'un coup, avec le rapport de journée en toast.
L'horloge de criée ne défile donc pas en direct ; la criée montre le dernier
lot, les limites et le prix de vente avec sa ligne de raisonnement. Lecture
assumée : jouable et démontrable, là où le §2.1 décrit un rythme continu
(débarquement ~50 s, journée 5 min) que le tour par tour compresse.

## 2026-11-10 — Round 2 : centimes exacts, limites au décime (critic-2 M3)

`gold_pieces` arrondissait au décime, rendant les lignes de vente fausses
(« 20 × 5.7 = 114.6 »). La vue transmet désormais les centimes exacts et
l'UI partage `fmtGold` / `format_exact` (2 décimales rognées à 1 si exact) :
tout produit affiché est juste. Les limites gardent le format 1 décimale
épinglé par les tests existants (brief §10 : 3,6 puis 3,4 exactement) :
la limite est la cotation, le marteau est le prix exact.

## 2026-11-10 — Round 3 : limites exactes, conseil honnête, bilan (critic-3)

- **Défaut 3 (limite contredisant le marteau)** : corrige le round 2 —
  la limite affichée utilisait `format_price` (tronqué à 1 décimale) là où
  le marteau utilisait `format_exact`, d'où des lignes incohérentes dès
  qu'un prix tombait hors décime (573 → marteau 5,73 mais limite 5,7).
  La limite utilise désormais `format_exact` comme le marteau, et le
  facteur passe par `format_factor_exact_bps` (valeur exacte, 4 décimales
  rognées à 2 minimum : 9000 → « 0.90 », 14325 → « 1.4325 »). L'exemple du
  brief reste identique à l'octet près. `format_price` reste pour ses
  autres appelants (`fmt_gold`, lots perdus, tests du §10).
- **B2 (conseil fantôme)** : sans motion déposée, le conseil ne vote plus
  (« 20 pour, 0 contre » sur du vide) — `roll_season` rend un rapport
  `tabled: false`, bulletins vides, tally zéro rejeté, et la ligne
  « Council of season N: no motion tabled; the standing rules continue. ».
  L'événement fast-forward garde son `kind: "council"` avec un texte
  honnête. Le champ `proposal` porte le statu quo descriptif.
- **B3 (maille du débarquement)** : `Landing` porte la maille réellement
  pêchée (post-interdiction), filetée depuis le cycle au lieu de relire
  le filet courant du bateau ; le registre n'étiquette plus le passé
  avec le présent. Le web lit déjà `landing.mesh`, rien à câbler.
- **B5 (fin de saison, brief §2.3 étapes 5-6)** : la saison dure
  `days_per_week × weeks_per_season` (28 jours). Le jour où elle se
  complète, le conseil roule d'abord (motion ou absence honnête), puis la
  partie passe `over: true` avec son bilan ; `sim day` refuse ensuite
  avec `{"error":"season over"}` (exit 1). Le primitif moteur `run_day`
  reste total pour les runs de recherche ; la barrière vit dans `try_day`,
  `sim day` et `sim ff` (qui s'arrête à la fin de saison).

  **Formule du bilan** : valeur nette joueur = bourse + licences × prix
  courant de la licence + coques × 400 (prix du neuf, `new_boat_cost`),
  en centimes ; s'y ajoutent la bourse, les licences détenues, le prix
  retenu, le nombre de coques et le vrai stock par zone (révélé aux juges
  seulement, le joueur ne l'a jamais vu de la saison). Exposée dans
  `DayReport` (`season_over`, `bilan`) et `view_state` (`seasonOver`,
  `bilan`). Les anciennes sauvegardes chargent avec `over: false` et des
  champs manquants par défaut (serde `default`).

## 2026-11-10 — Les cinq questions ouvertes du brief §13, tranchées

- **Q1, conservation (glace, fumoir) : non.** TW-N-12 reste seul maître :
  le lot est vendu à la criée dès le débarquement, le poisson ne se garde
  pas. Stocker pour attendre la hausse supprimerait la seule pression qui
  force à choisir entre pêcher aujourd'hui et pêcher demain. Rien à coder.
- **Q2, score : valeur nette seule.** Le bilan ne note que la bourse, les
  licences au prix courant et les coques (§ B5 ci-dessus). Le stock réel
  reste dans le bilan comme **statistique** révélée aux juges, jamais
  comme multiplicateur : une mer vide ne rapporte simplement plus rien
  (brief §11, « le jeu ne juge pas »).
- **Q3, plafond de licences : 8 par capitaine** (`licence_cap_per_captain`,
  sur 20 en circulation). Sans plafond, le joueur achète le port et le
  vote du conseil devient un tampon. Appliqué aux trois entrées
  possibles : achat au pool, échange de gré à gré, achats du lundi des
  NPC ; refus explicite (`CapReached`) et rien ne bouge. Le contrat
  applique le même plafond dans `buy_licence` (`E_LICENCE_CAP`).
- **Q4, défaite : bilan puis nouvelle saison.** Un capitaine à zéro en
  fin de semaine désarme ses bateaux (TW-N-50) ; si c'est le joueur, la
  partie s'arrête sur le bilan et `sim init` reseed immédiatement une
  nouvelle saison. « Reprendre comme équipier d'un NPC » serait un mode
  entier, hors du temps d'une démo.
- **Q5, durée de saison : paramétrable.** `weeks_per_season` existait
  déjà dans `Config` (4 → 28 jours) ; il devient réglable à la création
  (`sim init --weeks 2`, `SIM_WEEKS` côté relais) et le fast-forward
  accepte 7, 14 et 28 jours. Démo : **2 semaines**, le vote du conseil
  arrive au bout de 70 minutes au lieu de 2 h 20. Jeu complet : 4.

## 2026-11-10 — La graine doit choisir (correctif, branche `feat/seed-variety`)

- Constat : `Rng` existait, était exporté, et aucune règle ne l'appelait.
  Graines 7, 11 et 23 → saison identique au hash près, et une seule zone
  pêchée sur 28 jours (`best_zone_yesterday` ignore les zones à
  `trips == 0`, donc personne ne découvre jamais un banc déserté).
- Décision : tirages **sans état** `seed::draw(seed, day, purpose, salt)`.
  Rien à sérialiser, aucun flux à désynchroniser, reprise exacte depuis
  une sauvegarde. Les égalités (« meilleure zone hier », « meilleur
  capitaine hier ») sont tranchées par la graine, plus par l'ordre du
  tableau. Okoro, suiveur, tente un banc que personne n'a pêché depuis
  deux semaines un jour sur cinq, et l'annonce dans sa ligne de
  raisonnement. TW-J-04 tient : même graine, même saison.

## 2026-11-10 — Le moteur tourne dans le navigateur (branche `feat/wasm-engine`)

- `crates/wasm` compile `rules` + `sim` en `wasm32-unknown-unknown` et parle
  **exactement le JSON du relais** (`{op, body}` en entrée, même enveloppe en
  sortie). `web/src/api.ts` garde ses signatures : une seule bifurcation,
  `engineEnabled()`, choisit le moteur ou le réseau.
- **Pas de wasm-bindgen** : ABI maison (`tw_alloc`, `tw_call`, `tw_out_len`,
  `tw_free`), zéro dépendance npm, module de 347 Ko, **aucun import** — donc
  `WebAssembly.instantiate(bytes, {})` suffit, sans MIME ni shim.
- La démo publique joue une **saison de 14 jours** par défaut
  (`DEFAULT_WEEKS = 2`, réponse §13 question 5) et tout l'état vit dans
  l'onglet : aucun serveur, aucun compte, aucune requête réseau.
- `tests/e2e_offline.py` rejoue le parcours de référence sur le build
  statique et **échoue si une seule requête `/api/` part** : c'est la preuve
  que le moteur fait le travail. Vérifié aussi sur la prod Vercel.

## 2026-11-10 — La fiction reste un port de pêche (décision du propriétaire)

- Le track parle d'un « market-town game » ; Tidewater est un **port**. Les
  mécaniques demandées sont toutes là, à l'identique : on récolte (on pêche),
  on vend à des marchands agents qui ont leur bourse et leur inventaire, leur
  prix suit leur stock et la demande récente, et un marchand ruiné ferme
  jusqu'à ce que quelqu'un investisse.
- **Décision : on garde le port.** Pas de re-thème en ville-marché. Le port
  n'est pas un habillage : c'est ce qui rend la ressource commune **non
  possédée** (le banc n'appartient à personne) et donc la tragédie des communs
  lisible sans un mot d'explication.
- Conséquence pratique : aucun travail de libellé à prévoir ; `docs/COMPLIANCE.md`
  garde la ligne « fiction différente » comme un choix assumé, pas comme un écart.
