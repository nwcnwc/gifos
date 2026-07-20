// End-to-end regression: the CORS proxy must not let the browser HTTP cache
// collapse distinct targets. Every proxied request reaches the proxy at the
// SAME URL (its origin) with the real destination in x-gifos-target, so if the
// upstream response is cacheable (e.g. carries a stale Last-Modified and no
// Cache-Control), a URL-keyed browser cache would replay the FIRST target's body
// for every later one — the live symptom was "every Bible chapter opens as the
// home page / clicking a book goes nowhere". The runtime fetches proxied
// requests with cache:'no-store' (and the proxy sends Cache-Control:no-store),
// so distinct targets never collide. This fake proxy deliberately makes its
// responses look heuristically cacheable (stale Last-Modified, no Cache-Control)
// and serves DIFFERENT html per target; the test navigates book A -> B and
// asserts B's unique verse shows, not A's.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

const HOST = 'https://text.recoveryversion.bible';
const PAGES = {
  '/': '<!doctype html><html><head><title>Home</title></head><body>'
    + '<a href="01_Genesis_1.htm">Gen</a> <a href="43_John_1.htm">John</a></body></html>',
  '/01_Genesis_1.htm': '<!doctype html><html><head><title>Genesis</title></head><body>'
    + '<h2>Genesis 1</h2><p>UNIQUE_GENESIS In the beginning God created.</p></body></html>',
  '/43_John_1.htm': '<!doctype html><html><head><title>John</title></head><body>'
    + '<h2>John 1</h2><p>UNIQUE_JOHN In the beginning was the Word.</p></body></html>',
};
function startProxy() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
      let path = '/'; try { path = new URL(req.headers['x-gifos-target'] || '').pathname; } catch (e) {}
      const body = PAGES[path];
      if (body == null) { res.writeHead(404, cors); res.end('nope'); return; }
      // Cacheable-looking: stale validator, NO Cache-Control. A URL-keyed cache
      // would reuse this for the next (different-target) request at the same URL.
      res.writeHead(200, Object.assign({
        'content-type': 'text/html; charset=utf-8',
        'last-modified': 'Mon, 01 Jan 2018 00:00:00 GMT',
      }, cors));
      res.end(body);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

(async () => {
  const { srv, port } = await startProxy();
  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[err]', e.message));
  await page.addInitScript((p) => { window.GIFOS_CORS_PROXY = 'http://127.0.0.1:' + p; }, port);
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon');
  let bibleId = null;
  for (let i = 0; i < 40 && !bibleId; i++) {
    bibleId = await page.evaluate(async () => { const it = (await GifOS.store.allItems()).find((x) => x.name === 'Bible Browser.gif'); return it ? it.fileId : null; });
    if (!bibleId) await sleep(300);
  }
  check('Bible Browser is seeded', !!bibleId);
  await page.goto(BASE + '/run.html#id=' + bibleId);
  await page.waitForSelector('iframe', { timeout: 8000 });
  await page.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {});
  const fr = page.frameLocator('iframe');
  await fr.locator('.doc a[data-nav]').first().waitFor({ timeout: 8000 });

  // Navigate to Genesis, then to John. John must show its OWN verse — if the
  // browser replayed Genesis's cached body (same proxy URL), it would show
  // UNIQUE_GENESIS and this fails.
  await fr.locator('.doc a[data-nav]').filter({ hasText: 'Gen' }).first().click();
  let genOk = false;
  try { await fr.locator('.doc:has-text("UNIQUE_GENESIS")').first().waitFor({ timeout: 6000 }); genOk = true; } catch (e) {}
  check('Genesis renders its own body', genOk);

  await fr.locator('#home').click();
  await fr.locator('.doc a[data-nav]').filter({ hasText: 'John' }).first().waitFor({ timeout: 6000 }).catch(() => {});
  await fr.locator('.doc a[data-nav]').filter({ hasText: 'John' }).first().click();
  let johnOk = false, johnBody = '';
  try { await fr.locator('.doc:has-text("UNIQUE_JOHN")').first().waitFor({ timeout: 6000 }); johnOk = true; } catch (e) {}
  johnBody = await fr.locator('.doc').innerText().catch(() => '');
  check('John renders its OWN body, not the cached Genesis body', johnOk && !/UNIQUE_GENESIS/.test(johnBody), johnBody.replace(/\s+/g, ' ').slice(0, 60));

  await b.close();
  srv.close();
  console.log(fail ? ('\n' + fail + ' FAIL') : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
