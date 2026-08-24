/*
 * sw-register.js — register the GifOS offline service worker (sw.js).
 *
 * With it installed, the whole desktop and every app already saved on this
 * device keep working with no network at all (airplane mode). Networked
 * features (Meetings, the web-reading apps, Ask AI) still need a connection and
 * degrade on their own. A no-op where service workers are unavailable, and it
 * never blocks first paint — registration waits for load.
 *
 * Channel note: EDGE users have opted to track the newest build, so we let a
 * freshly-installed worker take over on its own (postMessage 'gifos-apply-update'
 * → skipWaiting → claim) instead of parking it as WAITING behind the opt-in
 * upgrade. We deliberately do NOT reload the page — that would interrupt a live
 * meeting; the running page keeps its loaded code, and the NEXT navigation is
 * served by the new worker (which revalidates every edge asset against GitHub
 * Pages). RELEASE / pinned users keep the opt-in flow untouched: a new worker
 * waits until they choose "Upgrade this computer" in Settings → Advanced → Version.
 */
(function () {
  // READING navigator.serviceWorker throws (not undefined) where workers are
  // disabled — a sandboxed iframe without allow-same-origin, or a driver that
  // blocks them — so the property access itself needs the guard.
  var sw = null;
  try { sw = navigator.serviceWorker; } catch (e) { return; }
  if (!sw) return;
  function isEdge() {
    try { return localStorage.getItem('gifos_channel') === 'edge' && !localStorage.getItem('gifos_pin'); } catch (e) { return false; }
  }
  window.addEventListener('load', function () {
    sw.register('/sw.js').then(function (reg) {
      if (!reg || !isEdge()) return;               // release/pinned → opt-in upgrade, untouched
      var apply = function () { if (reg.waiting) reg.waiting.postMessage({ type: 'gifos-apply-update' }); };
      apply();                                      // a worker already waiting from a prior visit
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () { if (nw.state === 'installed') apply(); });
      });
      try { reg.update(); } catch (e) {}            // check GitHub Pages for a newer worker now
    }).catch(function () { /* offline / unsupported — ignore */ });
  });
})();
