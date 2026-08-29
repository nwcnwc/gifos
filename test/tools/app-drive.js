/*
 * app-drive.js — open one certified app and drive it with a script you write.
 *
 * app-smoke.js pokes every app the same way, which is enough to find a black
 * screen and nothing else. This is the other half: it installs the shipped GIF,
 * opens it through run.html, and hands the page and the app frame to a small
 * driver module, so a real click-through — start a game, place a piece, type in
 * the box, press the export button — can be written per app and re-run.
 *
 *   node test/tools/app-drive.js <slug> <driver.js> [outdir]
 *
 * The driver exports one async function:
 *
 *   module.exports = async ({ run, frame, shot, sleep, page }) => {
 *     await frame.click('#start');
 *     await shot('after-start');
 *   };
 *
 * VIEWPORT=<w>x<h> drives a different window — a phone-shaped one is a
 * different app on most of these, and several of them only look wrong on one
 * of the two.
 *
 *   run    the Playwright Page for run.html (keyboard + mouse live here)
 *   frame  the app's Frame inside #appmount
 *   shot   (label) => screenshot of the whole page into <outdir>/<slug>-<label>.png
 *
 * Errors thrown inside the app are collected and printed at the end.
 * Needs: a static server on 8099 serving site/.
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [slug, driverPath, outArg] = process.argv.slice(2);
  if (!slug || !driverPath) { console.error('usage: app-drive.js <slug> <driver.js> [outdir]'); process.exit(2); }
  const OUT = outArg || process.env.SHOT_DIR || path.join(ROOT, '.smoke');
  fs.mkdirSync(OUT, { recursive: true });
  const drive = require(path.resolve(driverPath));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', slug, 'manifest.json'), 'utf8'));

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const vp = (process.env.VIEWPORT || '1100x820').split('x');
  const ctx = await browser.newContext({
    viewport: { width: Number(vp[0]) || 1100, height: Number(vp[1]) || 820 },
    isMobile: /^(3|4)\d\d$/.test(vp[0] || ''),
    hasTouch: /^(3|4)\d\d$/.test(vp[0] || ''),
  });
  const errors = [];
  const b64 = fs.readFileSync(appGif(slug)).toString('base64');

  const desk = await ctx.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 60000 });
  const fileId = await desk.evaluate(async ({ b64, appId, name }) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: name + '.gif', bytes, kind: 'gif', isApp: true, appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: name + '.gif', parent: null, x: 40, y: 40, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    const f = (await GifOS.store.allFiles()).find((x) => x.appId === appId);
    return f ? f.id : null;
  }, { b64, appId: manifest.appId, name: manifest.shortName || manifest.name });
  await desk.close();
  if (!fileId) { console.error('the app did not install'); process.exit(1); }

  const run = await ctx.newPage();
  run.on('pageerror', (e) => errors.push(e.message.slice(0, 220)));
  run.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 220)); });
  await run.goto(BASE + '/run.html#id=' + fileId);
  await run.waitForSelector('#appmount iframe', { timeout: 90000 });
  const frame = await (await run.$('#appmount iframe')).contentFrame();
  await sleep(2500);

  let n = 0;
  const shot = async (label) => {
    const f = path.join(OUT, slug + '-' + String(++n).padStart(2, '0') + '-' + label + '.png');
    await run.screenshot({ path: f });
    console.log('shot ' + f);
    return f;
  };

  try {
    await drive({ run, frame, shot, sleep, page: run, fileId, BASE });
  } catch (e) {
    console.log('DRIVER THREW: ' + (e && e.stack ? e.stack : e));
  }
  if (errors.length) {
    console.log('--- errors inside the app ---');
    for (const e of [...new Set(errors)]) console.log('  · ' + e);
  } else console.log('--- no errors ---');
  await browser.close();
})();
