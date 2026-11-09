# Tidewater — Démo juges

> Panneau `Judges` (TW-J-*) et parcours de référence (brief §7–§8).
> L'économie tourne sans aucun joueur (O3).

## Panneau `Judges`

- **Fast-forward** de 7 jours et de 28 jours, sans joueur (TW-J-01).
- **Graphe** du stock réel de chaque zone et du prix du hareng, avec
  les faillites marquées (TW-J-02). Dès le lot 1, le stock réel n'est
  visible que là : le panneau montre la vérité à côté de ce que voit
  le joueur (TW-C1-05).
- **Or** de chaque acteur, licences détenues, total de l'or, cumul des
  flux extérieurs — pour vérifier l'invariant TW-N-42 à l'œil (TW-J-03).
- **Graine** affichée : même graine, même saison (TW-J-04).

## Parcours de référence (headless, zéro erreur console)

1. Authentification (email, pas de wallet).
2. Affectation d'un bateau (deux clics : bateau, puis zone).
3. Attente d'un débarquement et de sa vente à la criée.
4. Achat d'une licence.
5. Fast-forward de 7 jours.
6. Lecture du graphe (stocks réels, prix, faillites).

## Protocole de vérification

- Chrome headless à profil séparé sous `/tmp` (jamais le profil du
  user), garde `chrome-profile-guard` avant et après.
- Ports et fichiers d'état jetables par run ; relais de dev sur 8785,
  **jamais** le live 8775 ni le service 8765.
- Kill par PID exact uniquement, aucun processus laissé derrière.
- Console lue à la fin : zéro erreur exigée (brief §8, TW qualité).

## Critères d'acceptation du lot 0 (brief §10)

- Deux bateaux sur Greybank stabilisent le stock près de 2 600 caisses
  et la prise près de 62 caisses par jour ; cinq bateaux le vident.
- L'exemple §4.4 donne 3,6 puis 3,4 exactement.
- Une saison sans joueur se joue sans erreur, sur plusieurs graines.
- Le parcours de référence passe avec zéro erreur console.
