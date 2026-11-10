# Le nom — Bankkeeper

## Pourquoi ce nom

Dans ce jeu, **« bank » a deux sens, et c'est tout le sujet** :

- le **banc de poissons** — Greybank, The Shallows, The Deeps : une ressource
  qui n'appartient à personne et que tout le port partage ;
- la **banque du port** — les prêts, les traites, les coques saisies : ce qui
  pousse un capitaine à pêcher plus qu'il ne devrait.

**Bankkeeper** est celui qui garde l'un et l'autre. C'est le joueur, et c'est
aussi ce que le conseil du port prétend être. Le nom dit la tension du jeu en un
mot : garder le banc, ou garder la banque — on ne peut pas toujours les deux.

Il est court, prononçable en français comme en anglais, sans collision notable :
aucun paquet npm, un seul dépôt homonyme sur GitHub (sans rapport), et il ne
décrit aucun autre produit. « Tidewater » était joli mais générique — il existe
une compagnie maritime, un serveur Java du même genre de nom, et beaucoup de
projets côtiers.

## Ce qui a changé

- dépôt : `BaptisteFaisy/near_tidewater` → **`BaptisteFaisy/bankkeeper`**
  (GitHub redirige l'ancienne URL, les liens et les PR continuent de fonctionner).

## Ce qui n'a pas changé (et pourquoi)

Les identifiants internes restent `tidewater` : nom des crates
(`crates/wasm` → `tidewater-wasm`), paquet du contrat, identifiants de tokens
NEP-245 (`gold`, `herring`, `cod`, `licence`…), fichier `engine.wasm`, clés de
stockage du navigateur (`tidewater-game-v1`).

Trois raisons :

1. **le contrat est un identifiant public** : un token déjà déployé ne se
   renomme pas sans casser les portefeuilles qui le détiennent ;
2. **le stockage local** porte des sauvegardes de joueurs : changer la clé
   efface les campagnes en cours ;
3. le renommage interne est un churn mécanique de ~200 fichiers qui n'apporte
   rien au jury et casse les branches en cours.

Si le nom doit descendre jusqu'aux identifiants, c'est une PR dédiée, faite
**après** le gel du dépôt pour la soumission, avec une migration des clés de
stockage et un redéploiement du contrat.
