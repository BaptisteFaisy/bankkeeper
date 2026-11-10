# Tidewater — Boucle de jeu

> Brief §2. Le joueur est capitaine de pêche ; tous les autres acteurs
> sont des NPC solvables qui réagissent au prix, au stock et à leur
> dette (O2).

## Rythmes

Le track demande la boucle à trois échelles : **30 secondes, 5 minutes,
une session**. Les voici, avec ce que le joueur fait à chacune.

| Rythme | Ce qui se passe | Ce que fait le joueur |
|---|---|---|
| **Toutes les ~30 secondes** | Un lot arrive à la criée : l'horloge descend, la limite de chaque marchand est atteinte, le lot est vendu (ou perdu sous le plancher) | Regarde la prise et le prix, puis réaffecte un bateau : autre zone, autre filet, ou à quai |
| **Toutes les 5 minutes** | Une journée se ferme : les stocks repoussent, les charges tombent, les acheteurs écoulent leurs stocks, les faillites sont vérifiées | Lit le registre du port et décide de la journée suivante |
| **La session** | Une semaine remet les quotas à zéro ; une saison (2 semaines en démo, 4 en jeu complet) se termine par le vote du conseil du port | Achète ou vend des licences, rachète une dette, propose une règle, vote ; puis la saison suivante, avec ce que la précédente a laissé |

But : la plus grande valeur nette au bout de la campagne, avec une mer encore
vivante. Le jeu ne juge pas : une mer vide ne rapporte simplement plus rien.

### Cadence réelle dans le build actuel (à lire avant de juger)

Le jeu est **au tour par tour**, pas en temps réel : le lot suivant part quand
le joueur clique, et la journée se ferme sur `End the day`. Le rythme de
30 secondes existe donc comme *animation* — un lot toutes les 1,4 s en rejeu,
soit ~30 s pour une journée de trois sorties avec deux bateaux — et non comme
une horloge qui tourne sans le joueur.

C'est un écart assumé avec le brief §2.1 (« toutes les 50 secondes environ »),
et c'est le seul endroit où l'implémentation ne suit pas le papier. Le passage
au temps réel demande trois choses, toutes petites séparément : un tick de
30 secondes côté moteur (`sim tick` = une sortie par bateau), une fermeture de
journée automatique à la 10ᵉ sortie, et une pause. Décision à prendre, pas
détail technique : en temps réel, le joueur qui réfléchit trop perd des lots.

### Le fast-forward des juges

Sept jours en une seconde (`sim ff --days 7`) : l'économie tourne sans aucun
joueur, et le panneau `Judges` montre stocks, prix et faillites sur la courbe.
C'est le mode à montrer en démo — c'est aussi la preuve que les marchands sont
des agents autonomes et pas un décor.

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
