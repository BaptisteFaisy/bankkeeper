# Bankkeeper — état et plan

> **Mise à jour du 10 novembre 2026, 21:40 (Europe/Paris)**, sur `main` =
> **`11f7a0d`**. Ce document dit **ce qui est fait et vérifié**, **ce qui
> reste** (dans l'ordre), et **comment l'idée continue**. Rien ici n'est une
> intention : chaque ligne « fait » renvoie à une preuve.
>
> *Historique conservé* : les décisions des sections 3 et 4 sont celles du
> 10/11 à 14:50 ; elles n'ont pas été réécrites. Les sections 1 et 2, elles,
> datent de ce jour et remplacent l'état du 10/11 à 14:50.

## 1. Ce qui est fait, et vérifié

Toutes les commandes ci-dessous ont été lancées le 10/11 sur `11f7a0d`.

| Domaine | État | Preuve |
|---|---|---|
| Moteur (règles + sim + wasm) | **236 tests verts, 0 échec** | `cargo test --workspace` (rejoué sur `11f7a0d`) |
| Contrat NEP-245 | compile en wasm, **419 648 o**, ABI embarquée, **31 tests** | `cargo near build non-reproducible-wasm` ; sha256 `48ae95ee…689b` ; `cargo test -p tidewater` |
| Moteur wasm servi en prod | 875 666 o, sha256 `ce564f29…29392` | `curl -s https://tidewater-play.vercel.app/engine.wasm \| sha256sum` — identique au build local |
| Jeu hors-ligne | moteur wasm, 0 serveur, **0 appel `/api/`**, 0 erreur console | `python3 tests/e2e_offline.py` → `OK: offline journey clean` |
| PWA | service worker contrôlant la page, réouverture serveur mort | `python3 tests/e2e_pwa.py` → `OK: installed, controlled the page, and reopened it with the server dead.` |
| Page de preuves | « pas encore déployé », lien de rejeu seeded, 0 erreur console | `python3 tests/e2e_proofs.py` → `OK: proofs page clean…` |
| Garde de forme | 136 fichiers < 500 lignes, fonctions < 50 | `python3 tests/ci_structural.py` → `OK` |
| Horloge live | 1 lot / 30 s, 10 lots = 5 min / jour | `Config::seconds_per_lot: 30` ; `DEMO_TRIPS = 1` ; vérifié au navigateur |
| Campagne 3 saisons | capital reporté, la mer garde ce qu'elle a perdu | `Config::campaign_seasons: 3` ; `crates/sim/tests/chronicle.rs` |
| Persistance + lien de saison | `?seed=&weeks=`, reprise après reload | `web/src/persistence.ts`, `web/src/boot.ts` |
| **Barreau 1 — attribution** | `Who took what` : prise, prise durable, part de chaque capitaine | `crates/sim/src/attribution.rs` ; mesuré : *Greybank — Brandt 49,7 %, You 25,2 %, Hale 25,2 %* |
| **Barreau 2 — redevance + fonds** | levy prélevé sur chaque lot, solde dans un compte séparé | `crates/sim/src/fund.rs` ; mesuré : `fund: {"balance": 445.6, "paid_in": 445.6, "paid_out": 0.0}` (7 j, 0,4 or/caisse) |
| **Barreau 3 — motion financée** | motion votée avec son argent ; calcul de chaque vote affiché | `crates/sim/src/govern.rs` ; mesuré au navigateur : `Tally: 20 for, 0 against; the motion passes.` |
| **Barreau 4 — dette envers la mer** | passif en caisses, reporté, affiché au bilan | `crates/sim/src/sea.rs`, `crates/sim/tests/sea_debt.rs` ; mesuré : `Debt to the sea · 906 crates` |
| Moteur graphique 2D | moteur canvas, sprites et HUD | `web/src/scene/*`, `docs/ART.md` (PR #68) — **pas encore intégré à l'écran de jeu** |
| Conformité au track | grille exigence par exigence, avec preuves | `docs/COMPLIANCE.md` |
| Dossier juges | trois parcours chronométrés, sans vidéo | `docs/DEMO-JUGES.md` |
| Nom | dépôt **`BaptisteFaisy/bankkeeper`** | GitHub |

**Lien public unique** : <https://tidewater-play.vercel.app> (déployé le
10/11 à 20:23 sur `b0869ee` ; empreinte et vérifications dans
[`docs/deployments.md`](deployments.md)). **Attention** : `main` a avancé
depuis (`11f7a0d`, moteur 2D) — le moteur Rust servi est identique (même
sha256), mais le front public n'a pas encore été redéployé sur `11f7a0d`.

## 2. Ce qui reste à faire, dans l'ordre

### Immédiat

1. **Déployer le contrat sur le testnet.** Le faucet public répond `429`
   (mesuré le 10/11 à 20:19 UTC : `x-ratelimit-limit: 10`,
   `x-ratelimit-remaining: 0`, `retry-after: 22130`, réouverture à
   **2026-11-11 02:27:52 UTC**, soit 03:27 Paris). Un job automatique est
   armé pour 03:40 sous `bankkeeper.testnet`. Puis rejouer
   `node scripts/testnet/e2e.mjs` et écrire les hash dans
   `docs/deployments.md`.
2. **Brancher le jeu sur les tokens.** C'est le seul 🟡 du track qui
   reste vraiment ouvert : le contrat tient les licences, les notes de
   dette et les votes ; le jeu joué tourne encore entièrement hors chaîne.
3. **Fermer les 8 majeurs du client web** (branche `feat/fix-web`,
   non mergée) et le bloquant `E_IMPORT`.
4. **Fermer les 6 majeurs du contrat** restants : droits de l'acte de
   bateau rattachés au token, note de dette cessible, poids de vote figé,
   indemnités versées aux seuls votants « pour », plafond de 8 licences,
   dépôt de storage.
5. **Authentification réelle** : FastAuth ou relayeur sponsor. La
   expérience est déjà conforme (email, pas de wallet, pas de gas) ;
   l'identité ne l'est pas.

### Défauts d'affichage relevés le 10/11 (à corriger, aucun n'est un mensonge)

- Le solde du **fonds du port** n'est pas rendu à l'écran : la ligne
  `Port fund · balance … · in … · out …` du panneau `Judges` reste à `—`
  (le payload de fast-forward ne porte pas le fonds). Le solde se lit dans
  le registre (lignes `Levy:`) et dans le moteur (`sim state` → `fund`).
- L'aperçu du coût d'une motion calcule la facture sur **4 semaines**
  (`SEASON_WEEKS = 4`, `web/src/types.ts:285`) alors que le conseil paie sur
  la longueur réelle de la saison. Vérifié sur `?weeks=1` : l'aperçu
  annonce `for 4 weeks`, le procès-verbal écrit `for 1 weeks`.
- Le **renflouement** (TW-N-52) n'a pas de bouton dans le client web :
  la commande `sim refloat` existe, l'UI ne l'expose pas.
- Le **paiement de la dette** (`pay_in_fallow`, `pay_in_reseed`) n'est câblé
  qu'en CLI.
- L'arrêt d'un acheteur ne se lit pas sur la carte (TW-N-53) : il se lit
  dans le tableau `Judges`.

### Ensuite

6. **Barreau 5** : jachère collective votée et contentieux (une réclamation
   par saison). C'est ce qui rend le jeu *juste* plutôt que seulement
   lucide.
7. **Équilibrage** avec le harnais (`make balance`) : 50 graines ×
   4 politiques, puis réglage des quatre curseurs qui comptent (repousse,
   part prise par sortie, redevance, seuil de jachère).
8. **Redéployer le front public** depuis `main` quand le moteur 2D sera
   intégré, et mettre `docs/deployments.md` à jour.
9. **Corriger `docs/deployments.md`** : il annonce « 412 350 octets » pour
   le wasm du contrat, alors que le build vérifié fait 419 648 octets
   (le contrat a changé au commit `7b2c542`).
10. **Soumission** : README de présentation à jour, page `/proofs.html`
    branchée sur le contrat déployé, dossier juges prêt
    (`docs/DEMO-JUGES.md`). **Pas de vidéo** : décision du propriétaire le
    10/11, la démo passe par le lien public, le fast-forward et la page de
    preuves. **Date d'échéance à confirmer** — 14/11 18:00 UTC était
    l'échéance d'un autre track.

## 3. Comment l'idée continue

Trois documents, un seul axe : **`docs/SPINE.md`** est le plan de référence.

> L'idée de base : *ce que je prends aujourd'hui coûte à quelqu'un d'autre, et à
> demain.* Tout le reste est une manière de répondre.

**La colonne** — cinq barreaux qui s'empilent :

| Barreau | Ce qu'il ajoute | État |
|---|---|---|
| 1. **Voir** | l'attribution : `Greybank −1 200 caisses : toi 46 %, Brandt 31 %` | **fait** (PR #38) |
| 2. **Payer** | redevance de débarquement → fonds du port | **fait** (PR #39) |
| 3. **Gouverner** | toute motion votée avec son financement | **fait** (PR #56, `809d71e`) |
| 4. **Hériter** | la dette envers la mer, payée en jachère | **fait** (PR #61, `ab5566c`) |
| 5. **Réparer** | jachère collective + contentieux | **à faire** |

**Ce que la colonne absorbe** : la criée commune devient le prix après
redevance ; la chronique devient le registre de la dette ; la science devient un
service payé par le fonds ; les habitants deviennent les ayants droit du fonds.
On n'ajoute pas de systèmes, on **donne un ordre**.

**Le deuxième horizon** (`docs/VISION.md`) — après les cinq barreaux :
les gens du port comme second score (non monétaire), gagner en devenant rentier
(et que le bilan le dise), la science qui se ment, le banc qui ne s'arrête pas
au môle (deux ports, un stock), le basculement d'écosystème, la politique
asynchrone entre joueurs.

### Les trois phrases que le jeu doit pouvoir dire

1. « Mes prises ont fait baisser le prix payé à tout le monde pendant trois
   jours. » — l'externalité, humaine.
2. « La règle que j'ai fait voter en saison 2 tient toujours. » — l'institution.
3. « Vous laissez le registre le plus riche et le port le plus vide. » — le
   verdict, jamais prononcé.

## 4. Décisions à prendre

1. **Date de soumission** : à confirmer (14/11 18:00 UTC ?).
2. **Testnet** : on garde `tidewater26.testnet` comme compte public, ou on le
   renomme `bankkeeper.testnet` pour la cohérence de marque ?
3. **Renommage interne** (crates, tokens, clés de stockage) : après le gel, ou
   jamais ?
4. **Barreau 4** : la dette envers la mer en caisses (lisible), avec conversion
   en or au moment de payer — tu confirmes ?
5. **Vidéo de démo** : **annulée** par le propriétaire le 10/11 à 18:26. La
   démonstration passe par le lien public, le fast-forward et `/proofs.html`.
   Ne pas relancer ce chantier.
