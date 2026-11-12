"""Reference journey in headless Chrome: auth, assign, sale, licence, ff7, graph.

Serves the built web UI through server/relay.py on a disposable port with a
disposable state file and a stub sim (canned harbour). Drives a separate
Chrome profile under /tmp and asserts ZERO console errors and ZERO failed
requests over the whole journey.

Run: python3 tests/e2e_tidewater.py (from the repo root, after npm run build).
Set CHROME_BIN to the browser binary when it is not installed as google-chrome.
Exit 1 with evidence on any console error, failed request, or blocked step.
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
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(ROOT, "server")
SCRATCH = "/tmp/tidewater-game"

STATE = {
    "week": 1, "day": "Mon", "tide": "High", "seed": "tidewater",
    "playerGold": 150, "netWorth": 150, "quotaLeft": 280, "licences": 4,
    "zones": [
        {"id": "shallows", "catchPerTrip": 10, "trend": "steady",
         "tripCost": 2, "schools": 3, "boats": 0, "survey": None},
        {"id": "greybank", "catchPerTrip": 16, "trend": "falling",
         "tripCost": 4, "schools": 4, "boats": 2, "survey": None},
        {"id": "deeps", "catchPerTrip": 8, "trend": "steady",
         "tripCost": 7, "schools": 2, "boats": 0, "survey": None},
    ],
    "boats": [
        {"id": "0", "name": "Skua", "captain": "You", "mine": True,
         "zone": "greybank", "mesh": "large", "trip": None,
         "lastCatch": "16 crates", "disarmed": False},
        {"id": "1", "name": "Tern", "captain": "You", "mine": True,
         "zone": None, "mesh": "large", "trip": None,
         "lastCatch": "—", "disarmed": False},
    ],
    "captains": [
        {"id": "you", "name": "You", "color": "#e0672f", "gold": 150,
         "licences": 4, "active": True},
    ],
    "buyers": [
        {"id": "cannery", "name": "Cannery", "open": True, "limit": 3.6,
         "stock": 180, "target": 150, "buys": "herring"},
    ],
    "landings": [
        # Landing net "small" while both boats fish "large": the ledger
        # must read landing.mesh, not the boat's current net.
        {"captain": "You", "crates": 14, "species": "herring",
         "price": 3.6, "total": 50.4, "buyer": "Cannery", "start": 8.0,
         "mesh": "small"},
    ],
    "reasoning": ["Sold to Cannery: 14 x 3.6 = 50.4."],
    "seasonOver": False,
}

STUB = """#!/usr/bin/env python3
import json, sys
argv = sys.argv[1:]
cmd = argv[0] if argv else ""
state = json.loads(STATE_JSON)
def flag(name):
    return argv[argv.index(name) + 1] if name in argv else None
if cmd == "state":
    print(json.dumps(state))
elif cmd in ("graph", "judges"):
    body = {"ok": True, "view": cmd, "points": []}
    if cmd == "judges":
        body.update({"seed": 7, "day": 0, "week": 1, "actors": [],
                     "gold_total": 0, "ext_in": 0, "ext_out": 0,
                     "licence_pool": 1, "proposal": None, "loans": []})
    if cmd == "graph":
        body.update({"history": [], "stocks": [3000, 5000, 2000],
                     "capacity": [3000, 5000, 2000]})
    print(json.dumps(body))
elif cmd == "day":
    print(json.dumps({"ok": True, "cmd": cmd, "day": 0, "landings": [],
                      "lines": [], "week_rolled": False,
                      "council": {"season": 1, "tabled": False,
                                  "tally": {"for_votes": 0,
                                            "against_votes": 0,
                                            "passed": False},
                                  "lines": ["Council of season 1: no motion tabled; the standing rules continue."]},
                      "season_over": False, "bilan": None}))
elif cmd in ("assign", "survey", "licence", "debt", "council"):
    print(json.dumps({"ok": True, "cmd": cmd}))
elif cmd == "fastforward":
    json.dump([{"day": 1, "kind": "council", "detail": "vote"}],
              open(flag("--journal"), "w"))
    json.dump({"stocks": [[3000, 4573, 2000]]}, open(flag("--series"), "w"))
    json.dump([], open(flag("--markers"), "w"))
    print(json.dumps({"days_run": int(flag("--days")),
                      "seed": int(flag("--seed")),
                      "history_hash": "1495708091849727723", "events": 1}))
else:
    print(json.dumps({"error": "E_SIM_FAILED"}))
    sys.exit(1)
""".replace("STATE_JSON", repr(json.dumps(STATE)))


def free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    assert port not in (8775, 8765), "refusing a live port"
    return port


def guard(label):
    """chrome-profile-guard before/after; returns a note when it fails."""
    try:
        proc = subprocess.run(["chrome-profile-guard"], capture_output=True,
                              text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"guard {label}: cannot run ({exc})"
    if proc.returncode != 0:
        return f"guard {label}: FAIL {proc.stdout.strip()} {proc.stderr.strip()}"
    return ""


def start_relay(tmp):
    """Relay on a disposable port; returns (proc, base url)."""
    stub = os.path.join(tmp, "stub-sim.py")
    with open(stub, "w", encoding="utf-8") as fh:
        fh.write(STUB)
    os.chmod(stub, 0o755)
    with open(os.path.join(tmp, "state.json"), "w") as fh:
        fh.write("{}")
    env = dict(os.environ)
    env["PORT"] = str(free_port())
    env["SIM_BIN"] = stub
    env["SIM_STATE"] = os.path.join(tmp, "state.json")
    env["SIM_SESSIONS"] = os.path.join(tmp, "sessions.json")
    env["WEB_DIST"] = os.path.join(ROOT, "web", "dist")
    proc = subprocess.Popen([sys.executable, "relay.py"], cwd=SERVER, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = "http://127.0.0.1:{}".format(env["PORT"])
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/api/health", timeout=2)
            return proc, base
        except OSError:
            time.sleep(0.05)
    stop_relay(proc)
    raise RuntimeError("relay never came up")


def stop_relay(proc):
    """Stop the relay we started, by its exact PID only."""
    proc.send_signal(signal.SIGTERM)
    proc.wait(timeout=10)


def start_chrome(profile):
    from selenium import webdriver
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--user-data-dir=" + profile)
    options.add_argument("--window-size=1280,800")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    # The browser's own background pings (search-engine startup, safe
    # browsing) are not app traffic: without this, a CI network that blocks
    # them counts as a failed request.
    options.add_argument("--disable-background-networking")
    options.set_capability("goog:loggingPrefs",
                           {"browser": "ALL", "performance": "ALL"})
    binary = os.environ.get("CHROME_BIN")
    if binary:
        options.binary_location = binary
    return webdriver.Chrome(options=options)


def journey(driver, base, notes):
    """The reference journey; each blocked step appends a note."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    wait = WebDriverWait(driver, 15)
    driver.get(base + "/")
    if dismiss_cover(driver):
        notes.append("cover: front page lifted with Play")
    wait.until(ec.presence_of_element_located((By.CSS_SELECTOR, "form.auth-card")))
    # La carte de connexion ne demande plus que l'email : le nom du capitaine
    # vient du préfixe de l'adresse (« skip » -> « Skip »).
    driver.find_element(By.CSS_SELECTOR, "input[type=email]").send_keys("skip@tide.water")
    driver.find_element(By.XPATH, "//form//button[@type='submit']").click()
    try:
        wait.until(ec.presence_of_element_located(
            (By.CSS_SELECTOR, "section[aria-label='Sea chart']")))
    except Exception:
        notes.append("blocked: game screen never shows the sea chart after auth")
        return
    try:
        heads = driver.find_elements(By.CSS_SELECTOR, ".boat-head")
        assert heads, "no .boat-head buttons"
        heads[0].click()
        wait.until(ec.element_to_be_clickable((By.XPATH, "//button[text()='Greybank']"))).click()
        notes.append("assign: boat sent to Greybank")
    except Exception as exc:
        notes.append(f"blocked: assign a boat ({exc})")
    try:
        wait.until(ec.element_to_be_clickable((By.XPATH, "//button[text()='End the day']"))).click()
        time.sleep(4)
        body = driver.find_element(By.TAG_NAME, "body").text
        notes.append("day: ends" if "ends:" in body else "blocked: no day toast after 4s")
    except Exception as exc:
        notes.append(f"blocked: end the day ({exc})")
    try:
        driver.find_element(By.XPATH, "//button[text()='Judges']").click()
        wait.until(ec.element_to_be_clickable((By.XPATH, "//button[text()='Buy licence']"))).click()
        notes.append("licence: bought one")
    except Exception as exc:
        notes.append(f"blocked: buy licence ({exc})")
    try:
        driver.find_element(By.XPATH, "//button[text()='Fast-forward 7 days']").click()
        time.sleep(5)
        body = driver.find_element(By.TAG_NAME, "body").text
        notes.append("ff7: hash shown" if "Deterministic replay signature" in body else "blocked: no ff hash after 5s")
        height = driver.execute_script(
            "return document.querySelector(\"section[aria-label='Judges']\")"
            ".getBoundingClientRect().height;")
        assert height > 400, "judges sheet collapsed (inner div steals .judges)"
        notes.append("judges: sheet %dpx" % height)
    except Exception as exc:
        notes.append(f"blocked: fast-forward 7 days ({exc})")
    try:
        graph = driver.execute_script(
            "return fetch('/api/graph').then(r => r.json()).catch(e => ({error: String(e)}))")
        notes.append(f"graph: {json.dumps(graph)[:120]}")
    except Exception as exc:
        notes.append(f"blocked: graph read ({exc})")
    time.sleep(3)


def console_errors(driver):
    """SEVERE browser log entries (JS console errors)."""
    return [e["message"] for e in driver.get_log("browser")
            if e.get("level") == "SEVERE"]


def dismiss_cover(driver, timeout=8):
    """The front page covers every load; a player presses `Play`. Do the same.

    The veil is a real overlay: clicks that land under it are swallowed, so it
    goes first, before the auth card or any instrument. A build with no front
    page returns False and changes nothing.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    veil = (By.CSS_SELECTOR, ".cover")
    try:
        WebDriverWait(driver, timeout).until(ec.presence_of_element_located(veil))
    except Exception:  # noqa: BLE001  (no front page on this build)
        return False
    driver.find_element(By.CSS_SELECTOR, "[data-testid='cover-play']").click()
    WebDriverWait(driver, timeout).until(ec.invisibility_of_element_located(veil))
    return True


def dismiss_tutorial(driver):
    """The tutorial never opens on its own any more; keep the helper as a
    safety net.

    The backdrop would cover the whole screen, so every click under it would
    be intercepted — the on-chain strip included. A build that opens nothing
    returns False and changes nothing.
    """
    from selenium.webdriver.common.by import By
    for dialog in driver.find_elements(By.CSS_SELECTOR, "[role='dialog']"):
        for button in dialog.find_elements(By.XPATH, ".//button[text()='Skip']"):
            if button.is_displayed():
                button.click()
                time.sleep(0.4)
                return True
    return False


def failed_requests(driver):
    """Deduped (status, url) for HTTP 4xx/5xx and failed loads.

    Only the requests the page made are judged: Chromium opens a background
    new-tab page (DuckDuckGo on Debian) whose own calls reach this log as
    responses without ever being sent by the page, and they are not app
    traffic.
    """
    bad = set()
    urls = {}
    for entry in driver.get_log("performance"):
        try:
            msg = json.loads(entry["message"])["message"]
        except (ValueError, KeyError):
            continue
        params = msg.get("params", {})
        if msg.get("method") == "Network.requestWillBeSent":
            urls[params.get("requestId")] = params.get("request", {}).get("url", "")
        elif msg.get("method") == "Network.responseReceived":
            resp = params.get("response", {})
            url, status = resp.get("url", ""), resp.get("status", 0)
            sent = params.get("requestId") in urls
            if status >= 400 and url.startswith("http") and sent:
                bad.add((status, url.split("?")[0]))
        elif msg.get("method") == "Network.loadingFailed":
            url = urls.get(params.get("requestId"), "")
            if url.startswith("http"):
                bad.add(("failed", url.split("?")[0]))
    return sorted(bad, key=str)


def main():
    dist = os.path.join(ROOT, "web", "dist", "index.html")
    if not os.path.isfile(dist):
        print("web/dist missing: run npm run build in web/ first")
        return 2
    notes = []
    first = guard("before")
    if first:
        print(first)
    os.makedirs(SCRATCH, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="e2e-", dir=SCRATCH)
    profile = os.path.join(tmp, "chrome-profile")
    proc, base = start_relay(tmp)
    try:
        driver = start_chrome(profile)
        try:
            journey(driver, base, notes)
            errors = console_errors(driver)
            failed = failed_requests(driver)
        finally:
            driver.quit()
    finally:
        stop_relay(proc)
    last = guard("after")
    if last:
        print(last)
    shutil.rmtree(tmp, ignore_errors=True)
    print("--- journey ---")
    for note in notes:
        print(f"  {note}")
    print(f"--- console errors: {len(errors)} ---")
    for err in errors[:10]:
        print(f"  {err[:300]}")
    print(f"--- failed requests: {len(failed)} ---")
    for status, url in failed[:10]:
        print(f"  {status} {url}")
    blocked = [n for n in notes if n.startswith("blocked:")]
    if errors or failed or blocked:
        return 1
    print("OK: reference journey clean, zero console errors, zero failed requests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
