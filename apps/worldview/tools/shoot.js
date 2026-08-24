/*
 * Capture screenshot.png — the store master. App frame only (no run.html
 * toolbar), so listing.json needs no coverCrop.
 *
 * THE COVER MAY ONLY SHOW PIXELS THE APP REALLY DRAWS. This one is the app on
 * the Blue Marble that is packed inside the GIF: a real, permanent state of the
 * product (it is what you get with no connection, and what fills the gaps
 * between satellite passes), not a mock. Nothing on the cover is invented.
 *
 * If you are on a machine that can reach gibs.earthdata.nasa.gov, run it with
 * WV_LIVE=1 and it will let the app fetch the real imagery for the date below
 * instead — a live cover is better, and this is the command that takes it.
 *
 *   python3 -m http.server 8099 -d site
 *   node apps/worldview/build.mjs
 *   node apps/worldview/tools/shoot.js            # offline base
 *   WV_LIVE=1 node apps/worldview/tools/shoot.js  # today's imagery, if reachable
 */
const { chromium, CHROME } = require('../../../test/lib/pw');
const { readFileSync } = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const LIVE = !!process.env.WV_LIVE;
const OUT = path.join(__dirname, '..', 'screenshot.png');
const GIF = path.join(__dirname, '..', '..', '..', 'site', 'apps', 'worldview', 'worldview.gif');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 864 },
    deviceScaleFactor: 1,
  });
  if (!LIVE) {
    // No pretending: with no connection the app draws its own packed Earth, and
    // that is exactly what the cover shows.
    await context.route('**://gibs.earthdata.nasa.gov/**', (route) => route.abort('internetdisconnected'));
  }
  const page = await context.newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  const fid = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'worldview.gif', bytes, kind: 'gif', isApp: true, appId: 'worldview', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: id, name: 'Worldview.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    return id;
  }, readFileSync(GIF).toString('base64'));

  await page.goto(BASE + '/run.html#id=' + fid);
  await page.waitForSelector('#appmount iframe', { timeout: 60000 });
  await page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 6000 }).catch(() => {});
  await sleep(2500);
  const fr = page.frames().find((f) => f !== page.mainFrame());
  if (!fr) throw new Error('the app never mounted');
  await fr.waitForFunction(() => window.WVApp && window.WVData && window.WVData.ready, null, { timeout: 30000 });

  // The scene: mid-use, over land, with the layer stack and the inspector
  // saying what is on screen — not a first boot.
  await fr.evaluate((live) => {
    const b = document.getElementById('wStart');
    if (b && !document.getElementById('welcome').hidden) b.click();
    const A = window.WVApp;
    A.state.layers = [
      { id: 'wv:places', on: true, opacity: 1 },
      { id: 'wv:coast', on: true, opacity: 1 },
      { id: 'wv:borders', on: true, opacity: 0.75 },
    ].concat(live
      ? [{ id: 'MODIS_Terra_CorrectedReflectance_TrueColor', on: true, opacity: 1 }]
      : []
    ).concat([{ id: 'wv:base', on: true, opacity: 1 }]);
    window.WVUI.setPanel(true);
    window.WVMap.setView({ lat: 27, lon: 22, res: 0.075 });
    window.WVUI.renderAll();
  }, LIVE);
  await sleep(LIVE ? 6000 : 2500);
  await page.locator('#appmount iframe').screenshot({ path: OUT });
  await browser.close();
  console.log('wrote ' + path.relative(process.cwd(), OUT) + (LIVE ? ' (live imagery)' : ' (packed Blue Marble)'));
})().catch((e) => { console.error(e); process.exit(1); });
