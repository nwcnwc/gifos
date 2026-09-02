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
const { chromium, CHROME } = require('../lib/pw');
const http = require('http');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const API_PORT = Number(process.env.API_PORT || 8791);

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== undefined && !cond ? '  (' + String(detail).slice(0, 120) + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A binary body that CANNOT survive a UTF-8 decode: a PNG signature followed by
// bytes that are invalid UTF-8 (0xff 0xd8 is a lone JPEG SOI pair; 0xc0 0x80 is
// an overlong encoding). Decoding these to text replaces each with U+FFFD, so a
// byte-exact round-trip is proof the bridge never stringifies the body.
const BIN = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xd8, 0xc0, 0x80]);
const BIN_HEX = BIN.toString('hex');

// A tiny API: /plain returns a body; /bin returns binary; /go 302-redirects to
// localhost/secret; /secret returns a "leaked" body. Everything is CORS-open so
// that, WITHOUT the bridge's post-redirect check, the secret would be readable.
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
      } else if (req.url.startsWith('/bin')) {
        res.writeHead(200, Object.assign({ 'Content-Type': 'image/png' }, cors)); res.end(BIN);
      } else if (req.url.startsWith('/big-declared')) {
        // 9 MB with a Content-Length: refused before a byte is read.
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(9 * 1024 * 1024) }, cors));
        const chunk = Buffer.alloc(1024 * 1024, 0x41);
        let n = 0; const push = () => { while (n < 9) { n++; if (!res.write(chunk)) return res.once('drain', push); } res.end(); }; push();
      } else if (req.url.startsWith('/big-chunked')) {
        // 9 MB with no Content-Length: refused WHILE it streams.
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/octet-stream' }, cors));
        const chunk = Buffer.alloc(1024 * 1024, 0x42);
        let n = 0; const push = () => { while (n < 9) { n++; if (!res.write(chunk)) return res.once('drain', push); } res.end(); }; push();
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
      '.then(function(r){return ' + (a.read || 'r.text()') + ';})' +
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

  // 6. A BINARY body survives the bridge byte-for-byte. The bridge used to run
  //    every response through a UTF-8 TextDecoder, which turned each invalid
  //    sequence into U+FFFD — so map tiles, images and audio were unreachable.
  //    Bytes now cross as an ArrayBuffer and the shim decodes only on .text().
  const r6 = await fetchInApp(browser, { network: ['127.0.0.1'], url: G + '/bin',
    read: 'r.arrayBuffer().then(function(b){return Array.prototype.map.call(new Uint8Array(b),' +
          'function(x){return ("0"+x.toString(16)).slice(-2);}).join("");})' });
  check('binary body round-trips byte-for-byte through the bridge', r6 === 'GOT:' + BIN_HEX);

  // 7. .blob() carries the response's content-type, so URL.createObjectURL gives
  //    an <img>-able blob: URL (which the app CSP's img-src blob: permits).
  const r7 = await fetchInApp(browser, { network: ['127.0.0.1'], url: G + '/bin',
    read: 'r.blob().then(function(b){return b.type+":"+b.size;})' });
  check('blob() carries content-type and length', r7 === 'GOT:image/png:' + BIN.length);

  // 8. The 8 MB cap holds whether or not the server declares a length: a
  //    declared 9 MB is refused up front, an undeclared one while it streams —
  //    never after the whole body has been buffered into the trusted tab.
  const r8 = await fetchInApp(browser, { network: ['127.0.0.1'], url: G + '/big-declared', read: 'r.arrayBuffer().then(function(b){return String(b.byteLength);})' });
  check('a response over the 8 MB cap with a Content-Length is refused', /^DENIED:.*too large/.test(r8), r8);
  const r9 = await fetchInApp(browser, { network: ['127.0.0.1'], url: G + '/big-chunked', read: 'r.arrayBuffer().then(function(b){return String(b.byteLength);})' });
  check('a response over the 8 MB cap with NO Content-Length is refused while streaming', /^DENIED:.*too large/.test(r9), r9);

  // 9. A trailing dot is the same host to DNS and the certificate check; it
  //    must be the same host to the denylist and the allowlist too.
  const r10 = await fetchInApp(browser, { firstParty: ['localhost'], network: ['*'], url: 'http://localhost.:' + API_PORT + '/plain' });
  check('a trailing-dot spelling of a first-party host is still refused', /^DENIED:/.test(r10) && !/PLAIN-OK/.test(r10), r10);

  await browser.close();
  api.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
