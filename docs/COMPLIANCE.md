# Conformité — track *Games With Real Economies* (id: `games`)

> Ce que le track demande, ce que le dépôt fait, et **où ça ne colle pas
> encore**. Écrit le 10 novembre 2026. Chaque ligne renvoie à un fichier ou à
> une commande : rien ici n'est une intention.

## Le sujet

| Le track demande | Tidewater |
|---|---|
| Un jeu de ville-marché | Un **port de pêche** : même squelette économique, autre fiction. Le joueur *récolte* (il pêche), *échange* avec des marchands NPC, et le marché se retourne contre lui |
| Les joueurs récoltent des matériaux | Trois zones, deux espèces, un stock commun qui s'épuise |
| Chaque marchand est un agent avec son portefeuille et son inventaire | `Fishmonger`, `Cannery`, `The Gull` : or propre, stock propre, cible propre (`crates/rules/src/config.rs`, `buyer_targets`) |
| Il fixe ses prix d'après son stock et la demande récente | `crates/rules/src/merchant.rs` — la formule complète tient en trois lignes |
| Inonder le marché fait chuter le prix | Stock 180 pour une cible de 150 → facteur 0,90 → 3,6 or la caisse au lieu de 4,0. Testé : `merchant::tests::a_flooded_merchant_pays_less` |
| Un marchand ruiné ferme jusqu'à ce qu'on investisse | Or à zéro → `Closed`, il n'enchérit plus (TW-N-51) ; le joueur peut **renflouer** et toucher une part des bénéfices (TW-N-52, `refloat`) |

✅ **La fiction diffère, et c'est décidé** : le track dit « market-town », nous
avons un port. Les mécaniques demandées sont toutes là, à l'identique. Le port
n'est pas un habillage : c'est ce qui rend la ressource commune **non possédée**
— le banc n'appartient à personne — et donc la tragédie des communs lisible
sans un mot d'explication. Décision du propriétaire, 10/11 : on reste sur le
port (voir `docs/DECISIONS.md`).

## Les quatre exigences

### 1. Les objets sont des NEP-245 multi-tokens, un seul contrat pour tous les types

**Fait, mais pas encore vivant.**

- `contracts/tidewater/src/nep245.rs` : implémentation NEP-245 (`mt_transfer`,
  `mt_balance_of`, `mt_batch_transfer`, `mt_supply`…), un seul contrat pour
  l'or, le hareng, la morue, les licences, les actes de bateau, les notes de
  dette et les parts.
- Le wasm se construit (412 Ko, ABI embarquée) — `cargo near build`.
- ❌ **Le contrat n'est pas déployé** : le faucet NEAR était en limite de débit
  le 10/11 (`429`, fenêtre de 3 h). Scripts prêts : `scripts/testnet/`.
- ❌ **Le jeu joué n'utilise pas encore la chaîne** : la démo publique tourne
  sur le moteur wasm, tout en mémoire. Les tokens existent, ils ne sont pas
  encore ce que le joueur manipule.

C'est **le** trou du projet, et il est identifié : c'est l'étape on-chain du
plan (licences, notes de dette, vote en tokens ; stocks et criée hors chaîne).

### 2. Connexion sociale ou email, sans phrase de récupération, sans popup de wallet, sans demande de gas

**L'expérience est conforme ; l'authentification ne l'est pas encore.**

- ✅ Aucun wallet, aucune extension, aucune phrase de récupération : il y a un
  champ email et un pseudo (`web/src/session.ts`), et rien d'autre.
- ✅ Aucune demande de gas, puisqu'il n'y a pas encore d'appel on-chain.
- ❌ **L'email est une étiquette, pas une authentification** : côté moteur wasm,
  `/api/auth` répond `{ok: true, token: "local"}` ; côté relais, il fabrique un
  jeton opaque en mémoire. Personne ne vérifie que l'adresse existe.
- Pour être conforme pour de vrai, il faut une identité qui signe sans que le
  joueur le voie : **FastAuth** (email → clé dans un enclave) ou un **relayeur
  sponsor** qui détient la clé du compte joueur et paie le gas à sa place. Le
  second est déjà écrit ailleurs dans nos dépôts (`~/mandat/relayer`) et se
  transpose ; c'est ~1 jour, et ça dépend du déploiement testnet.

### 3. Les règles de prix des marchands dans un seul fichier lisible, et le raisonnement d'un marchand en infobulle

**Fait depuis ce soir.**

- ✅ **Un seul fichier** : `crates/rules/src/merchant.rs`. Il contient la
  formule (`stock_factor_bps`, `limit`, `floor`) et la phrase de raisonnement.
  `auction.rs` (simulation) et `contracts/tidewater/src/game.rs` (contrat) n'ont
  plus de copie : ils appellent le même module. Deux implémentations
  divergentes ont été supprimées au passage — le contrat arrondissait autrement.
- ✅ **Infobulle** : chaque marchand de la criée porte un « why » — au survol et
  au focus clavier — qui affiche sa phrase :
  `Fishmonger: limit 6.0 = base 4.0 x 1.50 — store 0 against a target of 60.`
  Vérifié en navigateur : 3 infobulles, visibles au survol, 0 erreur console.

### 4. Un mode fast-forward qui simule une semaine de commerce en une minute

**Fait.**

- `sim ff --days 7` : une semaine en **moins d'une seconde**, sans joueur.
- Dans le jeu : panneau `Judges` → `Fast-forward 7 days` / `28 days`, puis
  graphe des stocks, prix, faillites et `history_hash` (même graine → même
  saison).
- Le moteur est déterministe et rejouable : `partial` `history_hash` identique
  sur deux exécutions, preuve en test (`crates/sim/tests/seed_variety.rs`).

## L'exigence de méthode : la boucle de jeu sur papier d'abord

**Fait, et corrigé pour coller au cadrage 30 s / 5 min / session** :
`docs/GAME-LOOP.md`, section « Rythmes ». Le brief d'origine datait la boucle à
`~50 s` ; le document donne maintenant les trois échelles demandées.

✅ **Et la cadence est réelle depuis le 10/11** : le bouton `Go live` lande un
lot toutes les **30 secondes** ; dix bateaux, une sortie par bateau et par jour
(dans la limite « au plus trois » de TW-N-10) → **une journée en 5 minutes**,
puis la soirée (repousse, charges, faillites) et le jour suivant. `Next lot` et
`End the day` restent disponibles pour jouer au tour par tour, et le
fast-forward des juges reste hors horloge.

## Résumé

| Exigence | État | Ce qui manque |
|---|---|---|
| Sujet, marchands agents, prix par stock et demande | ✅ | — (fiction « port » assumée et documentée) |
| NEP-245, un contrat | 🟡 contrat écrit et compilé, **pas déployé, pas utilisé par le jeu** | déploiement testnet + branchement du jeu |
| Connexion email sans friction | 🟡 expérience sans friction | **authentification réelle** (FastAuth ou relayeur sponsor) |
| Règles de prix dans un fichier + infobulle | ✅ | — |
| Fast-forward semaine en une minute | ✅ | — |
| Boucle 30 s / 5 min / session | ✅ | — |

Les deux 🟡 se ferment dans cet ordre : **déployer** (faucet, 15:27), puis
**brancher le jeu sur les tokens**, puis **relayeur sponsor** pour que la
connexion soit réelle sans popup.
