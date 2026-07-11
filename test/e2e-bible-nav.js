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
// A page tall enough to scroll: ~220 numbered verses so scrollHeight >> clientHeight.
let TALL_BODY = '<h2>Psalms</h2>';
for (let i = 1; i <= 220; i++) TALL_BODY += '<p id="Ps-' + i + '">VERSE_' + i + ' the quick brown fox jumps over the lazy dog, again and again.</p>';
const PAGES = {
  '/': '<!doctype html><html><body><a href="43_John_1.htm">John</a> <a href="nt-outlines">Outlines</a> <a href="psalms.htm">Psalms</a></body></html>',
  '/43_John_1.htm': '<!doctype html><html><body><h2>John 1</h2>'
    + '<div class="verse-links"><a href="#Joh1-1">1</a><a href="#Joh1-2">2</a></div>'
    + '<p id="Joh1-1">MARK_V1 In the beginning was the Word.</p>'
    + '<p id="Joh1-2">MARK_V2 He was in the beginning with God.</p></body></html>',
  '/psalms.htm': '<!doctype html><html><body>' + TALL_BODY + '</body></html>',
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
  return { ctx, page, id, fr: page.frameLocator('iframe'), flags };
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

  // Bug 3 — PERSONAL scroll memory: scroll a tall page, reopen the app, land
  // back where you were (not at the top).
  {
    const { ctx, page, id, fr } = await openBible(b, port);
    await fr.locator('.doc a[data-nav]').filter({ hasText: 'Psalms' }).first().click();
    await fr.locator('.doc:has-text("VERSE_200")').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(250); // let the render's scroll-restore settle (applyingScroll clears)
    // Scroll roughly two-thirds down the tall page.
    await fr.locator('#main').evaluate((m) => { m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) * 0.66); });
    await sleep(700); // let the 500ms saveLast debounce fire
    // Records live under collections.bible.items keyed by their id; the last page
    // is stored per-user as last:<uid> and now carries a scroll fraction.
    const savedFrac = await page.evaluate((fid) => GifOS.store.getState(fid).then((s) => {
      const items = s && s.collections && s.collections.bible && s.collections.bible.items; if (!items) return null;
      const k = Object.keys(items).find((k) => k.indexOf('last') === 0); const rec = k && items[k];
      return rec && typeof rec.scroll === 'number' ? rec.scroll : null;
    }), id);
    check('scroll position is remembered on the last-page record', savedFrac != null && savedFrac > 0.3, 'frac=' + savedFrac);

    // Reopen the app the way the desktop does — a FRESH page in the same context
    // (IndexedDB persists) — and confirm it lands back where we were, not the top.
    const page2 = await ctx.newPage();
    await page2.addInitScript((p) => { window.GIFOS_CORS_PROXY = 'http://127.0.0.1:' + p; }, port);
    await page2.goto(BASE + '/run.html#id=' + id);
    await page2.waitForSelector('iframe', { timeout: 8000 });
    await page2.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {});
    const fr2 = page2.frameLocator('iframe');
    await fr2.locator('.doc:has-text("VERSE_200")').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(500);
    const reopenTop = await fr2.locator('#main').evaluate((m) => m.scrollTop);
    check('reopening the app restores the scroll position (not the top)', reopenTop > 50, 'scrollTop=' + reopenTop);
    await ctx.close();
  }

  // Bug 4 — FOLLOW the scroll: in a meeting the group's position lives in one
  // shared 'nav' record. We simulate a fellow attendee ("Leader") turning to a
  // spot two-thirds down by writing a nav record with a foreign `by` id — exactly
  // what pushNav writes over the mesh — and confirm a following reader is carried
  // there. The put() flows through the same db-change → handleSync path the mesh
  // uses, so this exercises the real follow logic, not a mock.
  {
    const { ctx, fr } = await openBible(b, port);
    await fr.locator('.doc a[data-nav]').filter({ hasText: 'Psalms' }).first().click();
    await fr.locator('.doc:has-text("VERSE_200")').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(300);
    const before = await fr.locator('#main').evaluate((m) => m.scrollTop);
    // A peer scrolls the shared page to ~0.7 down (a DIFFERENT `by`, so we follow).
    await fr.locator('#main').evaluate((m) => window.gifos.db('bible').put({
      id: 'nav', url: 'https://text.recoveryversion.bible/psalms.htm', scroll: 0.7,
      by: 'user_PEER', byName: 'Leader', ts: 1783746900000,
    }));
    await sleep(700);
    const after = await fr.locator('#main').evaluate((m) => m.scrollTop);
    const range = await fr.locator('#main').evaluate((m) => m.scrollHeight - m.clientHeight);
    check('a following reader is carried to the leader\'s scroll position', after > before + 100, 'before=' + before + ' after=' + after);
    check('and it lands near the leader\'s fraction (~0.7 of the page)', Math.abs(after / range - 0.7) < 0.06, 'frac=' + (after / range).toFixed(3));

    // Turn Follow OFF, peer moves again — the reader must NOT be dragged along.
    await fr.locator('#follow').click().catch(() => {});
    const held = await fr.locator('#main').evaluate((m) => m.scrollTop);
    await fr.locator('#main').evaluate((m) => window.gifos.db('bible').put({
      id: 'nav', url: 'https://text.recoveryversion.bible/psalms.htm', scroll: 0.1,
      by: 'user_PEER', byName: 'Leader', ts: 1783746901000,
    }));
    await sleep(600);
    const stillThere = await fr.locator('#main').evaluate((m) => m.scrollTop);
    check('with Follow off, a peer\'s scroll does not move the reader', Math.abs(stillThere - held) < 40, 'held=' + held + ' now=' + stillThere);
    await ctx.close();
  }

  await b.close();
  srv.close();
  console.log(fail ? ('\n' + fail + ' FAIL') : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
