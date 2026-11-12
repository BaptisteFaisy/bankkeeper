"""Reference journey against the **offline** build: the engine in the browser.

Same steps as `e2e_tidewater.py`, but the UI is served as plain static files
(no relay) and every game call goes into `engine.wasm`. What the test proves:

- the reference journey works with no server behind it;
- **no** request ever reaches `/api/` — if one did, the app would be talking to
  a relay that is not there;
- zero SEVERE console entries, zero failed requests.

Run: python3 tests/e2e_offline.py (after `cd web && npm run build:offline`).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_tidewater import (  # noqa: E402  (path set above)
    ROOT, SCRATCH, console_errors, dismiss_cover, dismiss_tutorial,
    failed_requests, free_port, guard, start_chrome,
)


def serve_dist():
    """Static server on a disposable port; returns (proc, base url)."""
    port = free_port()
    dist = os.path.join(ROOT, "web", "dist")
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=dist, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = "http://127.0.0.1:{}".format(port)
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/", timeout=2)
            return proc, base
        except OSError:
            time.sleep(0.05)
    proc.terminate()
    raise RuntimeError("static server never came up")


def dismiss_tutorial(driver, timeout=6):
    """The tutorial never opens on its own any more; keep the helper as a
    safety net.

    The backdrop would cover the whole screen, so a card left up intercepts
    every later click. A build that opens nothing returns False and changes
    nothing.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    backdrop = (By.CSS_SELECTOR, ".tutorial-backdrop")
    try:
        seen = driver.execute_script("return localStorage.getItem('tidewater-tutorial-v1')")
    except Exception:  # noqa: BLE001  (storage blocked: play the card as it comes)
        seen = None
    if seen is not None:
        return False
    try:
        WebDriverWait(driver, timeout).until(ec.presence_of_element_located(backdrop))
    except Exception:  # noqa: BLE001  (no card came: nothing to skip)
        return False
    for button in driver.find_elements(By.XPATH, "//div[@role='dialog']//button[text()='Skip']"):
        button.click()
        break
    WebDriverWait(driver, timeout).until(ec.invisibility_of_element_located(backdrop))
    return True
def journey(driver, base, notes):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    wait = WebDriverWait(driver, 20)
    driver.get(base + "/")
    if dismiss_cover(driver):
        notes.append("cover: front page lifted with Play")
    wait.until(ec.presence_of_element_located((By.CSS_SELECTOR, "form.auth-card")))
    notes.append("engine: page booted with no relay behind it")
    # Plus de champ « Captain name » : le capitaine prend le préfixe de l'email.
    driver.find_element(By.CSS_SELECTOR, "input[type=email]").send_keys("skip@tide.water")
    driver.find_element(By.XPATH, "//form//button[@type='submit']").click()
    try:
        wait.until(ec.presence_of_element_located(
            (By.CSS_SELECTOR, "section[aria-label='Sea chart']")))
        notes.append("auth: game screen shows the sea chart")
        if dismiss_tutorial(driver):
            notes.append("tutorial: first-launch card, closed with Skip")
    except Exception:
        notes.append("blocked: no sea chart after auth")
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
        time.sleep(3)
        body = driver.find_element(By.TAG_NAME, "body").text
        notes.append("day: ends" if "ends:" in body else "blocked: no day toast after 3s")
    except Exception as exc:
        notes.append(f"blocked: end the day ({exc})")
    try:
        driver.find_element(By.XPATH, "//button[text()='Judges']").click()
        wait.until(ec.element_to_be_clickable((By.XPATH, "//button[text()='Fast-forward 7 days']"))).click()
        time.sleep(4)
        body = driver.find_element(By.TAG_NAME, "body").text
        notes.append("ff7: hash shown" if "Deterministic replay signature" in body
                     else "blocked: no ff hash after 4s")
    except Exception as exc:
        notes.append(f"blocked: fast-forward 7 days ({exc})")
    pay_debt(driver, wait, notes)


def close_season(driver, notes):
    """Play the days of the season, then sail the next one: the bill is
    written down at the close of a season, so the debt exists from there."""
    from selenium.webdriver.common.by import By
    for _ in range(30):
        try:
            button = driver.find_element(By.XPATH, "//button[text()='End the day']")
        except Exception:
            break
        if not button.is_displayed() or not button.is_enabled():
            break
        button.click()
        time.sleep(0.6)
        if driver.find_elements(By.XPATH, "//button[text()='Sail the next season']"):
            break
    sails = driver.find_elements(By.XPATH, "//button[text()='Sail the next season']")
    if not sails:
        notes.append("blocked: the season never closed")
        return False
    sails[0].click()
    time.sleep(1.5)
    return True


def pay_debt(driver, wait, notes):
    """The debt owed to the sea is paid from the browser: a zone rests and the
    regrowth pays the bill down."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    if not close_season(driver, notes):
        return
    try:
        wait.until(ec.presence_of_element_located(
            (By.CSS_SELECTOR, "[data-testid='fallow-preview']")))
    except Exception as exc:
        notes.append(f"blocked: no fallow preview ({exc})")
        return
    before = debt_of(driver)
    if before <= 0:
        notes.append("blocked: no debt to pay after a season")
        return
    driver.find_element(By.XPATH, "//button[text()='Rest the zone']").click()
    time.sleep(2.5)
    after = debt_of(driver)
    if after < before:
        notes.append(f"pay: the debt fell from {before} to {after} crates")
    else:
        notes.append(f"blocked: the debt did not fall ({before} -> {after})")


def debt_of(driver):
    """The debt the ledger shows, in crates, read from the panel's text."""
    from selenium.webdriver.common.by import By
    for node in driver.find_elements(By.CSS_SELECTOR, "section[aria-label='Harbour ledger'] p"):
        text = node.text.replace(",", "")
        if "crates carried" in text:
            return int(text.split("crates carried")[0].strip().split()[-1])
    return 0


def api_traffic(driver):
    """Any HTTP call to /api/ or to the sponsored relayer means the offline
    build still wants a server. The default mode must stay 100 % in the
    browser: chain mode is opt-in (`?chain`), never a background call."""
    hits = set()
    for entry in driver.get_log("performance"):
        try:
            msg = json.loads(entry["message"])["message"]
        except (ValueError, KeyError):
            continue
        if msg.get("method") != "Network.requestWillBeSent":
            continue
        url = msg.get("params", {}).get("request", {}).get("url", "")
        path = urllib.parse.urlparse(url).path
        if "/api/" in url or path.startswith("/chain") or "relayer" in url:
            hits.add(url.split("?")[0])
    return sorted(hits)


def main():
    dist = os.path.join(ROOT, "web", "dist", "engine.wasm")
    if not os.path.isfile(dist):
        print("web/dist/engine.wasm missing: run `npm run build:offline` in web/")
        return 2
    notes = []
    warning = guard("before")
    if warning:
        print(warning)
    os.makedirs(SCRATCH, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="e2e-offline-", dir=SCRATCH)
    proc, base = serve_dist()
    try:
        driver = start_chrome(os.path.join(tmp, "chrome-profile"))
        try:
            journey(driver, base, notes)
            errors = console_errors(driver)
            failed = failed_requests(driver)
            api = api_traffic(driver)
        finally:
            driver.quit()
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    warning = guard("after")
    if warning:
        print(warning)
    shutil.rmtree(tmp, ignore_errors=True)
    print("--- journey ---")
    for note in notes:
        print(f"  {note}")
    print("--- console errors: %d ---" % len(errors))
    for err in errors[:10]:
        print(f"  {err[:300]}")
    print("--- failed requests: %d ---" % len(failed))
    for status, url in failed[:10]:
        print(f"  {status} {url}")
    print("--- api / relayer calls: %d ---" % len(api))
    for url in api[:10]:
        print(f"  {url}")
    blocked = [n for n in notes if n.startswith("blocked:")]
    if errors or failed or blocked or api:
        return 1
    print("OK: offline journey clean, zero console errors, zero /api or relayer calls.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
