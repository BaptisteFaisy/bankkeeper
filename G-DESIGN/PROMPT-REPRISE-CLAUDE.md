# PROMPT À COLLER — nouveau chat Claude (reprise design bankkeeper)

Copier le bloc ci-dessous tel quel dans un nouveau chat Claude.

---

```
Projet : bankkeeper (jeu Tidewater) — hackathon NEAR, track Games With Real Economies.
Tâche : REPRENDRE LE DESIGN DEPUIS ZÉRO. Les tentatives précédentes (V1 à V4)
ont été rejetées par Gaia : pas assez d'identité visuelle, pas assez réaliste,
pas assez « on comprend d'un coup d'œil de quoi il s'agit ».

1. Lis d'abord, dans cet ordre :
   - HACKATONS/CLAUDE.md
   - HACKATONS/prompts/07-design.md
   - HACKATONS/AGENTS.md
   - HACKATONS/2026-11-15-near/Games/bankkeeper/G-DESIGN/REBRIEF-CLAUDE.md
     (le re-brief complet : ce que Gaia veut, ce qu'est le produit, ce qui a
     échoué et pourquoi, les contraintes dures, la première livraison attendue)
   - HACKATONS/2026-11-15-near/Games/bankkeeper/G-DESIGN/FONCTIONNALITES.md
     (l'inventaire fonctionnel complet, écrit depuis le code — document fiable)

2. IGNORE G-DESIGN/BRIEF-UI.md : il décrit un jeu idle Telegram qui n'existe pas
   dans le code. Décision de Gaia (2026-11-11) : le design s'aligne sur le code.

3. Le repo code est en LECTURE SEULE (c'est le travail de Baptiste) :
   HACKATONS/2026-11-15-near/Games/bankkeeper/
   Lis-y : README.md, tidewater.md (§2.2 et §9), docs/ART.md, docs/SPINE.md,
   docs/GAME-LOOP.md, docs/BALANCE.md, docs/DEMO-JUGES.md, web/src/styles.css,
   web/src/App.tsx et web/src/components/.

4. Ce que Gaia veut, en une ligne : un port de pêche en 3D, fond sombre,
   DEUX couleurs (le bleu clair cyan est retenu), extrêmement moderne,
   où l'on comprend le jeu en 3 secondes, où tout est montré plutôt
   qu'expliqué, avec un bouton qui joue toute la campagne.

5. Commence par UNE SEULE image de référence (pas six planches) : le port vu de
   la mer, en 3D, 1280x800, HTML autonome, zéro dépendance, hors-ligne.
   Le détail du cahier des charges visuel est dans REBRIEF-CLAUDE.md §2 et §7.

6. Important : itère VISUELLEMENT avec Gaia (montre, attends le retour, corrige),
   une direction à la fois. Ne produis pas plusieurs directions en parallèle.
   N'ajoute pas de détail avant que la composition soit juste.

7. Matériel réutilisable (technique seulement, pas esthétique) :
   G-DESIGN/v4/gl-core.js (moteur WebGL1 maison + maillages),
   harbour.js (renderer, caméra orbitale, shaders ciel/eau),
   day.js (machine à états de la campagne en 10 étapes),
   harbour.html (HUD). Lis la section « Ce qui a échoué » de REBRIEF-CLAUDE.md
   avant de t'en servir : trois bugs majeurs y sont documentés.

8. Contraintes dures : aucune dépendance npm, aucun asset externe, aucune police
   web, prefers-reduced-motion respecté, sélecteurs e2e préservés, fichiers
   < 500 lignes, fonctions < 50 lignes. La CI interdit les dégradés CSS et le
   backdrop-filter ; ajouter un accent à la palette est permis mais demande un
   avenant à docs/ART.md (à signaler dans HANDOFF.md).

9. À la fin de la session : mets à jour ta section ## Claude dans
   G-DESIGN/STATUS.md, termine par un résumé + un prompt relais prêt à coller,
   et rappelle les six commandes : /planches /variantes /delta /cible /compare /lock.

Deadline design : 14/11. Soumission : 15/11 00:59 Paris. Langue : français.
```

---

## Rappel des six commandes design

| Commande | Effet |
|---|---|
| `/planches N` | N directions franchement différentes (défaut 3) |
| `/variantes` | décliner la direction courante |
| `/delta` | appliquer une liste de retours numérotés |
| `/cible <écran>` | zoomer sur un écran ou un composant |
| `/compare A B` | côte à côte pour trancher |
| `/lock` | verrouiller, fin des explorations |
