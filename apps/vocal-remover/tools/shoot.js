/*
 * shoot.js — regenerate screenshot.png, the master the store's cover.jpg is
 * made from. It captures the APP FRAME ONLY (not the run.html shell around
 * it), so no coverCrop is needed in listing.json.
 *
 * Deliberately shot in the READY state, with a track chosen and nothing run
 * yet. The gate box has no UVR weights, so anything past Separate here is
 * self-test output — and a store card showing "Pass-through / Residual" would
 * be advertising the stand-in model.
 *
 *   python3 -m http.server 8099 -d site &
 *   node apps/vocal-remover/build.mjs
 *   node apps/vocal-remover/tools/shoot.js
 */
const { chromium, CHROME } = require('../../../test/lib/pw');
const { appGif } = require('../../../test/lib/apps');
const { readFileSync, writeFileSync, mkdtempSync } = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, '..', 'screenshot.png');
const GIF_B64 = readFileSync(appGif('vocal-remover')).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sampleWav() {
  const sr = 44100, n = sr * 214;                       // a plausible song length
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vr-shot-'));
  const p = path.join(dir, 'Song.wav');
  writeFileSync(p, buf);
  return p;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 760, height: 1180 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 30000 });
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Vocal Remover.gif', bytes, kind: 'gif', isApp: true, appId: 'vocal-remover', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Vocal Remover.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, GIF_B64);
  await sleep(600);
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Vocal Remover' }).first().dblclick(),
  ]);
  await app.setViewportSize({ width: 760, height: 1180 });
  await app.waitForSelector('iframe', { timeout: 20000 });
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click().catch(() => {});
  await sleep(500);
  const fr = app.frames().find((f) => f !== app.mainFrame());
  await fr.waitForSelector('#go', { timeout: 30000 });
  await fr.setInputFiles('#file', sampleWav());
  await fr.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 30000 });
  await fr.selectOption('#length', '30');
  await sleep(400);
  await app.locator('iframe').first().screenshot({ path: OUT });
  await browser.close();
  console.log('wrote ' + path.relative(process.cwd(), OUT));
})().catch((e) => { console.error(e); process.exit(1); });
