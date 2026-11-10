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
