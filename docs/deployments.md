# Déploiements

Deux déploiements, deux objets distincts : la **démo web** (le jeu jouable,
statique, hors-ligne) et le **contrat sur NEAR testnet** (pas encore déployé).

# Déploiement testnet

Statut : **pas encore déployé — le faucet public est en limite de débit**
(2026-11-10). Tout ce qu'il faut est construit et committé ; il ne manque qu'un
appel au faucet que le réseau refuse de servir pour l'instant.

## Ce qui est prêt

| Élément | Valeur |
|---|---|
| Source du contrat | `contracts/tidewater` (NEP-245 : or, poissons, licences, actes de bateau, notes de dette) |
| Wasm | `target/near/tidewater/tidewater.wasm` — 412 350 octets (403 Kio) |
| Commande de build | `cd contracts/tidewater && cargo near build non-reproducible-wasm` |
| sha256 | `ea66ee836567330043b5bbefc48481e2a27871ff224f779c971668bf37c86ae7` |
| ABI | embarquée (`target/near/tidewater/tidewater_abi.json`, 41 514 octets) |
| Scripts | `scripts/testnet/{testnet-lib.mjs, deploy.mjs, e2e.mjs}`, `near-api-js` épinglé en 7.4.0 |

Les 412 Kio sont le coût du storage staking : ~4,12 NEAR sur les 10 NEAR du
faucet, avant même l'état du contrat. C'est ce nombre qui commande tout le reste.

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

## Ce qui bloque

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

## Le refaire, une fois la fenêtre rouverte

```sh
cd contracts/tidewater && cargo near build non-reproducible-wasm   # → target/near/tidewater/tidewater.wasm
cd ../.. && node scripts/testnet/deploy.mjs                       # un appel faucet, puis le déploiement
node scripts/testnet/e2e.mjs                                      # rejoue le scénario, écrit les hash ci-dessous
```

`deploy.mjs` est idempotent : comptes existants et contrat déjà en place sont
réutilisés ; `FORCE_REDEPLOY=1` remplace le wasm et réinitialise l'état (un
déploiement de code efface l'état, donc les deux vont ensemble). `deploy.mjs`
réécrit ce fichier avec les vraies adresses, les hash de déploiement et d'init
et le code hash on-chain ; `e2e.mjs` remplit ensuite le tableau du scénario.

## Transactions du scénario

<!-- e2e:begin -->
_Aucun rejeu enregistré : le contrat n'est pas on-chain, donc il n'y a pas de
hash de transaction à montrer. `node scripts/testnet/e2e.mjs` écrit ce tableau._
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
| Déployé le | 2026-11-10 18:55 (Europe/Paris) — 17:55:24 UTC |
| Commit `main` déployé | `809d71e2ec9f2107671e3eef2b843dc34110b2ce` (barreau 3 : une motion porte son argent) |
| URL de production | <https://tidewater-play.vercel.app> |
| Déploiement | `dpl_7FXFxWr5TRMySLYAqa39jwryGTq1` — `tidewater-play-7rxlwbbgd-bg-1fa3.vercel.app` |
| `engine.wasm` servi | 868 305 octets (848 Kio), md5 `00f4096ef65f3b6dd13d2781fd858e1e` |
| Service worker | `sw.js` estampillé, 12 fichiers en précache |
| Vérifications | HTTP 200 sur `/` et `/engine.wasm`, titre `Tidewater`, parcours de référence rejoué contre l'URL publique : **0 erreur console, 0 requête `/api/`, 0 requête en échec** ; `tests/e2e_offline.py` et `tests/e2e_pwa.py` verts sur le même `dist` |

Cette section vit dans un fichier que `scripts/testnet/deploy.mjs` réécrit
entièrement : le lien canonique est aussi rappelé dans `README.md`, qui n'est
pas généré.
