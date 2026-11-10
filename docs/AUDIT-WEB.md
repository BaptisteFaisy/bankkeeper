# Audit de l'interface web — Tidewater

Date : 2026-11-10 · Branche : `feat/audit-web` (worktree `/home/baptiste/tmp/tw-audit-web`)
Périmètre : le client web (`web/src/**`) et le comportement joueur, build **hors-ligne**
(`npm run build:offline`, moteur wasm, aucun serveur). **Aucun fichier de production modifié.**

Preuve exécutable : `python3 tests/audit_web.py` — sort en **code 1** tant que les défauts
sont là, et imprime pour chacun : *tenté / attendu / obtenu*. `python3 tests/e2e_offline.py`
reste vert, `python3 tests/ci_structural.py` aussi.

Résultat du jour : **12 défauts** — 1 bloquant, 8 majeurs, 3 mineurs, 0 erreur console.

---

## 1. Tableau des défauts

| # | Sévérité | Défaut | fichier:ligne | Effet pour le joueur | Correctif (2 lignes) |
|---|----------|--------|---------------|----------------------|----------------------|
| A1 | **bloquant** | Une sauvegarde d'une version antérieure tue l'application : `postImport` renvoie `E_IMPORT`, la promesse de `bootHarbour` n'est pas rattrapée | `web/src/boot.ts:24`, `web/src/main.tsx:25` | Écran mort « The harbour engine did not load: E_IMPORT », aucun bouton, aucun moyen de repartir ; le save fautif restant en place, chaque rechargement remeurt | Entourer `bootHarbour()` d'un `try/catch` : sur `E_IMPORT`, archiver le save (`tidewater-game-v1.bad`), `clearSaved()`, `postInit(DEFAULT_SHAPE)` et afficher un toast « sauvegarde illisible, port neuf » |
| A2 | majeur | Un double-clic sur « End the day » ferme **deux** journées (deux `POST /api/day`) | `web/src/components/HeaderControls.tsx:33`, `web/src/actions.ts:24` | Deux jours de pêche consommés d'un geste, quota et stocks entamés sans que le joueur l'ait demandé ; l'horloge saute Mon→Wed | Garde de réentrance dans `mutate` : `if (deps.busy !== null) return null` ou un verrou par libellé ; `disabled={busy}` ne suffit pas, React ne rend pas entre deux clics d'un `dblclick` |
| A3 | majeur | Un double-clic sur « Buy » (licence d'un capitaine) achète **deux** licences | `web/src/components/HarbourPanel.tsx:63`, `web/src/actions.ts:24` | 982 g → 150,4 g et 4 → 6 licences pour un seul clic ; le joueur découvre la dépense après coup | Même verrou en vol que A2 ; côté moteur, refuser un achat identique dans la même fenêtre (≤ 500 ms) ou renvoyer un `Idempotency-Key` |
| A4 | majeur | « End the day » n'arrête pas l'horloge live : 25-30 s plus tard un lot est landé dans la **journée suivante** | `web/src/hooks.ts:212-243` (`useLiveClock`) | Le joueur ferme la journée pour reprendre la main ; le port continue de jouer tout seul dans le jour d'après | Suspendre le runner quand `busy !== null`, et couper `live` (ou re-ramer) après toute fermeture de journée déclenchée à la main |
| A5 | majeur | L'horloge live continue de jouer quand le joueur est **déconnecté** | `web/src/hooks.ts:212`, `web/src/App.tsx:447` | Bourse 480 g → 590 g pendant l'écran de connexion : des lots sont landés sans joueur, et le save les entérine | `logout()` doit faire `setLive(false)` ; `useLiveClock` doit aussi couper quand `session === null` (dépendance sur la session) |
| A6 | majeur | Deux onglets : l'onglet en retard écrase la partie avancée | `web/src/boot.ts:37`, `web/src/persistence.ts:38` | Onglet A joue Mon→Wed, onglet B (ouvert avant) lande deux lots et sauve ; au rechargement A retombe sur Tue : une journée de jeu perdue, sans avertissement | Comparer `savedAt` (déjà écrit, jamais lu) avant `saveGame`, et écouter `storage` pour prévenir « cette partie a bougé dans un autre onglet » |
| A7 | majeur | Ouvrir un lien `?seed=` remplace la partie en cours sans prévenir | `web/src/boot.ts:20` | La partie en cours (370 g) est écrasée par un port neuf à 150 g ; l'autosave entérine la perte, revenir sur `/` ne la rend pas | Si `loadSaved()` existe et diffère, demander confirmation (bouton) avant `postInit` ; garder l'ancien save sous une clé `…-previous` |
| A8 | majeur | La carte de mer n'est pas atteignable au clavier | `web/src/components/SeaMap.tsx:471` | Le `canvas` n'a ni `tabindex` ni `role` ; 16 Tab ne l'atteignent jamais. Un joueur clavier ne peut pas assigner un bateau au chart (contournement : boutons du panneau « Your boats ») | `tabindex=0`, `role="application"` + `aria-label` par zone, flèches pour changer de bateau, Entrée/Espace pour choisir la zone ; ou exposer une liste de boutons superposée |
| A9 | majeur | Les toasts ne sont jamais annoncés (aucune région live) | `web/src/App.tsx:427-430` | `.toast-stack` et `.toast` n'ont que `class` : jour fermé, licence achetée, quota dépensé, erreur — tout le retour de jeu est silencieux pour un lecteur d'écran | `role="status" aria-live="polite"` sur le conteneur (`assertive` pour `toast-error`), et un `aria-label` sur le bouton « Dismiss » |
| B1 | mineur | « Échap » ferme le panneau Judges mais perd le focus | `web/src/App.tsx:452` | Après Échap le focus est sur `BODY` : le Tab suivant repart du haut du document (WCAG 2.4.3) | Mémoriser `document.activeElement` à l'ouverture et le refocaliser à la fermeture (`aria-controls` sur le bouton « Judges ») |
| B2 | mineur | Contraste insuffisant sur les boutons d'action : `#fff6ec` sur `#e0672f` = **3,19:1** | `web/src/styles.css:73` | Libellés de 15 px (13 px pour `.zone-buttons`/`.mesh-row`) sous le seuil AA 4.5:1 : difficile à lire en plein soleil / basse vision | Assombrir le fond en `#b8501f` (≈ 4,9:1) ou passer le texte en `#1a1010` ; garder `--buoy` pour les traits |
| B3 | mineur | Contraste insuffisant sur la tendance `falling` : `--red` sur `--panel` = **3,71:1** | `web/src/styles.css:321` | La seule information « la ressource baisse » est la plus illisible | Éclaircir `--red` en `#e08d7d` (≈ 5,2:1) pour le texte, réserver `#d4705e` aux traits |

Remarques (non bloquantes, hors code exécuté) :

- **Aucun tutoriel dans cette build** : `grep -rni "tutoriel|tutorial|onboard"` ne rend rien dans
  tout le dépôt. Le « tutoriel au premier lancement » annoncé n'existe pas ici — soit il vit sur
  une autre branche, soit c'est un manque de spec. Impossible d'auditer sa navigation clavier.
- `select` n'a pas de règle `:focus-visible` (`styles.css:88` ne couvre que `button`/`input`) :
  l'anneau doré du site est absent sur « Close » du formulaire de motion, l'anneau UA reste.
- **Mode relais uniquement** : `mutate` fait `setBusy(null)` dans `finally` (`actions.ts:33`), donc
  une mutation qui se termine pendant une autre rallume les boutons au milieu du vol. Invisible en
  wasm (les appels sont synchrones), réel derrière le relais.
- `New harbour` depuis l'en-tête ne prévient pas non plus qu'il efface le port en cours (même
  famille que A7), mais le bouton est explicite : laissé en remarque.

---

## 2. Reproduction, clics exacts

Chaque bloc a été joué par `tests/audit_web.py` (profil Chrome neuf, `/tmp`, build hors-ligne).

**A1 — sauvegarde d'une version antérieure**
1. Ouvrir `/`, se connecter (`audit@tide.water`), fermer une journée (pour avoir un save).
2. Console : `localStorage.setItem('tidewater-game-v1', JSON.stringify({savedAt:'x',seed:7,weeks:2,game:{day:0}}))`.
3. Recharger (`F5`).
   → Attendu : port neuf + avertissement. Obtenu : `#root` = « The harbour engine did not load: E_IMPORT », zéro bouton.

**A2 — double-clic sur End the day**
1. Se connecter, noter l'en-tête (`Week 1 · Mon · High`).
2. `ActionChains.double_click` sur « End the day ».
   → Obtenu : toasts `Day 1 ends: 10 landings.` **et** `Day 2 ends: 10 landings.`, en-tête `Week 1 · Wed`.

**A3 — double-clic sur Buy (licence)**
1. Se connecter, « End the day » jusqu'à ~980 g (4 clics).
2. Double-clic sur le « Buy » d'un capitaine (bloc Licences).
   → Obtenu : `yours: 4 → 6`, bourse `982.0g → 150.4g`, toast `Licence bought from hale.×2`.

**A4 — End the day pendant Go live**
1. Se connecter, cliquer « Go live », puis « End the day » (bourse 370 g).
2. Attendre ≤ 30 s sans rien toucher.
   → Obtenu : bourse `370 → 480 g`, quota `240 → 221` : un lot a landé dans la journée suivante.

**A5 — Log out pendant Go live**
1. « Go live », puis « Log out » (écran de connexion), attendre 32 s.
2. Se reconnecter sans recharger.
   → Obtenu : bourse `480 → 590 g` : l'horloge a joué pendant la déconnexion.

**A6 — deux onglets**
1. Onglet A : se connecter, « End the day » (Tue). Ouvrir l'onglet B sur `/` (Tue).
2. A : « End the day » (Wed). B : « Next lot » ×2 (B sauve son état Tue).
3. A : `F5`.
   → Obtenu : A affiche Tue — la journée Wed est perdue.

**A7 — lien `?seed=`**
1. Se connecter, « End the day » (370 g).
2. Naviguer vers `/?seed=99&weeks=4`, puis revenir à `/`.
   → Obtenu : 150 g / Mon ; la partie précédente est définitivement écrasée.

**A8/A9/B1 — clavier et annonces**
1. 16 × `Tab` depuis l'en-tête : le `canvas.sea-canvas` n'est jamais le focus (`tabindex=None`, `role=None`).
2. « End the day » puis inspecter `.toast-stack` / `.toast` : attributs = `["class"]` seulement.
3. Ouvrir « Judges », focus sur « Fast-forward 28 days », `Échap` : `document.activeElement` = `BODY`.

**B2/B3 — contrastes** : calcul WCAG sur la palette de `styles.css` (`tests/audit_web.py`, section contrastes).

---

## 3. Ce qui a été testé et jugé **sain**

- **`localStorage` corrompu** (JSON invalide) : `loadSaved` attrape, le port neuf s'ouvre, zéro erreur console.
- **Reprise au milieu d'une journée** : 2 lots landés, `F5` → bourse et jour conservés à l'identique
  (l'autosave se déclenche à chaque changement de bourse, et `pending`/`lots_landed` sont exportés).
  Rien de perdu ni dupliqué.
- **`prefers-reduced-motion: reduce`** (émulé par CDP) : `matchMedia` à `true`, la partie tourne,
  bloc global `styles.css:325` + `SeaMap`/`AuctionPanel` qui testent `matchMedia`.
- **Fast-forward des Judges** : `running` désactive les deux boutons, pas de double run ; le hash et
  les courbes restent lisibles, aucun `/api/` en hors-ligne.
- **« Sail the next season » en double-clic** : une seule saison ouverte (Season 2 of 3) — le gate du
  moteur tient là où « End the day » ne tient pas.
- **Suivi de quota / jour / saison dans l'en-tête** : cohérent après fermeture de journée, campagne
  affichée (`Season 1 of 3`), bilan et council rendus.
- **Cycle de vie de l'horloge à la fin de saison** : `useLiveClock` coupe `live` quand `seasonOver`
  arrive, et les trois boutons d'horloge sont `disabled` quand `over` — le seul trou est manuel (A4/A5).
- **Focus visible** : `button:focus-visible, input:focus-visible { outline: 2px solid var(--gold) }`
  présent et visible sur tous les boutons du parcours.
- **Erreurs** : 0 entrée console SEVERE sur les 8 scénarios, 0 requête réseau vers `/api/`.

---

## 4. Sortie brute

```
$ python3 tests/audit_web.py ; echo "exit=$?"
```

```
[stockage]
  sain      : save JSON corrompu : le jeu repart d un port neuf, sans erreur console
  DEFECT [bloquant] une sauvegarde d'une version antérieure tue l'application
    fichier : web/src/boot.ts:24 + web/src/main.tsx:25 (postImport -> E_IMPORT non rattrapé)
    tenté   : save d'une version antérieure (game:{day:0}, champs manquants) puis rechargement
    attendu : au pire un port neuf avec un avertissement ; l'ancien save reste récupérable
    obtenu  : page morte : 'The harbour engine did not load: E_IMPORT' ; boutons disponibles : aucun ; le save fautif reste en place, chaque rechargement remourra
[double-end-day]
  DEFECT [majeur] un double-clic sur « End the day » ferme deux journées
    fichier : web/src/components/HeaderControls.tsx:33 + web/src/actions.ts:24 (aucun verrou en vol)
    tenté   : double-clic sur « End the day » depuis Week 1 · Mon · High
    attendu : une seule journée fermée, le second clic ignoré pendant la requête
    obtenu  : deux journées fermées : toasts ['Day 1 ends: 10 landings.', 'Day 2 ends: 10 landings.'], horloge Week 1 · Mon · High -> Week 1 · Wed · High
[double-licence]
  DEFECT [majeur] un double-clic sur « Buy » achète deux licences
    fichier : web/src/components/HarbourPanel.tsx:63 + web/src/actions.ts:24 (aucun verrou en vol)
    tenté   : double-clic sur le « Buy » d'un capitaine (bourse 982.0g, 4 licences)
    attendu : un seul achat ; le second clic attend la réponse
    obtenu  : deux achats : licences 4 -> 6, bourse 982.0g -> 150.4g, toast ['Day 4 ends: 10 landings.', 'Licence bought from hale.×2']
[horloge-live]
  DEFECT [majeur] « End the day » n'arrête pas l'horloge live : la journée suivante se joue toute seule
    fichier : web/src/hooks.ts:212-243 (useLiveClock ne teste ni busy ni la fermeture manuelle)
    tenté   : Go live, puis « End the day » (Week 1 · Tue · Low, bourse 370.0g)
    attendu : les lots de la journée fermée s'arrêtent, la journée suivante attend le joueur
    obtenu  : un lot est landé dans la journée suivante 30s plus tard : bourse 370.0g -> 480.0g, quota Quota left: 240 -> Quota left: 221
  DEFECT [majeur] l'horloge live continue de jouer pendant que le joueur est déconnecté
    fichier : web/src/hooks.ts:212 + web/src/App.tsx:447 (logout ne coupe pas live)
    tenté   : Go live, puis « Log out », attendre 32 s, se reconnecter
    attendu : la sortie de partie arrête l'horloge ; le port ne bouge pas sans joueur
    obtenu  : bourse 480.0g -> 590.0g pendant l'écran de connexion (des lots ont été landés hors jeu)
[deux-onglets]
  DEFECT [majeur] deux onglets ouverts : l'onglet en retard écrase la partie avancée
    fichier : web/src/boot.ts:37 (savedAt jamais comparé) + web/src/persistence.ts:38
    tenté   : onglet A joue (Week 1 · Tue · Low) ; onglet B ouvert avant (Week 1 · Tue · Low) ; A ferme une journée (Week 1 · Wed · High) ; B lande deux lots puis sauve ; rechargement de A
    attendu : le save le plus récent gagne, ou l'onglet en retard est averti et ne sauve pas
    obtenu  : A revient à Week 1 · Tue · Low : la journée jouée après coup est perdue, aucun avertissement
[lien-seed]
  DEFECT [majeur] ouvrir un lien ?seed= remplace la partie en cours sans prévenir
    fichier : web/src/boot.ts:20 (postInit dès que le seed de l'URL diffère)
    tenté   : jouer une journée (bourse 370.0g), puis ouvrir /?seed=99&weeks=4, puis revenir à /
    attendu : demande de confirmation, ou la partie en cours conservée
    obtenu  : port neuf à 150.0g, et de retour sur / la partie vaut 150.0g : la partie précédente est écrasée par l'autosave
[clavier-aria]
  DEFECT [majeur] la carte de mer n'est pas atteignable au clavier
    fichier : web/src/components/SeaMap.tsx:471 (canvas + onClick seulement)
    tenté   : Tab sur 16 éléments depuis l'en-tête
    attendu : la carte se sélectionne au clavier (tabindex=0, Entrée choisit un bateau)
    obtenu  : le canvas n'a ni tabindex ni role ((None, None)) et ne reçoit jamais le focus ; un joueur au clavier doit passer par le panneau « Your boats »
  DEFECT [majeur] les toasts ne sont jamais annoncés (aucune région live)
    fichier : web/src/App.tsx:427-430 (ToastStack) + web/src/styles.css:250
    tenté   : fermer une journée, inspecter .toast-stack et .toast
    attendu : role=status / aria-live=polite : le lecteur d'écran lit la confirmation
    obtenu  : attributs du conteneur : ["class"], du toast : ["class"] — tout le retour de jeu (jour fermé, licence achetée, erreur) reste silencieux
  DEFECT [mineur] Échap ferme le panneau Judges mais perd le focus
    fichier : web/src/App.tsx:452 (onKey ferme sans rendre le focus au bouton Judges)
    tenté   : focus sur « Fast-forward 28 days » dans le panneau, puis Échap
    attendu : le panneau se ferme et le focus revient sur le bouton « Judges »
    obtenu  : focus sur BODY : le prochain Tab repart du début du document (WCAG 2.4.3)
[reduced-motion]
  sain      : prefers-reduced-motion=True : la partie tourne, pas d'animation (bloc global styles.css:325, SeaMap/AuctionPanel testent matchMedia)
[contrastes]
  DEFECT [mineur] contraste insuffisant : le libellé des boutons d'action
    fichier : web/src/styles.css:73
    tenté   : ratio #fff6ec sur #e0672f
    attendu : au moins 4.5:1 pour du texte de 15px (WCAG 1.4.3)
    obtenu  : 3.19:1 — sous le seuil AA
  DEFECT [mineur] contraste insuffisant : la tendance « falling »
    fichier : web/src/styles.css:321
    tenté   : ratio #d4705e sur #163940
    attendu : au moins 4.5:1 pour du texte de 15px (WCAG 1.4.3)
    obtenu  : 3.71:1 — sous le seuil AA

--- defauts : 12 ---
  bloquant (1)
    - une sauvegarde d'une version antérieure tue l'application  [web/src/boot.ts:24 + web/src/main.tsx:25 (postImport -> E_IMPORT non rattrapé)]
  majeur (8)
    - un double-clic sur « End the day » ferme deux journées  [web/src/components/HeaderControls.tsx:33 + web/src/actions.ts:24 (aucun verrou en vol)]
    - un double-clic sur « Buy » achète deux licences  [web/src/components/HarbourPanel.tsx:63 + web/src/actions.ts:24 (aucun verrou en vol)]
    - « End the day » n'arrête pas l'horloge live : la journée suivante se joue toute seule  [web/src/hooks.ts:212-243 (useLiveClock ne teste ni busy ni la fermeture manuelle)]
    - l'horloge live continue de jouer pendant que le joueur est déconnecté  [web/src/hooks.ts:212 + web/src/App.tsx:447 (logout ne coupe pas live)]
    - deux onglets ouverts : l'onglet en retard écrase la partie avancée  [web/src/boot.ts:37 (savedAt jamais comparé) + web/src/persistence.ts:38]
    - ouvrir un lien ?seed= remplace la partie en cours sans prévenir  [web/src/boot.ts:20 (postInit dès que le seed de l'URL diffère)]
    - la carte de mer n'est pas atteignable au clavier  [web/src/components/SeaMap.tsx:471 (canvas + onClick seulement)]
    - les toasts ne sont jamais annoncés (aucune région live)  [web/src/App.tsx:427-430 (ToastStack) + web/src/styles.css:250]
  mineur (3)
    - Échap ferme le panneau Judges mais perd le focus  [web/src/App.tsx:452 (onKey ferme sans rendre le focus au bouton Judges)]
    - contraste insuffisant : le libellé des boutons d'action  [web/src/styles.css:73]
    - contraste insuffisant : la tendance « falling »  [web/src/styles.css:321]
--- console errors: 0 ---
--- jugé sain : 2 ---
  save JSON corrompu : le jeu repart d un port neuf, sans erreur console
  prefers-reduced-motion=True : la partie tourne, pas d'animation (bloc global styles.css:325, SeaMap/AuctionPanel testent matchMedia)
```

## 5. Ordre de correction conseillé

1. **A1** (bloquant) — un joueur qui revient après une mise à jour perd l'application entière.
2. **A2/A3** — une seule garde de réentrance dans `mutate` corrige les deux.
3. **A4/A5** — même fichier (`useLiveClock`) : tester `busy` et `session`, couper après une
   fermeture manuelle. C'est la classe de bugs que le brief redoutait (« Go live qui continue
   pendant une action »).
4. **A6/A7** — la perte silencieuse de partie ; `savedAt` est déjà écrit, il suffit de le lire.
5. **A8/A9/B1/B2/B3** — accessibilité, sans risque fonctionnel.
