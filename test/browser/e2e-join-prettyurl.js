// App JOIN links keep the pretty /join link in the address bar too. On prod
// (gifos.app, default relay) a client that opened a /join link sees the SAME
// link in the bar — /join/<code> for a self-healing app, /join/<room>/<verifier>
// for an owned one — not the internal run.html#j=…/#s=… form it loads via. We
// are really ON gifos.app here (test/lib/prod-origin.js serves that origin out
// of the local site server) and set no custom relay, so the pretty branch is
// taken for the real reason. No live host is needed: the address-bar rewrite
// happens as the client boots, before it connects.
const { chromium, CHROME, casualty } = require('../lib/pw');
const need = require('../lib/need');
const { PROD_ARGS, serveProdOrigin } = require('../lib/prod-origin');

const PORT = parseInt((process.env.BASE || 'http://127.0.0.1:8099').split(':').pop(), 10);

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  await need({ [PORT]: 'a static server on ' + PORT + ' (python3 -m http.server ' + PORT + ' -d site)' });
  // THE ORIGIN MUST BE THE REAL SHAPE — https://gifos.app, not a spoofed http
  // one; see the long note in e2e-meet-prettyurl.js and test/lib/prod-origin.js.
  // Short version: mapping gifos.app to localhost never made the origin secure
  // (so this suite was driving a page with no crypto.subtle), and as of
  // chromium-1234 it does not even load — `.app` is an HSTS-preloaded TLD, the
  // browser upgrades the navigation to https, and the local plain-HTTP server
  // answers with ERR_SSL_PROTOCOL_ERROR before the first assertion. Prod is
  // https; so is this now.
  const browser = await chromium.launch({ executablePath: CHROME, args: [...PROD_ARGS] });
  // serviceWorkers:'block' — a worker's own fetches never pass through the route
  // that serves this origin, and https is the first origin it will install on.
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_name','Pat');localStorage.setItem('gifos_channel','edge')}catch(e){}" });
  const base = await serveProdOrigin(ctx, { port: PORT });

  // ---- a self-healing app join → /join/<code> ----------------------------------
  const code = 'heal' + Math.floor(Math.random() * 1e6).toString(36);
  const p1 = await ctx.newPage();
  p1.on('pageerror', () => {}); // there is no live host here; we only check the URL rewrite
  await p1.goto(base + '/run.html#j=' + code);
  await p1.waitForFunction(() => location.pathname.startsWith('/join/'), null, { timeout: 10000 });
  check('a self-healing join rewrites the bar to /join/<code>',
    (await p1.evaluate(() => location.pathname)) === '/join/' + code);
  check('no run.html#j= left in the address bar',
    !(await p1.evaluate(() => location.href)).includes('run.html#j'));

  // ---- an owned app join → /join/<room>/<verifier> -----------------------------
  const room = 'chess' + Math.floor(Math.random() * 1e6).toString(36);
  const ver = 'abc123def456abc123def456'; // any 24-hex — checking URL shaping only
  const lsec = 'kqmvtwxyz2'; // the link secret rides as the third segment
  const p2 = await ctx.newPage();
  p2.on('pageerror', () => {});
  await p2.goto(base + '/run.html#s=' + room + '.' + ver + '&k=' + lsec);
  await p2.waitForFunction(() => location.pathname.startsWith('/join/'), null, { timeout: 10000 });
  check('an owned join rewrites the bar to /join/<room>/<verifier>/<secret>',
    (await p2.evaluate(() => location.pathname)) === '/join/' + room + '/' + ver + '/' + lsec);

  // ---- local dev keeps the hash form (no /join routing there) -------------------
  // 127.0.0.1 is served straight off the site server: same bytes, a hostname the
  // pretty branch does not match, and the ONE origin browsers still trust over
  // plain http.
  const p3 = await ctx.newPage();
  p3.on('pageerror', () => {});
  await p3.goto('http://127.0.0.1:' + PORT + '/run.html#j=' + code);
  // give the client a moment to (not) rewrite
  await p3.waitForFunction(() => window.GifOS && window.GifOS.links, null, { timeout: 8000 });
  check('on localhost the bar stays the run.html# form (no /join routing)',
    (await p3.evaluate(() => location.pathname)) === '/run.html');

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  // NEVER die as an unhandled rejection — see the note at the foot of
  // e2e-meet-prettyurl.js. A throw is a FAIL with its reason; a dead browser is
  // NO VERDICT (exit 4), never a product red.
  if (casualty.isCasualty(e)) casualty.refuse({ what: 'the browser this suite was driving', why: (e && e.message) || e });
  console.log('FAIL — the suite threw before it could finish: ' + String((e && e.stack) || e).slice(0, 400));
  process.exit(1);
});
