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
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_tidewater import (  # noqa: E402  (path set above)
    ROOT, SCRATCH, console_errors, failed_requests, free_port, guard,
    start_chrome,
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


def dismiss_tutorial(driver):
    """A first launch opens the tutorial; a player presses `Skip`. Do the same."""
    from selenium.webdriver.common.by import By
    for dialog in driver.find_elements(By.CSS_SELECTOR, "[role='dialog']"):
        for button in dialog.find_elements(By.XPATH, ".//button[text()='Skip']"):
            if button.is_displayed():
                button.click()
                time.sleep(0.4)
                return True
    return False


def journey(driver, base, notes):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    wait = WebDriverWait(driver, 20)
    driver.get(base + "/")
    wait.until(ec.presence_of_element_located((By.CSS_SELECTOR, "form.auth-card")))
    notes.append("engine: page booted with no relay behind it")
    driver.find_element(By.CSS_SELECTOR, "input[type=email]").send_keys("skip@tide.water")
    driver.find_element(By.XPATH, "//form//label[2]/input").send_keys("Skipper")
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


def api_traffic(driver):
    """Any HTTP call to /api/ means the offline build still wants a server."""
    hits = set()
    for entry in driver.get_log("performance"):
        try:
            msg = json.loads(entry["message"])["message"]
        except (ValueError, KeyError):
            continue
        if msg.get("method") != "Network.requestWillBeSent":
            continue
        url = msg.get("params", {}).get("request", {}).get("url", "")
        if "/api/" in url:
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
    print("--- api calls: %d ---" % len(api))
    for url in api[:10]:
        print(f"  {url}")
    blocked = [n for n in notes if n.startswith("blocked:")]
    if errors or failed or blocked or api:
        return 1
    print("OK: offline journey clean, zero console errors, zero /api calls.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
