// Verifies the opt-in update + relocated-erase changes:
//  - "Erase This Computer" is GONE from the top-level system menu.
//  - Settings → Advanced holds an "Erase this computer" disclosure + button.
//  - The Version panel renders the live changelog (critical entries flagged).
//  - The service worker installs and serves the shell CACHE-FIRST: a reload
//    returns the SAME build even after the served file changes on disk (no
//    silent update), and a proactive 'gifos-refresh-shell' pulls the new file.
// Needs the static server on 8099 (SW needs a secure context — 127.0.0.1 counts).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
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
  check('Version panel renders the changelog', /0\.7\.0/.test(clText) && clText.length > 0, clText.slice(0, 80).replace(/\n/g, ' | '));
  check('Version panel offers an Upgrade/Re-download button', await page.locator('#set-upgrade').count() === 1);
  await page.locator('#set-close').click();

  // ---- 4. cache-first service worker: no silent update on reload ----
  const swReady = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return false;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    // wait until this page is actually controlled by the SW
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 250));
    return !!navigator.serviceWorker.controller;
  });
  check('service worker controls the page', swReady);

  // Read a shell asset through the SW, then CHANGE it on disk, reload, and prove
  // the SW still served the OLD cached copy (a silent update would show the new).
  const marker = '/* CACHE_FIRST_PROBE ' + Date.now() + ' */';
  const swRegPath = 'site/js/sw-register.js';
  const original = fs.readFileSync(swRegPath, 'utf8');
  const before = await page.evaluate(async () => (await (await fetch('/js/sw-register.js')).text()).length);
  try {
    fs.writeFileSync(swRegPath, marker + '\n' + original);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.icon', { timeout: 20000 });
    const afterReload = await page.evaluate(async () => (await (await fetch('/js/sw-register.js')).text()));
    check('a plain reload serves the SAME cached shell (no silent update)', !afterReload.includes('CACHE_FIRST_PROBE'), 'len=' + afterReload.length + ' base=' + before);

    // Now the proactive update path: ask the SW to refresh the whole shell.
    const refreshed = await page.evaluate(() => new Promise((resolve) => {
      const nav = navigator.serviceWorker;
      const t = setTimeout(() => resolve('timeout'), 9000);
      const onMsg = (e) => { if (e.data && e.data.type === 'gifos-shell-refreshed') { clearTimeout(t); nav.removeEventListener('message', onMsg); resolve('ok'); } };
      nav.addEventListener('message', onMsg);
      nav.controller.postMessage({ type: 'gifos-refresh-shell' });
    }));
    const afterRefresh = await page.evaluate(async () => (await (await fetch('/js/sw-register.js')).text()));
    check('proactive refresh-shell pulls the NEW file into the cache', refreshed === 'ok' && afterRefresh.includes('CACHE_FIRST_PROBE'), 'ack=' + refreshed);
  } finally {
    fs.writeFileSync(swRegPath, original); // restore the source file no matter what
  }

  await ctx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
