/*
 * anyroad-app.js — boot Anyroad the way a player gets it: the BUILT GIF,
 * installed into the real GifOS desktop, opened by double-clicking its icon,
 * running in the real sandboxed runtime.
 *
 * WHY IT IS A LIB. The sequence is ~70 lines — install the packed GIF into the
 * store, render the desktop, double-click, wait for the app tab, bring it to
 * FRONT (a backgrounded tab is throttled to about one frame a second, and this
 * app IS its animation loop, so the car appears not to move), answer the
 * capability prompt, reach into the iframe, take a preset — and `e2e-anyroad`
 * already carried it TWICE: once for the flat-fixture boot and again, hand
 * copied, for the rolling-hills coda. A boot that exists twice drifts, exactly
 * as the fixtures would (see anyroad-fixtures.js, shared with the multiplayer
 * battery for the same reason).
 *
 *   const { launchAnyroadBrowser, openAnyroad } = require('../lib/anyroad-app');
 *   const browser = await launchAnyroadBrowser();
 *   const { fr, app, hits, mt, close } = await openAnyroad(browser);   // flat + MapTiler
 *   const hills = await openAnyroad(browser, { world: { hills: true }, maptiler: false });
 *
 * It stops once #hud is visible. The wait for the world to STREAM IN stays with
 * the caller on purpose: what "ready" means differs (terrain+roads for the flat
 * boot, four built tiles and nothing pending for hills) and those waits carry
 * assertions about the fixtures themselves.
 */
const { chromium, CHROME } = require('./pw');
const { appGif } = require('./apps');
const { TILE_PNG, routeWorld, solidTile } = require('./anyroad-fixtures');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchAnyroadBrowser() {
  return chromium.launch({
    executablePath: CHROME,
    // The gate box has no GPU; without a software rasteriser there is no WebGL
    // context at all and the app would correctly refuse to run.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

// The MapTiler arrangement: a saved key with a DELIBERATELY WRONG formulation,
// and a stub that answers the way the live API does.
//
// The key is saved as header auth under a made-up name, which is stronger than
// saving none: the provider accepts exactly one shape (?key=), so the system
// must use it no matter what the entry says. "The app should not care about the
// formulation" cuts both ways — the user never needs to get a dropdown right for
// their key to count, and a wrong dropdown cannot break a correct key. With the
// generic Bearer default the key rode a header MapTiler ignores, the base URL
// still answered (so Settings' Test passed), and every actual tile 403'd:
// satellite selected, key "working", nothing on screen.
//
// The stub used to fulfil EVERY api.maptiler.com URL with a flat 404 and assert
// only that the drape failed VISIBLY — green whether the app asked for the right
// path or a wrong one, so it guarded nothing about the path, and the app shipped
// asking for one that does not exist, 404ing on every tile while telling the
// player to check a key that was fine. Verified against api.maptiler.com on
// 2026-08-07 with a real key:
//   /tiles/satellite-v2/{z}/{x}/{y}.jpg  + ?key=  -> 200, a 512x512 JPEG
//   …the same path with @2x                       -> 404 (@2x is a /maps/ feature)
//   /tiles/satellite-v4/…  (what the docs show)   -> 404, no such tileset
//   any of them with no key                       -> 403 "Missing key"
// The bytes are a PNG because this suite already builds valid ones and the drape
// is format-agnostic — the dimension under test is the PATH.
const MT_TILE = /^\/tiles\/satellite-v2\/\d+\/\d+\/\d+\.jpg$/;
async function routeMapTiler(context) {
  const mt = {
    seen: [],
    // forest: from the satellite-forest coda on, every "photograph" is solid
    // dark canopy and untagged ground must grow woods. Until then tiles are the
    // terrarium PNG, whose grey-green reads as NOT canopy, so the drape tests
    // run with the classifier finding nothing.
    forest: false,
    // dead: the host stops answering entirely, the way it does in airplane
    // mode — and the app must say THAT, not "check the key".
    dead: false,
  };
  mt.setForest = (v) => { mt.forest = v !== false; };
  mt.setDead = (v) => { mt.dead = v !== false; };
  const FOREST_PNG = solidTile(64, 30, 72, 28);
  await context.addInitScript(() => {
    try { localStorage.setItem('gifos_api_config', JSON.stringify({ maptiler: { url: 'https://api.maptiler.com', key: 'e2e-key-123', authType: 'header', authName: 'x-totally-wrong' } })); } catch (e) {}
  });
  await context.route('**://api.maptiler.com/**', async (route) => {
    if (mt.dead) return route.abort('internetdisconnected');
    const u = new URL(route.request().url());
    const h = route.request().headers();
    const key = u.searchParams.get('key');
    mt.seen.push({ path: u.pathname, keyQ: key,
                   bearer: /Bearer/.test(h.authorization || ''),
                   wrongHeader: 'x-totally-wrong' in h });
    // no-store on every response so a re-fetch always reaches this stub instead
    // of the browser cache quietly succeeding.
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (!key) return route.fulfill({ status: 403, headers: cors, body: 'Missing key' });
    if (!MT_TILE.test(u.pathname)) return route.fulfill({ status: 404, headers: cors, body: 'Not found' });
    await route.fulfill({ status: 200, headers: cors, contentType: 'image/png',
      body: mt.forest ? FOREST_PNG : TILE_PNG });
  });
  return mt;
}

/**
 * openAnyroad(browser, opts) — a fresh context with the world fixtures routed,
 * the app installed and open, sitting at #hud on `opts.preset`.
 *
 *   opts.world     passed to routeWorld (e.g. { hills: true })
 *   opts.maptiler  register the MapTiler key+stub (default true). The hills boot
 *                  passes FALSE on purpose: it saves no key and must not have
 *                  satellite quietly available.
 *   opts.preset    landing preset, default 'Paris' (what the fixtures are built
 *                  around)
 *   opts.tag       prefix for pageerror lines, so two boots are tellable apart
 *
 * Returns { context, desk, app, fr, hits, mt, close }.
 */
async function openAnyroad(browser, opts) {
  const o = opts || {};
  const tag = o.tag ? o.tag + ' ' : '';
  const context = await browser.newContext();
  // THE SAME ARGUMENT AS THE 45 s BELOW, APPLIED WHERE IT WAS MISSING.
  // Playwright's default action timeout is 30 s, and every locator call in
  // these suites inherited it — including in-page evaluates that deliberately
  // await (the audio block samples the engine note across five 70 ms ticks and
  // a 400 ms ramp, ~750 ms of intended waiting). On a box whose main thread is
  // already rendering a 3D world through a software rasteriser, page timers
  // stretch by orders of magnitude, and that block blew 30 s on a contended
  // 4-core machine. It did not fail an assertion: it threw, which ABORTS the
  // suite and takes every check after it with it — 190 of 245 ran, and the
  // remaining 55 guards simply did not happen. A suite that dies partway is
  // worse than a red, because the tally still looks like a tally.
  //
  // 90 s is not a claim that anything should take 90 s. It is a refusal to
  // encode a guess about the machine into every locator call in the file; the
  // suite's real bound is the gate's own per-suite timeout.
  context.setDefaultTimeout(90000);
  const mt = (o.maptiler === false) ? null : await routeMapTiler(context);
  const hits = await routeWorld(context, o.world);

  const desk = await context.newPage();
  desk.on('pageerror', (e) => console.log('  [' + tag + 'desk pageerror]', e.message));
  await desk.goto(BASE + '/index.html');
  // Generous: this suite renders a 3D world in a second tab, so it tends to run
  // on machines already doing something. A contended 4-core box took 20 s to
  // paint the Home Screen — which is slow, not broken, and a tight timeout here
  // reports it as a product failure.
  await desk.waitForSelector('.icon', { timeout: 45000 });
  await sleep(400);

  // Install the built GIF exactly as a downloaded app would land.
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');
  await desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Anyroad.gif', bytes, kind: 'gif', isApp: true, appId: 'anyroad', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Anyroad.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'Anyroad.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [' + tag + 'app pageerror]', e.message));
  // A backgrounded tab has its requestAnimationFrame throttled to roughly a
  // frame a second, and this app IS its animation loop — the world would render
  // but the car would advance about a twentieth of a second of simulation per
  // wall-clock second and read as "the throttle does nothing".
  await app.bringToFront();
  await app.waitForSelector('iframe', { timeout: 10000 });
  // Acknowledge the declared-network / capability prompt the runtime shows.
  await app.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 5000 }).catch(() => {});
  const fr = app.frameLocator('iframe');
  await fr.locator('#landing').waitFor({ timeout: 10000 });
  return {
    context, desk, app, fr, hits, mt,
    // Hop to the preset the fixtures are built around. Separate from the boot
    // so a caller can assert something about the landing screen first.
    land: async () => {
      await fr.locator('#presets button', { hasText: o.preset || 'Paris' }).first().click();
      await fr.locator('#hud').waitFor({ state: 'visible', timeout: 8000 });
    },
    close: () => context.close(),
  };
}

module.exports = { launchAnyroadBrowser, openAnyroad, BASE, sleep };
