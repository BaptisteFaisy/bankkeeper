# Tidewater — Architecture

> Dépôt `BaptisteFaisy/near_tidewater`, track NEAR *Games With Real Economies*.
> Autorités : `tidewater.md` (le brief, §8) puis `/tmp/tidewater-game/spec.md`.

## Vue d'ensemble

```
Navigateur (React + canvas maison) ←→ Relais Python stdlib ←→ Simu Rust (seed)
       ↑                                    ↓
 Auth sociale (email,                État partie (state.json)
 pas de wallet/seed/gas)       Contrat NEAR (Rust, mêmes règles)
```

Un seul joueur humain affronte des capitaines NPC solvables. L'économie
tourne sans aucun joueur : le fast-forward des juges joue une saison de
28 jours en une minute, à graine fixée (même graine, même saison).

## Composants

| Dossier | Rôle | Langage |
|---|---|---|
| `crates/rules/` | Modules de règles uniques, partagés par la simu et le contrat : stocks, sorties, criée, licences, circuit de l'or, faillite, puis couches 1 à 4 | Rust |
| `crates/sim/` | Moteur de cycles (journée, semaine, saison), NPC, fast-forward, pilotage par graine | Rust |
| `contracts/tidewater/` | Contrat NEP-245 : Gold (0), Herring (1), Cod (2), Licence (3), Boat deed (10–29), Loan note (100+), Share (200+) | Rust |
| `server/` | Relais HTTP (`relay.py`, `simclient.py`, `test_relay.py`), bibliothèque standard uniquement | Python |
| `web/` | React + Vite + TypeScript strict, CSS maison, carte/criée/graphes sur canvas maison ; ni moteur de jeu, ni lib de charts, ni Tailwind | TS/React |
| `tests/` | Garde structurelle CI (`ci_structural.py`) | Python |
| `fixtures/` | Graines et états de référence pour le déterminisme | JSON |
| `docs/` | La présente documentation, en français | Markdown |

Le poisson en mer n'est un token de personne : il n'appartient à personne
tant qu'il n'est pas pêché. C'est le sujet du jeu.

## Flux de données

1. Le joueur affecte un bateau (deux clics : bateau, puis zone).
2. La simu fait rentrer les bateaux (≤ 3 sorties par jour), chaque sortie
   débarque un lot vendu aussitôt à la criée.
3. Chaque fin de journée : repousse des stocks, paiement des charges,
   écoulement des stocks acheteurs, vérification des faillites et de
   l'invariant d'or (TW-N-42).
4. Chaque fin de semaine : quotas remis à zéro, traites, faillites
   capitaines (TW-N-50). Chaque fin de saison (4 semaines) : conseil du
   port (couche 4).

## Ports et environnement

- Relais Tidewater en dev : port **8785**. L'UI appelle `/api` en
  same-origin, Vite relaie vers `http://localhost:8785` (voir
  `web/vite.config.ts`).
- **Jamais** le port 8775 (relais live Market Town) ni le service 8765 :
  tests sur ports et états jetables uniquement.
- Navigateur de test : Chrome headless à profil séparé sous `/tmp`
  (garde `chrome-profile-guard` avant/après), aucun processus laissé
  derrière, kill par PID exact uniquement.

## Contraintes de construction (brief §8)

- Chaque fichier sous 500 lignes, chaque fonction sous 50 lignes.
- Code, commentaires et textes du jeu en anglais ; docs en français.
- Goût : ni violet ni indigo, pas de titre en dégradé, pas de fond crème
  uni, pas de verre dépoli généralisé, pas de grille de cartes identiques,
  pas d'emoji en guise d'icône.
- `prefers-reduced-motion` respecté partout, DPR plafonné à 2, écran
  1280×800 fluide, zéro erreur console sur le parcours de référence.

## Intégration continue

La CI reste **docs + gardes** : `.github/` est gelé (fichiers de garde),
aucun workflow n'est modifié par les lots de jeu. Rust et web sont
vérifiés en local par les agents : build vert, tests verts, parcours de
référence headless à zéro erreur console. Merge par la file Mergify sur
CI verte (`ci`, `ci-budget`, `couche0`), PR avec section `## Scope`.
