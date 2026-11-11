# Déploiement testnet

Statut : **déployé**. Écrit par `node scripts/testnet/deploy.mjs` le
2026-11-11T05:06:12.537Z — relancer le script est idempotent : un compte
existant et un contrat déjà en place sont réutilisés, et `FORCE_REDEPLOY=1`
n'est **pas** un moyen de repartir de zéro (l'état survit au dépôt du code, le
`new` qui suit panique — voir `docs/TESTNET-RUN.md`). Aucune clé n'est écrite
ici : les credentials vivent dans `~/.near-credentials/testnet/`, hors du dépôt.

## Adresses

| Rôle | Compte |
|---|---|
| Contrat, et propriétaire (fait tourner la journée, pilote les bateaux NPC) | `bankkeeper.testnet` |
| Joueur | `player.bankkeeper.testnet` |
| Second capitaine (reçoit une licence dans le scénario) | `captain.bankkeeper.testnet` |
| Banque / signataire de réserve | `bank.bankkeeper.testnet` |

Explorateur : <https://testnet.nearblocks.io/address/bankkeeper.testnet>

La racine vient du faucet public de testnet (10 NEAR) et tous les autres comptes en sont des sous-comptes : un seul appel au faucet.

## Contrat

| Élément | Valeur |
|---|---|
| Wasm | `target/near/tidewater/tidewater.wasm`, 423 KiB (433552 octets) |
| sha256 | `08b8ab6a43433e527182521dee57b824d5ba9820522f264ebc3cd89222f344ca` |
| Hash de déploiement | `C7g252mfpYjgTYw5Hby5dmPJZLEP87DafRRN69LvQmYy` |
| Hash d'init (`new(owner, player)`) | `8QLcj6Ua9o4XPT319brdPha37ekFEmk2WymSKcK5JJXZ` |
| Code hash on-chain | `b3atbgna5Lvi1GGqGz8ecP1wHBwBTC1Pe93VAhqEPZj` |

État après ce run : jour 22, masse d'or 10653309600 milli,
extérieur entré 3444000 / sorti 134400.

Déployé : les licences (`3`), les notes de dette (100+), les actes de bateau
(10-19), l'or (0) et les poissons (1, 2) sur le registre NEP-245 — plus le
scrutin du conseil, une voix par licence. Pas on-chain, par construction : les
stocks de zone, la criée et les pilotes NPC (ils tournent dans le moteur
wasm/sim ; la chaîne ne règle que ce que le joueur peut échanger).

## Soldes restants

| Compte | Solde |
|---|---|
| `bankkeeper.testnet` | 8.469 NEAR |
| `player.bankkeeper.testnet` | 0.488 NEAR |
| `captain.bankkeeper.testnet` | 0.500 NEAR |
| `bank.bankkeeper.testnet` | 0.500 NEAR |

Le storage du code est staké sur le compte contrat (il n'apparaît pas dans son
solde liquide) ; le reste est du NEAR disponible pour les appels.

## Commandes

```bash
make testnet-wasm            # cargo near build non-reproducible-wasm
make testnet-deploy          # ou : node scripts/testnet/deploy.mjs
make testnet-e2e             # ou : node scripts/testnet/e2e.mjs
```

## Transactions du scénario



<!-- e2e:begin -->
Replayed by `node scripts/testnet/e2e.mjs` on 2026-11-11T04:40:48.840Z.

| Transaction | Hash |
|---|---|
| assign_boat(10) | `CrvhNGotUFY8umsEkzJED3ZZSmNWbAgik4mXdmLaQT3z` |
| assign_boat(11) | `7jeJucFP3w588fiJKuPHfHKcscgQTErNtDxe8tt59tut` |
| land_lot(10) | `GvGhVFvzSh8N2rXXMw5M6F1S3QjyTZTaPRB69KPgBVmP` |
| land_lot(11) | `4JMPfJjboMJN2kqCNBrfLiPSUWe8nEfTG4Aueqg8sgvL` |
| run_day | `4SjZ5wCCswb5NWsBnZw75qBk39ip8x4oyy8QPHaLAk5Q` |
| land_lot(10) | `44BeJFUbE6Q8c3ypkpzmfAbZWkqSeQTJdFEMXUVAa9z8` |
| land_lot(11) | `6W3wuuXqSDTdgKfVW819p9TxeePns7ohsLvxaAJmGkwK` |
| run_day | `FYGZcggJzJbBioGpD9pFhyWcCRsbpgippNpomdMTdd2W` |
| land_lot(10) | `4NYq1nfpoFyA4KdZ3DUuYfjjfrTsWHDkDiHxcLGFnzgW` |
| land_lot(11) | `HQeQrCADRQsBMrEMERErKRvpcb6TeNDQy82vr9TdBZUT` |
| run_day | `GMbp1ktFSSWvncN8fFsmFE1eX4ryorvEvd5S3UMqWPPf` |
| land_lot(10) | `63PfUcf6tSdhMbpH1tTWWBKxXJpFdkAtBprY69iwdUv` |
| land_lot(11) | `33rufuicUpk5PD5SGRw54eRjZUAQnsPZitdtCfPaiYMp` |
| run_day | `8U2KQ8Qa6KHE4bpLJkkEptftr2bkJarGsgQCzZ2jJhYT` |
| land_lot(10) | `BiuEXYSuZfZP9xiDp7aTHJvU718WSK6FuGG4mJtHyR1C` |
| land_lot(11) | `4CjvYHyAisZ24hdTXALnTjcyyVwcRuQXPo95uQGuuh1o` |
| run_day | `8km2sEXVrayjGt8M4LAshVvQzQdvfnZviXUavioKwxPi` |
| land_lot(10) | `ABKYSyQ3w3WnErKRgN6zQc5woAmTk4CeeZ4o7NxVqbsi` |
| land_lot(11) | `3et7CVq1GG1rMyyYdF7DaosdjwxiTe2y91rSydRfDSU3` |
| run_day | `5bSweKuzpJFrpo4Y7jWRmRWXjwbLfTx7UGx4wVvYcTrS` |
| land_lot(10) | `6GHMm7FPg6wxKvUHS6WKCs33AGeJmAfTyjHLJXdcLg8d` |
| land_lot(11) | `3GhdbekXNHfpPBaAap5C2YsTA6Pskmrs6hwbY2iAJXkM` |
| run_day | `2cx4WiSjpe3dW8siSG4jjtpFH9m2CZiNMFzUhFqhFNkz` |
| land_lot(10) | `HqN6MU1V8DhYpmG7yBjS8yh8Fqj5DGi8uWc2uGSYyBX` |
| land_lot(11) | `3hATARgwdJN8sNGuxNgwhqeEgVvzthwkuy4oFTzDFXLf` |
| run_day | `3RCEMeB26nRMyePNfxcmL4UuPJdrgTCqMQGpuLCWj3nG` |
| land_lot(10) | `JAyxJkH9LbkbbNK4BxHnW4BLznQrxnrGdrGZ1s5g7Baw` |
| land_lot(11) | `CG9c1aZK2DidjMcdEr3XdRze9WJV5fawUVtnbA9qxVhn` |
| run_day | `85cDmB53UBQ8Gz53g7c5XRKDPBF6dB944WqpCxfCa9XG` |
| land_lot(10) | `4s4fNzdzz5amyFek7QRkHqYXxXj4GE5gsm7aEwECe3QF` |
| land_lot(11) | `J8qvuixei2Uq3QWVtmvuG5rAtwPwkL4RprtdpGT4BHtt` |
| run_day | `4fQ1F3X99WL3xpGoTr7SCgq17JEn6k9CAwxXbLnPRCv3` |
| land_lot(10) | `2As3Fb4r4xmyNE6zt3Mpu5dcH4oG3QjKoHN6YAGuG8An` |
| land_lot(11) | `FuFsMNmTJzSAm3JYcC1bzagi5rNkMq7ZakCPwcWEKvwH` |
| run_day | `6eWzCdXSuMsdPzPCJVTWScuf5dBtD65ke1bti7X7wJiU` |
| land_lot(10) | `6Ln5xzx7kocKb1hsXHviSLpL9e22sUGQnghuFMcfUkLZ` |
| land_lot(11) | `7XVU9dRvBwx2VLGosqgPKb3WjmBmUVTEFUqL1UxvJ6X3` |
| run_day | `CG77MCE9MnY3wotHdjXpuSrfG5UxJLnk9wjTsz4eNtp1` |
| land_lot(10) | `vztPb9DZCpHvWXUTLMPPxJ11wW9EUYCkeNBu6K9BtCR` |
| land_lot(11) | `Fmwtnak7HAJNCAK3ADs6k9fsgFr5xoXkpiDqoSTMCppj` |
| run_day | `HAqNGZUPKoLodGEqi7yfAmwyXa5nFZPyxTHmGCkbrBFg` |
| land_lot(10) | `3ULBGiEZNCTH9XnGkKrqLLyGPgXHE7q5wdACB2THEVp6` |
| land_lot(11) | `DozyUVA5iHYA5rToZN9Xa8XhnAMZ4ME92kNXpRZywXqE` |
| run_day | `97AmATbtCbVPKxSMMv9G5S1xR8rfcRwwaNj7XYxyNbL` |
| land_lot(10) | `87p4TCUbYhPrJjcWH4sYjwAsVuJ3xPG2GdNu5AMVq11i` |
| land_lot(11) | `HMhoeUoRPDz3JM1XvARpooZvcAYwzCs4kZukNMrGjfXf` |
| run_day | `adSsymitT6B4TxUvgSJ8yC77LVwokaHuACaus6faSxy` |
| land_lot(10) | `HT4VQLDP3FSWqPVdQ9REuj9MGqQnBeycKuE71nTPXpN1` |
| land_lot(11) | `HqP3oHCWBiWVbovQ9HMXapz784nsGTeuS8yvHk5NdmLp` |
| run_day | `Appxmdfmu83fES8urM4LVup1uihbmzMFUMaG2Ax656D1` |
| land_lot(10) | `CmVJrnqhPj2VVsZXUguUo6pTUc8Mee7NiRZyUsQgeVbd` |
| land_lot(11) | `AB9UpPMxA5gPpMxhGBLGDZczB4YhT8L3JevM61P8Fg6D` |
| run_day | `ARSC5iAP4ZKDWcbYhYPvjF4EhEGAseAHqM684tEKV8aE` |
| land_lot(10) | `DutwXizi4i6aau3jux2Dhc9DkBJcXfW7GkqSg6fKpCsC` |
| land_lot(11) | `6zLvi6pbc7J9A6aRxxgiS9EpTjk2U411iV1MQDTqPECT` |
| run_day | `CHSoCTJ3Eusg8H1wBkbzcFCs3sBcWtdScBcJqTCJXf8H` |
| land_lot(10) | `ApXTPqwQxMNHdhjjfLntZJ4fXhr8go5babactrwZykQN` |
| land_lot(11) | `HriBYf3zkdaS6UtnZVKBhS7RhjsPEUKZo5zYGbocoybV` |
| run_day | `GXgxZBHjfHu81eg8HzYa6pUFHxqRqyXk1wyvSV5M5C7P` |
| land_lot(10) | `GCWNekt911cgnqrt7AJ2mZddhmfbVefViKVJ7ov85Uv7` |
| land_lot(11) | `7Cj64DjJtmwKxfFu3WSuGpzb7ksdRV5FZvBP9AfceJBB` |
| run_day | `4x827ZhK4BvDWCfTTBvipcXp7D2kB2GAw81uRRN9aBYU` |
| land_lot(10) | `95aWTw2RxUSqBcpnmhsDv7vnpwPt4VirtgErw9QrM9ux` |
| land_lot(11) | `5VNWm1gDJuf1NZprwLWTH9D35H6MDeenkKtFV4bzThqg` |
| run_day | `G2U84U92JZ3914wvwXsTErV17QqszHuaz5heRMBjUkrP` |
| buy_licence() | `FexU3H6qoRa1iQ3mttDi7r56vanKoLBXoYtT7n136RVT` |
| mt_transfer(licence) | `A7C1TyrARXw7oDmQnD8kKp4uVTr5iDUPvYE4erQ9kR8F` |
| buy_loan(100) | `Dqa31XXKd5rWDLGWCbJBzbSpXPSqGeisiDPKMwWE5cCc` |
| forbear_loan(100) | `84h4mFgT5M7WpJt1DFLiQCuZZb9s9Q89oyNFmgEzWsJE` |
| propose_rule(quota 80) | `H5KhiZ54Vi5pVpg3E7e4q5Dju3AxEo8UkJax6AjZdxC8` |
| vote(1) | `2S13BsHdpW2chLKkLgq5CZJEC3em5UPA5SHLMXzcDA4A` |
| vote(1) | `7u6hBTaS64oR2jQYcXQZ1mFGNeqc5tJqWiP7mSQ5QwPt` |
| cast_npc_votes | `DMKnzcr6smMdoEvALDA2xQd3bWXQoWhe5UktA4ku4iyr` |
| resolve_council | `ETsUigsAeyG2ySCZVcwvSiChvZXTASrCCUJSAsJYkEw2` |
| run_day | `CWGabu7jkVs2gwjq4tTMeWMJBuC9Dve3XDdKvkost2Pc` |

Full transcript with every value read back: `docs/e2e-testnet.log`.
<!-- e2e:end -->



<!-- hand:begin -->
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

## Ce que le run testnet a appris de plus que le sandbox

La répétition sur `near-sandbox` (11/11/2026, `docs/TESTNET-RUN.md`) avait
prouvé la recette, mais **le testnet a trouvé deux choses qu'aucune chaîne
locale ne pouvait montrer** :

1. **La dotation du capitaine était trop mince.** Le testnet pré-charge
   100 Tgas contre le signataire de chaque appel : le bulletin du capitaine a
   coûté 0,1009 NEAR alors que le compte n'en avait que 0,100. La suite
   (`vote(1)`) a échoué avec `Not enough balance`, après 71 transactions
   déjà passées. Les trois comptes du scénario reçoivent maintenant 0,5 NEAR
   chacun au lieu de 0,1.
2. **Un rejeu n'est pas reprenable.** `scripts/testnet/e2e.mjs` rejoue la
   journée 0 : sur un contrat déjà avancé, la note de dette 100 a un autre
   prêteur et la motion 1 est déjà votée. Il n'y a pas de reprise à mi-parcours,
   et le contrat n'a pas de fonction de réinitialisation : repartir de zéro
   impose de **supprimer le compte** et de le recréer. C'est ce qui a été fait
   avant ce run, et le compte a été recréé par le faucet avec la même clé
   publique — le scénario ci-dessus est donc un rejeu complet et propre.

La leçon tient en une phrase : sur le testnet public, il faut **prévoir le
gas**, et il faut un compte neuf pour un rejeu complet.

## Référence : la répétition sur near-sandbox

La chaîne locale et son transcript sont dans
[`docs/TESTNET-RUN.md`](TESTNET-RUN.md) et `docs/e2e-sandbox.log`. Ce sont des
hashs d'une chaîne locale : ils ne sont consultables nulle part. Les hashs
ci-dessus sont ceux du testnet public et se vérifient sur
<https://testnet.nearblocks.io/address/bankkeeper.testnet>.
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

La page de preuves `/proofs.html` lit l'adresse du contrat dans **ce document**
(`web/src/proofs/deployment.ts` est le seul lecteur) : il n'y a donc qu'un seul
endroit où l'adresse est écrite, et le build du site la reprend telle quelle.

<!-- hand:end -->
