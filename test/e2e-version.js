// Version + update + erase, after the offline layer (sw.js) landed.
//
// The offline shell means the whole computer is served from a precached cache,
// so two things had regressed and are fixed here:
//  1) ERASE now wipes the shell cache too (not just IndexedDB), so erasing
//     actually grabs a fresh computer instead of rebooting the same cached one.
//  2) The Advanced → Version panel fetches the LIVE latest from the site and
//     offers Upgrade (a real fresh pull) + Roll back (pin an archived build).
// Needs only the static server (BASE) — version.json is served from site/.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, d) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (d ? '  (' + d + ')' : '')); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });
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
  await page.locator('#sys-menu-btn').click();
  await page.locator('.ctx button', { hasText: 'Settings…' }).click();
  await page.locator('details.adv summary', { hasText: 'Advanced settings' }).click();
  // The panel repaints once the LIVE version.json check resolves.
  await page.waitForSelector('#set-upgrade', { timeout: 10000 });
  const latestText = (await page.locator('#set-latest').textContent()) || '';
  check('Version panel states the live latest from gifos.app', /latest on gifos\.app|live on gifos\.app|couldn/i.test(latestText), latestText.trim());
  check('Version panel offers an Upgrade / fresh-download action', (await page.locator('#set-upgrade').count()) === 1);
  check('Version panel lists roll-back targets (older archived builds)', (await page.locator('.vlist .vbtn').count()) >= 1, 'vbtns=' + (await page.locator('.vlist .vbtn').count()));
  await page.locator('#set-close').click();

  // ---- Erase clears IndexedDB AND the shell cache, then re-seeds fresh ----
  await page.locator('#sys-menu-btn').click();
  await page.locator('.ctx button', { hasText: 'Erase This Computer…' }).click();
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

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
