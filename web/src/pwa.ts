/// <reference types="vite/client" />
// Install the harbour as an app: register the service worker, production only.
//
// Kept out of `main.tsx` on purpose — several branches edit that file, and the
// boot sequence there is load-bearing. `index.html` already has to name the
// entry points, so a second module script costs nothing and touches no shared
// TypeScript. In dev nothing registers: a service worker in `vite dev` would
// serve yesterday's module graph and quietly lie about the code you are editing.

/** Register `sw.js` for this directory; a failure only costs the install. */
function registerPwa(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // No worker: the game still runs, it just cannot be installed.
    });
  });
}

registerPwa();
