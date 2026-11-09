# Cahier des charges — Tidewater

| | |
|---|---|
| **Version** | 0.1, 9 novembre 2026 |
| **Statut** | Concept. Rien n'est codé, aucune valeur n'a été simulée. |
| **Cadre** | Hackathon NEAR, track *Games With Real Economies* |
| **Référence** | Dossier Market Town (`/tmp/market-town-iso-projet.md`), sections 1.6 et 3.2 à 3.6 |
| **Joueurs** | Un joueur humain, tous les autres acteurs sont des NPC |

---

## 1. Présentation

### 1.1 Contexte

Tidewater est un jeu distinct de Market Town, pensé pour la même architecture et soumis aux mêmes contraintes. Sa ressource n'appartient à personne : c'est un stock de poissons que tous les capitaines du port se partagent.

### 1.2 Le jeu en une phrase

Tu es capitaine de pêche dans un port où tous les bateaux puisent dans les mêmes bancs : ce que chacun prend aujourd'hui décide de ce qu'il restera demain, pour toi comme pour les capitaines NPC.

### 1.3 Objectifs

| Réf. | Objectif |
|---|---|
| O1 | Le joueur voit qu'une ressource partagée s'épuise quand chacun pêche pour soi, et qu'il existe des leviers économiques pour l'empêcher. |
| O2 | Les autres pêcheurs, les acheteurs et la banque sont des acteurs solvables, qui réagissent au prix, au stock et à leur dette. |
| O3 | Le jeu se joue seul contre des NPC, et l'économie tourne sans aucun joueur pour le fast-forward des juges. |
| O4 | Le jeu tient dans les contraintes du dossier Market Town (section 8 de ce document). |

### 1.4 Hors périmètre

- Plusieurs joueurs humains.
- Déploiement testnet et FastAuth réel.
- Le son : aucune information ne passe par l'audio.
- Le pilotage des bateaux : le joueur les affecte à une zone, il ne les conduit pas.
- La météo et les tempêtes.
- La conservation du poisson par la glace ou le fumage (voir section 13).
- Une mise en page pour téléphone.

---

## 2. Le jeu

### 2.1 Boucle de jeu

| Rythme | Ce qui se passe | Ce que fait le joueur |
|---|---|---|
| **Toutes les 50 secondes environ** | Un de ses bateaux rentre et débarque un lot, que la criée vend aussitôt. | Il regarde la prise et le prix, puis réaffecte le bateau s'il le veut : autre zone, autre filet, ou à quai. |
| **Toutes les 5 minutes** | Une journée s'achève : chaque stock repousse, les charges sont payées, les acheteurs écoulent leur stock, les faillites sont vérifiées. | Il lit le registre du port et décide de la journée suivante. |
| **Par session** | Une semaine dure 35 minutes et remet les quotas à zéro. Une saison dure quatre semaines et se termine par un vote du conseil du port. | Il achète ou vend des licences, rachète une dette, propose une règle. But : la plus grande valeur nette, avec une mer encore vivante. |

Pour les juges, le fast-forward joue une saison de 28 jours en une minute.

### 2.2 Écran principal

![Maquette de l'écran principal de Tidewater](visuels/tidewater-ecran.png)

La maquette montre le jeu avec toutes ses couches actives : le stock n'est plus affiché, seule la prise par sortie l'est.

| Zone | Contenu |
|---|---|
| Barre du haut | Semaine, jour et marée, or du joueur, quota restant de la semaine, bouton `Judges`. |
| Carte marine | Le port, les trois zones de pêche et les bateaux en mer, colorés par capitaine. Chaque zone affiche sa prise par sortie et sa tendance. |
| `Fish auction` | Le lot en vente, l'horloge de prix qui descend, la limite de chaque acheteur, le prix de vente. |
| `Your boats` | Pour chaque bateau : zone, filet, sortie en cours, dernière prise. |
| `Harbour ledger` | Les débarquements du jour par capitaine et les prix pratiqués. |

### 2.3 Une session type

1. **Semaine 1.** Le joueur envoie ses deux bateaux sur Greybank, comme tout le monde. Les prises sont bonnes, mais le prix baisse quand tous débarquent en même temps.
2. **Semaine 2.** La prise par sortie sur Greybank passe de 16 à 12 caisses. Il paie un relevé : le stock est estimé à 3 000 caisses sur 5 000.
3. **Semaine 3.** Il déplace un bateau vers The Shallows, rachète deux licences à Okoro et ne les pêche pas.
4. **Semaine 4.** Les frères Brandt, à court pour leur traite, sortent tous leurs bateaux au petit maillage. Le joueur rachète leur dette à la banque et leur accorde un report.
5. **Conseil de fin de saison.** Il propose de baisser le quota et d'indemniser ceux que la baisse pénalise. Le vote passe ou non, selon l'intérêt de chacun.
6. **Bilan.** Valeur nette, stock restant dans chaque zone, licences détenues.

---

## 3. Acteurs

| Acteur | Rôle | Départ | Règle de décision | Ce qui l'arrête |
|---|---|---|---|---|
| **Toi** | Capitaine | 2 bateaux, 4 licences, 150 or | Choix du joueur | Or à zéro en fin de semaine |
| **Marta Hale** | Capitaine prudente | 2 bateaux, 4 licences, 500 or | Pêche tant que la prise par sortie reste au-dessus de 70 % de sa moyenne sur quatre semaines, sinon reste à quai | Or à zéro : bateaux désarmés |
| **Brandt Brothers** | Capitaines voraces | 4 bateaux, 8 licences, 200 or, endettés | Sortent tous leurs bateaux là où la prise par sortie de la veille était la meilleure | Or à zéro : bateaux désarmés |
| **Pim Okoro** | Capitaine suiveur | 2 bateaux, 4 licences, 300 or | Copie la zone et le filet du capitaine qui a le plus gagné par bateau la veille | Or à zéro : bateaux désarmés |
| **Fishmonger** | Achète hareng et morue frais | 600 or | Limite = prix de base × facteur de stock | Or à zéro : `Closed` |
| **Cannery** | Achète le hareng en volume, emploie des habitants, exporte ses conserves | 3 000 or | Même règle | Or à zéro : `Closed` |
| **The Gull** | Auberge, achète la morue | 400 or | Même règle | Or à zéro : `Closed` |
| **Harbour Bank** | Prête pour acheter des bateaux | 3 000 or | Prête contre le bateau, saisit après deux traites manquées | Ne s'arrête pas |
| **Chandlery** | Vend carburant et appâts | 1 000 or | Prix fixes | Ne s'arrête pas |
| **Habitants** | Équipages et ouvriers | 1 500 or | Dépensent leur paie chez le poissonnier et à l'auberge | Ne s'arrêtent pas |

La **mer** n'est pas un acteur et n'a pas de bourse : ce sont trois stocks qui obéissent à une règle de repousse.

---

## 4. Règles du noyau

### 4.1 Le stock commun

| Zone | Espèce | Capacité | Coût d'une sortie |
|---|---|---|---|
| **The Shallows** | Hareng | 3 000 caisses | 2 or |
| **Greybank** | Hareng | 5 000 caisses | 4 or |
| **The Deeps** | Morue | 2 000 caisses | 7 or |

| Réf. | Exigence |
|---|---|
| TW-N-01 | Chaque zone a un stock, en caisses. Tous les capitaines y puisent. |
| TW-N-02 | Une sortie prend 0,4 % du stock de la zone au moment où elle a lieu. |
| TW-N-03 | À la fin de chaque journée, le stock repousse : repousse = taux × stock × (1 − stock ÷ capacité). Le taux est de 5 % par jour pour le hareng, 2 % pour la morue. |
| TW-N-04 | Un stock tombé à zéro ne repousse plus. |
| TW-N-05 | Dans le noyau, le stock de chaque zone est affiché. La couche 1 le cache. |

![Ce que le banc reconstitue, ce que les bateaux prennent](visuels/tidewater-stock.png)

Sur Greybank, deux bateaux prennent le maximum que le banc peut donner durablement : 62 caisses par jour. Le troisième fait baisser la prise totale, le quatrième la divise par six, le cinquième vide la zone. Or le port compte dix bateaux pour trois zones.

### 4.2 La flotte et les sorties

| Réf. | Exigence |
|---|---|
| TW-N-10 | Un bateau fait au plus trois sorties par jour. Chaque sortie coûte le prix de sa zone, payé à l'accastilleur. |
| TW-N-11 | Le joueur affecte chaque bateau à une zone ou le laisse à quai. L'affectation vaut jusqu'à ce qu'il la change. |
| TW-N-12 | Chaque sortie débarque un lot, vendu aussitôt à la criée. Le poisson ne se garde pas. |
| TW-N-13 | La flotte de départ compte dix bateaux : deux au joueur, huit aux capitaines NPC. |

### 4.3 Les licences

| Réf. | Exigence |
|---|---|
| TW-N-20 | Il existe 20 licences. Chacune autorise 70 caisses débarquées par semaine, soit 1 400 caisses pour tout le port. |
| TW-N-21 | Un capitaine qui a épuisé son quota de la semaine reste à quai jusqu'au lundi. |
| TW-N-22 | Une licence est un token échangeable. Un capitaine NPC en vend une quand il manque d'or, et en achète une quand son quota le limite. |
| TW-N-23 | Une licence détenue mais non pêchée retire 70 caisses par semaine de la pression sur la mer. |

Le total autorisé est près du double de ce que les trois zones peuvent donner durablement, environ 770 caisses par semaine. Le quota a été fixé dans les bonnes années, et personne n'a intérêt à le baisser seul.

### 4.4 La criée

| Réf. | Exigence |
|---|---|
| TW-N-30 | Chaque lot est mis en vente à un prix qui descend. Le premier acheteur dont la limite est atteinte emporte le lot à ce prix. |
| TW-N-31 | Limite d'un acheteur = prix de base × facteur de stock. Le facteur dépasse 1 quand son stock est sous sa cible, et passe sous 1 quand il est au-dessus. |
| TW-N-32 | Après un achat, le stock de l'acheteur monte, donc sa limite baisse pour le lot suivant. |
| TW-N-33 | Un lot qu'aucun acheteur ne prend au-dessus du prix plancher est perdu. |

**Exemple chiffré.** Le lot 31 contient 14 caisses de hareng.

| Acheteur | Calcul | Limite |
|---|---|---|
| Cannery | Base 4,0 × 0,90, car son stock est de 180 pour une cible de 150 | **3,6** |
| Fishmonger | Stock déjà haut | 3,2 |
| The Gull | N'achète pas de hareng | — |

L'horloge descend depuis 8,0 et s'arrête à 3,6 : la conserverie paie 50,4 or. La sortie a coûté 4 or. Son stock passe à 194, sa limite tombe à 3,4 : le lot suivant se vendra moins cher.

### 4.5 Le circuit de l'or

![Circuit de l'or et du poisson de Tidewater](visuels/tidewater-flux.png)

| Réf. | Exigence |
|---|---|
| TW-N-40 | L'or ne peut entrer que par les conserves exportées et les voyageurs de l'auberge, et sortir que par le carburant et les appâts importés. |
| TW-N-41 | Un lot invendu est un bien perdu. Il ne crée ni ne détruit d'or. |
| TW-N-42 | À chaque cycle, la simu vérifie que la variation du total de l'or est égale à la somme des flux extérieurs. |

### 4.6 Faillite et renflouement

| Réf. | Exigence |
|---|---|
| TW-N-50 | Un capitaine dont l'or est à zéro ou moins en fin de semaine désarme ses bateaux. Ses licences sont mises aux enchères. |
| TW-N-51 | Un acheteur dont l'or est à zéro ferme et n'enchérit plus. |
| TW-N-52 | Le joueur peut renflouer un acteur arrêté et toucher ensuite une part de ses bénéfices. |
| TW-N-53 | Un arrêt se lit sur la carte sans texte : bateaux couchés à quai, conserverie sans fumée, zone sans bancs dessinés. |

---

## 5. Couches de profondeur

### 5.1 Couche 1 — Personne ne voit le stock

Le stock n'est plus affiché. Il reste deux signaux : la prise par sortie de ses propres bateaux, et le registre du port. Un relevé payant donne une estimation pour une zone.

**Dilemme.** La prise par sortie baisse lentement et régulièrement, alors que la repousse s'effondre d'un coup sous un certain stock. Le seuil ne se connaît qu'une fois franchi. Faut-il payer pour savoir, ou se fier à ses prises ?

| Réf. | Exigence |
|---|---|
| TW-C1-01 | Le stock réel n'est jamais montré au joueur. |
| TW-C1-02 | Chaque zone affiche la prise par sortie du jour et sa tendance sur la semaine. |
| TW-C1-03 | Un relevé coûte 80 or, porte sur une zone, donne une estimation à 10 % près et vaut une semaine. |
| TW-C1-04 | Chaque capitaine NPC lit le signal à sa façon : Hale la moyenne sur quatre semaines, Brandt la veille, Okoro le voisin. |
| TW-C1-05 | Le panneau des juges montre le stock réel à côté de ce que voit le joueur. |

### 5.2 Couche 2 — Des espèces liées

La morue des Deeps se nourrit du hareng de Greybank. Et un filet à petites mailles prend aussi les jeunes poissons.

| Choix | Effet immédiat | Effet différé |
|---|---|---|
| Filet `Large mesh` | Prise normale | Aucun |
| Filet `Small mesh` | Prise augmentée de 40 % | Le taux de repousse de la zone baisse, jusqu'à moitié, selon la part des prises au petit maillage sur quatre semaines |
| Vider Greybank | Beaucoup de hareng | La capacité en morue des Deeps baisse dans la même proportion |

**Dilemme.** La morue vaut trois fois le hareng. Vider Greybank rapporte tout de suite, et fait disparaître avec retard l'espèce la plus chère.

| Réf. | Exigence |
|---|---|
| TW-C2-01 | Capacité en morue des Deeps = 2 000 × (stock de hareng de Greybank ÷ 5 000). |
| TW-C2-02 | Chaque bateau porte un filet, à grandes ou à petites mailles, que le joueur change à quai. |
| TW-C2-03 | Le taux de repousse d'une zone dépend de la part des prises au petit maillage sur les quatre dernières semaines. |
| TW-C2-04 | Le registre du port indique le filet de chaque bateau : le petit maillage se voit. |

### 5.3 Couche 3 — La dette pousse à pêcher

Un bateau coûte chaque jour, même à quai, et la banque du port prête pour en acheter.

**Dilemme.** Un capitaine endetté ne peut pas se permettre de rester à quai. Les frères Brandt pêchent trop parce qu'ils doivent 96 or par semaine. Le joueur peut racheter leur dette : pour leur laisser souffler, ou pour saisir leurs bateaux au premier défaut.

| Réf. | Exigence |
|---|---|
| TW-C3-01 | Chaque bateau coûte 6 or par jour de charges, versés aux équipages, qu'il sorte ou non. |
| TW-C3-02 | La banque prête jusqu'à 300 or pour un bateau de 400, à 3 % par semaine, remboursés par traites hebdomadaires. |
| TW-C3-03 | Après deux traites manquées, le bateau est saisi et vendu aux enchères. |
| TW-C3-04 | Un capitaine NPC à qui il manque de l'or pour sa prochaine traite sort tous ses bateaux et passe au petit maillage. |
| TW-C3-05 | Une dette est un token. Le joueur peut la racheter à la banque, puis accorder un report ou saisir en cas de défaut. |
| TW-C3-06 | Le raisonnement s'affiche : `Brandt sends every boat with small mesh: loan payment due in 2 days, 140 short.` |

### 5.4 Couche 4 — Le conseil du port

À chaque fin de saison, les capitaines votent le quota de la saison suivante. Une licence vaut une voix.

**Dilemme.** Chaque NPC vote selon son intérêt, sa propre lecture du stock et sa dette. Pour faire passer une baisse, le joueur doit indemniser ceux qu'elle pénalise, ou racheter assez de licences pour peser seul.

| Réf. | Exigence |
|---|---|
| TW-C4-01 | Le conseil vote le quota par licence de la saison suivante. Il peut aussi fermer une zone ou interdire le petit maillage. |
| TW-C4-02 | Chaque NPC vote pour l'option qui lui rapporte le plus sur la saison, d'après sa propre estimation. |
| TW-C4-03 | Le joueur peut proposer une règle et y attacher une indemnité, en or par licence et par semaine, versée à ceux qui votent pour. |
| TW-C4-04 | Le prix d'une licence suit le revenu qu'elle laisse espérer : il monte quand la mer va bien. |
| TW-C4-05 | Le vote de chacun s'affiche avec son calcul : `Brandt votes no: a 50-crate quota costs him 640 a week, your offer pays 400.` |

---

## 6. Tokens (NEP-245)

| TokenId | Nom | Nature |
|---|---|---|
| 0 | Gold | Monnaie |
| 1 | Herring | Fongible |
| 2 | Cod | Fongible |
| 3 | Licence | Fongible, 20 en circulation |
| 10 à 29 | Boat deed | Un identifiant par bateau, quantité 1 |
| 100 et plus | Loan note | Un identifiant par dette, cessible |
| 200 et plus | Share | Part d'un acteur renfloué |

Le poisson en mer n'est pas un token : il n'appartient à personne tant qu'il n'est pas pêché. C'est le sujet du jeu.

---

## 7. Interface

| Réf. | Exigence |
|---|---|
| TW-UI-01 | Un seul écran en 1280×800, découpé selon la section 2.2. |
| TW-UI-02 | La carte marine est dessinée sur un canvas maison : côte, zones, bateaux. |
| TW-UI-03 | Affecter un bateau se fait en deux clics : le bateau, puis la zone. |
| TW-UI-04 | La criée montre l'horloge, la limite de chaque acheteur et le prix de vente. Elle se lit en quelques secondes. |
| TW-UI-05 | Chaque prix, chaque décision de capitaine et chaque vote a sa ligne de raisonnement brut. |
| TW-UI-06 | Une tendance à la baisse s'écrit en toutes lettres (`falling`) et change de couleur. Elle ne clignote pas. |
| TW-UI-07 | Les bateaux n'ont pas besoin de se déplacer pour que l'écran soit lisible : leur position finale suffit quand `prefers-reduced-motion` est actif. |

**Panneau `Judges`.**

| Réf. | Exigence |
|---|---|
| TW-J-01 | Fast-forward de 7 jours et de 28 jours, sans joueur. |
| TW-J-02 | Graphe du stock réel de chaque zone et du prix du hareng, avec les faillites marquées. |
| TW-J-03 | Or de chaque acteur, licences détenues, total de l'or, cumul des flux extérieurs. |
| TW-J-04 | Graine de la simu affichée : même graine, même saison. |

**Lignes de raisonnement prévues.**

```text
Sold to Cannery: 14 × 3.6 = 50.4. Limit 3.6 = base 4.0 × 0.90 (stock 180 of 150).
Brandt sends 4 boats to Greybank: best catch per trip yesterday.
Hale stays at the quay: catch per trip 9.8, below 70% of her average (15.2).
Okoro copies Brandt: 31 gold per boat yesterday, the best in port.
Greybank survey: about 3,000 crates, give or take 10%.
```

---

## 8. Exigences techniques et contraintes

| Source (dossier Market Town) | Application à Tidewater |
|---|---|
| 1.6, architecture | Règles en Rust dans des modules uniques, partagés par la simu et le contrat. Relais Python en bibliothèque standard. Simu déterministe pilotée par une graine. |
| 3.2, stack | React, Vite, TypeScript strict, CSS maison. Carte, criée et graphes sur canvas maison. Ni moteur de jeu, ni lib de charts, ni Tailwind. |
| 3.2, tailles | Chaque fichier sous 500 lignes, chaque fonction sous 50. Une règle par module : stocks, sorties, criée, licences, charges et dette, conseil. |
| 3.2, rendu | Net sur écran standard et haute densité, fluide en 1280×800. |
| 3.2, mouvement | `prefers-reduced-motion` respecté partout. |
| 3.2, qualité | Zéro erreur console sur le parcours de référence, vérifié en headless. |
| 3.3, goût | Ni violet ni indigo, pas de titre en dégradé, pas de fond crème uni, pas de verre dépoli généralisé, pas de grille de cartes identiques, pas d'emoji en guise d'icône. |
| 3.4, dépôt | Branche dédiée, PR avec `## Scope`, merge sur CI verte, commits petits. |
| 3.5, environnement | Port et état jetables pour chaque test, Chrome headless à profil séparé, aucun processus laissé derrière. |
| 3.6, langues | Docs et échanges en français. Code, commentaires et textes du jeu en anglais. |

**Parcours de référence** pour la vérification headless : authentification, affectation d'un bateau, attente d'un débarquement et de sa vente, achat d'une licence, fast-forward de 7 jours, lecture du graphe.

---

## 9. Direction visuelle

Une carte marine vue d'en haut, dans des verts profonds : la mer est le plateau de jeu.

| Rôle | Couleur |
|---|---|
| Fond | `#0f2a30`, sarcelle profond |
| Panneaux | `#163940` |
| Mer et zones | `#1b4a54` et `#24616c` |
| Côte | `#c9b083`, sable |
| Texte | `#e4ede6`, écume |
| Toi, et l'enchère | `#e0672f`, orange bouée |
| Or | `#e3b65a` |
| Okoro | `#8fc06f`, vert varech |

- La mer est verte, pas bleu nuit : le dossier interdit le violet et l'indigo.
- Une seule couleur vive, l'orange bouée, réservée au joueur et au prix de la criée.
- Une zone qui se vide perd ses bancs dessinés avant de perdre ses bateaux.

---

## 10. Lots et critères d'acceptation

| Lot | Contenu | Terminé quand |
|---|---|---|
| **0. Noyau** | Stocks visibles, flotte, sorties, criée, licences, faillite, écran, panneau juges | Deux bateaux laissés sur Greybank stabilisent le stock près de 2 600 caisses et la prise près de 62 caisses par jour. Cinq bateaux le vident. L'exemple 4.4 donne 3,6 puis 3,4. Une saison sans joueur se joue sans erreur. Le parcours de référence passe avec zéro erreur console. |
| **1. Stock caché** | Couche 1 | Le stock n'apparaît nulle part côté joueur. Un relevé donne une valeur à 10 % du stock réel. |
| **2. Espèces** | Couche 2 | Vider Greybank de moitié divise par deux la capacité en morue des Deeps. Le petit maillage augmente la prise de 40 % et réduit la repousse. |
| **3. Dette** | Couche 3 | Un capitaine à court pour sa traite sort tous ses bateaux. Deux traites manquées déclenchent une saisie. Le joueur peut racheter une dette et accorder un report. |
| **4. Conseil** | Couche 4 | Un vote a lieu à chaque fin de saison. Une indemnité suffisante fait changer le vote d'un NPC, et son calcul s'affiche. |

---

## 11. Risques et parades

| Risque | Parade |
|---|---|
| Le joueur seul ne pèse pas assez : 4 licences sur 20 | Trois leviers pèsent plus que ses bateaux : racheter des licences, racheter des dettes, acheter des voix. La simu doit prouver qu'une stratégie de sauvegarde gagnante existe. |
| La mer s'effondre trop vite, ou jamais | Le taux de repousse et la part prise par sortie se règlent en simulation, sur plusieurs graines, avant de construire l'interface. |
| Les NPC paraissent idiots ou imbattables | Trois tempéraments simples et affichés. Aucun n'optimise : chacun suit une règle que le joueur peut lire. |
| Le stock caché frustre | Le registre du port et le relevé donnent des prises. Le panneau des juges montre la vérité. |
| L'attente entre deux débarquements ennuie | Deux bateaux donnent un événement toutes les 50 secondes. Un bouton accélère jusqu'au prochain débarquement. |
| Le thème fait la morale | Le jeu ne juge pas : le score est la valeur nette. Une mer vide ne rapporte simplement plus rien. |

---

## 12. Valeurs de départ proposées

Ce sont des points de départ pour la simulation, pas des valeurs équilibrées.

| Paramètre | Valeur |
|---|---|
| Repousse | 5 % par jour pour le hareng, 2 % pour la morue |
| Part du stock prise par sortie | 0,4 % |
| Sorties par bateau et par jour | 3 |
| Prix de base | Hareng 4 or, morue 12 or |
| Facteur de stock d'un acheteur | 1 + 0,5 × écart relatif à sa cible |
| Licence | 70 caisses par semaine, 20 licences |
| Charges d'un bateau | 6 or par jour |
| Bateau neuf | 400 or |
| Prêt | 300 or au plus, 3 % par semaine |
| Relevé | 80 or |

---

## 13. Questions ouvertes

1. **Conservation.** Faut-il de la glace et un fumoir pour vendre plus tard, quand le prix remonte ?
2. **Score.** Valeur nette seule, ou valeur nette pondérée par le stock restant en mer ?
3. **Plafond de licences.** Le joueur peut-il racheter toutes les licences du port, ou faut-il un plafond par capitaine ?
4. **Défaite du joueur.** Bateaux désarmés et fin de session, ou reprise comme équipier d'un NPC le temps de se refaire ?
5. **Durée d'une saison.** Quatre semaines font 2 h 20 de jeu : le vote du conseil arrive-t-il trop tard pour une démo ?

---

*Sources vectorielles des visuels : `visuels/tidewater-ecran.svg`, `visuels/tidewater-flux.svg`, `visuels/tidewater-stock.svg`.*
