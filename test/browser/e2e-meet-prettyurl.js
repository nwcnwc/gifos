// The address bar stays the PRETTY link. On prod (gifos.app, default relay) a
// meeting page rewrites location to /meet/<room>[/<verifier>] — the same link it
// hands out — instead of the internal run.html#v=… form it loads via. We are
// really ON gifos.app here: test/lib/prod-origin.js serves that origin out of
// the local site server, so the hostname branch is taken for the real reason.
// The relay socket won't actually connect (the default relay's host resolves to
// this box and nothing answers), but the address-bar rewrite happens before that
// and is what we're checking.
const { chromium, CHROME, casualty } = require('../lib/pw');
const need = require('../lib/need');
const { PROD_ARGS, serveProdOrigin } = require('../lib/prod-origin');

const PORT = parseInt((process.env.BASE || 'http://127.0.0.1:8099').split(':').pop(), 10);

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  await need({ [PORT]: 'a static server on ' + PORT + ' (python3 -m http.server ' + PORT + ' -d site)' });
  // THE ORIGIN MUST BE THE REAL SHAPE — https://gifos.app, not a spoofed http
  // one. Two things had already been learned here and a third finished the
  // argument:
  //   1. mapping gifos.app to localhost does not make the origin trustworthy,
  //      so an http fake has no crypto.subtle and could never hold a meeting;
  //   2. run.html's preflight (2026-08-05) correctly stops such a page, which
  //      is right for a visitor and useless for a URL-shaping test — so the
  //      suite used --unsafely-treat-insecure-origin-as-secure to buy the
  //      secure-context privileges back;
  //   3. and on 2026-08-16 that stopped loading at all: `.app` is an
  //      HSTS-PRELOADED TLD, chromium-1234 (Chrome 151) upgrades the
  //      navigation to https before it reaches the wire, and python's plain
  //      HTTP server answers the handshake with ERR_SSL_PROTOCOL_ERROR. Both
  //      pretty-URL suites died on their FIRST goto with ZERO assertions — the
  //      DEAD state, on the gate box only, because the box that still had
  //      chromium-1228 was fooled a little longer.
  // No flag turns that off (it is not HttpsUpgrades, and the insecure-origin
  // allowlist is about privileges, not the scheme). So stop faking the scheme:
  // prod is https, and now so is this. See test/lib/prod-origin.js.
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [...PROD_ARGS, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  // serviceWorkers:'block' — an https origin is the first one the site's worker
  // will actually install on, and a worker's own fetches never pass through the
  // route that serves this origin.
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], serviceWorkers: 'block' });
  // Set a name but NOT gifos_relay → the page keeps its default relay, so
  // custom=false and the pretty branch is taken (hostname gifos.app matches).
  //
  // gifos_channel='edge' PINS US TO THE ROOT BUILD, which is what this suite is
  // actually about. Because the hostname resolves as gifos.app, the channel
  // loader treats us as a real visitor and follows version.json to
  // /versions/<current>/ — so without this the suite silently tested the frozen
  // RELEASE SNAPSHOT instead of the edge build it loaded, and nobody could tell
  // from a green run. It only stayed green because snapshots used to rewrite
  // their address bar too; they deliberately no longer do (a snapshot that
  // rewrites to a root path moves its document base off /versions/<v>/ and its
  // relative loads start resolving against the edge build — the bug that left a
  // meeting guest staring at blank space). The pretty SHARE LINK is unaffected
  // and still asserted below.
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_name','Pat');localStorage.setItem('gifos_channel','edge')}catch(e){}" });
  const base = await serveProdOrigin(ctx, { port: PORT });

  // ---- a plain room's address bar becomes /meet/<room> -------------------------
  const room = 'pretty' + Math.floor(Math.random() * 1e6).toString(36);
  const p1 = await ctx.newPage();
  p1.on('pageerror', (e) => console.log('  [p1 pageerror]', e.message));
  await p1.goto(base + '/run.html#v=' + room);           // as if 404 already routed here
  await p1.waitForFunction((r) => window.__gifosVideo && window.__gifosVideo.room() === r, room, { timeout: 12000 });
  check('a plain meeting rewrites the address bar to the pretty /meet/<room> path',
    (await p1.evaluate(() => location.pathname)) === '/meet/' + room);
  check('there is no run.html#v= left in the address bar',
    !(await p1.evaluate(() => location.href)).includes('run.html'));
  check('the share link matches the address bar (both pretty)',
    (await p1.locator('#share-url').inputValue()) === base + '/meet/' + room);

  // ---- an admin room keeps the verifier in the pretty path ---------------------
  const aroom = 'adm' + Math.floor(Math.random() * 1e6).toString(36);
  const averify = 'a1b2c3d4e5f6a1b2c3d4e5f6'; // any 24-hex — we're only checking URL shaping
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => console.log('  [p2 pageerror]', e.message));
  await p2.goto(base + '/run.html#v=' + aroom + '&av=' + averify);
  await p2.waitForFunction((r) => window.__gifosVideo && window.__gifosVideo.room() === r, aroom, { timeout: 12000 });
  check('an admin meeting rewrites to the pretty /meet/<room>/<verifier> path',
    (await p2.evaluate(() => location.pathname)) === '/meet/' + aroom + '/' + averify);
  check('the admin room is recognized (verifier taken from the path form)',
    await p2.evaluate(() => window.__gifosVideo.hasAdmin()));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  // NEVER die as an unhandled rejection. That is how this suite reported "exit
  // 1, ZERO assertions" for two gate runs — indistinguishable from silence, and
  // the reader cannot tell a broken product from a suite that never ran. A
  // throw is a FAIL with the reason attached; a DEAD BROWSER is no verdict at
  // all (exit 4), never a red.
  if (casualty.isCasualty(e)) casualty.refuse({ what: 'the browser this suite was driving', why: (e && e.message) || e });
  console.log('FAIL — the suite threw before it could finish: ' + String((e && e.stack) || e).slice(0, 400));
  process.exit(1);
});
