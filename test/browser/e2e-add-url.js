// End-to-end: ＋ Add → "paste a link to a .gif" adds a GIF from a URL.
// The built Fluence app GIF is served over HTTP (same origin as the site here),
// pasted into the URL field, and must land on the Home Screen as a real app.
// Also checks the friendly error path for a non-GIF link.
//
// Needs: static server on 8099 (serves both the site AND the gif copy).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Serve the built gif from inside site/ so it shares the static server origin.
  fs.copyFileSync(__dirname + '/../../apps/fluence.gif', __dirname + '/../../site/__fluence-test.gif');
  try {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('.icon', { timeout: 10000 });
    await sleep(400);
    const before = await page.locator('.icon').count();

    await page.locator('#add-btn').click();
    await page.waitForSelector('#ad-url', { timeout: 5000 });
    check('the Add dialog has a URL field', (await page.locator('#ad-url').count()) === 1);

    // Good link → adds the app GIF.
    await page.locator('#ad-url').fill(BASE + '/__fluence-test.gif');
    await page.locator('#ad-url-go').click();
    await page.waitForFunction((n) => document.querySelectorAll('.icon').length > n, before, { timeout: 8000 });
    const added = await page.locator('.icon', { hasText: '__fluence-test' }).count();
    check('a GIF added from a URL lands on the Home Screen', added >= 1);
    check('the fetched GIF is stored as a real app (isApp + appId)', await page.evaluate(async () => {
      const files = await GifOS.store.allFiles();
      const f = files.find((x) => x.name === '__fluence-test.gif');
      return !!(f && f.isApp && f.appId === 'fluence');
    }));

    // Bad link (not a gif) → inline error, no crash.
    await page.locator('#add-btn').click();
    await page.waitForSelector('#ad-url', { timeout: 5000 });
    await page.locator('#ad-url').fill(BASE + '/index.html');
    await page.locator('#ad-url-go').click();
    await page.waitForFunction(() => { const m = document.querySelector('#ad-url-msg'); return m && /isn’t a GIF|GIF file/.test(m.textContent); }, null, { timeout: 8000 });
    check('a non-GIF link shows a friendly inline error (no crash)', /GIF/.test(await page.locator('#ad-url-msg').textContent()));

    await browser.close();
  } finally {
    fs.unlinkSync(__dirname + '/../../site/__fluence-test.gif');
  }
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); try { fs.unlinkSync(__dirname + '/../../site/__fluence-test.gif'); } catch (x) {} process.exit(1); });
