# Preuves publiques — `/proofs.html`

> Une page statique qui laisse un juge vérifier le projet sans nous croire.
> Elle reste utile quand le contrat n'est pas déployé (état du 10 novembre 2026)
> et bascule d'elle-même en lecture « live » dès qu'un identifiant de contrat
> lui est fourni.

## Où elle vit

| Élément | Chemin |
|---|---|
| Entrée HTML | `web/proofs.html` |
| Entrée Vite | `web/proofs.tsx` → `web/src/proofs/*` (page) et `web/src/proofs.css` |
| RPC | `web/src/near/rpc.ts` (`viewFunction`, `decodeResult`) — aucune dépendance npm |
| Entrées du build | `web/vite.config.ts`, `rollupOptions.input` : `index.html` + `proofs.html` |
| Build | `cd web && npm run build:offline` |
| URL | `/proofs.html` (le jeu reste à `/`) |
| Test headless | `python3 tests/e2e_proofs.py` |

La page n'ajoute aucune dépendance npm : React (déjà là) et `fetch`. Elle ne
lit ni ne stocke aucune clé, et n'appelle aucun service maison — en mode démo
elle ne fait **aucune** requête réseau.

## Les quatre blocs, dans l'ordre

1. **Le contrat.** L'identifiant vient de `?contract=` puis de
   `localStorage.tidewater-chain-v1` puis de `VITE_TIDEWATER_CONTRACT` (au
   build). Sans identifiant, la page affiche « pas encore déployé », avec la
   date (10/11/2026) et les deux raisons mesurées : faucet `helper.testnet.near.org`
   en `429` (10 créations / 3 h / IP), et ~4,3 NEAR libres introuvables pour
   loger les 412 Kio de wasm (~4,12 NEAR de storage).
2. **Les tokens NEP-245.** Dès qu'un contrat répond : `mt_supply` pour l'or
   (`0`), le hareng (`1`), la morue (`2`) et les licences (`3`, 20 attendues),
   sur `https://rpc.testnet.fastnear.com`, en lecture seule, avec un bouton
   `Rafraîchir`. Un échec par jeton est affiché ligne par ligne ; si aucun jeton
   ne répond, la page écrit « aucune réponse » et **ne prétend pas** être live.
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

- **Rien n'est on-chain aujourd'hui.** Aucun geste du jeu joué ne passe par la
  chaîne : les jetons existent dans le contrat, le navigateur tourne sur le
  moteur Rust en wasm. La page le dit dans la section 3.
- **L'email n'est pas une authentification** (`web/src/session.ts`) : c'est une
  étiquette, et la page ne prétend pas le contraire.
- **Les stocks, la criée et les NPC ne sont pas vérifiables par un tiers** : ils
  vivent hors chaîne. Un juge doit refaire tourner le moteur (ou lire le hash)
  pour les croire.
- **Aucune preuve cryptographique** : pas de signature de journal, pas d'arbre de
  Merkle, pas d'attestation. La page est un relevé de faits daté, pas un
  certificat.
- Le compte de tests (137 au 10/11/2026) est **écrit à la main** dans
  `web/src/proofs/Panels.tsx` (`PROOFS[0].claim`) : il vieillit mal, et doit être
  mis à jour avec la suite.

## Le jour où le contrat est déployé

Une ligne suffit, au choix — la page bascule seule en mode live :

```sh
# 1. dans le navigateur du juge (ou dans la console de la page)
localStorage.setItem('tidewater-chain-v1', 'tidewater26.testnet')

# 2. ou par l'URL, sans rebuild
https://<hôte>/proofs.html?contract=tidewater26.testnet

# 3. ou au build, pour que la page l'ait par défaut
cd web && VITE_TIDEWATER_CONTRACT=tidewater26.testnet npm run build:offline
```

Ordre de priorité : `?contract=` > `localStorage.tidewater-chain-v1` >
`VITE_TIDEWATER_CONTRACT`. La valeur stockée peut être l'identifiant nu
(`tidewater26.testnet`) ou un petit JSON `{"contract":"tidewater26.testnet"}`.
C'est `scripts/testnet/deploy.mjs` qui a la vérité le jour J : idéalement il
écrit l'identifiant déployé dans `docs/deployments.md` **et** dans la variable
d'environnement du build.

Après le déploiement, il reste à vérifier à la main, une fois, que
`mt_supply("3")` rend bien `20` (l'offre de licences est fixe) : si la page
affiche autre chose, le contrat n'est pas celui qu'on croit.

## Garde-fous tenus

- Palette du jeu (`#0f2a30`, `#e4ede6`, `#e3b65a`, `#e0672f`), pas de dégradé,
  pas d'emoji en guise d'icône, pas de verre dépoli : `python3 tests/ci_structural.py`
  passe, fichiers < 500 lignes, fonctions < 50 ;
- l'entrée `/` du build est inchangée et `python3 tests/e2e_offline.py` reste
  vert ;
- `python3 tests/e2e_proofs.py` : la page se charge, affiche « pas encore
  déployé », le lien de rejeu contient `seed=`, zéro erreur console, zéro requête
  en échec, zéro appel `/api`. Sortie 1 dès qu'une erreur console apparaît.
