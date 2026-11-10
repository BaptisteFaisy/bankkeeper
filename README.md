# Bankkeeper

**Bankkeeper** : le port de pêche et son stock commun. Tu es capitaine dans un
port où tous les bateaux puisent dans les mêmes bancs : ce que chacun prend
aujourd'hui décide de ce qu'il restera demain.

> Le nom vient de là : dans ce jeu, *bank* est à la fois le **banc de poissons**
> que personne ne possède et la **banque** qui pousse à le vider. Le keeper, c'est
> toi. Voir [`docs/NAMING.md`](docs/NAMING.md).

Jeu du hackathon NEAR, track *Games With Real Economies*. Le brief fait
foi : [`tidewater.md`](tidewater.md). Docs : [`docs/`](docs).
Conformité au track, exigence par exigence, avec ce qui manque encore :
[`docs/COMPLIANCE.md`](docs/COMPLIANCE.md). Les règles de prix des marchands
vivent dans un seul fichier : [`crates/rules/src/merchant.rs`](crates/rules/src/merchant.rs).

## Pipeline

File de merge Mergify (rebase, historique linéaire) + balayeur `pr-auto-merge` :
checks requis `ci`, `ci-budget` (jobs ≤ 5 min), `couche0` (garde `## Scope`).

- Runners self-hosted r630 : `r630-near_tidewater-01..NN` (label `near_tidewater-worker`).
- Toute PR porte une section `## Scope` (puces `- `fichier``) listant ses
  fichiers ; les workflows sont des fichiers de garde (`SAMVISION_ALLOW_GUARD_BUMP`).
- Conflits : agent Fireworks ; tests rouges : agent zeroclaw `fw` via `triage-rouge`.
- `main` est protégée (ruleset) : tout passe par PR + file, jamais de push direct.

Preuve pipeline : 2026-11-09T22:18:58Z — balayeur attendu.
Preuve activation Merge Queue : 2026-11-09T23:16:46Z — produit activé sur dashboard, merge par la file attendu.

## Démarrage local

Prérequis : Rust (cargo), Python 3 (stdlib uniquement côté relais),
Node 20+ pour le web.

```sh
# 1. Simu + contrat (vérification Rust)
cargo test --workspace

# 2. Relais : port 8785 en dev, jamais 8775 (live Market Town) ni 8765
PORT=8785 python3 server/relay.py

# 3. Web : http://localhost:5173 (proxy /api -> 8785)
cd web && npm install && npm run dev
```

Tests : ports et états jetables par run, Chrome headless à profil
séparé sous `/tmp`, aucun processus laissé derrière (brief §8).

## Disposition du dépôt

- `crates/rules/` — règles uniques partagées par la simu et le contrat.
- `crates/sim/` — moteur de cycles, NPC, fast-forward, graine.
- `contracts/tidewater/` — contrat NEP-245 (or, poissons, licences,
  bateaux, dettes, parts).
- `server/` — relais HTTP Python (stdlib only).
- `web/` — React + Vite + TS strict, canvas maison.
- `tests/`, `fixtures/` — garde structurelle CI et graines de référence.
- `docs/` — architecture, API, économie, boucle, tutoriel, démo juges, décisions.
- `tidewater.md` — le brief, autorité première.

## Testnet

Le contrat NEP-245 se déploie et se rejoue sur NEAR testnet avec deux
commandes (détail et état courant : [`docs/deployments.md`](docs/deployments.md)) :

```sh
cd contracts/tidewater && cargo near build non-reproducible-wasm
cd ../.. && node scripts/testnet/deploy.mjs   # compte racine + sous-comptes + wasm + new(owner, player)
node scripts/testnet/e2e.mjs                  # rejeu on-chain, hash de transaction imprimés
```

`make testnet-deploy` et `make testnet-e2e` font exactement cela. Le premier
appel au faucet public (`helper.testnet.near.org`) est limité à 10 créations de
compte par 3 h et par IP ; en cas de 429, `TIDEWATER_ROOT_PARENT=<compte financé>`
crée le compte contrat en sous-compte pour ne pas bloquer la démo. Les clés
restent dans `~/.near-credentials/testnet/`, jamais dans le dépôt.

## Contraintes (brief §8)

Fichiers < 500 lignes, fonctions < 50 ; code, commentaires et UI en
anglais, docs en français ; goût (ni violet ni indigo, pas de titre en
dégradé, etc.) ; `prefers-reduced-motion` partout, DPR ≤ 2 ; zéro
erreur console sur le parcours de référence. `.github/` est gelé : la
CI reste docs + gardes.
