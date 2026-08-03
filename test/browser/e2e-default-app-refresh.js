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

  // ---- folder-multiplication regression (2026-08-03) ------------------------
  // A SUBFOLDER default ('Single Phone' inside IRL Games) was invisible to
  // the reseed's folder index — it held only ROOT folders by bare name — so
  // EVERY reseed minted another empty copy of it. Force two more reseeds and
  // count: one copy, in its place, still holding its apps.
  const countSP = () => p.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const sp = items.filter((i) => i.kind === 'folder' && i.name === 'Single Phone');
    const irl = items.find((i) => i.kind === 'folder' && i.name === 'IRL Games' && !i.parent);
    return {
      n: sp.length,
      inIrl: !!(irl && sp.length && sp.every((s) => s.parent === irl.id)),
      kids: sp.length === 1 ? items.filter((i) => i.parent === sp[0].id).length : -1,
    };
  });
  for (const stamp of ['edge:999998', 'edge:999995']) {
    await p.evaluate((s) => localStorage.setItem('gifos_reseed_build', s), stamp);
    await p.reload();
    await p.waitForSelector('.icon', { timeout: 30000 });
  }
  const sp = await countSP();
  check('reseeds never multiply a default SUBFOLDER (one Single Phone, inside IRL Games)',
    sp.n === 1 && sp.inIrl, 'count=' + sp.n);
  check('…and it still holds its default apps', sp.kids >= 5, 'kids=' + sp.kids);

  // ---- cleanup for desktops the bug already hit -----------------------------
  // Manufacture the damage (two empty strays beside the real one) and reseed:
  // the strays purge, the populated copy survives untouched.
  await p.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const irl = items.find((i) => i.kind === 'folder' && i.name === 'IRL Games' && !i.parent);
    for (let k = 0; k < 2; k++) {
      await GifOS.store.putItem({ id: 'stray' + k, kind: 'folder', name: 'Single Phone', parent: irl.id, x: 200 + k * 90, y: 300, iconSize: 64 });
    }
    localStorage.setItem('gifos_reseed_build', 'edge:999997');
  });
  await p.reload();
  await p.waitForSelector('.icon', { timeout: 30000 });
  const cleaned = await countSP();
  check('a bug-hit desktop heals on reseed: empty stray copies purge, the real one stays',
    cleaned.n === 1 && cleaned.kids >= 5, 'count=' + cleaned.n + ' kids=' + cleaned.kids);

  // ---- Broadcast-below-Meeting slot migration -------------------------------
  // An old desktop (Broadcast auto-placed wherever a cell was free, one-shot
  // flag unset) reseeds: Broadcast moves into the slot directly below
  // Meeting, opening it by pushing that column down.
  await p.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const files = await GifOS.store.allFiles();
    const by = (aid) => items.find((i) => { const f = files.find((x) => x.id === i.fileId); return f && f.appId === aid && !i.parent; });
    const bc = by('broadcast');
    bc.x = 12; bc.y = 900; // stranded far away, as the pre-slot reseed left it
    await GifOS.store.putItem(bc);
    localStorage.removeItem('gifos_mig_bc_slot');
    localStorage.setItem('gifos_reseed_build', 'edge:999996');
  });
  await p.reload();
  await p.waitForSelector('.icon', { timeout: 30000 });
  const slot = await p.evaluate(async () => {
    const items = await GifOS.store.allItems();
    const files = await GifOS.store.allFiles();
    const by = (aid) => items.find((i) => { const f = files.find((x) => x.id === i.fileId); return f && f.appId === aid && !i.parent; });
    const meet = by('meet') || by('video'), bc = by('broadcast');
    const row = parseInt(getComputedStyle(document.getElementById('desktop')).getPropertyValue('--row'), 10);
    const overlap = items.some((i) => !i.parent && i.id !== bc.id && i.x === bc.x && i.y === bc.y);
    return { ok: !!meet && !!bc && bc.x === meet.x && bc.y === meet.y + row && !overlap,
      detail: meet && bc && ('meet@' + meet.x + ',' + meet.y + ' bc@' + bc.x + ',' + bc.y + ' row=' + row + (overlap ? ' OVERLAP' : '')) };
  });
  check('the one-shot migration slots Broadcast directly below Meeting, nothing overlapping', slot.ok, slot.detail);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
