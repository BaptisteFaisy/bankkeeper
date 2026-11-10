# Barreau 5 — Réparer : la jachère collective et le contentieux

> Cinquième et dernier barreau de la colonne vertébrale (`docs/SPINE.md`). Le
> barreau 4 écrivait la facture laissée à la mer ; le barreau 5 apporte la
> réparation collective : **la jachère votée au conseil** et **le recours
> contre le fonds**. Deux sorties, et elles sont collectives.

---

## 1. La jachère collective

### Mécanique
Le Conseil peut voter la fermeture d'une zone pour $N$ semaines (1 à 4 semaines,
par défaut la durée de la saison).
- **Règle dans la motion** : `close:<zone>` ou `close:<zone>:<weeks>` (ex: `close:greybank:2`).
- **Fermeture unifiée** : s'exécute par le même mécanisme que la jachère
  individuelle du barreau 4 (`Game::close_zone_for`) :
  - la zone est marquée fermée (`closed[z] = true`) et le compteur de jachère
    est incrémenté de $N$ semaines (`fallow[z] += N`) ;
  - les bateaux affectés à la zone sont renvoyés au quai ;
  - aucune sortie ne peut plus cibler cette zone pendant toute la durée.
- **Effets biologiques** : la repousse logistique s'opère chaque soir à plein,
  sans aucune ponction de pêche.
- **Indemnisation par le fonds** : le fonds du port indemnise les capitaines
  que la fermeture pénalise (ceux qui pêchaient historiquement sur cette zone),
  à proportion de leur perte hebdomadaire estimée, dans la limite des réserves
  du fonds.
- **Conservation de l'or** : l'or passe du fonds du port aux capitaines lésés,
  donc `Game::gold_total()` reste strictement conservé.

---

## 2. Le contentieux (Recours contre le fonds)

### Principe
Un capitaine lésé par une règle votée (fermeture collective de zone ou baisse
brutale de quota) peut déposer une réclamation auprès du fonds du port. Le
joueur peut être le plaignant, ou celui dont la motion a causé le litige.

### Paramètres et bornes
1. **Borne stricte : une réclamation par saison, pas plus**.
   Le contentieux ne doit pas devenir une machine à ralentir le jeu. Toute
   deuxième réclamation dans la même saison est refusée immédiatement à la
   frontière (`claims_this_season < 1`).
2. **Évaluation du préjudice** :
   - Le préjudice prouvé (`proven_loss`) est calculé à partir du journal : caisses
     perdues du fait d'une zone votée fermée ou quota amputé sans indemnité.
   - Si la demande est abusive (dépasse 2 × le préjudice prouvé, ou aucun
     préjudice réel), le recours est **rejeté**.
3. **Issue du recours** :
   - **Recours accueilli (`Upheld`)** : le fonds paie le préjudice prouvé
     au demandeur (dans la limite de son solde ; le reliquat éventuel reste dû).
     L'or est conservé dans le port.
   - **Recours rejeté (`Dismissed`)** : le demandeur perd **2 points de
     crédibilité** (`CLAIM_LOST_CREDIBILITY_PENALTY`).
4. **Impact de la crédibilité sur la gouvernance** :
   - La crédibilité est directement liée au système moral (`favours`).
   - Un proposant dont la crédibilité tombe sous le plancher (-3) voit ses
     motions rejetées dès la recevabilité (`govern::admission`) : le conseil
     n'examine pas la motion d'un capitaine discrédité.
   - Les NPC votent selon leur confiance : un capitaine envers qui le joueur est
     décrédibilisé exige une prime plus élevée pour soutenir ses motions.

---

## 3. Affichage au registre

Le registre du port (`LedgerPanel` / `DisputeBlock`) affiche en permanence :
- les zones fermées et les semaines de jachère restantes (`fallowWeeks`) ;
- le montant total indemnisé par le fonds (`fallowIndemnitiesPaid`) ;
- l'issue factuelle du recours de la saison (`lastClaim`), sans sermon ni
  jugement moral.
