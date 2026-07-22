/*
 * sw.js — the GifOS offline layer.
 *
 * GifOS is already a local-first computer: all the logic ships as static files,
 * and every app + file you own lives in IndexedDB on the device. The one thing
 * that still needed the network was FETCHING THOSE STATIC FILES on each load —
 * so a fresh open in airplane mode never even reached the desktop. This service
 * worker precaches the whole shell (the HTML pages, CSS, every js/ module and
 * the base theme) so the desktop boots with no connection at all. Your saved
 * apps then run straight from IndexedDB, exactly as they do online.
 *
 * What still needs a connection (and degrades on its own, unchanged): Meetings
 * (the relay), the web-reading apps like Bible Browser and Fortune (the CORS
 * proxy), and Ask AI. Those are CROSS-ORIGIN requests — the fetch handler never
 * touches them, so they fail the same friendly way they always did offline.
 *
 * Update path: updates are OPT-IN and never happen behind the user's back. A
 * plain refresh (or hard refresh) always serves the SAME installed shell — the
 * fetch handler is cache-first with NO background revalidation — so a deploy
 * can't silently change a running computer. When a new sw.js ships it installs
 * but WAITS (it does not skipWaiting over an existing shell). The desktop learns
 * a release is available by fetching version.json + changelog.json network-first,
 * and shows it in Settings → Advanced → Version with a changelog (critical items
 * called out). Only when the user chooses "Upgrade this computer" does the page
 * either activate the waiting worker or send 'gifos-refresh-shell' to re-fetch
 * the ENTIRE shell fresh (the computer is far more than index.html) and reload.
 */
'use strict';

var SHELL_VERSION = 'v6';
var CACHE = 'gifos-shell-' + SHELL_VERSION;

// The universal shell — identical on gifos.app and every theme subdomain. Per-
// computer extras (archived builds under /versions/) are runtime-cached on first
// visit, so a computer you have actually opened keeps working offline too.
var CORE = [
  '/', '/index.html', '/boot.html', '/run.html', '/meet.html', '/sign.html', '/about.html', '/404.html',
  '/css/desktop.css',
  '/js/gifos-gif.js', '/js/gifos-sign.js', '/js/gifos-zip.js', '/js/gifos-icons.js',
  '/js/gifos-themes.js', '/js/gifos-store.js', '/js/irl-apps.js', '/js/sample-apps.js',
  '/js/desktop.js', '/js/runtime.js', '/js/relay-config.js', '/js/sw-register.js', '/js/build.js',
  '/themes/theme.js', '/themes/icons.js', '/themes/eggs.js',
  '/gifos.key', '/version.json', '/changelog.json', '/og.png', '/manifest.webmanifest', '/icon.svg',
];

// THIS computer's theme override files. The theme cascade (gifos-themes.js)
// derives the folder from the SUBDOMAIN label and parser-blocking-loads
// themes/<label>/{theme,icons,eggs,wallpaper}.js on the desktop AND on run.html.
// If any weren't cached, opening an app offline would stall on the blocked
// <script>. Precaching them (same label logic as the cascade) makes a themed
// computer — orrery.gifos.app and friends — fully self-contained offline.
function themeOverride() {
  var parts = (self.location.hostname || '').split('.');
  var label = (parts.length >= 3 && parts[0] !== 'www') ? parts[0] : '';
  if (label === 'home' || label === 'default') label = '';
  if (!label || !/^[a-z0-9-]{1,32}$/i.test(label)) return [];
  var dir = '/themes/' + label + '/';
  return [dir + 'theme.js', dir + 'icons.js', dir + 'eggs.js', dir + 'wallpaper.js'];
}

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    // allSettled + per-file add: one missing/renamed asset can't abort the whole
    // precache (a half-cached shell is still better than none).
    await Promise.allSettled(CORE.concat(themeOverride()).map(function (u) {
      return cache.add(new Request(u, { cache: 'reload' }));
    }));
    // First-ever install (no prior shell): activate immediately so the very first
    // visit is offline-ready. An UPDATE — a new sw.js landing over an existing
    // shell — deliberately does NOT skipWaiting: it stays WAITING until the user
    // opts in from Settings → Advanced → Version. That's what stops a deploy from
    // updating a running computer without the user's knowledge.
    var keys = await caches.keys();
    var hadShell = keys.some(function (k) { return k.indexOf('gifos-shell-') === 0 && k !== CACHE; });
    if (!hadShell) await self.skipWaiting();
  })());
});

// The desktop drives the opt-in update from Settings → Advanced → Version:
//  - 'gifos-apply-update'  : a newer sw.js is WAITING — take over now (the user
//                            asked to upgrade). activate sweeps the old cache.
//  - 'gifos-refresh-shell' : re-fetch EVERY shell asset fresh into the cache,
//                            even under the same worker (covers a deploy that
//                            changed js/css/html but not sw.js). Acks each client
//                            so the page can reload into the whole new build.
self.addEventListener('message', function (e) {
  var data = e.data || {};
  if (data.type === 'gifos-apply-update') { self.skipWaiting(); return; }
  if (data.type === 'gifos-refresh-shell') {
    e.waitUntil((async function () {
      var cache = await caches.open(CACHE);
      await Promise.allSettled(CORE.concat(themeOverride()).map(function (u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
          if (r && r.ok) return cache.put(u, r);
        }).catch(function () {});
      }));
      var cs = await self.clients.matchAll();
      cs.forEach(function (c) { c.postMessage({ type: 'gifos-shell-refreshed' }); });
    })());
  }
});

// Resolve a fetch, but never hang: if the network hasn't answered in `ms`, give
// up and resolve null (a stalled airplane-mode socket must not block a parser-
// blocking <script> request forever). Successful responses are cached; failures
// and timeouts resolve null so the caller can fall back.
function raceNetwork(req, cache, ms) {
  return new Promise(function (resolve) {
    var settled = false;
    var t = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, ms);
    fetch(req).then(function (res) {
      if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
        cache.put(req, res.clone()).catch(function () {});
      }
      if (!settled) { settled = true; clearTimeout(t); resolve(res); }
    }, function () { if (!settled) { settled = true; clearTimeout(t); resolve(null); } });
  });
}

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) {
      if (k.indexOf('gifos-shell-') === 0 && k !== CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  // Cross-origin (relay wss handled elsewhere, CORS proxy, AI, GitHub, key
  // servers): never intercept. They behave exactly as before — working online,
  // failing offline with the app's own messaging.
  if (url.origin !== self.location.origin) return;

  // version.json + changelog.json drive the OPT-IN update flow: always try the
  // network so a reconnected device can SEE that a new release (and its notes)
  // exist; fall back to cache offline. These are data the desktop reads to decide
  // whether to OFFER an update — they never change the running shell themselves.
  if (url.pathname === '/version.json' || url.pathname === '/changelog.json') {
    e.respondWith(fetch(req).then(function (r) {
      if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ch) { ch.put(url.pathname, c); }); }
      return r;
    }).catch(function () { return caches.match(url.pathname); }));
    return;
  }

  // Everything else same-origin: CACHE-FIRST with NO background revalidation. The
  // installed shell is authoritative — a refresh or hard-refresh serves the SAME
  // build every time, so the computer is never updated behind the user's back.
  // Updating is an explicit choice in Settings → Advanced → Version, which either
  // activates a waiting worker or sends 'gifos-refresh-shell' to re-pull the whole
  // shell. (Only assets never cached before — e.g. an archived /versions/ build
  // opened for the first time — reach the network here, and get cached for offline.)
  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    var cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;                     // installed shell wins; no silent refresh
    var fresh = await raceNetwork(req, cache, 4000);
    if (fresh) return fresh;
    // Nothing cached and the network didn't answer (offline / stalled). Degrade
    // so a request can NEVER hang the page:
    //  - a navigation → the app shell (its scripts boot from cache/IndexedDB);
    //  - a script/style (e.g. a theme-override the cascade document.writes) →
    //    an EMPTY 200 so the parser-blocking <script> resolves instead of
    //    stalling the tab; a missing override simply falls back to the base;
    //  - anything else → a clean error the caller can handle.
    if (req.mode === 'navigate') { var idx = await cache.match('/index.html'); if (idx) return idx; }
    if (req.destination === 'script' || /\.m?js(\?|$)/.test(url.pathname)) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'application/javascript' } });
    }
    if (req.destination === 'style' || /\.css(\?|$)/.test(url.pathname)) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
    }
    return Response.error();
  })());
});
