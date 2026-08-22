// The solo boot's asset backfill must be VISIBLE — and soft on failure.
//
// An app whose manifest pins install-time assets (gifos-assets.js) gets them
// at store-install time with progress bars. But an app that arrives any OTHER
// way — the desktop's Add button, a dropped file, a ?run= link, a shared slim
// GIF — downloads them on first open, inside run.html#id='s boot. That wait is
// minutes for real apps (vocal-remover pins 120 MB of model weights), and it
// used to happen behind a BLANK pane: boot() reported progress only to the
// meeting bar's #status line, which body.solo-app hides with display:none, so
// the words were written into an invisible element. The failure message was
// equally invisible, so a degraded mount (self-test model, missing weights)
// looked like the app's fault.
//
// The fix drives the runtime's busy pill (GifOS.providerBusy — the same
// bottom-of-screen card the provider path uses for heavy OS work) from the
// backfill, with ensure()'s real progress fraction. This suite guards both
// halves on the real run.html solo entry:
//
//   1. While a pinned asset downloads, the pill is SHOWING and says
//      "Downloading <file>…" — and it leaves once the app mounts.
//   2. A failed download still mounts the app (SOFT — the app may have an
//      honest degraded mode), but the pill says so, readably, before leaving.
//
// Needs BASE only. The asset is a synthetic URL served by a playwright route
// (delayed, so the download is observable), never a third-party host — pin
// health is verify-pins.py, out of band. Service workers are BLOCKED in this
// context: sw.js's same-origin catch-all would answer the routed URL itself
// (SW-originated fetches bypass playwright routes → a 404 degraded to
// Response.error()). Real pins are cross-origin https, which sw.js never
// intercepts, so nothing product-shaped is being switched off here.
const crypto = require('crypto');
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });

  // The pinned bytes: deterministic, hashed here, served only by this route —
  // held back 2.5 s so the download phase is wide enough to observe.
  const assetBytes = Buffer.alloc(64 * 1024);
  for (let i = 0; i < assetBytes.length; i++) assetBytes[i] = i % 251;
  const assetSha = crypto.createHash('sha256').update(assetBytes).digest('hex');
  await ctx.route('**/fake-asset.bin', async (r) => {
    await sleep(2500);
    r.fulfill({ status: 200, contentType: 'application/octet-stream', body: assetBytes });
  });
  await ctx.route('**/fake-missing.bin', (r) => r.fulfill({ status: 404, body: 'no' }));

  // Seed two apps straight into the file store (boot needs the FILE, not an
  // icon): one whose pin the route serves, one whose pin 404s.
  const d = await ctx.newPage();
  d.on('pageerror', (e) => console.log('  [desk] ' + e.message));
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 30000 });
  const appHtml = (path) => '<!doctype html><meta charset="utf-8"><body><script>' +
    'gifos.assets(' + JSON.stringify(path) + ')' +
    '.then(function(b){ document.body.textContent = "got:" + b.byteLength; })' +
    '.catch(function(e){ document.body.textContent = "miss:" + (e && e.message || e); });' +
    '<\/script>';
  const fids = await d.evaluate(async ({ sha, size, html }) => {
    const mk = async (appId, name, url) => {
      const bytes = await GifOS.gif.encode({
        'manifest.json': JSON.stringify({ gifos: '1.0', appId, name, entry: 'index.html', capabilities: {},
          assets: [{ url, sha256: sha, path: 'blob.bin', bytes: size }] }),
        'index.html': html,
      });
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: name + '.gif', bytes, kind: 'gif', isApp: true, appId, mime: 'image/gif' });
      return fid;
    };
    return { ok: await mk('assetbootok', 'Asset Boot', '/fake-asset.bin'),
             fail: await mk('assetbootfail', 'Asset Fail', '/fake-missing.bin') };
  }, { sha: assetSha, size: assetBytes.length, html: appHtml('blob.bin') });
  await d.close();

  // ---- 1. the download is visible, then leaves ------------------------------
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [solo] ' + e.message));
  await p.goto(BASE + '/run.html#id=' + fids.ok);
  let pillText = '';
  try {
    await p.waitForFunction(() => window.GifOS && GifOS.providerBusy && GifOS.providerBusy.showing
      && GifOS.providerBusy.text.indexOf('Downloading') >= 0, null, { timeout: 15000 });
    pillText = await p.evaluate(() => GifOS.providerBusy.text);
  } catch (e) { /* asserted below */ }
  check('the boot backfill shows a busy pill while a pinned asset downloads', /Downloading/.test(pillText), pillText.slice(0, 120));
  check('…naming the file it is fetching', /blob\.bin/.test(pillText), pillText.slice(0, 120));
  const fr = p.frameLocator('#appmount iframe');
  await fr.locator('body:has-text("got:")').waitFor({ timeout: 30000 });
  const got = await fr.locator('body').textContent();
  check('the app mounts AFTER the backfill and reads the verified bytes', got === 'got:' + assetBytes.length, got.slice(0, 80));
  let gone = false;
  for (let i = 0; i < 50 && !gone; i++) { gone = await p.evaluate(() => !GifOS.providerBusy.showing); if (!gone) await sleep(100); }
  check('the pill leaves once the app is mounted', gone);
  const cached = await p.evaluate(async (fid) => {
    const b = await GifOS.store.getAsset(fid, 'blob.bin').catch(() => null);
    return b ? b.size : -1;
  }, fids.ok);
  check('the bytes were cached in the computer’s asset store (download once, not per open)', cached === assetBytes.length, String(cached));
  await p.close();

  // ---- 2. a failed download says so, and the app still mounts ---------------
  const q = await ctx.newPage();
  q.on('pageerror', (e) => console.log('  [solo-fail] ' + e.message));
  await q.goto(BASE + '/run.html#id=' + fids.fail);
  const fr2 = q.frameLocator('#appmount iframe');
  await fr2.locator('body:has-text("miss:")').waitFor({ timeout: 30000 });
  const miss = await fr2.locator('body').textContent();
  check('a failed backfill still mounts the app (SOFT — degraded mode is the app’s call)', /^miss:/.test(miss), miss.slice(0, 100));
  check('…and gifos.assets() names the fix on the miss', /online|reinstall/i.test(miss), miss.slice(0, 140));
  let failText = '';
  for (let i = 0; i < 30 && !/download failed/.test(failText); i++) {
    failText = await q.evaluate(() => (GifOS.providerBusy.showing ? GifOS.providerBusy.text : ''));
    if (!/download failed/.test(failText)) await sleep(100);
  }
  check('the failure is SHOWN, not written into a hidden status line', /App data download failed/.test(failText), failText.slice(0, 140));
  check('…and says the app opens without it', /opens without it/.test(failText), failText.slice(0, 140));
  let failGone = false;
  for (let i = 0; i < 120 && !failGone; i++) { failGone = await q.evaluate(() => !GifOS.providerBusy.showing); if (!failGone) await sleep(100); }
  check('the failure pill leaves on its own (held to be read, never forever)', failGone);
  await q.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
