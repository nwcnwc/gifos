/*
 * Capture screenshot.png — the store master. App frame only (no run.html
 * toolbar), so listing.json does not need coverCrop.
 *
 * Mid-game: four red just landed. C4.coverShot paints that through the
 * REAL render path (gold win line, You wins).
 *
 *   python3 -m http.server 8099 -d site
 *   node apps/connect-four/build.mjs
 *   node apps/connect-four/tools/shoot.js
 */
const { chromium, CHROME } = require('../../../test/lib/pw');
const { readFileSync } = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, '..', 'screenshot.png');
const GIF = path.join(__dirname, '..', '..', '..', 'site', 'apps', 'connect-four', 'connect-four.gif');
const GIF_B64 = readFileSync(GIF).toString('base64');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 720 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  const fid = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'connect-four.gif', bytes, kind: 'gif', isApp: true, appId: 'connect-four', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Connect Four.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    return fid;
  }, GIF_B64);
  await page.goto(BASE + '/run.html#id=' + fid);
  await page.waitForSelector('#appmount iframe', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const fr = page.frames().find((f) => f !== page.mainFrame());
  await fr.waitForFunction(() => window.C4 && window.C4.coverShot, null, { timeout: 20000 });
  await fr.evaluate(() => window.C4.coverShot());
  await fr.waitForFunction(() => {
    const b = document.getElementById('banner');
    return b && !b.hidden && /four in a row/i.test(b.textContent || '');
  }, null, { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 250));
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.locator('#appmount iframe').screenshot({ path: OUT });
  await browser.close();
  console.log('wrote ' + path.relative(process.cwd(), OUT));
})().catch((e) => { console.error(e); process.exit(1); });
