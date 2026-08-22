/*
 * Vocal Remover — what the app does when WebGPU is a LIE.
 *
 * Chrome will hand out a FALLBACK adapter: SwiftShader, a renderer on the CPU
 * pretending to be a GPU. Headless Chrome does it under --enable-unsafe-webgpu
 * — and so do real machines whose hardware WebGPU is blocklisted, which is how
 * a Chromebook came to sit on "Loading…" until a 150 s watchdog fired, restart
 * itself, and swear off a "GPU" it never had (2026-08-22). Measured here on
 * that adapter: session create for Inst HQ 3 allocates 1.82 GB and takes
 * minutes when it completes at all, and one small inference did not finish in
 * twelve. ORT's wasm engine beats it without trying.
 *
 * So the app REFUSES fallback adapters, and this suite runs with the flag ON
 * to hold it to that: the engine line must say the processor and say why, a
 * separation must complete on wasm, and the whole failed-GPU/restart dance
 * must never begin.
 *
 * It also proves the REDUCED-SEGMENT machinery inside the real sandbox: the
 * in-GIF self-test model is byte-patched by onnxseg.js (time axis 256 -> the
 * symbolic "time"), a session is created with freeDimensionOverrides
 * { time: 64 }, and a [1,4,1024,64] tensor must come back identical through
 * the identity model. That is the exact path a memory-constrained phone's
 * REAL weights take; the 66 MB versions of these assertions ran under Python
 * onnxruntime (bit-identical at 256, clean at 64/32 — see the README).
 *
 * Needs: static server on 8099, and the model host out of reach (same premise
 * as e2e-vocal-remover.js — the OS frame downloads pinned assets when the app
 * opens, and these assertions describe the self-test build):
 *
 *   https_proxy=http://127.0.0.1:1 http_proxy=http://127.0.0.1:1 \
 *   no_proxy=127.0.0.1,localhost node test/browser/e2e-vocal-remover-gpu.js
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync, writeFileSync, mkdtempSync } = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const GIF_B64 = readFileSync(appGif('vocal-remover')).toString('base64');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined && !c ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toneWav(seconds) {
  const sr = 44100, n = Math.round(seconds * sr);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 0.5 * 32767);
    buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4);
  }
  const p = path.join(mkdtempSync(path.join(os.tmpdir(), 'vrgpu-')), 'tone.wav');
  writeFileSync(p, buf);
  return p;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-webgpu'],   // this is what exposes the fallback adapter
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

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
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));

  await app.waitForSelector('iframe', { timeout: 20000 });
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click()
    .catch(() => app.locator('.perm-modal .done').click().catch(() => {}));
  await sleep(400);

  const fr = app.frames().find((f) => f !== app.mainFrame());
  await fr.waitForSelector('#go', { timeout: 30000 });

  // The premise: this environment really does offer a fallback adapter to the
  // app frame. If Chrome ever stops doing that under the flag, everything
  // below tests nothing and should say so rather than pass by vacancy.
  const adapter = await fr.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    const a = await navigator.gpu.requestAdapter().catch(() => null);
    return a ? { gpu: true, adapter: true, fallback: !!a.isFallbackAdapter } : { gpu: true, adapter: false };
  });
  check('PREMISE: the app frame is offered a WebGPU adapter, and it is a fallback',
    adapter.gpu && adapter.adapter && adapter.fallback, adapter);

  const engine = await fr.locator('#engineline').textContent();
  check('the app refuses the software adapter instead of calling it a usable graphics chip',
    /processor/.test(engine) && !/usable/.test(engine), engine.slice(0, 140));
  check('...and says WHY: the adapter is a software fallback',
    /software fallback/i.test(engine), engine.slice(0, 200));
  check('...without burning the per-computer CPU-only switch (the chip was never tried)',
    !/earlier run/.test(engine), engine.slice(0, 140));

  // ---- the reduced-segment path, end to end, inside the sandbox --------------
  // onnxseg.js patches the self-test model's time axis and ORT creates the
  // session at time=64. An identity model means the answer is arithmetic:
  // output === input, at a shape the shipped .onnx never declared.
  const seg = await fr.evaluate(async () => {
    const b64 = window.VR_SELFTEST_B64;
    const bin = atob(b64); const orig = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) orig[i] = bin.charCodeAt(i);
    const patched = window.VRONNX.dynamicTime(orig);
    const session = await window.ort.InferenceSession.create(patched, {
      executionProviders: ['wasm'],
      freeDimensionOverrides: { batch_size: 1, time: 64 },
    });
    const n = 4 * 1024 * 64;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.037);
    const out = await session.run({ input: new window.ort.Tensor('float32', x, [1, 4, 1024, 64]) });
    const y = out[session.outputNames[0]].data;
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(y[i] - x[i]));
    session.release();
    return { grew: patched.length - orig.length, dims: out[session.outputNames[0]] ? null : null, len: y.length, worst };
  }).catch((e) => ({ error: String(e && e.message || e) }));
  check('the patched model creates a session at a segment the .onnx never declared',
    !seg.error && seg.len === 4 * 1024 * 64, seg);
  check('...and the identity comes back exact through it', !seg.error && seg.worst === 0, seg);
  check('...from a patch that grew the model by exactly its two rewritten dims', seg.grew === 6, seg);

  // ---- and a separation still completes, on the engine it said it is on ------
  await fr.setInputFiles('#file', toneWav(4));
  await fr.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 30000 });
  await fr.click('#go');
  await fr.waitForFunction(
    () => /\bok\b|err/.test(document.getElementById('status').className), null, { timeout: 300000 });
  const status = await fr.locator('#status').textContent();
  check('a separation runs to completion with the fallback refused', /^Done —/.test(status), status.slice(0, 160));
  const prog = await fr.locator('#progtext').textContent();
  check('...reported as the processor the whole way', /the processor/.test(prog), prog);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
