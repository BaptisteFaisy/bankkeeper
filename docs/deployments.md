# Déploiements

Deux déploiements, deux objets distincts : la **démo web** (le jeu jouable,
statique, hors-ligne) et le **contrat sur NEAR testnet** (pas encore déployé).

# Déploiement testnet

Statut : **pas encore déployé sur le testnet — le faucet public était en limite
de débit** (2026-11-10). Tout le reste est prêt, et la chaîne a été **répétée
de bout en bout sur un near-sandbox local** le 11/11/2026 : déploiement, 21
journées, licence, note de dette, conseil, **75 transactions, 75 hashs**.

La procédure du run testnet, minute par minute, est dans
[`docs/TESTNET-RUN.md`](TESTNET-RUN.md).

## Ce qui est prêt

| Élément | Valeur |
|---|---|
| Source du contrat | `contracts/tidewater` (NEP-245 : or, poissons, licences, actes de bateau, notes de dette) |
| Wasm | `target/near/tidewater/tidewater.wasm` — 419 648 octets (410 Kio) |
| Commande de build | `cd contracts/tidewater && cargo near build non-reproducible-wasm` |
| sha256 | `48ae95eed7b7e9afdae35c5af3628ae4b12d09a493fda199f8d90f106b19689b` |
| ABI | embarquée (`target/near/tidewater/tidewater_abi.json`, 41 837 octets) |
| Storage on-chain | 423 485 octets (wasm + état) → **4,24 NEAR** de staking |
| Scripts | `scripts/testnet/{testnet-lib.mjs, deploy.mjs, e2e.mjs, sandbox-rehearsal.mjs}`, `near-api-js` épinglé en 7.4.0 |
| Répétition | `node scripts/testnet/sandbox-rehearsal.mjs` — chaîne locale, aucune sortie réseau |

L'empreinte du wasm est **stable sur cette machine** (toolchain stable 1.98.1,
`cargo-near` 0.23.0) : le contrat a été rebuild de zéro et a rendu les mêmes
419 648 octets et le même sha256. C'est ce binaire-là, et pas un autre, qui
ira sur la chaîne.

Les 410 Kio sont le coût du storage staking : ~4,24 NEAR sur les 10 NEAR du
faucet, avant même les trois sous-comptes. C'est ce nombre qui commande tout
le reste.

## Adresses (dès que le faucet répond)

| Rôle | Compte |
|---|---|
| Contrat, et propriétaire (fait tourner la journée, pilote les bateaux NPC) | `bankkeeper.testnet` |
| Joueur | `player.bankkeeper.testnet` |
| Second capitaine (reçoit une licence dans le scénario) | `captain.bankkeeper.testnet` |
| Banque / signataire de réserve | `bank.bankkeeper.testnet` |

Un seul appel au faucet crée la racine ; les trois autres sont ses sous-comptes,
donc toute la démo ne consomme qu'un seul slot de création. Les clés ne sortent
jamais de `~/.near-credentials/testnet/` et n'entrent jamais dans le dépôt.

## Ce qui bloquait

`POST https://helper.testnet.near.org/account` répond `429` :

```
x-ratelimit-limit: 10
x-ratelimit-remaining: 0
retry-after: 10348            # réponse du 2026-11-10 11:35:15 GMT → fenêtre rouverte vers 14:27:45 GMT
Rate limit exceeded, retry in 3 hours.
```

Dix créations de compte par trois heures et par IP, et le seau était déjà vide.
La forme « top-up » du même endpoint renvoie le même 429 : pas de porte de
service. Sans slot de création, il n'y a pas de `bankkeeper.testnet`.

Le chemin de repli (créer le compte contrat comme sous-compte d'un compte déjà
financé, `TIDEWATER_ROOT_PARENT=<financé.testnet>`) est implémenté dans
`deploy.mjs` et a été évalué : mesuré le 2026-11-10, **aucun** compte de cette
machine n'a les ~4,3 NEAR de solde *libre* nécessaires — la plupart sont des
comptes-contrats dont le solde est déjà staké en storage de code :

| Compte | montant | staké (storage) | libre |
|---|---|---|---|
| `ledger-v2.grid-hour-c.testnet` | 10,961 NEAR | 10,641 NEAR | 0,320 NEAR |
| `mandat26-contract.testnet` | 6,369 NEAR | 2,854 NEAR | 3,515 NEAR |
| `boncard.testnet` | 5,808 NEAR | 4,778 NEAR | 1,030 NEAR |
| `demo.bon-hack.testnet` | 1,899 NEAR | 0,002 NEAR | 1,897 NEAR |

Vider quatre comptes de démo sans rapport pour héberger ce contrat serait un
pire échange que d'attendre une fenêtre de faucet : le déploiement est laissé
non fait plutôt qu'à moitié fait.

**La fenêtre du 11/11 rouvre à 02:27:52 UTC (03:27:52 Paris).**

## La répétition sur near-sandbox

Le 11/11/2026, toute la chaîne a été rejouée sur une chaîne NEAR locale
(`near-sandbox` 2.14.0), **sans toucher au testnet** :

```sh
node scripts/testnet/sandbox-rehearsal.mjs
```

Le pilote monte la chaîne locale (`scripts/sandbox/start.mjs`), donne au rejeu
son propre `HOME` (les clés du sandbox restent dans `/tmp`, jamais dans
l'arbre), puis lance **`deploy.mjs` et `e2e.mjs` tels quels** — avec
`TIDEWATER_ROOT_PARENT` pointant sur un compte financé, c'est-à-dire le chemin
de repli ci-dessus. Un garde `fetch` refuse toute sortie réseau hors
`localhost` : le faucet est inatteignable depuis la répétition, par
construction.

| Étape | Résultat |
|---|---|
| Build | 419 648 octets, sha256 `48ae95ee…` (rebuild de zéro : identique) |
| Comptes | `bankkeeper.test.near` + `player.` / `captain.` / `bank.`, financés depuis un parent |
| Déploiement | `deployContract` + `new(owner, player)` ; code hash on-chain `5tim1FauiQ5T9FmD7v6Yb82jbdQJjx94YiaQs9CfxKFG` |
| Scénario | 75 transactions, **75 hashs distincts**, toutes les assertions vertes |
| Conseil | `CouncilOutcome {"proposal_id":1,"passed":true,"yes_weight":9,"no_weight":8,"indemnities_milli":0}` ; `quota_per_licence` 70 → 80 relu dans `get_day` |
| Non-régression | le scénario **sans** l'enregistrement des hashs échoue bien sur la garde `every transaction left a hash` |

Trois vrais bugs sont sortis de cette répétition (corrigés dans cette branche) :

1. `testnet-lib.mjs` arrondissait la dotation à l'entier NEAR près
   (`Math.round(0.1)` → 0) : le capitaine et la banque naissaient avec **0 NEAR**
   et ne pouvaient plus signer leur vote — le scénario mourait au conseil sur
   « Not enough balance ». La dotation passe maintenant par `nearToYocto`.
2. le chemin de repli ne repassait pas le préfixe du compte à la documentation :
   le document affichait `undefined.testnet`.
3. `FORCE_REDEPLOY=1` est cassé : **déployer du code n'efface pas l'état** du
   contrat, donc le `new` qui suit panique (« The contract has already been
   initialized »). Sur un compte neuf le run nominal n'y touche pas ; il ne
   faut surtout pas s'en servir pour « repartir de zéro ».

## Le refaire, une fois la fenêtre rouverte

La procédure complète est dans [`docs/TESTNET-RUN.md`](TESTNET-RUN.md) ; en
résumé :

```sh
cd contracts/tidewater && cargo near build non-reproducible-wasm   # → target/near/tidewater/tidewater.wasm
sha256sum target/near/tidewater/tidewater.wasm                    # doit rendre 48ae95ee…
cd ../.. && node scripts/testnet/deploy.mjs                       # un appel faucet, puis le déploiement
node scripts/testnet/e2e.mjs                                      # rejoue le scénario, écrit les hash ci-dessous
```

`deploy.mjs` est idempotent : comptes existants et contrat déjà en place sont
réutilisés. `deploy.mjs` réécrit ce fichier avec les vraies adresses, les hash
de déploiement et d'init et le code hash on-chain ; `e2e.mjs` remplit ensuite
le tableau du scénario.

## Transactions du scénario

<!-- e2e:begin -->
**Répétition sur near-sandbox** (chaîne locale, pas le testnet) : rejoué par
`node scripts/testnet/e2e.mjs` via `node scripts/testnet/sandbox-rehearsal.mjs`
le 2026-11-10T21:10:00Z, contrat `bankkeeper.test.near`, 75 transactions.
Ces hashs sont ceux d'une chaîne locale : ils ne sont consultables nulle part.
Le run testnet de cette nuit réécrira ce bloc avec les vrais hashs, dans le
même format.

| Transaction | Hash |
|---|---|
| assign_boat(10) | `HLrCyR3sd6qLbfQ9U9LGGxJEoJshP1LCtBVdT4Joi56d` |
| assign_boat(11) | `96u7YWec2DfcwPMy6GizBJD7qPNvyTkXwhwMKSn6Jfju` |
| land_lot(10) | `4h75pXALeUW4FViACbVCeXYmS33KfeLDVy1zyE5yW1fr` |
| land_lot(11) | `8yy62M6EukteZn23kAd3eYy3Hs8NFKncZ6NWdvSbjd3V` |
| run_day | `FhnTgy7DA45YxhtBwtQpxCxJEN6Q6P69pkyADDG5T88d` |
| land_lot(10) | `J2m2uMVaCWwwJv5u2eR71XVQcGFRoAte1T5CSeJgVDUX` |
| land_lot(11) | `E5PjzwPkgnSBs2dPgtTPM4ea99p3iVG8fkpbgnuLqLx6` |
| run_day | `7RAsJZHet8jk2ZrZ3dmg4EP6bdYW9hkkdZGzoByob25x` |
| land_lot(10) | `4BmgPDyhS93pxpKSXdkCbGnRUS7joEwuvX2s6gMhuKoP` |
| land_lot(11) | `22SCRY2J8bgpGkJ4b2fs51rpauArnk1TNwPN5SdsSvEc` |
| run_day | `7HrSBPzr3NGBjRxtWCd72vwpURZjS3bkNTJPrVfcMPrL` |
| land_lot(10) | `7e5Kq11GVvkrJp7ySD8UjZDPHb1uwkMENctFfzFnriBy` |
| land_lot(11) | `HHwpKvHyNT3sBMJzkET3T3gpoi4seHX2A6zHbJTGNfPE` |
| run_day | `5g3TfjYMtZNNG6edYvFLDtjHcLSQqDV56iwUxcweKMZC` |
| land_lot(10) | `BdTTCXUYmN8NXHt7A1JTo4AMzRetYfmguvSMTUXyZX53` |
| land_lot(11) | `fvH244nuAVFSRZnB3mN2XNJ5xDi6gTCnUF6WwgiK2Yr` |
| run_day | `BiLQWXzLd6JYW7A3cMLiQRkDV1Y1MqeVa8wTpU1k9Xbd` |
| land_lot(10) | `5zgWw1SX2i6XKig3zYB5zCLgTq7jND2gYUzDQoYyAG3Q` |
| land_lot(11) | `5jpLenCE782E6ZAXyYENUg4SdnKmGaQUv2VtRt6pWkkr` |
| run_day | `7eSpyQNxwfxfHFVrTK5NJM47Bfh8ZYBPNXGTRFEmRHDJ` |
| land_lot(10) | `H88pVWLcMAEJwA5FmF7cAxzkWDycUQxyiYiXP9RhvCp8` |
| land_lot(11) | `AHyaxfFPn3JKokTyj8zg5GaJ67oxYqGTwwaNT7ZQUs6E` |
| run_day | `CHSMVz4QjtNM5MbZHudC46oScuL1X8xdc8opHabhfvqx` |
| land_lot(10) | `FWUHECioApyAmwXQNnkhDyJ55ZPmYLToabXydjmbNWti` |
| land_lot(11) | `AumVkERu2DzQ1qrbe9E6dKNY9MtWZBJn2qyZzAQ6hgCW` |
| run_day | `7PWD2aJBMwLWcMLH7oGt85a9bZ93TUsmE5R43EXodQkP` |
| land_lot(10) | `2CVztqcLbEXp3pRXBLTRz3g9kPERtrzEjLy6fe521CNr` |
| land_lot(11) | `G7UXwjWDk6C9z52WzpMgy42UDZQ7RRbQ19NcYbXSqkqK` |
| run_day | `8dfXRLJWEgNdixAFJNn4XEVH9WSwrxL9CMHAUdiiRDMM` |
| land_lot(10) | `9LAwXEJSKYXsBEaLWLcNkiVM9PmxyFK2Ra86k1pLfzK` |
| land_lot(11) | `8MyULqikJ33tmhija24mm7iVzgb7pWqqS2fJnVwmnmh5` |
| run_day | `4uHSnUCVtLBHD4CQtwvxUJsquWZJuAXMgwPjkho9Cw26` |
| land_lot(10) | `D9WaZNLhjeJz8BsiNk2BGAUQyfi9iPEG5opuYx2gxSg7` |
| land_lot(11) | `2YkNeFb5fWAx6LBurzDVN8gPKiyU1bzPK1eXN3zQK7UY` |
| run_day | `dtqjgTNtmeurSn13vthxTJ7rWgSgQtACz6MWt1sLiyU` |
| land_lot(10) | `9nameDx3zcY89kDSq4NkeMVtp3889RyNw4Nv9md1uVcn` |
| land_lot(11) | `34b6ptxSnq2aiBdB4ji3Qs3D6bNDJ2vA9CqihoVtRoQ6` |
| run_day | `2ZPyxxWroCg4jZGDstjmw7MUrJxvaGQBpyzEN9f4rNgT` |
| land_lot(10) | `8pEYVyvkyse1aNya6AAWLvdhjbnjpdf7vpHBtv7E9Lxs` |
| land_lot(11) | `DZzrXyeZ8eFQdCaJum9eEUHkDJNZKHyxeWc3F9qTQyJK` |
| run_day | `6KRrKNfwELcJkF4ZMNHaDSpoJip94Lw5ZjeVof9emdXB` |
| land_lot(10) | `MAJgP98QK8ujQTyhvA23KVTba94GwBGP11ucT9Zd9KK` |
| land_lot(11) | `HSYS4LctBVAehnLCLMZkHzHtx8eUeFLbwShLrjdUZaoE` |
| run_day | `FEMqTecxvMtEFGwhqHSsZAwXMQaQfTBjmJ8uSp3hkoFU` |
| land_lot(10) | `GbSZU7rTwPbx4czu3Ngu5hGGgjfFgTTPcsNVRMLCz8ND` |
| land_lot(11) | `J3gmnrrVpNpW5a6HT7yj5dz18GKraQTo3698YT7evwXN` |
| run_day | `5s9xWMXFqKnvygbrEEG26zKZE7jAie1L1MoNCMTR1P6K` |
| land_lot(10) | `9o3LynWanqBmP1YKXx5CWERjfvQgCh4gHe3G7pFcyGjh` |
| land_lot(11) | `HriskkFncm9rzCL2kkf54qDutiiWLkAgEdcipcuj5uhP` |
| run_day | `22r9CmmKJKWQ8hjbCHa7wv1t27SjsjNbGvwQkC91nTff` |
| land_lot(10) | `mu1frGE1BzMz4JyjEoSNHgQuRzb59S9CGAew2yrPjhQ` |
| land_lot(11) | `Dyi5HXuYjA8bE3sBJsH9nYdYTXtKpRqeVb4rBXSpog2w` |
| run_day | `D4d5fVeeYtFAPuDxHAEAqa7Vw8f9E5d1fDV5cDYveMts` |
| land_lot(10) | `D6KkeN2UioBRDMVvBM8QSNL6MTUSQF4aRQiuXQXyNT5n` |
| land_lot(11) | `GQ3nu6aEwieaLH39PPBhAQ44da7gj5ndgGZNJFAh5pfo` |
| run_day | `2CCUzA6fvCYS4FjdKDWdAfFBHJaCsc3hib3vAC51GxcD` |
| land_lot(10) | `D6DhdZEs4xDS57sdGZ84ZiHfz5nRr3kF7gEesuAdD7KL` |
| land_lot(11) | `C9ecpChA6gz5ukhf2nwtzXHScWweq2KZB5GopMsJA3yb` |
| run_day | `AH9u4ntisxUs5pejTfMjuh6i6v1RvERqQ1u53mcWKzrM` |
| land_lot(10) | `AcmRoLLsvTtRrETC4GH4EtYZP1abBCZGCtqgGixZ8uhy` |
| land_lot(11) | `CU1Vg4dsRyhE4Vv8Lsg5Gf8kJm9dcHQzF3wDqD2AgNWS` |
| run_day | `Gy9cpcRXUS8m3pF7pcqbtuCwg7gthKoY2d5rftvvpZpA` |
| land_lot(10) | `6AvggT37C9Z6BDVAh41qGcLiAq4aFEjyvQct5tvdW14V` |
| land_lot(11) | `5GBfHBcrvK2xw1kLRsAEqeokHkXdP9JPtcqstZpBTGq9` |
| run_day | `7hq6BmXc2wzhManVM29MCRkaBafmwzVgR1F2Gzeq2GLu` |
| buy_licence() | `FirXWMEkKvnLkZVWXVuwgQgWpE9nvoQCvyhv6tzBLrE2` |
| mt_transfer(licence) | `BFmFqipJHgqJoDgYRT3cM6epL2PJpzt2e8cg5wHC2ZkH` |
| buy_loan(100) | `7xzLdi3pokVNbcYbknK6RGTe8yAGTNxyDTubi3aScV6X` |
| forbear_loan(100) | `9JZpjWUTfC7cW5SHG9gnu25RoDmDhsDXuXD7CMNsVwzD` |
| propose_rule(quota 80) | `2mwQFtKxNiSSoPwqSjxwhZETLbTDDRyhunwXX6NcBd5U` |
| vote(1) | `AzanZDJV95zTogZgTSgouDYsrEGDufQHEtH7eaXaKmCT` |
| vote(1) | `3zLspHt8YZJ3bzu74VFAwov1u4aQyYdTqCxtyPz19ngx` |
| cast_npc_votes | `CRKbJzWySX3uU8un9tWdRYiJVracYxyfA9dnFvoLW1j7` |
| resolve_council | `ASwGPboHAS8gXqJgyZpXfgzV3FtAyACWDDsuXxfDdtYG` |
| run_day | `ANdreaVJgbkiBgG8miCH4dNMdsiK4mnYJB9Za2REFNRf` |

Full transcript with every value read back: `docs/e2e-sandbox.log`.
<!-- e2e:end -->

## Ce que le scénario prouve (et ce qu'il ne prouve pas)

On-chain, en tokens NEP-245 et en appels : `buy_licence()` avec `mt_balance_of`
avant/après puis un `mt_transfer` d'une licence vers un second compte ;
`buy_loan(100)` avec `get_loan` qui montre le joueur comme prêteur, puis
`forbear_loan` ; un conseil `propose_rule` → `vote` (une licence, une voix) →
`cast_npc_votes` → `resolve_council`, avec le `CouncilOutcome` affiché et le
nouveau `quota_per_licence` relu dans `get_day` ; et `run_day` qui avance
l'horloge. Le rejeu joue d'abord 21 journées de pêche : le conseil n'ouvre
qu'aux jours 21–27 de la saison, et le joueur doit gagner les ~1 000 or que
coûtent une licence et la note de Brandt.

Volontairement **pas** on-chain : les stocks de zone, la criée et les pilotes
NPC — ils tournent dans le moteur Rust (`crates/sim`, `crates/wasm`), et la
chaîne ne règle que ce qu'un joueur peut échanger. Le rejeu dépend de l'horloge
de la chaîne : après le jour 27 le conseil ferme, et une relance attend la
saison suivante.

## Démo web (Vercel) — le lien public

Un seul lien canonique pour le jeu jouable :
**<https://tidewater-play.vercel.app>** (projet Vercel `tidewater-play`, équipe
`team_69W3p97P7EKfPQaumMuNX85m`). Aucun projet Vercel n'est lié à un dépôt Git :
le déploiement est manuel, depuis `web/dist`, après un build hors-ligne.

```sh
cd web && npm ci && npm run build:offline      # moteur wasm + front hors-ligne
npx --yes vercel deploy --prod --yes \
  --scope team_69W3p97P7EKfPQaumMuNX85m \
  --token "$(jq -r .token ~/.local/share/com.vercel.cli/auth.json)"   # depuis web/dist
```

Le jeton reste dans `~/.local/share/com.vercel.cli/auth.json`, jamais dans le
dépôt ni dans un journal.

### Empreinte du dernier déploiement

| Élément | Valeur |
|---|---|
| Déployé le | 2026-11-11 00:14 (Europe/Paris) — 23:14:05 UTC |
| Commit `main` déployé | `50689ffea730686866c179bb6926cc30d120ac84` (PR #78 : le port est une scène — vue de jeu canvas 2D et instruments de bord ; contient aussi les correctifs web #75, les proofs #73, l'auth #71 et le barreau 5 #76) |
| URL de production | <https://tidewater-play.vercel.app> |
| Déploiement | `dpl_BVYBPHMuPogumTPCMLZzUFJ5mGMd` — `tidewater-play-em6i7ys4w-bg-1fa3.vercel.app` |
| `engine.wasm` servi | 917 429 octets (896 Kio), `application/wasm`, sha256 `b68bb258982cd0e7033a770c395115f333e009d9f4bd025827218005b599df32` |
| Service worker | `sw.js` estampillé `tidewater-b427e33ea236`, actif et contrôlant la page (`serviceWorker.ready` → `active` vrai sur l'URL publique) |
| Vérifications | HTTP 200 sur `/`, `/scene-preview.html` (404 avant ce déploiement), `/engine.wasm`, `/sw.js`, `/manifest.webmanifest`, `/offline.html` et `/proofs.html` ; parcours de référence rejoué contre l'URL publique (connexion email → carte-scène → bateau assigné → `End the day`) : **0 erreur console SEVERE, 0 requête `/api/`**, capture `/tmp/prod-scene.png` ; sur le même `dist` en local : `tests/ci_structural.py` vert (171 fichiers), `tests/e2e_offline.py` vert (0 erreur console, 0 `/api/`), `tests/e2e_tutorial.py` vert (18 contrôles), `tests/audit_web.py` vert (14 sains, 0 défaut), `cargo test --workspace` 252 passés 0 échec ; preuves visuelles `/tmp/jeu-scene.png`, `/tmp/jeu-lot.png`, `/tmp/jeu-conseil.png`, `/tmp/jeu-bilan.png` (canvas non vide : écart-type 40,06 ; deux captures à 1 s : écart 0,768) ; ancien détail conservé — HTTP 200 sur `/`, `/engine.wasm`, `/sw.js`, `/manifest.webmanifest`, `/offline.html` et `/proofs.html` ; parcours de référence rejoué contre l'URL publique (connexion email → carte → tutoriel → bateau assigné → `End the day` → `Fast-forward 7 days` → signature `3455655248798445433`) : **0 erreur console SEVERE, 0 requête `/api/`, 0 requête en échec** ; inventaire panneau par panneau complet (criée + why, attribution, fonds du port, « Paid by », dette envers la mer, licences + location, notes de dette, Juges, tutoriel, PWA) ; bilan de fin de saison atteint : « Debt to the sea · 906 crates » ; captures `/tmp/site-final.png` et `/tmp/site-bilan.png` ; `tests/e2e_offline.py` et `tests/e2e_pwa.py` verts sur le même `dist` (en local : ces scripts servent `web/dist` eux-mêmes et n'acceptent pas d'URL externe) |

Cette section vit dans un fichier que `scripts/testnet/deploy.mjs` réécrit
entièrement : le lien canonique est aussi rappelé dans `README.md`, qui n'est
pas généré. La référence du sandbox, elle, est dans
[`docs/TESTNET-RUN.md`](TESTNET-RUN.md), que le déploiement ne touche pas.
