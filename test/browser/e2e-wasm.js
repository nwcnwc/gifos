// End-to-end: the capabilities.wasm "hatch".
// - An app that declares `wasm` may create a Web Worker from a blob: URL and
//   instantiate WebAssembly — the two things the relaxed CSP unlocks
//   ('wasm-unsafe-eval' + worker-src blob:). An app that does NOT declare it is
//   blocked on both (default APP_CSP), proving the hatch is opt-in.
// - connect-src stays 'none' either way (the worker gets no network) — enforced
//   by the rest of the suite; here we only assert compute is unlocked.
// - Smoke test: the real apps/chess-grandmaster.gif boots full-strength
//   Stockfish (Worker + WASM, net embedded, zero fetch) and plays a reply move.
//
// Needs: static server on 8099.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { readFileSync, existsSync } = require('fs');
const path = require('path');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tiny app that reports whether it could (a) spin up a blob Worker and
// (b) instantiate a hand-rolled WASM module exporting add(a,b).
const PROBE_HTML = '<!doctype html><meta charset="utf-8"><div id="out">run</div><script>' +
  '(function(){var out=document.getElementById("out");var res={worker:"?",wasm:"?"};' +
  'function done(){out.textContent=JSON.stringify(res);}' +
  'try{var wb=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);' +
  'WebAssembly.instantiate(wb.buffer).then(function(r){res.wasm=String(r.instance.exports.add(40,2));done();}).catch(function(){res.wasm="ERR";done();});}catch(e){res.wasm="THROW";done();}' +
  'try{var b=new Blob(["onmessage=function(e){postMessage(\\"W\\"+(e.data+1))}"],{type:"text/javascript"});' +
  'var w=new Worker(URL.createObjectURL(b));w.onmessage=function(e){res.worker=String(e.data);done();};w.onerror=function(){res.worker="ERR";done();};w.postMessage(41);}catch(e){res.worker="THROW";done();}' +
  'done();})();<\/script>';

async function installProbe(page, { appId, caps, label, x }) {
  await page.evaluate(async (a) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: a.appId, name: a.appId, entry: 'index.html', capabilities: a.caps }),
      'index.html': a.html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.label, bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: a.label, parent: null, x: a.x, y: 300, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { appId, caps, label, x, html: PROBE_HTML });
}

async function installGif(page, { bytesB64, appId, label, x }) {
  await page.evaluate(async (a) => {
    const bin = atob(a.bytesB64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.label, bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: a.label, parent: null, x: a.x, y: 460, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { bytesB64, appId, label, x });
}

async function openApp(context, page, label) {
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: label }).dblclick()]);
  await app.waitForSelector('iframe', { timeout: 8000 });
  // dismiss the abilities acknowledgement if it shows
  await app.locator('.perm-modal .done').click({ timeout: 2500 }).catch(() => {});
  return app;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(400);

  // ---- hatch ON ----
  await installProbe(page, { appId: 'wasmyes', caps: { db: true, wasm: true }, label: 'WasmYes.gif', x: 120 });
  let app = await openApp(context, page, 'WasmYes.gif');
  let out = app.frameLocator('iframe').locator('#out');
  await out.filter({ hasText: '"worker"' }).waitFor({ timeout: 8000 });
  await sleep(600);
  let txt = await out.textContent();
  check('with wasm: a blob Worker runs', /"worker":"W42"/.test(txt), txt);
  check('with wasm: WebAssembly instantiates', /"wasm":"42"/.test(txt), txt);
  await app.close();

  // ---- hatch OFF (control) ----
  await installProbe(page, { appId: 'wasmno', caps: { db: true }, label: 'WasmNo.gif', x: 320 });
  app = await openApp(context, page, 'WasmNo.gif');
  out = app.frameLocator('iframe').locator('#out');
  await out.filter({ hasText: '"worker"' }).waitFor({ timeout: 8000 });
  await sleep(600);
  txt = await out.textContent();
  check('without wasm: the blob Worker is blocked', !/"worker":"W42"/.test(txt), txt);
  check('without wasm: WebAssembly is blocked', !/"wasm":"42"/.test(txt), txt);
  await app.close();

  // ---- real engine smoke ----
  const gifPath = path.join(__dirname, '..', '..', 'apps', 'chess-grandmaster.gif');
  if (existsSync(gifPath)) {
    const b64 = readFileSync(gifPath).toString('base64');
    await installGif(page, { bytesB64: b64, appId: 'chess-grandmaster', label: 'Chess Grandmaster.gif', x: 520 });
    app = await openApp(context, page, 'Chess Grandmaster.gif');
    app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
    const fr = app.frameLocator('iframe');
    // engine boots => Worker + WASM up under the hatch
    await fr.locator('#engineChip.ready').waitFor({ timeout: 45000 }).catch(() => {});
    const ready = await fr.locator('#engineChip.ready').count();
    check('real Stockfish engine boots (Worker+WASM, no network)', ready === 1);
    if (ready === 1) {
      await fr.locator('#startBtn').click();
      await fr.locator('#board .sq').first().waitFor({ timeout: 5000 });
      // White plays e2->e4: e2 is display index 52, e4 is 36 (white orientation)
      await fr.locator('#board .sq').nth(52).click();
      await fr.locator('#board .sq').nth(36).click();
      // engine should reply — move list gains a second half-move
      await fr.locator('#moveList .mv').nth(1).waitFor({ timeout: 25000 }).catch(() => {});
      const moves = await fr.locator('#moveList .mv').count();
      check('engine answers with a real move (search works)', moves >= 2, moves + ' half-moves');
      // WDL probabilities render
      const pw = await fr.locator('#pw').textContent();
      check('win/draw/loss probabilities are shown', /%/.test(pw || ''), 'White=' + pw);
    }
    await app.close();
  } else {
    console.log('SKIP — apps/chess-grandmaster.gif not built');
  }

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
