"""Tutorial journey in headless Chrome: it never opens by itself.

What the test proves, against the **offline** build (static files, wasm engine):

- a first launch opens no tutorial (the front page already teaches the game);
- `How to play` opens the three cards, over a game screen that already has
  its sea chart (the tutorial blocks the eye, never the page);
- `Next` walks 1 → 2 → 3, and `Done` closes it and writes the
  `tidewater-tutorial-v1` mark;
- a reload shows no tutorial, and `How to play` sits in the top bar;
- `Escape` closes the card, `Enter` advances, and `Tab` stays trapped inside;
- zero SEVERE console entries, zero failed requests, zero `/api/` calls.

Run: python3 tests/e2e_tutorial.py (after `cd web && npm run build:offline`).
Exit 1 on any failed step, with the evidence printed.
"""

import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_tidewater import (  # noqa: E402  (path set above)
    ROOT, SCRATCH, console_errors, dismiss_cover, failed_requests, guard,
    start_chrome,
)
from e2e_offline import api_traffic, serve_dist  # noqa: E402

DIALOG = "[role='dialog'][aria-labelledby='tutorial-title']"
TITLE = "#tutorial-title"
KEY = "tidewater-tutorial-v1"
TITLES = [
    "One sea, shared by all",
    "The auction sells your catch",
    "The vote closes each season",
]


class Report:
    """Accumulates notes and failures so one run prints the whole story."""

    def __init__(self):
        self.notes = []
        self.failures = []

    def check(self, ok, note):
        self.notes.append(("ok: " if ok else "FAILED: ") + note)
        if not ok:
            self.failures.append(note)
        return ok

    def blocked(self, note):
        self.notes.append("blocked: " + note)
        self.failures.append(note)


def wait_for(condition, timeout=15.0, step=0.1):
    """Poll `condition` until it returns a truthy value, else None."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            value = condition()
        except Exception:
            value = None
        if value:
            return value
        time.sleep(step)
    return None


def sign_in(driver, base, report):
    """Load the offline build and take command: the tutorial needs a game."""
    from selenium.webdriver.common.by import By
    driver.get(base + "/")
    dismiss_cover(driver)
    form = wait_for(lambda: driver.find_elements(By.CSS_SELECTOR, "form.auth-card"))
    if not form:
        report.blocked("the engine never booted to the auth card")
        return False
    # Un seul champ : le nom du capitaine vient du préfixe de l'email.
    driver.find_element(By.CSS_SELECTOR, "input[type=email]").send_keys("tutorial@tide.water")
    driver.find_element(By.XPATH, "//form//button[@type='submit']").click()
    chart = wait_for(lambda: driver.find_elements(By.CSS_SELECTOR, "section[aria-label='Sea chart']"))
    if not chart:
        report.blocked("no sea chart after signing in")
        return False
    return True


def dialog_text(driver):
    from selenium.webdriver.common.by import By
    nodes = driver.find_elements(By.CSS_SELECTOR, DIALOG)
    if not nodes:
        return None
    return driver.find_element(By.CSS_SELECTOR, TITLE).text.strip()


def press(driver, key):
    from selenium.webdriver.common.action_chains import ActionChains
    ActionChains(driver).send_keys(key).perform()


def click_button(driver, label):
    from selenium.webdriver.common.by import By
    nodes = driver.find_elements(By.XPATH, "//button[normalize-space(text())='%s']" % label)
    for node in nodes:
        if node.is_displayed():
            node.click()
            return True
    return False


def first_launch(driver, report):
    """No cards on a fresh browser: the front page already teaches the game."""
    time.sleep(0.8)
    report.check(dialog_text(driver) is None,
                 "first launch: no tutorial opens by itself")


def open_play_close(driver, report):
    """`How to play` opens the cards, `Done` closes them and writes the mark."""
    from selenium.webdriver.common.by import By
    report.check(click_button(driver, "How to play"), "How to play opens the tutorial")
    report.check(wait_for(lambda: dialog_text(driver)) is not None,
                 "the cards open")
    report.check(dialog_text(driver) == TITLES[0], "first screen is screen 1: %r" % TITLES[0])
    report.check(bool(driver.find_elements(By.CSS_SELECTOR, "section[aria-label='Sea chart']")),
                 "the sea chart is in the page while the tutorial is open")
    report.check(driver.find_element(By.CSS_SELECTOR, DIALOG).get_attribute("aria-modal") == "true",
                 "the card is a modal dialog (aria-modal)")
    for index in (1, 2):
        report.check(click_button(driver, "Next"), "Next on screen %d" % index)
        shown = wait_for(lambda: dialog_text(driver) == TITLES[index]) is not None
        report.check(shown, "screen %d shows %r" % (index + 1, TITLES[index]))
    report.check(click_button(driver, "Done"), "Done on the last screen")
    report.check(wait_for(lambda: dialog_text(driver) is None) is not None,
                 "Done closes the tutorial")
    mark = driver.execute_script("return window.localStorage.getItem(arguments[0]);", KEY)
    report.check(mark is not None, "the %s mark is written" % KEY)


def after_reload(driver, base, report):
    """The mark holds: a reload never reopens the cards on its own."""
    from selenium.webdriver.common.by import By
    driver.get(base + "/")
    dismiss_cover(driver)
    chart = wait_for(lambda: driver.find_elements(By.CSS_SELECTOR, "section[aria-label='Sea chart']"))
    if not chart:
        report.blocked("no sea chart after reload")
        return
    time.sleep(0.8)
    report.check(dialog_text(driver) is None, "no tutorial after a reload")
    report.check(bool(driver.find_elements(By.CSS_SELECTOR, "button[aria-label='How to play']")),
                 "How to play sits in the top bar")


def reopen(driver, report):
    """How to play brings it back, Escape closes it, Enter and Tab behave."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    report.check(click_button(driver, "How to play"), "How to play reopens the tutorial")
    report.check(wait_for(lambda: dialog_text(driver) == TITLES[0]) is not None,
                 "it reopens on screen 1")
    trapped = True
    for _ in range(6):
        press(driver, Keys.TAB)
        inside = driver.execute_script(
            "return document.querySelector(arguments[0]).contains(document.activeElement);", DIALOG)
        trapped = trapped and bool(inside)
    report.check(trapped, "Tab stays inside the card (focus trap)")
    driver.execute_script("document.querySelector(arguments[0]).focus();", DIALOG)
    press(driver, Keys.ENTER)
    report.check(wait_for(lambda: dialog_text(driver) == TITLES[1]) is not None,
                 "Enter advances to screen 2")
    press(driver, Keys.ESCAPE)
    report.check(wait_for(lambda: dialog_text(driver) is None) is not None,
                 "Escape closes the card")
    return True


def main():
    if not os.path.isfile(os.path.join(ROOT, "web", "dist", "engine.wasm")):
        print("web/dist/engine.wasm missing: run `npm run build:offline` in web/")
        return 2
    report = Report()
    warning = guard("before")
    if warning:
        print(warning)
    os.makedirs(SCRATCH, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="e2e-tutorial-", dir=SCRATCH)
    proc, base = serve_dist()
    try:
        driver = start_chrome(os.path.join(tmp, "chrome-profile"))
        try:
            if sign_in(driver, base, report):
                first_launch(driver, report)
                open_play_close(driver, report)
                after_reload(driver, base, report)
                reopen(driver, report)
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
    print("--- tutorial ---")
    for note in report.notes:
        print("  " + note)
    print("--- console errors: %d ---" % len(errors))
    for err in errors[:10]:
        print("  " + err[:300])
    print("--- failed requests: %d ---" % len(failed))
    for status, url in failed[:10]:
        print("  %s %s" % (status, url))
    print("--- api calls: %d ---" % len(api))
    for url in api[:10]:
        print("  " + url)
    if report.failures or errors or failed or api:
        print("FAILED: %d tutorial step(s), %d console error(s), %d failed request(s), %d api call(s)."
              % (len(report.failures), len(errors), len(failed), len(api)))
        return 1
    print("OK: no tutorial on first launch, How to play opens, Done closes, "
          "zero console errors.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
