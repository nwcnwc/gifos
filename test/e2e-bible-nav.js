// End-to-end regression for two Bible Browser navigation bugs:
//
//  1) BLANK APP: the app runs in a srcdoc iframe, whose base URL is the HOST
//     page (run.html). An in-page link like <a href="#v1"> that is left to
//     follow its href navigates the WHOLE frame to run.html — a blank app. The
//     app must intercept every anchor click: same-site -> in-app nav, #anchor ->
//     scroll, everything else inert. Verse-index links carry data-anchor.
//
//  2) SUBDIR REDIRECT: the proxy follows redirects server-side (a directory link
//     "nt-outlines" -> "nt-outlines/"), invisibly to the browser. If the app used
//     the pre-redirect URL as the base, the outline page's relative links point
//     at the wrong directory (/outlines.htm, a 404). The proxy reports the final
//     URL in x-gifos-final-url and the app resolves links against it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

const HOST = 'https://text.recoveryversion.bible';
const PAGES = {
  '/': '<!doctype html><html><body><a href="43_John_1.htm">John</a> <a href="nt-outlines">Outlines</a></body></html>',
  '/43_John_1.htm': '<!doctype html><html><body><h2>John 1</h2>'
    + '<div class="verse-links"><a href="#Joh1-1">1</a><a href="#Joh1-2">2</a></div>'
    + '<p id="Joh1-1">MARK_V1 In the beginning was the Word.</p>'
    + '<p id="Joh1-2">MARK_V2 He was in the beginning with God.</p></body></html>',
  // Only the trailing-slash form exists; "nt-outlines" 301s to it (emulated).
  '/nt-outlines/': '<!doctype html><html><body><h1>Outlines</h1>'
    + '<a href="outlines.htm">NT Outlines</a></body></html>',
  '/nt-outlines/outlines.htm': '<!doctype html><html><body><h2>OUTLINE_PAGE</h2></body></html>',
};
function startProxy() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
      let path = '/'; try { path = new URL(req.headers['x-gifos-target'] || '').pathname; } catch (e) {}
      const finalPath = path === '/nt-outlines' ? '/nt-outlines/' : path; // emulate the 301
      const body = PAGES[finalPath];
      if (body == null) { res.writeHead(404, cors); res.end('nope'); return; }
      res.writeHead(200, Object.assign({ 'content-type': 'text/html; charset=utf-8', 'x-gifos-final-url': HOST + finalPath, 'cache-control': 'no-store' }, cors));
      res.end(body);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function openBible(b, port) {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const flags = { navToHost: false };
  page.on('framenavigated', (f) => { if (f !== page.mainFrame() && /run\.html/.test(f.url())) flags.navToHost = true; });
  await page.addInitScript((p) => { window.GIFOS_CORS_PROXY = 'http://127.0.0.1:' + p; }, port);
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon');
  let id = null;
  for (let i = 0; i < 40 && !id; i++) { id = await page.evaluate(async () => { const it = (await GifOS.store.allItems()).find((x) => x.name === 'Bible Browser.gif'); return it ? it.fileId : null; }); if (!id) await sleep(300); }
  await page.goto(BASE + '/run.html#id=' + id);
  await page.waitForSelector('iframe', { timeout: 8000 });
  await page.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {});
  return { ctx, page, fr: page.frameLocator('iframe'), flags };
}

(async () => {
  const { srv, port } = await startProxy();
  const b = await chromium.launch({ executablePath: CHROME });

  // Bug 1 — verse-link click must not blank the app.
  {
    const { ctx, fr, flags } = await openBible(b, port);
    await fr.locator('.doc a[data-nav]').filter({ hasText: 'John' }).first().click();
    await fr.locator('.doc:has-text("MARK_V1")').first().waitFor({ timeout: 10000 }).catch(() => {});
    const vl = fr.locator('.doc a[data-anchor]').first();
    check('verse-index links carry data-anchor', (await vl.count()) > 0);
    await vl.click().catch(() => {});
    await sleep(800);
    check('verse-link click keeps the app (verses still shown)', (await fr.locator('.doc:has-text("MARK_V1")').count()) > 0);
    check('verse-link click did not navigate the frame to run.html', !flags.navToHost);
    await ctx.close();
  }

  // Bug 2 — outline directory redirect: inner links resolve into the subdir.
  {
    const { ctx, fr } = await openBible(b, port);
    await fr.locator('.doc a[data-nav]').filter({ hasText: 'Outlines' }).first().click();
    await fr.locator('.doc:has-text("NT Outlines")').first().waitFor({ timeout: 10000 }).catch(() => {});
    const inner = fr.locator('.doc a[data-nav]').filter({ hasText: 'NT Outlines' }).first();
    const dn = await inner.getAttribute('data-nav').catch(() => null);
    check('outline inner link resolves into the subdir', dn === HOST + '/nt-outlines/outlines.htm', dn);
    // and it actually loads (not a 404 at the wrong path)
    await inner.click();
    await sleep(1200);
    check('following the inner link does not error', (await fr.locator('.status.err').count()) === 0);
    await ctx.close();
  }

  await b.close();
  srv.close();
  console.log(fail ? ('\n' + fail + ' FAIL') : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
