"""Headless check of the public proofs page (`/proofs.html`).

What it proves: with no contract configured the page loads from plain static
files, says "pas encore déployé" instead of faking a live state, hands out a
replay link that carries `seed=`, and talks to nobody (zero console errors,
zero failed requests, zero `/api` calls).

Run: python3 tests/e2e_proofs.py (after `cd web && npm run build:offline`).
Exit 1 on any console error, failed request or blocked step.
"""

import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_tidewater import (  # noqa: E402  (path set above)
    ROOT, SCRATCH, console_errors, failed_requests, guard, start_chrome,
)
from e2e_offline import api_traffic, serve_dist  # noqa: E402

REPLAY = "[data-testid='replay-link']"
STATUS = "[data-testid='contract-status']"


def text_of(driver, selector):
    """Visible text of the first match, or '' when the match is missing."""
    from selenium.webdriver.common.by import By
    found = driver.find_elements(By.CSS_SELECTOR, selector)
    return found[0].text.strip() if found else ""


def open_page(driver, url, notes):
    """Load a proofs URL and wait for the page root; returns True when rooted."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    try:
        driver.get(url)
        WebDriverWait(driver, 20).until(
            ec.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='proofs']")))
        return True
    except Exception as exc:
        notes.append(f"blocked: page never rooted at {url} ({exc})")
        return False


def check_absent(driver, notes):
    """No contract configured: the page must say so and show no live badge."""
    from selenium.webdriver.common.by import By
    status = text_of(driver, STATUS).lower()
    if "pas encore déployé" in status:
        notes.append("contract: says 'pas encore déployé'")
    else:
        notes.append(f"blocked: contract status reads {status[:120]!r}")
    live = driver.find_elements(By.CSS_SELECTOR, ".pf-badge-live")
    notes.append("contract: no fake live badge" if not live
                 else f"blocked: {len(live)} live badge(s) with no contract")
    table = driver.find_elements(By.CSS_SELECTOR, "[data-testid='supply-table']")
    notes.append("contract: no supply table without a contract" if not table
                 else "blocked: supply table shown with no contract")
    rows = driver.find_elements(By.CSS_SELECTOR, ".pf-row")
    notes.append(f"columns: {len(rows)} on-chain/off-chain rows listed"
                 if rows else "blocked: on-chain vs off-chain columns missing")
    body = driver.find_element(By.TAG_NAME, "body").text
    invariant = "cargo test --workspace" in body and "history_hash" in body
    notes.append("invariants: tests and hash named" if invariant
                 else "blocked: invariants section incomplete")


def check_replay(driver, notes, seed):
    """The replay link must carry the seed (the shared-season promise)."""
    from selenium.webdriver.common.by import By
    found = driver.find_elements(By.CSS_SELECTOR, REPLAY)
    if not found:
        notes.append("blocked: no replay link")
        return ""
    href = found[0].get_attribute("href") or ""
    if "seed=" in href and f"seed={seed}" in href:
        notes.append(f"replay: link carries seed={seed}")
    elif "seed=" in href:
        notes.append(f"blocked: replay link lost the seed ({href})")
    else:
        notes.append(f"blocked: replay link has no seed ({href})")
    return href


def boot_game_from(driver, href, notes):
    """Soft check: the replay link really opens a playable game screen."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.ui import WebDriverWait
    try:
        driver.get(href)
        WebDriverWait(driver, 25).until(
            ec.presence_of_element_located((By.CSS_SELECTOR, "form.auth-card")))
        notes.append("info: replay link boots the game (auth card)")
    except Exception:
        notes.append("info: replay link did not boot the game in 25s")


def journey(driver, base, notes):
    """Both loads: shared season, then bare URL (default seed)."""
    if not open_page(driver, base + "/proofs.html?seed=4242&weeks=3", notes):
        return
    check_absent(driver, notes)
    href = check_replay(driver, notes, "4242")
    if not open_page(driver, base + "/proofs.html", notes):
        return
    check_absent(driver, notes)
    if check_replay(driver, notes, "7") and href:
        boot_game_from(driver, href, notes)


def main():
    for name in ("index.html", "proofs.html"):
        if not os.path.isfile(os.path.join(ROOT, "web", "dist", name)):
            print(f"web/dist/{name} missing: run `npm run build:offline` in web/")
            return 2
    notes = []
    warning = guard("before")
    if warning:
        print(warning)
    os.makedirs(SCRATCH, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="e2e-proofs-", dir=SCRATCH)
    proc, base = serve_dist()
    print(f"--- serving {os.path.join(ROOT, 'web', 'dist')} at {base} ---")
    try:
        driver = start_chrome(os.path.join(tmp, "chrome-profile"))
        try:
            journey(driver, base, notes)
            time.sleep(0.5)
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
    print("OK: proofs page clean, says 'pas encore déployé', replay link seeded, "
          "zero console errors, zero failed requests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
