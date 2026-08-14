/*
 * anyroad-soak.js — DOES CONTINUAL USE DEGRADE?
 *
 * A tool, not a gated suite: it takes minutes, it wants a quiet machine, and its
 * output is a trend you read rather than a pass/fail. Same category as
 * approom-host.js.
 *
 * WHY IT EXISTS. Reported from a phone, 2026-08-13: a long flight ended in a hang
 * with the engine note still playing, and lag bad enough that closing the tab was
 * hard. That symptom is diagnostic — the audio graph runs on its own thread, so a
 * wedged main thread sounds exactly like an engine that will not stop.
 *
 * WHAT IT FOUND (both fixed; keep these numbers, they are what "fixed" means):
 *
 *   1. A GL TEXTURE IS NOT GARBAGE-COLLECTED. gl.deleteTexture was never called
 *      anywhere in the app. evict() released a terrain tile's MESH and abandoned
 *      its imagery on the GPU. Two things create textures — 'img'+tileKey and
 *      'lbl:'+name — and both grew for the life of the tab. 25 tiles are live at
 *      once; the texture count was the number of tiles EVER VISITED.
 *   2. EVERY HOP STRANDED THE TILES IN THE AIR. All four tile loaders guard with
 *      `if (gen !== hopGen) return`, which left {pending:true} behind — and
 *      evict() skips pending slots on purpose ("never drop a tile still in
 *      flight"). A stranded marker can never be evicted and never resolves.
 *
 *   9-11 min of flying and hopping, nvidia-laptop, drape on:
 *     before          textures 26 -> 31 -> 36 -> 41 -> 46 -> 51, heap 17 -> 28 MB
 *                     a monotonic staircase, +5 per hop, NOT ONE SAMPLE FELL
 *     textures only   textures 26 -> 38   (still climbing: slots 25 -> 37)
 *     both fixed      textures 26, 31, 29, 34, 29, 34, 38, 35 — rises AND FALLS
 *
 * HOW TO READ IT. A leak is a column that only ever goes up. A bounded working
 * set oscillates and returns. Absolute fps here is a software rasteriser on
 * fixture data and means nothing; its TREND across samples is the signal.
 *
 * RUN IT (local, on a quiet box):
 *   python3 -m http.server 8099 -d site &
 *   SOAK_MINUTES=10 node test/tools/anyroad-soak.js
 *
 * RUN IT ON A FLEET BOX (what the numbers above came from — this box is 4 cores
 * and cannot hold still long enough to trust a trend):
 *   ssh nvidia-laptop 'cd ~/projects/gifos && git fetch -q origin main && git reset -q --hard origin/main && node apps/anyroad/build.mjs'
 *   ssh nvidia-laptop 'cd ~/projects/gifos && setsid nohup python3 -m http.server 8099 -d site </dev/null >/dev/null 2>&1 & disown; exit 0'
 *   ssh nvidia-laptop 'cd ~/projects/gifos && SOAK_MINUTES=10 nohup setsid node test/tools/anyroad-soak.js >/tmp/soak.log 2>&1 </dev/null & echo ok'
 *   # then poll: ssh nvidia-laptop 'tail -20 /tmp/soak.log'
 * Backgrounding over ssh is fiddly: use `nohup setsid ... </dev/null` and exit 0,
 * or the redirect dies with the session and you get an empty log.
 *
 * WHAT IT DOES NOT COVER, and both are live gaps:
 *   - THE STREET-NAME PLATE CACHE. labelTex is LRU-capped at 160 with real
 *     deletion, but this soak reports labels=1 for the whole run because the
 *     fixture serves one name. Making test/lib/anyroad-fixtures.js emit VARIED
 *     names per tile would exercise it; that half of the fix is unproven.
 *   - A REAL PHONE. This reproduces the accumulation and shows it flattened; it
 *     cannot tell you a phone's GPU budget. The Moto-over-adb harness is the box
 *     for that, and Render.stats() reports the same two numbers there.
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const FIX = require('../lib/anyroad-fixtures');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MINUTES = Number(process.env.SOAK_MINUTES || 10);
const OUT = process.env.SOAK_OUT || '/tmp/anyroad-soak.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Somewhere new every other sample, and flying in between: both churn tiles,
// which is what "continual use" means here.
const PLACES = [
  [48.8566, 2.3522], [51.5074, -0.1278], [40.7128, -74.006], [35.6762, 139.6503],
  [-33.8688, 151.2093], [43.0896, -79.0742], [36.0544, -112.1401], [46.5285, 10.4529],
  [64.1466, -21.9426], [45.8326, 6.8652], [37.8199, -122.4783], [41.9028, 12.4964],
];

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
  // perTile: the world follows the tile that was ASKED FOR, with street names
  // unique to it. Without this the fixture pins every road to the Paris preset,
  // so the moment the soak hops the roads land hundreds of km from the car,
  // nothing is inside LABEL_RANGE, and the label cache is never touched at all
  // — which is why this tool reported labels=1 for its whole first week.
  const hits = await FIX.routeWorld(context, { perTile: true });
  // Imagery too, and it is the whole point: a solid PNG per tile is still a
  // texture per tile. With the drape off nothing creates one and the soak is
  // blind to the leak it exists to find.
  await context.route(/api\.maptiler\.com/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: FIX.TILE_PNG });
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  // The drape only runs when a MapTiler entry exists in GifOS Settings. The key
  // is nonsense because the route above answers every tile request anyway.
  await page.evaluate(() => {
    localStorage.setItem('gifos_api_config', JSON.stringify({
      maptiler: { url: 'https://api.maptiler.com', key: 'soak-key', authType: 'query', authName: 'key' },
    }));
  });
  await page.reload();
  await page.waitForSelector('.icon', { timeout: 60000 });
  await sleep(500);

  const gifB64 = fs.readFileSync(appGif('anyroad')).toString('base64');
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Anyroad.gif', bytes, kind: 'gif', isApp: true, appId: 'anyroad', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Anyroad.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, gifB64);

  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Anyroad.gif' }).dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('[app pageerror]', e.message));
  await app.bringToFront();
  await app.setViewportSize({ width: 900, height: 560 });
  await app.waitForSelector('iframe', { timeout: 30000 });
  await app.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 8000 }).catch(() => {});
  const fr = app.frameLocator('iframe');
  await fr.locator('#landing').waitFor({ timeout: 40000 });
  await fr.locator('#presets button', { hasText: 'Paris' }).first().click();
  await fr.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
  await sleep(6000);
  // Wings on, drape on: the state the report came from.
  await fr.locator('body').evaluate(() => {
    window.Sources.set({ imagery: 'maptiler' });
    const car = window.App.car();
    if (!car.flying) window.Car.takeOff(car);
    car.targetAgl = 400;
  });
  await sleep(3000);

  const sample = () => fr.locator('body').evaluate(() => {
    const w = window.App.world, d = window.App.debug();
    const r = window.Render.stats ? window.Render.stats() : { textures: -1, labels: -1 };
    let terr = 0, roads = 0, waterVerts = 0, treeVerts = 0;
    for (const k in w.terrain) terr++;
    for (const k in w.roads) {
      roads++;
      const b = w.roads[k] && w.roads[k].built;
      if (!b) continue;
      if (b.water && b.water.positions) waterVerts += b.water.positions.length / 3;
      if (b.trees && b.trees.positions) treeVerts += b.trees.positions.length / 3;
    }
    return { frames: d.frames, textures: r.textures, labels: r.labels,
             terrainSlots: terr, roadSlots: roads, waterVerts, treeVerts,
             heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1 };
  });

  const t0 = Date.now();
  const rows = [];
  let hop = 0, lastFrames = 0, lastT = t0;
  console.log('t_s\tfps\ttextures\tlabels\theapMB\tterrain\troads\twaterV\ttreeV');
  while ((Date.now() - t0) < MINUTES * 60000) {
    await sleep(20000);
    const s = await sample().catch((e) => ({ err: String(e && e.message).slice(0, 90) }));
    // A WEDGED PAGE LOOKS LIKE THIS. Say so rather than dying silently — the
    // whole point of the tool is the failure it is hunting.
    if (s.err) { console.log('SAMPLE FAILED (a hung page looks exactly like this):', s.err); break; }
    const now = Date.now();
    const fps = ((s.frames - lastFrames) / ((now - lastT) / 1000)).toFixed(1);
    lastFrames = s.frames; lastT = now;
    const t = Math.round((now - t0) / 1000);
    rows.push(Object.assign({ t, fps: +fps }, s));
    console.log([t, fps, s.textures, s.labels, s.heapMB, s.terrainSlots, s.roadSlots,
                 s.waterVerts, s.treeVerts].join('\t'));
    if (++hop % 2 === 0) {
      const p = PLACES[(hop / 2) % PLACES.length];
      await fr.locator('body').evaluate((c) => {
        window.App.hop(c[0], c[1], 'soak');
        const car = window.App.car();
        if (!car.flying) window.Car.takeOff(car);
        car.targetAgl = 400; car.speed = 46;
      }, p).catch(() => {});
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const first = rows[0] || {}, last = rows[rows.length - 1] || {};
  console.log('\n=== ' + rows.length + ' samples over ' + MINUTES + ' min ===');
  for (const k of ['fps', 'textures', 'labels', 'heapMB', 'terrainSlots', 'waterVerts', 'treeVerts']) {
    const peak = rows.reduce((m, r) => Math.max(m, r[k] == null ? -Infinity : r[k]), -Infinity);
    console.log(k.padEnd(13), String(first[k]).padStart(8), '->', String(last[k]).padStart(8), '  peak', String(peak).padStart(8));
  }
  // The verdict a reader wants: did anything only ever go up?
  const LABEL_CACHE_MAX = 160;   // render.js labelFor()
  const served = hits.names.size;
  const peakLabels = rows.reduce((m, r) => Math.max(m, r.labels), 0);
  for (const k of ['textures', 'labels', 'terrainSlots', 'heapMB']) {
    let fell = false;
    for (let i = 1; i < rows.length; i++) if (rows[i][k] < rows[i - 1][k]) { fell = true; break; }
    // A CAP IS NOT A LEAK, and "never fell" cannot tell them apart on its own.
    // The label cache is SUPPOSED to sit at its ceiling once a long drive has
    // passed enough streets — flat at 160 while the world offered thousands of
    // names is the fix working, not the leak. Only judge it against what it was
    // actually offered.
    if (k === 'labels' && served > LABEL_CACHE_MAX && peakLabels <= LABEL_CACHE_MAX) {
      console.log('OK       labels held at or under the ' + LABEL_CACHE_MAX + ' cap (peak '
        + peakLabels + ') while the world served ' + served + ' distinct street names');
      continue;
    }
    if (k === 'labels' && served <= LABEL_CACHE_MAX) {
      console.log('UNPROVEN labels — the world only ever served ' + served + ' distinct names, '
        + 'below the ' + LABEL_CACHE_MAX + ' cap, so this run cannot judge the LRU');
      continue;
    }
    console.log((fell ? 'OK       ' : 'SUSPECT  ') + k
      + (fell ? ' came back down at least once (a bounded working set)'
              : ' NEVER fell across ' + rows.length + ' samples — that is the shape of a leak'));
  }
  if (peakLabels > LABEL_CACHE_MAX) {
    console.log('SUSPECT  labels PEAKED AT ' + peakLabels + ', above the ' + LABEL_CACHE_MAX
      + ' cap — the LRU is not evicting');
  }
  console.log('\nwrote ' + OUT);
  await browser.close();
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
