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
//  9. The SECOND tts provider, Offline Neural Text to Speech: the engine rides
//     in-GIF but its 24 MB KittenTTS weights are a manifest pin, so in this
//     hermetic suite they can never arrive — which pins both halves of that
//     case. A plain tts call must FAIL with a fixable message rather than
//     quietly substituting the built-in tone (a consumer handed a beep cannot
//     tell it from speech), while the reserved voice "self-test" still returns
//     a real RIFF WAV, proving phonemizer + tokenizer + style table + ORT/WASM
//     + WAV encoder + the provider bridge entirely offline.
// 10. The REAL Offline Cheap Text LLM BitNet provider: llama.cpp (wllama)
//     boots inside the hidden provider mount — classic worker from blob,
//     wasm from a self-minted blob: URL, in-GIF self-test model — and
//     answers a 'cheapest' chat from the SEEDED Ask AI app, honestly
//     labeled as self-test output. AND it STREAMS: the answer is caught
//     half-drawn in Ask AI. The provider generated token by token all along,
//     but the protocol had no channel for those tokens, so they piled up
//     privately and arrived in one lump — an on-device model that takes six
//     minutes showed nothing whatever for six minutes.
//
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const fs = require('fs');
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask AI keeps its conversation across opens (e2e-askai.js guards that). Each
// provider step below wants a COLD conversation, so it clears one first. The
// button is a no-op on an empty conversation, so the note may never appear —
// hence the swallowed timeout rather than a wait we insist on.
async function newChat(fr) {
  await fr.locator('#new').click().catch(() => {});
  await fr.locator('.note', { hasText: 'New chat' }).waitFor({ timeout: 5000 }).catch(() => {});
  await sleep(200);
}

// A consumer app that declares ai:['tts'] and reports what one tts call did.
// `extra` merges into the request — gifos.ai.tts passes arbitrary fields
// through to the provider, which is how the neural case below asks for the
// self-test model by name instead of the weights it cannot download here.
const consumerHtml = (extra) => '<!doctype html><meta charset="utf-8"><div id="out">…</div>' +
  '<script>(async function(){' +
  '  var el=document.getElementById("out");' +
  '  try { var r=await gifos.ai.tts(Object.assign({ text:"hello there" }, ' + JSON.stringify(extra || {}) + '));' +
  '    var u=new Uint8Array(r.bytes||new ArrayBuffer(0));' +
  '    var head=String.fromCharCode(u[0]||0,u[1]||0,u[2]||0,u[3]||0);' +
  '    el.textContent="ok:"+head+":"+u.length+":"+(r.mime||"");' +
  '  } catch(e){ el.textContent="err:"+e.message; }' +
  '})();<\/script>';
const CONSUMER_HTML = consumerHtml();

// `at` matters: putItem writes the cell VERBATIM (it is not saveItem, which
// would place around an occupant), so two consumers seeded at one spot sit on
// top of each other and the upper one silently swallows the lower one's
// dblclick — "…NeuralUser.gif… intercepts pointer events", 180s of nothing.
async function seedConsumer(page, appId, name, extra, at) {
  await page.evaluate(async ({ appId, name, html, at }) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId, name, entry: 'index.html', capabilities: { db: true, ai: ['tts'] } }),
      'index.html': html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: name + '.gif', bytes, kind: 'gif', isApp: true, appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: name + '.gif', parent: null, x: (at && at.x) || 620, y: (at && at.y) || 460, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { appId, name, html: consumerHtml(extra), at });
  // render() REPLACES every icon element. A dblclick that lands while they are
  // being swapped hits a detached node and opens nothing — the tab never
  // appears and the wait burns its whole timeout looking like a broken app.
  await sleep(600);
}

// Open a desktop icon in its app tab and return the result line from the
// consumer's #out div (dismissing the abilities acknowledgement on the way).
async function runConsumer(page, context, label, outTimeout, openTimeout) {
  const [app] = await Promise.all([context.waitForEvent('page', { timeout: openTimeout || 30000 }), page.locator('.icon', { hasText: label }).dblclick()]);
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

  // THIS SUITE IS OFFLINE, and now says so mechanically. The BitNet provider
  // pins ~1 GB of weights in its manifest, so the provider mount's asset
  // backfill would otherwise reach for huggingface.co on every run — turning a
  // hermetic gate into a slow, network-dependent one (and, in a headless
  // profile, a QuotaExceededError). Blocking everything off-origin keeps the
  // suite honest AND exercises exactly the case we must not regress: the
  // weights have NOT been downloaded, so the provider must still serve from
  // its labeled in-GIF self-test model.
  let offOriginBlocked = 0;
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u) || /^(data|blob):/.test(u)) return route.continue();
    offOriginBlocked++;
    return route.abort();
  });
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

  // ---- 5b. the SECOND tts provider: Offline Neural Text to Speech -----------
  // Same brokered loop, different trade: the engine (ORT + espeak-ng + the
  // style tables) rides in-GIF, and the 24 MB KittenTTS weights arrive by
  // manifest pin. This suite is hermetic, so those weights are exactly what
  // CANNOT arrive — which makes it the right place to pin both halves of the
  // behaviour that matters when a download hasn't happened:
  //
  //   * a plain tts call FAILS, with a message that tells the user what to do.
  //     It must never quietly fall back to the self-test tone: a consumer app
  //     handed a beep cannot tell it from speech, and the user would hear a
  //     defect instead of an instruction.
  //   * the RESERVED voice "self-test" still returns a real RIFF WAV, so the
  //     whole pipeline — phonemizer, tokenizer, style table, ORT/WASM session,
  //     WAV encoder, provider bridge — is proven offline and in the gate
  //     rather than only on a machine with huggingface.co reachable.
  const nnBytes = fs.readFileSync(appGif('offline-tts-neural'));
  check('the committed Neural TTS GIF carries its engine in-GIF', nnBytes.length > 8e6 && nnBytes.length < 20e6, nnBytes.length + ' bytes');
  {
    const mf = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../apps/offline-tts-neural/manifest.json'), 'utf8'));
    check('…and pins its weights by url + sha256 + bytes',
      !!(mf.assets && mf.assets[0] && /^https:\/\/huggingface\.co\//.test(mf.assets[0].url)
         && /^[a-f0-9]{64}$/.test(mf.assets[0].sha256) && mf.assets[0].bytes > 8 * 1024 * 1024),
      JSON.stringify(mf.assets && mf.assets[0]));
    check('…declares tts and NO network capability (the provider hard rule)',
      mf.provides && mf.provides.ai.indexOf('tts') === 0 && !mf.capabilities.network && !mf.capabilities.api,
      JSON.stringify(mf.capabilities));
  }
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Offline Neural Text to Speech.gif', bytes, kind: 'gif', isApp: true, appId: 'offline-tts-neural', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Offline Neural Text to Speech.gif', parent: 'sys_providers', x: 90, y: 200, iconSize: 64 });
    localStorage.setItem('gifos_ai_config', JSON.stringify({ tts: { app: fid, appId: 'offline-tts-neural', appName: 'Offline Neural Text to Speech' } }));
    localStorage.removeItem('gifos_capack_ttsneural');
    localStorage.removeItem('gifos_capack_ttsneuralst');
  }, nnBytes.toString('base64'));

  await seedConsumer(page, 'ttsneural', 'NeuralUser', null, { x: 470, y: 460 });
  {
    // Booting an 11 MB wasm runtime out of a 12 MB GIF is slower than eSpeak's
    // 5.6 MB, hence the longer budget — this is a real engine start, not a stub.
    const { app, ack, out } = await runConsumer(page, context, 'NeuralUser.gif', 180000);
    check('the consumer ack NAMES the neural provider', /Offline Neural Text to Speech/.test(ack) && /on this device/.test(ack), ack.slice(0, 160));
    check('with its weights undownloadable, the neural provider FAILS rather than beeping',
      /^err:/.test(out) && /voice weights are not on this device/i.test(out), out.slice(0, 200));
    await app.close();
  }
  // A voice name, not a flag: providerReq forwards a fixed whitelist (text,
  // voice, format, speed, pitch) and drops anything else, so a bespoke field
  // would never reach the provider at all.
  await seedConsumer(page, 'ttsneuralst', 'NeuralSelfTest', { voice: 'self-test' }, { x: 320, y: 460 });
  {
    const { app, out } = await runConsumer(page, context, 'NeuralSelfTest.gif', 180000, 180000);
    const m = /^ok:(....):(\d+):(.*)$/.exec(out) || [];
    check('the neural provider answers gifos.ai.tts with a real WAV (self-test model, fully offline)',
      m[1] === 'RIFF' && Number(m[2]) > 20000 && m[3] === 'audio/wav', out.slice(0, 120));
    check('…which means ORT, espeak-ng, the style table and the WAV encoder all ran in the sandbox', m[1] === 'RIFF');
    await app.close();
  }

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

  // ---- 9. the REAL BitNet LLM provider serves the seeded Ask AI app ---------
  // llama.cpp (wllama) boots inside the hidden provider mount and answers a
  // 'cheapest' chat from Ask AI — the DEFAULT app that wants this role. The
  // in-GIF self-test model makes this run offline and fast; the handler
  // prefixes its token soup with a self-test label, which is exactly what we
  // assert (a real reply that is honestly labeled).
  const llmBytes = fs.readFileSync(appGif('offline-llm-bitnet'));
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Offline Cheap Text LLM BitNet.gif', bytes, kind: 'gif', isApp: true, appId: 'offline-llm-bitnet', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Offline Cheap Text LLM BitNet.gif', parent: 'sys_providers', x: 370, y: 90, iconSize: 64 });
    localStorage.setItem('gifos_ai_config', JSON.stringify({ cheapest: { app: fid, appId: 'offline-llm-bitnet', appName: 'Offline Cheap Text LLM BitNet' } }));
  }, llmBytes.toString('base64'));

  // ---- 6. Reader (the seeded consumer) lives in Tools -----------------------
  await page.locator('.icon', { hasText: 'Tools' }).dblclick();
  await sleep(500);
  const toolLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('Reader is seeded in the Tools folder', toolLabels.includes('Reader.gif'), toolLabels.join(','));

  {
    const [askai] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Ask AI.gif' }).dblclick()]);
    askai.on('pageerror', (e) => console.log('  [askai pageerror]', e.message));
    await askai.waitForSelector('iframe', { timeout: 10000 });
    const ackBox = askai.locator('.perm-box', { hasText: 'would like to' });
    let ack = '';
    try { await ackBox.waitFor({ timeout: 5000 }); ack = await ackBox.textContent(); await ackBox.locator('.done').click(); } catch (e) { /* already acked */ }
    check('Ask AI’s ack sheet names the BitNet provider', /Offline Cheap Text LLM BitNet/.test(ack) && /on this device/.test(ack), ack.slice(0, 160));
    // Watch the provider heartbeat cross into the broker. A provider answering
    // an on-device model can take minutes, so the broker's timeout is IDLE and
    // these pings are what re-arm it; if they stop flowing, long answers start
    // dying at the timeout again (which is exactly what shipped once).
    // …and the ANSWER ITSELF as it is written (provider-delta, ctx.delta). The
    // tokens always existed inside the provider; until there was a channel for
    // them they were accumulated privately and handed over in one lump, so a
    // six-minute on-device answer showed nothing at all for six minutes.
    await askai.evaluate(() => {
      window.__provPings = 0; window.__provDeltas = 0;
      window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || d.ns !== 'gifos') return;
        if (d.type === 'provider-progress') window.__provPings++;
        if (d.type === 'provider-delta') window.__provDeltas++;
      });
    });
    const fr = askai.frameLocator('#appmount iframe');
    await fr.locator('#t').fill('hello');
    await fr.locator('#f button').click();
    // Poll the bubble WHILE it answers: a streamed answer is caught half-drawn,
    // which is the only way to tell it from one that lands complete at the end.
    const growth = [];
    let watchOn = true;
    const watching = (async () => {
      while (watchOn) {
        const t = await fr.locator('.m.ai').last().textContent().catch(() => null);
        if (t != null && t !== '…' && growth[growth.length - 1] !== t) growth.push(t);
        await sleep(120);
      }
    })();
    // First call boots llama.cpp in the hidden mount (10 MB GIF decode + wasm
    // init + model load) — generous timeout, one honest wait. On timeout,
    // SAY WHAT THE APP SHOWED (an error bubble reads as a silent hang
    // otherwise — that's how the module-worker bug hid).
    await fr.locator('.m.ai').last().filter({ hasText: /self-test model/ }).waitFor({ timeout: 150000 }).catch(async (e) => {
      watchOn = false;
      const shown = await fr.locator('.m.ai').last().textContent().catch(() => '(no ai bubble)');
      throw new Error('Ask AI never got the self-test answer; the app shows: ' + String(shown).slice(0, 300));
    });
    // The turn ends on the total time, not on the last token (e2e-askai.js
    // paid for that lesson) — keep watching until the stamp says so.
    await fr.locator('.row.ai').last().locator('.stamp').filter({ hasText: /total/ }).waitFor({ timeout: 60000 }).catch(() => {});
    watchOn = false;
    await watching;
    const reply = await fr.locator('.m.ai').last().textContent();
    check('Ask AI (the seeded cheapest consumer) is answered by llama.cpp in the provider sandbox',
      /\[self-test model — token soup/.test(reply) && reply.length > 60, reply.slice(0, 120));
    // The provider PINS ~1 GB of weights it could not fetch here (all
    // off-origin traffic is blocked above). It still answered, from the
    // in-GIF self-test model, honestly labeled. Guards the regression where a
    // failed asset backfill made the broker refuse to serve at all, pre-empting
    // the app's own fallback.
    const provPings = await askai.evaluate(() => window.__provPings);
    check('the provider heartbeats while it works (idle timeout re-arms, so slow answers are not killed)',
      provPings > 0, provPings + ' provider-progress ping(s)');

    // An ON-DEVICE answer streams exactly like a hosted one.
    const provDeltas = await askai.evaluate(() => window.__provDeltas);
    check('the provider streams the answer as it writes it (ctx.delta → provider-delta)',
      provDeltas > 1, provDeltas + ' provider-delta fragment(s)');
    const partials = growth.filter((t) => t !== reply);
    check('…so Ask AI paints an on-device answer BEING WRITTEN, not only when it is finished',
      partials.length >= 3, growth.length + ' frame(s), ' + partials.length + ' partial(s)');
    check('…each frame grows from the last, and the self-test label leads (soup never masquerades)',
      partials.every((t, i) => (i === 0 || t.startsWith(partials[i - 1])) && /^\[self-test model/.test(t)),
      JSON.stringify(partials.slice(0, 2)).slice(0, 200));
    check('…and the answer it lands on is the one that was being written',
      reply.startsWith(partials.length ? partials[partials.length - 1] : reply), reply.slice(0, 80));
    check('a pinned-asset provider still serves its self-test model when the download has NOT happened',
      offOriginBlocked > 0 && /\[self-test model — token soup/.test(reply),
      offOriginBlocked + ' off-origin request(s) blocked');
    await askai.close();
  }

  // ---- 10. THE SIBLING PROVIDER: Offline Cheap Text LLM Gemma 3 ------------
  // Two apps now provide the SAME 'cheapest' role (docs/providers.md: no
  // auto-assignment — the user picks). Guard that the second one boots its own
  // engine in the hidden provider mount and answers, honestly labeled with ITS
  // model's name. Without this the Gemma app would ship with nothing testing it.
  {
    const gemmaBytes = fs.readFileSync(appGif('offline-llm-gemma'));
    await page.evaluate(async (b64) => {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: 'Offline Cheap Text LLM Gemma 3.gif', bytes, kind: 'gif', isApp: true, appId: 'offline-llm-gemma', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Offline Cheap Text LLM Gemma 3.gif', parent: 'sys_providers', x: 470, y: 90, iconSize: 64 });
      // Reassign the role to the sibling — the switch the user makes in
      // Settings -> AI models.
      localStorage.setItem('gifos_ai_config', JSON.stringify({ cheapest: { app: fid, appId: 'offline-llm-gemma', appName: 'Offline Cheap Text LLM Gemma 3' } }));
    }, gemmaBytes.toString('base64'));

    const [askai2] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Ask AI.gif' }).dblclick()]);
    await askai2.waitForSelector('iframe', { timeout: 10000 });
    const ackBox2 = askai2.locator('.perm-box', { hasText: 'would like to' });
    try { await ackBox2.waitFor({ timeout: 5000 }); await ackBox2.locator('.done').click(); } catch (e) { /* already acked */ }
    const fr2 = askai2.frameLocator('#appmount iframe');
    // Ask AI REMEMBERS its conversation now, so a second open arrives carrying
    // the BitNet exchange above. Reset it: this step is about what THIS
    // provider answers cold, and feeding it the previous provider's token soup
    // would make the two runs incomparable (and grow the prompt every round).
    await newChat(fr2);
    await fr2.locator('#t').fill('hello');
    await fr2.locator('#f button').click();
    await fr2.locator('.m.ai').last().filter({ hasText: /self-test model/ }).waitFor({ timeout: 150000 }).catch(async () => {
      const shown = await fr2.locator('.m.ai').last().textContent().catch(() => '(no ai bubble)');
      throw new Error('Gemma provider never answered; the app shows: ' + String(shown).slice(0, 300));
    });
    const reply2 = await fr2.locator('.m.ai').last().textContent();
    check('the SIBLING provider (Gemma) serves the same cheapest role from its own GIF',
      /\[self-test model — token soup/.test(reply2) && /Install the Gemma 3 weights/.test(reply2),
      reply2.slice(0, 110));
    await askai2.close();
  }

  // ---- 11. THE THIRD PROVIDER: Offline Cheap Text LLM Gemma 4 -------------
  // Three apps now provide 'cheapest'. Same guard as the Gemma 3 step: its own
  // GIF, its own engine boot, its own honest label. Each sibling carries a
  // DIFFERENT prompt format, so a shared-code regression would surface here.
  {
    const g4 = fs.readFileSync(appGif('offline-llm-gemma4'));
    await page.evaluate(async (b64) => {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: 'Offline Cheap Text LLM Gemma 4.gif', bytes, kind: 'gif', isApp: true, appId: 'offline-llm-gemma4', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Offline Cheap Text LLM Gemma 4.gif', parent: 'sys_providers', x: 570, y: 90, iconSize: 64 });
      localStorage.setItem('gifos_ai_config', JSON.stringify({ cheapest: { app: fid, appId: 'offline-llm-gemma4', appName: 'Offline Cheap Text LLM Gemma 4' } }));
    }, g4.toString('base64'));

    const [askai3] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Ask AI.gif' }).dblclick()]);
    await askai3.waitForSelector('iframe', { timeout: 10000 });
    const ackBox3 = askai3.locator('.perm-box', { hasText: 'would like to' });
    try { await ackBox3.waitFor({ timeout: 5000 }); await ackBox3.locator('.done').click(); } catch (e) { /* already acked */ }
    const fr3 = askai3.frameLocator('#appmount iframe');
    await newChat(fr3);                     // same reason as the Gemma 3 step
    await fr3.locator('#t').fill('hello');
    await fr3.locator('#f button').click();
    await fr3.locator('.m.ai').last().filter({ hasText: /self-test model/ }).waitFor({ timeout: 150000 }).catch(async () => {
      const shown = await fr3.locator('.m.ai').last().textContent().catch(() => '(no ai bubble)');
      throw new Error('Gemma 4 provider never answered; the app shows: ' + String(shown).slice(0, 300));
    });
    const reply3 = await fr3.locator('.m.ai').last().textContent();
    check('the THIRD provider (Gemma 4) serves the same cheapest role from its own GIF',
      /\[self-test model — token soup/.test(reply3) && /Install the Gemma 4 weights/.test(reply3),
      reply3.slice(0, 110));
    await askai3.close();
  }

  // ---- 10b. the OS says what a provider is doing while you wait -------------
  // An on-device model loads hundreds of megabytes before it can produce a
  // single token — minutes on a phone — and the OS used to say NOTHING for the
  // whole of it. The asking app sat on a promise, the user sat on a blank
  // answer, and a model warming up was indistinguishable from a computer that
  // had given up. ctx.progress() existed but carried no words: it only re-armed
  // the idle timer, so the one party that knew what was happening had no way to
  // say it.
  //
  // Driven with a SYNTHETIC provider that reports a known phase and fraction,
  // so this asserts the plumbing rather than the timing of somebody's laptop.
  {
    await page.evaluate(async () => {
      const html = '<!doctype html><meta charset="utf-8"><script>' +
        'gifos.provider.serve({ tts: function(req, ctx){' +
        '  ctx.progress("Loading the test brain…", 0.42);' +
        '  return new Promise(function(res){ setTimeout(function(){' +
        '    ctx.progress("Writing the answer… (7 tokens)");' +
        '    setTimeout(function(){ res({ bytes: new Uint8Array([82,73,70,70]).buffer, mime: "audio/wav" }); }, 900);' +
        '  }, 900); });' +
        '} });<\/script>';
      const bytes = await GifOS.gif.encode({
        'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'slowprov', name: 'Slow Prov', entry: 'index.html',
          capabilities: {}, provides: { ai: ['tts'] } }),
        'index.html': html,
      });
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: 'Slow Prov.gif', bytes, kind: 'gif', isApp: true, appId: 'slowprov', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Slow Prov.gif', parent: 'sys_providers', x: 420, y: 90, iconSize: 64 });
      localStorage.setItem('gifos_ai_config', JSON.stringify({ tts: { app: fid, appId: 'slowprov', appName: 'Slow Prov' } }));
      window.__slowFid = fid;
    });

    const app = await context.newPage();
    app.on('pageerror', (e) => console.log('  [app pageerror] ' + e.message));
    const consumerId = await page.evaluate(async () => {
      const f = (await GifOS.store.allFiles()).find((x) => x.appId === 'ttsuser');
      return f && f.id;
    });
    // Sample the pill continuously, ARMED BEFORE THE PAGE LOADS. The consumer
    // fires its AI call the moment it mounts, so a recorder installed after
    // navigation races the very thing it is trying to watch — the first cut of
    // this block spent four seconds waiting on an abilities prompt that had
    // been acknowledged earlier in the suite, and by the time it looked, the
    // whole answer had come and gone. Asserting on whatever happens to be on
    // screen at one arbitrary moment is the other half of the same mistake.
    await app.addInitScript(() => {
      window.__said = [];
      setInterval(() => {
        const el = document.getElementById('gifos-provider-busy');
        if (!el) return;
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (window.__said[window.__said.length - 1] !== t) window.__said.push(t);
      }, 100);
    });
    await app.goto(BASE + '/run.html#id=' + consumerId);
    await app.waitForSelector('iframe', { timeout: 15000 });
    const ackBox = app.locator('.perm-box', { hasText: 'would like to' });
    try { await ackBox.waitFor({ timeout: 4000 }); await ackBox.locator('.done').click(); } catch (e) { /* already acked */ }

    await app.frameLocator('#appmount iframe').locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 60000 });
    await sleep(600);
    const said = await app.evaluate(() => window.__said);
    const all = said.join(' ~ ');

    check('the OS shows a status while a provider is working', said.length > 0, all.slice(0, 160));
    check('…carrying the PROVIDER’S OWN words, not a generic spinner',
      /Loading the test brain/.test(all), all.slice(0, 200));
    check('…and following it to the next phase', /Writing the answer/.test(all), all.slice(-120));
    check('…with the elapsed time, so a long wait is legible as progress',
      /\ds so far/.test(all), all.slice(0, 120));
    check('the status is GONE once the answer arrives',
      !(await app.evaluate(() => !!document.getElementById('gifos-provider-busy'))));

    // How long it took is remembered, so the NEXT wait can carry a number
    // instead of asking the user to guess. Cold and warm are separate: they
    // differ by orders of magnitude and quoting the warm one during a load
    // would make the wait feel broken.
    const timing = await app.evaluate(async (fid) => (await GifOS.store.getState('sys::provider-timing') || {})[fid], await page.evaluate(() => window.__slowFid));
    check('the OS remembers how long the COLD call took', !!(timing && timing.cold > 0), JSON.stringify(timing));

    await app.reload();                                  // a fresh tab = cold again, but now MEASURED (the recorder re-arms itself on load)
    await app.waitForSelector('iframe', { timeout: 15000 });
    try { await ackBox.waitFor({ timeout: 4000 }); await ackBox.locator('.done').click(); } catch (e) {}
    await app.frameLocator('#appmount iframe').locator('#out').filter({ hasText: /ok:|err:/ }).waitFor({ timeout: 60000 });
    const said2 = (await app.evaluate(() => window.__said || [])).join(' ~ ');
    check('a second cold run quotes the measured wait instead of guessing',
      /usually about/.test(said2), said2.slice(0, 200));
    await app.close();
  }

  // ---- 11. deleting a Provider takes its WEIGHTS with it --------------------
  // A Provider's cached download is the largest thing on the computer by an
  // order of magnitude — hundreds of megabytes to a gigabyte — and it lives in
  // a sibling database no user can see or open. If a delete leaves it behind,
  // the space is gone forever with nothing on screen to explain it, and no
  // amount of "I deleted that app" will get it back.
  //
  // Driven through the REAL journey (icon menu → Move to Trash → Empty Trash),
  // because that is where a regression would actually land: purgeItem drops
  // the assets, and a menu rewired to some other deletion would look fine.
  {
    const fid = await page.evaluate(() => window.__assetFid);
    // Onto the Home Screen root so the journey is drivable — the icon lives in
    // the Providers folder, which is the provider tests' business, not this
    // one's. Placement is setup here, not the thing under test.
    await page.evaluate(async (id) => {
      const all = await GifOS.store.allItems();
      const it = all.find((i) => i.fileId === id);
      it.parent = null; it.x = 520; it.y = 380;
      await GifOS.store.putItem(it);
    }, fid);
    await page.reload();
    await page.waitForSelector('.icon', { timeout: 20000 });
    await sleep(800);

    const before = await page.evaluate(async (id) => {
      const blob = await GifOS.store.getAsset(id, 'blob.bin');
      return { asset: blob ? blob.size : 0, bytes: await GifOS.store.assetBytes(id) };
    }, fid);
    check('setup: the provider still holds its cached asset before we delete it',
      before.asset === assetSrc.length && before.bytes === assetSrc.length, JSON.stringify(before));

    const icon = page.locator('.icon', { hasText: 'Asset Prov.gif' });
    await icon.click({ button: 'right' });
    await page.locator('.ctx >> text=Move to Trash').click();
    await sleep(600);
    await page.locator('.icon', { hasText: 'Trash' }).click({ button: 'right' });
    await page.locator('.ctx >> text=Empty Trash').click();
    await page.waitForSelector('.modal', { timeout: 10000 });
    const confirmText = (await page.locator('.modal p').textContent()) || '';
    // The reclaimed space is SAID, because "did that really remove the 800 MB?"
    // is otherwise unanswerable from anywhere in the UI.
    check('emptying the Trash says how much downloaded model data it frees',
      /frees the .*(KB|MB|GB) of downloaded model data/.test(confirmText), confirmText.slice(0, 160));
    await page.locator('.modal-actions button.danger').click();
    await sleep(1500);

    const after = await page.evaluate(async (id) => ({
      file: !!(await GifOS.store.getFile(id).catch(() => null)),
      asset: !!(await GifOS.store.getAsset(id, 'blob.bin').catch(() => null)),
      bytes: await GifOS.store.assetBytes(id),
    }), fid);
    check('deleting a Provider removes its GIF', !after.file);
    check('DELETING A PROVIDER ALSO FREES ITS SIDELOADED WEIGHTS', !after.asset && after.bytes === 0, JSON.stringify(after));
  }

  // ---- 12. and a leak that got past everything is swept up at boot ----------
  // The belt to that braces. Every deletion route drops its own assets today,
  // so this finds nothing on a healthy computer — it exists because what is
  // being leaked is a gigabyte, invisibly: a route added later that forgets, a
  // delete interrupted half way, or an icon removed by a build that predates
  // the asset tier all end the same way.
  {
    const ghost = await page.evaluate(async () => {
      const id = 'file_ghost_no_such_icon';
      await GifOS.store.putAsset(id, 'orphan.bin', new Blob([new Uint8Array(4096)]));
      const live = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: live, name: 'Keeper.gif', bytes: new Uint8Array([71, 73, 70]), kind: 'gif', mime: 'image/gif' });
      await GifOS.store.putAsset(live, 'kept.bin', new Blob([new Uint8Array(2048)]));
      return { id, live, orphan: await GifOS.store.assetBytes(id), keeper: await GifOS.store.assetBytes(live) };
    });
    check('setup: an orphaned asset row exists alongside a live one',
      ghost.orphan === 4096 && ghost.keeper === 2048, JSON.stringify(ghost));

    await page.reload();
    await page.waitForSelector('.icon', { timeout: 20000 });
    await sleep(2000);                                    // the sweep runs after first paint
    const swept = await page.evaluate(async (g) => ({
      orphan: await GifOS.store.assetBytes(g.id),
      keeper: await GifOS.store.assetBytes(g.live),
    }), ghost);
    check('a boot sweeps assets whose icon is gone', swept.orphan === 0, JSON.stringify(swept));
    check('…and NEVER touches assets whose icon is still there', swept.keeper === 2048, JSON.stringify(swept));
  }

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
