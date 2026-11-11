"""Headless check of the public proofs page (`/proofs.html`).

What it proves: the page reads the contract id from `docs/deployments.md` — the
one place where it is written — and, when that contract answers, the page says
"live" and shows the values the RPC really returned, one row per token. When
no contract is configured (`?contract=` pointing nowhere useful), the page must
say so instead of faking a live state, hand out a replay link that carries
`seed=`, and talk to nobody (zero console errors, zero failed requests, zero
`/api` calls).

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
SUPPLY_TABLE = "[data-testid='supply-table']"


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


def wait_for_read(driver, notes, timeout=25):
    """
    Waits for the RPC read to settle: the page shows "live" once a token
    answered, "aucune réponse" when none did. Returns "live", "unreachable",
    or "timeout" — the table itself appears immediately, filled with dashes.
    """
    from selenium.webdriver.common.by import By
    deadline = time.time() + timeout
    while time.time() < deadline:
        if driver.find_elements(By.CSS_SELECTOR, ".pf-badge-live"):
            return "live"
        if "aucune réponse" in text_of(driver, STATUS).lower():
            return "unreachable"
        time.sleep(0.5)
    notes.append("blocked: the RPC read never settled")
    return "timeout"


def check_deployed(driver, notes):
    """A configured contract: the page names it and shows what the RPC said."""
    from selenium.webdriver.common.by import By
    status = text_of(driver, STATUS)
    if "bankkeeper.testnet" in status:
        notes.append("contract: names the deployed account")
    else:
        notes.append(f"blocked: contract status reads {status[:120]!r}")
    live = driver.find_elements(By.CSS_SELECTOR, ".pf-badge-live")
    notes.append("contract: live badge on" if live
                 else "blocked: no live badge while the RPC answers")
    rows = driver.find_elements(By.CSS_SELECTOR, SUPPLY_TABLE + " tbody tr")
    notes.append(f"tokens: {len(rows)} rows read from the RPC"
                 if rows else "blocked: no token row read")
    licence = text_of(driver, "[data-testid='supply-3']")
    notes.append(f"licences: supply {licence} (offre fixe 20)"
                 if licence.replace(" ", "").replace(" ", "") == "20"
                 else f"blocked: licence supply reads {licence!r}")
    steps = driver.find_elements(By.CSS_SELECTOR, ".pf-tl-item")
    confirmed = driver.find_elements(By.CSS_SELECTOR, ".pf-tl-tag-confirmed")
    notes.append(f"timeline: {len(confirmed)}/{len(steps)} steps confirmed"
                 if steps and len(confirmed) == len(steps)
                 else f"blocked: {len(confirmed)}/{len(steps)} timeline steps confirmed")


def check_unreachable(driver, notes):
    """
    A contract that does not answer must never look live: the page has to say
    so, badge included, and leave the supplies empty rather than invent them.
    """
    from selenium.webdriver.common.by import By
    status = text_of(driver, STATUS).lower()
    if "aucune réponse" in status or "pas encore déployé" in status:
        notes.append("contract: says it cannot read the chain")
    else:
        notes.append(f"blocked: contract status reads {status[:120]!r}")
    live = driver.find_elements(By.CSS_SELECTOR, ".pf-badge-live")
    notes.append("contract: no fake live badge" if not live
                 else f"blocked: {len(live)} live badge(s) with no answer")
    licence = text_of(driver, "[data-testid='supply-3']")
    notes.append("licences: no invented supply" if licence.strip() in ("—", "")
                 else f"blocked: licence supply invented {licence!r}")


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
    """
    Three loads:
      1. deployed mode: bare URL reads the contract from docs/deployments.md,
         fetches live NEP-245 supplies, and shows the confirmed hashes;
      2. a contract that does not answer must not look live;
      3. shared season: ?seed=4242&weeks=3 carries the season to the replay link.
    """
    if not open_page(driver, base + "/proofs.html", notes):
        return
    wait_for_read(driver, notes)
    check_deployed(driver, notes)
    href = check_replay(driver, notes, "7")
    if not open_page(driver, base + "/proofs.html?contract=absent.testnet", notes):
        return
    wait_for_read(driver, notes)
    check_unreachable(driver, notes)
    if not open_page(driver, base + "/proofs.html?seed=4242&weeks=3", notes):
        return
    check_replay(driver, notes, "4242")
    if href:
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
    print("OK: proofs page clean, reads the deployed contract, replay link seeded, "
          "zero console errors, zero failed requests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
