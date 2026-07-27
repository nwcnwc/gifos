// Verifies the opt-in update + relocated-erase changes:
//  - "Erase This Computer" is GONE from the top-level system menu.
//  - Settings → Advanced holds an "Erase this computer" disclosure + button.
//  - The Version panel renders the live changelog (critical entries flagged).
//  - The service worker splits its fetch policy by channel:
//     * EDGE (site root, where this test runs): NETWORK-FIRST with revalidation —
//       a plain reload REGRABS a root asset that changed on disk (edge tracks the
//       newest GitHub Pages build), and an unchanged asset is 304-cheap.
//     * RELEASE (/versions/<x.y.z>/): IMMUTABLE cache-first — a reload serves the
//       SAME archived build even after the file changes on disk (no silent update).
//    A proactive 'gifos-refresh-shell' still re-pulls the whole shell on demand.
// Needs the static server on 8099 (SW needs a secure context — 127.0.0.1 counts).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 20000 });

  // ---- 1. top-level system menu must NOT offer Erase ----
  await page.locator('#sys-menu-btn').click();
  await page.waitForSelector('.ctx', { timeout: 5000 });
  const menuText = await page.locator('.ctx').innerText();
  check('top-level menu no longer has "Erase This Computer"', !/erase/i.test(menuText), menuText.replace(/\n/g, ' | '));
  check('top-level menu still has Settings', /Settings/.test(menuText));

  // ---- 2. Settings → Advanced → Erase disclosure ----
  await page.locator('.ctx button', { hasText: 'Settings' }).click();
  await page.waitForSelector('.adv summary', { timeout: 5000 });
  // Open the outer Advanced settings disclosure.
  await page.locator('summary', { hasText: 'Advanced settings' }).click();
  const eraseHidden = await page.locator('#set-erase').isVisible().catch(() => false);
  check('Erase button is hidden until its own disclosure is opened', !eraseHidden);
  await page.locator('.danger-zone summary', { hasText: 'Erase this computer' }).click();
  await page.waitForSelector('#set-erase', { state: 'visible', timeout: 4000 });
  check('Erase button lives deep in Advanced settings', await page.locator('#set-erase').isVisible());

  // ---- 3. Version panel shows the live changelog ----
  await page.waitForFunction(() => {
    const v = document.querySelector('#set-version');
    return v && /Running/.test(v.textContent);
  }, null, { timeout: 8000 });
  await page.waitForSelector('#set-version .changelog', { timeout: 8000 }).catch(() => {});
  const clText = await page.locator('#set-version .changelog').innerText().catch(() => '');
  check('Version panel renders the changelog', /v\d+\.\d+\.\d+/.test(clText) && clText.length > 0, clText.slice(0, 80).replace(/\n/g, ' | '));
  check('Version panel offers a Load/Re-pull edge action', await page.locator('#set-edge').count() === 1);
  await page.locator('#set-close').click();

  // ---- 4. channel-split service worker ----
  const swReady = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return false;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    // wait until this page is actually controlled by the SW
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 250));
    return !!navigator.serviceWorker.controller;
  });
  check('service worker controls the page', swReady);

  const stamp = Date.now();
  // 4a. EDGE / root: NETWORK-FIRST. Change a root shell asset on disk, reload, and
  // prove the SW REGRABBED it (an edge user must always land on the newest build).
  const edgeMarker = '/* EDGE_REVALIDATE_PROBE ' + stamp + ' */';
  const swRegPath = 'site/js/sw-register.js';
  const swRegOrig = fs.readFileSync(swRegPath, 'utf8');
  // 4b. RELEASE / versions: IMMUTABLE cache-first. Prime an archived asset into the
  // cache, change it on disk, reload, and prove the SW still served the OLD copy.
  const VER_URL = '/versions/0.8.3/js/build.js';
  const verPath = 'site/versions/0.8.3/js/build.js';
  const verOrig = fs.readFileSync(verPath, 'utf8');
  const verMarker = '/* VERSIONS_IMMUTABLE_PROBE ' + stamp + ' */';
  // Prime the archived asset through the SW so it is cached BEFORE we mutate disk.
  await page.evaluate((u) => fetch(u).then((r) => r.text()).catch(() => ''), VER_URL);
  try {
    fs.writeFileSync(swRegPath, edgeMarker + '\n' + swRegOrig);
    fs.writeFileSync(verPath, verMarker + '\n' + verOrig);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.icon', { timeout: 20000 });

    const edgeAfter = await page.evaluate(async () => (await (await fetch('/js/sw-register.js')).text()));
    check('edge/root: a plain reload REGRABS the changed shell asset (network-first)', edgeAfter.includes('EDGE_REVALIDATE_PROBE'), 'len=' + edgeAfter.length);

    const verAfter = await page.evaluate(async (u) => (await (await fetch(u)).text()), VER_URL);
    check('release/versions: a reload serves the SAME immutable build (no silent update)', !verAfter.includes('VERSIONS_IMMUTABLE_PROBE'), 'len=' + verAfter.length);

    // The proactive update path still re-pulls the whole (root) shell on demand.
    const refreshed = await page.evaluate(() => new Promise((resolve) => {
      const nav = navigator.serviceWorker;
      const t = setTimeout(() => resolve('timeout'), 9000);
      const onMsg = (e) => { if (e.data && e.data.type === 'gifos-shell-refreshed') { clearTimeout(t); nav.removeEventListener('message', onMsg); resolve('ok'); } };
      nav.addEventListener('message', onMsg);
      nav.controller.postMessage({ type: 'gifos-refresh-shell' });
    }));
    check('proactive refresh-shell acks after re-pulling the shell', refreshed === 'ok', 'ack=' + refreshed);
  } finally {
    fs.writeFileSync(swRegPath, swRegOrig); // restore source files no matter what
    fs.writeFileSync(verPath, verOrig);
  }

  await ctx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || (e && e.message) || e); process.exit(2); });
