// ONE RUNTIME steps 2+4 (docs/one-runtime.md): the app room.
//
// The lifecycle under test: an app runs SOLO on a desktop → Invite mints a
// media-less mesh room in place (no navigation, no reload) → a friend opens
// the room link and the app converges to them over the room's owner-signed
// lane → the call layer stays dark until someone opts in, then the other side
// sees a banner (never silent tiles).
//
// Contracts guarded:
//   - Invite transitions the SAME page: solo → app-room, app pinned (no
//     stop/hide affordance), share link minted stable per file;
//   - the client boots the app from the lane with NO relay app-session
//     (role=host never exists) and NO camera/mic ask on either side;
//   - app state converges host→client over the mesh;
//   - call layer: host taps mic → client's banner appears; client joins →
//     grid reveals; nobody's camera turns itself on.
//
// Needs RELAY + BASE.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const mkCtx = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
    await ctx.addInitScript(() => {
      window.__gumCount = 0;
      const md = navigator.mediaDevices;
      if (md && md.getUserMedia) { const real = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gumCount++; return real(c); }; }
    });
    return ctx;
  };

  // ---- host: seed a desktop, open an app solo, Invite ----------------------
  const hCtx = await mkCtx('Hana');
  const d = await hCtx.newPage();
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 30000 });
  const appId = await d.evaluate(async () => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && !/^(meet|video)$/.test(x.appId));
    return f ? f.id : null;
  });
  await d.close();
  const h = await hCtx.newPage();
  h.on('pageerror', (e) => console.log('  [host] ' + e.message));
  await h.goto(BASE + '/meet.html#id=' + appId);
  await h.waitForSelector('#appmount iframe', { timeout: 30000 });
  check('solo app boots', true);

  await h.locator('#appinvite').click();
  await h.locator('input[name="rmcls"][value="heal"]').check(); // resilient — the succession class
  await h.locator('#inv-go').click();
  await h.waitForFunction(() => document.body.classList.contains('app-room') && window.__gifosVideo.room(), null, { timeout: 20000 });
  check('Invite flips the SAME page into an app room (no navigation)', true);
  await h.waitForFunction(() => window.__gifosVideo.appIsHost && window.__gifosVideo.appIsHost(), null, { timeout: 20000 });
  check('the inviter hosts the app on the room lane', true);
  const link = await h.evaluate(() => document.getElementById('share-url').value);
  check('a /join-shaped room link is minted', /#j=|\/join\//.test(link), link);
  check('app room stays camera-quiet: zero getUserMedia on the host', (await h.evaluate(() => window.__gumCount)) === 0);
  check('the app is PINNED — no stop/hide affordance', await h.evaluate(() => {
    const s = document.getElementById('appstop'), hd = document.getElementById('apphide');
    return s.style.display === 'none' && hd.style.display === 'none';
  }));
  check('grid is dark (no call layer yet)', await h.evaluate(() => !document.body.classList.contains('call-on')));

  // ---- client: open the room link ------------------------------------------
  const cCtx = await mkCtx('Cleo');
  const c = await cCtx.newPage();
  c.on('pageerror', (e) => console.log('  [client] ' + e.message));
  await c.goto(link);
  await c.waitForSelector('#appmount iframe', { timeout: 40000 });
  check('the client auto-mounts the app from the room lane', true);
  check('client is not the host', await c.evaluate(() => !window.__gifosVideo.appIsHost()));
  check('client never asked for camera/mic either', (await c.evaluate(() => window.__gumCount)) === 0);
  check('NO relay app-session anywhere (role=host socket never existed)',
    (await h.evaluate(() => (window.__gifosConns || []).every((s) => { try { const w = s._raw && s._raw(); return !(w && /[?&]role=host\b/.test(w.url || '')); } catch (e) { return true; } })))
    && (await c.evaluate(() => (window.__gifosConns || []).every((s) => { try { const w = s._raw && s._raw(); return !(w && /[?&]role=host\b/.test(w.url || '')); } catch (e) { return true; } }))));

  // ---- call layer: host opts in, client sees the banner --------------------
  await h.evaluate(() => { document.getElementById('cam').click(); }); // host joins the call (lateMedia asks now)
  await h.waitForFunction(() => document.body.classList.contains('call-on'), null, { timeout: 15000 });
  check('host tapping camera opts THEM into the call layer', true);
  check('…and only now does the host ask for media', (await h.evaluate(() => window.__gumCount)) > 0);
  await c.waitForFunction(() => document.getElementById('callbanner').style.display !== 'none', null, { timeout: 20000 });
  check('the client sees the call banner (never silent tiles)', true);
  check('the client still has not asked for media', (await c.evaluate(() => window.__gumCount)) === 0);
  await c.locator('#callbanner-join').click();
  await c.waitForFunction(() => document.body.classList.contains('call-on'), null, { timeout: 15000 });
  check('joining reveals the grid for the client', true);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
