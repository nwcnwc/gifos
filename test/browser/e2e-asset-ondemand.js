// Optional assets are NOT fetched at boot. gifos.assets(path) fetches that pin.
//
// The boot backfill (e2e-asset-boot-status.js) still runs for required pins.
// This suite is the other half: a pin marked optional must not block first
// paint, and naming it from the app must start the OS download (busy pill,
// verified cache, bytes in the sandbox).
const crypto = require('crypto');
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disk-cache-size=0'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });

  const assetBytes = Buffer.alloc(48 * 1024);
  for (let i = 0; i < assetBytes.length; i++) assetBytes[i] = (i * 13) % 251;
  const assetSha = crypto.createHash('sha256').update(assetBytes).digest('hex');
  await ctx.route('**/fake-optional.bin', async (r) => {
    await sleep(2500);
    r.fulfill({ status: 200, contentType: 'application/octet-stream', body: assetBytes });
  });

  const d = await ctx.newPage();
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 30000 });
  const fid = await d.evaluate(async ({ sha, size }) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({
        gifos: '1.0', appId: 'assetopt', name: 'Optional Asset', entry: 'index.html', capabilities: {},
        assets: [{ url: '/fake-optional.bin', sha256: sha, path: 'blob.bin', bytes: size, optional: true }],
      }),
      'index.html': '<!doctype html><meta charset="utf-8"><body><script>' +
        'document.body.textContent = "ready";' +
        'window.ask = function(){' +
        '  return gifos.assets("blob.bin")' +
        '    .then(function(b){ document.body.textContent = "got:" + b.byteLength; return b.byteLength; })' +
        '    .catch(function(e){ document.body.textContent = "miss:" + (e && e.message || e); throw e; });' +
        '};' +
        '<\/script>',
    });
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'Optional.gif', bytes, kind: 'gif', isApp: true, appId: 'assetopt', mime: 'image/gif' });
    return id;
  }, { sha: assetSha, size: assetBytes.length });
  await d.close();

  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [solo] ' + e.message));
  const t0 = Date.now();
  await p.goto(BASE + '/run.html#id=' + fid);
  const fr = p.frameLocator('#appmount iframe');
  await fr.locator('body:has-text("ready")').waitFor({ timeout: 20000 });
  const dumped = await p.evaluate(async (id) => {
    const rec = await GifOS.store.getFile(id);
    const arc = await GifOS.gif.decode(rec.bytes);
    const m = GifOS.gif.readManifest(arc);
    const listed = GifOS.assets.list(m);
    const needAll = await GifOS.assets.missing(arc.files, m, null);
    const needReq = await GifOS.assets.missing(arc.files, m, null, { requiredOnly: true });
    return { assets: m.assets, listed, needAll: needAll.map((a) => a.path + ':' + a.optional), needReq: needReq.map((a) => a.path + ':' + a.optional) };
  }, fid);
  const cachedBefore = await p.evaluate(async (id) => {
    const b = await GifOS.store.getAsset(id, 'blob.bin').catch(() => null);
    return b ? b.size : 0;
  }, fid);
  check('list() preserves optional:true from the manifest',
    dumped.listed[0] && dumped.listed[0].optional === true, JSON.stringify(dumped.listed));
  check('missing({requiredOnly}) is empty for an optional-only app',
    dumped.needReq.length === 0, JSON.stringify(dumped.needReq));
  check('boot did not download the optional pin (cache empty until the app asks)',
    cachedBefore === 0, String(cachedBefore));
  await fr.locator('body').evaluate(() => { window.ask(); });

  let pillText = '';
  try {
    await p.waitForFunction(() => window.GifOS && GifOS.providerBusy && GifOS.providerBusy.showing
      && GifOS.providerBusy.text.indexOf('Downloading') >= 0, null, { timeout: 10000 });
    pillText = await p.evaluate(() => GifOS.providerBusy.text);
  } catch (e) { /* asserted below */ }
  check('gifos.assets() of an optional pin shows the busy pill', /Downloading/.test(pillText), pillText.slice(0, 120));
  await fr.locator('body:has-text("got:")').waitFor({ timeout: 30000 });
  const got = await fr.locator('body').textContent();
  check('the app receives the verified bytes', got === 'got:' + assetBytes.length, got);
  const cached = await p.evaluate(async (id) => {
    const b = await GifOS.store.getAsset(id, 'blob.bin').catch(() => null);
    return b ? b.size : -1;
  }, fid);
  check('the optional pin is cached after the ask (once, not per open)', cached === assetBytes.length, String(cached));
  await p.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
