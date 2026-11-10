# Bankkeeper

**Ce que je prends aujourd'hui coûte à quelqu'un d'autre, et à demain.**

Tu es capitaine et armateur à Tidewater. Dix bateaux, trois bancs de pêche, une
criée néerlandaise où inonder le port fait chuter les cours, et un Conseil du
port où chaque licence donne une voix.

> *Bank* est à la fois le **banc de poisson** que nul ne possède et la **banque**
> qui pousse à le vider. Le *keeper*, c'est toi. Voir [`docs/NAMING.md`](docs/NAMING.md).

Projet pour le hackathon NEAR — track **Games With Real Economies**.

- 🎮 **Jouer en ligne (0 installation, 0 serveur)** :
  **[tidewater-play.vercel.app](https://tidewater-play.vercel.app)**
- 📜 **Contrat NEP-245** : `contracts/tidewater/` (412 Ko wasm, 37 fonctions, ABI embarquée)
- 🧭 **La colonne vertébrale du jeu (SPINE)** : [`docs/SPINE.md`](docs/SPINE.md)
- 🔍 **Preuves publiques** : [`/proofs.html`](https://tidewater-play.vercel.app/proofs.html) et [`docs/deployments.md`](docs/deployments.md)
- 📋 **Grille de conformité au track** : [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)

---

## 1. Ce qui a été fait (l'état réel)

### A. Économie & Moteur (100 % déterministe, zéro IO)

- **La boucle de base** : 10 bateaux, 3 zones (The Shallows, Greybank, The Deeps),
  régénération logistique naturelle, épuisement visible dès la première semaine.
- **La criée néerlandaise (Dutch auction)** : le prix part haut et descend. Trois
  marchands NPC (Fishmonger, Cannery, The Gull) avec leur bourse, leur stock et
  leur cible. Inonder le marché fait chuter le cours ; un marchand ruiné ferme sa
  boutique jusqu'à renflouement.
- **Règles de prix en un fichier lisible** : [`crates/rules/src/merchant.rs`](crates/rules/src/merchant.rs)
  est l'unique source de vérité — le contrat on-chain et le moteur wasm appellent
  la même formule. Chaque marchand affiche son raisonnement en infobulle (*why*).
- **Le rythme** : un lot toutes les 30 secondes, une journée en 5 minutes (ou
  avance rapide à la demande).
- **Graines splitmix64 sans état** : déterminisme garanti (même graine = même
  saison au bit près), 3 graines = 3 dynamiques de marché radicalement différentes.
- **Campagne de 3 saisons** : le capital est reporté, et le handicap est porté
  par la mer (les stocks ne sont pas réinitialisés magiquement).

### B. La colonne en 5 barreaux ([`docs/SPINE.md`](docs/SPINE.md))

1. **Voir (Attribution)** ✅ : le registre municipal (*HARBOUR LEDGER → Who took what*)
   chiffre l'externalité exacte de chaque capitaine (`Greybank : toi 46 %, Brandt 31 %`)
   face à la prise durable (`sustainable catch`).
2. **Payer (Redevance & Fonds du port)** ✅ : le Conseil vote une redevance au
   débarquement prélevée sur chaque lot vendu, versée à un **fonds du port** visible
   qui finance les relevés, les jachères et les indemnisations.
3. **Gouverner (Motion financée)** ⏳ : toute motion vote son financement (le fonds
   ou la redevance paie) et chaque vote affiche ce que le capitaine a pris au banc.
4. **Hériter (Dette envers la mer)** ⏳ : passif accumulé au-dessus de la prise
   durable, payé en jachère ou en réensemencement, reporté sur la saison suivante.
5. **Réparer (Jachère & Contentieux)** : fermeture collective d'une zone et recours.

### C. Le Contrat NEAR NEP-245 (`contracts/tidewater/`)

Un contrat multi-token unique qui porte toute l'économie :
- **Or** (fongible, ID 0), **Poissons** (hareng, cabillaud),
- **Licences de pêche** (semi-fongibles, cessibles et louables),
- **Actes de propriété des bateaux** (NFT deeds),
- **Notes de dette** (prêts émis par la banque, transférables).

31 tests unitaires et d'intégration, 100 % passants. 3 bloquants et 8 majeurs
d'audit corrigés (pas d'injection dans `EVENT_JSON`, pas de frappe ex-nihilo,
plafond de 8 licences appliqué, droits du deed rattachés au token).

### D. Client Web & PWA hors-ligne (`web/`)

- **Zéro serveur en production** : le moteur Rust compile en WebAssembly
  (`engine.wasm`, 347 Ko). Les calculs tournent à 100 % dans le navigateur du joueur.
  Zéro appel `/api/`, zéro base de données, zéro coût d'hébergement.
- **PWA installable** : Service Worker (`sw.js`), manifeste, page de secours hors-ligne.
- **Tutoriel interactif en 3 étapes** pour enseigner la tragédie des biens communs dès
  la première minute.
- **Sauvegarde et partage** : persistance `localStorage`, reprise sur rafraîchissement,
  et graine partageable par URL (`?seed=7&weeks=2`).
- **Panneau pour les juges** : bouton *Judges* avec avance rapide (7 jours / 28 jours en
  une seconde) pour voir l'économie réagir immédiatement, et copie de l'empreinte
  cryptographique (`history_hash`).

---

## 2. Comment ça fonctionne

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Navigateur du joueur                            │
│                                                                        │
│   UI React + Vite (web/)                                               │
│         │                                                              │
│         ▼                                                              │
│   Adaptateur ABI sans glue (web/src/actions.ts)                        │
│         │                                                              │
│         ▼                                                              │
│   engine.wasm  ◄──  compilé depuis crates/wasm + crates/sim + rules     │
│   (347 Ko)          100 % pur Rust, déterministe, zéro IO, zéro réseau │
└─────────┬──────────────────────────────────────────────────────────────┘
          │ (actions économiques clés : licences, dettes, vote)
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     NEAR Testnet (bankkeeper.testnet)                  │
│                                                                        │
│   Contrat NEP-245 multi-tokens (contracts/tidewater/)                  │
│   • Or (0)            • Licences (1)         • Actes bateaux (2-11)    │
│   • Notes de dette    • Quotas & votes       • Compte Fonds du port    │
└────────────────────────────────────────────────────────────────────────┘
```

### Le cycle d'une journée

1. **Aube (Dawn)** : le Conseil du port applique les quotas votés la veille ; la banque
   prélève les intérêts des dettes ; les marchands calculent leurs prix selon leurs
   stocks restants. Le plan du jour est figé.
2. **Journée (Day)** : un lot arrive toutes les 30 secondes (ou au clic sur *Next lot*).
   Les bateaux rentrent un par un. À chaque débarquement, la criée s'ouvre : le prix
   descend jusqu'à ce qu'un marchand achète ou que le lot soit invendu. La redevance
   du port est prélevée à la source et créditée au fonds.
3. **Soir (Dusk)** : les pêcheurs paient les salaires des équipages ; le registre
   municipal met à jour l'attribution (*qui a pris quoi* et *combien la mer a perdu*).
4. **Fin de saison (Bilan)** : calcul de la valeur nette de chaque armateur et
   présentation de **la facture laissée à la mer**.

---

## 3. Lancer en local

### Prérequis
- Rust 1.80+ avec la cible wasm : `rustup target add wasm32-unknown-unknown`
- Node.js 20+
- Python 3.10+ (pour la suite de tests E2E Selenium)

### Commandes

```sh
# 1. Cloner
git clone https://github.com/BaptisteFaisy/bankkeeper.git
cd bankkeeper

# 2. Vérifier toute la simulation et le contrat en Rust (177 tests)
cargo test --workspace

# 3. Compiler le moteur en WebAssembly
cargo build --target wasm32-unknown-unknown --release -p tidewater_wasm
cp target/wasm32-unknown-unknown/release/tidewater_wasm.wasm web/public/engine.wasm

# 4. Lancer l'interface web (Vite)
cd web
npm install
npm run dev
# -> Ouvrir http://localhost:5173
```

### Tests E2E complets (hors-ligne et audits)

```sh
# Vérifie que le jeu fonctionne à 100 % hors-ligne (0 appel /api/)
python3 tests/e2e_offline.py

# Audit d'accessibilité et robustesse client
python3 tests/audit_web.py
```

### Construire et tester le contrat NEAR

```sh
cd contracts/tidewater
cargo near build non-reproducible-wasm
cargo test
```

---

## 4. Structure du dépôt

```
bankkeeper/
├── crates/
│   ├── rules/          # Règles pures du jeu (zéro IO, formules de prix, conseil)
│   ├── sim/            # Moteur de simulation (bots, cycle, attribution, fonds)
│   └── wasm/           # Pont WebAssembly direct (sans wasm-bindgen)
├── contracts/
│   └── tidewater/      # Contrat smart-contract NEAR NEP-245 (Rust + near-sdk)
├── web/                # Interface React + TypeScript + Vite + PWA
│   ├── src/components/ # SeaMap, FishAuction, HarbourLedger, Council, Tutorial...
│   └── public/         # sw.js, manifest.webmanifest, engine.wasm
├── docs/               # Architecture, SPINE (colonne), COMPLIANCE, Audits, Naming
├── scripts/            # Scripts de déploiement et tests testnet (near-api-js)
└── tests/              # Tests E2E Selenium (parcours hors-ligne, audit web)
```

---

## 5. Pipeline CI & Intégrité

- **File de merge Mergify** : rebase strict, historique linéaire garanti, aucun commit
  de merge dans la branche principale.
- **3 contrôles requis** sur chaque PR avant fusion :
  1. `ci` : intégrité des documents UTF-8 et tests automatiques des gardes.
  2. `ci-budget` : verdict rendu en moins de 5 minutes chrono (règle d'or).
  3. `couche0` : contrôle strict du périmètre (`## Scope`) et interdiction des régressions.

---

## Licence

Apache-2.0 / MIT.
