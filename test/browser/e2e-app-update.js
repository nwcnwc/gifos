// End-to-end for the launch-time update nudge (site/js/app-update.js, wired
// into run.html's solo boot).
//
// A store install records the catalog hash it came from (storeSha); the store
// paints "↑ Update available" when the catalog's sha256 has moved on — but only
// to someone browsing the store. This guards the other half: opening the app
// from the Home Screen says so too, and says the RIGHT thing:
//  - catalog matches                       → nothing;
//  - catalog moved on, build floor met     → "Update available" linking to /store/<slug>;
//  - catalog moved on, floor ABOVE us      → "update GifOS first", naming the release
//                                            that carries the floor (or edge if none does);
//  - not a store install (no storeSha)     → nothing, however stale the catalog looks;
//  - the nudge is said ONCE per (app, catalog hash, outcome), and never fetches an App GIF;
//  - the decision is exported (GifOS.appUpdate.check) so it can be asserted
//    directly, not inferred from what happened to render.
//
// Needs: static server on 8099 serving site/.
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SITE = path.join(__dirname, '..', '..', 'site');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// serviceWorkers:'block' works by injecting `if (navigator.serviceWorker) …`
// into EVERY frame — and in the sandboxed app iframe (opaque origin) that READ
// throws a SecurityError. It is Playwright's own snippet failing, not site or
// app code, so it never counts as a page error (same filter as
// drills/e2e-meet-app-guest-perms.js).
const pwNoise = (e) => /serviceWorker/.test(e.message);

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(SITE, 'apps', 'index.json'), 'utf8'));
  const SLUG = '2048';
  const real = index.apps.find((a) => a.slug === SLUG);
  check('the fixture app is in the committed catalog', !!real && /^[a-f0-9]{64}$/.test(real.sha256));
  const bytes = fs.readFileSync(appGif(SLUG));
  const NEW_SHA = 'f'.repeat(64);

  const browser = await chromium.launch({ executablePath: CHROME });
  // serviceWorkers:'block' — the seed page (index.html) registers the offline
  // worker, and a worker-served fetch never passes through context.route: the
  // test's catalog/build/version stubs would silently stop applying and every
  // launch would see the REAL index.json (same sha as the install → no nudge).
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let gifFetches = 0;
  context.on('request', (r) => { if (/\/apps\/[^/]+\/[^/]+\.gif/.test(r.url())) gifFetches++; });

  // A catalog the test controls. `catalog` is the served index.json; `build`
  // is what build.js says this computer is; `versions` is version.json.
  let served = { catalog: index, build: 0, versions: null };
  await context.route(/\/apps\/index\.json(\?|$)/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(served.catalog) }));
  await context.route(/\/js\/build\.js(\?|$)/, (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.GIFOS_BUILD = ' + served.build + ';' }));
  await context.route(/\/version\.json(\?|$)/, (route) => served.versions
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(served.versions) })
    : route.continue());

  // Seed a desktop with two copies of the same app: one that came from the
  // store (storeSha stamped) and one the player brought themselves.
  const seed = await context.newPage();
  seed.on('pageerror', (e) => { if (!pwNoise(e)) console.log('  [pageerror]', e.message); });
  await seed.goto(BASE + '/index.html');
  await seed.waitForSelector('.icon', { timeout: 15000 });
  const ids = await seed.evaluate(async ({ b64, sha, appId }) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const mk = async (extra) => {
      const id = GifOS.store.uid('file');
      await GifOS.store.putFile(Object.assign({ id, name: '2048.gif', bytes: raw, kind: 'gif', isApp: true, appId, mime: 'image/gif' }, extra));
      return id;
    };
    return { store: await mk({ storeSha: sha }), own: await mk({}) };
  }, { b64: bytes.toString('base64'), sha: real.sha256, appId: real.appId });
  await seed.close();

  const open = async (fileId) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => { if (!pwNoise(e)) console.log('  [pageerror]', e.message); });
    await page.goto(BASE + '/run.html#id=' + encodeURIComponent(fileId));
    await page.waitForSelector('body.has-app', { timeout: 15000 });
    await sleep(1200);
    return page;
  };
  const toast = (page) => page.evaluate(() => {
    const el = document.getElementById('appupd');
    return el ? { kind: el.getAttribute('data-kind'), slug: el.getAttribute('data-slug'), text: el.textContent, href: (el.querySelector('a') || {}).getAttribute ? el.querySelector('a').getAttribute('href') : null } : null;
  });
  const withCatalog = (patch) => ({ ...index, apps: index.apps.map((a) => (a.slug === SLUG ? { ...a, ...patch } : a)) });

  // ---- 1. catalog matches the install: silence ------------------------------
  let p = await open(ids.store);
  check('the app boots and mounts', await p.evaluate(() => document.body.classList.contains('has-app')));
  check('catalog hash == storeSha: no nudge', (await toast(p)) === null);
  const d0 = await p.evaluate(async (id) => GifOS.appUpdate.check(await GifOS.store.getFile(id)), ids.store);
  check('…and the decision says null', d0 === null);
  await p.close();

  // ---- 2. catalog moved on, floor met: "Update available" → /store/<slug> ---
  served = { catalog: withCatalog({ sha256: NEW_SHA }), build: 0, versions: null };
  p = await open(ids.store);
  let t = await toast(p);
  check('a newer catalog hash nudges at launch', !!t && t.kind === 'app', JSON.stringify(t));
  check('the nudge names the app and offers Update — keeps your data', !!t && /Update available for 2048/.test(t.text) && /keeps your data/.test(t.text));
  check('Update links to the store listing, not to the GIF', !!t && t.href === '/store/' + SLUG);
  check('an unknown build (0, local checkout) never blocks the offer', !!t && t.kind === 'app');
  await p.close();

  // Once per catalog hash: a second launch stays quiet…
  p = await open(ids.store);
  check('the same catalog hash is not nudged twice', (await toast(p)) === null);
  // …but the decision is still there for anything that asks.
  const d1 = await p.evaluate(async (id) => GifOS.appUpdate.check(await GifOS.store.getFile(id)), ids.store);
  check('check() still reports the update when the nudge has been seen', !!d1 && d1.kind === 'app' && d1.slug === SLUG);
  await p.close();

  // A NEWER hash again is news again.
  served = { catalog: withCatalog({ sha256: 'e'.repeat(64) }), build: 0, versions: null };
  p = await open(ids.store);
  check('a further catalog change is nudged afresh', (await toast(p) || {}).kind === 'app');
  await p.close();

  // ---- 3. floor above this computer: UPDATE GIFOS FIRST ----------------------
  served = {
    catalog: withCatalog({ sha256: 'd'.repeat(64), minBuild: 1500 }),
    build: 1365,
    versions: { current: '0.9.9', edgeBuild: 1600, builds: { '0.9.5': 1095, '0.9.9': 1365, '0.9.10': 1520, '0.9.11': 1610 } },
  };
  p = await open(ids.store);
  t = await toast(p);
  check('a floor above the running build nudges the OTHER way', !!t && t.kind === 'gifos', JSON.stringify(t));
  check('…it says the new version needs a newer GifOS build', !!t && /needs GifOS build 1500 or newer/.test(t.text));
  check('…it says update GifOS FIRST, then the app', !!t && /Update GifOS first/.test(t.text) && /then update the app/.test(t.text));
  check('…naming the OLDEST release that carries the floor', !!t && /release 0\.9\.10 or later/.test(t.text));
  check('…and does NOT offer the app update link', !!t && t.href === null);
  const d2 = await p.evaluate(async (id) => GifOS.appUpdate.check(await GifOS.store.getFile(id)), ids.store);
  check('the decision carries need + release', !!d2 && d2.kind === 'gifos' && d2.need === 1500 && d2.rel === '0.9.10');
  await p.close();

  // The same catalog, after the player updated GifOS: now it's the app's turn.
  served.build = 1520;
  p = await open(ids.store);
  t = await toast(p);
  check('once GifOS meets the floor the same catalog hash offers the app update', !!t && t.kind === 'app' && t.href === '/store/' + SLUG, JSON.stringify(t));
  await p.close();

  // Floor no release carries: say edge, never "move to a release".
  served = { catalog: withCatalog({ sha256: 'c'.repeat(64), minBuild: 1700 }), build: 1365, versions: served.versions };
  p = await open(ids.store);
  t = await toast(p);
  check('a floor above every release points at the edge build', !!t && t.kind === 'gifos' && /only in the unreleased edge build/.test(t.text) && !/release .* or later/.test(t.text), JSON.stringify(t));
  await p.close();

  // ---- 4. not a store install: never nudged ---------------------------------
  p = await open(ids.own);
  check('a copy the player brought themselves (no storeSha) is never nudged', (await toast(p)) === null);
  await p.close();

  // ---- 5. a missing catalog is silence, not an error -------------------------
  served = { catalog: null, build: 0, versions: null };
  await context.unroute(/\/apps\/index\.json(\?|$)/);
  await context.route(/\/apps\/index\.json(\?|$)/, (route) => route.fulfill({ status: 404, body: 'gone' }));
  let errs = 0;
  p = await context.newPage();
  p.on('pageerror', (e) => { if (!pwNoise(e)) errs++; });
  await p.goto(BASE + '/run.html#id=' + encodeURIComponent(ids.store));
  await p.waitForSelector('body.has-app', { timeout: 15000 });
  await sleep(1200);
  check('a catalog that will not load costs the launch nothing (no nudge, no error)', (await toast(p)) === null && errs === 0);
  await p.close();

  check('deciding never fetched an App GIF', gifFetches === 0, gifFetches + ' gif request(s)');

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
