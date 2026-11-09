# Tidewater — Économie

> Règles TW-N-* du brief §4 et couches TW-C* du §5. Valeurs de départ du
> §12 : des points de départ pour la simulation, pas des valeurs
> équilibrées — l'équilibrage se règle en simu multi-graines avant
> l'interface.

## Le stock commun

Trois zones, trois stocks en caisses, partagés par les dix bateaux du
port (2 au joueur, 8 aux NPC) :

| Zone | Espèce | Capacité | Coût/sortie | Repousse/jour |
|---|---|---|---|---|
| The Shallows | Hareng | 3 000 | 2 or | 5 % |
| Greybank | Hareng | 5 000 | 4 or | 5 % |
| The Deeps | Morue | 2 000 | 7 or | 2 % |

- Une sortie prend 0,4 % du stock au moment où elle a lieu (TW-N-02).
- Repousse logistique : `taux × stock × (1 − stock ÷ capacité)` (TW-N-03).
- Un stock à zéro ne repousse plus (TW-N-04).
- Cible d'équilibrage : 2 bateaux fixes sur Greybank stabilisent le
  stock près de 2 600 caisses et la prise près de 62 caisses par jour ;
  5 bateaux vident la zone.

## La criée (horloge descendante)

Chaque lot est mis en vente à un prix qui descend ; le premier acheteur
dont la limite est atteinte emporte le lot (TW-N-30). Limite = prix de
base × facteur de stock, avec facteur = `1 + 0,5 × écart relatif à la
cible` (TW-N-31, §12). Après un achat, le stock de l'acheteur monte et
sa limite baisse pour le lot suivant (TW-N-32). Un lot sans preneur
au-dessus du prix plancher est perdu, sans créer ni détruire d'or
(TW-N-33, TW-N-41).

Exemple de référence (§4.4) : lot de 14 caisses de hareng → 3,6
(50,4 or), puis limite tombée à 3,4. Prix de base : hareng 4 or,
morue 12 or.

## Licences et quota

20 licences, 70 caisses débarquées par semaine chacune, soit 1 400
caisses pour tout le port — près du double des ~770 caisses par semaine
que les trois zones donnent durablement (TW-N-20). Quota épuisé = à
quai jusqu'au lundi (TW-N-21). Les NPC vendent quand l'or manque et
achètent quand le quota les limite (TW-N-22). Une licence détenue mais
non pêchée retire 70 caisses par semaine de la pression (TW-N-23).
Le prix d'une licence suit le revenu qu'elle laisse espérer (TW-C4-04).

## Le circuit de l'or

L'or n'entre que par les conserves exportées (Cannery) et les voyageurs
de l'auberge (The Gull), et ne sort que par le carburant et les appâts
importés (Chandlery, TW-N-40). À chaque cycle, la simu vérifie que la
variation du total de l'or égale la somme des flux extérieurs (TW-N-42).
Charges : 6 or par bateau et par jour, versés aux équipages, même à
quai (TW-C3-01). Bateau neuf 400 or, prêt bancaire jusqu'à 300 or à
3 % par semaine, saisie après deux traites manquées (TW-C3-02/03).

## Faillite et renflouement

Capitaine à zéro ou moins en fin de semaine : bateaux désarmés,
licences aux enchères (TW-N-50). Acheteur à zéro : `Closed` (TW-N-51).
Le joueur peut renflouer un acteur arrêté et toucher une part de ses
bénéfices (TW-N-52). Lecture sans texte : bateaux couchés à quai,
conserverie sans fumée, zone sans bancs (TW-N-53).

## Couches de profondeur (lots 1 à 4)

1. **Stock caché** : prise par sortie + tendance affichées, relevé à
   80 or (±10 %, une semaine). Chaque NPC lit le signal à sa façon.
2. **Espèces liées** : capacité morue des Deeps = `2 000 × (hareng de
   Greybank ÷ 5 000)` ; filet `Small mesh` +40 % de prise mais repousse
   réduite jusqu'à moitié selon 4 semaines d'historique.
3. **Dette** : un NPC à court pour sa traite sort tous ses bateaux au
   petit maillage ; dettes cessibles (rachat, report, saisie).
4. **Conseil** : vote du quota à chaque fin de saison, 1 voix par
   licence, propositions indemnisées, calcul de chaque vote affiché.
