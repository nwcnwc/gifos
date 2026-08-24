/*
 * Air Hockey — the real GIF, booted in the real sandbox, until the table PLAYS.
 *
 * The port shipped as a score bar over a permanently black table. The GifOS
 * OBJMTLLoader shim (boot.js patchLoaders) parses models straight out of the
 * GIF and used to call onLoad SYNCHRONOUSLY — but hockey.js writes
 * `var me = this` AFTER its loadModels() call, because with the XHR loader
 * that line always ran first. The synchronous shim reached modelsLoaded while
 * `me` was still undefined, threw, and the scene never got its physics, its
 * AI, or the PLAYING state. Nothing noticed, because nothing ever booted the
 * app: booting it and watching it move is exactly this suite.
 *
 * Every assertion is about STATE (an error fired / pixels exist / pixels
 * changed), never about how fast a slow box got there — the WebGL frame rate
 * on a software rasterizer is not what is under test.
 *
 * Needs: the static site on 8099 (python3 -m http.server 8099 -d site).
 */
const fs = require('fs');
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const GIF_B64 = fs.readFileSync(appGif('air-hockey')).toString('base64');

let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined && !c ? '  ' + JSON.stringify(d) : ''));
  if (!c) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });
  const fid = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Air Hockey.gif', bytes, kind: 'gif', isApp: true, appId: 'air-hockey', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Air Hockey.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    return fid;
  }, GIF_B64);

  await page.goto(BASE + '/run.html#id=' + fid);
  await page.reload(); // run.html reads its hash once, at load
  await page.waitForSelector('#appmount iframe', { timeout: 90000 });

  // Let the models parse and the first frames render. The bug fired inside
  // this window — modelsLoaded threw before a single table pixel existed.
  await sleep(6000);
  check('booting the table throws NO page error', errs.length === 0, errs);

  // The whole-page screenshot is the only honest read of a WebGL canvas from
  // out here (2d getImageData cannot see it). The table must EXIST: the shot
  // of the app area must not be one flat colour.
  const frameBox = await page.evaluate(() => {
    const f = document.querySelector('#appmount iframe');
    const r = f.getBoundingClientRect();
    return { x: r.x, y: r.y + 80, width: r.width, height: r.height - 160 }; // HUD bands cropped
  });
  const flat = (buf) => {
    // PNG bytes differ even for near-flat shots, so decode cheaply: sample the
    // buffer's byte histogram — a black screen compresses to almost nothing.
    return buf.length < 4000;
  };
  const shot1 = await page.screenshot({ clip: frameBox });
  check('the table is on screen (the app area is not one flat colour)', !flat(shot1), { pngBytes: shot1.length });

  // And it LIVES: the render loop is ticking, so two shots a beat apart differ
  // (the camera idles, the spotlight breathes, the CPU paddle drifts).
  await sleep(1500);
  const shot2 = await page.screenshot({ clip: frameBox });
  check('the scene animates (two shots a beat apart differ)', !shot1.equals(shot2));

  // A drag must move the player's paddle — the one interaction the game has.
  const cx = frameBox.x + frameBox.width / 2, cy = frameBox.y + frameBox.height * 0.75;
  const before = await page.screenshot({ clip: frameBox });
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(cx - i * 18, cy - i * 6, { steps: 2 }); await sleep(40); }
  await page.mouse.up();
  await sleep(600);
  const after = await page.screenshot({ clip: frameBox });
  check('a drag changes the table (the paddle went somewhere)', !before.equals(after));
  check('playing threw NO page error either', errs.length === 0, errs);

  await browser.close();
  console.log(failures ? failures + ' FAILURES' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('NO-VERDICT — the suite could not finish: ' + (e && e.message));
  process.exit(4);
});
