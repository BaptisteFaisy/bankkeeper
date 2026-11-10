"""Proof that the game really uses the contract: login, buy a licence, read back.

What it does, in order:

1. starts a **local NEAR sandbox** (no network), deploys `tidewater.wasm`,
   creates the accounts and initialises the contract;
2. runs the relayer warm-up (the bank needs a licence to sell, the council
   needs its window: see docs/ONCHAIN.md);
3. starts the **sponsored relayer** — it holds the keys, it pays the gas;
4. serves the `VITE_CHAIN=1` build of the web UI;
5. drives headless Chrome (profile under /tmp): type an email, submit, click
   "Buy a licence", read the transaction hash the page got back;
6. reads `mt_balance_of(player, "3")` **straight from the RPC**, before and
   after, and fails if the NEP-245 balance did not move.

Run: python3 tests/e2e_onchain.py            (builds web/dist-chain if needed)
     TW_SKIP_BUILD=1 python3 tests/e2e_onchain.py
Exit 1 on any broken step, any console error, or a balance that did not move.
"""

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = "/tmp/tidewater-onchain"
DIST = os.path.join(ROOT, "web", "dist-chain")
CHAIN_HOME = os.path.join(SCRATCH, "chain")
EMAIL = "judge@tidewater.dev"
LICENCE = "3"
GOLD = "0"


def free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def log(line):
    print(line, flush=True)


def env_for(port, relayer_port):
    env = dict(os.environ)
    env["TW_CHAIN_HOME"] = CHAIN_HOME
    env["TW_SANDBOX_PORT"] = str(port)
    env["TW_RELAYER_PORT"] = str(relayer_port)
    env["TW_START_NEAR"] = "10"
    return env


def run_node(args, env, timeout=600, check=True):
    proc = subprocess.run(["node"] + args, cwd=ROOT, env=env, timeout=timeout,
                          capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError("node {} failed:\n{}\n{}".format(" ".join(args), proc.stdout[-3000:], proc.stderr[-3000:]))
    return proc


def build_ui():
    if os.environ.get("TW_SKIP_BUILD") == "1":
        return
    log("• building web/dist-chain with VITE_CHAIN=1")
    env = dict(os.environ)
    env["VITE_CHAIN"] = "1"
    # the wasm engine stays the game: chain mode only adds the three actions,
    # so the page never calls /api and the demo keeps working without a relay
    env["VITE_ENGINE"] = "wasm"
    subprocess.run(["npm", "run", "build:wasm"], cwd=os.path.join(ROOT, "web"), env=env, check=True,
                   stdout=subprocess.DEVNULL)
    build = subprocess.run(["npx", "vite", "build", "--outDir", "dist-chain"], cwd=os.path.join(ROOT, "web"),
                           env=env, capture_output=True, text=True)
    if build.returncode != 0:
        raise RuntimeError("vite build failed:\n" + build.stdout[-2000:] + build.stderr[-2000:])


def wait_http(url, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as res:
                return json.loads(res.read().decode())
        except (urllib.error.URLError, OSError, ValueError):
            time.sleep(0.3)
    raise RuntimeError("no answer from " + url)


def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode())


def view(rpc_url, contract, method, args):
    """Read a contract view function straight from the node, not via the relayer."""
    import base64
    payload = rpc(rpc_url, "query", {
        "request_type": "call_function",
        "finality": "final",
        "account_id": contract,
        "method_name": method,
        "args_base64": base64.b64encode(json.dumps(args).encode()).decode(),
    })
    raw = bytes(payload["result"]["result"])
    return json.loads(raw.decode()) if raw else None


def balance(rpc_url, contract, account, token=LICENCE):
    return int(view(rpc_url, contract, "mt_balance_of", {"account_id": account, "token_id": token}))


def serve_dist():
    port = free_port()
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                            cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = "http://127.0.0.1:{}".format(port)
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            urllib.request.urlopen(base + "/index.html", timeout=2)
            return proc, base
        except OSError:
            time.sleep(0.1)
    proc.terminate()
    raise RuntimeError("static server never came up")


def start_chrome(profile):
    from selenium import webdriver
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--user-data-dir=" + profile)
    options.add_argument("--window-size=1280,800")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return webdriver.Chrome(options=options)


def ui_steps(driver, base, relayer_base, account, rpc_url, contract):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait

    wait = WebDriverWait(driver, 45)
    driver.get(base + "/?chain=" + relayer_base)
    email = wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "input[type=email]"))
    email.clear()
    email.send_keys(EMAIL)
    driver.find_element(By.CSS_SELECTOR, "form.auth-card button[type=submit]").click()

    status = wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid=chain-status]"))
    wait.until(lambda d: account in status.text)
    log("  status line: " + status.text)
    assert account in status.text, "the status line does not name the captain's account"

    log("  gold before: {} milli".format(balance(rpc_url, contract, account, GOLD)))
    driver.find_element(By.CSS_SELECTOR, "[data-testid=chain-licence]").click()
    tx = wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid=chain-tx]"))
    wait.until(lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid=chain-tx]").text.startswith("tx "))
    log("  page says: " + tx.text)
    return tx.text


def console_errors(driver):
    return [e["message"] for e in driver.get_log("browser") if e.get("level") == "SEVERE"]


def main():
    os.makedirs(SCRATCH, exist_ok=True)
    wasm = os.path.join(ROOT, "target/near/tidewater/tidewater.wasm")
    if not os.path.isfile(wasm):
        log("missing {}: run `cd contracts/tidewater && cargo near build non-reproducible-wasm`".format(wasm))
        return 2
    build_ui()
    if os.environ.get("TW_KEEP_CHAIN") != "1":
        # a fresh chain each run: the licence balance starts at 0
        shutil.rmtree(CHAIN_HOME, ignore_errors=True)
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        log("web/dist-chain missing: run with VITE_CHAIN=1 npx vite build --outDir dist-chain")
        return 2

    sandbox_port, relayer_port = free_port(), free_port()
    env = env_for(sandbox_port, relayer_port)
    procs = []
    profile = tempfile.mkdtemp(prefix="chrome-", dir="/tmp")
    driver = None
    try:
        log("• sandbox on 127.0.0.1:{} (chain home {})".format(sandbox_port, CHAIN_HOME))
        run_node(["scripts/sandbox/start.mjs"], env)
        state = json.load(open(os.path.join(CHAIN_HOME, "state.json")))
        log("  contract {} · captain {} · rpc {}".format(state["contractId"], state["playerAccount"], state["rpcUrl"]))

        log("• warm-up (headless weeks, contract API only)")
        run_node(["scripts/relayer/src/warmup.mjs"], env)

        log("• relayer on 127.0.0.1:{}".format(relayer_port))
        relayer = subprocess.Popen(["node", "scripts/relayer/src/relayer.mjs"], cwd=ROOT, env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        procs.append(relayer)
        relayer_base = "http://127.0.0.1:{}".format(relayer_port)
        health = wait_http(relayer_base + "/health")
        log("  health: day {}, contract {}".format(health["day"], health["contract"]))

        contract = state["contractId"]
        account = wait_http(relayer_base + "/position?email=" + EMAIL)["accountId"]
        before = balance(state["rpcUrl"], contract, account)
        log("• mt_balance_of({}, licence) before: {}".format(account, before))

        dist_proc, base = serve_dist()
        procs.append(dist_proc)
        driver = start_chrome(profile)
        page_tx = ui_steps(driver, base, relayer_base, account, state["rpcUrl"], contract)

        after = balance(state["rpcUrl"], contract, account)
        gold_after = balance(state["rpcUrl"], contract, account, GOLD)
        log("• mt_balance_of({}, licence) after:  {}".format(account, after))
        log("• gold after: {} milli".format(gold_after))

        errors = console_errors(driver)
        if errors:
            log("console errors: " + json.dumps(errors[:5]))
        if after != before + 1:
            log("FAILED: the NEP-245 licence balance did not move ({} → {})".format(before, after))
            return 1
        if not page_tx.startswith("tx "):
            log("FAILED: the page never showed a transaction hash ({})".format(page_tx))
            return 1
        log("")
        log("PASS — login → buy_licence → mt_balance_of")
        log("  transaction shown by the page: {}".format(page_tx[3:]))
        log("  licences: {} → {} (bank sells at {} milli each)".format(before, after, "the quoted price"))
        log("  relayer paid the gas; no key ever reached the browser")
        return 0 if not errors else 1
    finally:
        if driver is not None:
            driver.quit()
        for proc in reversed(procs):
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
        # the sandbox records its own pid: stop exactly that one
        subprocess.run(["node", "scripts/sandbox/stop.mjs"], cwd=ROOT, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
