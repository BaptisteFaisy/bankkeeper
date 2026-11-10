/* Tidewater service worker: the harbour, kept in the browser.
 *
 * Two lists and one rule. `PRECACHE` is the shell: the HTML, the engine, the
 * hashed JS and CSS. It is stamped in at build time by `scripts/build-sw.mjs`
 * (the cache name carries a hash of the file names, so a deploy never serves
 * yesterday's module graph). Everything else same-origin is
 * stale-while-revalidate. Nothing that is not a 200 is ever stored, and
 * `/api/` is never touched: the relay build speaks to a server on purpose.
 *
 * The placeholders below are replaced in `web/dist/sw.js`; left as they are
 * (dev, or a build without the script) the file still parses and caches only
 * the index.
 */

const VERSION = '__SW_VERSION__';
const PRECACHE = /* __SW_PRECACHE__ */ ['./index.html'];

const PREFIX = 'tidewater-';
const CACHE = PREFIX + VERSION;
const INDEX = '/index.html';
const OFFLINE = '/offline.html';

/** What a navigation falls back to when there is neither cache nor network. */
const SHEET = [
  '<!doctype html><meta charset="utf-8"><title>Tidewater</title>',
  '<body style="margin:0;min-height:100vh;background:#0f2a30;color:#e4ede6;',
  'font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center">',
  '<p style="max-width:32rem;padding:2rem">The harbour did not load: this',
  'browser holds no cached copy and the network is silent.</p>',
].join('');

/** Fetch a URL past the HTTP cache and keep it only when it is a clean 200. */
function refill(cache, key, request) {
  return fetch(request).then(async (response) => {
    if (response.ok && response.type === 'basic') {
      await cache.put(key, response.clone());
    }
    return response;
  }).catch(() => null);
}

/** The offline sheet, or a last-resort response when even that is absent. */
async function sheet(cache, fallbackKey) {
  if (fallbackKey === null) return Response.error();
  const page = await cache.match(fallbackKey);
  if (page !== undefined) return page;
  return new Response(SHEET, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Cached copy first, refreshed in the background; network when there is none. */
async function serve(request, key, fallbackKey) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key);
  if (cached !== undefined) {
    refill(cache, key, request);
    return cached;
  }
  const fresh = await refill(cache, key, request);
  if (fresh !== null) return fresh;
  return sheet(cache, fallbackKey);
}

/** Warm the shell one file at a time: a single miss must not void the install. */
async function precache() {
  const cache = await caches.open(CACHE);
  for (const url of PRECACHE) {
    try {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (response.ok) await cache.put(url, response);
    } catch {
      // A file that is not there costs that file, nothing else.
    }
  }
  return self.skipWaiting();
}

/** Drop every cache from an older build, then take over the open pages. */
async function sweep() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(PREFIX) && name !== CACHE)
    .map((name) => caches.delete(name)));
  return self.clients.claim();
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(sweep());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(serve(request, INDEX, OFFLINE));
    return;
  }
  event.respondWith(serve(request, url.pathname, null));
});
