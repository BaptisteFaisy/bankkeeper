"""Audit of the web client: the defects a player actually meets.

Not the reference journey (`e2e_offline.py` must stay green): this script
tries to break the interface and exits 1 when it manages to. One scenario
per suspected defect, each in its own Chrome profile, against the static
offline build. For every defect it prints what was tried, what was expected
and what happened.

Run: python3 tests/audit_web.py   (after `npm run build:offline` in web/)
"""

import os
import re
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_offline import dismiss_tutorial, serve_dist  # noqa: E402  (path set above)
from e2e_tidewater import (  # noqa: E402
    ROOT, SCRATCH, console_errors, guard, start_chrome,
)

from selenium.webdriver.common.action_chains import ActionChains  # noqa: E402
from selenium.webdriver.common.by import By  # noqa: E402
from selenium.webdriver.common.keys import Keys  # noqa: E402
from selenium.webdriver.support import expected_conditions as ec  # noqa: E402
from selenium.webdriver.support.ui import WebDriverWait  # noqa: E402

BLOQUANT, MAJEUR, MINEUR, REMARQUE = "bloquant", "majeur", "mineur", "remarque"
SEVERITIES = [BLOQUANT, MAJEUR, MINEUR, REMARQUE]
GAME = "section[aria-label='Sea chart']"
TAB_LIMIT = 16


class Audit:
    """The finding list and the printed evidence."""

    def __init__(self):
        self.findings = []
        self.healthy = []
        self.console = []

    def add(self, severity, title, where, tried, expected, actual):
        self.findings.append({"severity": severity, "title": title, "where": where,
                              "tried": tried, "expected": expected, "actual": actual})
        print("  DEFECT [%s] %s" % (severity, title))
        for label, value in (("fichier", where), ("tenté", tried),
                             ("attendu", expected), ("obtenu", actual)):
            print("    %-8s: %s" % (label, value))

    def fine(self, note):
        self.healthy.append(note)
        print("  sain      : %s" % note)


def wait_ready(driver, timeout=20):
    WebDriverWait(driver, timeout).until(ec.any_of(
        ec.presence_of_element_located((By.CSS_SELECTOR, "form.auth-card")),
        ec.presence_of_element_located((By.CSS_SELECTOR, GAME))))


def sign_in(driver):
    """Fill the auth card when it is up; no navigation (keeps the page's state)."""
    if driver.find_elements(By.CSS_SELECTOR, "form.auth-card"):
        driver.find_element(By.CSS_SELECTOR, "input[type=email]").send_keys("audit@tide.water")
        driver.find_element(By.XPATH, "//form//button[@type='submit']").click()
        WebDriverWait(driver, 20).until(ec.presence_of_element_located((By.CSS_SELECTOR, GAME)))
    dismiss_tutorial(driver)  # a first launch opens the tutorial; a player skips it
    time.sleep(0.4)


def login(driver, base):
    driver.get(base + "/")
    wait_ready(driver)
    sign_in(driver)
    time.sleep(0.4)


def stats(driver):
    return driver.find_elements(By.CSS_SELECTOR, "header.topbar .tide-stat")


def clock_line(driver):
    return stats(driver)[0].text.strip()


def gold(driver):
    return [s.text.strip() for s in stats(driver) if "gold" in (s.get_attribute("class") or "")][0]


def quota(driver):
    return [s.text.strip() for s in stats(driver) if s.text.startswith("Quota")][0]


def button(driver, label):
    return driver.find_element(By.XPATH, "//button[normalize-space(.)='%s']" % label)


def click(driver, label, pause=0.9):
    button(driver, label).click()
    time.sleep(pause)


def double_click(driver, element, pause=2.0):
    ActionChains(driver).double_click(element).perform()
    time.sleep(pause)


def toasts(driver):
    return [t.text.split("\n")[0].strip() for t in driver.find_elements(By.CSS_SELECTOR, ".toast")]


def licence_block(driver):
    for block in driver.find_elements(By.CSS_SELECTOR, ".harbour-block"):
        heads = block.find_elements(By.CSS_SELECTOR, "h3")
        if heads and heads[0].text.startswith("Licences"):
            return block
    return None


def licence_line(driver):
    block = licence_block(driver)
    return block.find_element(By.CSS_SELECTOR, "h3").text if block is not None else ""


def licences(driver):
    match = re.search(r"yours:\s*(\d+)", licence_line(driver))
    return int(match.group(1)) if match else -1


def end_day(driver):
    click(driver, "End the day")


def cash(driver):
    return float(re.sub(r"[^0-9.]", "", gold(driver)) or 0)


def price(driver):
    match = re.search(r"([\d.]+)g each", licence_line(driver))
    return float(match.group(1)) if match else 0.0


def buy_buttons(driver):
    block = licence_block(driver)
    if block is None:
        return []
    return [b for b in block.find_elements(By.XPATH, ".//button[normalize-space(.)='Buy']")
            if b.is_enabled()]


# --- scenarios ----------------------------------------------------------
def scenario_storage(a, driver, base):
    login(driver, base)
    driver.execute_script("localStorage.setItem('tidewater-game-v1','not json{')")
    driver.refresh()
    time.sleep(1.8)
    if driver.find_elements(By.CSS_SELECTOR, GAME):
        a.fine("save JSON corrompu : le jeu repart d un port neuf, sans erreur console")
    else:
        a.add(MAJEUR, "un save JSON corrompu empêche de jouer", "web/src/persistence.ts:52",
              "localStorage['tidewater-game-v1'] = 'not json{', puis rechargement",
              "le port neuf s'ouvre (loadSaved attrape l'exception)",
              "écran mort : %r" % driver.find_element(By.ID, "root").text[:120])

    login(driver, base)
    stale = "{savedAt:'2026-01-01',seed:7,weeks:2,game:{day:0}}"
    driver.execute_script("localStorage.setItem('tidewater-game-v1', JSON.stringify(%s))" % stale)
    driver.refresh()
    time.sleep(2.5)
    root = driver.find_element(By.ID, "root")
    dead = "did not load" in root.text or not driver.find_elements(By.CSS_SELECTOR, GAME)
    if dead:
        buttons = [b.text for b in driver.find_elements(By.CSS_SELECTOR, "#root button")]
        a.add(BLOQUANT, "une sauvegarde d'une version antérieure tue l'application",
              "web/src/boot.ts:24 + web/src/main.tsx:25 (postImport -> E_IMPORT non rattrapé)",
              "save d'une version antérieure (game:{day:0}, champs manquants) puis rechargement",
              "au pire un port neuf avec un avertissement ; l'ancien save reste récupérable",
              "page morte : %r ; boutons disponibles : %s ; le save fautif reste en place, "
              "chaque rechargement remourra" % (root.text[:160], buttons or "aucun"))
    else:
        a.fine("save d'une version antérieure : repli propre")


def scenario_double_end_day(a, driver, base):
    login(driver, base)
    before_line, before_toasts = clock_line(driver), len(toasts(driver))
    double_click(driver, button(driver, "End the day"))
    ends = [t for t in toasts(driver) if "ends:" in t]
    after_line = clock_line(driver)
    new_toasts = len(toasts(driver)) - before_toasts
    if len(ends) >= 2 or new_toasts >= 2:
        a.add(MAJEUR, "un double-clic sur « End the day » ferme deux journées",
              "web/src/components/HeaderControls.tsx:33 + web/src/actions.ts:24 (aucun verrou en vol)",
              "double-clic sur « End the day » depuis %s" % before_line,
              "une seule journée fermée, le second clic ignoré pendant la requête",
              "deux journées fermées : toasts %s, horloge %s -> %s" % (ends, before_line, after_line))
    else:
        a.fine("End the day : second clic ignoré (une seule journée fermée)")


def scenario_double_buy(a, driver, base):
    login(driver, base)
    for _ in range(9):
        if buy_buttons(driver) and cash(driver) >= 2 * price(driver) > 0:
            break
        end_day(driver)
    candidates = buy_buttons(driver)
    if not candidates:
        a.add(REMARQUE, "aucune licence achetable en début de partie",
              "crates/rules/src/config.rs:143 (pas de prix / pool vide)",
              "chercher un bouton « Buy » actif pendant six jours",
              "un bouton actif dès que la bourse couvre le prix",
              "aucun bouton actif : %s, bourse %s" % (licence_line(driver), gold(driver)))
        return
    before, before_gold = licences(driver), gold(driver)
    double_click(driver, candidates[0], pause=2.5)
    after, after_gold = licences(driver), gold(driver)
    if after - before >= 2:
        a.add(MAJEUR, "un double-clic sur « Buy » achète deux licences",
              "web/src/components/HarbourPanel.tsx:63 + web/src/actions.ts:24 (aucun verrou en vol)",
              "double-clic sur le « Buy » d'un capitaine (bourse %s, %d licences)" % (before_gold, before),
              "un seul achat ; le second clic attend la réponse",
              "deux achats : licences %d -> %d, bourse %s -> %s, toast %s"
              % (before, after, before_gold, after_gold, toasts(driver)))
    else:
        a.fine("Buy licence : second clic ignoré (un seul achat)")


def scenario_live_clock(a, driver, base):
    login(driver, base)
    click(driver, "Go live", pause=0.6)
    end_day(driver)
    time.sleep(1.5)
    line, before_gold, before_quota = clock_line(driver), gold(driver), quota(driver)
    moved = None
    for step in range(9):
        time.sleep(5)
        if (gold(driver), quota(driver)) != (before_gold, before_quota):
            moved = 5 * (step + 1)
            break
    if moved is not None:
        a.add(MAJEUR, "« End the day » n'arrête pas l'horloge live : la journée suivante se joue toute seule",
              "web/src/hooks.ts:212-243 (useLiveClock ne teste ni busy ni la fermeture manuelle)",
              "Go live, puis « End the day » (%s, bourse %s)" % (line, before_gold),
              "les lots de la journée fermée s'arrêtent, la journée suivante attend le joueur",
              "un lot est landé dans la journée suivante %ds plus tard : bourse %s -> %s, quota %s -> %s"
              % (moved, before_gold, gold(driver), before_quota, quota(driver)))
    else:
        a.fine("End the day pendant Go live : l'horloge ne relance pas la journée suivante")

    before_gold = gold(driver)
    click(driver, "Log out", pause=0.8)
    gate = bool(driver.find_elements(By.CSS_SELECTOR, "form.auth-card"))
    time.sleep(32)
    sign_in(driver)
    after_gold = gold(driver)
    if gate and after_gold != before_gold:
        a.add(MAJEUR, "l'horloge live continue de jouer pendant que le joueur est déconnecté",
              "web/src/hooks.ts:212 + web/src/App.tsx:447 (logout ne coupe pas live)",
              "Go live, puis « Log out », attendre 32 s, se reconnecter",
              "la sortie de partie arrête l'horloge ; le port ne bouge pas sans joueur",
              "bourse %s -> %s pendant l'écran de connexion (des lots ont été landés hors jeu)"
              % (before_gold, after_gold))
    else:
        a.fine("Log out pendant Go live : le port ne bouge pas hors jeu")


def scenario_two_tabs(a, driver, base):
    login(driver, base)
    end_day(driver)
    time.sleep(0.8)
    played = clock_line(driver)
    driver.execute_script("window.open(arguments[0] + '/', '_blank')", base)
    driver.switch_to.window(driver.window_handles[1])
    time.sleep(2.5)
    stale = clock_line(driver)
    driver.switch_to.window(driver.window_handles[0])
    end_day(driver)
    time.sleep(1.5)
    ahead = clock_line(driver)
    driver.switch_to.window(driver.window_handles[1])
    click(driver, "Next lot", pause=0.7)
    click(driver, "Next lot", pause=1.2)
    driver.switch_to.window(driver.window_handles[0])
    driver.refresh()
    time.sleep(2.5)
    seen = clock_line(driver)
    driver.switch_to.window(driver.window_handles[1])
    driver.close()
    driver.switch_to.window(driver.window_handles[0])
    if seen == ahead:
        a.fine("deux onglets : le dernier écrivain du save est aussi le plus avancé")
        return
    a.add(MAJEUR, "deux onglets ouverts : l'onglet en retard écrase la partie avancée",
          "web/src/boot.ts:37 (savedAt jamais comparé) + web/src/persistence.ts:38",
          "onglet A joue (%s) ; onglet B ouvert avant (%s) ; A ferme une journée (%s) ; "
          "B lande deux lots puis sauve ; rechargement de A" % (played, stale, ahead),
          "le save le plus récent gagne, ou l'onglet en retard est averti et ne sauve pas",
          "A revient à %s : la journée jouée après coup est perdue, aucun avertissement" % seen)


def scenario_share_link(a, driver, base):
    login(driver, base)
    end_day(driver)
    played = gold(driver)
    driver.get(base + "/?seed=99&weeks=4")
    wait_ready(driver)
    time.sleep(1.5)
    after = gold(driver)
    driver.get(base + "/")
    wait_ready(driver)
    time.sleep(1.5)
    kept = gold(driver)
    if kept == after and kept != played:
        a.add(MAJEUR, "ouvrir un lien ?seed= remplace la partie en cours sans prévenir",
              "web/src/boot.ts:20 (postInit dès que le seed de l'URL diffère)",
              "jouer une journée (bourse %s), puis ouvrir /?seed=99&weeks=4, puis revenir à /"
              % played,
              "demande de confirmation, ou la partie en cours conservée",
              "port neuf à %s, et de retour sur / la partie vaut %s : la partie précédente "
              "est écrasée par l'autosave" % (after, kept))
    else:
        a.fine("lien ?seed= : la partie en cours n'est pas perdue")


def scenario_keyboard(a, driver, base):
    login(driver, base)
    canvas = driver.find_element(By.CSS_SELECTOR, "canvas.sea-canvas")
    attrs = (canvas.get_attribute("tabindex"), canvas.get_attribute("role"))
    driver.find_element(By.TAG_NAME, "body").send_keys(Keys.TAB)
    visited = []
    for _ in range(TAB_LIMIT):
        visited.append(driver.execute_script("return document.activeElement.tagName"))
        driver.switch_to.active_element.send_keys(Keys.TAB)
    if "CANVAS" not in visited:
        a.add(MAJEUR, "la carte de mer n'est pas atteignable au clavier",
              "web/src/components/SeaMap.tsx:471 (canvas + onClick seulement)",
              "Tab sur %d éléments depuis l'en-tête" % TAB_LIMIT,
              "la carte se sélectionne au clavier (tabindex=0, Entrée choisit un bateau)",
              "le canvas n'a ni tabindex ni role (%s) et ne reçoit jamais le focus ; "
              "un joueur au clavier doit passer par le panneau « Your boats »" % (attrs,))
    else:
        a.fine("carte de mer : atteignable au clavier")

    click(driver, "End the day")
    stack = driver.execute_script(
        "const t=document.querySelector('.toast-stack');"
        "return t?JSON.stringify([...t.attributes].map(x=>x.name)):'absent'")
    toast_role = driver.execute_script(
        "const t=document.querySelector('.toast');"
        "return t?JSON.stringify([...t.attributes].map(x=>x.name)):'absent'")
    if "aria-live" not in str(stack) and "role" not in str(toast_role):
        a.add(MAJEUR, "les toasts ne sont jamais annoncés (aucune région live)",
              "web/src/App.tsx:427-430 (ToastStack) + web/src/styles.css:250",
              "fermer une journée, inspecter .toast-stack et .toast",
              "role=status / aria-live=polite : le lecteur d'écran lit la confirmation",
              "attributs du conteneur : %s, du toast : %s — tout le retour de jeu "
              "(jour fermé, licence achetée, erreur) reste silencieux" % (stack, toast_role))
    else:
        a.fine("les toasts sont dans une région live")

    button(driver, "Judges").click()
    time.sleep(0.6)
    panel = driver.find_elements(By.CSS_SELECTOR, "section[aria-label='Judges'] button")
    driver.execute_script("arguments[0].focus()", panel[-1])
    driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
    time.sleep(0.5)
    active = driver.execute_script("return document.activeElement.tagName")
    closed = not driver.find_elements(By.CSS_SELECTOR, "section[aria-label='Judges']")
    if closed and active == "BODY":
        a.add(MINEUR, "Échap ferme le panneau Judges mais perd le focus",
              "web/src/App.tsx:452 (onKey ferme sans rendre le focus au bouton Judges)",
              "focus sur « Fast-forward 28 days » dans le panneau, puis Échap",
              "le panneau se ferme et le focus revient sur le bouton « Judges »",
              "focus sur BODY : le prochain Tab repart du début du document (WCAG 2.4.3)")
    else:
        a.fine("Échap rend le focus au déclencheur")


def scenario_motion(a, driver, base):
    driver.execute_cdp_cmd("Emulation.setEmulatedMedia", {"features": [
        {"name": "prefers-reduced-motion", "value": "reduce"}]})
    login(driver, base)
    reduced = driver.execute_script(
        "return window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    end_day(driver)
    if driver.find_elements(By.CSS_SELECTOR, GAME):
        a.fine("prefers-reduced-motion=%s : la partie tourne, pas d'animation "
               "(bloc global styles.css:325, SeaMap/AuctionPanel testent matchMedia)" % reduced)
    else:
        a.add(MAJEUR, "le jeu casse sous prefers-reduced-motion", "web/src/styles.css:325",
              "Chrome forcé en reduced motion, puis End the day",
              "la partie tourne normalement", "pas d'écran de jeu après la journée")


def luminance(colour):
    channels = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(front, back):
    high, low = sorted([luminance(front), luminance(back)], reverse=True)
    return round((high + 0.05) / (low + 0.05), 2)


def palette():
    with open(os.path.join(ROOT, "web", "src", "styles.css"), encoding="utf-8") as fh:
        css = fh.read()
    return {name: "#" + value
            for name, value in re.findall(r"(--[a-z0-9-]+):\s*#([0-9a-fA-F]{6})", css)}


def scenario_contrast(a):
    """Section 9 palette: text/background pairs below WCAG AA 4.5:1."""
    tint = palette()
    pairs = [("le libellé des boutons d'action", "#fff6ec", tint.get("--buoy"), "73"),
             ("la tendance « falling »", tint.get("--red"), tint.get("--panel"), "321")]
    for label, front, back, line in pairs:
        ratio = contrast(front, back)
        if ratio < 4.5:
            a.add(MINEUR, "contraste insuffisant : %s" % label, "web/src/styles.css:" + line,
                  "ratio %s sur %s" % (front, back),
                  "au moins 4.5:1 pour du texte de 15px (WCAG 1.4.3)",
                  "%.2f:1 — sous le seuil AA" % ratio)
        else:
            a.fine("contraste %s : %.2f:1" % (label, ratio))


# --- runner -------------------------------------------------------------
SCENARIOS = [("stockage", scenario_storage), ("double-end-day", scenario_double_end_day),
             ("double-licence", scenario_double_buy), ("horloge-live", scenario_live_clock),
             ("deux-onglets", scenario_two_tabs), ("lien-seed", scenario_share_link),
             ("clavier-aria", scenario_keyboard), ("reduced-motion", scenario_motion)]


def run_scenario(a, name, fn, base, tmp):
    print("[%s]" % name)
    driver = start_chrome(os.path.join(tmp, name))
    try:
        fn(a, driver, base)
        a.console.extend(console_errors(driver))
    except Exception as exc:  # noqa: BLE001  (a blocked scenario is a finding)
        a.add(MAJEUR, "scénario bloqué : %s" % name, "tests/audit_web.py",
              name, "le scénario se déroule", "%s: %s" % (type(exc).__name__, str(exc)[:200]))
    finally:
        driver.quit()


def summary(a):
    print("\n--- defauts : %d ---" % len(a.findings))
    for severity in SEVERITIES:
        rows = [f for f in a.findings if f["severity"] == severity]
        if rows:
            print("  %s (%d)" % (severity, len(rows)))
            for row in rows:
                print("    - %s  [%s]" % (row["title"], row["where"]))
    print("--- console errors: %d ---" % len(a.console))
    for err in a.console[:10]:
        print("  " + err[:300])
    print("--- jugé sain : %d ---" % len(a.healthy))
    for note in a.healthy:
        print("  " + note)
    return 1 if a.findings or a.console else 0


def main():
    if not os.path.isfile(os.path.join(ROOT, "web", "dist", "engine.wasm")):
        print("web/dist/engine.wasm missing: run `npm run build:offline` in web/")
        return 2
    os.makedirs(SCRATCH, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="audit-web-", dir=SCRATCH)
    warning = guard("before")
    if warning:
        print(warning)
    a = Audit()
    proc, base = serve_dist()
    try:
        for name, fn in SCENARIOS:
            run_scenario(a, name, fn, base, tmp)
        print("[contrastes]")
        scenario_contrast(a)
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    warning = guard("after")
    if warning:
        print(warning)
    shutil.rmtree(tmp, ignore_errors=True)
    return summary(a)


if __name__ == "__main__":
    sys.exit(main())
