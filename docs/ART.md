# Direction artistique — Bankkeeper, jeu 2D

> Écrit le 10/11/2026. Ce document fait foi pour toute la refonte graphique.
> Il est contraignant : la CI (`tests/ci_structural.py`) vérifie la palette,
> et le jeu doit rester 100 % hors-ligne, sans dépendance npm ajoutée.

## Le style

**Plat, maritime, charpenté.** Des silhouettes nettes, des aplats, aucune
dégradé, aucun effet « verre » (règle déjà en vigueur dans `SeaMap.tsx`).
On dirait un jeu de plateau animé vu du dessus, pas un tableau de bord.

- **Palette** : uniquement les jetons de `web/src/styles.css` (`--bg`, `--panel`,
  `--panel-2`, `--sea`, `--line`, `--ink`, `--muted`, `--buoy`, `--gold`,
  `--kelp`, `--sand`, `--red`) **plus des teintes plus sombres ou plus claires
  de ces mêmes tons**. Pas de nouvelle couleur.
- **Grain** : formes géométriques simples (coques, voiles, caisses, mouettes,
  vagues), contours francs, pas d'ombre portée floue.
- **Aucun asset externe** : tout est dessiné procéduralement en canvas 2D
  (pas de PNG, pas de police web, pas de son).

## La scène (le cœur du jeu)

La carte (`SEA CHART`, 760 × 440 en coordonnées logiques, DPR plafonné à 2)
devient une **scène vivante** :

1. **La mer** : deux nappes de vagues lentes (sinus décalés) sur `--sea`,
   plus claires au large des hauts-fonds, plus sombres dans `The Deeps`.
   Une ligne de marée marque le bord de côte.
2. **Les zones** : la densité de poisson se lit **sans chiffre** — des
   silhouettes de poissons éparses, plus nombreuses quand le stock est haut,
   qui disparaissent quand la zone s'épuise. Le nom de zone reste en petit.
3. **Les bateaux** : coque + mât + voile, teintés par capitaine (joueur =
   `--buoy`). Un bateau en mer **laisse un sillage** ; un bateau qui rentre
   **navigue** vers le quai (tween), pas un téléportement.
4. **Le débarquement** : à chaque lot, une **caisse décrit un arc** du bateau
   vers le quai, avec une éclaboussure à l'amerrissage du bateau.
5. **Le quai** : trois étals de marchands ; l'étal qui achète **s'allume**
   (`--gold`) pendant l'enchère ; une mouette tourne au-dessus du lot en cours.
6. **Le jour** : un cadran soleil/lune en coin montre la phase (aube, jour,
   soir) ; un voile de teinte chaude à l'aube, froide au soir — teintes de la
   palette seulement.
7. **Le fonds du port** : un coffre sur le quai dont le niveau monte avec la
   redevance ; il **s'ouvre** quand une motion paie.
8. **La dette envers la mer** : la zone surexploitée prend une teinte terne
   (`--muted` tiré vers le sombre) et une petite ancre brisée s'affiche tant
   que la dette de la zone n'est pas payée.

## Les règles de mouvement

- **Un événement = un tween**, jamais une boucle infinie décorative coûteuse :
  débarquement, achat, vote, fermeture de zone.
- Le fond (vagues, marée) tourne à ~30 i/s ; les tweens à 60 i/s ; tout se met
  en pause onglet caché (`document.visibilityState`).
- `prefers-reduced-motion` : une image fixe, repeinte seulement quand l'état
  change. Aucun tween.
- Une seule boucle `requestAnimationFrame` pour toute la scène ; zéro
  allocation par image ; les sprites sont mis en cache hors-écran.

## Le HUD (autour de la scène)

Les panneaux texte deviennent des **instruments** :

- **Criée** : le prix descend comme une barre qui chute, avec le montant en
  chiffres qui comptent à rebours ; l'acheteur s'affiche avec son étal.
- **Fonds du port** : le coffre de la scène, doublé d'une jauge chiffrée.
- **Jour / saison** : le cadran, plus « Week 1 · Mon » en petit dessous.
- **Registre** : les lignes « qui a pris quoi » restent du texte (c'est un
  relevé, pas un jouet) mais avec des barres horizontales proportionnelles.

## Accessibilité et tests (non négociable)

- Le canvas est **informatif et décoratif** : toutes les actions restent
  disponibles au clavier et aux lecteurs d'écran via des contrôles DOM
  (liste de bateaux, boutons de zone) — la scène ne doit jamais être le seul
  moyen d'agir.
- Les sélecteurs utilisés par `tests/e2e_offline.py`, `tests/e2e_pwa.py`,
  `tests/e2e_tutorial.py` et `tests/audit_web.py` sont **préservés**.
- Fichiers < 500 lignes, fonctions < 50 lignes, zéro duplication : le rendu
  est découpé en modules (`scene/sea.ts`, `scene/boats.ts`, `scene/fx.ts`,
  `scene/sprites.ts`, `scene/layout.ts`, …).

## Ordre de livraison

1. **Vague 1 (maintenant)** : le moteur de scène en modules neufs
   (`web/src/scene/*`) + une page autonome `web/scene-preview.html` qui rend la
   scène sur un état fictif (visible sans toucher à `App.tsx`), + les
   composants HUD neufs (`web/src/components/hud/*`) avec leur page
   `web/hud-preview.html`. Aucun fichier existant modifié.
2. **Vague 2 (après fusion des correctifs web)** : intégration — `SeaMap.tsx`
   devient un habillage de la scène, `App.tsx` passe en disposition « scène +
   HUD », contrôles clavier sur la scène, e2e mis à jour, redéploiement.
