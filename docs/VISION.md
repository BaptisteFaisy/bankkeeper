# Tidewater — où l'idée peut aller (plan de conception)

> Écrit le 10 novembre 2026, après la mise en conformité au track. Ce document
> ne parle pas de plomberie : il parle de **ce que le jeu veut dire**, et de ce
> qu'il faudrait construire pour le dire plus fort. Chaque piste donne la
> mécanique, ce qu'elle change, son coût, et son risque.

## Où en est l'idée aujourd'hui

Le joueur est capitaine dans un port où **le banc n'appartient à personne**. Ce
qu'il prend aujourd'hui décide de ce qu'il restera demain — pour lui comme pour
les autres. Trois leviers économiques peuvent retenir la main : les licences
(quota), la dette (qui pousse à pêcher), le conseil (qui vote les règles).

L'idée est juste, mais elle est encore **solitaire** : la tragédie des communes
se joue entre un joueur et des automates. Le jeu dit « voici comment une
ressource commune s'épuise » ; il ne dit pas encore « voici comment *nous* l'avons
épuisée, et voici ce qu'il en reste ». C'est le saut à faire.

## L'étoile polaire

À la fin de la campagne, le joueur devrait pouvoir dire cette phrase, et qu'elle
soit vraie :

> « Mes prises ont fait baisser le prix payé à tout le monde pendant trois jours.
> Deux capitaines ont fermé. La règle que j'ai fait voter en saison 2 tient
> toujours, et la mer n'est pas revenue. »

Tout ce qui suit sert à rendre cette phrase possible.

---

## Piste 1 — La criée devient commune entre joueurs (le grand saut)

**Mécanique.** Une place de marché par espèce et par fenêtre horaire : chaque
joueur y dépose ses lots, le prix de la fenêtre est calculé sur **le tonnage
total**, et ce prix s'applique à tout le monde. Les marchands sont partagés :
ils ont un stock global, un budget global, et ferment pour de vrai quand le
budget tombe à zéro — la réouverture demande un investissement, comme dans le
brief du track.

**Ce que ça change.** L'externalité devient humaine. Inonder la criée ne fait
plus baisser *son* prix, mais celui de tous, et le registre montre qui a débarqué
quoi. C'est à ce moment que la réputation, la vindicte et les accords de
gentlemen apparaissent — sans qu'on ait à les coder comme des systèmes.

**Coût.** Élevé : un agrégateur (contrat ou service signé), une fenêtre de prix,
et le moteur qui accepte un prix imposé de l'extérieur au lieu de le calculer.
Le solo reste le mode par défaut ; la criée commune est un bassin.

**Risque.** Un joueur qui débarque 10 000 caisses peut ruiner l'économie de la
journée pour tout le monde. Parade : plafond par fenêtre et par joueur (un
« quota de débarquement »), qui est déjà dans la fiction du jeu.

---

## Piste 2 — La licence devient un actif louable, donc le pouvoir devient un marché

**Mécanique.** Une licence porte 70 caisses de quota par semaine. Aujourd'hui on
l'achète ou on la vend. Demain on peut aussi **la louer** : le preneur pêche, le
bailleur encaisse un loyer hebdomadaire, et la licence peut servir de **garantie**
pour un prêt.

**Ce que ça change.** Trois choses d'un coup : un capitaine pauvre peut pêcher
sans capital (il loue), un capitaine riche peut vivre de la rente (il ne pêche
plus), et la dette s'adosse sur un actif qui produit. Le marché des licences
devient le marché du **droit de pêcher** — et comme une licence vaut une voix,
c'est aussi le marché du pouvoir. La politique du port cesse d'être un mini-jeu
de vote pour devenir une position économique.

**Coût.** Faible : les règles existent (quota, prix, vote pondéré). Il faut un
contrat de location (durée, loyer, défaut) et deux écrans. C'est la meilleure
idée par heure de travail de tout ce document.

**Risque.** Le joueur riche achète tout et loue à des prix usuraires. C'est
intéressant… une saison. Contre-poids naturel : le plafond de 8 licences par
capitaine, déjà en place, plus un droit de préemption des NPC sur leurs propres
licences.

---

## Piste 3 — Le port a une mémoire, et le joueur laisse une institution

**Mécanique.** Une **chronique** publique, append-only : chaque saison close y
laisse une ligne (valeur nette, état de la mer, faillites, règle votée, et qui a
payé). La campagne suivante **commence avec la mer que la précédente a laissée**,
pas avec une mer neuve. À la fin des trois saisons, le joueur rédige une
**charte** : une règle qui s'applique à toutes les campagnes suivantes du port
(quota maximum, interdiction du petit maillage, taxe sur les licences
inutilisées).

**Ce que ça change.** Le score cesse d'être « combien j'ai gagné » et devient
« qu'est-ce que je laisse ». Une mer morte n'est plus une fin de partie, c'est
un héritage empoisonné pour les suivants. C'est là que le thème cesse d'être une
leçon et devient une responsabilité.

**Coût.** Moyen : la chronique est un journal signé (ou des événements
on-chain), la mer héritée est déjà possible (`open_next_season` garde les
stocks), la charte est une règle persistée appliquée au `seed_game`.

**Risque.** Un port qui s'appauvrit de campagne en campagne devient injouable
pour les nouveaux. Parade : une jachère — une zone laissée fermée un an reprend
20 % de capacité — qui est aussi une décision politique intéressante.

---

## Piste 4 — Les NPC se souviennent de ce que tu leur as fait

**Mécanique.** Chaque capitaine NPC tient un **registre de faveurs** : racheter
la dette des Brandt te donne un an de loyauté (ils votent avec toi) ; saisir
leur coque t'en fait un ennemi qui vote contre, et qui pêche au petit maillage
par dépit. Les marchands aussi : renflouer la conserverie te donne un droit de
préférence sur ses achats.

**Ce que ça change.** Le conseil cesse d'être une addition de votes calculés :
il devient un jeu de dettes morales. Le raisonnement affiché (« Brandt votes
non : le quota vous coûte 640 par semaine, votre offre en paie 400 ») gagne une
seconde ligne : « et il ne vous doit rien ».

**Coût.** Faible à moyen : une table de relations par acteur, deux ou trois
branchements dans `bots.rs` et `council.rs`.

**Risque.** Devenir un jeu de réputation opaque. Parade : la faveur est un
nombre affiché, comme tout le reste — le jeu ne cache jamais ses règles.

---

## Piste 5 — La mer ne revient pas toute seule

**Mécanique.** Sous un seuil de stock (par exemple 15 % de la capacité), une
zone bascule en **état mort** : la repousse s'arrête complètement, et il faut
**restaurer** (repos de plusieurs saisons, réensemencement payant, fermeture
votée). Le fumier de la conserverie devient un intrant : on peut investir dans
la mer.

**Ce que ça change.** L'irréversibilité. Aujourd'hui une mer vide repousse
lentement ; demain elle ne repousse plus, et la seule sortie est une décision
collective coûteuse. C'est la différence entre « attention » et « c'est fini ».

**Coût.** Moyen, et **c'est le plus risqué pour l'équilibrage** : il faut le
harnais (`docs/BALANCE.md`) pour vérifier qu'une partie n'est pas perdue d'avance
au bout de deux saisons.

**Risque.** La mort irréversible frustre si elle est invisible. Parade : les
signaux existent déjà (prise par sortie, tendance, relevé payant) ; il faut les
rendre plus tranchants avant d'ajouter le seuil.

---

## Piste 6 — Les marchands deviennent des agents avec des contrats

**Mécanique.** Trois ajouts, dans cet ordre de valeur : **contrats à terme** (la
conserverie achète 200 caisses par semaine à prix fixe — le joueur troque la
volatilité contre la sécurité), **crédit** (un marchand à court achète à crédit,
ce qui crée une créance négociable), **substitution** (quand le hareng manque,
la conserverie se tourne vers la morue et l'import, ce qui change la demande de
fond).

**Ce que ça change.** La courbe de demande devient endogène : les prix ne
répondent plus seulement au stock, mais aux engagements pris. Un marché à terme
est exactement ce qui manque à une économie de pêche pour être crédible.

**Coût.** Élevé. C'est le chantier le plus lourd, et le plus facile à rendre
illisible.

**Risque.** Trois instruments financiers dans un jeu de 5 minutes par jour : la
complexité tue. À ne faire qu'après la piste 2, et avec un seul contrat à la
fois.

---

## Ordre conseillé

| Rang | Piste | Pourquoi ce rang |
|---|---|---|
| 1 | **2 — licence louable** | meilleure idée par heure : le pouvoir devient un marché, presque tout le code existe |
| 2 | **1 — criée commune** | le saut conceptuel : la commons devient humaine ; c'est la phase 3 déjà engagée |
| 3 | **3 — chronique et charte** | transforme le score en héritage ; donne une fin qui a du sens |
| 4 | **4 — faveurs des NPC** | peu cher, rend le conseil vivant |
| 5 | **5 — mer irréversible** | fort, mais ne pas toucher avant d'avoir le harnais d'équilibrage |
| 6 | **6 — contrats marchands** | puissant et dangereux ; en dernier, un instrument à la fois |

## Ce que je ne ferais pas

- **Multijoueur temps réel / PvP** : on perd les 30 secondes de réflexion et la
  criée commune donne déjà l'essentiel du frisson social.
- **Campagne narrative à quêtes** : le port raconte déjà quelque chose par ses
  chiffres ; des dialogues ajouteraient du texte là où le jeu est fort sans.
- **Nouvelles espèces, nouvelles zones** avant les pistes 1 à 3 : plus de
  contenu ne creuse pas l'idée, ça l'étale.

## Ce qu'il faut décider

1. **La criée commune** : bassin global, ou bassin par « ligue » de joueurs (plus
   sûr, moins grisant) ?
2. **La charte** : une règle par campagne, ou un texte de trois règles ?
3. **La mer irréversible** : seuil dur (une zone peut mourir), ou seuil souple
   (la repousse s'effondre mais ne s'arrête jamais) ?

---

# Deuxième horizon — après les cinq pistes

> Les six frontières ci-dessus creusent l'idée *dans* le port : le marché, les
> licences, la mémoire, les dettes morales, la mer. Ce qui suit change d'échelle.
> Ce sont les questions qu'un jeu sur les communs finit forcément par poser, et
> qu'aucune des cinq pistes ne pose encore.

## L'étoile polaire, deuxième

> « Vous laissez le registre le plus riche et le port le plus vide. »
> Le jeu doit pouvoir se terminer sur ce verdict **sans le prononcer**.

Tout ce qui suit sert à rendre cette phrase possible — et à faire en sorte
qu'elle ne soit pas la seule fin possible.

---

## Piste 7 — Le banc ne s'arrête pas au môle (la bonne échelle)

**La question.** Et si votre port était irréprochable, et que la mer mourait
quand même ?

**Mécanique.** Le hareng **migre** entre trois zones et **deux ports voisins**.
Les ports voisins ont leur propre conseil, leur propre quota, et leurs propres
intérêts. Le stock total est commun ; les décisions ne le sont pas. Le joueur
peut négocier un **traité** : quota partagé, surveillants, sanctions, ou
transfert d'or contre effort de pêche.

**Ce que ça change.** La leçon change de nature : ce n'est plus « les individus
surpêchent », c'est **« une institution doit avoir l'échelle de la ressource »**.
Un port vertueux qui pêche un banc que son voisin vide n'a rien réglé. C'est le
vrai problème des pêcheries, et presque aucun jeu ne le dit.

**Coût.** Moyen-élevé : un second port (une instance de `Game` dégradée), une
migration entre zones, des négociations à plusieurs tours.

**Risque.** Un joueur peut perdre sans avoir rien fait de mal. C'est
philosophiquement juste et ludiquement frustrant : il faut une sortie — la
possibilité d'acheter le silence du voisin, ou de porter l'affaire devant une
autorité régionale.

---

## Piste 8 — La science est un bien commun, et elle se ment

**La question.** Que vaut une estimation quand c'est celui qui pêche qui la paie ?

**Mécanique.** Les relevés (aujourd'hui 80 or, ±10 %) deviennent **publics et
signés** : quand un joueur paie un relevé, tout le port en profite — mais avec
sa **réputation** attachée. Un relevé peut être **publié faux** (mentir sur le
banc pour faire partir les autres) ; la crédibilité d'un capitaine est une
moyenne de ses relevés passés vérifiés a posteriori. Le conseil vote sur des
chiffres dont il ne sait pas s'ils sont bons, et le joueur non plus.

**Ce que ça change.** L'information cesse d'être un achat et devient un **actif
politique**. C'est exactement le nœud des pêcheries réelles : les scientifiques,
les pêcheurs et les politiques ne partagent pas les mêmes chiffres. Et ça donne
au joueur un troisième levier, après la licence et la dette : **la parole**.

**Coût.** Moyen : un registre de relevés avec auteur et crédibilité, un vote qui
pondère par la crédibilité, deux écrans.

**Risque.** Un système de réputation mal réglé rend le mensonge inutile (donc
inintéressant) ou dominant (donc toxique). À calibrer avec le harnais.

---

## Piste 9 — Le basculement d'écosystème (une autre fin de partie)

**La question.** Et si la mer ne revenait pas *sous la même forme* ?

**Mécanique.** Sous un seuil, la zone ne s'appauvrit pas : elle **bascule**. Le
hareng laisse place à autre chose (méduse, lançon, rien), avec une nouvelle
capacité, une nouvelle espèce, de nouveaux acheteurs, et **un régime stable** :
ça ne « repousse » plus vers l'ancien état. Le joueur ne restaure pas, il
**s'adapte** : nouvelles licences, nouveaux marchés, valeur plus basse, mémoire
du port qui garde la trace de ce qui a été perdu.

**Ce que ça change.** La fin de partie cesse d'être « pauvre » et devient
« autre ». C'est la différence entre un malus et un **monde différent** — et
c'est écologiquement exact : les écosystèmes ne reviennent pas, ils se
réorganisent.

**Coût.** Moyen : une seconde table d'espèces/prix, un état de zone, l'adaptation
des acheteurs. Le harnais est indispensable pour vérifier qu'on ne bascule pas
au bout de deux saisons sans avoir rien fait.

**Risque.** Le joueur peut ne pas comprendre qu'il a changé de monde. Il faut un
signe fort, non textuel : la carte, les couleurs, les bateaux.

---

## Piste 10 — Le port, ce sont des gens (un second score)

**La question.** Une valeur nette, c'est un chiffre. Un port qui se vide, c'est
une histoire.

**Mécanique.** Les habitants sont déjà là (`Townsfolk`, salaires versés par la
conserverie). Ils deviennent un **acteur lent** : sans travail, ils **partent** ;
quand ils partent, le port perd ses acheteurs, son école, son quorum au conseil.
La population est un **second axe de score**, non monétaire, et elle ne se
rachète pas — elle se regagne en années.

**Ce que ça change.** Le bilan cesse d'être une addition : il devient un
arbitrage. On peut finir riche avec un port mort, et le jeu n'a plus besoin de
morale — la ligne « habitants : 340 → 90 » la porte toute seule.

**Coût.** Faible-moyen : une variable lente, une boucle d'emploi, une ligne de
bilan, des conséquences sur les acheteurs.

**Risque.** Ajouter un axe de score sans le rendre lisible. Parade : il
n'apparaît pas en cours de partie, seulement au bilan et sur la carte (des
maisons vides).

---

## Piste 11 — Gagner en devenant rentier (et que le bilan le dise)

**La question.** Et si la meilleure stratégie était de ne plus pêcher du tout ?

**Mécanique.** Avec la piste 2 (licences louables), la piste 6 (contrats) et les
parts de renflouement, le joueur peut finir par **posséder** : des licences
louées, des dettes productives, des parts de conserverie, des contrats à terme.
Il gagne sans mettre un bateau à l'eau — et c'est **légitime** dans les règles.

**Ce que ça change.** Le jeu cesse d'être un jeu de pêche et devient un jeu
d'économie politique : on peut gagner en étant le rentier du port. Le bilan le
dit sans juger : « revenus : 82 % de loyers et d'intérêts ; bateaux en mer : 0 ;
mer : intacte ; habitants : 120 ». Deux victoires possibles, deux ports
différents — et le joueur choisit ce qu'il laisse.

**Coût.** Faible : c'est la conséquence des pistes 2 et 6, plus une **ventilation
des revenus** dans le bilan (loyers / ventes / intérêts / parts).

**Risque.** Que ce soit *la* stratégie dominante et que le jeu devienne un
tableur. Contre-poids : les loyers sont plafonnés par la capacité des preneurs à
payer, et un port sans pêcheurs n'a plus de rente à prélever — la rente se
retourne contre elle-même.

---

## Piste 12 — La politique entre joueurs, en asynchrone

**La question.** Et si le conseil était composé de vraies personnes, une
décision par jour ?

**Mécanique.** Une saison dure **24 heures réelles** : chacun joue ses journées
à son rythme (le moteur tourne par lots de 30 s quand on est là), et **le vote
du conseil est asynchrone** — motions déposées, promesses, coalitions, échanges
de voix contre des loyers de licences. Le résultat s'applique à tous à l'heure
dite.

**Ce que ça change.** C'est le seul multijoueur qui préserve les 30 secondes de
réflexion : pas de temps réel, pas de clic rapide. Et c'est là que la piste 8
(la parole a une crédibilité) prend toute sa valeur : mentir à des humains a un
coût social.

**Coût.** Élevé : comptes, fenêtres de vote, anti-triche, et une population de
joueurs à trouver (un jeu de 5 minutes par jour est plus dur à remplir qu'un jeu
de 5 minutes tout court).

**Risque.** Le pire des deux mondes si l'audience est faible : un conseil vide.
Parade : des NPC qui prennent les sièges vacants, avec les règles de la piste 4.

---

## Ordre conseillé (deuxième horizon)

| Rang | Piste | Pourquoi |
|---|---|---|
| 1 | **10 — les gens du port** | peu cher, transforme le bilan, corrige le score plat |
| 2 | **11 — gagner en rentier** | presque gratuit une fois la piste 2 faite, et c'est un propos |
| 3 | **8 — la science qui se ment** | le levier le plus original du jeu, coût moyen |
| 4 | **7 — le banc ne s'arrête pas au môle** | la vraie leçon des communs, coût élevé |
| 5 | **9 — le basculement** | une autre fin de partie, mais après le harnais |
| 6 | **12 — politique asynchrone** | le plus ambitieux, et le seul qui demande une audience |

## Ce que ce deuxième horizon interdit

- **Ajouter un troisième axe de score** (argent, population, mer) : trois, c'est
  déjà un jeu de gestion ; deux, c'est une histoire.
- **Expliquer la morale.** Aucun écran ne doit dire « vous avez trop pêché ». Les
  chiffres du bilan suffisent, et ils sont plus durs qu'un sermon.
- **Le temps réel compétitif.** Le jeu est lent par choix ; la lenteur est ce qui
  permet de réfléchir à la ressource au lieu de cliquer dessus.

## Décisions à prendre

1. **Piste 7** : deux ports voisins, ou une seule autorité régionale qui impose
   un quota total (moins de code, moins de drame) ?
2. **Piste 9** : le basculement est-il réversible (à très long terme), ou
   définitif ?
3. **Piste 12** : une saison = 24 h réelles, ou 1 h (plus facile à remplir, moins
   de politique) ?
