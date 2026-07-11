/*
 * sw-register.js — register the GifOS offline service worker (sw.js).
 *
 * With it installed, the whole desktop and every app already saved on this
 * device keep working with no network at all (airplane mode). Networked
 * features (Meetings, the web-reading apps, Ask AI) still need a connection and
 * degrade on their own. A no-op where service workers are unavailable, and it
 * never blocks first paint — registration waits for load.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* offline / unsupported — ignore */ });
  });
})();
