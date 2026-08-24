/*
 * End-to-end: Worldview, the NASA satellite-imagery port, running as a real
 * packed GIF inside the real GifOS runtime.
 *
 * HERMETIC. Every request to gibs.earthdata.nasa.gov is served from
 * test/lib/gibs-fixtures.js — see that file for why (a public science archive
 * is not a fixture, and a gate that re-queries it is abuse).
 *
 * What this actually guards, in order of what it would cost to get wrong:
 *
 *  1. THE URL. A WMTS path with the wrong tile matrix set, the wrong time
 *     format or row and column the wrong way round returns 404 from GIBS, and
 *     a 404 from GIBS is INDISTINGUISHABLE from "no imagery on this day". The
 *     app would look like it works and show an empty Earth for ever. So the
 *     fixture parses every path and this suite asserts the parts.
 *  2. BINARY gifos.fetch -> PIXELS. Tiles are image bytes across the RPC
 *     bridge, decoded in a sandboxed frame (an opaque origin, where a tainted
 *     canvas would throw on getImageData). Each fixture tile is a solid colour
 *     computed from its own row and column, so this asserts THE RIGHT TILE
 *     LANDED IN THE RIGHT PLACE — not merely that something was drawn.
 *  3. NO DATA IS NOT A FAILURE. A layer whose record starts after the chosen
 *     day must not be requested at all, and the layer row has to say so.
 *  4. THE FILE IS THE SAVE. Layers, the date and the view come back after a
 *     reload, and the imagery already fetched is served from gifos.db with the
 *     network dead — that is the whole offline claim.
 *  5. THE GIF EXPORT. It writes a real GIF89a with a frame per day, on the
 *     device, with no network of its own.
 *
 * Needs: static server on 8099 (python3 -m http.server 8099 -d site).
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { routeGibs, tileColour, tileAt, LEGEND_XML } = require('../lib/gibs-fixtures');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

const TRUE_COLOR = 'MODIS_Terra_CorrectedReflectance_TrueColor';

// The app's own idea of "the newest whole day", computed here independently.
function latestDay() {
  const now = new Date();
  let ms = now.getTime();
  if (now.getUTCHours() < 3) ms -= 86400000;
  const d = new Date(ms);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

async function openApp(browser, opts) {
  const o = opts || {};
  const context = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 800 },
    storageState: o.storageState,
  });
  context.setDefaultTimeout(60000);
  const log = await routeGibs(context, { legend: o.legend, has: o.has });
  if (o.dead) log.setDead(true);

  const desk = await context.newPage();
  desk.on('pageerror', (e) => console.log('  [desk pageerror]', e.message));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 60000 });

  let fid = o.fid;
  if (!fid) {
    const gifB64 = readFileSync(appGif('worldview')).toString('base64');
    fid = await desk.evaluate(async (b64) => {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const id = GifOS.store.uid('file');
      await GifOS.store.putFile({ id, name: 'Worldview.gif', bytes, kind: 'gif', isApp: true, appId: 'worldview', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: id, name: 'Worldview.gif', parent: null, x: 200, y: 200, iconSize: 64 });
      return id;
    }, gifB64);
  }

  const app = await context.newPage();
  const errors = [];
  app.on('pageerror', (e) => errors.push(e.message));
  await app.goto(BASE + '/run.html#id=' + fid);
  await app.waitForSelector('#appmount iframe', { timeout: 60000 });
  await app.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 6000 }).catch(() => {});
  await app.bringToFront();
  let fr = null;
  for (let i = 0; i < 60 && !fr; i++) {
    await sleep(250);
    const f = app.frames().find((x) => x !== app.mainFrame());
    if (f) {
      const ready = await f.evaluate(() => !!(window.WVApp && window.WVData && window.WVData.ready)).catch(() => false);
      if (ready) fr = f;
    }
  }
  if (fr) {
    await fr.evaluate(() => {
      const b = document.getElementById('wStart');
      if (b && !document.getElementById('welcome').hidden) b.click();
    }).catch(() => {});
  }
  return { context, desk, app, fr, log, fid, errors, close: () => context.close() };
}

// Wait until the app has nothing left in flight, or give up.
async function settle(fr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 15000)) {
    const busy = await fr.evaluate(() => window.WVTiles.busy()).catch(() => 1);
    if (!busy) { await sleep(300); return true; }
    await sleep(200);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const gifBytes = readFileSync(appGif('worldview'));

  // ---- 1. the artifact ------------------------------------------------------
  const boot = await openApp(browser, { legend: LEGEND_XML });
  const { fr, log, app } = boot;

  check('the built GIF is a valid GifOS app', await boot.desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return GifOS.gif.looksLikeGifosGif(bytes);
  }, gifBytes.toString('base64')));

  check('the app boots inside the sandbox', !!fr);
  if (!fr) { console.log('NO-VERDICT: the app never became ready'); process.exit(4); }

  const facts = await fr.evaluate(() => ({
    layers: window.WVData.catalog.layers.length,
    places: window.WVData.places.length,
    coast: window.WVData.coast.length,
    tours: window.WVData.tours.length,
    date: window.WVApp.state.date,
    stack: window.WVApp.state.layers.map((r) => r.id),
  }));
  check('the layer catalog is packed in the GIF', facts.layers >= 70, facts.layers + ' layers');
  check('the gazetteer is packed in the GIF', facts.places > 1000, facts.places + ' places');
  check('the coastline vectors are packed in the GIF', facts.coast > 1000, facts.coast + ' polylines');
  check('the tours are packed in the GIF', facts.tours >= 10, facts.tours + ' tours');
  check('it opens on the newest whole day', facts.date === latestDay(), facts.date + ' vs ' + latestDay());
  check('it opens with the offline base underneath', facts.stack.indexOf('wv:base') >= 0);

  await settle(fr);

  // ---- 2. the URL -----------------------------------------------------------
  check('every request is a well-formed WMTS tile path', log.bad.length === 0,
        log.bad.length ? log.bad[0] : log.tiles.length + ' requests');
  const tc = log.forLayer(TRUE_COLOR);
  check('the default imagery layer is requested', tc.length > 0, tc.length + ' tiles');
  if (tc.length) {
    check('it asks for the layer\'s own tile matrix set', tc.every((t) => t.set === '250m'), tc[0].set);
    check('it asks for JPEG for base imagery', tc.every((t) => t.ext === 'jpg'), tc[0].ext);
    check('the TIME segment is the day on screen', tc.every((t) => t.time === facts.date), tc[0].time);
    check('the level is coarse at whole-Earth zoom, not level 8',
          tc.every((t) => t.level <= 3), 'max level ' + Math.max.apply(null, tc.map((t) => t.level)));
  }
  check('nothing is requested for a layer that is switched off',
        !log.byLayer['VIIRS_SNPP_CorrectedReflectance_TrueColor']);

  // ---- 3. bytes -> pixels, in the right place -------------------------------
  // Only the imagery: the offline base and the coastlines would paint over the
  // point being sampled, and this assertion is about the TILE.
  await fr.evaluate(() => {
    window.WVApp.state.layers.forEach((r) => { if (r.id !== 'MODIS_Terra_CorrectedReflectance_TrueColor') r.on = false; });
    window.WVUI.renderStack();
    window.WVMap.invalidate();
  });
  await settle(fr);
  await sleep(500);

  const sample = await fr.evaluate(() => {
    const cv = document.getElementById('map');
    const ctx = cv.getContext('2d');
    const v = window.WVMap.view;
    const sz = window.WVMap.size();
    const level = window.WVTiles.levelFor(window.WVMap.effRes(), window.WVData.layer('MODIS_Terra_CorrectedReflectance_TrueColor'));
    const px = ctx.getImageData(Math.round(cv.width / 2), Math.round(cv.height / 2), 1, 1).data;
    return { r: px[0], g: px[1], b: px[2], lon: v.lon, lat: v.lat, level: level, w: sz.w };
  });
  const want = (() => {
    const t = tileAt(sample.level, sample.lon, sample.lat);
    return tileColour(sample.level, t.row, t.col);
  })();
  check('a fixture tile\'s pixels survive gifos.fetch and land on the canvas',
        Math.abs(sample.r - want.r) < 6 && Math.abs(sample.g - want.g) < 6 && Math.abs(sample.b - want.b) < 6,
        'got rgb(' + sample.r + ',' + sample.g + ',' + sample.b + ') want rgb(' + want.r + ',' + want.g + ',' + want.b + ') at level ' + sample.level);

  // ---- 4. time --------------------------------------------------------------
  log.reset();
  await fr.evaluate(() => window.WVApp.stepDate(-1));
  await settle(fr);
  const stepped = await fr.evaluate(() => window.WVApp.state.date);
  const after = log.forLayer(TRUE_COLOR);
  check('stepping a day asks for that day', after.length > 0 && after.every((t) => t.time === stepped),
        stepped + ' — ' + after.length + ' tiles');
  check('the day it stepped to is yesterday',
        Math.round((Date.parse(latestDay()) - Date.parse(stepped)) / 86400000) === 1, stepped);

  // ---- 5. going somewhere ---------------------------------------------------
  log.reset();
  await fr.evaluate(() => {
    const hit = window.WVData.searchPlaces('Reykjav', 1)[0];
    window.WVApp.goTo(hit.lat, hit.lon, 0.004, hit.name);
  });
  await sleep(1400);
  await settle(fr);
  const flown = await fr.evaluate(() => ({ lon: window.WVMap.view.lon, lat: window.WVMap.view.lat }));
  check('the offline gazetteer finds Reykjavík and the map flies there',
        Math.abs(flown.lat - 64.15) < 1.5 && Math.abs(flown.lon + 21.95) < 2.5,
        flown.lat.toFixed(2) + ', ' + flown.lon.toFixed(2));
  const near = log.forLayer(TRUE_COLOR);
  const expect = near.length ? tileAt(near[0].level, flown.lon, flown.lat) : null;
  check('the tiles it asks for are the ones over that place',
        !!expect && near.some((t) => Math.abs(t.row - expect.row) <= 1 && Math.abs(t.col - expect.col) <= 1),
        expect ? 'want ~' + expect.row + '/' + expect.col + ', got ' + near.slice(0, 3).map((t) => t.row + '/' + t.col).join(' ') : 'no tiles');
  // The flight passes through every zoom on the way, so the levels asked for
  // are a range; what matters is that it ARRIVED at a deep one.
  var deepest = near.length ? Math.max.apply(null, near.map((t) => t.level)) : -1;
  check('zooming in asks for a deeper level than whole-Earth did', deepest >= 6, 'deepest level ' + deepest);

  // ---- 6. a day with no data is not a failure -------------------------------
  log.reset();
  const noData = await fr.evaluate(() => {
    // PACE launched in 2024; on a day in 2001 it cannot have anything, and the
    // app must not ask.
    window.WVApp.setDate('2001-06-01');
    window.WVApp.addLayer('OCI_PACE_Chlorophyll_a');
    var row = document.querySelector('#stack .lyr-sub');
    return { text: (row && row.textContent) || '' };
  });
  await sleep(900);
  check('a layer with no record on that day is never requested',
        !log.byLayer['OCI_PACE_Chlorophyll_a'], JSON.stringify(log.layersAsked()));
  const rowText = await fr.evaluate(() => {
    const subs = Array.prototype.slice.call(document.querySelectorAll('#stack .lyr-sub'));
    return subs.map((s) => s.textContent).join(' | ');
  });
  check('the layer row says so instead of showing an empty map',
        /Nothing on this day/.test(rowText), rowText.slice(0, 120));

  // ---- 7. the legend comes from GIBS, not from a guess -----------------------
  const legend = await fr.evaluate(() => window.WVApp.legend('MODIS_Terra_Land_Surface_Temp_Day'));
  check('a layer legend is fetched from the GIBS colormap and parsed',
        !!legend && legend.entries.length === 3 && legend.min === '250 K',
        legend ? legend.entries.length + ' entries, ' + legend.min + '→' + legend.max : 'none');
  const colormapsAfter = log.colormaps;
  await fr.evaluate(() => window.WVApp.legend('MODIS_Terra_Land_Surface_Temp_Day'));
  await sleep(300);
  check('a legend already in the file is not fetched twice', log.colormaps === colormapsAfter,
        log.colormaps + ' colormap requests');

  // ---- 8. the GIF export ----------------------------------------------------
  const gif = await fr.evaluate(async () => {
    const s = window.WVApp.state;
    s.layers.forEach((r) => { r.on = (r.id === 'MODIS_Terra_CorrectedReflectance_TrueColor' || r.id === 'wv:base'); });
    const bytes = await window.WVAnim.exportGif({
      from: '2019-06-01', to: '2019-06-03', step: 'day', fps: 4, size: 160,
    });
    let frames = 0;
    for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames++;
    return {
      magic: String.fromCharCode.apply(null, bytes.subarray(0, 6)),
      len: bytes.length, frames: frames,
    };
  });
  check('the animation exports a real GIF89a, written on the device',
        gif.magic === 'GIF89a' && gif.len > 500, gif.magic + ', ' + gif.len + ' bytes');
  check('the exported GIF has one frame per day in the range', gif.frames === 3, gif.frames + ' frames');

  const state = await fr.evaluate(() => ({
    date: window.WVApp.state.date,
    on: window.WVApp.state.layers.filter((r) => r.on).map((r) => r.id),
  }));
  check('the exporter puts the date back where it found it', state.date === '2001-06-01', state.date);

  // Park the app somewhere identifiable, then reload it from the same file.
  await fr.evaluate(() => {
    window.WVApp.setDate('2019-06-02');
    window.WVApp.goTo(-33.9, 18.4, 0.02, 'Cape Town');
    return window.WVApp.save();
  });
  await sleep(1200);
  await settle(fr);
  const cacheBefore = await fr.evaluate(() => window.WVTiles.cacheStats());
  check('the imagery it fetched is kept inside the app\'s own file',
        cacheBefore.tiles > 0 && cacheBefore.bytes > 0,
        cacheBefore.tiles + ' tiles, ' + cacheBefore.bytes + ' bytes');
  check('no page errors while all that happened', boot.errors.length === 0, boot.errors.join(' | '));

  // ---- 9. the same file, opened again, with the network dead ----------------
  // The SAME browser context, because the app's data lives in IndexedDB inside
  // this origin — a fresh context with a copied storageState would be a
  // different computer with no file on it, which is not the thing being tested.
  log.setDead(true);
  log.reset();
  // about:blank first: navigating to the SAME url with the same fragment is a
  // same-document navigation, and the app would keep running with its counters
  // and its memory cache intact — which is not "opened again" at all.
  await app.goto('about:blank');
  await app.goto(BASE + '/run.html#id=' + boot.fid);
  await app.waitForSelector('#appmount iframe', { timeout: 60000 });
  await app.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 6000 }).catch(() => {});
  let off = { fr: null };
  for (let i = 0; i < 60 && !off.fr; i++) {
    await sleep(250);
    const f = app.frames().find((x) => x !== app.mainFrame());
    if (f) {
      const ready = await f.evaluate(() => !!(window.WVApp && window.WVData && window.WVData.ready)).catch(() => false);
      if (ready) off.fr = f;
    }
  }
  if (!off.fr) { console.log('NO-VERDICT: the app did not come back offline'); process.exit(4); }
  await off.fr.evaluate(() => {
    const b = document.getElementById('wStart');
    if (b && !document.getElementById('welcome').hidden) b.click();
  }).catch(() => {});
  await sleep(3000);

  const back = await off.fr.evaluate(() => ({
    date: window.WVApp.state.date,
    lat: window.WVMap.view.lat,
    lon: window.WVMap.view.lon,
    net: window.WVTiles.net,
    fromDb: window.WVTiles.stats.fromDb,
    stats: JSON.stringify(window.WVTiles.stats),
    cache: JSON.stringify(window.WVTiles.cacheStats()),
    busy: window.WVTiles.busy(),
    chip: (document.querySelector('#netChip .lbl') || {}).textContent,
  }));
  console.log('  [offline diag]', back.stats, back.cache, 'busy', back.busy, 'net', back.net);
  check('the day it was left on comes back', back.date === '2019-06-02', back.date);
  check('the place it was left at comes back',
        Math.abs(back.lat + 33.9) < 1 && Math.abs(back.lon - 18.4) < 1,
        back.lat.toFixed(1) + ', ' + back.lon.toFixed(1));
  check('the imagery comes back from the file with no connection', back.fromDb > 0, back.fromDb + ' tiles from the file');
  const cacheAfter = await off.fr.evaluate(() => window.WVTiles.cacheStats());
  check('the cache index survives the reload, so the app knows what it is holding',
        cacheAfter.tiles > 0, cacheAfter.tiles + ' tiles indexed, ' + cacheAfter.bytes + ' bytes');

  const paint = await off.fr.evaluate(() => {
    const cv = document.getElementById('map');
    const ctx = cv.getContext('2d');
    let lit = 0;
    for (let i = 0; i < 40; i++) {
      const x = Math.round(cv.width * (0.1 + 0.02 * i));
      const px = ctx.getImageData(x, Math.round(cv.height / 2), 1, 1).data;
      if (px[0] + px[1] + px[2] > 60) lit++;
    }
    return lit;
  });
  check('the map is not a black rectangle with the connection off', paint > 25, paint + '/40 samples lit');

  await sleep(2500);
  const netState = await off.fr.evaluate(() => ({
    net: window.WVTiles.net,
    chip: (document.querySelector('#netChip .lbl') || {}).textContent,
  }));
  check('it says it is offline rather than pretending', netState.net === 'offline' && netState.chip === 'Offline',
        netState.net + ' / ' + netState.chip);

  /*
   * TWO DAYS ON SCREEN, ONE PLAYHEAD ON THE RULER. Turning compare on did not
   * repaint the timeline at all, so the B playhead only ever appeared after
   * some unrelated event redrew it — you split the screen between 2020 and
   * 2025 and the ruler went on showing a single date. And when B is outside
   * the visible window (five years away at the Days scale, which is the
   * default) it was drawn nowhere, with no hint that a second date existed or
   * which way it lay.
   */
  const cmp = await off.fr.evaluate(async () => {
    window.WVUI.closeSheets();
    window.WVApp.setDate('2020-08-01');
    window.WVApp.state.compare.date = '2025-08-24';
    await new Promise((r) => setTimeout(r, 400));
    window.WVApp.toggleCompare();
    await new Promise((r) => setTimeout(r, 700));
    const far = window.WVUI.tlDrew();
    window.WVApp.state.compare.date = '2020-08-10';
    window.WVUI.renderTimeline();
    const near = window.WVUI.tlDrew();
    window.WVApp.toggleCompare();
    await new Promise((r) => setTimeout(r, 300));
    return { far: far, near: near, off: window.WVUI.tlDrew() };
  });
  check('turning compare on repaints the ruler, so the second date is on it',
    cmp.far.compare === true && cmp.far.bDate === '2025-08-24');
  check('a B date past the edge of the ruler is pinned to the edge it went out of',
    cmp.far.b === 'edge-right', String(cmp.far.b));
  check('a B date inside the window is drawn where it belongs',
    cmp.near.b === 'on-ruler', String(cmp.near.b));
  check('turning compare off takes the second date off the ruler',
    cmp.off.compare === false && cmp.off.b === null);

  /*
   * THE LAYER BROWSER MUST NOT SELL WHAT THE FILE CANNOT DELIVER. Offline, all
   * 74 layers used to look equally available; ticking one gave you a blank map
   * and no explanation. The file knows which layers it holds bytes for, and
   * the browser has to say so — the badge goes on the ones it HAS, and the
   * others are marked unreachable.
   */
  const browse = await off.fr.evaluate(async () => {
    window.WVUI.openBrowse();
    await new Promise((r) => setTimeout(r, 600));
    const badged = [...document.querySelectorAll('.lcard')]
      .filter((c) => c.querySelector('.lcard-tag.ok')).length;
    return {
      banner: (document.querySelector('.browse-offline') || {}).textContent || '',
      badged: badged,
      unreachable: document.querySelectorAll('.lcard.unreachable').length,
      held: Object.keys(window.WVTiles.cachedLayers()).length,
    };
  });
  check('offline, the layer browser says so instead of listing 74 equal choices',
    /offline/i.test(browse.banner), browse.banner.slice(0, 80));
  check('the layers this file actually holds are the ones badged',
    browse.held > 0 && browse.badged > 0 && browse.badged <= browse.held,
    browse.badged + ' badged of ' + browse.held + ' held');
  check('the layers it does not hold are marked unreachable, not offered as equals',
    browse.unreachable > 0, browse.unreachable + ' dimmed');

  await boot.close();
  await browser.close();

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
