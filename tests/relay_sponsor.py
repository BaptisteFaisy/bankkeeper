"""Proof of the sponsored relayer on a local NEAR sandbox — no browser.

What it proves, in order:

1. an email maps to a **deterministic** account id (`p-<sha256(email)[:20]>.<suffix>`),
   and to the same account on every login;
2. the server creates that account and keeps its **key** (a local file, mode
   0600, under TW_CHAIN_HOME — never in the repository, never logged);
3. the house sponsors the newcomer: it lends the first purse (gold), once,
   and keeps enough NEAR in the account to pay its own gas;
4. a transaction **signed and sent by the server** buys a licence — the player
   sees no wallet, no phrase and no gas prompt;
5. `mt_balance_of`, read **straight from the RPC**, shows the licence balance
   move (before → after) and the gold paid for it, and the transaction hash
   resolves to a success on the chain;
6. the council: with no motion on the table a vote answers
   `E_NO_OPEN_PROPOSAL`; then, on the council window (the local clock is
   walked there by `scripts/relayer/src/warmup.mjs`, which also tables motion
   #1), `POST /council/propose` tables motion #2 and a vote **without**
   `proposalId` lands on #2 — the last motion the council has not resolved —
   not on #1;
7. the guardrails hold: the house lends the purse once, a captain cannot
   trigger more sponsored transactions than the cap, and a burst is refused.

Run: python3 tests/relay_sponsor.py
Needs: the contract wasm (`cd contracts/tidewater && cargo near build
non-reproducible-wasm`) and a near-sandbox binary (`NEAR_SANDBOX_BIN`).
Exit 1 on any broken step, 2 when the environment is not ready.
"""

import base64
import glob
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = "/tmp/tidewater-sponsor"
CHAIN_HOME = os.path.join(SCRATCH, "chain")
RELAYER_LOG = os.path.join(SCRATCH, "relayer.log")
EMAIL = "captain@tidewater.dev"
OTHER_EMAIL = "second@tidewater.dev"
BURST_EMAIL = "burst@tidewater.dev"
SEED_GOLD_MILLI = 1_000_000
RATE_LIMIT = 10
# One licence, one refused vote, one proposal and one vote: the cap must let a
# captain use the council, and still bite on the next action (see guardrails).
ACTION_LIMIT = 4
COUNCIL_QUOTA = 60
LICENCE = "3"
GOLD = "0"


def log(line):
    print(line, flush=True)


def free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def account_hash(email):
    """The twenty hex characters the relayer derives from the email."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:20]


def find_sandbox_bin():
    """The near-sandbox binary: env first, then the usual places."""
    candidates = [os.environ.get("NEAR_SANDBOX_BIN"), "/usr/local/bin/near-sandbox",
                  os.path.expanduser("~/.local/near-sandbox/near-sandbox"),
                  os.path.expanduser("~/mandat/.sandbox/near-sandbox")]
    candidates += sorted(glob.glob(os.path.expanduser("~/*/.sandbox/near-sandbox")))
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def env_for(sandbox_port, relayer_port, sandbox_bin):
    env = dict(os.environ)
    env["TW_CHAIN_HOME"] = CHAIN_HOME
    env["TW_SANDBOX_PORT"] = str(sandbox_port)
    env["TW_SANDBOX_NETWORK_PORT"] = str(free_port())
    env["TW_RELAYER_PORT"] = str(relayer_port)
    env["NEAR_SANDBOX_BIN"] = sandbox_bin
    env["TW_SINGLE_CAPTAIN"] = "0"       # one account per email
    env["TW_START_NEAR"] = "10"
    env["TW_SEED_GOLD_MILLI"] = str(SEED_GOLD_MILLI)
    env["TW_RATE_LIMIT_PER_MIN"] = str(RATE_LIMIT)
    env["TW_ACTION_LIMIT_PER_HOUR"] = str(ACTION_LIMIT)
    return env


def start_sandbox(env, attempts=3):
    """Start the local chain and deploy the contract. The script is
    idempotent, so a flaky RPC call is simply retried."""
    last = ""
    for attempt in range(attempts):
        proc = subprocess.run(["node", "scripts/sandbox/start.mjs"], cwd=ROOT, env=env,
                              timeout=900, capture_output=True, text=True)
        if proc.returncode == 0:
            return proc
        last = proc.stdout[-2000:] + proc.stderr[-2000:]
        log("  attempt {} failed, retrying".format(attempt + 1))
    raise RuntimeError("the sandbox did not start:\n" + last)


def run_node(args, env, timeout=900):
    proc = subprocess.run(["node"] + args, cwd=ROOT, env=env, timeout=timeout,
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError("node {} failed:\n{}\n{}".format(
            " ".join(args), proc.stdout[-3000:], proc.stderr[-3000:]))
    return proc


def wait_http(url, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as res:
                return json.loads(res.read().decode())
        except (urllib.error.URLError, OSError, ValueError):
            time.sleep(0.3)
    raise RuntimeError("no answer from " + url)


def post(base, path, body):
    """POST JSON; returns (status, payload). The status may be an error."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(base + path, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        return err.code, json.loads(raw) if raw else {}


def get(base, path):
    try:
        with urllib.request.urlopen(base + path, timeout=60) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        return err.code, json.loads(raw) if raw else {}


def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode())


def view(rpc_url, contract, method, args):
    """A contract view call, straight from the node (not via the relayer)."""
    payload = rpc(rpc_url, "query", {
        "request_type": "call_function", "finality": "final",
        "account_id": contract, "method_name": method,
        "args_base64": base64.b64encode(json.dumps(args).encode()).decode(),
    })
    raw = bytes(payload["result"]["result"])
    return json.loads(raw.decode()) if raw else None


def balance(rpc_url, contract, account, token):
    return int(view(rpc_url, contract, "mt_balance_of", {"account_id": account, "token_id": token}))


def tx_status(rpc_url, tx_hash, sender):
    """The chain's own verdict on a transaction hash."""
    payload = rpc(rpc_url, "tx", [tx_hash, sender])
    return payload.get("result", {}).get("status", {})


def gas_burnt(rpc_url, tx_hash, sender):
    """What the sponsored transaction really cost, in Tgas."""
    payload = rpc(rpc_url, "tx", [tx_hash, sender])
    result = payload.get("result", {})
    for key in ("final_execution_outcome", "transaction_outcome"):
        outcome = result.get(key, {}).get("outcome", {})
        if outcome.get("gas_burnt") is not None:
            return int(outcome["gas_burnt"]) / 1e12
    return None


def near_balance(rpc_url, account):
    payload = rpc(rpc_url, "query",
                  {"request_type": "view_account", "account_id": account, "finality": "final"})
    return int(payload["result"]["amount"]) / 1e24


def decode_receipt(verdict):
    """The contract's own receipt, when the transaction succeeded."""
    raw = verdict.get("SuccessValue") or verdict.get("Success")
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = base64.b64decode(raw).decode("utf-8", errors="replace")
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def login(base, email):
    status, body = post(base, "/login", {"email": email})
    check(status == 200, "login {} answered {}: {}".format(email, status, body))
    return body


def relayer_output():
    try:
        with open(RELAYER_LOG, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def phase_identity(base, state):
    """The email maps to one account, and the house funds the newcomer."""
    body = login(base, EMAIL)
    account = body["accountId"]
    expected = "p-{}.{}".format(account_hash(EMAIL), state["accountSuffix"])
    check(account == expected, "the account id {} is not the derived {}".format(account, expected))
    check(body.get("seedTxHash"), "the house lent no purse: " + json.dumps(body))
    check(int(body["goldMilli"]) == SEED_GOLD_MILLI,
          "the purse holds {} milli-gold, not {}".format(body["goldMilli"], SEED_GOLD_MILLI))
    near = near_balance(state["rpcUrl"], account)
    check(near >= 1, "the captain holds {} NEAR: it could not pay its own gas".format(near))
    log("• email {} → account {} (tx {})".format(EMAIL, account, body["seedTxHash"]))
    log("  sponsored: {} milli-gold lent, {} NEAR of gas".format(body["goldMilli"], near))
    again = login(base, EMAIL)
    check(again["accountId"] == account, "the same email gave two accounts")
    check(again.get("seedTxHash") is None, "the house lent a second purse to the same captain")
    other = login(base, OTHER_EMAIL)
    check(other["accountId"] != account, "two emails gave the same account")
    check(int(other["goldMilli"]) == SEED_GOLD_MILLI, "the second captain was not funded")
    log("  deterministic: {} → {} (a second email → {})".format(EMAIL, account, other["accountId"]))
    return account


def phase_custody(account):
    """The key is on this server, 0600, and nowhere else."""
    key_file = os.path.join(CHAIN_HOME, "players", account_hash(EMAIL) + ".json")
    check(os.path.isfile(key_file), "no key file for the captain at " + key_file)
    mode = os.stat(key_file).st_mode & 0o777
    check(mode == 0o600, "the key file is {:o}, not 600".format(mode))
    with open(key_file, encoding="utf-8") as fh:
        secret = json.load(fh)["secret_key"]
    check(secret not in relayer_output(), "the secret key leaked into the relayer log")
    log("• key custody: players/{}.json mode {:o} (never in the tree, never logged)".format(
        account_hash(EMAIL), mode))
    return secret


def phase_transaction(base, contract, account):
    """The server signs, sends and pays: the balance moves on chain."""
    before_licences = balance(STATE["rpcUrl"], contract, account, LICENCE)
    before_gold = balance(STATE["rpcUrl"], contract, account, GOLD)
    status, body = post(base, "/licence/buy", {"email": EMAIL})
    check(status == 200, "the sponsored purchase answered {}: {}".format(status, body))
    tx_hash = body.get("txHash")
    check(tx_hash, "no transaction hash came back")
    after_licences = balance(STATE["rpcUrl"], contract, account, LICENCE)
    after_gold = balance(STATE["rpcUrl"], contract, account, GOLD)
    price = int(body["priceMilli"])
    check(after_licences == before_licences + 1,
          "the licence balance did not move: {} → {}".format(before_licences, after_licences))
    check(after_gold == before_gold - price,
          "the gold did not move: {} → {} (price {})".format(before_gold, after_gold, price))
    verdict = tx_status(STATE["rpcUrl"], tx_hash, account)
    receipt = decode_receipt(verdict)
    check(receipt is not None, "the transaction did not succeed: " + json.dumps(verdict))
    log("• sponsored transaction: {}".format(tx_hash))
    log("  receipt: {}".format(receipt))
    log("  gas burnt: {} Tgas (the relayer attaches 100)".format(gas_burnt(STATE["rpcUrl"], tx_hash, account)))
    log("  mt_balance_of({}) licence {} → {} · gold {} → {} (price {})".format(
        account, before_licences, after_licences, before_gold, after_gold, price))
    return tx_hash, after_licences


def phase_guards(base):
    """The caps bite: a burst is refused, a captain cannot spend forever."""
    refused = 0
    for _ in range(RATE_LIMIT + 4):
        status, body = get(base, "/position?email=" + BURST_EMAIL)
        if status == 429:
            refused += 1
            check(body.get("error") == "E_RATE_LIMIT",
                  "the burst was refused by " + json.dumps(body))
    check(refused > 0, "a burst of {} calls was not refused".format(RATE_LIMIT + 4))
    status, body = post(base, "/licence/buy", {"email": EMAIL})
    check(status == 429 and body.get("error") == "E_ACTION_CAP",
          "the action cap did not bite after {} sponsored actions: {} {}".format(
              ACTION_LIMIT, status, json.dumps(body)))
    with open(os.path.join(CHAIN_HOME, "ledger.json"), encoding="utf-8") as fh:
        ledger = json.load(fh)
    entry = ledger.get(account_hash(EMAIL), {})
    check(entry.get("seededMilli") == SEED_GOLD_MILLI,
          "the house lent {} milli-gold, not {}".format(entry.get("seededMilli"), SEED_GOLD_MILLI))
    log("• guardrails: a burst of {} calls → {} refusals · the action after {} sponsored "
        "ones → E_ACTION_CAP · the purse lent once ({} milli-gold)".format(
            RATE_LIMIT + 4, refused, ACTION_LIMIT, entry.get("seededMilli")))


def phase_no_open_proposal(base):
    """A vote without a motion on the table names the reason, not a panic."""
    status, body = post(base, "/council/vote", {"email": EMAIL})
    check(status == 409 and str(body.get("error", "")).startswith("E_NO_OPEN_PROPOSAL"),
          "a vote with no motion answered {}: {}".format(status, json.dumps(body)))
    log("• council, empty ballot: a vote without proposalId → E_NO_OPEN_PROPOSAL")


def phase_warmup(env, contract):
    """Walk the local clock into the council window and table motion #1.

    The repo's own warm-up does both (`run_day` until season day 21, then a
    `propose_rule` by the house): reusing it keeps one implementation of the
    walk. It never leaves this throwaway sandbox.
    """
    bank = int(view(STATE["rpcUrl"], contract, "get_ledger",
                    {"owner": "npc:bank", "token_id": LICENCE}))
    check(bank > 0, "the bank holds {} licences: the warm-up would manufacture one".format(bank))
    run_node(["scripts/relayer/src/warmup.mjs"], env)
    with open(os.path.join(CHAIN_HOME, "state.json"), encoding="utf-8") as fh:
        state = json.load(fh)
    day = view(STATE["rpcUrl"], contract, "get_day", {})
    check(day["council_open"] is True, "the council is still closed on day {}".format(day["day"]))
    first = int(state["proposalId"])
    motion = view(STATE["rpcUrl"], contract, "get_proposal", {"proposal_id": first})
    check(motion["resolved"] is False, "the warm-up motion {} is already resolved".format(first))
    log("• council, window: day {} (council open), motion #{} tabled, unresolved".format(
        day["day"], first))
    return first


def phase_council(base, contract, account, first):
    """Propose tables motion #2; a vote without proposalId lands on #2."""
    status, proposed = post(base, "/council/propose", {"email": EMAIL, "quota": COUNCIL_QUOTA})
    check(status == 200, "the propose answered {}: {}".format(status, proposed))
    check(proposed.get("txHash"), "no transaction hash came back from propose")
    second = int(proposed["proposalId"])
    check(second == first + 1, "the new motion is #{} after #{}".format(second, first))
    motion = view(STATE["rpcUrl"], contract, "get_proposal", {"proposal_id": second})
    check(motion["kind"] == {"QuotaPerLicence": COUNCIL_QUOTA},
          "the motion carries {} not a {} licence quota".format(motion["kind"], COUNCIL_QUOTA))
    check(motion["author"] == account, "the motion author is {}".format(motion["author"]))
    check(int(motion["escrow_milli"]) == 0, "a zero-indemnity motion escrowed {}".format(motion["escrow_milli"]))
    verdict = tx_status(STATE["rpcUrl"], proposed["txHash"], account)
    check(decode_receipt(verdict) is not None, "propose_rule did not succeed: " + json.dumps(verdict))
    log("• council, propose: motion #{} (quota {}) {} · tx {}".format(
        second, COUNCIL_QUOTA, account, proposed["txHash"]))
    log("  escrow {} milli (zero indemnity), 1 yoctoNEAR attached for the storage".format(
        motion["escrow_milli"]))

    status, voted = post(base, "/council/vote", {"email": EMAIL, "approve": True})
    check(status == 200, "the vote without proposalId answered {}: {}".format(status, voted))
    check(int(voted["proposalId"]) == second,
          "the vote landed on motion #{} instead of the open #{}".format(voted["proposalId"], second))
    after = view(STATE["rpcUrl"], contract, "get_proposal", {"proposal_id": second})
    check(after["voters"] == [account], "motion #{} voters are {}".format(second, after["voters"]))
    check(int(after["yes_weight"]) == 1, "motion #{} yes weight is {}".format(second, after["yes_weight"]))
    older = view(STATE["rpcUrl"], contract, "get_proposal", {"proposal_id": first})
    check(older["voters"] == [] and int(older["yes_weight"]) == 0,
          "the older motion #{} also took the vote: {}".format(first, older["voters"]))
    log("  vote without proposalId → motion #{} yes {} no {} voters [{}] · tx {}".format(
        second, after["yes_weight"], after["no_weight"], ", ".join(after["voters"]), voted["txHash"]))
    log("  motion #{} untouched: voters [{}], yes {}".format(first, ", ".join(older["voters"]), older["yes_weight"]))
    return second


STATE = {}


def main():
    global STATE
    wasm = os.path.join(ROOT, "target/near/tidewater/tidewater.wasm")
    if not os.path.isfile(wasm):
        log("missing {}: run `cd contracts/tidewater && cargo near build non-reproducible-wasm`".format(wasm))
        return 2
    sandbox_bin = find_sandbox_bin()
    if sandbox_bin is None:
        log("no near-sandbox binary: set NEAR_SANDBOX_BIN")
        return 2
    shutil.rmtree(CHAIN_HOME, ignore_errors=True)
    os.makedirs(SCRATCH, exist_ok=True)
    sandbox_port, relayer_port = free_port(), free_port()
    env = env_for(sandbox_port, relayer_port, sandbox_bin)
    relayer = None
    try:
        log("• sandbox on 127.0.0.1:{} ({})".format(sandbox_port, sandbox_bin))
        start_sandbox(env)
        with open(os.path.join(CHAIN_HOME, "state.json"), encoding="utf-8") as fh:
            STATE = json.load(fh)
        log("  contract {} · rpc {}".format(STATE["contractId"], STATE["rpcUrl"]))

        log("• relayer on 127.0.0.1:{}".format(relayer_port))
        with open(RELAYER_LOG, "w", encoding="utf-8") as sink:
            relayer = subprocess.Popen(["node", "scripts/relayer/src/relayer.mjs"], cwd=ROOT, env=env,
                                       stdout=sink, stderr=subprocess.STDOUT)
        base = "http://127.0.0.1:{}".format(relayer_port)
        wait_http(base + "/health")

        account = phase_identity(base, STATE)
        phase_custody(account)
        tx_hash, licences = phase_transaction(base, STATE["contractId"], account)
        phase_no_open_proposal(base)
        first = phase_warmup(env, STATE["contractId"])
        phase_council(base, STATE["contractId"], account, first)
        phase_guards(base)
        log("")
        log("PASS — email → deterministic account → sponsored purchase → council")
        log("  transaction: {}".format(tx_hash))
        log("  licences held by the captain: {}".format(licences))
        log("  the browser never saw a key, a phrase or a gas prompt")
        return 0
    finally:
        if relayer is not None and relayer.poll() is None:
            relayer.send_signal(signal.SIGTERM)
            try:
                relayer.wait(timeout=10)
            except subprocess.TimeoutExpired:
                relayer.kill()
        subprocess.run(["node", "scripts/sandbox/stop.mjs"], cwd=ROOT, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    sys.exit(main())
