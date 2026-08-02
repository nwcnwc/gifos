// Version + update + erase, after the offline layer (sw.js) landed.
//
// The offline shell means the whole computer is served from a precached cache,
// so two things had regressed and are fixed here:
//  1) ERASE now wipes the shell cache too (not just IndexedDB), so erasing
//     actually grabs a fresh computer instead of rebooting the same cached one.
//  2) The Advanced → Version panel fetches the LIVE latest from the site and
//     offers edge/roll-back actions.
//
// Added: erasing preserves the user's version channel (edge/pin/release) so
// the re-seed happens on the SAME build instead of silently falling back to
// the live release.
// Needs only the static server (BASE) — version.json is served from site/.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, d) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (d ? '  (' + d + ')' : '')); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });

  // ---- Helper: open Advanced settings and expand the Version panel reliably ----
  async function openAdvanced(page) {
    await page.locator('#sys-menu-btn').click();
    await page.locator('.ctx button', { hasText: 'Settings…' }).click();
    await page.locator('details.adv summary', { hasText: 'Advanced settings' }).click();
    await page.waitForSelector('#set-version', { timeout: 5000 });
  }

  // ---- Round 1: default channel (no pin/edge) ----
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(400);

  // Seed BOTH kinds of state the "whole computer" is made of: a shell cache
  // entry (the code, served offline) and an IndexedDB record (user data).
  await page.evaluate(async () => {
    if (self.caches) { const c = await caches.open('gifos-shell-testseed'); await c.put('/__erase_probe', new Response('x')); }
    await GifOS.store.setState('sys::erase_marker', { seeded: true });
  });
  const seeded = await page.evaluate(async () => {
    const keys = self.caches ? await caches.keys() : [];
    const mk = await GifOS.store.getState('sys::erase_marker');
    return { cache: keys.includes('gifos-shell-testseed'), marker: !!mk };
  });
  check('seeded a shell-cache entry and a data record', seeded.cache && seeded.marker, JSON.stringify(seeded));

  // ---- Advanced → Version panel ----
  await openAdvanced(page);
  await page.waitForSelector('#set-version .vlist .vrow', { timeout: 8000 });
  // State lives INLINE on the rows now (running/latest pills), not in a summary
  // block above the list — so there's nothing repeated up top.
  check('no summary facts block above the list (state lives in the rows)', (await page.locator('#set-version .vfacts').count()) === 0);
  check('the running build is marked inline with a pill', (await page.locator('#set-version .vpill.run').count()) >= 1);
  check('Version panel offers an edge/load action', (await page.locator('#set-edge').count()) === 1);
  check('Version panel lists archived snapshots', (await page.locator('.vlist .vbtn').count()) >= 1, 'vbtns=' + (await page.locator('.vlist .vbtn').count()));

  // Regression: the "a newer release is available" nudge deep-links to the
  // Version panel. The AI-models and Third-party-APIs sections ALSO carry class
  // "adv", so a bare querySelector('details.adv') opened the WRONG section and
  // the nudge appeared to link nowhere. The panel must live inside the
  // id-targeted #set-advanced disclosure, and that disclosure must NOT be the
  // first .adv — otherwise the deep-link silently opens AI models again.
  const advStruct = await page.evaluate(() => {
    const adv = document.querySelector('#set-advanced');
    const firstAdv = document.querySelector('.modal.wide details.adv');
    const sv = document.querySelector('#set-version');
    return {
      hasId: !!adv,
      versionInside: !!(adv && sv && adv.contains(sv)),
      idIsFirst: adv === firstAdv,
      advCount: document.querySelectorAll('.modal.wide details.adv').length,
    };
  });
  check('Version panel lives inside the id-targeted Advanced disclosure', advStruct.hasId && advStruct.versionInside, JSON.stringify(advStruct));
  check('deep-link can\'t rely on the first details.adv (AI/API share the class)', !advStruct.idIsFirst && advStruct.advCount >= 2, JSON.stringify(advStruct));

  // Regression: release notes fold behind their release rows, collapsed by
  // default (the panel used to dump every release's full notes in a wall above
  // the picker). A release WITH notes is an expandable <details> that reveals
  // them on click.
  const foldState = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#set-version details.vrow')];
    return { total: rows.length, openByDefault: rows.filter((d) => d.open).length };
  });
  check('release-note folds are collapsed by default', foldState.total >= 1 && foldState.openByDefault === 0, JSON.stringify(foldState));
  const noteRow = page.locator('#set-version details.vrow', { hasText: 'v0.8.5' });
  await noteRow.locator('summary').click();
  await sleep(150);
  const expanded = await noteRow.evaluate((el) => el.open && !!el.querySelector('.vnotes .cl-notes, .vnotes .cl-headline'));
  check('clicking a release row unfolds its notes', expanded);

  await page.locator('#set-close').click();

  // ---- Erase clears IndexedDB AND the shell cache, then re-seeds fresh ----
  await openAdvanced(page);
  await page.locator('.danger-zone summary', { hasText: 'Erase this computer' }).click();
  await page.locator('#set-erase').click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator('.modal-actions button', { hasText: 'Erase without backup' }).click(),
  ]);
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(500);
  const after = await page.evaluate(async () => {
    const keys = self.caches ? await caches.keys() : [];
    const mk = await GifOS.store.getState('sys::erase_marker');
    return { seededCacheGone: !keys.includes('gifos-shell-testseed'), markerGone: !mk };
  });
  check('erase wiped the user data (IndexedDB record gone)', after.markerGone);
  check('erase ALSO purged the offline shell cache (grabs a fresh computer)', after.seededCacheGone);
  const labels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('erase re-seeded a fresh desktop (Welcome is back)', labels.includes('Welcome.gif'), JSON.stringify(labels));

  // ---- Round 2: opt into edge, seed state, erase, verify we STAY on edge ----
  await page.goto(BASE + '/index.html?edge');
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(400);
  await page.evaluate(async () => {
    await GifOS.store.setState('sys::erase_marker2', { seeded: true });
    if (self.caches) { const c = await caches.open('gifos-shell-testseed2'); await c.put('/__erase_probe2', new Response('x')); }
  });
  const beforeErase = await page.evaluate(async () => {
    return {
      channel: localStorage.getItem('gifos_channel'),
      pin: localStorage.getItem('gifos_pin'),
      edge: location.search.includes('edge'),
    };
  });
  check('edge opt-in is recorded before erase', beforeErase.channel === 'edge' && !beforeErase.pin);

  await openAdvanced(page);
  await page.locator('.danger-zone summary', { hasText: 'Erase this computer' }).click();
  await page.locator('#set-erase').click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator('.modal-actions button', { hasText: 'Erase without backup' }).click(),
  ]);
  await page.waitForSelector('.icon', { timeout: 20000 });
  await sleep(500);
  const afterErase = await page.evaluate(async () => {
    return {
      channel: localStorage.getItem('gifos_channel'),
      pin: localStorage.getItem('gifos_pin'),
      reseed: localStorage.getItem('gifos_reseed'),
      edge: location.search.includes('edge'),
      search: location.search,
      host: location.hostname,
      path: location.pathname,
    };
  });
  check('erase preserves the edge channel preference', afterErase.channel === 'edge');
  check('erase does not create a snapshot pin', !afterErase.pin);
  check('erase lands back on the edge build', afterErase.edge || afterErase.path === '/', 'search=' + afterErase.search + ' path=' + afterErase.path);
  // The reseed flag is consumed during boot (reseedDefaultsIfFlagged reads it
  // and clears it). The real proof that it ran is that the fresh desktop got
  // the CURRENT edge build's default apps — Ping Pong only exists on edge here.
  await page.locator('.icon', { hasText: /^Games$/ }).dblclick();
  await sleep(300);
  const gameLabels = await page.$$eval('.icon .label', (els) => els.map((e) => e.textContent));
  check('edge-channel erase re-seeded current edge defaults (Ping Pong present)', gameLabels.includes('Ping Pong.gif'), JSON.stringify(gameLabels));
  await page.locator('#crumbs a').click();
  await sleep(200);
  const dataGone = !(await page.evaluate(async () => await GifOS.store.getState('sys::erase_marker2')));
  const cacheGone = !(await page.evaluate(async () => {
    const keys = self.caches ? await caches.keys() : [];
    return keys.includes('gifos-shell-testseed2');
  }));
  check('edge-channel erase also wiped user data', dataGone);
  check('edge-channel erase also purged shell cache', cacheGone);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || (e && e.message) || e); process.exit(2); });
