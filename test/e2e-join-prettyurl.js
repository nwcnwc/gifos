// App JOIN links keep the pretty /join link in the address bar too. On prod
// (gifos.app, default relay) a client that opened a /join link sees the SAME
// link in the bar — /join/<code> for a self-healing app, /join/<room>/<verifier>
// for an owned one — not the internal run.html#j=…/#s=… form it loads via. We
// fake prod by resolving gifos.app to localhost and not setting a custom relay,
// so the pretty branch is taken. No live host is needed: the address-bar rewrite
// happens as the client boots, before it connects.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = (process.env.BASE || 'http://127.0.0.1:8099').split(':').pop();

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--host-resolver-rules=MAP gifos.app 127.0.0.1'],
  });
  const ctx = await browser.newContext();
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_name','Pat')}catch(e){}" });
  const base = 'http://gifos.app:' + PORT;

  // ---- a self-healing app join → /join/<code> ----------------------------------
  const code = 'heal' + Math.floor(Math.random() * 1e6).toString(36);
  const p1 = await ctx.newPage();
  p1.on('pageerror', () => {}); // client boot may hit crypto.subtle on insecure ctx; we only check the URL rewrite
  await p1.goto(base + '/run.html#j=' + code);
  await p1.waitForFunction(() => location.pathname.startsWith('/join/'), null, { timeout: 10000 });
  check('a self-healing join rewrites the bar to /join/<code>',
    (await p1.evaluate(() => location.pathname)) === '/join/' + code);
  check('no run.html#j= left in the address bar',
    !(await p1.evaluate(() => location.href)).includes('run.html'));

  // ---- an owned app join → /join/<room>/<verifier> -----------------------------
  const room = 'chess' + Math.floor(Math.random() * 1e6).toString(36);
  const ver = 'abc123def456abc123def456'; // any 24-hex — checking URL shaping only
  const p2 = await ctx.newPage();
  p2.on('pageerror', () => {});
  await p2.goto(base + '/run.html#s=' + room + '.' + ver + '&k=' + ver);
  await p2.waitForFunction(() => location.pathname.startsWith('/join/'), null, { timeout: 10000 });
  check('an owned join rewrites the bar to /join/<room>/<verifier>',
    (await p2.evaluate(() => location.pathname)) === '/join/' + room + '/' + ver);

  // ---- local dev keeps the hash form (no /join routing there) -------------------
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
})();
