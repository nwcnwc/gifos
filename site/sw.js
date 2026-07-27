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
 * Update path — TWO policies, split by channel (the fetch handler decides by URL:
 * /versions/ is a release, everything else is the edge root):
 *
 *  - RELEASE / pinned users live entirely under /versions/<x.y.z>/, which are
 *    IMMUTABLE snapshots: cache-first forever, NO background revalidation. Updates
 *    are OPT-IN and never happen behind their back — a plain (or hard) refresh
 *    serves the SAME installed shell, and a new sw.js installs but WAITS (it does
 *    not skipWaiting over an existing shell). The desktop learns a release exists
 *    by fetching version.json + changelog.json network-first, and shows it in
 *    Settings → Advanced → Version with a changelog (critical items called out).
 *    Only when the user chooses "Upgrade this computer" does the page activate the
 *    waiting worker or send 'gifos-refresh-shell' to re-fetch the ENTIRE shell
 *    fresh (the computer is far more than index.html) and reload.
 *
 *  - EDGE users (localStorage gifos_channel='edge') are served from the site ROOT
 *    and have asked to track the newest build on GitHub Pages. Root assets are
 *    therefore NETWORK-FIRST with revalidation: every load issues a conditional GET
 *    (If-None-Match / If-Modified-Since), so a changed file is regrabbed and an
 *    unchanged one comes back 304 and reuses the cached bytes (no re-download —
 *    "caching is fine if the files haven't changed"). Offline or a stalled socket
 *    falls back to cache, so edge still boots and still works in airplane mode.
 *    sw-register.js lets a freshly-installed worker take over on its own for edge
 *    (no forced reload, so a live meeting is never interrupted) so this strategy
 *    itself reaches existing edge users without a manual upgrade step.
 */
'use strict';

var SHELL_VERSION = 'v7';
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

// Network-FIRST with conditional revalidation, bounded by a timeout — the edge
// channel's strategy. cache:'no-cache' forces the browser to check the server
// every time (If-None-Match / If-Modified-Since): a 304 returns the cached bytes
// with no download, a changed asset downloads fresh. Fresh OK responses are put
// back in the cache for offline. Resolves null on non-OK, error, or timeout so
// the caller falls back to the cache — a stalled socket must never hang a parser-
// blocking <script>, and a transient 5xx should serve the last good build.
// `pass404` — a NAVIGATION whose server answer is 404 must be delivered as-is,
// never papered over. On GitHub Pages the 404 body IS 404.html: the pretty-link
// router that turns /meet/<room>, /call/<room> and /join/<code> into a real
// page. Resolving null for it sent the caller to the cached shell instead, whose
// channel loader then rewrote the pretty path to /versions/<v>/meet/<room> —
// a path that exists nowhere — and every invite link landed on the desktop with
// the meeting silently dropped. Only 404 passes through, so a transient 5xx
// still falls back to the last good build as intended.
function revalidate(req, cache, ms, pass404) {
  return new Promise(function (resolve) {
    var settled = false;
    var t = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, ms);
    var rr;
    try { rr = new Request(req, { cache: 'no-cache' }); } catch (e) { rr = req; }
    fetch(rr).then(function (res) {
      var ok = res && res.ok && (res.type === 'basic' || res.type === 'default');
      if (ok) cache.put(req, res.clone()).catch(function () {});
      var routed = !ok && pass404 && res && res.status === 404;
      if (!settled) { settled = true; clearTimeout(t); resolve(ok || routed ? res : null); }
    }, function () { if (!settled) { settled = true; clearTimeout(t); resolve(null); } });
  });
}

// Last-resort response when nothing is cached AND the network didn't answer
// (offline / stalled), so a request can NEVER hang the page:
//  - a navigation → the app shell (its scripts boot from cache/IndexedDB);
//  - a script/style (e.g. a theme-override the cascade document.writes) → an
//    EMPTY 200 so the parser-blocking <script> resolves instead of stalling the
//    tab; a missing override simply falls back to the base;
//  - anything else → a clean error the caller can handle.
async function degrade(req, url, cache) {
  if (req.mode === 'navigate') { var idx = await cache.match('/index.html'); if (idx) return idx; }
  if (req.destination === 'script' || /\.m?js(\?|$)/.test(url.pathname)) {
    return new Response('', { status: 200, headers: { 'Content-Type': 'application/javascript' } });
  }
  if (req.destination === 'style' || /\.css(\?|$)/.test(url.pathname)) {
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
  }
  return Response.error();
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

  // Archived release builds under /versions/<x.y.z>/ are IMMUTABLE snapshots:
  // CACHE-FIRST with NO background revalidation. A pinned/release user lives
  // entirely under /versions/, so a refresh or hard-refresh serves the SAME build
  // every time — the computer is never updated behind their back; the opt-in flow
  // (Settings → Advanced → Version) is the only thing that moves it. (Only a build
  // never cached before — e.g. an archived version opened for the first time —
  // reaches the network here, and gets cached for offline.)
  if (url.pathname.lastIndexOf('/versions/', 0) === 0) {
    e.respondWith((async function () {
      var cache = await caches.open(CACHE);
      var cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;                   // immutable snapshot wins; no silent refresh
      var fresh = await raceNetwork(req, cache, 4000);
      if (fresh) return fresh;
      return degrade(req, url, cache);
    })());
    return;
  }

  // Everything else is the EDGE (site-root) shell. A visitor on the edge channel
  // is served from the root (release users are redirected to /versions/), and edge
  // means "track the newest build on GitHub Pages." So NETWORK-FIRST with
  // revalidation: a conditional GET checks the server every load — an unchanged
  // asset comes back 304 and reuses the cache (no re-download), a changed one is
  // regrabbed fresh. Fall back to the cache when offline or too slow, so the shell
  // still boots and airplane mode still works.
  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    // Navigations let a 404 through: on Pages that body is 404.html, the
    // pretty-link router. See revalidate()'s note.
    var fresh = await revalidate(req, cache, 4000, req.mode === 'navigate');
    if (fresh) return fresh;
    var cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;                      // offline / stalled → last good build
    return degrade(req, url, cache);
  })());
});
