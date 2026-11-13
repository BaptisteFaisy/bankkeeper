"""Proof that the offline build is installable: kill the server, reload, play.

What it does, in order:

1. serves `web/dist` as plain static files on a disposable port;
2. loads the page in a **fresh** Chrome profile under /tmp and waits for the
   service worker to register, activate and control the page
   (`navigator.serviceWorker.controller`);
3. reads the cache back from the page: cache name (= build version), number of
   entries, and whether `engine.wasm` and the hashed JS are really in there;
   reads the manifest and checks `display: standalone` and the 192/512 icons;
4. **stops the server** (and waits for the port to be refused), reloads the
   page and asserts the app still renders — title, `#root` children, and the
   auth card or the sea chart;
5. prints the transcript and exits 1 on the first failed step, with the detail.

Run: python3 tests/e2e_pwa.py (after `cd web && npm run build:offline`).
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_offline import serve_dist  # noqa: E402  (path set above)
from e2e_tidewater import (  # noqa: E402
    ROOT, SCRATCH, console_errors, guard, start_chrome,
)

MANIFEST = os.path.join(ROOT, "web", "public", "manifest.webmanifest")
CONTROLLER = ("return navigator.serviceWorker && navigator.serviceWorker.controller"
              " ? navigator.serviceWorker.controller.scriptURL : null;")


def dist_problem():
    """Missing build artefact, if any: the test says so instead of guessing."""
    dist = os.path.join(ROOT, "web", "dist")
    for name in ("index.html", "engine.wasm", "sw.js", "manifest.webmanifest",
                 "offline.html"):
        if not os.path.isfile(os.path.join(dist, name)):
            return f"web/dist/{name} missing: run `npm run build:offline` in web/"
    with open(os.path.join(dist, "sw.js"), encoding="utf-8") as fh:
        if "'__SW_VERSION__'" in fh.read():
            return "web/dist/sw.js is unstamped: node scripts/build-sw.mjs never ran"
    return ""


def wait_controller(driver, timeout=30):
    """Poll until a service worker controls this page; returns its script URL."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            url = driver.execute_script(CONTROLLER)
        except Exception:
            url = None
        if url:
            return url
        time.sleep(0.25)
    return None


def cache_report(driver):
    """What the worker actually kept, read from the page itself."""
    script = """
    const done = arguments[0];
    (async () => {
      const names = await caches.keys();
      const out = { caches: names, entries: 0, engine: false, js: null, css: null };
      for (const name of names) {
        const keys = await (await caches.open(name)).keys();
        out.entries += keys.length;
        for (const request of keys) {
          const url = request.url;
          if (url.endsWith('/engine.wasm')) out.engine = true;
          if (out.js === null && /\\/assets\\/.*\\.js$/.test(url)) out.js = url;
          if (out.css === null && /\\/assets\\/.*\\.css$/.test(url)) out.css = url;
        }
      }
      done(out);
    })().catch((error) => done({ error: String(error) }));
    """
    return driver.execute_async_script(script)


def manifest_report(driver, base):
    """The manifest as the browser reads it, plus the icon files' status."""
    script = """
    const done = arguments[0];
    fetch('./manifest.webmanifest')
      .then((r) => r.json())
      .then((m) => done({ manifest: m }))
      .catch((e) => done({ error: String(e) }));
    """
    report = driver.execute_async_script(script)
    if "error" in report:
        return report
    icons = report["manifest"].get("icons", [])
    report["status"] = {}
    for icon in icons:
        url = base + "/" + icon.get("src", "").lstrip("./")
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                report["status"][icon.get("src")] = response.status
        except (OSError, urllib.error.URLError) as exc:
            report["status"][icon.get("src")] = str(exc)
    return report


def online_facts(driver, base, notes):
    """Register, control, cache and manifest; returns a failure list."""
    failures = []
    driver.get(base + "/")
    wait_until_title(driver)
    notes.append(f"page: title {driver.title!r} with the server up")
    url = wait_controller(driver)
    if not url:
        failures.append("service worker never controlled the page")
    else:
        notes.append(f"sw: controlling this page ({url.rsplit('/', 1)[-1]})")
    report = cache_report(driver)
    if "error" in report:
        failures.append(f"cache read failed: {report['error']}")
        return failures
    notes.append("cache: {} entries in {}".format(report["entries"], report["caches"]))
    if not report["engine"]:
        failures.append("engine.wasm is not in the cache")
    if report["js"] is None:
        failures.append("no hashed JS asset in the cache")
    if report["css"] is None:
        failures.append("no hashed CSS asset in the cache")
    manifest = manifest_report(driver, base)
    if "error" in manifest:
        failures.append(f"manifest unreadable: {manifest['error']}")
        return failures
    data = manifest["manifest"]
    notes.append("manifest: {} display={} start_url={}".format(
        data.get("short_name"), data.get("display"), data.get("start_url")))
    if data.get("display") != "standalone":
        failures.append("manifest display is not standalone")
    if data.get("start_url") != "./":
        failures.append("manifest start_url is not ./")
    sizes = sorted(icon.get("sizes") for icon in data.get("icons", []))
    if "192x192" not in sizes or "512x512" not in sizes:
        failures.append(f"manifest icons incomplete: {sizes}")
    bad = {name: status for name, status in manifest["status"].items() if status != 200}
    if bad:
        failures.append(f"icon files not served: {bad}")
    return failures


def wait_until_title(driver, timeout=20):
    """The document title is the cheapest 'the app booted' signal."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if driver.title.strip() == "Tidewater":
            return True
        time.sleep(0.2)
    return False


def cut_server(proc, port):
    """Stop the static server and wait until the port really refuses."""
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
        except (OSError, urllib.error.URLError):
            return True
        time.sleep(0.2)
    return False


def drop_cached_index(driver):
    """Delete the cached shell only, to reach the sheet with no cache at all."""
    script = """
    const done = arguments[0];
    (async () => {
      const names = await caches.keys();
      if (!names.length) { done('no cache to drop'); return; }
      const cache = await caches.open(names[0]);
      const keys = await cache.keys();
      const page = keys.find((r) => r.url.indexOf('/index.html') !== -1);
      if (!page) { done('no cached index.html'); return; }
      await cache.delete(page);
      done('dropped ' + page.url);
    })().catch((error) => done('failed: ' + String(error)));
    """
    return driver.execute_async_script(script)


def sheet_step(driver, base, notes):
    """No cache, no network: the fallback sheet, not the browser's error page."""
    dropped = drop_cached_index(driver)
    notes.append("sheet: {}".format(dropped))
    if not str(dropped).startswith("dropped"):
        return ["could not drop the cached index to test the offline sheet"]
    try:
        driver.get(base + "/")
    except Exception as exc:
        return [f"reload with neither cache nor server failed: {str(exc)[:200]}"]
    time.sleep(1.0)
    state = screen_state(driver)
    notes.append("sheet: title {!r}, cache entries {}".format(
        state["title"], cache_report(driver).get("entries")))
    if "offline" not in state["title"].lower():
        return [f"offline sheet did not appear (title {state['title']!r})"]
    if "not on this device" not in state["body"]:
        return ["offline sheet text missing"]
    return []


def fresh_deploy_step(driver, base, notes):
    """A new deploy shows on the very next visit, not one visit later.

    The page is already controlled and its index cached. The served
    `index.html` changes (a marker meta tag in the head, as a new build would
    change it); the next navigation must carry the marker. A cache-first
    worker returns the old copy here: that is the regression this step guards.
    The marker goes inside `<head>`, so it belongs to the document: a comment
    appended after `</html>` would land outside `documentElement`.
    """
    index = os.path.join(ROOT, "web", "dist", "index.html")
    with open(index, encoding="utf-8") as handle:
        original = handle.read()
    marker = "e2e-pwa fresh deploy {}".format(int(time.time()))
    tag = '<meta name="e2e-pwa-fresh-deploy" content="{}">'.format(marker)
    tagged = original.replace("<head>", "<head>" + tag, 1)
    if tagged == original:
        tagged = original.replace("</body>", tag + "</body>", 1)
    try:
        with open(index, "w", encoding="utf-8") as handle:
            handle.write(tagged)
        driver.get(base + "/")
        time.sleep(1.0)
        seen = marker in driver.execute_script("return document.documentElement.outerHTML;")
    finally:
        with open(index, "w", encoding="utf-8") as handle:
            handle.write(original)
    notes.append("fresh deploy: {}".format("seen on the next visit" if seen else "NOT seen"))
    return [] if seen else ["a changed index.html was not served on the next visit (cache-first page)"]


def screen_state(driver):
    """Title, rendered children and the first screen word, from the page."""
    script = """
    const root = document.getElementById('root');
    return {
      title: document.title,
      children: root ? root.children.length : 0,
      text: root ? root.innerText.slice(0, 120) : '',
      body: document.body ? document.body.innerText.slice(0, 200) : '',
      controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    };
    """
    return driver.execute_script(script)


def offline_step(driver, base, port, proc, notes):
    """The point of the whole file: no server, the page still opens."""
    failures = []
    if not cut_server(proc, port):
        return ["the static server never stopped"]
    notes.append("server: stopped, port {} refuses connections".format(port))
    try:
        driver.get(base + "/?seed=7&weeks=2")
    except Exception as exc:  # a dead tab is exactly the failure we hunt
        return [f"reload with no server failed: {str(exc)[:200]}"]
    time.sleep(1.5)
    state = screen_state(driver)
    notes.append("offline: title {!r}, #root children {}{}".format(
        state["title"], state["children"],
        ", still controlled" if state["controlled"] else ", NOT controlled"))
    if state["title"].strip() != "Tidewater":
        failures.append(f"offline title is {state['title']!r}")
    if state["children"] < 1:
        failures.append("offline page rendered an empty #root")
    if state["controlled"] is False:
        failures.append("offline page is no longer controlled by the worker")
    if not state["text"].strip():
        failures.append("offline page shows no text at all")
    else:
        notes.append("offline: first screen says {!r}".format(state["text"][:60]))
    return failures


def main():
    problem = dist_problem()
    if problem:
        print(problem)
        return 2
    notes, failures, errors = [], [], []
    warning = guard("before")
    if warning:
        print(warning)
    os.makedirs(SCRATCH, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="e2e-pwa-", dir=SCRATCH)
    proc, base = serve_dist()
    driver = None
    try:
        driver = start_chrome(os.path.join(tmp, "chrome-profile"))
        failures = online_facts(driver, base, notes)
        failures += fresh_deploy_step(driver, base, notes)
        cut_port = int(base.rsplit(":", 1)[-1])
        failures += offline_step(driver, base, cut_port, proc, notes)
        failures += sheet_step(driver, base, notes)
        errors = console_errors(driver)
    finally:
        if driver is not None:
            driver.quit()
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=10)
        shutil.rmtree(tmp, ignore_errors=True)
    warning = guard("after")
    if warning:
        print(warning)
    print("--- transcript ---")
    for note in notes:
        print(f"  {note}")
    print("--- console errors: {} ---".format(len(errors)))
    for err in errors[:10]:
        print(f"  {err[:300]}")
    for failure in failures:
        print(f"FAIL {failure}")
    if errors:
        return 1
    if failures:
        return 1
    print("OK: installed, controlled the page, showed a fresh deploy at once, and reopened it with the server dead.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
