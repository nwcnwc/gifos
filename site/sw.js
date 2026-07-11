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
 * Update path: bump SHELL_VERSION on a release. A changed sw.js reinstalls, the
 * new shell precaches under a new cache, old caches are swept on activate, and
 * version.json is always fetched network-first so the desktop's existing update
 * nudge still fires the moment you're back online.
 */
'use strict';

var SHELL_VERSION = 'v2';
var CACHE = 'gifos-shell-' + SHELL_VERSION;

// The universal shell — identical on gifos.app and every theme subdomain. Per-
// computer extras (archived builds under /versions/) are runtime-cached on first
// visit, so a computer you have actually opened keeps working offline too.
var CORE = [
  '/', '/index.html', '/boot.html', '/run.html', '/meet.html', '/sign.html', '/about.html', '/404.html',
  '/css/desktop.css',
  '/js/gifos-gif.js', '/js/gifos-sign.js', '/js/gifos-zip.js', '/js/gifos-icons.js',
  '/js/gifos-themes.js', '/js/gifos-store.js', '/js/irl-apps.js', '/js/sample-apps.js',
  '/js/desktop.js', '/js/runtime.js', '/js/relay-config.js', '/js/sw-register.js',
  '/themes/theme.js', '/themes/icons.js', '/themes/eggs.js',
  '/gifos.key', '/version.json', '/og.png', '/manifest.webmanifest', '/icon.svg',
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
    await self.skipWaiting();
  })());
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
  // Cross-origin (relay wss handled elsewhere, CORS proxy, AI, MCP, GitHub, key
  // servers): never intercept. They behave exactly as before — working online,
  // failing offline with the app's own messaging.
  if (url.origin !== self.location.origin) return;

  // The version file drives the in-app update nudge: always try the network so a
  // reconnected device sees a new release immediately; fall back to cache offline.
  if (url.pathname === '/version.json') {
    e.respondWith(fetch(req).then(function (r) {
      if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ch) { ch.put('/version.json', c); }); }
      return r;
    }).catch(function () { return caches.match('/version.json'); }));
    return;
  }

  // Everything else same-origin: stale-while-revalidate — serve the cached copy
  // instantly (so offline works and loads are fast), and refresh it in the
  // background whenever the network is reachable.
  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    var cached = await cache.match(req, { ignoreSearch: true });
    if (cached) { raceNetwork(req, cache, 4000); return cached; }  // detached refresh; never blocks
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
