// End-to-end: gifos.app/?run=<gif url> fetches the GIF, drops it into Stolen
// Apps, and runs it (same-tab redirect to run.html).
//
// Needs: static server on 8099 (serves both the site AND the test gif copy).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.copyFileSync(__dirname + '/../../apps/fluence.gif', __dirname + '/../../site/__run-test.gif');
  try {
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

    const runUrl = BASE + '/index.html?run=' + encodeURIComponent(BASE + '/__run-test.gif');
    await page.goto(runUrl);
    // It should run the app: same-tab redirect to run.html.
    await page.waitForURL(/run\.html/, { timeout: 10000 }).catch(() => {});
    check('?run=<url> launches the app (redirect to run.html)', /run\.html/.test(page.url()), page.url());

    // The address bar dropped ?run= (so a refresh won't re-run) — the hash now
    // points at the stored file, not the original query.
    check('the ?run= query was consumed (not left in the URL)', !/[?&]run=/.test(page.url()));

    // And it was filed into Stolen Apps — verify from a fresh desktop page
    // (same origin → same IndexedDB).
    const p2 = await context.newPage();
    await p2.goto(BASE + '/index.html');
    await p2.waitForSelector('.icon', { timeout: 10000 });
    await sleep(500);
    const filed = await p2.evaluate(async () => {
      const items = await GifOS.store.allItems();
      const it = items.find((i) => i.name === '__run-test.gif');
      return it ? { parent: it.parent } : null;
    });
    check('the GIF was dropped into Stolen Apps (parent = sys_stolen)', filed && filed.parent === 'sys_stolen', JSON.stringify(filed));
    check('the Stolen Apps icon is visible on the desktop', (await p2.locator('.icon', { hasText: 'Stolen Apps' }).count()) >= 1);

    await browser.close();
  } finally {
    fs.unlinkSync(__dirname + '/../../site/__run-test.gif');
  }
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); try { fs.unlinkSync(__dirname + '/../../site/__run-test.gif'); } catch (x) {} process.exit(1); });
