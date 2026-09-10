// End-to-end: gifos.app/?run=<gif url> fetches the GIF, drops it into Stolen
// Apps, and runs it (same-tab redirect to the room page, run.html#id=).
//
// Needs: static server on 8099 (serves both the site AND the test gif copy).
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.copyFileSync(appGif('fluence'), __dirname + '/../../site/__run-test.gif');
  try {
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

    // WHAT THE PAGE SAYS WHILE IT WORKS. A run-link to a large app is minutes
    // of downloading, and this path used to report nothing for all of it: the
    // desktop sat there looking idle, which is exactly what a dead link looks
    // like — the reason "Open in GifOS" on biblestudy.gifos.app read as a
    // button that did nothing. The GIF here is small, so the response is held
    // back to make the working state observable at all.
    await page.route('**/__run-test.gif', async (route) => {
      const r = await route.fetch();
      const body = await r.body();
      await sleep(900);
      await route.fulfill({ status: 200, headers: { 'content-type': 'image/gif', 'content-length': String(body.length) }, body });
    });
    // Recorded IN THE PAGE, into sessionStorage: polling from here races the
    // navigation Playwright is already driving, and sessionStorage survives
    // the same-origin hop to run.html, so the record is still there to read
    // after the app has opened.
    await page.addInitScript(() => {
      const note = () => {
        const el = document.querySelector('.busy-say');
        if (!el || !el.textContent) return;
        let seen = [];
        try { seen = JSON.parse(sessionStorage.getItem('__busy') || '[]'); } catch (e) {}
        if (seen[seen.length - 1] !== el.textContent) {
          seen.push(el.textContent);
          try { sessionStorage.setItem('__busy', JSON.stringify(seen)); } catch (e) {}
        }
      };
      addEventListener('DOMContentLoaded', () => new MutationObserver(note).observe(document.body, { childList: true, subtree: true, characterData: true }));
    });

    const runUrl = BASE + '/index.html?run=' + encodeURIComponent(BASE + '/__run-test.gif');
    await page.goto(runUrl);
    // It should run the app: same-tab redirect to the room page.
    await page.waitForURL(/run\.html/, { timeout: 10000 }).catch(() => {});
    check('?run=<url> launches the app (redirect to the room page)', /run\.html#id=/.test(page.url()), page.url());
    const seen = await page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('__busy') || '[]'); } catch (e) { return []; } });
    check('the wait is not silent — the page says it is working', seen.length > 0, JSON.stringify(seen));
    await page.unroute('**/__run-test.gif');

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

    // ---- THE STRANGER'S PATH: a run-link through the version redirect ------
    // Everything above runs at the ROOT build, where the channel loader stays
    // put — which is every case EXCEPT the one this link exists for. A person
    // who has never opened GifOS gets redirected to the current release
    // snapshot on their first visit, and the loader used to build that
    // redirect from `pathname + hash`, dropping the query: the run-link
    // vanished mid-flight and they landed on a bare Home Screen. Reproduce it
    // with a PIN (same redirect, no gifos.app hostname needed) and hold the
    // link to arriving intact.
    const pinCtx = await browser.newContext();
    const rel = JSON.parse(fs.readFileSync(__dirname + '/../../site/version.json', 'utf8')).current;
    await pinCtx.addInitScript((v) => { try { localStorage.setItem('gifos_pin', v); } catch (e) {} }, rel);
    const p3 = await pinCtx.newPage();
    p3.on('pageerror', (e) => console.log('  [pinned pageerror]', e.message));
    await p3.goto(BASE + '/index.html?run=' + encodeURIComponent(BASE + '/__run-test.gif'));
    await p3.waitForURL(/\/versions\//, { timeout: 15000 }).catch(() => {});
    check('a pinned/first-time visitor is redirected into the release snapshot',
      /\/versions\//.test(p3.url()), p3.url());
    check('…and the run-link SURVIVES the redirect (the query is carried, not dropped)',
      /[?&]run=/.test(p3.url()) || /run\.html#id=/.test(p3.url()), p3.url());
    await p3.waitForURL(/run\.html#id=/, { timeout: 20000 }).catch(() => {});
    check('…so a stranger following a shared run-link lands IN the app',
      /run\.html#id=/.test(p3.url()), p3.url());
    await pinCtx.close();

    await browser.close();
  } finally {
    fs.unlinkSync(__dirname + '/../../site/__run-test.gif');
  }
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); try { fs.unlinkSync(__dirname + '/../../site/__run-test.gif'); } catch (x) {} process.exit(1); });
