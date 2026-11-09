# Tidewater — Boucle de jeu

> Brief §2. Le joueur est capitaine de pêche ; tous les autres acteurs
> sont des NPC solvables qui réagissent au prix, au stock et à leur
> dette (O2).

## Rythmes

| Rythme | Ce qui se passe | Ce que fait le joueur |
|---|---|---|
| ~50 secondes | Un de ses bateaux rentre et débarque un lot, vendu aussitôt à la criée | Regarde prise et prix, réaffecte : autre zone, autre filet, ou à quai |
| 5 minutes (journée) | Chaque stock repousse, charges payées, acheteurs écoulent leur stock, faillites vérifiées | Lit le registre du port, décide de la journée suivante |
| 35 minutes (semaine) | Quotas remis à zéro | Achète/vend des licences, rachète une dette, prépare le conseil |
| 4 semaines (saison) | Vote du conseil du port | Propose une règle, indemnise, vote |

But : la plus grande valeur nette, avec une mer encore vivante. Le jeu
ne juge pas : une mer vide ne rapporte simplement plus rien.

## Écran principal (1280×800, TW-UI-01)

- **Barre du haut** : semaine, jour et marée, or du joueur, quota
  restant de la semaine, bouton `Judges`.
- **Carte marine** (canvas maison, TW-UI-02) : le port, les trois zones,
  les bateaux en mer colorés par capitaine ; chaque zone affiche sa
  prise par sortie et sa tendance.
- **`Fish auction`** : lot en vente, horloge descendante, limite de
  chaque acheteur, prix de vente — lisible en quelques secondes.
- **`Your boats`** : par bateau, zone, filet, sortie en cours, dernière
  prise. Affectation en deux clics : le bateau, puis la zone (TW-UI-03).
- **`Harbour ledger`** : débarquements du jour par capitaine et prix.

Direction visuelle (brief §9) : carte marine vue d'en haut, verts
profonds (`#0f2a30`, `#1b4a54`, `#24616c`), côte sable `#c9b083`,
texte écume `#e4ede6`, une seule couleur vive — l'orange bouée
`#e0672f` réservé au joueur et au prix de la criée — or `#e3b65a`,
Okoro `#8fc06f`.

## Une session type

1. **Semaine 1.** Deux bateaux sur Greybank comme tout le monde ; bonnes
   prises, mais le prix baisse quand tous débarquent ensemble.
2. **Semaine 2.** Prise par sortie de 16 à 12 caisses ; un relevé à
   80 or estime le stock (3 000 sur 5 000).
3. **Semaine 3.** Un bateau vers The Shallows, rachat de deux licences
   à Okoro — non pêchées.
4. **Semaine 4.** Les Brandt, à court pour leur traite, sortent tout au
   petit maillage ; rachat de leur dette et report accordé.
5. **Conseil.** Proposition de baisse du quota avec indemnités ; le vote
   passe selon l'intérêt de chacun.
6. **Bilan.** Valeur nette, stocks restants, licences détenues.

## Fast-forward et attente

Pour les juges, une saison de 28 jours se joue en une minute sans
joueur. En partie normale, deux bateaux donnent un événement toutes les
50 secondes, et un bouton accélère jusqu'au prochain débarquement.
