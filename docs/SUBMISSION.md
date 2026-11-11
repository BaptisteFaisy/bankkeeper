# Soumission — track *Games With Real Economies*

> Le texte ci-dessous est **prêt à coller** dans le formulaire de soumission.
> Le pitch fait ~150 mots (compté le 11/11/2026) ; les liens, les preuves
> on-chain et les trois phrases du jeu suivent. Écrit sur `main` = `9c5ae61`.
> **Aucune vidéo** n'est livrée ni promise : la démonstration est le lien
> public, le fast-forward et la page de preuves.

---

## Pitch (~150 mots, anglais — la langue du jury)

> **Tidewater** is a fishing port where ten captains draw on three banks that
> belong to nobody. What you land today lowers the price everyone is paid
> tomorrow, and the stock you leave behind is the port's inheritance.
>
> The game runs entirely in your browser: a Rust engine compiled to
> WebAssembly, zero servers, zero API calls, deterministic to the bit — same
> seed, same `history_hash`. Ownership lives on NEAR: one NEP-245 contract on
> testnet (`bankkeeper.testnet`) carries gold, fish, licences, boat deeds and
> debt notes, and **75 real transactions** prove the economy, including a
> council vote that moved the quota from 70 to 80 crates per licence.
>
> Five rungs make the externality legible: **see** who took what, **pay** a
> landing levy into a port fund, **govern** with motions that carry their own
> funding, **inherit** a debt owed to the sea, and **repair** it through a
> collective fallow or a claim against the fund.

## Les liens

| Quoi | URL |
|---|---|
| **Le jeu** (aucune installation, aucun wallet) | <https://tidewater-play.vercel.app> |
| **Les preuves** (contrat testnet lu en direct) | <https://tidewater-play.vercel.app/proofs.html> |
| **La scène 2D** (moteur canvas, autonome) | <https://tidewater-play.vercel.app/scene-preview.html> |
| **Le dépôt** | <https://github.com/BaptisteFaisy/bankkeeper> |
| **Le contrat sur l'explorateur** | <https://testnet.nearblocks.io/address/bankkeeper.testnet> |
| **Le guide de démo** (90 s / 5 min / preuves) | [`docs/DEMO-JUGES.md`](DEMO-JUGES.md) |
| **La grille de conformité** | [`docs/COMPLIANCE.md`](COMPLIANCE.md) |

Une saison partageable : <https://tidewater-play.vercel.app/?seed=7&weeks=4>
(même graine, même saison, au bit près).

## Ce qui est prouvé on-chain

- **Un seul contrat NEP-245** pour tous les types d'objets : or (`0`),
  hareng (`1`), morue (`2`), licences (`3`), actes de bateau (`10–19`), notes
  de dette (`100+`), parts (`200+`) — 38 fonctions dans l'ABI.
- **Déployé sur testnet** : `bankkeeper.testnet`, `code_hash`
  `b3atbgna5Lvi1GGqGz8ecP1wHBwBTC1Pe93VAhqEPZj`, `storage_usage` 437 462 o.
  Le wasm reconstruit depuis le dépôt fait 433 552 octets et son sha256
  base58 **est** ce `code_hash` : le binaire publié est reproductible.
- **75 transactions réelles**, 75 hashs distincts, toutes listées dans
  [`docs/deployments.md`](deployments.md) et liées vers l'explorateur par
  `/proofs.html` (`75 / 75 TRANSACTIONS CONFIRMÉES`).
- **L'économie a vraiment voté** : `propose_rule` → `vote` (une licence, une
  voix) → `cast_npc_votes` → `resolve_council` →
  `CouncilOutcome {proposal_id:1, passed:true, yes_weight:9, no_weight:8}`,
  et `quota_per_licence` relu à **80** dans `get_day`.
- **Les tokens bougent et se relisent** : `mt_supply(3)` = `20` (offre fixe),
  `mt_balance_of` du joueur et du capitaine après un `mt_transfer`,
  `get_loan(100)` avec le joueur comme prêteur après `buy_loan` +
  `forbear_loan`, `get_licence_cap` = `8`.
- **Une connexion sans wallet ni gas est prouvée** : le relayeur sponsorisé
  dérive un compte NEAR d'un email, garde la clé côté serveur (mode `0600`)
  et signe à la place du joueur — `tests/relay_sponsor.py`, PASS le
  11/11/2026, transaction `GwfdY7nmdTkd5817Ye7XhRN86aJmAr3Vd5c7vNzju5tm`
  (chaîne locale `near-sandbox`).

## Les trois phrases que le jeu doit pouvoir dire

1. « Mes prises ont fait baisser le prix payé à tout le monde pendant trois
   jours. » — l'externalité, humaine.
2. « La règle que j'ai fait voter en saison 2 tient toujours. » — l'institution.
3. « Vous laissez le registre le plus riche et le port le plus vide. » — le
   verdict, **jamais prononcé** : le jeu aligne deux chiffres et laisse le
   joueur conclure.

## La ligne honnête sur ce qui reste

Le contrat est déployé, corrigé (3 bloquants et 8 majeurs fermés) et prouvé
par 75 transactions, mais **le jeu joué dans le navigateur ne l'appelle pas
encore** : la démo publique tourne sur le moteur wasm hors chaîne, et le
login par email y reste une session locale — la connexion réelle au compte
NEAR est codée, gardée et prouvée sur `near-sandbox`, elle n'est pas encore
branchée sur le lien public. Tout le détail, exigence par exigence, est dans
[`docs/COMPLIANCE.md`](COMPLIANCE.md).
