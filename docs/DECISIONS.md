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
