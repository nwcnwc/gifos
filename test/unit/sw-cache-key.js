// ONE CACHE KEY PER FILE, AND OFFLINE SERVES THE NEWEST COPY THIS DEVICE RAN.
//
// pages.yml stamps `?v=<sha>` onto every local css/js reference, so each deploy
// asks for the same file under a new URL. sw.js used to cache by full URL and
// fall back offline with ignoreSearch — which returns the FIRST matching entry:
// the precache from the day the worker installed. Measured on a plane: an edge
// computer that had run build 2237 all week booted in airplane mode as build
// 1845, and every store app whose minBuild was newer refused to run.
//
// Like sw-degrade.js this drives the REAL fetch handler against a stateful
// cache stub, so a refactor that keeps the words and changes the keys is caught.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

const ORIGIN = 'https://gifos.app';

// A Cache-API stub that keeps insertion order (as the real one does) and
// honours ignoreSearch the way the platform does: first match wins.
function makeCache(seed) {
  const store = new Map();
  const norm = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGIN);
  for (const [k, v] of Object.entries(seed || {})) store.set(norm(k).href, v);
  return {
    store,
    match: async (r, opts) => {
      const u = norm(r);
      for (const [href, body] of store) {
        const e = new URL(href);
        if (e.href === u.href || (opts && opts.ignoreSearch && e.pathname === u.pathname)) return new Response(body, { status: 200 });
      }
      return undefined;
    },
    put: async (r, res) => { store.set(norm(r).href, await res.text()); },
    delete: async (r) => store.delete(norm(r).href),
    keys: async () => [...store.keys()].map((h) => new Request(h)),
    add: async () => {},
    addAll: async () => {},
  };
}

function loadWorker(cache, net) {
  const listeners = {};
  const self = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    location: { origin: ORIGIN, hostname: 'gifos.app' },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
  };
  const sandbox = {
    self, caches: { open: async () => cache, keys: async () => ['gifos-shell-test'], delete: async () => {}, match: async (r) => cache.match(r) },
    Response, Request, URL, Promise, console, setTimeout, clearTimeout,
    fetch: net || (() => Promise.reject(new Error('offline'))),
  };
  sandbox.self.caches = sandbox.caches;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site', 'sw.js'), 'utf8'), sandbox, { filename: 'sw.js' });
  const dispatch = (pathname, init) => {
    const req = new Request(ORIGIN + pathname, { method: 'GET' });
    const view = { url: req.url, method: 'GET', mode: (init && init.mode) || 'no-cors', destination: (init && init.destination) || '' };
    let out = null;
    const ev = { request: view, respondWith: (p) => { out = p; }, waitUntil: () => {} };
    for (const fn of listeners.fetch || []) fn(ev);
    return out ? Promise.resolve(out) : Promise.resolve(null);
  };
  const activate = async () => {
    let p = null;
    for (const fn of listeners.activate || []) fn({ waitUntil: (x) => { p = x; } });
    await p;
  };
  return { dispatch, activate };
}

const server = (files) => (r) => {
  const u = new URL(typeof r === 'string' ? r : r.url, ORIGIN);
  const body = files[u.pathname];
  return Promise.resolve(body === undefined ? new Response('not here', { status: 404 }) : new Response(body, { status: 200 }));
};

(async () => {
  // 1. THE BUG. The precache holds build 1845; the device then runs online at
  //    2237 and 2300 (two deploys, two ?v= stamps); airplane mode asks with a
  //    third stamp. It must get 2300 — the newest copy this device ran.
  {
    const cache = makeCache({ '/js/build.js': 'GIFOS_BUILD = 1845' });
    const online = loadWorker(cache, server({ '/js/build.js': 'GIFOS_BUILD = 2237' }));
    await (await online.dispatch('/js/build.js?v=aaaa1111', { destination: 'script' })).text();
    const online2 = loadWorker(cache, server({ '/js/build.js': 'GIFOS_BUILD = 2300' }));
    await (await online2.dispatch('/js/build.js?v=bbbb2222', { destination: 'script' })).text();
    const keys = [...cache.store.keys()].map((h) => new URL(h).pathname + new URL(h).search);
    check('two deploys leave ONE cache key for the file, the bare path', keys.length === 1 && keys[0] === '/js/build.js', keys);
    const offline = loadWorker(cache);
    const body = await (await offline.dispatch('/js/build.js?v=cccc3333', { destination: 'script' })).text();
    check('offline serves the NEWEST copy this device ran, not the install-day precache', body === 'GIFOS_BUILD = 2300', body);
  }

  // 2. A navigation with a cache-buster (the erase reload's ?ts=, ?edge&ts=)
  //    lands on the same key as the bare page, online and offline.
  {
    const cache = makeCache({});
    const online = loadWorker(cache, server({ '/': '<!-- shell 2300 -->', '/index.html': '<!-- shell 2300 -->' }));
    await (await online.dispatch('/?edge&ts=1', { mode: 'navigate', destination: 'document' })).text();
    const keys = [...cache.store.keys()].map((h) => new URL(h).pathname + new URL(h).search);
    check('a cache-busted navigation is keyed by its bare path', keys.length === 1 && keys[0] === '/', keys);
    const offline = loadWorker(cache);
    const body = await (await offline.dispatch('/?edge&ts=2', { mode: 'navigate', destination: 'document' })).text();
    check('…and is served from that key offline', body === '<!-- shell 2300 -->', body);
  }

  // 3. A 404 ONLINE is the answer. The server says the file is gone: the
  //    browser sees a 404 (not degrade()'s empty 200), and the cached copy of
  //    the deleted file is dropped so it is not served forever.
  {
    const cache = makeCache({ '/js/gone.js': 'old module' });
    const online = loadWorker(cache, server({}));
    const res = await online.dispatch('/js/gone.js?v=dddd4444', { destination: 'script' });
    check('a script the server 404s is answered 404 online, never an empty 200', !!res && res.status === 404, res && res.status);
    check('…and its stale cached copy is evicted', !cache.store.has(ORIGIN + '/js/gone.js'), [...cache.store.keys()]);
    const offline = loadWorker(makeCache({}));
    const off = await offline.dispatch('/js/gone.js', { destination: 'script' });
    check('OFFLINE, an uncached script still resolves as an empty 200 (no parser stall)', !!off && off.status === 200 && (await off.text()) === '');
    const nav = loadWorker(makeCache({ '/index.html': '<!-- shell -->' }), server({ '/404.html': '<!-- router -->' }));
    const r404 = await nav.dispatch('/meet/somewhere', { mode: 'navigate', destination: 'document' });
    check('a navigation 404 still passes through (the pretty-link router lives in 404.html)', !!r404 && r404.status === 404);
  }

  // 4. activate sweeps the query-keyed twins an older worker left behind.
  {
    const cache = makeCache({ '/js/desktop.js': 'new', '/js/desktop.js?v=old1': 'old', '/js/desktop.js?v=old2': 'older', '/apps/index.json': '{}', '/apps/index.json?ts=1': '{}' });
    const w = loadWorker(cache, server({}));
    await w.activate();
    const keys = [...cache.store.keys()].map((h) => new URL(h).pathname + new URL(h).search).sort();
    check('activate deletes every query-keyed twin and keeps the bare keys', keys.join(' ') === '/apps/index.json /js/desktop.js', keys);
  }

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
