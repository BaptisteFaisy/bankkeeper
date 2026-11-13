# On-chain Tidewater

The harbour has two halves, and only one of them is on NEAR.

| Half | Where it lives | Who signs |
|---|---|---|
| Licences, debt notes, council votes | `contracts/tidewater` (NEP-245) | the relayer, for the captain |
| Zone stocks, landings, auction, NPC pilots, day clock | the Rust engine in wasm (`crates/wasm`, `web/src/engine.ts`) | nobody: it is a browser module |

The wasm engine **stays the default**. `VITE_CHAIN=1` adds one strip to the top
of the screen — one status line, four buttons — and those four buttons are
real transactions on a real NEAR chain. Nothing else in the UI moves.

## What is on-chain, exactly

- **Licences**: `buy_licence()` moves one licence token (id `3`) from `npc:bank`
  to the captain's account for the quoted price (`get_licence_price`).
- **Debt notes**: `buy_loan("100")` moves the Brandt note (token `100`) from the
  bank to the captain and makes the captain the lender; `forbear_loan` clears
  missed payments. `buy_loan` is reachable from the relayer API; `forbear` is
  one call away and not wired to a button.
- **Council**: `propose_rule` / `vote` / `cast_npc_votes` / `resolve_council`,
  one licence one vote. The strip's "Propose quota" tables a
  `propose_rule(QuotaPerLicence(60), indemnity 0)` with **1 yoctoNEAR**
  attached (the contract charges for the storage the motion writes:
  `E_STORAGE_DEPOSIT_REQUIRED` without it, and no escrow at zero indemnity).
  "Vote yes" is a `vote(proposal_id, true)` signed by the captain. Without an
  explicit `proposalId`, that vote goes to the **last motion the council has
  not resolved** — the one on the table — found by walking `get_proposal(1,
  2, …)` until the chain answers `E_UNKNOWN_PROPOSAL`; with no unresolved
  motion at all the relayer answers `E_NO_OPEN_PROPOSAL`, and with an explicit
  id that is already resolved it answers `E_RESOLVED` before spending gas.

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

The account id is derived from the email, not stored:
`p-<sha256(email)[:20]>.<suffix>` — the same email always gives the same
account, on every server. The key is the only thing kept, and it never
leaves the server. The house also sponsors the newcomer: it lends the first
purse (gold, capped per account) and keeps enough NEAR in the account to pay
its own gas. The dials that keep this from becoming an open wallet are in
`scripts/relayer/src/guard.mjs`, and the study of the alternatives
(FastAuth, NEAR Account Manager) is in `docs/AUTH.md`.

API, all JSON, CORS open for local dev:

```
GET  /health                       → chain, contract, day, council flag
GET  /position?email=...           → accountId, goldMilli, licences, day
POST /login          {email}       → the same shape (+ seedTxHash, seedGoldMilli)
POST /licence/buy    {email}       → buy_licence()
POST /loan/buy       {email, tokenId?}
POST /council/vote   {email, approve?, proposalId?}  → the last open motion when `proposalId` is omitted
POST /council/propose {email, quota}  → propose_rule(QuotaPerLicence(quota), 1 yocto) → txHash, proposalId
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
| `TW_CHAIN_HOME` | `~/.tidewater-chain` | node data, keys, `state.json`, `ledger.json` |
| `TW_SANDBOX_PORT` | `3030` | RPC port; the script rewrites `config.json` |
| `TW_SANDBOX_NETWORK_PORT` | — | p2p port; set it when another sandbox runs on the machine (24567 is taken by default) |
| `TW_WASM` | `target/near/tidewater/tidewater.wasm` | contract to deploy |
| `TW_RELAYER_PORT` | `8786` | relayer HTTP port |
| `TW_SINGLE_CAPTAIN` | `1` | see "What is fragile", item 1 |
| `TW_SEED_GOLD_MILLI` | `1000000` | the house's purse for a fresh captain (milli-gold), once per account |
| `TW_SEED_LIMIT_PER_HOUR` | `50` | fresh captains the house funds per hour |
| `TW_RATE_LIMIT_PER_MIN` | `30` | calls per minute per caller (IP + email) |
| `TW_ACTION_LIMIT_PER_HOUR` | `200` | sponsored transactions per captain per hour |
| `TW_NEAR_FLOOR` | `1` | below this many NEAR, the house tops the captain up |

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

1. **One captain per email works again.** `mt_transfer` is `#[payable]`
   since commit `7b2c542` ("make `mt_transfer` payable, seed the bank licence
   pool"), so gold can move between accounts again: the house lends a fresh
   captain its first purse (`mt_transfer`, 1 yocto attached) and the captain
   can buy a licence. `TW_SINGLE_CAPTAIN=1` (the default) still maps every
   email to the seeded captain; `TW_SINGLE_CAPTAIN=0` gives every email its
   own account, `p-<sha256(email)[:20]>.<suffix>`, with its own key.
   Proven by `python3 tests/relay_sponsor.py` (sandbox, no network).
2. **The bank starts with licences.** The constructor gives `npc:bank`
   `BANK_LICENCE_POOL` (4) licences, so `buy_licence` works from day one and
   the warm-up no longer has to manufacture a bankruptcy for that. It still
   walks the clock to the council window (day 21) so "Vote yes" means
   something.
3. **Cost per action**: a `buy_licence` call burns **0.31 Tgas** (measured on
   the sandbox, `tests/relay_sponsor.py`); the relayer attaches 100 Tgas. At
   the floor gas price (1 Tgas ≈ 0.0001 NEAR) that is about 0.00003 NEAR per
   action, paid by the captain's own account, which the house tops up
   (`TW_NEAR_FLOOR`): the player never sees a gas prompt.
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
