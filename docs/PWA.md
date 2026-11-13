# PWA — the harbour, installed

The offline build (`cd web && npm run build:offline`) is a static bundle:
`index.html`, `assets/*.js|css`, `engine.wasm`, the manifest, the icons and
`sw.js`. No server is needed to play, so nothing stops the browser from
keeping the whole thing on disk. That is all this PWA layer is: a manifest so
the tab can become an app, and a service worker so the app opens with the
network unplugged.

Four files carry it, plus one build script:

| Path | Role |
| --- | --- |
| `web/public/manifest.webmanifest` | name, `start_url: "./"`, `display: standalone`, `#0f2a30` background and theme, 192 and 512 icons |
| `web/public/icon-192.png`, `icon-512.png` | drawn by `web/scripts/make-icons.py` (`npm run icons`), stdlib only |
| `web/public/sw.js` | the worker: precache the shell, pages network-first, stale-while-revalidate everything else |
| `web/scripts/build-sw.mjs` | stamps the worker after `vite build`: cache version + precache list |
| `web/src/pwa.ts` | registers `./sw.js`, production only |
| `web/public/offline.html` | the sheet shown when a navigation has neither cache nor network |

`index.html` names the manifest and loads `src/pwa.ts` as a second module
script. `main.tsx` is deliberately untouched: several branches edit it, and
its boot sequence is load-bearing — a second entry point in `index.html`
costs nothing and conflicts with nobody. In development nothing registers
(`import.meta.env.PROD`), because a worker in `vite dev` would serve the
module graph of yesterday.

## What is cached, and when

At **install**, one file at a time, with `cache: 'reload'` so the HTTP cache
cannot hand back a stale copy. The list is written by
`web/scripts/build-sw.mjs` from what the build actually emitted:

```
/index.html  /engine.wasm  /offline.html  /manifest.webmanifest
/favicon.ico  /icon-192.png  /icon-512.png
/assets/index-<hash>.css  /assets/index-<hash>.js
```

About 870 KiB, of which 660 KiB is `engine.wasm`. A single missing file is
skipped — it costs that file, not the install.

At **runtime**, a **page** (a navigation) goes to the network first and is
stored under its own path; its cached copy answers only when the network does
not. A returning visitor therefore sees a new deploy on the very next visit —
cache-first pages showed them the previous build, and one shared key let
`/proofs.html` be stored as the game's index (13/11, fixed).

Every other same-origin `GET` goes through stale-while-revalidate: the cached copy is returned at once and refreshed in
the background, and that refresh goes out with `cache: 'no-cache'` — it
revalidates with the origin instead of letting the browser's own HTTP cache
answer. The versioned cache is the authority here; a stopped server must mean
a stopped server, not a copy from the disk cache (this was measured: without
it, a deleted cache entry came back from the HTTP cache and the test failed).

Three rules hold everywhere:

- a response is stored **only** when `response.ok` and same-origin
  (`response.type === 'basic'`) — a 404 or a 500 is never written;
- `/api/` is never intercepted: the relay build talks to a server on purpose;
- offline, `/` is served from the cached `/index.html` whatever the query
  string, so `?seed=7&weeks=2` links replay offline too; other pages from
  their own path. When that key is absent too, the worker serves
  `/offline.html`, then a 12-line inline sheet — a page, never a browser error.

The cache is named `tidewater-<version>`, where `<version>` is 12 hex
characters of sha256 over the name and the bytes of every shell file: any
renamed asset or any changed byte moves it. `install` calls `skipWaiting()`, `activate`
deletes every older `tidewater-*` cache and calls `clients.claim()`, so a
fresh deploy takes over open tabs at the next navigation instead of leaving
them half-updated.

## Purging

Nothing here survives a "Clear site data", which is the honest answer:
DevTools → Application → Storage → Clear site data removes the caches, the
worker, and `localStorage` (the season itself, `tidewater-game-v1`).

Narrower, from the page console:

```js
const [name] = await caches.keys();
await caches.delete(name);                       // drop the shell only
const reg = await navigator.serviceWorker.getRegistration();
await reg.unregister();                          // forget the worker
localStorage.removeItem('tidewater-game-v1');    // forget the season
```

A deploy needs no purge: the version hash changes, the new worker installs,
and the old cache goes on activation.

## What `tests/e2e_pwa.py` proves

It serves `web/dist` with `python -m http.server` on a disposable port, in a
fresh Chrome profile under `/tmp` (no worker inherited from a previous run),
and checks, in order:

1. the page boots and **`navigator.serviceWorker.controller` is set** — the
   worker is registered, activated and in charge of that page;
2. the Cache API really holds the shell: at least one cache named
   `tidewater-<hash>`, 9 entries, `engine.wasm` present, the hashed JS **and**
   the hashed CSS present;
3. the manifest parses with `display: standalone`, `start_url: ./`, both icon
   sizes, and both PNG files answer 200;
4. **the server is stopped** (and the port is confirmed refused), the page is
   reloaded at `/?seed=7&weeks=2`, and it still shows `Tidewater`, a non-empty
   `#root`, still controlled by the worker, with the first screen's text; zero
   SEVERE console entries;
5. then it deletes the cached `index.html` and reloads once more — the
   fallback sheet (`Tidewater — offline`, "The harbour is not on this device")
   must answer, which is the one path where the network is gone **and** the
   cache is empty;
6. any failure exits 1 with the step that broke.

So it proves: **the install path works, a reload with the network gone is
served entirely from the browser's own storage, and an empty cache still
lands on a page instead of the browser's error screen.**

It does **not** prove:

- that the browser would accept the app as installable — that is a browser
  heuristic (HTTPS, engagement, screenshots), not something a headless test
  can assert. It runs on `http://127.0.0.1`, which counts as secure;
- anything about a cold device that never had the site: no cache means no
  worker, and the browser's own error page wins — `offline.html` is only
  reached by an *installed* worker whose navigation key is missing;
- the update flow: a deploy ships a new hash, but the tab open at that moment
  keeps the old shell until it navigates again. Not exercised here;
- storage pressure: Chrome evicts caches under quota pressure, and Safari
  purges site data after seven days of no use. After that, the app needs the
  network again;
- the relay build's behaviour — this test only speaks to the static offline
  build (`tests/e2e_tidewater.py` covers the relay, worker included, and stays
  at zero failed requests);
- other browsers than the Chrome that happens to be installed here.

## Fragile spots, named

- **Precache size**: ~870 KiB, 660 of them the wasm engine. It is fetched once
  per build version; on a slow link the first visit pays for it.
- **Cache-first navigations**: after a deploy, a reload can serve the previous
  `index.html` once. The assets it names are still cached under the old
  version, so the page works — it is just one navigation behind.
- **The version hash covers the whole shell** (every name and every file's
  bytes, hashed once per build, ~870 KiB of reading). The worker's own bytes
  are not in that list: a deploy that only changes `sw.js` keeps the cache
  name, installs the new worker, and refills the same cache — harmless, but
  worth knowing when you wonder why the version did not move.
- **`/api/` is bypassed** by prefix; a future endpoint outside `/api/` would be
  cached with a stale-while-revalidate policy and answer from disk.
- **`http.server` is not a production server**: no `Cache-Control`, so the
  tests say nothing about CDN or proxy behaviour.
