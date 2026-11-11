# PROMPT À COLLER — nouveau chat Claude (bankkeeper / Tidewater, V7)

> Copier le bloc entre les barres, tel quel, dans un nouveau chat Claude.
> Avant de coller : lancer le serveur de prévisualisation (une ligne plus bas),
> sinon Claude ne pourra pas ouvrir la référence visuelle.

```powershell
# à lancer une fois, dans un PowerShell, depuis Downloads\
python HACKATONS\2026-11-15-near\Games\bankkeeper\G-DESIGN\v5\serve.py 8790
# puis ouvrir : http://localhost:8790/v5/index.html?v=diorama
```

---

```
Projet : bankkeeper (jeu Tidewater) — NEAR HACKATHON, track `games`
(Games With Real Economies). Je suis Gaia. Deadline : 2026-11-14T23:59:00Z
(= 15/11 00:59 Paris). On est le 11/11 : il reste ~3 jours.

======================================================================
1. TA MISSION — trois choses, dans cet ordre
======================================================================

A) DESIGN : repars du contenu de la variante DIORAMA et rends-le
   BEAUCOUP plus moderne. Je suis insatisfaite des rendus précédents :
   ils ne font pas « produit fini 2026 », ils font maquette.

B) JEU RÉEL : il faut qu'on puisse VRAIMENT jouer. Ce qui existe dans
   G-DESIGN/v5/ est une animation scriptée (un bouton joue une campagne
   écrite à l'avance). Ce n'est pas un jeu. Le jeu réel, lui, existe déjà
   dans le repo (`web/`, moteur Rust→wasm, jouable hors-ligne, déployé sur
   tidewater-play.vercel.app). Ton travail : faire que la nouvelle
   direction visuelle soit LE JEU, pas une cinématique à côté du jeu.

   Et **SUR LA MÊME PAGE** que la simulation : un seul écran, une seule
   scène 3D, deux modes — la démo qui se joue toute seule, et le jeu où je
   prends la main. Pas deux onglets, pas deux applications, pas une
   maquette à côté du produit. Voir la section 4.3, c'est l'exigence
   centrale de ce round.

C) CONFORMITÉ : lis les règles, critères et livrables du hackathon
   (résumés vérifiés en section 5, sources en section 6) et aligne le
   README + la démo + la soumission dessus.

======================================================================
2. CE QUE TU DOIS LIRE AVANT DE PRODUIRE QUOI QUE CE SOIT
======================================================================

Usine / process :
- HACKATONS/CLAUDE.md                       (tes consignes permanentes)
- HACKATONS/prompts/07-design.md            (les 6 commandes, la règle des rounds)
- HACKATONS/AGENTS.md                       (règles d'exécution, propriété des fichiers)

Projet (le plus important, dans cet ordre) :
- G-DESIGN/REBRIEF-CLAUDE.md                (le cahier des charges consolidé :
                                             ce que je veux, ce qu'est le produit,
                                             ce qui a échoué et pourquoi)
- G-DESIGN/FONCTIONNALITES.md               (inventaire fonctionnel complet,
                                             écrit depuis le code — fiable)
- G-DESIGN/DESIGN.md                        (historique V4 → V6)
- G-DESIGN/v5/                              (le moteur et les 6 variantes)

Référence visuelle et de CONTENU à conserver :
- http://localhost:8790/v5/index.html?v=diorama
  (si le serveur n'est pas lancé : python G-DESIGN/v5/serve.py 8790)

Repo code (lecture, puis écriture autorisée — voir section 4) :
- README.md, tidewater.md (§2.2 écran principal, §9 direction visuelle)
- docs/ART.md, docs/SPINE.md, docs/GAME-LOOP.md, docs/ECONOMY.md,
  docs/BALANCE.md, docs/DEMO-JUGES.md, docs/COMPLIANCE.md, docs/PROOFS.md
- web/src/styles.css (la palette réelle), web/src/App.tsx,
  web/src/components/*, web/src/scene/*
- tests/ci_structural.py (ce que la CI interdit vraiment)

À IGNORER : G-DESIGN/BRIEF-UI.md (décrit un jeu idle Telegram qui n'existe
pas dans le code). G-DESIGN/v2, v3, v4 : historique seulement, ne pas imiter.

======================================================================
3. LA RÉFÉRENCE : ce qu'il faut GARDER de la variante diorama
======================================================================

Le contenu et la structure sont bons. Ne les jette pas :

- Le principe « UNE SEULE CHOSE À LA FOIS » :
  * au repos → marque, horloge de campagne, valeur nette + dette envers la
    mer, le bouton ;
  * pendant une étape → l'événement en cours (grand), l'échelle de temps
    ACTIVE uniquement (30 s OU 5 min OU saisons, jamais les trois), et le
    problème épinglé dans la scène ;
  * le benchmark et la liste des problèmes n'apparaissent qu'au BILAN, ou
    via le bouton « Everything » ;
  * le reste du port s'éteint autour du sujet (point focal `V5.FOCUS`).
- Le déroulé en 8 étapes : DAWN → TRAP 1 (la foule sur Greybank, la prise
  par sortie tombe de 16 à 9,8) → TRAP 2 (tout le monde débarque, le prix
  s'effondre de 4,0 à 3,2) → DAY CLOSES (dette +98 caisses) → COUNCIL
  (motion financée, vote 11-9) → SEASON 2 (le banc reposé remonte 40→71 %)
  → SEASON 3 (Brandt endetté vide les Deeps, 90→38 %) → THE BOOKS (bilan
  à deux colonnes + benchmark).
- Les deux chiffres permanents : VALEUR NETTE (or) et DETTE ENVERS LA MER
  (caisses). Toujours visibles, en gros.
- L'horloge de campagne : SAISON x/3 · SEMAINE · JOUR · T+ temps écoulé.
- Les badges d'armateur sur les bateaux : icône humaine pour MOI, icône
  d'agent pour les NPC (Hale, Brandt, Okoro).
- Les benchmarks réels de docs/BALANCE.md (ne rien inventer) :
  passive 782 g / greedy 16 257 g / steward 14 729 g / mixed 13 751 g ;
  Greybank restant 1 236 / 606 / 2 444 / 1 768 ; dette mer 4 420 / 5 356 /
  1 488 / 1 814 ; effondrement 0 / 34 / 0 / 0 %.
- Le diorama : le monde découpé par un disque (`uClip`), légère rotation.

======================================================================
4. CE QU'IL FAUT CHANGER
======================================================================

4.1 — Le design doit être BEAUCOUP plus moderne.
  Ce que je veux dire par là, concrètement :
  - Une vraie hiérarchie : UN chiffre héro par écran, le reste en retrait.
    Pas douze panneaux de la même taille.
  - Du vide. Les maquettes précédentes étaient pleines partout.
  - Typographie assumée : un display très grand et très serré, un mono pour
    les chiffres, des libellés minuscules en capitales espacées. Pas de
    texte de taille moyenne partout.
  - Deux couleurs, pas trois. Fond sombre. Le bleu clair (cyan) est retenu.
    La deuxième couleur sert à la lumière (fenêtres, fanaux, bancs, chiffres),
    jamais à décorer.
  - Matières crédibles : la mer, les coques, les murs doivent avoir du
    volume, une lumière directionnelle, une atténuation atmosphérique.
    Pas des aplats uniformes ni des arêtes partout.
  - Micro-animations courtes et signifiantes (un chiffre qui change, un
    bateau qui accoste, une caisse qui vole). Rien de décoratif en boucle.

4.2 — IL FAUT QU'ON PUISSE VRAIMENT JOUER.
  C'est le point le plus important. Trois niveaux d'exigence, du minimum
  au mieux :

  NIVEAU 1 (minimum absolu, non négociable) :
    Le joueur peut, à l'écran, avec la souris et le clavier :
    - affecter un de SES bateaux à un banc (2 clics) ou le mettre à quai ;
    - changer son filet (grand / petit), à quai seulement ;
    - voir un lot arriver à la criée et le prix descendre ;
    - voir son or, son quota, sa valeur nette et sa dette changer en
      conséquence ;
    - avancer le temps (`Next lot`, `End the day`, ou `Go live`) ;
    - acheter/vendre une licence ;
    - proposer une motion et voter ;
    - payer la dette (jachère ou réensemencement) ;
    - voir le bilan de fin de saison et écrire la charte.
    Autrement dit : TOUTES les fonctionnalités listées dans
    G-DESIGN/FONCTIONNALITES.md doivent être atteignables dans la nouvelle
    interface, pas seulement racontées.

  NIVEAU 2 (l'objectif) :
    Cette interface est branchée sur le VRAI moteur. Le repo contient déjà
    `web/` : React + Vite + TypeScript strict, le moteur Rust compilé en
    `engine.wasm`, zéro serveur en production, persistance localStorage,
    graine partageable par URL. La nouvelle scène 3D devient la vue du jeu
    dans `web/src/scene/` + `web/src/components/`, et l'état vient du
    moteur — plus de chiffres écrits à la main dans un tableau JS.

  NIVEAU 3 (bonus juges) :
    Les gestes économiques clés (licence, dette, vote) passent par le
    contrat NEP-245 via le relais sponsorisé existant (`VITE_CHAIN=1`,
    `web/src/near/`, `scripts/relayer/`). Le strip on-chain existe déjà
    dans `web/src/components/ChainBar.tsx`.

  Tu es AUTORISÉE à modifier le code du repo pour ça, sur la branche
  `design/v5-harbour` (ou une branche fille). Conditions dures :
  - la CI doit rester verte (`ci`, `ci-budget` < 5 min, `couche0`) ;
  - les sélecteurs des e2e sont PRÉSERVÉS (`tests/e2e_offline.py`,
    `e2e_pwa.py`, `e2e_tutorial.py`, `audit_web.py`) ;
  - `python3 tests/ci_structural.py` doit passer ;
  - accessibilité : le canvas reste décoratif, toutes les actions restent
    disponibles au clavier et aux lecteurs d'écran via des contrôles DOM ;
    `prefers-reduced-motion` = image fixe, aucun tween ; DPR plafonné à 2 ;
  - aucune dépendance npm ajoutée, aucun asset externe, aucune police web,
    zéro appel réseau en mode démo ;
  - fichiers < 500 lignes, fonctions < 50 lignes, zéro duplication.

  Si le Niveau 2 n'est pas atteignable avant le 14/11, livre le Niveau 1
  en prototype autonome jouable ET dis-le explicitement dans le README.
  Ne livre jamais une cinématique en la présentant comme un jeu.

4.3 — UNE SEULE PAGE : la simulation ET le vrai jeu, au même endroit.
  Exigence à part entière, pas un détail d'intégration. Je ne veux ni deux
  onglets, ni deux applications, ni une maquette posée à côté du jeu.

  Sur LA MÊME page, avec la même scène 3D, le même HUD et la même grammaire
  visuelle, il faut deux modes :

  MODE DÉMO (ce qui existe déjà dans G-DESIGN/v5/)
    - le bouton joue la campagne : les 8 étapes, les deux pièges, les
      3 saisons, le bilan ;
    - aucun geste du joueur n'est requis ;
    - c'est ce que la vidéo montre et ce que les juges regardent en premier.

  MODE JEU (à construire)
    - le joueur prend la main sur la MÊME scène : il clique un de ses
      bateaux, puis un banc, et le bateau part vraiment ;
    - tous les leviers de FONCTIONNALITES.md sont atteignables : filet,
      relevé, licence (achat / vente / location), note de dette (achat /
      report / saisie), motion + vote, jachère, réensemencement,
      réclamation, `Next lot` / `End the day` / `Go live`, bilan, charte ;
    - les chiffres affichés sortent du MOTEUR, pas d'un tableau écrit à la
      main dans le JS.

  Le passage d'un mode à l'autre se fait SUR LA PAGE : un seul contrôle
  visible (« Prendre la main » / « Revoir la démo »), sans rechargement,
  sans changer d'URL, sans changer de scène. L'état de la partie est
  conservé dans les deux sens : reprendre la main au milieu de la démo
  continue la même saison ; relancer la démo rejoue la même graine.

  Conséquence technique : le mode démo doit devenir un CAS PARTICULIER du
  mode jeu — une politique automatisée qui pilote le vrai moteur — et non
  l'inverse. Le repo contient déjà exactement ça : `crates/sim/src/policies.rs`
  définit quatre politiques (`passive`, `greedy`, `steward`, `mixed`) et le
  panneau Judges fait du fast-forward sans joueur. La démo doit être une
  politique qui joue devant le spectateur, sur le moteur réel. C'est ce qui
  garantit que la démo et le jeu ne peuvent pas diverger — et c'est un
  argument fort pour les juges : l'IA qui joue est le même code que le moteur.

  Ce que ça interdit :
  - deux sources de vérité (un état simulé en JS + un état moteur) ;
  - une scène 3D décorative posée à côté de l'interface réelle ;
  - un mode démo qui ment sur ce que le jeu fait vraiment.

  Test d'acceptation à faire passer toi-même avant de me montrer :
  1. ouvrir la page → la démo se lance, les dix bateaux convergent sur
     Greybank, la prise par sortie tombe de 16 à 9,8 ;
  2. cliquer « Prendre la main » → la démo s'arrête, MÊME scène, MÊMES
     chiffres, mes deux bateaux deviennent cliquables ;
  3. cliquer Mistral puis The Deeps → le bateau navigue, le quota baisse,
     un lot arrive à la criée, le prix descend, mon or augmente ;
  4. `End the day` → la nuit tombe, le registre s'écrit, ma dette envers la
     mer augmente ;
  5. recharger avec `?seed=7` → la même saison au bit près ;
  6. cliquer « Revoir la démo » → la campagne rejoue la même graine.

4.4 — Matériel technique réutilisable (ne le réécris pas de zéro)
  G-DESIGN/v5/ contient un moteur WebGL1 maison, sans dépendance :
  - `gl.js`       : maths 4x4, constructeur de géométrie (boîte, toit,
                    gable, cylindre/cône, anneau, grille de fenêtres),
                    helpers WebGL (programme, buffer, draw, FBO) ;
  - `shaders.js`  : visages + arêtes, eau (4 vagues, normales analytiques,
                    fresnel, spéculaire, anneaux de bancs, sonar, streak),
                    ciel (zénith/horizon/étoiles), poisson en banc, bloom
                    (2 passes de blur + composite), et les uniforms
                    `uFocus` (projecteur) et `uClip` (disque du diorama) ;
  - `port.js`     : le port complet (quai en pierre avec échelles,
                    pare-battages et bittes, lampadaires, halle de la criée
                    avec horloge, poissonnier, The Gull, conserverie à toit
                    en shed + cheminée, hôtel du conseil avec tour d'horloge,
                    coffre du fonds, grue à treillis, ville sur trois
                    rangées avec église, jetée + phare à faisceau) ;
  - `boat.js`     : le chalutier (coque à tonture sur 6 stations, pavois,
                    préceinte, timonerie vitrée, cheminée, mât radar, mât de
                    charge, potences, treuil, caisses sur pont), le sillage,
                    et la flotte de 10 avec évitement des collisions ;
  - `scene.js`    : renderer, caméra orbitale (souris = regarder, glisser =
                    orbite, molette = zoom), bloom, étiquettes DOM projetées
                    depuis le monde, `sample()` de contrôle ;
  - `run.js`      : la campagne en 8 étapes, l'horloge, le HUD progressif ;
  - `variants.js` : les 6 variantes (palette + arêtes + sonar + diorama +
                    rotation + classe de HUD) et les points focaux par étape.
  Bug connu à ne pas reproduire : n'activer que les attributs réellement
  déclarés par le shader (sinon `enableVertexAttribArray(-1)` annule le draw
  silencieusement — c'est ce qui a fait disparaître la mer pendant un round).

======================================================================
5. RÈGLES, CRITÈRES ET LIVRABLES DU HACKATHON (vérifiés le 11/11)
======================================================================

Dates (UTC) :
- Développement : 2026-11-01T00:00Z → **2026-11-14T23:59Z** (= 15/11 00:59 Paris).
- Jugement : 16 → 18 novembre. Résultats annoncés avant le 2026-11-18T23:59Z.
- Le code écrit depuis l'annonce du 2026-10-19 est éligible (Q-001).

Livrables obligatoires :
1. **Dépôt PUBLIC** avant 2026-11-14T23:59Z. Les juges ne peuvent pas ouvrir
   un dépôt privé. Un dépôt existant est accepté avec une branche dédiée ou
   des tags + une section README qui pointe le diff (Q-003).
2. **Post de démo public sur X**, publié par Gaia elle-même (jamais par toi) :
   il dit que le projet a été construit au NEAR HACKATHON, taggue
   **@NEARProtocol** et **#NEARHackathon** (optionnel : @NearLegion,
   @NearBuilders), et joint une **vidéo** ou des captures. Une vidéo est
   fortement préférée : les captures ne suffisent pas quand les juges ne
   peuvent pas ouvrir la démo (Q-012). Tu peux rédiger le texte, Gaia poste.
3. **Une seule soumission** par projet, via POST
   https://nearhackathon.com/api/applications (ou le formulaire
   https://nearhackathon.com/#apply). Non modifiable après envoi : les
   corrections passent par https://nearhackathon.com/request-changes.
   Champs : requestId (UUID réutilisé en cas de retry), projectName,
   leadName, email, size (`1` | `2 - 4` | `4 - 6` | `6 - 8` | `8+`),
   tracks (ici `games`), nearAddress (mainnet, fourni par Gaia — ne jamais
   l'inventer), projectUrl, demoUrl, idea (20-2000 caractères), consent.
   **Ne jamais ajouter d'autre champ** : `website` est un piège à spam qui
   fait rejeter la soumission. Ne jamais soumettre sans que Gaia ait validé
   le payload imprimé en entier.

Critères et ce qui compte :
- **Claude Code et Codex font un screening AVANT le jury humain** (Q-017) :
  vérification de reproductibilité, vérification des fonctionnalités,
  rapport structuré, score préliminaire. Les humains décident ; un score IA
  bas ne peut pas rejeter seul. CONSÉQUENCE : le README doit être écrit
  pour un lecteur machine autant qu'humain — « fais X, vois Y », étape par
  étape, sans marketing.
- Jury humain : Illia Polosukhin (NEAR), Mert Mumtaz (Helius), Eddy
  Lazzarin (a16z crypto), Avichal Garg (Electric Capital), Kain Warwick
  (Synthetix/Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni
  (cyber•Fund).
- Track `games` — intitulé exact : « Build NPCs with wallets, player-owned
  markets and economies that evolve without a dev patch. **Judged on the
  game loop, not the token** — bonus if players never notice the chain. »
  Hints : AGENT NPCs, SOCIAL LOGIN, NEAR INTENTS, NEP-245.
  → Traduction pour nous : la boucle de jeu et l'économie qui évolue toute
    seule priment sur le jeton. Le fait que les NPC soient des agents avec
    une règle lisible, que le login soit un simple email (relais sponsorisé,
    pas de wallet, pas de gas) et que l'économie tourne sans patch sont nos
    meilleurs arguments. Le contrat NEP-245 existe déjà.
- Le README doit nommer les technos NEAR utilisées (Q-005 : les librairies,
  templates et le code IA sont autorisés, mais doivent être listés ; notre
  moteur WebGL est écrit à la main, zéro dépendance — c'est un argument).
- Q-002 : un produit préexistant est accepté, seule l'intégration NEAR
  faite dans la fenêtre est jugée — à divulguer dans le README.
- Q-010 : un projet testnet-only est éligible dans tous les tracks.
- Q-014 : ajouter un LICENSE (le repo annonce déjà Apache-2.0 / MIT).
- Q-015 : une personne peut soumettre au maximum 2 projets indépendants et
  divulgués (chaque README nomme l'autre projet). Gaia et Baptiste ont
  d'autres projets NEAR en cours : vérifie la divulgation croisée.
- Prix : pool 250 000 $. Grand prix 55 000 $ (1). Par track : 1er 10 000 $,
  2e 3 000 $, 3e 2 000 $ (13 tracks). Payé en NEAR sur le compte fourni.
- Démo hébergée : un plus. Si tu comptes sur tidewater-play.vercel.app,
  il doit rester en ligne au moins jusqu'au 2026-11-18, idéalement 2026-11-25.

Ce que tu ne dois JAMAIS faire sans Gaia : rendre le dépôt public, pousser,
poster sur X, soumettre, signer une transaction, déployer sur mainnet,
commiter un secret. Propose, attends le feu vert explicite.

======================================================================
6. SOURCES À RELIRE AVANT DE SOUMETTRE (elles peuvent changer)
======================================================================
- https://nearhackathon.com/HACKATHON.md   (la référence vivante, à relire)
- https://www.near.org/blog/near-hackathon-build-beyond-boundaries
- https://nearhackathon.com/#tracks et https://nearhackathon.com/#apply
- Exemple de prompt du track games :
  https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/09-games.md

======================================================================
7. MÉTHODE DE TRAVAIL (importante, les rounds précédents ont échoué ici)
======================================================================

- Itère VISUELLEMENT avec moi : une passe = une capture ou une ouverture
  dans le navigateur + ma réponse + ta correction. Ne produis PAS six
  directions en parallèle : une seule direction, la variante diorama
  modernisée.
- N'ajoute pas de détail avant que la COMPOSITION soit juste. Les rounds
  précédents ont empilé du détail sur une composition jamais validée.
- Time-boxe chaque passe. Au-delà de 4-5 rounds sans convergence sur le
  même point, propose un re-brief plutôt qu'un round de plus.
- Propose toujours : options + ta recommandation + la prochaine action.
  Jamais de question ouverte sans proposition.
- Versions datées V7, V8… dans G-DESIGN/DESIGN.md, jamais écrasées, avec un
  changelog à chaque round. Feedback attendu de moi : Garder / Changer
  (deltas numérotés) / Essayer.
- Si tu ne sais pas : case vide ou signale. N'invente jamais un chiffre,
  une date, un montant, un prix, une URL, ni une adresse NEAR.

======================================================================
8. DÉFINITION DE FINI
======================================================================

- [ ] On comprend en 3 secondes de quoi il s'agit (port de pêche, mer
      partagée, économie réelle).
- [ ] Le design est manifestement plus moderne que G-DESIGN/v5 : hiérarchie
      nette, vide assumé, typographie tranchée, matières et lumière crédibles.
- [ ] **On peut vraiment jouer** : au minimum le Niveau 1 de la section 4.2,
      idéalement branché sur le moteur wasm du repo.
- [ ] **Une seule page** : la démo et le jeu réel partagent la même scène,
      le même HUD et la même URL ; le passage d'un mode à l'autre se fait
      sans rechargement ; les 6 étapes du test d'acceptation 4.3 passent.
- [ ] **Une seule source de vérité** : aucun chiffre du HUD n'est écrit en
      dur dans le JS ; la démo est une politique qui pilote le moteur.
- [ ] Toutes les fonctionnalités de FONCTIONNALITES.md sont atteignables
      dans l'interface (pas seulement racontées).
- [ ] Valeur nette et dette envers la mer visibles en permanence.
- [ ] Les 3 saisons et le temps écoulé sont lisibles ; les deux pièges se
      voient ; l'arbitrage court/moyen/long terme est matérialisé.
- [ ] Benchmarks affichés avec les chiffres réels de docs/BALANCE.md.
- [ ] CI verte, `tests/ci_structural.py` OK, e2e OK, `npm run build:offline`
      produit un bundle sans appel réseau.
- [ ] README réécrit pour les juges humains ET pour Claude Code / Codex :
      « fais X, vois Y », les technos NEAR nommées, la divulgation Q-002 et
      Q-015, le LICENSE.
- [ ] Un script de démo vidéo est prêt (Gaia enregistre et poste sur X).
- [ ] Le payload de soumission est imprimé et validé par Gaia — jamais
      envoyé par toi.

======================================================================
9. COMMANDES DESIGN (vocabulaire fixe)
======================================================================
/planches N · /variantes · /delta · /cible <écran> · /compare A B · /lock

Fin de session : mets à jour ta section `## Claude` dans
G-DESIGN/STATUS.md, termine par un résumé + un prompt relais prêt à coller,
et rappelle les six commandes. Discussions en français, textes du jeu en
anglais.
```

---

## Note pour Gaia (hors prompt)

- Le serveur de prévisualisation : `python HACKATONS\2026-11-15-near\Games\bankkeeper\G-DESIGN\v5\serve.py 8790`
  (racine servie = `G-DESIGN/`, cache désactivé). Il tourne déjà en ce moment.
- Variantes disponibles : `?v=abyss|blueprint|bone|ember|signal|diorama`,
  `?step=<n>` pour sauter à une étape, `?diag=1` pour le readback de contrôle.
- Deux points que le prompt tranche explicitement, à valider de ton côté :
  1. **Claude est autorisée à modifier le code du repo** (section 4.2). C'est
     une entorse à la répartition habituelle (opencode = code, Claude =
     design). Sans ça, « vraiment jouer » est impossible.
  2. **La branche** : le travail est sur `design/v5-harbour`. Rien n'est
     commité ni poussé. Le dépôt doit devenir public avant le 14/11 23:59 UTC
     — c'est une action humaine.
- Le repo est celui de Baptiste (`BaptisteFaisy/bankkeeper`) : préviens-le
  avant que Claude pousse du code dans `web/`.
