# On-chain Tidewater

The harbour has two halves, and only one of them is on NEAR.

| Half | Where it lives | Who signs |
|---|---|---|
| Licences, debt notes, council votes | `contracts/tidewater` (NEP-245) | the relayer, for the captain |
| Zone stocks, landings, auction, NPC pilots, day clock | the Rust engine in wasm (`crates/wasm`, `web/src/engine.ts`) | nobody: it is a browser module |

The wasm engine **stays the default**. `VITE_CHAIN=1` adds one strip to the top
of the screen — one status line, three buttons — and those three buttons are
real transactions on a real NEAR chain. Nothing else in the UI moves.

## What is on-chain, exactly

- **Licences**: `buy_licence()` moves one licence token (id `3`) from `npc:bank`
  to the captain's account for the quoted price (`get_licence_price`).
- **Debt notes**: `buy_loan("100")` moves the Brandt note (token `100`) from the
  bank to the captain and makes the captain the lender; `forbear_loan` clears
  missed payments. `buy_loan` is reachable from the relayer API; `forbear` is
  one call away and not wired to a button.
- **Council**: `propose_rule` / `vote` / `cast_npc_votes` / `resolve_council`,
  one licence one vote. The strip's "Vote yes" is a `vote(proposal_id, true)`
  signed by the captain.

Off-chain, deliberately: fish, stocks, the auction, the NPC boats and the day
cycle. They are the game; the contract only holds what a player can own or
contest.

## Sponsored relayer: no wallet, no phrase, no gas

The browser never holds key material. It posts `{email}` and an intent to a
small Node server, which:

1. maps the email to a NEAR account it controls (key file, mode 0600, under
   `TW_CHAIN_HOME` — **never in the repository**);
2. signs the transaction with that key and pays the gas from that account;
3. answers with the transaction hash and the position read back from the
   contract (`mt_balance_of`).

API, all JSON, CORS open for local dev:

```
GET  /health                       → chain, contract, day, council flag
GET  /position?email=...           → accountId, goldMilli, licences, day
POST /login          {email}       → the same shape (creates nothing on sandbox)
POST /licence/buy    {email}       → buy_licence()
POST /loan/buy       {email, tokenId?}
POST /council/vote   {email, approve?, proposalId?}
```

## Run it

```bash
# 1. the chain (idempotent; rerun to resume)
node scripts/sandbox/start.mjs          # NEAR_SANDBOX_BIN, TW_CHAIN_HOME, TW_SANDBOX_PORT
node scripts/relayer/src/warmup.mjs     # ~50 headless days, contract API only
# 2. the signer
node scripts/relayer/src/relayer.mjs    # TW_RELAYER_PORT (8786)
# 3. the proof
python3 tests/e2e_onchain.py            # builds web/dist-chain, drives Chrome
# stop exactly what we started, by pid
node scripts/sandbox/stop.mjs
```

`start.mjs` needs the contract wasm:

```bash
cd contracts/tidewater && cargo near build non-reproducible-wasm   # → target/near/tidewater/tidewater.wasm
```

Environment, all optional on a sandbox:

| Variable | Default | Meaning |
|---|---|---|
| `NEAR_SANDBOX_BIN` | `~/mandat/.sandbox/near-sandbox` | the node binary, not vendored |
| `TW_CHAIN_HOME` | `~/.tidewater-chain` | node data, keys, `state.json` |
| `TW_SANDBOX_PORT` | `3030` | RPC port; the script rewrites `config.json` |
| `TW_WASM` | `target/near/tidewater/tidewater.wasm` | contract to deploy |
| `TW_RELAYER_PORT` | `8786` | relayer HTTP port |
| `TW_SINGLE_CAPTAIN` | `1` | see "What is fragile", item 1 |

The browser side: `web/build:chain` (`VITE_ENGINE=wasm VITE_CHAIN=1`) builds
`dist/`; `?chain=http://127.0.0.1:8786` overrides the relayer URL at runtime, so
one build works against any port. `vite dev` proxies `/chain` to 8786.

## Moving to testnet

Same code, four variables, no key in the tree:

```bash
export TW_NETWORK_ID=testnet
export TW_ACCOUNT_SUFFIX=testnet                 # accounts become *.testnet
export TW_CONTRACT_ID=tidewater.<deployer>.testnet
export TW_MASTER_ACCOUNT=<deployer>.testnet      # funds accounts and gas
export TW_MASTER_KEY_FILE=~/.near-credentials/testnet/<deployer>.testnet.json
export TW_RPC_URL=https://rpc.testnet.fastnear.com
```

`start.mjs` skips the local node when `TW_RPC_URL` answers, creates
`tidewater.<suffix>` / `player.<suffix>` / `house.<suffix>` / `bank.<suffix>`
from the master account, deploys and initialises. The relayer then only reads
`state.json`. Keys generated at login live under `TW_CHAIN_HOME`, so on a server
that directory is the secret: back it up or you lose every captain.

## What is fragile — read this before demoing

1. **`mt_transfer` is uncallable, so gold cannot move between accounts.**
   `nep245.rs` demands `attached_deposit >= 1` (`E_YOCTO_REQUIRED`) but the
   method is not `#[payable]`, so near-sdk rejects the deposit before the body
   runs: 0 yocto panics, 1 yocto panics "doesn't accept deposit". Consequences:
   a fresh account can never be funded with gold, so it can never buy a licence
   or a note. The sandbox therefore runs **one captain**: every email maps to
   the seeded captain account (`TW_SINGLE_CAPTAIN=1`). `TW_SINGLE_CAPTAIN=0`
   creates one account per email, with its own key — useful for the ballot, not
   for the market. The two-line fix is on the contract side: add `#[payable]`
   to `mt_transfer` and `mt_batch_transfer`.
2. **The bank starts with no licence.** The constructor gives all 20 licences to
   the four captains; `npc:bank` only refills through `settle_bankruptcies`.
   With gold seeded at 1000× the UI's scale (150 000 gold for the captain,
   6 gold a day of upkeep) no captain ever goes broke on its own. The warm-up
   therefore manufactures one bankruptcy with the contract's own entry points:
   the captain escrows its purse in a council motion (`propose_rule` escrows
   80 × indemnity), one day of upkeep takes the remainder to exactly zero, the
   settlement week calls in its four licences, `resolve_council` refunds the
   untouched escrow to its author, and `invest_in_actor("player", 1000)` reopens
   the captain. It is honest — nothing is minted — but it is a warm-up, not a
   market. The right fix is seeding `npc:bank` with a few licences in `new()`.
3. **Cost per action**: a `buy_licence` call burns ~3 Tgas of the 30 Tgas the
   relayer attaches; at the sandbox gas price that is a rounding error, on
   testnet it is ~0.0001 NEAR per action, paid by the house account, not the
   player. The account needs a NEAR balance to sign at all: 10 NEAR per captain
   is years of clicks.
4. **The council window is season days 21..27.** Outside it, `vote` panics
   `E_COUNCIL_CLOSED` and the relayer returns that code; the warm-up leaves the
   chain at day 49 (season day 21) with a motion already tabled.
5. **The debt note is temporary.** `settle_loans` amortises 96 gold a week and
   deletes the note when it reaches zero: after ~10 weeks of `run_day` the
   Brandt note is gone and `/loan/buy` answers `E_UNKNOWN_LOAN`.
6. **Losing `TW_CHAIN_HOME` loses every captain's key.** Custody is the
   house's: there is no recovery, no export, no second copy. That is the price
   of "no seed phrase".
7. `python3 tests/e2e_offline.py` still proves the wasm demo asks `/api` for
   nothing; chain mode is a separate build and never touches that path.
