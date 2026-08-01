// Default apps must refresh on existing desktops when the build moves — even
// on a SILENT same-channel deploy the user never asked for.
//
// A default app's code is baked into its GIF at desktop seed time, so a
// desktop seeded on build N kept build N's apps forever unless the user
// explicitly switched builds in the Version panel (which set gifos_reseed).
// The common case — an edge user just using gifos.app while deploys land —
// never set the flag, so their seeded defaults went stale indefinitely.
// desktop.js reseedDefaultsIfNeeded now also stamps the build identity
// ("<version>:<build>") in gifos_reseed_build and re-bakes the seeded
// defaults whenever the stamp mismatches the running build.
//
// This test simulates exactly that: seed a desktop, tamper a seeded default
// app's bytes (standing in for an old build's bytes), plant a mismatched
// build stamp, reload — the boot must re-bake the app's code IN PLACE while
// its saved data survives. Then the no-churn half: with a MATCHING stamp, a
// reload must NOT touch the bytes (frozen snapshots and settled desktops
// never reseed).
//
// Needs BASE only (no relay).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [page] ' + e.message));

  // ---- seed a fresh desktop -------------------------------------------------
  await p.goto(BASE + '/index.html');
  await p.waitForSelector('.icon', { timeout: 30000 });
  const seeded = await p.evaluate(async () => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId);
    if (!f) return null;
    // A data marker in the app's per-fileId state store — the refresh promise
    // is "code swaps, saved data survives", so guard both halves.
    await GifOS.store.setState(f.id + '::guard', { v: 42 });
    return { id: f.id, appId: f.appId, len: f.bytes.length };
  });
  check('fresh desktop seeded a default app', !!seeded, seeded && seeded.appId);
  if (!seeded) { await browser.close(); process.exit(1); }

  // ---- stale-build simulation: tampered bytes + mismatched stamp ------------
  await p.evaluate(async (s) => {
    const f = await GifOS.store.getFile(s.id);
    const junk = new Uint8Array(f.bytes.length + 4);
    junk.set(f.bytes); // trailing bytes after the GIF trailer — decoders ignore them
    await GifOS.store.putFile(Object.assign({}, f, { bytes: junk }));
    localStorage.setItem('gifos_reseed_build', 'edge:999999'); // "seeded under some other build"
  }, seeded);

  await p.reload();
  await p.waitForSelector('.icon', { timeout: 30000 });
  const after = await p.evaluate(async (s) => {
    const f = await GifOS.store.getFile(s.id);
    const guard = await GifOS.store.getState(s.id + '::guard');
    const stamp = localStorage.getItem('gifos_reseed_build');
    const want = (window.GIFOS_VERSION || 'edge') + ':' + (Number(window.GIFOS_BUILD) || 0);
    return { len: f.bytes.length, guard: guard && guard.v, stamp, want, isDefault: f.isDefault };
  }, seeded);
  check('a build move re-bakes the seeded default app IN PLACE (bytes back to this build’s)',
    after.len === seeded.len, after.len + ' vs seeded ' + seeded.len);
  check('the app’s saved data survives the refresh', after.guard === 42, 'guard=' + after.guard);
  check('the build stamp settles to the running build', after.stamp === after.want, after.stamp);

  // ---- no-churn half: a matching stamp must NOT reseed ----------------------
  await p.evaluate(async (s) => {
    const f = await GifOS.store.getFile(s.id);
    const junk = new Uint8Array(f.bytes.length + 4);
    junk.set(f.bytes);
    await GifOS.store.putFile(Object.assign({}, f, { bytes: junk }));
    // stamp already matches the running build — leave it
  }, seeded);
  await p.reload();
  await p.waitForSelector('.icon', { timeout: 30000 });
  const noChurn = await p.evaluate(async (s) => (await GifOS.store.getFile(s.id)).bytes.length, seeded);
  check('a settled desktop (stamp matches) is left alone — no reseed churn',
    noChurn === seeded.len + 4, noChurn + ' vs tampered ' + (seeded.len + 4));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
