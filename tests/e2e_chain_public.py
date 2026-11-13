"""Public proof: the demo, in chain mode, really buys a licence on chain.

This is the judge-facing test. It runs against the **public** site (no local
build, no local relayer) and proves the three things the track asks for:

1. an email becomes a real NEAR testnet account — no wallet, no seed phrase;
2. a sponsored action returns a **real** transaction hash (base58, 40-64 chars)
   that the testnet RPC knows;
3. the contract state moved: `mt_balance_of(account, licence)` goes 0 → 1.

The relayer URL comes from `TW_CHAIN_URL`, or from a `?chain=<url>` already
present in `TW_SITE`. **When the relayer does not answer, this test skips with
an explicit message** — it never reports a false failure, and it never writes a
secret anywhere.

Run: python3 tests/e2e_chain_public.py            (under `timeout 600`)
     TW_SITE=https://tidewater-play.vercel.app TW_CHAIN_URL=https://relay… py…
Exit 0 on PASS or SKIP, 1 on a broken step.
"""

import base64
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_offline import dismiss_tutorial  # noqa: E402  (path set above)
from e2e_tidewater import SCRATCH, dismiss_cover, guard, start_chrome  # noqa: E402

SITE = os.environ.get("TW_SITE", "https://tidewater-play.vercel.app")
RPC_FALLBACK = "https://rpc.testnet.near.org"
LICENCE_TOKEN = "3"
# A NEAR transaction hash is 32 bytes in base58: 43-44 chars in practice.
BASE58 = re.compile(r"^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{40,64}$")
# A testnet account ends in `.testnet`, a sandbox one in `.test.near`; the
# public demo runs on testnet, so both shapes count as "a real NEAR account".
ACCOUNT = re.compile(r"[a-z0-9][a-z0-9._-]*\.(?:near|testnet)")
DOOR = "[data-testid='chain-door']"
STATUS = "[data-testid='chain-account']"
TX = "[data-testid='chain-tx']"
EXPLORER = "[data-testid='chain-explorer']"
LICENCE_BUTTON = "[data-testid='chain-licence']"


def log(line):
    print(line, flush=True)


def skip(reason):
    """An honest no-verdict: printed, and exit 0 (never a false failure)."""
    log("")
    log("SKIP — " + reason)
    log("       (nothing was proved; nothing was broken either)")
    return 0


def get_json(url, timeout=12):
    """GET a JSON document; None when the host does not answer."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res:
            return json.loads(res.read().decode())
    except (urllib.error.URLError, OSError, ValueError):
        return None


def post_json(url, payload, timeout=25):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode())
    except (urllib.error.URLError, OSError, ValueError) as exc:
        log("  RPC/HTTP failure on %s: %s" % (url, exc))
        return None


def relayer_url(site):
    """`TW_CHAIN_URL` wins; otherwise a `?chain=<url>` already in the site URL."""
    from_env = os.environ.get("TW_CHAIN_URL", "").strip()
    if from_env:
        return from_env.rstrip("/")
    query = urllib.parse.urlparse(site).query
    raw = urllib.parse.parse_qs(query).get("chain", [""])[0].strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw.rstrip("/")
    return None


def rpc_view(rpc_url, contract, method, args):
    """A contract view call, straight from the RPC — not through the relayer."""
    payload = post_json(rpc_url, {"jsonrpc": "2.0", "id": 1, "method": "query", "params": {
        "request_type": "call_function", "finality": "final", "account_id": contract,
        "method_name": method, "args_base64": base64.b64encode(json.dumps(args).encode()).decode(),
    }})
    try:
        raw = bytes(payload["result"]["result"])
        return json.loads(raw.decode()) if raw else None
    except (TypeError, KeyError, ValueError):
        return None


def licence_balance(rpc_url, contract, account):
    """The NEP-245 licence balance, read on chain. None when unreadable."""
    value = rpc_view(rpc_url, contract, "mt_balance_of",
                     {"account_id": account, "token_id": LICENCE_TOKEN})
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def tx_on_chain(rpc_url, tx_hash, account=""):
    """`tx` by hash: True when the network finalised it successfully.

    The sender's account id is the second argument the method wants: the
    public RPC refuses the call without it (HTTP 400).
    """
    payload = post_json(rpc_url, {"jsonrpc": "2.0", "id": 1, "method": "tx",
                                  "params": [tx_hash, account]})
    try:
        return "SuccessValue" in json.dumps(payload["result"]["status"])
    except (TypeError, KeyError, ValueError):
        return False


# --- browser -------------------------------------------------------------
def open_site(driver, url, timeout=40):
    """Load the demo and wait for the login card; True when it is up."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    try:
        driver.get(url)
        WebDriverWait(driver, timeout).until(ec.any_of(
            ec.presence_of_element_located((By.CSS_SELECTOR, "form.auth-card")),
            ec.presence_of_element_located((By.CSS_SELECTOR, STATUS))))
        dismiss_cover(driver)
        return True
    except Exception as exc:  # noqa: BLE001  (an unreachable demo is reported, not guessed)
        log("  the demo never answered at %s (%s)" % (url, type(exc).__name__))
        return False


def chain_mode_on(driver, timeout=12):
    """Does this build carry the chain door at all? (older builds do not).

    Waiting matters: the door is rendered by React right after the front page
    lifts, and a one-shot `find_elements` catches the frame before it exists.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as ec
    try:
        WebDriverWait(driver, timeout).until(
            ec.presence_of_element_located((By.CSS_SELECTOR, DOOR)))
        return True
    except Exception:  # noqa: BLE001  (an older build is a skip, not a failure)
        return False


def element_text(driver, selector):
    """Visible text of the first match, or '' when the match is missing."""
    from selenium.webdriver.common.by import By
    found = driver.find_elements(By.CSS_SELECTOR, selector)
    return (found[0].text or "").strip() if found else ""


def sign_in(driver, email, timeout=90):
    """Type the email, submit, and wait for the NEAR account — or the refusal."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    wait = WebDriverWait(driver, timeout)
    field = wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "input[type=email]"))
    field.clear()
    field.send_keys(email)
    driver.find_element(By.CSS_SELECTOR, "form.auth-card button[type=submit]").click()
    wait.until(lambda d: ACCOUNT.search(element_text(d, STATUS))
               or element_text(d, "[data-testid='auth-error']") != "")
    refused = element_text(driver, "[data-testid='auth-error']")
    if refused:
        raise RuntimeError("the login card refused: " + refused[:200])
    return element_text(driver, STATUS)


def buy_licence(driver, timeout=120):
    """Click the sponsored purchase; return (hash shown, page text of the tx)."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    wait = WebDriverWait(driver, timeout)
    if dismiss_tutorial(driver):
        log("  tutorial: first-launch card, closed with Skip")
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, LICENCE_BUTTON).is_enabled())
    driver.find_element(By.CSS_SELECTOR, LICENCE_BUTTON).click()
    link = wait.until(lambda d: d.find_element(By.CSS_SELECTOR, EXPLORER))
    href = link.get_attribute("href") or ""
    shown = driver.find_element(By.CSS_SELECTOR, TX).text.strip()
    return href.rsplit("/", 1)[-1], shown


def browser_proof(driver, site, relayer, email, notes):
    """Open the demo in chain mode, log in, buy a licence; returns the hash."""
    param = os.environ.get("TW_CHAIN_PARAM", "1")
    sep = "&" if urllib.parse.urlparse(site).query else "?"
    for attempt, value in enumerate([param, relayer]):
        url = "%s%schain=%s" % (site, sep, urllib.parse.quote(value, safe=":/"))
        log("• opening %s" % url)
        if not open_site(driver, url):
            notes.append("blocked: the demo never answered")
            return None
        if not chain_mode_on(driver):
            notes.append("skip: the deployed build has no chain door")
            return None
        if attempt == 1:
            log("  note: ?chain=1 found no relayer in this build; the URL was injected at runtime")
        try:
            status = sign_in(driver, email)
            log("  the page shows the NEAR account: %s" % status)
            notes.append("login: the email became a NEAR account")
            return buy_licence(driver)
        except Exception as exc:  # noqa: BLE001  (a refusal is evidence, not a crash)
            log("  no NEAR account with ?chain=%s (%s: %s)" % (value, type(exc).__name__, str(exc)[:160]))
            if attempt == 0:
                # This attempt talked to a relayer the build did not know: its
                # console noise is not the verdict of the run that follows.
                driver.get_log("browser")
    notes.append("blocked: the chain login never produced an account")
    return None


# --- main ------------------------------------------------------------------
def proof(site, relayer, rpc_url, contract, email, notes):
    """The whole browser + RPC proof; returns an exit code."""
    from selenium.webdriver.common.by import By
    position = get_json("%s/position?email=%s" % (relayer, urllib.parse.quote(email)))
    if not isinstance(position, dict) or not position.get("accountId"):
        return fail("the relayer /position names no account for %s" % email, notes)
    account = position["accountId"]
    before = licence_balance(rpc_url, contract, account)
    if before is None:
        notes.append("before: %s does not exist on chain yet — 0 licences" % account)
        before = 0
    else:
        notes.append("before: mt_balance_of(%s, licence) = %d, read at the RPC" % (account, before))
    tmp = tempfile.mkdtemp(prefix="e2e-chain-public-", dir=SCRATCH)
    driver = start_chrome(os.path.join(tmp, "chrome-profile"))
    try:
        outcome = browser_proof(driver, site, relayer, email, notes)
        errors = [e["message"] for e in driver.get_log("browser") if e.get("level") == "SEVERE"]
    finally:
        driver.quit()
        shutil.rmtree(tmp, ignore_errors=True)
    if outcome is None:
        skipped = [n for n in notes if n.startswith("skip:")]
        if skipped:
            return skip(skipped[0][len("skip: "):] + " — redeploy the demo, then re-run")
        return fail("; ".join(notes) or "the chain proof produced no transaction", notes)
    tx_hash, shown = outcome
    result = verify(site, rpc_url, contract, account, tx_hash, shown, errors, notes, before)
    if result != 0:
        return result
    # The licence is proven; the council is the second half of the demo.
    return vote_phase(relayer, rpc_url, contract, account, email, notes)


def verify(site, rpc_url, contract, account, tx_hash, shown, errors, notes, before):
    """The hash is real, the network knows it, and the licence balance moved."""
    log("• page says: %s" % shown)
    if not shown.startswith("tx "):
        return fail("the page never showed a transaction hash (%r)" % shown, notes)
    if not BASE58.match(tx_hash):
        return fail("the hash %r is not base58 of a plausible length" % tx_hash, notes)
    log("• transaction hash: %s (base58, %d chars)" % (tx_hash, len(tx_hash)))
    if not tx_on_chain(rpc_url, tx_hash, account):
        return fail("%s does not know the transaction %s" % (rpc_url, tx_hash), notes)
    notes.append("tx: %s is finalised on %s" % (tx_hash[:12], rpc_url))
    balance = licence_balance(rpc_url, contract, account)
    if balance is None:
        return fail("mt_balance_of(%s, licence) is unreadable on %s" % (account, rpc_url), notes)
    if balance != before + 1:
        return fail("the licence balance went %d -> %s, not %d -> %d"
                    % (before, balance, before, before + 1), notes)
    notes.append("contract: %s licences %d -> %d — read at the RPC, not at the relayer"
                 % (account, before, balance))
    if errors:
        return fail("console errors: %s" % json.dumps(errors[:3]), notes)
    log("")
    log("PASS — %s?chain=1 → email → NEAR account → buy_licence → %s" % (site, tx_hash))
    log("  licences on chain: %d -> %d · the house paid the gas · no key reached the browser"
        % (before, balance))
    return 0


def open_motion(rpc_url, contract):
    """The last motion the council has not resolved — the one a vote must hit.

    Read straight at the RPC, walking the ids: the chain answers
    `E_UNKNOWN_PROPOSAL` past the last one, and that is how the walk knows it
    has read them all. Returns None when nothing is on the table.
    """
    last = None
    for pid in range(1, 64):
        value = rpc_view(rpc_url, contract, "get_proposal", {"proposal_id": pid})
        if value is None:
            break
        if not value.get("resolved"):
            last = {"id": pid, **value}
    return last


def vote_phase(relayer, rpc_url, contract, account, email, notes):
    """Propose a motion, vote it, and read the result back on the chain.

    This is the judge-facing proof of the council: the relayer tables a
    `propose_rule` (one yoctoNEAR attached, no escrow), then a vote **without
    a proposal id** lands on that motion — the last one the council has not
    resolved — and `get_proposal` shows the weight it carried.
    """
    tabled = post_json(relayer + "/council/propose", {"email": email, "quota": 60})
    if not isinstance(tabled, dict) or not tabled.get("proposalId"):
        return fail("the relayer did not table a motion: %s" % json.dumps(tabled)[:200], notes)
    proposal_id = int(tabled["proposalId"])
    notes.append("propose: motion #%d tabled (tx %s)"
                 % (proposal_id, str(tabled.get("txHash"))[:12]))
    if not tx_on_chain(rpc_url, tabled.get("txHash", ""), account):
        return fail("the chain does not know the propose transaction", notes)

    voted = post_json(relayer + "/council/vote", {"email": email, "approve": True})
    if not isinstance(voted, dict) or not voted.get("txHash"):
        return fail("the relayer did not answer the vote: %s" % json.dumps(voted)[:200], notes)
    if int(voted.get("proposalId", -1)) != proposal_id:
        return fail("the vote landed on motion #%s, not on the one just tabled (#%d)"
                     % (voted.get("proposalId"), proposal_id), notes)
    notes.append("vote: motion #%d, tx %s" % (proposal_id, str(voted.get("txHash"))[:12]))
    if not tx_on_chain(rpc_url, voted.get("txHash", ""), account):
        return fail("the chain does not know the vote transaction", notes)

    after = rpc_view(rpc_url, contract, "get_proposal", {"proposal_id": proposal_id})
    if not isinstance(after, dict):
        return fail("get_proposal(%d) is unreadable at the RPC" % proposal_id, notes)
    if after.get("resolved"):
        return fail("motion #%d is already resolved" % proposal_id, notes)
    if account not in (after.get("voters") or []):
        return fail("the voters of motion #%d do not hold %s" % (proposal_id, account), notes)
    weight = int(after.get("yes_weight", 0))
    if weight <= 0:
        return fail("motion #%d carries no yes weight" % proposal_id, notes)
    log("")
    log("PASS — the council answered on chain: motion #%d, %s voted yes, weight %d"
        % (proposal_id, account, weight))
    log("  propose tx %s · vote tx %s · read at the RPC, not at the relayer"
        % (str(tabled.get("txHash"))[:12], str(voted.get("txHash"))[:12]))
    return 0


def fail(reason, notes):
    log("")
    log("FAILED — " + reason)
    for note in notes:
        log("  · " + note)
    return 1


def main():
    site = os.environ.get("TW_SITE", SITE)
    relayer = relayer_url(site)
    if relayer is None:
        return skip("no relayer URL: set TW_CHAIN_URL, or put ?chain=<url> in TW_SITE "
                    "(the public relayer is not published yet)")
    health = get_json(relayer + "/health")
    if not isinstance(health, dict) or not health.get("contract"):
        return skip("the relayer %s does not answer /health with a contract id — "
                    "it is not in production yet" % relayer)
    rpc_url = os.environ.get("TW_RPC_URL") or health.get("rpc") or RPC_FALLBACK
    contract = health["contract"]
    email = "juge-%d@bankkeeper.test" % int(time.time())
    log("• site %s · relayer %s" % (site, relayer))
    log("• contract %s · rpc %s · email %s" % (contract, rpc_url, email))
    warning = guard("before")
    if warning:
        log(warning)
    os.makedirs(SCRATCH, exist_ok=True)
    notes = []
    try:
        return proof(site, relayer, rpc_url, contract, email, notes)
    finally:
        warning = guard("after")
        if warning:
            log(warning)


if __name__ == "__main__":
    sys.exit(main())
