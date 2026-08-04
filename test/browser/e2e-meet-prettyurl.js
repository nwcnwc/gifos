// The address bar stays the PRETTY link. On prod (gifos.app, default relay) a
// meeting page rewrites location to /meet/<room>[/<verifier>] — the same link it
// hands out — instead of the internal run.html#v=… form it loads via. We fake
// prod by resolving gifos.app to localhost and NOT setting a custom relay (so the
// pretty branch is taken). The relay socket won't actually connect (its real host
// is unreachable here), but the address-bar rewrite happens before that and is
// what we're checking.
const { chromium, CHROME } = require('../lib/pw');

const PORT = (process.env.BASE || 'http://127.0.0.1:8099').split(':').pop();

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--host-resolver-rules=MAP gifos.app 127.0.0.1', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
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
  const base = 'http://gifos.app:' + PORT;

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
})();
