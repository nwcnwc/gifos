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
const { systemAppIds } = require('../lib/apps');

// A SYSTEM launcher navigates instead of mounting — never pick one here.
const SYS = systemAppIds();

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
  const appId = await d.evaluate(async (SYS) => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    return f ? f.id : null;
  }, SYS);
  // Seed a record into the app's state BEFORE it boots: the steal choices are
  // only distinguishable if the room actually HAS data — a sample app that
  // never writes leaves both copies identically empty and the check proves
  // nothing. Written through the same per-record path the app's db uses.
  await d.evaluate((fid) => GifOS.store.appAdd(fid, 'e2e', { id: 'marker', v: 'room data' }), appId);
  await d.close();
  const h = await hCtx.newPage();
  h.on('pageerror', (e) => console.log('  [host] ' + e.message));
  await h.goto(BASE + '/run.html#id=' + appId);
  await h.waitForSelector('#appmount iframe', { timeout: 30000 });
  check('solo app boots', true);

  // drive the invite modal programmatically — a default app's own perm-modal
  // can overlay the page and intercept pointer events (not what's under test)
  await h.evaluate(() => document.getElementById('appinvite').click());
  await h.waitForSelector('input[name="rmcls"]', { timeout: 10000 });
  await h.evaluate(() => {
    document.querySelector('input[name="rmcls"][value="heal"]').checked = true; // resilient — the succession class
    document.getElementById('inv-go').click();
  });
  await h.waitForFunction(() => document.body.classList.contains('app-room') && window.__gifosVideo.room(), null, { timeout: 20000 });
  check('Invite flips the SAME page into an app room (no navigation)', true);
  check('Help speaks APP ROOM, not the meeting explainer (per-product help)',
    (await h.evaluate(() => document.querySelector('#help-modal h3').textContent)) === 'How this app room works');
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
  await c.evaluate(() => document.getElementById('callbanner-join').click());
  await c.waitForFunction(() => document.body.classList.contains('call-on'), null, { timeout: 15000 });
  check('joining reveals the grid for the client', true);

  // ---- steal: a guest takes a copy — WITH the data, or clean ---------------
  // "Take the game and the scoreboard" and "take just the game" are different
  // wants, so the first press splits the button into the two choices.
  check('the Steal chrome shows for the guest', await c.evaluate(() => document.getElementById('appsteal').style.display !== 'none'));
  await c.evaluate(() => document.getElementById('appsteal').click());
  const choices = await c.evaluate(() => {
    const b = document.getElementById('appsteal');
    let n = b.nextSibling, texts = [];
    while (n && n.tagName === 'BUTTON') { texts.push(n.textContent); n = n.nextSibling; }
    return { armed: !!b.dataset.armed, hidden: b.style.display === 'none', texts };
  });
  check('the first press asks WHICH copy — with data, or app only',
    choices.armed && choices.hidden && choices.texts.length === 2, JSON.stringify(choices.texts));
  // Take the data-and-all copy.
  await c.evaluate(() => { document.getElementById('appsteal').nextSibling.click(); });
  await c.waitForFunction(() => /Yours now/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  // The confirmation must be AT THE BUTTON, not only in the far-end status
  // span — a successful steal read as silence there (reported 2026-08-08).
  check('the Steal button itself confirms the steal', await c.evaluate(() => /Stolen/.test(document.getElementById('appsteal').textContent)));
  const stolen = await c.evaluate(async () => {
    const fs = await GifOS.store.allFiles();
    const mine = fs.filter((f) => f.isApp && !f.isDefault);
    // Did the shared data come with it? The stolen copy's state lives beside
    // the icon, keyed by its fileId.
    let withData = false;
    for (const f of mine) {
      const st = await GifOS.store.getState(f.id).catch(() => null);
      if (st && st.collections && Object.keys(st.collections).length) withData = true;
    }
    return { count: mine.length, withData };
  });
  check('the stolen copy landed on the guest’s desktop', stolen.count >= 1);
  check('…and the data-and-all choice actually brought the room’s data', stolen.withData);
  // Steal AGAIN, clean this time: a second copy with NO shared data in it.
  await c.waitForFunction(() => !document.getElementById('appsteal').disabled, null, { timeout: 15000 });
  await c.evaluate(() => document.getElementById('appsteal').click());
  await c.evaluate(() => {
    const b = document.getElementById('appsteal');
    let n = b.nextSibling; while (n && !/app only/.test(n.textContent)) n = n.nextSibling;
    n.click();
  });
  await c.waitForFunction(() => /clean copy/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  const cleanSteal = await c.evaluate(async () => {
    // allFiles order is key order, not age — classify every stolen copy
    // instead of guessing which one is newest. One copy must carry the
    // room's data and one must be empty: the two choices, both honoured.
    const fs = (await GifOS.store.allFiles()).filter((f) => f.isApp && !f.isDefault);
    let dataful = 0, empty = 0;
    for (const f of fs) {
      const st = await GifOS.store.getState(f.id).catch(() => null);
      if (st && st.collections && Object.keys(st.collections).length) dataful++; else empty++;
    }
    return { copies: fs.length, dataful, empty };
  });
  check('stealing "app only" leaves the room’s data behind',
    cleanSteal.copies >= 2 && cleanSteal.dataful >= 1 && cleanSteal.empty >= 1, JSON.stringify(cleanSteal));

  // ---- succession (resilient room): the owner vanishes -----------------------
  // The sole remaining member is the deterministic successor: the app never
  // unmounts, freezes briefly, then the client adopts its mirror and re-hosts.
  await h.close();
  // owner-away respects the G1 away-holdover (a pocketed phone must not
  // freeze its app) — budget the full holdover + confirm window
  await c.waitForFunction(() => /paused — the host is away/.test(document.getElementById('appwho').textContent), null, { timeout: 100000 });
  check('owner-away freezes the app IN PLACE (never unmounted)', await c.evaluate(() => !!document.querySelector('#appmount iframe')));
  await c.waitForFunction(() => window.__gifosVideo.appIsHost(), null, { timeout: 30000 });
  check('the deterministic successor adopts the app and re-hosts (resilient room)', true);
  check('the room thawed — no longer paused', await c.evaluate(() => !/paused/.test(document.getElementById('appwho').textContent)));

  // ---- owned room: freeze is the whole story (no succession) ---------------
  const oCtx = await mkCtx('Owna');
  const od = await oCtx.newPage();
  await od.goto(BASE + '/index.html');
  await od.waitForSelector('.icon', { timeout: 30000 });
  const appId2 = await od.evaluate(async (SYS) => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    return f ? f.id : null;
  }, SYS);
  await od.close();
  const o = await oCtx.newPage();
  await o.goto(BASE + '/run.html#id=' + appId2);
  await o.waitForSelector('#appmount iframe', { timeout: 30000 });
  await o.evaluate(() => document.getElementById('appinvite').click());
  await o.waitForSelector('#inv-go', { timeout: 10000 });
  await o.evaluate(() => document.getElementById('inv-go').click()); // default = owned ("Only I can host it")
  await o.waitForFunction(() => window.__gifosVideo.appIsHost && window.__gifosVideo.appIsHost(), null, { timeout: 30000 });
  const link2 = await o.evaluate(() => document.getElementById('share-url').value);
  check('an OWNED room link carries the shortname + verifier', /#s=.+\.[a-f0-9]{16,}&k=|\/join\/[a-z0-9-]+\/[a-f0-9]{16,}\//.test(link2), link2);
  const g2Ctx = await mkCtx('Gus');
  const g2 = await g2Ctx.newPage();
  await g2.goto(link2);
  await g2.waitForSelector('#appmount iframe', { timeout: 40000 });
  await o.close();
  await g2.waitForFunction(() => /paused — the host is away/.test(document.getElementById('appwho').textContent), null, { timeout: 100000 });
  check('owned room: owner-away freezes', true);
  await g2.waitForTimeout(12000);
  check('owned room: NO succession — the verifier never silently transfers',
    await g2.evaluate(() => !window.__gifosVideo.appIsHost() && /paused/.test(document.getElementById('appwho').textContent)));
  check('…and the frozen app is still mounted (reads keep working)', await g2.evaluate(() => !!document.querySelector('#appmount iframe')));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
