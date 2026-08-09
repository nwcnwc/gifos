// End-to-end: PROVIDER apps — apps that ADD abilities to the OS
// (docs/providers.md), plus the install-time assets pattern that feeds them
// (gifos-assets.js, download-then-seal).
//
// Guards, in order:
//  1. The Providers system folder exists on a fresh desktop.
//  2. A provider GIF OUTSIDE the folder wears the red ✕ overlay, and the
//     broker REFUSES to serve it from there (recognition is a place).
//  3. Moved into the folder: ✕ gone, and a consumer app's gifos.ai.tts is
//     answered by the provider's registered handler (whole brokered loop:
//     consumer sandbox → runtime → hidden provider mount → back).
//  4. THE HARD RULE: a provider that declares capabilities.network is refused
//     even from inside the folder.
//  5. The consumer's acknowledgement sheet NAMES the provider app.
//  6. Reader (the seeded consumer) lives in the Tools folder.
//  7. The REAL Offline Text to Speech GIF: engine IN-GIF (no assets — 5.6 MB raw is
//     under the assets floor), boots in the hidden mount, and a real RIFF
//     WAV comes back through gifos.ai.tts with no repack of the stored file.
//  8. The install-time assets machinery (gifos-assets.js) is guarded end to
//     end: a synthetic provider pins a file on the static server; the
//     provider mount backfills it (hash-verified) into the computer's ASSET
//     STORE (Blob-backed appassets — the gigabyte tier; never sealed into
//     the GIF, which stays byte-identical), and serves its bytes back.
//
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const fs = require('fs');
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A consumer app that declares ai:['tts'] and reports what one tts call did.
const CONSUMER_HTML = '<!doctype html><meta charset="utf-8"><div id="out">…</div>' +
  '<script>(async function(){' +
  '  var el=document.getElementById("out");' +
  '  try { var r=await gifos.ai.tts({ text:"hello there" });' +
  '    var u=new Uint8Array(r.bytes||new ArrayBuffer(0));' +
  '    var head=String.fromCharCode(u[0]||0,u[1]||0,u[2]||0,u[3]||0);' +
  '    el.textContent="ok:"+head+":"+u.length+":"+(r.mime||"");' +
  '  } catch(e){ el.textContent="err:"+e.message; }' +
  '})();<\/script>';

async function seedConsumer(page, appId, name) {
  await page.evaluate(async ({ appId, name, html }) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId, name, entry: 'index.html', capabilities: { db: true, ai: ['tts'] } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: name + '.gif', bytes, kind: 'gif', isApp: true, appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: name + '.gif', parent: null, x: 620, y: 460, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { appId, name, html: CONSUMER_HTML });
}

// Open a desktop icon in its app tab and return the result line from the
// consumer's #out div (dismissing the abilities acknowledgement on the way).
async function runConsumer(page, context, label, outTimeout) {
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: label }).dblclick()]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 10000 });
  const ackBox = app.locator('.perm-box', { hasText: 'would like to' });
  let ack = '';
  try { await ackBox.waitFor({ timeout: 4000 }); ack = await ackBox.textContent(); await ackBox.locator('.done').click(); } catch (e) { /* already acked */ }
  // Two iframes can coexist in the tab: the visible app mount and the HIDDEN
  // provider service iframe (data-gifos-provider) — target the mount.
  const fr = app.frameLocator('#appmount iframe');
  await fr.locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: outTimeout || 20000 });
  const out = await fr.locator('#out').textContent();
  return { app, ack, out };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 15000 });
  await sleep(600);

  // ---- 1. the Providers system folder exists --------------------------------
  const labels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Providers system folder is seeded at the root', labels.includes('Providers'));

  // ---- 2. a provider OUTSIDE the folder: red ✕ + broker refusal -------------
  await page.evaluate(async () => {
    const html = '<!doctype html><meta charset="utf-8">provider body' +
      '<script>gifos.provider.serve({ tts: function(req){' +
      '  var b=new ArrayBuffer(12); var u=new Uint8Array(b);' +
      '  [82,73,70,70,4,0,0,0,87,65,86,69].forEach(function(v,i){u[i]=v;});' +
      '  return { bytes:b, mime:"audio/wav" };' +
      '} });<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'fakeprov', name: 'Fake Prov', entry: 'index.html', capabilities: {}, provides: { ai: ['tts'] } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    window.__provFid = fid;
    await GifOS.store.putFile({ id: fid, name: 'Fake Prov.gif', bytes, kind: 'gif', isApp: true, appId: 'fakeprov', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Fake Prov.gif', parent: null, x: 620, y: 320, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  });
  await sleep(700); // meta decode is async — give the repaint a beat
  await page.evaluate(() => GifOS.desktop.render());
  await sleep(400);
  const outsideX = await page.locator('.icon', { hasText: 'Fake Prov.gif' }).locator('.provider-x').count();
  check('a provider outside the Providers folder wears the red ✕', outsideX === 1);

  const provFid = await page.evaluate(() => window.__provFid);
  await page.evaluate((fid) => {
    localStorage.setItem('gifos_ai_config', JSON.stringify({ tts: { app: fid, appId: 'fakeprov', appName: 'Fake Prov' } }));
  }, provFid);

  await seedConsumer(page, 'ttsuser', 'TtsUser');
  {
    const { app, out } = await runConsumer(page, context, 'TtsUser.gif');
    check('the broker REFUSES a provider that is not in the Providers folder', /err:.*Providers folder/i.test(out), out.slice(0, 120));
    await app.close();
  }

  // ---- 3. moved into the folder: ✕ gone, calls served -----------------------
  await page.evaluate(async (fid) => {
    const items = await GifOS.store.allItems();
    const it = items.find((i) => i.fileId === fid);
    it.parent = 'sys_providers'; it.x = 90; it.y = 90;
    await GifOS.store.putItem(it);
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, provFid);
  await sleep(400);
  const rootX = await page.locator('.icon', { hasText: 'Fake Prov.gif' }).count();
  check('the provider icon left the root when filed into Providers', rootX === 0);
  {
    const { app, out } = await runConsumer(page, context, 'TtsUser.gif');
    check('gifos.ai.tts is answered by the provider app (RIFF bytes, audio/wav)', /^ok:RIFF:12:audio\/wav$/.test(out), out.slice(0, 120));
    await app.close();
  }

  // ---- 4. THE HARD RULE: a networked "provider" is refused ------------------
  await page.evaluate(async () => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'evilprov', name: 'Evil Prov', entry: 'index.html', capabilities: { network: ['example.com'] }, provides: { ai: ['tts'] } }),
      'index.html': '<!doctype html><meta charset="utf-8"><script>gifos.provider.serve({ tts: function(){ return { bytes:new ArrayBuffer(4), mime:"audio/wav" }; } });<\/script>',
    });
    const fid = GifOS.store.uid('file');
    window.__evilFid = fid;
    await GifOS.store.putFile({ id: fid, name: 'Evil Prov.gif', bytes, kind: 'gif', isApp: true, appId: 'evilprov', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Evil Prov.gif', parent: 'sys_providers', x: 160, y: 90, iconSize: 64 });
  });
  const evilFid = await page.evaluate(() => window.__evilFid);
  await page.evaluate((fid) => {
    localStorage.setItem('gifos_ai_config', JSON.stringify({ tts: { app: fid, appId: 'evilprov', appName: 'Evil Prov' } }));
  }, evilFid);
  {
    const { app, out } = await runConsumer(page, context, 'TtsUser.gif');
    check('a provider declaring network is refused even inside the folder', /err:.*network-less/i.test(out), out.slice(0, 120));
    await app.close();
  }

  // ---- 5 + 7. the REAL Offline TTS provider: engine in-GIF, install, speak --
  const pvBytes = fs.readFileSync(appGif('offline-tts'));
  check('the committed Offline TTS GIF CARRIES its engine (in-GIF, no assets)', pvBytes.length > 1e6 && pvBytes.length < 8e6, pvBytes.length + ' bytes');
  const pvFid = await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Offline Text to Speech.gif', bytes, kind: 'gif', isApp: true, appId: 'offline-tts', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Offline Text to Speech.gif', parent: 'sys_providers', x: 230, y: 90, iconSize: 64 });
    localStorage.setItem('gifos_ai_config', JSON.stringify({ tts: { app: fid, appId: 'offline-tts', appName: 'Offline Text to Speech' } }));
    // The consumer acked its abilities on an earlier run and the ack persists
    // per capability-signature — clear it so the sheet shows again, because
    // the point of the next check is what the sheet SAYS about the provider.
    localStorage.removeItem('gifos_capack_ttsuser');
    return fid;
  }, pvBytes.toString('base64'));
  {
    // Engine download (5.6 MB from the static server) + boot + synthesis.
    const { app, ack, out } = await runConsumer(page, context, 'TtsUser.gif', 90000);
    check('the consumer acknowledgement NAMES the provider app', /Offline Text to Speech/.test(ack) && /on this device/.test(ack), ack.slice(0, 160));
    const m = /^ok:(....):(\d+):(.*)$/.exec(out) || [];
    check('Offline Text to Speech answers gifos.ai.tts with a real WAV', m[1] === 'RIFF' && Number(m[2]) > 20000 && m[3] === 'audio/wav', out.slice(0, 120));
    await app.close();
  }
  // No manifest.assets → no backfill, no repack: the stored file must still
  // be byte-for-byte the committed GIF (a rewrite here would mean the asset
  // path fired for an app that doesn't declare any).
  const pvStored = await page.evaluate(async (fid) => { const f = await GifOS.store.getFile(fid); return f.bytes.byteLength || f.bytes.length; }, pvFid);
  check('an assets-free app is never repacked (stored bytes = committed bytes)', pvStored === pvBytes.length, pvStored + ' vs ' + pvBytes.length);

  // ---- 8. download-then-seal, guarded via a synthetic asset provider --------
  // Pins a file the 8099 static server actually serves; hash computed here
  // from the same bytes the server reads. The 8 MB catalog floor is store
  // POLICY (build-app-catalog.mjs) — the loader itself is size-agnostic,
  // which is what lets this guard run on a small file.
  const assetSrc = fs.readFileSync(require.resolve('../../site/js/gifos-net.js'));
  const assetSha = require('crypto').createHash('sha256').update(assetSrc).digest('hex');
  await page.evaluate(async ({ sha, size }) => {
    const html = '<!doctype html><meta charset="utf-8"><script>' +
      'gifos.provider.serve({ tts: function(){' +
      '  return gifos.assets("blob.bin").then(function(b){ return { bytes:b, mime:"application/octet-stream" }; });' +
      '} });<\/script>';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'assetprov', name: 'Asset Prov', entry: 'index.html', capabilities: {},
        provides: { ai: ['tts'] },
        assets: [{ url: '/js/gifos-net.js', sha256: sha, path: 'blob.bin', bytes: size }] }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    window.__assetFid = fid;
    window.__assetGifLen = bytes.length;
    await GifOS.store.putFile({ id: fid, name: 'Asset Prov.gif', bytes, kind: 'gif', isApp: true, appId: 'assetprov', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Asset Prov.gif', parent: 'sys_providers', x: 300, y: 90, iconSize: 64 });
    localStorage.setItem('gifos_ai_config', JSON.stringify({ tts: { app: fid, appId: 'assetprov', appName: 'Asset Prov' } }));
  }, { sha: assetSha, size: assetSrc.length });
  {
    const { app, out } = await runConsumer(page, context, 'TtsUser.gif', 30000);
    check('the provider mount BACKFILLS a pinned asset and serves its bytes', out.indexOf(':' + assetSrc.length + ':') >= 0, out.slice(0, 120));
    await app.close();
  }
  const assetState = await page.evaluate(async () => {
    const blob = await GifOS.store.getAsset(window.__assetFid, 'blob.bin');
    const f = await GifOS.store.getFile(window.__assetFid);
    return { cached: blob ? blob.size : -1, gifLen: f.bytes.byteLength || f.bytes.length };
  });
  check('the fetched asset was CACHED in the computer’s asset store (Blob tier)', assetState.cached === assetSrc.length, assetState.cached + ' vs ' + assetSrc.length);
  const expectedGifLen = await page.evaluate(() => window.__assetGifLen);
  check('…and the stored GIF stayed byte-identical (weights live beside it, not in it)', assetState.gifLen === expectedGifLen, assetState.gifLen + ' vs ' + expectedGifLen);

  // ---- 6. Reader (the seeded consumer) lives in Tools -----------------------
  await page.locator('.icon', { hasText: 'Tools' }).dblclick();
  await sleep(500);
  const toolLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Reader is seeded in the Tools folder', toolLabels.includes('Reader.gif'), toolLabels.join(','));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
