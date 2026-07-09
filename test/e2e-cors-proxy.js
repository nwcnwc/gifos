// End-to-end: the CORS proxy path, exercised by the default "Bible Browser".
// A GifOS app is sandboxed with connect-src 'none' and can only reach declared
// hosts through gifos.fetch(); some public sites (like text.recoveryversion.bible)
// send no Access-Control-Allow-* headers, so a direct fetch is blocked. The app
// passes { proxy:true }, and the runtime routes the request through the GifOS
// CORS proxy. This test stands up an in-process fake proxy (so it never touches
// the real, network-gated site), points the runtime at it via window.GIFOS_CORS_PROXY,
// and verifies: the proxied fetch renders, the returned HTML is sanitised
// (scripts/handlers stripped, <img> → alt, external links neutralised), same-site
// links navigate inside the app (a second proxied fetch), and Back works.
//
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

// A stand-in for cors-proxy.gifos.app: echoes canned "Bible" HTML by the
// x-gifos-target path, with permissive CORS so the browser fetch succeeds.
const PAGES = {
  '/': '<!doctype html><html><head><title>Recovery Version</title><style>body{color:red}</style>'
    + '<script>document.title="HACKED"</script></head><body><h1>Holy Bible Recovery Version</h1>'
    + '<p onclick="alert(1)">Choose a book.</p><a href="/genesis/1">Genesis 1</a> · '
    + '<a href="https://evil.example/x">external</a><img src="/logo.png" alt="logo-alt"></body></html>',
  '/genesis/1': '<!doctype html><html><head><title>Genesis 1</title></head><body><h2>Genesis 1</h2>'
    + '<p>In the beginning God created the heavens and the earth.</p><a href="/">&larr; Home</a></body></html>',
};
function startProxy() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
      let path = '/'; try { path = new URL(req.headers['x-gifos-target'] || '').pathname; } catch (e) {}
      const body = PAGES[path];
      if (body == null) { res.writeHead(404, cors); res.end('nope'); return; }
      res.writeHead(200, Object.assign({ 'content-type': 'text/html; charset=utf-8' }, cors));
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

  // Seeding the default set is async — poll until Bible Browser is filed.
  let bibleId = null;
  for (let i = 0; i < 40 && !bibleId; i++) {
    bibleId = await page.evaluate(async () => { const it = (await GifOS.store.allItems()).find((x) => x.name === 'Bible Browser.gif'); return it ? it.fileId : null; });
    if (!bibleId) await sleep(300);
  }
  check('Bible Browser is seeded as a default app', !!bibleId, 'fileId=' + bibleId);
  if (!bibleId) { await b.close(); srv.close(); console.log('\n' + fail + ' FAIL'); process.exit(1); }

  await page.goto(BASE + '/run.html#id=' + bibleId);
  await page.waitForSelector('iframe', { timeout: 8000 });
  await page.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {}); // network acknowledgement
  const fr = page.frameLocator('iframe');
  await fr.locator('.doc h1').waitFor({ timeout: 8000 }).catch(() => {});
  const home = await fr.locator('.doc').innerHTML().catch(() => '');
  check('home page rendered through the CORS proxy', /Holy Bible Recovery Version/.test(home), home.slice(0, 60));
  check('inline <script> from the fetched page did not run', (await fr.locator('title').count()) >= 0 && !/HACKED/.test(await page.title()) && !/HACKED/.test(home));
  check('on* handler attribute stripped', !/onclick/i.test(home));
  check('same-site link rewritten to in-app navigation', /data-nav="https:\/\/text\.recoveryversion\.bible\/genesis\/1"/.test(home));
  check('external link neutralised (no href, marked ext)', /class="[^"]*ext[^"]*"/.test(home) && !/href="https:\/\/evil/.test(home));
  check('<img> replaced by its alt text', /logo-alt/.test(home) && !/logo\.png/.test(home));

  await fr.locator('.doc a[data-nav]').first().click();
  await fr.locator('.doc h2').waitFor({ timeout: 6000 }).catch(() => {});
  const gen = await fr.locator('.doc').innerHTML().catch(() => '');
  check('same-site link opens the next page via a second proxied fetch', /In the beginning God created/.test(gen), gen.slice(0, 60));

  await fr.locator('#back').click();
  await sleep(600);
  check('Back returns to the home page', /Holy Bible Recovery Version/.test(await fr.locator('.doc').innerHTML().catch(() => '')));

  await b.close();
  srv.close();
  console.log(fail ? ('\n' + fail + ' FAIL') : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
