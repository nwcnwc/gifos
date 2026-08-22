/*
 * Vocal Remover — the whole port, from the real GIF, in the real sandbox.
 *
 * The unit tier (test/unit/vocal-remover.js) proves the transcribed UVR
 * arithmetic against a numpy reference. It cannot prove any of this:
 *
 *   - that ONNX Runtime Web actually instantiates inside an opaque-origin app
 *     frame from bytes, with no network to fetch its wasm from;
 *   - that a file the user picked decodes, resamples and comes back out as a
 *     playable WAV without ever leaving the frame;
 *   - that the app REACHES THE NETWORK ZERO TIMES, which is the claim the
 *     manifest makes by declaring no hosts;
 *   - that when the pinned weights are NOT on the computer, the app says so
 *     instead of handing back its self-test output dressed as a separation.
 *
 * The self-test model is what makes all of that runnable here: it is a real
 * ONNX graph of the same [1,4,dim_f,256] shape that passes its input through,
 * so a successful run means the engine really ran, and an identity means the
 * DSP is checkable by arithmetic. Feed the app a 440 Hz tone and the
 * pass-through stem must come back AS THAT TONE — sample-aligned, same level —
 * while the residual (the frequency-cut mix minus it) must come back silent.
 * Nothing about that is true if the STFT, the plane order, the overlap-add, the
 * trim or the WAV writer is wrong.
 *
 * The 120 MB of real weights are deliberately NOT downloaded here. A gate that
 * needs a third-party host to be up is a gate that goes red for reasons that
 * are nothing to do with the code. Pin health is checked by
 * apps/vocal-remover/tools/verify-pins.py, on purpose, out of band.
 *
 * Needs: static server on 8099, AND the model host out of reach.
 *
 * That second one is not optional and it does not announce itself. The weights
 * are not fetched by this file — the OS frame fetches every pinned asset when
 * the app is opened — so on a box that can reach huggingface.co the store fills
 * in, `gifos.assets()` resolves, the app runs the REAL Inst HQ 3, and eight
 * assertions below go red for saying so: no missing-weights banner, stems named
 * Instrumental/Vocals instead of Pass-through/Residual, and every measurement
 * that assumes an identity model. Nothing is wrong when that happens except the
 * premise. Run it with the host unreachable:
 *
 *   https_proxy=http://127.0.0.1:1 http_proxy=http://127.0.0.1:1 \
 *   no_proxy=127.0.0.1,localhost node test/browser/e2e-vocal-remover.js
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

const TONE_HZ = 440, TONE_AMP = 0.5;

// A 16-bit WAV of a pure tone. Stereo at 44100 by default; `ch` and `sr` exist
// because mono and non-44100 input are the two ordinary files that would break
// SILENTLY — a dead right channel, or a stem at the wrong speed.
function toneWav(seconds, ch, sr) {
  ch = ch || 2; sr = sr || 44100;
  const n = Math.round(seconds * sr), block = ch * 2;
  const buf = Buffer.alloc(44 + n * block);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * block, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * block, 28);
  buf.writeUInt16LE(block, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * block, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin(2 * Math.PI * TONE_HZ * i / sr) * TONE_AMP * 32767);
    for (let c = 0; c < ch; c++) buf.writeInt16LE(v, 44 + i * block + c * 2);
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  const p = path.join(dir, 'tone-' + seconds + 's-' + ch + 'ch-' + sr + '.wav');
  writeFileSync(p, buf);
  return p;
}

// Runs INSIDE the app frame: read each stem back out of its own blob: URL,
// parse the RIFF, and measure it against the tone that went in.
async function measureStems(fr, hz, amp) {
  return fr.evaluate(async ([hz, amp]) => {
    function parseWav(buf) {
      const dv = new DataView(buf);
      let o = 12, fmt = null, data = null;
      while (o + 8 <= dv.byteLength) {
        const id = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
        const sz = dv.getUint32(o + 4, true);
        if (id === 'fmt ') fmt = { format: dv.getUint16(o + 8, true), ch: dv.getUint16(o + 10, true), rate: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
        if (id === 'data') data = { off: o + 8, size: sz };
        o += 8 + sz + (sz & 1);
      }
      if (!fmt || !data) return null;
      const w = fmt.bits / 8, step = fmt.ch * w, n = Math.floor(data.size / step);
      const rd = (p) => (fmt.bits === 32 ? dv.getFloat32(p, true) : dv.getInt16(p, true) / 32767);
      const L = new Float64Array(n), R = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        L[i] = rd(data.off + i * step);
        R[i] = fmt.ch > 1 ? rd(data.off + i * step + w) : L[i];
      }
      return { fmt, L, R, n };
    }
    const out = [];
    for (const s of document.querySelectorAll('.stem')) {
      const url = s.querySelector('audio').src;
      const w = parseWav(await (await fetch(url)).arrayBuffer());
      let num = 0, da = 0, db = 0, dr = 0;
      for (let i = 0; i < w.n; i++) {
        const ref = Math.sin(2 * Math.PI * hz * i / 44100) * amp;
        num += w.L[i] * ref; da += w.L[i] * w.L[i]; db += ref * ref;
        dr += w.R[i] * w.R[i];
      }
      out.push({
        name: s.querySelector('.n').textContent,
        rate: w.fmt.rate, ch: w.fmt.ch, bits: w.fmt.bits, format: w.fmt.format,
        seconds: w.n / w.fmt.rate,
        rms: Math.sqrt(da / w.n),
        rmsR: Math.sqrt(dr / w.n),
        corr: da > 0 ? num / Math.sqrt(da * db) : 0,
      });
    }
    return out;
  }, [hz, amp]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
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

  // Every request the APP FRAME makes, for the whole session. The OS's own
  // frame is allowed to reach the asset host (that is the install-time
  // download, and it is the OS doing it, not the app); the app frame must not
  // reach anything at all.
  const appFrameRequests = [];
  app.on('request', (r) => {
    if (r.frame() === app.mainFrame()) return;
    const u = r.url();
    if (u.startsWith('blob:') || u.startsWith('data:') || u === 'about:blank' || u.startsWith('about:srcdoc')) return;
    appFrameRequests.push(u);
  });

  await app.waitForSelector('iframe', { timeout: 20000 });
  const sheet = (await app.locator('.perm-box', { hasText: 'would like to' }).textContent().catch(() => '')).replace(/\s+/g, ' ');
  check('the abilities sheet names both hatches the manifest opens',
    /compiled|WebAssembly/i.test(sheet) && /graphics/i.test(sheet), sheet.slice(0, 120));
  // The sheet's prose talks about the internet in order to say the app cannot
  // reach it, so the honest test is structural: exactly the two abilities the
  // manifest declares are offered, and the chip is the no-network one.
  // ("Internet" there would mean a host allowlist got in.)
  const capRows = await app.locator('.perm-box [data-cap]').evaluateAll((els) => els.map((e) => e.getAttribute('data-cap')).sort());
  check('...and offers exactly those two abilities and no network',
    capRows.join(',') === 'gpu,wasm', capRows);
  check('the abilities chip reads "Abilities", not "Internet"',
    /^Abilities$/.test((await app.locator('.perms').first().textContent().catch(() => '')).trim()));
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click()
    .catch(() => app.locator('.perm-modal .done').click().catch(() => {}));
  await sleep(400);

  const fr = app.frames().find((f) => f !== app.mainFrame());
  await fr.waitForSelector('#go', { timeout: 30000 });

  const engine = await fr.locator('#engineline').textContent();
  check('the app says which engine it is on, and headless Chromium is the CPU one',
    /processor|GPU/.test(engine) && !/Starting up/.test(engine), engine.slice(0, 90));
  check('all three UVR jobs are offered', (await fr.locator('.job').count()) === 3);

  // ---- the pipeline, end to end, on the in-GIF self-test model --------------
  const tone8 = toneWav(8);
  await fr.setInputFiles('#file', tone8);
  await fr.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 30000 });
  await fr.click('#go');
  await fr.waitForFunction(
    () => /\bok\b/.test(document.getElementById('status').className) || /err/.test(document.getElementById('status').className),
    null, { timeout: 300000 });
  const status = await fr.locator('#status').textContent();
  check('a separation runs to completion inside the sandbox', /^Done —/.test(status), status.slice(0, 160));

  // Reaching "Done" at all means ORT instantiated its wasm from bytes and ran a
  // real graph: there is no path to a stem that skips the session.
  check('ONNX Runtime Web instantiated and ran with no network to fetch from',
    await fr.evaluate(() => !!(window.ort && window.ort.InferenceSession)));

  check('the missing-weights banner is showing, because the weights are not here',
    !(await fr.locator('#selftest-note').isHidden()));
  check('and the result is LABELLED self-test — it never masquerades as a separation',
    /SELF-TEST/.test(status) && !/Vocals|Instrumental/.test(status), status.slice(0, 160));
  const stemNames = await fr.locator('.stem .n').allTextContents();
  check('the self-test stems are not named after stems it did not produce',
    stemNames.join(',') === 'Pass-through,Residual', stemNames);

  const m = await measureStems(fr, TONE_HZ, TONE_AMP);
  const pass = m.find((s) => s.name === 'Pass-through');
  const resid = m.find((s) => s.name === 'Residual');
  check('the stem is a real 16-bit stereo RIFF at 44100',
    !!pass && pass.format === 1 && pass.bits === 16 && pass.ch === 2 && pass.rate === 44100, pass);
  check('...and is the whole 8 seconds, not a chunk of it',
    !!pass && Math.abs(pass.seconds - 8) < 0.01, pass && pass.seconds);
  // An identity model means the pass-through stem IS the input, band-limited.
  // Correlation catches a phase or alignment error; the level catches a wrong
  // window, a wrong envelope division, or a compensate applied twice.
  check('the pass-through stem is the tone that went in, sample-aligned',
    !!pass && pass.corr > 0.999, pass && pass.corr);
  check('...at the level it went in at (0.5 peak -> 0.354 rms)',
    !!pass && Math.abs(pass.rms - TONE_AMP / Math.SQRT2) < 0.005, pass && pass.rms);
  // secondary = (frequency-cut mix) - primary. With an identity primary that is
  // silence, and it only is if BOTH demix passes — different chunk size,
  // different step, different overlap — reconstruct the same signal.
  check('the residual of an identity separation is silence (-60 dBFS or below)',
    !!resid && resid.rms < 1e-3, resid && resid.rms);

  // ---- 32-bit float output -------------------------------------------------
  await fr.selectOption('#bits', '32');
  await fr.click('#go');
  await fr.waitForFunction(() => /\bok\b/.test(document.getElementById('status').className), null, { timeout: 300000 });
  const m32 = await measureStems(fr, TONE_HZ, TONE_AMP);
  const p32 = m32.find((s) => s.name === 'Pass-through');
  check('the 32-bit float setting writes IEEE-float WAV, not relabelled PCM',
    !!p32 && p32.format === 3 && p32.bits === 32 && p32.corr > 0.999, p32);

  // ---- the two ordinary files that would break silently --------------------
  // A mono file must come out with BOTH channels carrying the audio (UVR's
  // prepare_mix duplicates it), and a file that is not 44100 must be resampled
  // — the models know one rate and nothing else checks this.
  await fr.selectOption('#bits', '16');
  await fr.setInputFiles('#file', toneWav(2, 1, 22050));
  await fr.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 30000 });
  await fr.click('#go');
  await fr.waitForFunction(() => /\bok\b|err/.test(document.getElementById('status').className), null, { timeout: 300000 });
  const monoStatus = await fr.locator('#status').textContent();
  const mono = (await measureStems(fr, TONE_HZ, TONE_AMP)).find((s) => s.name === 'Pass-through');
  check('a MONO 22050 Hz file separates rather than failing', /^Done —/.test(monoStatus), monoStatus.slice(0, 120));
  check('...resampled to 44100, which is the only rate the models know, at the same duration',
    !!mono && mono.rate === 44100 && Math.abs(mono.seconds - 2) < 0.02, mono && { rate: mono.rate, seconds: mono.seconds });
  check('...and it says the track was mono, which — unlike its sample rate — is knowable',
    /mono/.test(monoStatus), monoStatus.slice(0, 200));
  check('...with the mono duplicated into BOTH channels, not left silent on one',
    !!mono && mono.ch === 2 && mono.rmsR > 0.3 && Math.abs(mono.rmsR - mono.rms) < 0.01,
    mono && { rms: mono.rms, rmsR: mono.rmsR });
  check('...and it is still the tone that went in',
    !!mono && mono.corr > 0.99, mono && mono.corr);

  // ---- Stop --------------------------------------------------------------
  const tone90 = toneWav(90);
  await fr.setInputFiles('#file', tone90);
  await fr.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 30000 });
  await fr.click('#go');
  await fr.waitForFunction(() => /%/.test(document.getElementById('progtext').textContent), null, { timeout: 120000 });
  const prog = await fr.locator('#progtext').textContent();
  check('progress says how far along it is and what it is running on',
    /%/.test(prog) && /(your GPU|the processor)/.test(prog), prog);
  await fr.click('#stop');
  await fr.waitForFunction(() => /^Stopped/.test(document.getElementById('status').textContent), null, { timeout: 120000 })
    .catch(() => {});
  check('Stop stops it, between chunks, without an error',
    /^Stopped/.test(await fr.locator('#status').textContent()), await fr.locator('#status').textContent());
  check('...and the Separate button comes back', !(await fr.locator('#go').isDisabled()));

  // ---- the claim the manifest makes ---------------------------------------
  check('the app frame reached the network ZERO times, for anything',
    appFrameRequests.length === 0, appFrameRequests.slice(0, 5));

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
