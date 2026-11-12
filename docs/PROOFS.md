# Preuves publiques — `/proofs.html`

> Une page statique qui laisse un juge vérifier le projet sans nous croire.
> Le contrat est déployé sur NEAR testnet depuis le 11 novembre 2026 : la
> page lit son adresse dans `docs/deployments.md` et passe d'elle-même en
> lecture « live », sans qu'aucune adresse ne soit écrite à la main.

## Où elle vit

| Élément | Chemin |
|---|---|
| Entrée HTML | `web/proofs.html` |
| Entrée Vite | `web/proofs.tsx` → `web/src/proofs/*` (page) et `web/src/proofs.css` |
| RPC | `web/src/near/rpc.ts` (`viewFunction`, `decodeResult`) — aucune dépendance npm |
| Source unique de l'adresse | `docs/deployments.md`, lu par `web/src/proofs/deployment.ts` |
| Entrées du build | `web/vite.config.ts`, `rollupOptions.input` : `index.html` + `proofs.html` |
| Build | `cd web && npm run build:offline` |
| URL | `/proofs.html` (le jeu reste à `/`) |
| Test headless | `python3 tests/e2e_proofs.py` |

La page n'ajoute aucune dépendance npm : React (déjà là) et `fetch`. Elle ne
lit ni ne stocke aucune clé, et n'appelle aucun service maison — elle ne fait
**aucune** requête réseau en dehors de la lecture du RPC NEAR.

## L'adresse du contrat : un seul endroit

L'adresse n'est écrite qu'une fois dans le dépôt : `docs/deployments.md`, que
`scripts/testnet/deploy.mjs` écrit au moment du déploiement. Le module
`web/src/proofs/deployment.ts` est le **seul** lecteur de ce document ; il en
tire l'identifiant du contrat et le tableau des transactions, et les deux
consommateurs (`chain.ts` pour l'adresse, `timeline-data.ts` pour les hashs) le
prennent de là. Aucune adresse n'est recopiée dans le code.

Ordre de résolution, du plus explicite au plus implicite :

1. `?contract=<compte.testnet>` dans l'URL ;
2. `localStorage.tidewater-chain-v1` ;
3. `VITE_TIDEWATER_CONTRACT` (variable de build, pour un build ponctuel) ;
4. `docs/deployments.md` — la valeur par défaut, celle du run réel.

## Les quatre blocs, dans l'ordre

1. **Le contrat.** L'identifiant vient de cette cascade (voir plus haut). Sans
   identifiant — donc avant tout déploiement, ou si `docs/deployments.md` ne
   décrit aucun contrat — la page affiche « pas encore déployé » et explique
   qu'elle ne peut rien lire on-chain. Avec un identifiant, elle lit
   `mt_supply` en direct et affiche le badge « live · lu sur la chaîne ».
2. **Les tokens NEP-245.** Dès qu'un contrat répond : `mt_supply` pour l'or
   (`0`), le hareng (`1`), la morue (`2`) et les licences (`3`, 20 attendues),
   sur `https://rpc.testnet.fastnear.com`, en lecture seule, avec un bouton
   `Rafraîchir`. Un échec par jeton est affiché ligne par ligne ; si aucun jeton
   ne répond, la page écrit « aucune réponse » et **ne prétend pas** être live.
   Pendant la lecture, elle dit qu'elle lit — jamais « aucune réponse ».
3. **La saison partagée.** `?seed=` et `?weeks=` sont lus dans l'URL de la page,
   et le lien `Rejouer cette saison` pointe sur `/?seed=…&weeks=…` — exactement
   les deux paramètres que `web/src/boot.ts` consomme. Sans paramètre, la page
   le dit (« graine par défaut ») et propose `seed=7&weeks=2`, la graine de
   `DEFAULT_SHAPE`.
4. **On-chain vs hors chaîne**, puis **les invariants** (`cargo test --workspace`,
   déterminisme `même graine → même history_hash`, fast-forward d'une semaine,
   parcours headless). Les deux colonnes reprennent `docs/COMPLIANCE.md` :
   licences, notes de dette, vote du conseil, actes, parts, et les jetons
   or/poissons côté chaîne ; stocks, criée, marchands NPC, poisson en mer côté
   moteur.

## Ce que la page prouve

- l'état du contrat est **daté et falsifiable** : elle n'affiche un état live
  qu'après une réponse réelle du RPC, jeton par jeton ;
- `mt_supply` est lisible par n'importe qui, sans clé, sans compte, sans notre
  serveur — dès que le contrat existe ;
- la saison est **rejouable** : le lien de rejeu transporte la graine, et le
  `history_hash` du panneau `Judges` doit retomber sur le même nombre ;
- la frontière chaîne / hors chaîne est écrite noir sur blanc, y compris ce qui
  n'est pas encore branché ;
- les invariants du moteur se reproduisent sur une machine nue : `cargo test
  --workspace`, `cargo test -p sim --test seed_variety`, `cargo run -p sim -- ff`,
  `python3 tests/e2e_offline.py`.

## Ce que la page ne prouve pas

- **Le contrat est déployé, le jeu ne l'utilise pas encore.** Les jetons
  existent sur `bankkeeper.testnet` et le scénario les a vraiment bougés (voir
  `docs/deployments.md`), mais aucun geste du jeu joué dans le navigateur ne
  passe par la chaîne : le navigateur tourne sur le moteur Rust en wasm. La
  page le dit dans la section 3, et le trou reste ouvert dans
  `docs/COMPLIANCE.md`.
- **L'email n'est pas une authentification** (`web/src/session.ts`) : c'est une
  étiquette, et la page ne prétend pas le contraire.
- **Les stocks, la criée et les NPC ne sont pas vérifiables par un tiers** : ils
  vivent hors chaîne. Un juge doit refaire tourner le moteur (ou lire le hash)
  pour les croire.
- **Aucune preuve cryptographique** : pas de signature de journal, pas d'arbre de
  Merkle, pas d'attestation. La page est un relevé de faits daté, pas un
  certificat.
- Le compte de tests (268 au 11/11/2026) est **écrit à la main** dans
  `web/src/proofs/Panels.tsx` (`PROOFS[0].claim`) : il vieillit mal, et doit être
  mis à jour avec la suite.

## Pointer la page sur un autre contrat

La page suit `docs/deployments.md` par défaut. Pour lire un autre contrat, une
ligne suffit, sans rebuild :

```sh
# 1. dans le navigateur du juge (ou dans la console de la page)
localStorage.setItem('tidewater-chain-v1', 'autre-compte.testnet')

# 2. ou par l'URL, sans rebuild
https://<hôte>/proofs.html?contract=autre-compte.testnet

# 3. ou au build, pour une valeur ponctuelle
cd web && VITE_TIDEWATER_CONTRACT=autre-compte.testnet npm run build:offline
```

Ordre de priorité : `?contract=` > `localStorage.tidewater-chain-v1` >
`VITE_TIDEWATER_CONTRACT` > `docs/deployments.md`. La valeur stockée peut être
l'identifiant nu (`autre-compte.testnet`) ou un petit JSON
`{"contract":"autre-compte.testnet"}`.

Le contrôle à refaire à la main après tout déploiement : `mt_supply("3")` doit
rendre `20` (l'offre de licences est fixe). Si la page affiche autre chose, le
contrat lu n'est pas celui qu'on croit.

## Garde-fous tenus

- Palette du jeu (`#0f2a30`, `#e4ede6`, `#e3b65a`, `#e0672f`), pas de dégradé,
  pas d'emoji en guise d'icône, pas de verre dépoli : `python3 tests/ci_structural.py`
  passe, fichiers < 500 lignes, fonctions < 50 ;
- l'entrée `/` du build est inchangée et `python3 tests/e2e_offline.py` reste
  vert ;
- `python3 tests/e2e_proofs.py` : la page se charge, lit le contrat déployé
  depuis `docs/deployments.md`, affiche le badge live et les six `mt_supply`
  réels (dont 20 licences), montre les hashs confirmés du rejeu, le lien de
  rejeu contient `seed=`, et un contrat qui ne répond pas n'affiche **aucun**
  badge live ni aucune valeur inventée. Zéro erreur console, zéro requête en
  échec, zéro appel `/api`. Sortie 1 dès qu'une étape est bloquée.
