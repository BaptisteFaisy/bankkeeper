# Déploiement testnet — la recette

La chaîne a été **répétée de bout en bout sur un near-sandbox local** le
11/11/2026 : déploiement, 21 journées de pêche, licence, note de dette,
conseil, 75 transactions, 75 hashs. Le tableau des hashs du sandbox est dans
[`docs/deployments.md`](deployments.md) ; il sert de référence à ce qui doit
sortir du run testnet.

> **Rien de ce qui suit n'a été exécuté sur le testnet.** Le faucet public
> était fermé (429, 10 comptes / 3 h / IP). La procédure est écrite, relue
> dans le code, et prouvée sur une chaîne locale — pas simulée.

## 0. Le décor, en une table

| Élément | Valeur | Où |
|---|---|---|
| Wasm | `target/near/tidewater/tidewater.wasm` — 419 648 octets (410 Kio) | `Makefile:5-6` |
| sha256 du wasm | `48ae95eed7b7e9afdae35c5af3628ae4b12d09a493fda199f8d90f106b19689b` | — |
| ABI embarquée | `target/near/tidewater/tidewater_abi.json` — 41 837 octets | — |
| RPC testnet | `https://rpc.testnet.fastnear.com` | `scripts/testnet/testnet-lib.mjs:14` |
| Faucet | `https://helper.testnet.near.org/account` | `scripts/testnet/testnet-lib.mjs:15` |
| Clés | `~/.near-credentials/testnet/<compte>.json`, mode 0600 | `scripts/testnet/testnet-lib.mjs:16`, `:76-91` |
| Contrat (nominal) | `bankkeeper.testnet` | `scripts/testnet/testnet-lib.mjs:28-37` |
| Joueur / capitaine / banque | `player.` / `captain.` / `bank.` + le nom du contrat | idem |
| Gas d'un appel | 100 Tgas prépayés (`CALL_GAS`) | `scripts/testnet/testnet-lib.mjs:46` |

Le wasm est **le même binaire** que sur le testnet : `deploy.mjs:58-61` lit
`target/near/tidewater/tidewater.wasm` et `deploy.mjs:59` en calcule le
sha256 — celui qu'il inscrit dans `docs/deployments.md`.

## 1. T-20 min — le build

```sh
cd contracts/tidewater && cargo near build non-reproducible-wasm
```

Puis **vérifier l'empreinte avant de continuer** (c'est le seul binaire qui
ira sur la chaîne) :

```sh
sha256sum target/near/tidewater/tidewater.wasm
# 48ae95eed7b7e9afdae35c5af3628ae4b12d09a493fda199f8d90f106b19689b  target/near/tidewater/tidewater.wasm
```

L'empreinte est stable sur cette machine (toolchain `stable-x86_64-unknown-linux-gnu`
1.98.1, `cargo-near` 0.23.0) : le build a été refait de zéro et a rendu les
mêmes 419 648 octets et le même sha256. Si l'empreinte diffère, **on
s'arrête** : le contrat qui part sur la chaîne ne serait pas celui qui a été
répété sur le sandbox.

Le contrat occupe 423 485 octets de storage sur la chaîne (le wasm plus
l'état) : à 10⁻⁵ NEAR l'octet, c'est **4,24 NEAR** de staking. Les 10 NEAR
du faucet en laissent 5,76 avant les sous-comptes.

## 2. T-15 min — le compte racine

```sh
make testnet-deploy          # ou : node scripts/testnet/deploy.mjs
```

`deploy.mjs:46` appelle `ensureRoot(5.6)` (`testnet-lib.mjs:129-145`), qui a
**deux chemins** :

### 2a. Le chemin nominal — le faucet répond

`ensureTopLevel` (`testnet-lib.mjs:103-126`) fait **un seul** appel POST au
faucet, qui crée `bankkeeper.testnet` avec 10 NEAR. Les trois autres comptes
(`player.`, `captain.`, `bank.`) sont des sous-comptes du contrat, créés par
`ensureSubaccount` (`testnet-lib.mjs:148-169`) — donc **aucun autre slot de
création** n'est consommé.

### 2b. Si le faucet répond 429 — **attendre, ne pas forcer**

Le faucet public est à 10 comptes par 3 heures et par IP. En cas de 429, le
script le dit lui-même et s'arrête (`testnet-lib.mjs:118-122` et `:138-143`) :

```
faucet refused bankkeeper.testnet (429): ...
  The public faucet allows 10 accounts per 3 h per IP; it is currently exhausted.
  Wait for the window to reset, or re-run against a funded parent account:
    TIDEWATER_ROOT_PARENT=<funded.testnet> node scripts/testnet/deploy.mjs
```

Il ne faut **pas** multiplier les appels (le 429 ne se contourne pas en
insistant, la fenêtre ne se décale pas) et il ne faut surtout pas créer les
comptes à la main : le script gère la clé, l'idempotence et la reprise.
La fenêtre du 11/11 rouvrait à **02:27:52 UTC (03:27:52 Paris)**.

### 2c. Si un parent financé est disponible — le chemin de repli

```sh
TIDEWATER_ROOT_PARENT=<compte-financé.testnet> make testnet-deploy
```

`testnet-lib.mjs:29-30` change alors le nom de la racine en
`<prefix>.<parent>` (par exemple `bankkeeper.alice.testnet`) et
`ensureSubaccount` la crée comme sous-compte du parent, qui la finance.
**Le contrat, l'état, le scénario et les hashs sont identiques** : seul le nom
du compte change, et `docs/deployments.md` l'explique (le mode « fallback »).
C'est le chemin que la répétition sur sandbox a pris (`TIDEWATER_ROOT_PARENT`
pointant sur le compte funded du sandbox local) : il est donc éprouvé.

`TIDEWATER_TESTNET_PREFIX` change le préfixe (`testnet-lib.mjs:28`), par
défaut `bankkeeper`.

**Si le faucet est de nouveau ouvert au moment du run, préférer 2a** (le nom
`bankkeeper.testnet` est celui annoncé partout, README et docs) : 2c n'est
qu'un repli.

## 3. T-10 min — le déploiement

`make testnet-deploy` fait tout dans l'ordre (`deploy.mjs:40-111`) :

1. les comptes (`deploy.mjs:45-55`) ;
2. le wasm : sha256 affiché, `deployContract` si le code n'est pas déjà là
   (`deploy.mjs:63-73`) ;
3. l'init `new(owner, player)` si l'état n'existe pas (`deploy.mjs:75-86`) ;
4. les contrôles à chaud : `get_owner`, `get_day`, `get_gold_totals`,
   `get_zone`, le code hash on-chain (`deploy.mjs:88-101`) ;
5. les soldes (`deploy.mjs:102-105`) ;
6. l'écriture de `docs/deployments.md` (`deploy.mjs:107-109`).

`deploy.mjs` est **idempotent** : un compte existant et un contrat déjà en
place sont réutilisés. **`FORCE_REDEPLOY=1` est cassé** : le commentaire du
script prétend qu'un déploiement de code efface l'état, ce qui est faux —
le state trie de l'account survit, donc le `new` qui suit panique
(« The contract has already been initialized »). Sur un compte neuf le run
nominal n'y touche pas ; ne pas s'en servir pour « repartir de zéro » (il faut
supprimer le compte, ou en prendre un neuf).

## 4. T-5 min — le scénario

```sh
make testnet-e2e             # ou : node scripts/testnet/e2e.mjs
```

Le rejeu (documenté dans `docs/deployments.md`) fait, dans l'ordre :

| Étape | Ce qui est vérifié |
|---|---|
| vues d'ouverture | `get_day`, `get_gold_totals`, `get_zone`, `get_licence_price`, le bateau 10 du joueur |
| `assign_boat(10)`, `assign_boat(11)` | les deux bateaux sont à Greybank |
| 21 journées | `land_lot` × 2 puis `run_day`, jusqu'au jour 21 (le conseil n'ouvre qu'aux jours 21-27 de la saison, `e2e.mjs:9-11`) |
| `buy_licence()` | `mt_balance_of` avant/après, le prix quoted est celui qui est payé |
| `mt_transfer(3, 1)` | une licence vers le capitaine, l'événement NEP-245 est émis, l'offre totale reste 20 |
| `buy_loan(100)` + `get_loan` | le joueur devient prêteur, la collateral reste |
| `forbear_loan(100)` | les paiements manqués sont effacés |
| `propose_rule` → `vote` ×2 → `cast_npc_votes` → `resolve_council` | le `CouncilOutcome` et le nouveau `quota_per_licence` relu dans `get_day` |
| `run_day` | le jour avance encore |

Le script sort en 1 à la première assertion cassée, et **échoue aussi si une
transaction n'a pas laissé de hash** (`e2e.mjs:232`) : un tableau de preuves
vide est une erreur, jamais une ligne « 0 transactions ».

## 5. T-2 min — la documentation à remettre à jour

| Fichier | Quoi | Qui l'écrit |
|---|---|---|
| `docs/deployments.md` | adresses, sha256, hash de déploiement, hash d'init, code hash, soldes | `deploy.mjs:142-210` — **le fichier entier est réécrit** |
| `docs/deployments.md` | le tableau des transactions du scénario (entre `<!-- e2e:begin -->` et `<!-- e2e:end -->`) | `e2e.mjs:248-270` |
| `docs/e2e-testnet.log` | le transcript complet, valeur lue après chaque étape | `e2e.mjs:272-286` |

Attention : `deploy.mjs` **réécrit `docs/deployments.md` d'un bloc**. Les
sections écrites à la main (la démo Vercel, « ce que le scénario prouve »)
disparaissent au passage. Il faut donc soit les réécrire après le run, soit
les garder dans un autre fichier — c'est ce que fait
[`docs/TESTNET-RUN.md`](TESTNET-RUN.md) pour la référence du sandbox.

Ordre obligatoire : **`make testnet-deploy` puis `make testnet-e2e`**. Dans
l'autre sens, le rejeu remplit le bloc d'un fichier que le déploiement
remettra à zéro.

## 6. Si l'adresse du contrat change — le site public

Le lien canonique du jeu est **<https://tidewater-play.vercel.app>** et il
est rappelé dans `README.md`, section « Démo publique & redéploiement »
(`README.md:21-39`). Il n'est **pas** généré par `deploy.mjs` : si le run
testnet change l'adresse du contrat, il faut redéployer le site pour que la
démo et la doc disent la même chose :

```sh
TOKEN="$(jq -r .token ~/.local/share/com.vercel.cli/auth.json)"
cd web && npm ci && npm run build:offline          # engine.wasm + web/dist
cd dist && npx --yes vercel link --yes --project tidewater-play \
  --scope team_69W3p97P7EKfPQaumMuNX85m --token "$TOKEN"
npx --yes vercel deploy --prod --yes \
  --scope team_69W3p97P7EKfPQaumMuNX85m --token "$TOKEN"
```

Le jeton reste dans `~/.local/share/com.vercel.cli/auth.json`, jamais dans le
dépôt ni dans un journal. L'empreinte du dernier déploiement se colle dans
la section « Empreinte du dernier déploiement » de `docs/deployments.md`.

## 7. La commande unique (03:30)

La fenêtre du faucet rouvre à 02:27:52 UTC. À 03:30, en une commande :

```sh
cd ~/tmp/near-tidewater && \
  (cd contracts/tidewater && cargo near build non-reproducible-wasm) && \
  test "$(sha256sum target/near/tidewater/tidewater.wasm | cut -d' ' -f1)" = \
    "48ae95eed7b7e9afdae35c5af3628ae4b12d09a493fda199f8d90f106b19689b" && \
  make testnet-deploy && make testnet-e2e
```

Si le faucet est encore fermé, la même commande avec le repli :

```sh
  TIDEWATER_ROOT_PARENT=<compte-financé.testnet> make testnet-deploy && \
  TIDEWATER_ROOT_PARENT=<compte-financé.testnet> make testnet-e2e
```

Le `test` sur l'empreinte est le point de non-retour : sans lui, on pourrait
déployer un wasm différent de celui qui a été répété.

## 8. Les erreurs à ne pas commettre

1. **Ne jamais poser de clé dans le dépôt.** Les credentials vivent dans
   `~/.near-credentials/testnet/` (`testnet-lib.mjs:16`), écrits en 0600
   (`testnet-lib.mjs:76-91`). `git status` doit rester propre avant chaque
   commit ; aucun `*.json` de clé ne se committe. Les clés du sandbox de la
   répétition sont dans `/tmp/tw-sandbox-rehearsal/home/`, hors de l'arbre.
2. **Ne pas merger à la main.** `main` est protégée : la fusion se fait par
   Mergify (`.mergify.yml`). On pousse une branche, on ouvre une PR, on
   laisse Mergify merger. Jamais `git push` sur `main`.
3. **Ne pas simuler un succès.** Si une étape échoue, elle échoue : on ne
   réécrit pas un hash à la main dans `docs/deployments.md`, on ne corrige pas
   une assertion pour qu'elle passe. Le transcript `docs/e2e-testnet.log`
   doit finir par « all steps passed », sinon le run est à refaire.
4. **Ne pas forcer le faucet.** 429 veut dire « attends la fenêtre ». Insister
   ne fait pas rouvrir la fenêtre, et créer les comptes à la main casse
   l'idempotence du script.
5. **Ne pas utiliser `FORCE_REDEPLOY=1` pour « repartir de zéro ».** Le script
   le prétend (`deploy.mjs:5-6`), c'est faux : l'état du contrat survit au
   déploiement du code, et le `new` qui suit panique. Sur un compte neuf le run
   nominal n'y touche pas ; si le contrat doit repartir de zéro, il faut
   supprimer le compte et le recréer.
6. **Ne pas lancer `make testnet-e2e` avant `make testnet-deploy`** : le
   rejeu suppose le contrat déployé et l'état initialisé.
7. **Ne pas écraser `docs/deployments.md` à la main entre les deux** : le
   déploiement le réécrit entièrement.
8. **Ne pas déployer depuis une branche de travail.** Le run se fait sur
   `main` (ou sur le commit mergé), sinon le contrat ne correspond pas au
   code publié.

## 9. Ce que la répétition a prouvé

Le 11/11/2026, sur une chaîne `near-sandbox` locale :

| Étape | Résultat |
|---|---|
| build | 419 648 octets, sha256 `48ae95ee…` (rebuild : identique) |
| déploiement | `deployContract` + `new(owner, player)`, code hash on-chain `5tim1FauiQ5T9FmD7v6Yb82jbdQJjx94YiaQs9CfxKFG` |
| scénario | 75 transactions, **75 hashs distincts**, toutes les assertions vertes |
| conseil | `CouncilOutcome {"proposal_id":1,"passed":true,"yes_weight":9,"no_weight":8,"indemnities_milli":0}`, `quota_per_licence` 70 → 80 relu dans `get_day` |
| non-régression | le scénario **sans** l'enregistrement des hashs échoue bien sur la garde `every transaction left a hash` (`e2e.mjs:232`) |

Trois vrais bugs sont sortis de cette répétition. Les deux premiers sont
corrigés dans cette branche :

- `testnet-lib.mjs` arrondissait la dotation à l'entier NEAR près
  (`Math.round(0.1)` → 0) : le capitaine et la banque naissaient avec **0 NEAR**
  et ne pouvaient plus signer leur vote. La dotation passe maintenant par
  `nearToYocto`, qui garde les fractions (`testnet-lib.mjs:158`).
- le chemin de repli ne repassait pas le préfixe du compte à la documentation :
  le document affichait `undefined.testnet` (`testnet-lib.mjs:132`).

Le troisième est **à corriger plus tard** et ne touche pas le run de ce soir
(compte neuf) :

- `FORCE_REDEPLOY=1` est cassé. Le commentaire de `deploy.mjs:5-6` dit qu'un
  déploiement de code efface l'état ; c'est faux — le state trie de l'account
  survit, donc le `new` qui suit panique « The contract has already been
  initialized ». Vérifié sur le sandbox. **Ne pas utiliser `FORCE_REDEPLOY=1`
  pour repartir de zéro** : il faut supprimer le compte (ou en prendre un neuf).

Comment reproduire la répétition :

```sh
node scripts/testnet/sandbox-rehearsal.mjs
```

Elle monte une chaîne locale (`scripts/sandbox/start.mjs`), rejoue
`deploy.mjs` et `e2e.mjs` **tels quels**, et refuse par construction toute
sortie réseau hors `localhost` — le faucet public est inatteignable depuis
la répétition.
