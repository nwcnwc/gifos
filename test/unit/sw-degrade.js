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
// net: the stub network. Default is OFFLINE (a rejecting fetch, so
// raceNetwork/revalidate resolve null without waiting out their 4s timeout);
// pass a function to answer a request with a real server response instead.
// Returns dispatch(pathname, { mode, destination }) -> Response
function loadWorker(cached, net) {
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
    fetch: net || (() => Promise.reject(new Error('offline'))),
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

  // 5. A REDIRECT IS AN ANSWER, NOT A FAILURE.
  //    GitHub Pages 301s every directory URL typed without its trailing slash,
  //    so gifos.app/go/<slug> (a shared app link, minus one character) comes
  //    back 301 → /go/<slug>/. A navigation Request carries redirect:'manual',
  //    so the worker sees an OPAQUEREDIRECT — type 'opaqueredirect', status 0,
  //    ok false — which reads exactly like a dead network and is not one.
  //    Falling back to the cached shell for it walked the same road as the
  //    404 bug in revalidate(): shell at /go/<slug> → its channel loader
  //    rewrites to /versions/<v>/go/<slug> → exists nowhere → bare desktop,
  //    the app silently dropped. Measured live 2026-08-24 against 0.9.12, and
  //    only for a visitor who already had the worker installed — a first visit
  //    worked, which is what made it look like the link was at fault.
  {
    // What fetch() hands a service worker for a manual-redirect navigation.
    // Response cannot be constructed with status 0, and only these fields are
    // ever read, so this is the honest shape rather than a real Response.
    const opaqueRedirect = () => {
      const r = { ok: false, status: 0, type: 'opaqueredirect', redirected: true, clone() { return this; } };
      return Promise.resolve(r);
    };
    const dispatch = loadWorker({ '/index.html': EDGE_SHELL }, opaqueRedirect);
    const res = await dispatch('/go/2048', NAV);
    check('a navigation answered with a redirect is handed back for the browser to follow',
      !!res && res.type === 'opaqueredirect', res && { type: res.type, status: res.status });
    const body = res && typeof res.text === 'function' ? await res.text() : '';
    check('…and is NEVER papered over with the cached shell', body.indexOf('EDGE ROOT SHELL') === -1);
  }

  // 6. The fence around case 5: only 404 and redirects pass. A transient server
  //    error must still serve the last good build, and a SUBRESOURCE must not be
  //    handed an opaqueredirect at all — its request is redirect:'follow', and
  //    respondWith would throw a TypeError rather than render anything.
  {
    const boom = () => Promise.resolve(new Response('gateway', { status: 502 }));
    const dispatch = loadWorker({ '/index.html': EDGE_SHELL }, boom);
    const body = await (await dispatch('/meet/somewhere', NAV)).text();
    check('a 5xx navigation still falls back to the cached shell (not the error page)',
      body.indexOf('EDGE ROOT SHELL') !== -1, body.slice(0, 60));
  }
  {
    const opaqueRedirect = () => Promise.resolve({ ok: false, status: 0, type: 'opaqueredirect', clone() { return this; } });
    const dispatch = loadWorker({ '/js/desktop.js': 'CACHED SCRIPT' }, opaqueRedirect);
    const res = await dispatch('/js/desktop.js', { destination: 'script' });
    const body = res && typeof res.text === 'function' ? await res.text() : '';
    check('a SUBRESOURCE redirect is not passed through — it falls back to cache',
      body === 'CACHED SCRIPT', body.slice(0, 60));
  }

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL — harness threw  ' + e.message); process.exit(1); });
