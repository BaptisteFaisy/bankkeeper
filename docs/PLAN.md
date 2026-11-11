# Bankkeeper — état et plan

> Mis à jour le **11 novembre 2026 à 11:00 (Europe/Paris)** par b, sur
> `main` = **`9c5ae61`** (PR #83, déploiement public de la page de preuves).
> Ce document dit **ce qui est fait et prouvé**, **ce qui reste** (dans
> l'ordre), et **l'historique des décisions et horizons**. Rien ici n'est une
> intention : chaque ligne « fait » renvoie à une preuve vérifiée.

## 1. Ce qui est fait, et prouvé (au 11/11/2026, commit `9c5ae61`)

| Domaine | État | Preuve vérifiable |
|---|---|---|
| Suite Rust complète | **270 tests passés, 0 échec**, 4 ignorés volontaires (D11/D12/D14/D15) | `cargo test --workspace` |
| Gardes structurels | **178 fichiers** < 500 lignes, toute fonction < 50, palette et goût propres | `python3 tests/ci_structural.py` |
| **Les 5 barreaux du SPINE** | **Tous mergés et exposés** : 1 Voir (`Who took what`), 2 Payer (redevance + fonds), 3 Gouverner (motion financée + preuve par vote), 4 Hériter (dette envers la mer), 5 Réparer (jachère collective + contentieux, PR #76) | `crates/sim/src/{attribution,fund,govern,sea,dispute}.rs` ; `docs/DEBT.md`, `docs/FALLOW.md` |
| **Contrat NEP-245** | 3 bloquants (PR #42) + **8 majeurs** corrigés (PR #80) ; 14 preuves d'audit en CI (PR #81) ; **433 552 o** wasm, 38 fonctions ABI | `contracts/tidewater/`, `docs/AUDIT-CONTRACT.md`, `cargo near build non-reproducible-wasm` |
| **Déploiement testnet** | **Déployé sur `bankkeeper.testnet`** (`code_hash` `b3atbgna5Lvi1GGqGz8ecP1wHBwBTC1Pe93VAhqEPZj`, ~8,469 NEAR) ; **75 transactions réelles** confirmées, dont le conseil (`passed: true`, quota `70 → 80`) | `docs/deployments.md`, `docs/e2e-testnet.log`, `docs/TESTNET-RUN.md` |
| **Jeu 2D + client web** | Scène canvas intégrée (PR #68 + PR #78), accessibilité (`role="application"`, `tabIndex=0`, flèches + Entrée, `aria-live`, `prefers-reduced-motion`) ; `E_IMPORT` + **8 majeurs + 3 mineurs** corrigés (PR #75) ; **14 contrôles verts, 0 défaut** | `web/src/scene/*`, `tests/audit_web.py`, `tests/e2e_offline.py` (`0` erreur console, `0` `/api/`) |
| **Équilibrage** | 4 curseurs calibrés sur 50 graines × 4 politiques × 3 saisons (PR #69) ; verrouillé par 2 tests de dérive | `docs/BALANCE.md`, `docs/balance-50.json` (md5 `a54e287cddfe613c1484f3ca30cd3f40`), `make balance` |
| **Site public unique** | `https://tidewater-play.vercel.app` (HTTP 200), `/scene-preview.html` (HTTP 200), `/proofs.html` (HTTP 200, **live sur `bankkeeper.testnet`**) ; `engine.wasm` = **917 429 o** (`9c5ae61`) | `curl`, `tests/e2e_proofs.py` (`75 / 75 TRANSACTIONS CONFIRMÉES`, `mt_supply(3)` = `20`) |
| **Login réel (sandbox)** | Étude tranchée + **relayeur sponsorisé prouvé sur `near-sandbox`** (PR #71) : email → compte déterministe → `buy_licence` signée sans popup ni gas | `docs/AUTH.md`, `tests/relay_sponsor.py` (tx `GwfdY7nmdTkd5817Ye7XhRN86aJmAr3Vd5c7vNzju5tm`) |
| **Dossier juges** | Conformité ligne à ligne, 3 parcours chronométrés sans vidéo, texte de soumission | `docs/COMPLIANCE.md`, `docs/DEMO-JUGES.md`, `docs/SUBMISSION.md` |

## 2. Ce qui reste à faire, dans l'ordre

1. **Brancher la démo web publique sur `bankkeeper.testnet` et sur le relayeur sponsorisé** :
   - appliquer le diff client écrit dans `docs/AUTH.md` § 7 (`web/src/App.tsx`, `server/relay.py`) et héberger le relayeur avec ses garde-fous (`scripts/relayer/src/guard.mjs`), ou activer `VITE_CHAIN=1` sur une instance dédiée.
2. **Compléter les manques UI mineurs** relevés dans `docs/COMPLIANCE.md` :
   - exposer le bouton de renflouement (`refloat`, TW-N-52) et l'état visuel « étal fermé » (TW-N-53) dans `web/src/scene/bridge.ts` ;
   - renvoyer `fund` dans `fastforward_reply` (`crates/wasm/src/lib.rs`) pour que la ligne `Port fund` du panneau `Judges` cesse d'afficher `—` ;
   - lire la longueur réelle de saison (`weeksPerSeason`) dans l'aperçu de motion au lieu de `SEASON_WEEKS = 4` (`web/src/types.ts:299`) ;
   - rafraîchir le libellé « 268 tests » dans `web/src/proofs/Panels.tsx:114` (270 aujourd'hui).
3. **Fermer les 4 défauts mineurs du contrat** encore `#[ignore]` dans `docs/AUDIT-CONTRACT.md` (D11 transfert de 0, D12 `resolve_council` hors session, D14 deux refus « owner only », D15 `assign_boat` change le filet en mer), puis redéployer si nécessaire.
4. **Trancher les questions de game design** listées en fin de `docs/BALANCE.md` (seuil 5 vs 7 bateaux, dette de port vs dette joueur, capitalisation du prix des licences, malle du petit maillage au bilan).

---

## 3. Historique — ce qui a été décidé et livré (conservé)

### Ce qui était bloquant le 10/11 et a été résolu

- **Intégration des 10 branches initiales** (`balance`, `market`, `lease`, `chronicle`, `favours`, `proofs`, `pwa`, `tutorial`, `rung1`, `rung2`) : mergées.
- **Défauts d'audit** : les 6 défauts moteur (`crates/sim/tests/audit.rs`) corrigés (PR #43, #44) ; les 3 bloquants + 8 majeurs du contrat corrigés (PR #42, #80) ; le bloquant `E_IMPORT` + 8 majeurs + 3 mineurs web corrigés (PR #75).
- **Barreaux 3, 4 et 5** : motion financée (PR #56), dette envers la mer (PR #61), jachère collective et contentieux (PR #76) — tous mergés.
- **Déploiement testnet** : bloqué le 10/11 par le faucet (`429`), débloqué et prouvé le 11/11 sous `bankkeeper.testnet` (PR #82, #83).
- **Doublon Vercel** : `tidewater-demo` supprimé ; `https://tidewater-play.vercel.app` est le lien canonique unique (PR #60).
- **Vidéo de soumission** : annulée par décision explicite du propriétaire — la démo passe par le lien public, le fast-forward et `/proofs.html`.

### L'axe et les trois phrases (`docs/SPINE.md`)

> L'idée de base : *ce que je prends aujourd'hui coûte à quelqu'un d'autre, et à
> demain.* Tout le reste est une manière de répondre.

| Barreau | Ce qu'il ajoute | État |
|---|---|---|
| 1. **Voir** | l'attribution : `Greybank −1 200 caisses : toi 46 %, Brandt 31 %` | **fait** (`attribution.rs`) |
| 2. **Payer** | redevance de débarquement → fonds du port | **fait** (`fund.rs`) |
| 3. **Gouverner** | toute motion votée avec son financement | **fait** (PR #56) |
| 4. **Hériter** | la dette envers la mer, payée en jachère ou réensemencement | **fait** (PR #61) |
| 5. **Réparer** | jachère collective + contentieux | **fait** (PR #76) |

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

## 4. Décisions tranchées (et questions ouvertes)

1. **Testnet** : **`bankkeeper.testnet` retenu** et déployé (11/11/2026).
2. **Barreau 4** : dette envers la mer comptée en **caisses**, conversion en or
   au moment du réensemencement (`docs/DEBT.md`).
3. **Fiction** : le jeu reste un **port de pêche** (`docs/DECISIONS.md`).
4. **Vidéo** : **aucune vidéo** — démo live + fast-forward + `/proofs.html`.
5. **Authentification** : voie du **relayeur sponsorisé** retenue et prouvée
   sur sandbox (`docs/AUTH.md`), couture FastAuth conservée dans `NearSession`.
6. **Ouvert** : date de soumission finale à confirmer ; renommage interne des
   crates/clés `tidewater` → `bankkeeper` différé après le gel.
