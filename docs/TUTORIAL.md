# Tidewater — Tutoriel en trois écrans

> `web/src/components/Tutorial.tsx`, monté par `App.tsx`.
> Test : `python3 tests/e2e_tutorial.py` (après `cd web && npm run build:offline`).

## Le contrat

- **Trois cartes**, jamais plus. Une minute de lecture, pas une leçon.
- **Il ne s'ouvre jamais tout seul** : la page de garde explique déjà le jeu
  à chaque chargement (Gaia, 2026-11-12). `How to play` dans la barre du haut
  ouvre les cartes, et la clé `localStorage['tidewater-tutorial-v1']` est
  écrite dès qu'on appuie sur `Done`, `Skip` ou `Échap`.
- **Il ne bloque personne** : `How to play` dans la barre du haut le rouvre à
  tout moment (le joueur qui sait déjà jouer appuie sur `Skip` et n'en entend
  plus parler), et l'écran de jeu reste rendu derrière la carte
  (`section[aria-label='Sea chart']` est toujours dans la page).
- **Clavier** : `Entrée` / `Espace` avancent, `Échap` ferme, `Tab` et
  `Maj+Tab` restent piégés dans la carte, et le focus revient à l'élément qui
  l'avait avant l'ouverture.
- **Mouvement** : une seule animation d'entrée (140 ms), neutralisée par le
  bloc global `prefers-reduced-motion` de `styles.css`.

## Écran 1 — One sea, shared by all

> Three fishing grounds, ten boats: every captain in the port fishes the same
> banks, and nobody owns the fish.
>
> The catch per trip is your warning light — it falls long before a bank runs
> empty.
>
> Take more than a bank can regrow and the shortfall is written down as a debt
> to the sea, in crates. It survives the season.

Schéma : six jours d'un même banc, barres qui rétrécissent, ligne orange
« catch per trip » qui décroche au-dessus.

**Pourquoi celui-là d'abord** : c'est la seule règle qui coûte la partie quand
on la découvre trop tard — la prise baisse avant que le banc ne s'effondre, donc
le signal est lisible et le joueur peut encore réagir.

## Écran 2 — The auction sells your catch

> Close the day and your catch goes to the auction lot by lot: the price falls
> until a merchant buys. That price is your money.
>
> Every merchant stops bidding once it has bought its fill — fill one up today
> and it bids less tomorrow, for you and for every other captain.
>
> Hover the why tag on a merchant to read its own reason for the limit it holds.

Schéma : trois marchands, trois jauges de limite (la plus pleine en orange),
et une flèche « next price » qui descend.

**Pourquoi ensuite** : c'est le retour immédiat sur la décision de l'écran 1 —
le joueur voit que le prix qu'on lui paie n'est pas une constante mais la
conséquence de ce qu'il vient de débarquer, et il découvre l'infobulle « why »
qui lui donne le raisonnement du marchand.

## Écran 3 — The vote closes each season

> Each licence carries a weekly quota; spend it and your boats stay at the
> quay until Monday.
>
> At the season close the fleet votes the next quota — one licence, one vote,
> and an indemnity can buy a reluctant yes.
>
> The sea you leave is the sea you inherit: the next season opens on the banks
> you handed over, not on a fresh one.

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
| `tests/e2e_tutorial.py` | aucun tutoriel au premier chargement, `How to play` ouvre, `Next` ×2 + `Done` ferme, rechargement, `Échap`, `Entrée`, piège à focus |

`tests/e2e_offline.py` vérifie qu'aucune carte ne s'ouvre au premier
lancement (`dismiss_tutorial` n'a plus rien à fermer) : le parcours de
référence ne dépend pas du tutoriel.
