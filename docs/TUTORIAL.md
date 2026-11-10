# Tidewater — Tutoriel en trois écrans

> `web/src/components/Tutorial.tsx`, monté par `App.tsx`.
> Test : `python3 tests/e2e_tutorial.py` (après `cd web && npm run build:offline`).

## Le contrat

- **Trois cartes**, jamais plus. Une minute de lecture, pas une leçon.
- **Il s'ouvre seul une fois** : au tout premier chargement du jeu, quand
  `localStorage['tidewater-tutorial-v1']` est absent. Il écrit la clé dès
  qu'on appuie sur `Done`, `Skip` ou `Échap` — donc **jamais** ensuite.
- **Il ne bloque personne** : `How to play` dans la barre du haut le rouvre à
  tout moment (le joueur qui sait déjà jouer appuie sur `Skip` et n'en entend
  plus parler), et l'écran de jeu reste rendu derrière la carte
  (`section[aria-label='Sea chart']` est toujours dans la page).
- **Clavier** : `Entrée` / `Espace` avancent, `Échap` ferme, `Tab` et
  `Maj+Tab` restent piégés dans la carte, et le focus revient à l'élément qui
  l'avait avant l'ouverture.
- **Mouvement** : une seule animation d'entrée (140 ms), neutralisée par le
  bloc global `prefers-reduced-motion` de `styles.css`.

## Écran 1 — The stock is shared

> Every boat fishes the same three banks. A crate landed today is a crate the
> bank cannot lend tomorrow.
>
> Watch the catch per trip: it slips well before the bank gives way. That early
> fall is cheap to answer and dear to ignore.

Schéma : six jours d'un même banc, barres qui rétrécissent, ligne orange
« catch per trip » qui décroche au-dessus.

**Pourquoi celui-là d'abord** : c'est la seule règle qui coûte la partie quand
on la découvre trop tard — la prise baisse avant que le banc ne s'effondre, donc
le signal est lisible et le joueur peut encore réagir.

## Écran 2 — The auction pays what the merchant can afford

> No merchant bids past its own limit, set by its stock against its target. Fill
> one today and the lot it bids on tomorrow goes cheaper, for you and for every
> other captain.
>
> Each merchant carries a why tag: hover it, or focus it with the keyboard, to
> read the reason behind the limit.

Schéma : trois marchands, trois jauges de limite (la plus pleine en orange),
et une flèche « next price » qui descend.

**Pourquoi ensuite** : c'est le retour immédiat sur la décision de l'écran 1 —
le joueur voit que le prix qu'on lui paie n'est pas une constante mais la
conséquence de ce qu'il vient de débarquer, et il découvre l'infobulle « why »
qui lui donne le raisonnement du marchand.

## Écran 3 — The council, and the campaign

> Quotas are voted at the close of a season, and an indemnity can swing a vote
> your way. A campaign runs three seasons.
>
> The sea keeps what the season left it: the next season opens on the banks you
> handed over, not on a fresh sea.

Schéma : trois saisons côte à côte, une barre orange au clos de chacune (le
vote), et la légende « the sea keeps what the season left it ».

**Pourquoi en dernier** : c'est l'échelle longue — le vote, l'indemnité et la
campagne de trois saisons n'ont de sens qu'une fois compris que le stock et le
prix se décident maintenant, donc il ferme la boucle sans noyer l'ouverture.

## Câblage

| Fichier | Rôle |
|---|---|
| `web/src/components/Tutorial.tsx` | les trois cartes, les schémas SVG, le piège à focus, la clé `localStorage` |
| `web/src/components/HeaderControls.tsx` | `HowToPlay` : le bouton discret qui rouvre le tutoriel |
| `web/src/App.tsx` | `useTutorial()`, le rendu conditionnel, le bouton dans `TopBar` |
| `web/src/styles.css` | `.tutorial-*`, `.how-to-play` (palette du brief, aucun dégradé) |
| `tests/e2e_tutorial.py` | premier chargement, `Next` ×2 + `Done`, rechargement, `How to play`, `Échap`, `Entrée`, piège à focus |

`tests/e2e_offline.py` saute la carte au premier lancement (`Skip`), comme le
ferait un joueur qui connaît déjà la boucle : le parcours de référence ne
dépend pas du tutoriel.
