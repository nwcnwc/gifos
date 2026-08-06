// THE VENDORED SIGNER IS THE SAME MATH IN EVERY ENGINE — the cross-engine
// known-answer guard for the Ed25519 fallback (site/js/gifos-ed.js).
//
// WHY THIS EXISTS, and why it is not covered by the other two suites:
//   - test/unit/ed-fallback.js proves the vendored code agrees with NODE's
//     native WebCrypto. One JS engine (V8), one platform.
//   - test/browser/e2e-ed-fallback.js proves a mixed room works — but both
//     participants are chromium, one merely crippled.
// Neither answers the question the product actually rides on: the browsers
// that NEED the fallback are old SAFARI and old FIREFOX. Their JS engines are
// not V8. tweetnacl is 32-bit-integer arithmetic over typed arrays, which is
// exactly the kind of code where an engine difference (a JIT that folds a
// multiply differently, a platform without the same Math semantics) would show
// up as a signature that is *almost* right — and an almost-right signature is
// a participant nobody in the room will accept, on the one browser we cannot
// test by hand.
//
// So: run the SAME fixed vector through GifOS.ed in every engine this box has,
// with GIFOS_ED_FORCE_JS on, and compare against a HARDCODED known answer.
// Hardcoding matters — comparing the fallback against the same browser's
// native engine only proves they agree, and if both drifted we would never
// know. The vector below was generated from node's native WebCrypto Ed25519
// (an independent implementation) and is checked against it in the unit suite.
//
// MEASURED 2026-08-06 (penguin): WebKit (Safari's own engine, the iPhone's
// family) and Firefox both produce byte-identical public keys and signatures,
// and both verify a signature made natively elsewhere.
//
// Chromium is MANDATORY here (the suite must never assert zero times).
// webkit/firefox are exercised when installed and reported when not — an
// absent engine is an environment fact, but a SILENT absence is how coverage
// rots, so the engines actually exercised are printed and counted.
//
// Needs: python3 -m http.server 8099 -d site   (no relay — no network at all)
const path = require('path');
const fs = require('fs');
const { chromium, CHROME } = require('../lib/pw');
const pw = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

// THE KNOWN ANSWER. seed = 0x4a1f repeated 16x; message as below. Generated
// from node's native WebCrypto Ed25519 and cross-checked there every gate run
// (test/unit/ed-fallback.js). If a change here is ever needed, the algorithm
// changed — which is a flag day, not a test edit.
const SEED_HEX = '4a1f'.repeat(16);
const MSG = 'gifos-cross-engine-vector-1';
const WANT_PUB = '419643381ad573b89036c19c89ee8ff8c888a7d265acb9790da571c1a78399e7';
const WANT_SIG = 'd0539b8a4d5025a19af31004449b0267dcd047e9392603c0f9a138d5243b32cb'
               + '069d0857193055136f3d2c63243d280bf03d12af031436e3a0c778d3155eaf08';

// An optional engine counts as present only if we can resolve a REAL binary.
// pw.findEngine searches the same roots as the chromium resolver and honors the
// per-box MEET_<ENGINE> pin — measured necessary 2026-08-06: on the pi, firefox
// is installed under ~/.cache/ms-playwright but playwright's own
// executablePath() answers with the revision IT pins, which is not there. Asking
// playwright alone reported "firefox not installed" on a box running firefox
// fine, and this suite went red for a purely environmental reason.
function optionalEngine(name) {
  const p = pw.findEngine(name);
  return p ? { launch: { executablePath: p } } : null;
}

async function runEngine(label, browserType, launchOpts) {
  const b = await browserType.launch(launchOpts);
  try {
    const ctx = await b.newContext();
    // Force the JS engine BEFORE any page script: this is the whole point —
    // we are testing the vendored signer, not the browser's native one.
    await ctx.addInitScript(() => { window.GIFOS_ED_FORCE_JS = true; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + label + '] ' + String(e).slice(0, 120)));
    await p.goto(BASE + '/index.html');
    await p.waitForFunction(() => !!(window.GifOS && window.GifOS.ed), null, { timeout: 30000 });
    return await p.evaluate(async (a) => {
      const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, '0')).join('');
      const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
      const enc = new TextEncoder();
      const engine = await GifOS.ed.engine();
      const k = await GifOS.ed.keysFromSeed(unhex(a.seedHex));
      const sig = await GifOS.ed.sign(k.priv, enc.encode(a.msg));
      const bad = enc.encode(a.msg + '!');
      return {
        engine,
        pub: hex(k.pubRaw),
        sig: hex(sig),
        // the fallback must accept a signature made by a DIFFERENT (native)
        // implementation, and reject that same signature over other bytes
        verifiesForeign: await GifOS.ed.verify(k.pubRaw, unhex(a.wantSig), enc.encode(a.msg)),
        rejectsTampered: !(await GifOS.ed.verify(k.pubRaw, unhex(a.wantSig), bad)),
        ua: navigator.userAgent.slice(0, 70),
      };
    }, { seedHex: SEED_HEX, msg: MSG, wantSig: WANT_SIG });
  } finally { await b.close(); }
}

(async () => {
  const exercised = [];

  // ---- chromium: MANDATORY -------------------------------------------------
  {
    const r = await runEngine('chromium', chromium, { executablePath: CHROME });
    exercised.push('chromium');
    check('chromium runs the VENDORED signer when forced (engine=js)', r.engine === 'js', r.engine);
    check('…and its public key matches the known answer, byte for byte', r.pub === WANT_PUB, r.pub.slice(0, 32));
    check('…and its signature matches the known answer, byte for byte', r.sig === WANT_SIG, r.sig.slice(0, 32));
    check('…and it verifies a signature made by a different implementation', r.verifiesForeign === true);
    check('…and rejects that signature over tampered bytes', r.rejectsTampered === true);
  }

  // ---- webkit / firefox: the engines that actually need the fallback -------
  // WebKit is Safari's engine — the iPhone's family, and the whole reason this
  // fallback exists. Firefox is Gecko. Different JIT, different math paths.
  for (const name of ['webkit', 'firefox']) {
    const av = optionalEngine(name);
    if (!av) { console.log('  [engine] ' + name + ' not installed on this box — not exercised here'); continue; }
    const r = await runEngine(name, pw[name], av.launch);
    exercised.push(name);
    check(name + ' runs the VENDORED signer when forced (engine=js)', r.engine === 'js', { engine: r.engine, ua: r.ua });
    check('…' + name + ' public key matches the known answer, byte for byte', r.pub === WANT_PUB, r.pub.slice(0, 32));
    check('…' + name + ' signature matches the known answer, byte for byte', r.sig === WANT_SIG, r.sig.slice(0, 32));
    check('…' + name + ' verifies a signature made by a different implementation', r.verifiesForeign === true);
    check('…' + name + ' rejects that signature over tampered bytes', r.rejectsTampered === true);
  }

  // Coverage is REPORTED, never silent: a box that quietly lost webkit would
  // otherwise keep printing ALL PASS while testing one engine.
  console.log('  [engines exercised] ' + exercised.join(', '));
  check('at least one non-V8 engine was exercised (webkit or firefox)',
    exercised.some((e) => e !== 'chromium'),
    { exercised, note: 'install playwright webkit or firefox, or pin MEET_WEBKIT / MEET_FIREFOX' });

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
