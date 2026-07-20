// End-to-end: the manifest-gated fetch bridge, exercised through the real
// runtime in Chromium. Focus is the redirect-bypass defense (a redirect must
// not walk an allowed host to a forbidden one) and the configurable
// first-party denylist (window.GIFOS_FIRST_PARTY).
//
// To get a DISTINCT allowed-initial host vs. a forbidden-final host on one
// machine, one redirect hop has to be cross-origin (127.0.0.1 -> localhost),
// so we stand up a real HTTP server that issues a real 302 with CORS headers —
// Playwright's fulfilled redirects don't reproduce browser redirect+CORS
// behavior. The GifOS site is served separately (BASE, default 127.0.0.1:8099).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const API_PORT = Number(process.env.API_PORT || 8791);

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tiny API: /plain returns a body; /go 302-redirects to localhost/secret;
// /secret returns a "leaked" body. Everything is CORS-open so that, WITHOUT the
// bridge's post-redirect check, the secret would be readable by the app.
function startApi() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' };
      if (req.url.startsWith('/go')) {
        res.writeHead(302, Object.assign({ Location: 'http://localhost:' + API_PORT + '/secret' }, cors)); res.end();
      } else if (req.url.startsWith('/secret')) {
        res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain' }, cors)); res.end('TOP-SECRET');
      } else if (req.url.startsWith('/plain')) {
        res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain' }, cors)); res.end('PLAIN-OK');
      } else { res.writeHead(404, cors); res.end('no'); }
    });
    srv.listen(API_PORT, () => resolve(srv));
  });
}

// Seed an app (declaring `network`) that fetches `url` through the bridge, open
// it, and return the text it managed to read (or "DENIED:<reason>"). Each run
// gets a fresh context so window.GIFOS_FIRST_PARTY is scoped per scenario.
async function fetchInApp(browser, opts) {
  const context = await browser.newContext();
  if (opts.firstParty) await context.addInitScript((fp) => { window.GIFOS_FIRST_PARTY = fp; }, opts.firstParty);
  const desk = await context.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');
  await desk.evaluate(async (a) => {
    const script = 'setTimeout(function(){gifos.fetch(' + JSON.stringify(a.url) + ')' +
      '.then(function(r){return r.text();})' +
      '.then(function(t){document.getElementById("out").textContent="GOT:"+t;})' +
      '.catch(function(e){document.getElementById("out").textContent="DENIED:"+e.message;});},400);';
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'ftest', name: 'FTest', entry: 'index.html', capabilities: { network: a.network } }),
      'index.html': '<!doctype html><div id="out">idle</div><script>' + script + '</scr' + 'ipt>',
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'FTest.gif', bytes, kind: 'gif', isApp: true, appId: 'ftest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'FTest.gif', parent: null, x: 400, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, opts);
  await desk.locator('.icon', { hasText: 'FTest.gif' }).first().waitFor();
  await sleep(200);
  const [app] = await Promise.all([context.waitForEvent('page'), desk.locator('.icon', { hasText: 'FTest.gif' }).first().dblclick()]);
  await app.waitForSelector('iframe');
  const done = app.locator('.perm-box .done'); if (await done.count()) await done.click(); // acknowledge network prompt
  await sleep(1100);
  const out = await app.frameLocator('iframe').locator('#out').textContent();
  await context.close();
  return out;
}

(async () => {
  const api = await startApi();
  const browser = await chromium.launch({ executablePath: CHROME });
  const G = 'http://127.0.0.1:' + API_PORT, L = 'http://localhost:' + API_PORT;

  // 1. A plain fetch to an allowed host works (the post-redirect check doesn't
  //    break the common no-redirect case).
  const r1 = await fetchInApp(browser, { network: ['127.0.0.1'], url: G + '/plain' });
  check('allowed host: a normal fetch returns the body', r1 === 'GOT:PLAIN-OK');

  // 2. Allowed host redirects to a host that ISN'T allowed -> refused, secret
  //    never reaches the app (would leak without the resp.url re-check).
  const r2 = await fetchInApp(browser, { network: ['127.0.0.1'], url: G + '/go' });
  check('redirect to a non-allowed host is blocked (no secret leaks)', /^DENIED:/.test(r2) && !/TOP-SECRET/.test(r2));

  // 3. Even when the final host IS in the allowlist, a redirect onto a
  //    first-party host is refused — proves the check runs firstPartyHost() on
  //    the FINAL url, and that GIFOS_FIRST_PARTY takes effect.
  const r3 = await fetchInApp(browser, { firstParty: ['localhost'], network: ['127.0.0.1', 'localhost'], url: G + '/go' });
  check('redirect to a first-party host is blocked even if allowlisted', /^DENIED:/.test(r3) && !/TOP-SECRET/.test(r3));

  // 4. A direct call to a configured first-party sibling is blocked up front.
  const r4 = await fetchInApp(browser, { firstParty: ['localhost'], network: ['localhost'], url: L + '/plain' });
  check('GIFOS_FIRST_PARTY blocks a direct call to a configured sibling host', /^DENIED:/.test(r4) && !/PLAIN-OK/.test(r4));

  // 5. Manifest hosts are normalized: an UPPER-CASE declaration still matches the
  //    lower-case hostname the URL parser produces.
  const r5 = await fetchInApp(browser, { network: ['LOCALHOST'], url: L + '/plain' });
  check('manifest hosts are normalized (UPPER-CASE matches)', r5 === 'GOT:PLAIN-OK');

  await browser.close();
  api.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
