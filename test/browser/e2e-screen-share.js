/*
 * Screen sharing in a meeting — and the far more interesting half: that an
 * app-pinned meeting NEVER NEEDS IT.
 *
 * GifOS can PIN AN APP into a meeting. When it does, every participant runs
 * that app on their own device off a small shared data stream and stays in
 * sync — nobody is watching a video of somebody else's window. A screen share
 * is the opposite trade: one-way pixels, one resolution, unclickable, paid for
 * at every hop. Both belong in the product, and the product must prefer the
 * app pin wherever they overlap. That preference is a promise made in words
 * and in what the UI offers, so this suite reads the words and counts the API
 * calls rather than trusting either.
 *
 * SIX THINGS, in the order they matter:
 *   1. A share really is a DISPLAY capture, published on the STAGE — the
 *      existing broadcast tier — not on a side channel. Proven from the
 *      outbound sender: the track the meeting is publishing has a
 *      displaySurface, which only a getDisplayMedia track ever has.
 *   2. The other side SEES it and is told what it is: the sharer's status
 *      carries the bit, the tile carries the chip, and the strip cell is
 *      letterboxed rather than cropped square (the crop would throw away the
 *      left and right thirds of a 16:9 deck — see test/unit/mesh-media.js).
 *   3. It STOPS: the sharer leaves the stage, the camera comes back as the
 *      published track, and the room stops saying anyone is sharing.
 *   4. THE APP-PIN PATH NEVER TOUCHES SCREEN CAPTURE. getDisplayMedia is
 *      wrapped in a counter on every page; running an app in a meeting, and
 *      joining one, must leave that counter at ZERO on host and guest alike.
 *   5. An APP-PINNED ROOM does not even offer the control — while the ordinary
 *      meeting buttons beside it are there, so "hidden" means hidden by the
 *      rule, not by an unrendered bar.
 *   6. NO APP CAN PHOTOGRAPH YOUR SCREEN — however its manifest is written.
 *      This began as capabilities.screen, built exactly like
 *      capabilities.fullscreen (1d3d5b2), and the build is what proved it
 *      cannot exist: `display-capture` delegates cleanly and the policy check
 *      then PASSES, but getDisplayMedia rejects the app document anyway with
 *      `SecurityError: Invalid security origin`, because an app frame is
 *      srcdoc-sandboxed with no allow-same-origin and its origin is opaque.
 *      The capability came back out (a checkbox that grants nothing is the one
 *      lie a permission surface must never tell) and this leg stayed, as the
 *      invariant it always really was. It is a guard against a future
 *      one-liner that looks obviously right.
 *
 * WHY TWO BROWSERS. The meeting legs need Chromium's automation flags for
 * display capture (`--auto-select-desktop-capture-source`, measured: without
 * it getDisplayMedia hangs forever on a picker no headless box will answer,
 * and WITH it a real 1280x720 'monitor' surface arrives). Leg 6 must take NO
 * flags at all — a suite that pre-grants what it is trying to see refused
 * proves nothing, and here the flags would auto-answer the very picker whose
 * unreachability is the point. So leg 6 gets its own browser.
 *
 * Needs RELAY + BASE.
 */
const { chromium, CHROME } = require('../lib/pw');
const { systemAppIds } = require('../lib/apps');
const SYS = systemAppIds();

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };

// Count every reach for the screen, and still let it through. A stub that
// REPLACED getDisplayMedia would make leg 4 vacuous (nothing could ever call
// the real thing), and would make leg 1 a test of the stub. This wraps.
const GDM_COUNTER = `try {
  window.__gdmCalls = 0;
  const md = navigator.mediaDevices;
  if (md && md.getDisplayMedia) {
    const real = md.getDisplayMedia.bind(md);
    md.getDisplayMedia = function () { window.__gdmCalls++; return real.apply(md, arguments); };
  }
} catch (e) {}`;

const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}\n" + GDM_COUNTER });

const gdm = (p) => p.evaluate(() => window.__gdmCalls);
const info = (p) => p.evaluate(() => window.__gifosVideo.screenInfo());

(async () => {
  // ===================== THE MEETING (legs 1-5) ============================
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--auto-select-desktop-capture-source=Entire screen'],
  });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    return ctx;
  };

  // Ada seeds a desktop first (the store an app is run FROM is per-context, so
  // a fileId cannot be carried across one) — leg 4 needs an app to pin.
  const aCtx = await newUser('Ada');
  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => console.log('  [ada desk] ' + e.message));
  await aDesk.goto(BASE + '/index.html');
  // 90s: the first-visit seed GIF-encodes the sample apps, CPU-bound and
  // legitimately slow on a saturated box (measured ~60s at load 40).
  await aDesk.waitForSelector('.icon', { timeout: 90000 });
  const appFile = await aDesk.evaluate(async (sys) => {
    const fs = await window.GifOS.store.allFiles();
    const f = fs.find((x) => x.isApp && !sys.includes(x.appId));
    return f ? { id: f.id, name: f.name } : null;
  }, SYS);
  check('seeded desktop exposes an app that can be pinned into a meeting', !!appFile, appFile && appFile.name);
  await aDesk.close();

  const a = await aCtx.newPage();
  a.on('pageerror', (e) => console.log('  [ada] ' + e.message));
  await a.goto(BASE + '/run.html');
  await a.locator('#lob-open').click();
  await a.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 20000 });
  const link = await a.evaluate(() => document.getElementById('share-url').value);

  const bCtx = await newUser('Ben');
  const b = await bCtx.newPage();
  b.on('pageerror', (e) => console.log('  [ben] ' + e.message));
  await b.goto(link);
  await b.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 30000 });
  await a.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 30000 });
  check('two participants are meshed', true);

  // ---- the control exists, and says the app pin first ----------------------
  const btn0 = await a.evaluate(() => {
    const el = document.getElementById('sharebtn');
    return { present: !!el, shown: !!(el && el.offsetParent !== null), text: el && el.textContent };
  });
  check('a meeting offers Share screen', btn0.present && btn0.shown && /Share screen/.test(btn0.text || ''), JSON.stringify(btn0));
  const sheet0 = await a.evaluate(() => window.__gifosVideo.shareSheetForTest());
  check('the share sheet names Run app as the better answer for an app',
    sheet0.open && /Run app/i.test(sheet0.note) && sheet0.runAppShown,
    JSON.stringify({ runAppShown: sheet0.runAppShown, note: sheet0.note.slice(0, 90) }));
  check('…and offers a one-tap way to take it', /Run app instead/i.test(sheet0.runAppLabel), sheet0.runAppLabel);
  await a.evaluate(() => window.__gifosVideo.closeShareSheetForTest());
  check('nothing was captured just by reading the sheet', (await gdm(a)) === 0, 'gdm=' + (await gdm(a)));

  // ---- LEG 1: the share is a display capture, published on the Stage -------
  const before = await info(a);
  await a.evaluate(() => window.__gifosVideo.startScreenShareForTest());
  await a.waitForFunction(() => window.__gifosVideo.screenInfo().sharing, null, { timeout: 20000 }).catch(() => {});
  const on = await info(a);
  check('getDisplayMedia was actually reached', (await gdm(a)) === 1, 'gdm=' + (await gdm(a)));
  check('the sharer is sharing', on.sharing, JSON.stringify({ sharing: on.sharing, surface: on.surface }));
  check('the PUBLISHED track is a display capture, not the camera',
    !!on.surface || /screen|display|window|monitor/i.test(on.sentLabel || ''),
    JSON.stringify({ surface: on.surface, label: (on.sentLabel || '').slice(0, 40) }));
  check('…and it is a different track from the one published before',
    !!on.sentTrackId && on.sentTrackId !== before.sentTrackId,
    JSON.stringify({ was: (before.sentTrackId || '').slice(0, 8), now: (on.sentTrackId || '').slice(0, 8) }));
  check('sharing took a Stage seat (the room-wide broadcast tier)', on.onStage && on.steppedUp, JSON.stringify({ onStage: on.onStage, steppedUp: on.steppedUp }));
  check('the button now says how to stop',
    /Stop sharing/.test(await a.evaluate(() => document.getElementById('sharebtn').textContent)));

  // ---- LEG 2: the other side sees it, and is told what it is ---------------
  await b.waitForFunction(() => window.__gifosVideo.screenInfo().sharers.length > 0, null, { timeout: 25000 }).catch(() => {});
  const bOn = await info(b);
  check('the room knows someone is sharing', bOn.sharers.length === 1, JSON.stringify(bOn.sharers.map((x) => String(x).slice(0, 8))));
  check('…and it is the person who is actually sharing', bOn.sharers[0] === on.sharers[0]);
  check('the viewer is not itself sharing (a share is one seat, not a room mode)', !bOn.sharing);
  const chip = await b.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.chips, [class*=chip]')) out.push(el.textContent || '');
    return out.join(' | ');
  });
  check('the viewer’s tile SAYS it is a screen, not a face', /sharing their screen/.test(chip), chip.slice(0, 120));
  check('the viewer letterboxes that seat instead of cropping it square',
    (await b.evaluate((id) => window.__gifosVideo.fitForTest(id), bOn.sharers[0])) === 'contain');
  check('…and still crops ordinary faces', (await b.evaluate(() => window.__gifosVideo.fitForTest(null))) === null);
  await b.waitForFunction(() => document.body.classList.contains('screen-on'), null, { timeout: 8000 }).catch(() => {});
  check('the viewer gives the stage room to be read', (await info(b)).bodyScreenOn);

  // ---- LEG 3: it stops, all the way ---------------------------------------
  await a.evaluate(() => window.__gifosVideo.stopScreenShareForTest());
  await sleep(600);
  const off = await info(a);
  check('stopping ends the share', !off.sharing && !off.steppedUp, JSON.stringify({ sharing: off.sharing }));
  check('…steps back down off the stage it stepped up onto', !off.onStage);
  check('…and republishes the camera, not a dead display track',
    off.sentTrackId !== on.sentTrackId && !off.surface,
    JSON.stringify({ now: (off.sentTrackId || 'none').slice(0, 8), surface: off.surface }));
  await b.waitForFunction(() => window.__gifosVideo.screenInfo().sharers.length === 0, null, { timeout: 25000 }).catch(() => {});
  const bOff = await info(b);
  check('the room stops saying anyone is sharing', bOff.sharers.length === 0, JSON.stringify(bOff.sharers));
  check('the viewer never called getDisplayMedia at any point', (await gdm(b)) === 0, 'gdm=' + (await gdm(b)));

  // ---- LEG 4: THE APP PIN NEEDS NO SCREEN CAPTURE -------------------------
  // Run the app in the meeting the ordinary way, and watch the counter stay at
  // zero on BOTH sides.
  const gdmA0 = await gdm(a), gdmB0 = await gdm(b);
  await a.evaluate((f) => window.__gifosVideo.runAppForTest(f.id, f.name), appFile);
  await a.waitForSelector('#appmount iframe', { timeout: 45000 });
  await b.waitForSelector('#appmount iframe', { timeout: 60000 }).catch(() => {});
  const mounted = await b.evaluate(() => !!document.querySelector('#appmount iframe') && window.__gifosVideo.appActive());
  check('the guest runs the pinned app LOCALLY (not a video of it)', mounted);
  check('pinning an app did not reach screen capture on the host', (await gdm(a)) === gdmA0, 'gdm ' + gdmA0 + '→' + (await gdm(a)));
  check('…nor on the guest', (await gdm(b)) === gdmB0, 'gdm ' + gdmB0 + '→' + (await gdm(b)));
  check('the guest is not sharing a screen and nobody in the room is', (await info(b)).sharers.length === 0);

  // …and with an app running, the sheet leads with "you already have it".
  const sheet1 = await b.evaluate(() => window.__gifosVideo.shareSheetForTest());
  check('with an app running, the sheet says you do not need to share it',
    /already running/i.test(sheet1.note) && /not/i.test(sheet1.note),
    sheet1.note.slice(0, 110));
  check('…and points at the app that is already there', /Show me the app/i.test(sheet1.runAppLabel), sheet1.runAppLabel);
  await b.evaluate(() => window.__gifosVideo.closeShareSheetForTest());
  check('reading that sheet captured nothing either', (await gdm(b)) === gdmB0);

  // ---- LEG 5: an APP-PINNED ROOM does not offer the control at all --------
  // Reuses Ada's context and her already-seeded store. A fresh context would
  // mean a second first-visit desktop seed, and that seed GIF-encodes every
  // sample app: the suite OOM-killed its own browser on a 7.6 GB box doing it
  // twice (casualty: 497 MB available, ~390 needed). One seed per suite.
  await a.close(); await b.close(); await bCtx.close();
  const p = await aCtx.newPage();
  p.on('pageerror', (e) => console.log('  [pin] ' + e.message));
  await p.goto(BASE + '/run.html#id=' + appFile.id);
  await p.waitForSelector('#appmount iframe', { timeout: 60000 });
  // Drive the invite modal programmatically: a default app boots its own
  // .perm-modal over the app bar, and it intercepts pointer events (same
  // reason e2e-app-room.js does it this way).
  await p.evaluate(() => document.getElementById('appinvite').click());
  await p.waitForSelector('#inv-go', { timeout: 15000 });
  await p.evaluate(() => document.getElementById('inv-go').click());
  await p.waitForFunction(() => document.body.classList.contains('app-room'), null, { timeout: 30000 });
  // Turn the call layer on, so the meeting bar is actually rendered — the point
  // is that Share screen is missing BY RULE, not because no bar is drawn.
  // A DOM .click(), not a Playwright click: in an app room the bar is hidden
  // UNTIL the call layer is on, and the camera button is what turns it on —
  // an actionability check can never pass on the control that makes itself
  // visible. (Same idiom as e2e-app-room.js for the same reason.)
  await p.evaluate(() => { document.getElementById('cam').click(); });
  await p.waitForFunction(() => document.body.classList.contains('call-on'), null, { timeout: 25000 });
  const pinned = await p.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); return !!(el && el.offsetParent !== null); };
    return { appRoom: document.body.classList.contains('app-room'), callOn: document.body.classList.contains('call-on'),
      share: vis('sharebtn'), runapp: vis('appbtn'), chat: vis('chatbtn'), mic: vis('mic') };
  });
  check('an app-pinned room is up with its call layer on', pinned.appRoom && pinned.callOn, JSON.stringify(pinned));
  check('…and the meeting bar really is rendered there', pinned.chat && pinned.mic, JSON.stringify(pinned));
  check('…but an app-pinned room offers NO Share screen', pinned.share === false);
  check('…and no app picker either (the app IS the room)', pinned.runapp === false);
  check('an app-pinned room never reached screen capture', (await gdm(p)) === 0, 'gdm=' + (await gdm(p)));
  await aCtx.close();
  await browser.close();

  // ====== LEG 6: no app can photograph your screen — NO launch flags ========
  const appBrowser = await chromium.launch({ executablePath: CHROME });

  // The ask must happen inside a REAL click: getDisplayMedia needs transient
  // user activation, so an at-load call is refused for a reason that has
  // nothing to do with the app boundary and would make this leg a test of the
  // wrong refusal.
  const APP_HTML = '<!doctype html><meta charset="utf-8">'
    + '<style>html,body{margin:0;height:100%}#c{display:block;width:100vw;height:100vh;background:#222}</style>'
    + '<canvas id="c"></canvas><script>'
    + 'window.__r = "no-click-seen";'
    + 'document.getElementById("c").addEventListener("click", function () {'
    + '  window.__r = "clicked-but-nothing-answered";'
    + '  try { navigator.mediaDevices.getDisplayMedia({ video: true })'
    + '    .then(function () { window.__r = "GOT"; },'
    + '          function (e) { window.__r = "DENIED:" + e.name + ":" + String(e.message).slice(0, 90); }); }'
    + '  catch (e) { window.__r = "DENIED:" + e.name + ":" + String(e.message).slice(0, 90); }'
    + '});<\/scr' + 'ipt>';

  // Same seeding shape as e2e-fullscreen-lock.js — and the manifest file is
  // `manifest.json`, which is the name the runtime actually reads. (A
  // mis-named manifest mounts a capability-LESS app that looks identical from
  // the outside, which cost this suite a whole run.)
  const seed = (page, appId, name, caps) => page.evaluate(async (o) => {
    const manifest = { gifos: '1.0', appId: o.appId, name: o.name, entry: 'index.html' };
    if (o.caps) manifest.capabilities = o.caps;
    const files = { 'manifest.json': JSON.stringify(manifest), 'index.html': o.html };
    const bytes = await GifOS.gif.encode(files, {});
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: o.name + '.gif', bytes, kind: 'gif', isApp: true, appId: o.appId, mime: 'image/gif' });
    return id;
  }, { appId, name, caps, html: APP_HTML });

  const capCtx = await appBrowser.newContext();
  const boot = await capCtx.newPage();
  boot.on('pageerror', (e) => console.log('  [cap] ' + e.message));
  await boot.goto(BASE + '/run.html');
  await boot.waitForFunction(() => window.GifOS && GifOS.store && GifOS.gif, null, { timeout: 60000 });
  const plainId = await seed(boot, 'plainshot', 'Plain', null);
  // An app that ASKS. `screen` is not a capability the runtime knows, which is
  // the whole point: asking must not be a way in, now or after some future
  // refactor decides unknown keys deserve the benefit of the doubt.
  const shotId = await seed(boot, 'screenshot', 'Shotty', { screen: true, fullscreen: true });
  await boot.close();

  const mount = async (fileId) => {
    const page = await capCtx.newPage();
    page.on('pageerror', (e) => console.log('  [cap] ' + e.message));
    await page.goto(BASE + '/run.html#id=' + fileId);
    await page.waitForSelector('#appmount iframe', { timeout: 60000 });
    const row = await page.evaluate(() => {
      const cb = document.querySelector('.perm-modal input[data-cap="screen"]');
      const r = cb && cb.closest('.perm-row');
      return r ? (r.textContent || '') : null;
    });
    // The sheet covers the app, so the click below would land on its backdrop.
    const done = await page.$('.perm-modal .done');
    if (done) { await done.click(); await page.waitForTimeout(150); }
    const el = await page.$('#appmount iframe');
    const allow = (await el.getAttribute('allow')) || '';
    const sandbox = (await el.getAttribute('sandbox')) || '';
    const frame = await el.contentFrame();
    await frame.waitForSelector('#c', { timeout: 15000 });
    await frame.click('#c');   // a REAL gesture: getDisplayMedia demands one
    await page.waitForTimeout(1200);
    const r = await frame.evaluate(() => window.__r).catch((e) => 'UNREADABLE:' + e.message);
    await page.close();
    return { row, allow, sandbox, r };
  };

  const plain = await mount(plainId);
  check('an ordinary app is refused the screen', /^DENIED:/.test(plain.r), plain.r);
  check('…and was never delegated display-capture', !/display-capture/.test(plain.allow), plain.allow || '(no allow attribute)');

  const shot = await mount(shotId);
  check('an app that ASKS for the screen in its manifest is refused too', /^DENIED:/.test(shot.r), shot.r);
  check('…because asking is not a capability the runtime knows', !/display-capture/.test(shot.allow), shot.allow || '(no allow attribute)');
  check('…and the Abilities sheet offers no screen row to tick', shot.row === null);
  // The control: this app ALSO declares fullscreen, which the runtime does
  // know. If that came through and the screen did not, the refusal above is a
  // rule — not a manifest the mount failed to read.
  check('…while its other, REAL declared capability came through',
    /(^|[\s;])fullscreen([\s;]|$)/.test(shot.allow), shot.allow);
  check('THE SANDBOX ITSELF IS UNTOUCHED — the opaque origin is why the screen is safe',
    shot.sandbox.replace(/\s*allow-orientation-lock/, '') === plain.sandbox
    && !/allow-same-origin/.test(shot.sandbox), shot.sandbox + ' vs ' + plain.sandbox);

  await appBrowser.close();
  console.log(fail ? '\nFAILURES: ' + fail : '\nall green');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
