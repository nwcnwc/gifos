// A DEGRADE MUST NEVER CROSS THE CHANNEL BOUNDARY (bug ledger #3).
//
// sw.js's degrade() is the last-resort answer when nothing is cached AND the
// network did not reply. It used to hand the ROOT /index.html to EVERY
// navigation — including a navigation to /versions/<x.y.z>/…, i.e. the edge
// shell served to a visitor pinned to a release. That shell then runs its own
// channel loader and re-routes the visitor by whatever page map it was frozen
// with; once page names move, the redirect lands on a path that exists
// nowhere. site/versions/0.9.1/run.html is a hard 404 reachable exactly this
// way, and it reads as a broken site rather than a device that is offline.
//
// This exercises the REAL fetch handler rather than reading the source: the
// worker is evaluated against stub `self`/`caches`/`fetch`, the fetch event is
// dispatched for real, and the response that comes back out is inspected. A
// source scan would sail past a refactor that kept the words and changed the
// behaviour — which is the failure mode this whole file exists to prevent.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

const ORIGIN = 'https://gifos.app';

// ---- the worker, loaded against stubs ---------------------------------------
// cached: { '<pathname>': '<body>' } — what this device has saved.
// Returns dispatch(pathname, { mode, destination }) -> Response
function loadWorker(cached) {
  const store = new Map(Object.entries(cached));
  const key = (r) => {
    const u = typeof r === 'string' ? r : r.url;
    try { return new URL(u, ORIGIN).pathname; } catch (e) { return u; }
  };
  const cache = {
    match: async (r) => { const b = store.get(key(r)); return b === undefined ? undefined : new Response(b, { status: 200, headers: { 'Content-Type': 'text/html' } }); },
    put: async () => {},
    add: async () => {},
    addAll: async () => {},
  };
  const listeners = {};
  const self = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    location: { origin: ORIGIN, hostname: 'gifos.app' },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
  };
  const sandbox = {
    self, caches: { open: async () => cache, keys: async () => [], delete: async () => {}, match: async (r) => cache.match(r) },
    Response, Request, URL, Promise, console, setTimeout, clearTimeout,
    // OFFLINE, and instantly so: a rejecting fetch makes raceNetwork/revalidate
    // resolve null without waiting out their 4s timeout.
    fetch: () => Promise.reject(new Error('offline')),
  };
  sandbox.self.caches = sandbox.caches;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site', 'sw.js'), 'utf8'), sandbox, { filename: 'sw.js' });
  check.loaded = true;
  return (pathname, init) => {
    const req = new Request(ORIGIN + pathname, { method: 'GET' });
    // Request in node has no settable mode/destination — the worker only reads
    // them, so shadow them on a plain view of the request.
    const view = { url: req.url, method: 'GET', mode: (init && init.mode) || 'no-cors', destination: (init && init.destination) || '' };
    let out = null;
    const ev = { request: view, respondWith: (p) => { out = p; }, waitUntil: () => {} };
    for (const fn of listeners.fetch || []) fn(ev);
    return out ? Promise.resolve(out) : Promise.resolve(null);
  };
}

const NAV = { mode: 'navigate', destination: 'document' };
const EDGE_SHELL = '<!-- EDGE ROOT SHELL -->';
const PINNED_SHELL = '<!-- 0.9.4 SNAPSHOT SHELL -->';

(async () => {
  // 1. THE BUG. A pinned visitor is offline for a build this device never saved,
  //    and the edge shell IS cached. The edge shell must not be substituted.
  {
    const dispatch = loadWorker({ '/index.html': EDGE_SHELL });
    const res = await dispatch('/versions/0.9.1/index.html', NAV);
    const body = res ? await res.text() : '';
    check('a /versions/ navigation is NEVER answered with the edge root shell', body.indexOf('EDGE ROOT SHELL') === -1, body.slice(0, 60));
    check('…it says the pinned build is not installed instead', /0\.9\.1/.test(body) && /offline/i.test(body));
    check('…and it is a rendered page, not a hang or a network error', !!res && res.status === 200);
  }

  // 2. A pinned visitor who HAS installed their build still boots offline —
  //    from that snapshot's own shell.
  {
    const dispatch = loadWorker({ '/index.html': EDGE_SHELL, '/versions/0.9.4/index.html': PINNED_SHELL });
    const body = await (await dispatch('/versions/0.9.4/run.html', NAV)).text();
    check('an INSTALLED snapshot degrades to its OWN index.html', body.indexOf('0.9.4 SNAPSHOT SHELL') !== -1, body.slice(0, 60));
  }

  // 3. The whole point of the worker: an edge visitor with no connection still
  //    gets their desktop. (A regression here would be worse than the bug.)
  {
    const dispatch = loadWorker({ '/index.html': EDGE_SHELL });
    const body = await (await dispatch('/meet/somewhere', NAV)).text();
    check('a ROOT navigation still degrades to the root shell (offline desktop lives)', body.indexOf('EDGE ROOT SHELL') !== -1, body.slice(0, 60));
  }

  // 4. Parser-blocking loads must still resolve rather than stall the tab —
  //    including under /versions/, where the new branch must not swallow them.
  {
    const dispatch = loadWorker({});
    const js = await dispatch('/versions/0.9.1/themes/orrery/wallpaper.js', { destination: 'script' });
    check('a missing script still resolves as an empty 200 (no parser stall)', !!js && js.status === 200 && (await js.text()) === '');
    const css = await dispatch('/css/desktop.css', { destination: 'style' });
    check('a missing stylesheet still resolves as an empty 200', !!css && css.status === 200);
  }

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL — harness threw  ' + e.message); process.exit(1); });
