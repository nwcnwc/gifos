// End-to-end: THREE PEOPLE DRIVING TOGETHER.
//
// Anyroad's multiplayer (apps/anyroad/mp.js — ghost cars, the player count, a
// race two points wide) had NO coverage of any kind until this file: the only
// suite that ever ran the app opened exactly one browser context. That is the
// state CLAUDE.md warns about — not red, just unguarded, which is how the two
// app drills stayed dead for months.
//
// What a third person proves that a second does not: `others` is a map keyed by
// player id and `ghosts()` walks it, so a bug that renders "the other player"
// rather than "every other player" passes at two and fails at three.
//
// It is also the only place the runtime's DOWNLOAD POOL is exercised by a real
// app on real URLs. e2e-pool proves the mechanism with a six-line synthetic
// app; this proves the thing the mechanism was built for — that three people
// driving the same street cost the donated Overpass server ONE query per tile
// rather than three. The count is taken at the route interceptor, which is
// per-context, so a URL one player fetched is simply never requested by the
// other two: summing the ledgers counts REAL upstream requests.
//
// BOTH DOORS ARE RUN. ROOM=meet is a meeting that happens to be showing an
// app; ROOM=app is the app AS the room, invited in place from a desktop icon
// with no call layer at all. Unset runs both in sequence. Measured on a 4-core
// box: meet 70-101s, app 115-173s. Dropping the a/v plane does NOT make this
// cheaper here, and that is not a surprise once stated: the media is FAKE
// devices with no capture and no encode, so removing it saves almost nothing,
// while the wall clock is dominated by a fixed 40s drive and three swiftshader
// worlds. On real hardware with real cameras the saving is real. On this box
// the app path is if anything the slower of the two, and run-to-run variance
// (115s vs 173s for the same mode) is larger than the gap between them — which
// is the usual warning that a number measured here is a number about the box.
//
// RECORD=1 records each player's screen to test/out/anyroad-mp[-app]/*.webm.
//
// Needs: static server on 8099, local relay on 8790. Three Chromiums rendering
// a 3D world on a software rasteriser is heavy — every assertion here is about
// STATE (who can see whom, how many queries), never about frame timings, which
// on one box cannot tell a product bug from a busy kernel.
const { chromium, CHROME } = require('../lib/pw');
const needFleet = require('../lib/fleet');
const { openFleet, closeFleet } = require('../lib/fleet-browsers');
const { appGif } = require('../lib/apps');
const { HOP, routeWorld } = require('../lib/anyroad-fixtures');
const need = require('../lib/need');   // a missing fixture must never look like a product bug
const { readFileSync, mkdirSync, existsSync, rmSync, readdirSync, renameSync } = require('fs');
const path = require('path');

// The browsers are on OTHER MACHINES, so the stack address cannot be
// loopback: they dial the orchestrator over the network, at the base/relay in
// the hosts file. Env still wins for a hand-driven run.
const FLEETCFG = needFleet.load() || {};
const BASE = process.env.BASE || FLEETCFG.base || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || FLEETCFG.relay || 'ws://127.0.0.1:8790';
const RECORD = process.env.RECORD === '1';
// 'meet' = a meeting running an app; 'app' = the app IS the room, no call
// layer. BOTH run by default, one after the other: they are different products
// reached through different doors, and a door no battery opens is a door that
// rots — which is the whole reason this file exists.
const MODES = process.env.ROOM ? [process.env.ROOM] : ['meet', 'app'];
const NAMES = ['Ada', 'Ben', 'Cyd'];

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(MODE) {
  const OUT = path.resolve(__dirname, '../out/anyroad-mp' + (MODE === 'app' ? '-app' : ''));
  // A dead relay looks EXACTLY like a broken app here: the room forms locally,
  // the invite link mints, and the guests then sit on "reconnecting to the
  // room…" until a 90 s locator gives up somewhere deep in the mount. That is
  // the failure mode need.js exists for — cost an hour of chasing the app-room
  // path before this line was here.
  // The stack lives wherever the fleet's browsers can reach it — check THERE,
  // not on loopback, or a healthy remote stack is refused as missing.
  await need({ 8099: 'a static server on 8099 (python3 -m http.server 8099 -d site)', 8790: 'relay-local' },
    new URL(BASE).hostname);
  const t0 = Date.now();
  console.log('=== ROOM=' + MODE + (MODE === 'app' ? '  (app-pinned — no call layer)' : '  (meeting with an app on the stage)'));
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');
  if (RECORD) { if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true }); }

  // THIS SUITE REQUIRES THREE ISOLATED MACHINES, one per driver, and refuses
  // to render a verdict without them. Its steering assertions read a physics
  // simulation that advances per RENDERED FRAME; three Chromiums driving 3D
  // through a software rasteriser on ONE box render at about 1 fps, and every
  // number this file produces there is a number about that box. That is not a
  // theory: the same block was "fixed" three times (2026-08-08 twice,
  // 2026-08-11) and cornered on the third — generous waits TIME OUT at 600s,
  // tight waits cannot render enough frames to measure, and no setting exists
  // between them. See test/lib/fleet.js.
  // WIRING-ONLY MODE, for the behaviour battery. 26a runs this file to prove
  // the app-room door works with three drivers; it is not the place the
  // steering PHYSICS is judged, and it must not demand a fleet from every box
  // the battery runs on. So ANYROAD_MP_LOCAL=1 keeps the door, the ghosts, the
  // download pool and the race — and skips the physics block, out loud.
  const LOCAL = process.env.ANYROAD_MP_LOCAL === '1';
  const fleet = LOCAL ? null : await needFleet(3, {
    why: 'each driver needs its own CPU — the steering assertions read a physics sim that advances per RENDERED FRAME, and three 3D browsers on one box render at ~1 fps',
    roles: NAMES.map((n) => n.toLowerCase()),
  });
  const LAUNCH_ARGS = [
      // No GPU on the gate box; without a software rasteriser there is no WebGL
      // context at all and the app would correctly refuse to run.
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      // WITHOUT THESE THERE IS NO MULTIPLAYER TO TEST. Chromium throttles a
      // backgrounded tab's requestAnimationFrame to roughly one frame a second,
      // and this app IS its animation loop — so only the tab in front drives,
      // the other two cars sit still, and mp.js's staleness rule (which keys on
      // a position that CHANGED, not on a heartbeat) correctly stops drawing
      // them. Measured with the round-robin bringToFront this suite used first:
      // every player saw exactly one of the other two. That is the harness
      // starving the app, not a product bug, and it is the difference between
      // three cars driving together and three tabs taking turns.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
  ];
  const boxes = LOCAL ? null : await openFleet(fleet.hosts.slice(0, NAMES.length), { args: LAUNCH_ARGS, origin: BASE });
  const localBrowser = LOCAL ? await chromium.launch({ executablePath: CHROME, args: LAUNCH_ARGS }) : null;
  if (LOCAL) console.log('  WIRING-ONLY (ANYROAD_MP_LOCAL=1): one box, and the steering PHYSICS block is SKIPPED — it needs a machine per driver (test/lib/fleet.js).');

  const players = [];
  for (let pi = 0; pi < NAMES.length; pi++) {
    const name = NAMES[pi];
    const box = LOCAL ? null : boxes[pi];        // Ada, Ben and Cyd, each on their own machine
    const ctx = await (box ? box.browser : localBrowser).newContext(Object.assign(
      { permissions: ['camera', 'microphone'], viewport: { width: 1000, height: 700 } },
      RECORD ? { recordVideo: { dir: path.join(OUT, name), size: { width: 1000, height: 700 } } } : {},
    ));
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('gifos_relay', v.relay);
        localStorage.setItem('gifos_name', v.name);
        localStorage.setItem('gifos_meet_bar', '0');
      } catch (e) {}
    }, { relay: RELAY, name });
    // Count every getUserMedia. An app room's whole claim is that it never
    // touches your camera, and "the grid looks dark" is not that claim.
    await ctx.addInitScript(() => {
      window.__gumCount = 0;
      const md = navigator.mediaDevices;
      if (md && md.getUserMedia) { const real = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gumCount++; return real(c); }; }
    });
    const hits = await routeWorld(ctx);
    players.push({ name, ctx, hits, box: box ? (box.host.name || box.host.ssh) : 'local' });
  }
  const [ada, ben, cyd] = players;
  console.log('  FLEET placement: ' + players.map((p) => p.name + '@' + p.box).join('  '));

  // ---- Ada installs the real built GIF and shares it into a meeting --------
  const desk = await ada.ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [Ada desk pageerror]', e.message));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 90000 });
  const fid = await desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'Anyroad.gif', bytes, kind: 'gif', isApp: true, appId: 'anyroad', mime: 'image/gif' });
    return id;
  }, gifB64);
  check('the built Anyroad GIF installs on the host desktop', !!fid);

  ada.page = await ada.ctx.newPage();
  ada.page.on('pageerror', (e) => console.log('  [Ada pageerror]', e.message));

  // THE TWO WAYS THREE PEOPLE END UP IN ONE ANYROAD, and they are different
  // products, not two spellings of one. Both are run, because a path no battery
  // reaches is a path that rots.
  //
  //   meet — a MEETING that happens to be running an app. Faces first: the call
  //          layer is up from the start, every participant is publishing media,
  //          and the app rides the meeting's Stage DATA lane.
  //   app  — the APP is the room. Opened solo from a desktop icon, Invite flips
  //          the same page in place with NO navigation and NO call layer: the
  //          grid stays dark and nobody's camera is ever touched unless someone
  //          opts in. Same mesh, same owner-signed lane, none of the a/v.
  //
  // Everything after this fork is identical, on purpose — the game must not be
  // able to tell which door people came through.
  let link;
  if (MODE === 'app') {
    await ada.page.goto(BASE + '/run.html#id=' + fid);
    await ada.page.waitForSelector('#appmount iframe', { timeout: 60000 });
    await ada.page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 15000 }).catch(() => {});
    // Driven programmatically: the app's own consent sheet can overlay the page
    // and eat the pointer event, which is not what is under test here.
    await ada.page.evaluate(() => document.getElementById('appinvite').click());
    await ada.page.waitForSelector('input[name="rmcls"]', { timeout: 20000 });
    await ada.page.evaluate(() => {
      const heal = document.querySelector('input[name="rmcls"][value="heal"]');
      if (heal) heal.checked = true;           // resilient: the room outlives its opener
      document.getElementById('inv-go').click();
    });
    await ada.page.waitForFunction(() => document.body.classList.contains('app-room') && window.__gifosVideo.room(), null, { timeout: 40000 });
    link = await ada.page.evaluate(() => document.getElementById('share-url').value);
    check('Invite turned the running app into a room, on the same page', true, link);
    check('the app is PINNED — there is no stop or hide affordance',
      await ada.page.evaluate(() => {
        const s = document.getElementById('appstop'), h = document.getElementById('apphide');
        return s.style.display === 'none' && h.style.display === 'none';
      }));
    check('the call layer is DARK — an app room is not a video call',
      await ada.page.evaluate(() => !document.body.classList.contains('call-on')));
  } else {
    await ada.page.goto(BASE + '/run.html');
    await ada.page.locator('#lob-open').click();
    await ada.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 60000 });
    link = await ada.page.evaluate(() => document.getElementById('share-url').value);
    check('Ada opened a meeting and has an invite link', /run\.html|\/j\//.test(link || ''), link);
  }

  // ---- Ben and Cyd walk in through the link -------------------------------
  for (const p of [ben, cyd]) {
    p.page = await p.ctx.newPage();
    p.page.on('pageerror', (e) => console.log('  [' + p.name + ' pageerror]', e.message));
    await p.page.goto(link);
  }
  // WAIT ON THE RIGHT THING, and it is not the same thing in both modes.
  //
  // In a meeting, liveLinks() counts peers whose PeerConnection is up, and the
  // host cannot put an app on the stage before anyone is there to see it. ONE
  // live link, not two: three nodes do not form a triangle — the stadium's
  // fabric is a tree plus its lateral links, so the middle of a three-node
  // section can be the only one with two peers and the ends have one each. App
  // state still reaches everybody, because the sga lane FLOODS across
  // structural links rather than requiring a direct edge.
  //
  // In an APP ROOM there is no call layer at all, so `connected` — a
  // media-plane notion — is not the readiness signal and waiting on it hangs
  // for the full timeout while the app is already up on every screen. The
  // product-level gate is the one that matters anyway and it is the same
  // sentence in English: the app converged to everybody.
  if (MODE !== 'app') {
    for (const p of players) {
      await p.page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 90000 });
    }
    // The host has to put it on the stage; in an app room it is already running
    // and the guests converge to it.
    await ada.page.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Anyroad'), fid);
  }
  for (const p of players) {
    await p.page.waitForSelector('#appmount iframe', { timeout: 90000 }).catch(async (e) => {
      // Say WHAT the stuck page was showing. "waitForSelector timed out" names
      // the symptom; the room status line names the cause.
      const st = await p.page.evaluate(() => ({
        status: (document.getElementById('status') || {}).textContent,
        room: !!(window.__gifosVideo && window.__gifosVideo.room()),
        peers: window.__gifosVideo ? window.__gifosVideo.peerCount() : -1,
        body: document.body.className,
        knock: !!document.querySelector('#knock, #lobby, .knock'),
      })).catch(() => null);
      console.log('  [STUCK ' + p.name + '] ' + JSON.stringify(st));
      throw e;
    });
    await p.page.bringToFront();
    // The declared-network consent sheet stands between the app and the bridge
    // on every peer independently; a click on one is not a click on the others.
    await p.page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 15000 }).catch(() => {});
    // The share sheet is a full-page overlay sitting on top of the running
    // game, and it RE-RENDERS as the room forms — so hiding it before the
    // guests arrive does not stick. Close it here, once everything has settled,
    // through the product's own Close button. Without this every later click
    // into the app frame lands on the sheet instead; Playwright says so in as
    // many words ("name-box … intercepts pointer events") where a human would
    // simply have closed it.
    await p.page.evaluate(() => {
      const done = document.getElementById('inv-done');
      if (done) done.click();
      const m = document.getElementById('inv-modal');
      if (m) m.style.display = 'none';
    }).catch(() => {});
    p.fr = p.page.frameLocator('#appmount iframe');
    p.body = () => p.fr.locator('body');
  }
  const links = await Promise.all(players.map((p) => p.page.evaluate(() => ({
    live: window.__gifosVideo.liveLinks(), known: window.__gifosVideo.peerCount(),
  }))));
  console.log('  [mesh] ' + JSON.stringify(links));
  // NOBODY IS ALONE — and that is the whole of what the mesh promises here.
  // An earlier version demanded each node know the other TWO, which asserts a
  // TRIANGLE; three nodes form a tree plus lateral links, so the two leaves
  // legitimately hold one peer each and only the middle holds two. Measured
  // both shapes across runs of this very suite. What actually matters is
  // claimed further down and does not care about the shape at all: every
  // player ends up seeing every other player, because the app lane FLOODS
  // across structural links rather than needing a direct edge.
  check('nobody is stranded — every player has a peer', links.every((l) => l.known >= 1), JSON.stringify(links));
  check('all three mounted the SAME shared app from the mesh',
    (await Promise.all(players.map((p) => p.page.evaluate(() => window.__gifosVideo.appActive())))).every(Boolean));
  check('exactly one of them is the app host',
    (await Promise.all(players.map((p) => p.page.evaluate(() => window.__gifosVideo.appIsHost())))).filter(Boolean).length === 1);

  for (const p of players) await p.fr.locator('#landing').waitFor({ timeout: 30000 });
  check('Anyroad booted inside all three sandboxes', true);

  if (MODE === 'app') {
    // THE POINT OF THIS MODE. Three people are in a shared world together and
    // not one camera has been opened — not the host's, not either guest's. The
    // a/v plane is the expensive half of a meeting, and a game does not need it.
    const gum = await Promise.all(players.map((p) => p.page.evaluate(() => window.__gumCount)));
    check('nobody\'s camera or microphone was ever opened', gum.every((n) => n === 0), JSON.stringify(gum));
    check('…and the call layer stayed dark for everyone',
      (await Promise.all(players.map((p) => p.page.evaluate(() => !document.body.classList.contains('call-on'))))).every(Boolean));
    check('the guests are not hosts of the app they joined',
      (await Promise.all([ben, cyd].map((p) => p.page.evaluate(() => !window.__gifosVideo.appIsHost())))).every(Boolean));
  }

  // ---- Ada picks the place. The other two must FOLLOW HER THERE ------------
  // This is the design claim in mp.js: the invite link alone is enough, because
  // the host publishes the world point and a guest with no world of its own
  // adopts it. Nobody tells Ben and Cyd where Paris is.
  await ada.fr.locator('#presets button', { hasText: 'Paris' }).first().click();
  for (const p of players) {
    await p.page.bringToFront();
    await p.fr.locator('#hud').waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  }
  const hopped = [];
  for (const p of players) {
    await p.page.bringToFront();
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      ok = await p.body().evaluate(() => !!(window.App && window.App.hasHopped() && window.App.world.frame)).catch(() => false);
      if (!ok) await sleep(1000);
    }
    hopped.push(ok);
  }
  check('every player landed in a world, including the two who never chose one', hopped.every(Boolean), JSON.stringify(hopped));

  const geo = [];
  for (const p of players) {
    await p.page.bringToFront();
    geo.push(await p.body().evaluate(() => {
      const f = window.App.world.frame; const c = window.App.car();
      return f.toGeo(c.x, c.z);
    }));
  }
  const spread = Math.max(...geo.map((g) => Math.abs(g.lat - HOP.lat))) * 111000;
  check('…and it is the SAME place on Earth, not three copies of the app',
    spread < 900, 'furthest car ' + spread.toFixed(0) + ' m from the drop point');

  // ---- THREE DRIVERS, THREE STEERING METHODS ------------------------------
  // The schemes (wheel / stick / tilt) are three separate input paths into one
  // car, and until now every suite drove the default. A scheme nobody exercises
  // is a scheme that breaks silently — and it breaks for the player who chose
  // it, who has no way to know the other two work fine.
  //
  // Driven through REAL events on the REAL elements: pointer events on the
  // wheel and on the canvas, DeviceOrientationEvent for tilt. Poking
  // controls.input directly would prove only that the physics reads a number
  // somebody set.
  //
  // The assertion is deliberately SIGN-RELATIVE — left and right must bend the
  // car opposite ways — rather than "left decreases yaw". That is true whatever
  // the handedness convention is, and this app has already shipped one mirrored
  // world (132fa02); a test that hard-codes a direction would have gone green
  // through it.
  // ONCE PER RUN, not once per door. The schemes are a property of the CAR;
  // whether the room was opened as a meeting or as an app has nothing to do
  // with whether the tilt steers. Running them in both modes cost 172 s of the
  // suite's 600 s budget for a duplicate answer and pushed the whole thing over
  // the cap — ROOM=meet went from ~100 s to 272 s, and ROOM=app was killed
  // partway through with 51 passed and 0 failed. A suite that runs out of clock
  // is red, and red for no reason is the worst kind.
  const SCHEMES = { Ada: 'wheel', Ben: 'stick', Cyd: 'tilt' };
  if (MODE === MODES[0] && !LOCAL) {
  for (const p of players) {
    await p.page.bringToFront();
    // locator.evaluate hands the ELEMENT in first: the argument is the SECOND
    // parameter. Written as (s) => … the scheme was set to an HTMLBodyElement,
    // which sailed through Sources.set and took the app's frame down with it.
    await p.body().evaluate((el, s) => window.Sources.set({ scheme: s }), SCHEMES[p.name]);
  }
  await sleep(1200);
  const took = [];
  for (const p of players) {
    await p.page.bringToFront();
    took.push(await p.body().evaluate(() => window.Sources.current.scheme));
  }
  check('each driver is on a DIFFERENT steering method',
    new Set(took).size === 3 && took.join() === NAMES.map((n) => SCHEMES[n]).join(),
    NAMES.map((n, i) => n + '=' + took[i]).join(', '));

  // Hold a direction for `ms` and report what the input layer and the car did.
  const FRAME_WINDOW = Number(process.env.STEER_FRAMES || 55);
  // The backstop for ONE steering leg. Not a budget for the measurement — the
  // window ends when the frames arrive (usually ~2s) or when the tab stops
  // rendering (5s of no frames). This only bounds a box so starved it is
  // crawling, and on such a box we would rather wait than publish a verdict
  // about a car that never moved.
  const STEER_CAP_MS = Number(process.env.STEER_CAP_MS || 12000);
  // The SMALLEST window that can still carry a verdict. Filling all 55 frames
  // is ideal; on a 6-core box running three swiftshader worlds the tab renders
  // at about 1 fps and 55 frames simply cannot arrive inside any sane cap
  // (measured 2026-08-11: 23-30 of 55 at a 25s cap, on every player). Judging
  // 8 frames is dishonest; refusing to judge 25 is useless. So: score a window
  // of at least MIN_FRAMES, and scale the absolute radian floor by how much of
  // the window actually rendered — the drift comparison beside it already
  // self-scales, since drift is measured over the same window.
  const MIN_FRAMES = Number(process.env.STEER_MIN_FRAMES || 20);
  const steerFor = (p, dir, ms) => p.body().evaluate(async (el, [dir, ms, frameWindow, MIN_FRAMES]) => {
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const scheme = window.Sources.current.scheme;
    const view = document.getElementById('view');
    const pad = document.getElementById('steerpad') || view;
    const pe = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, bubbles: true, cancelable: true, clientX: x, clientY: y,
      isPrimary: true, pointerType: 'touch', button: 0, buttons: 1,
    }));
    const box = (el) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
    // The throttle is MANUAL by default (2026-08-08) — hold W for the whole
    // window, in EVERY leg including the straight-line baseline: the baseline
    // measures what the road does to a MOVING unsteered car, and an
    // unthrottled car is a parked one. W is scheme-safe: full power on the
    // wheel, the manual throttle under tilt, and in stick mode it only trims
    // the set-point while the stick is untouched (the stick's own seeded
    // set-point carries the active legs).
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    const unthrottle = () => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    let stop = () => unthrottle();
    if (dir === 0) {
      // The baseline: steer nothing. Any held steering control here would be
      // measuring the control, which is the opposite of the point.
    } else if (scheme === 'tilt') {
      // gamma is the device's left/right tilt; car.js captures the FIRST value
      // it sees as neutral, so send an upright frame before tilting or the
      // whole test is measured against an already-turned wheel.
      const send = (g) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',
        { gamma: g, beta: 0, alpha: 0, absolute: true }));
      send(0);
      const t = setInterval(() => send(dir * 34), 50);
      stop = () => { clearInterval(t); send(0); unthrottle(); };
    } else if (scheme === 'stick') {
      const [cx, cy] = box(view);
      pe(view, 'pointerdown', cx, cy);
      pe(view, 'pointermove', cx + dir * 110, cy);   // sideways only: speed held
      stop = () => { pe(view, 'pointerup', cx + dir * 110, cy); unthrottle(); };
    } else {
      const [cx, cy] = box(pad);
      pe(pad, 'pointerdown', cx, cy);
      pe(pad, 'pointermove', cx + dir * 90, cy);
      stop = () => { pe(pad, 'pointerup', cx + dir * 90, cy); unthrottle(); };
    }
    // WAIT FOR THE INPUT TO REGISTER before opening the frame window (the
    // 2026-08-08 gate FLAKY, 'steer -1.00/-1.00'): under load the previous
    // leg's full lock is still draining out of the input when this window
    // opens, peak-|steer| latches the OLD sign, and the strict '>' below
    // never lets an equal-magnitude opposite sign replace it. The car is
    // fine; the window opened early. So: don't count frames until the
    // commanded sign is demonstrably in the input (bounded — a control that
    // never registers still runs the window and reds the reach assert).
    // …and BOUND THAT WAIT IN FRAMES TOO. It was 4s of wall clock, which on a
    // tab rendering at ~1 fps is about four frames — so on a slow box the
    // window opened with the input still unregistered, which is exactly how a
    // full-lock right turn came back `yaw 0.00` while its left twin read 0.64.
    if (dir !== 0) {
      const tReg = Date.now();
      const fReg = window.App.debug().frames;
      while (Date.now() - tReg < 8000 && window.App.debug().frames - fReg < 12) {
        const d0 = window.App.debug();
        const st = (d0.input && d0.input.steer) || 0;
        if (Math.sign(st) === Math.sign(dir) && Math.abs(st) > 0.15) break;
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    // HOLD FOR FRAMES, NOT FOR SECONDS. The physics advances per rendered
    // frame with dt clamped at 50 ms, so a wall-clock window measures how many
    // frames the BOX managed, not what the car does: the same half-lock turn
    // came out 0.07 rad on eight cores and 0.01 rad on four. Counting frames
    // makes the window a fixed slice of simulated time, and the radians below
    // become a property of the car on any machine. Wall clock survives only as
    // a safety net so a stalled tab cannot hang the battery.
    // …and the WALL CLOCK MUST NOT BE THE THING THAT ENDS THE WINDOW.
    //
    // It was a flat 7s net, and that is what flaked the 0.9.7 gate: the tilt
    // leg reported `yaw -0.64/0.00 rad, speed 0.4 m/s, 8 frames`. EIGHT of the
    // 55 frames — the tab was rendering at about 1 fps with three browsers
    // driving a 3D world on a loaded box, so the net fired first, the car had
    // advanced 0.4s of simulated time instead of 2.75s, and the assertions
    // below solemnly judged a window that never happened.
    //
    // The net exists for ONE thing: a tab that has stopped rendering must not
    // hang the battery. That is a stall, and it is detectable directly — so
    // wait as long as frames keep ARRIVING, and give up only when they stop.
    // A starved box now fills its window slowly instead of reporting a car
    // that would not turn, and a hung tab still fails in ~5s instead of 7.
    // ACCUMULATE THE TURN, DO NOT SUBTRACT TWO HEADINGS. wrap() folds into
    // (-pi, pi], so a turn of MORE than half a circle comes back with the
    // opposite sign — and the sign test then reports a car that turned hard
    // the right way as turning the wrong way. Invisible while the car was
    // starved on a shared box; the first run on its own machine turned fast
    // enough to wrap, and read 'yaw -2.57/-2.60' for a left and a right.
    let yawPrev = window.App.car().yaw, yawAcc = 0;
    const frames0 = window.App.debug().frames;
    let peakSteer = 0;
    const STALL_MS = 5000;
    const cap = Date.now() + ms;
    let seen = frames0, advancedAt = Date.now();
    for (;;) {
      const d = window.App.debug();
      if (d.input && Math.abs(d.input.steer) > Math.abs(peakSteer)) peakSteer = d.input.steer;
      const yNow = window.App.car().yaw;
      yawAcc += wrap(yNow - yawPrev); yawPrev = yNow;   // per-sample, so it never wraps
      if (d.frames - frames0 >= frameWindow) break;
      if (d.frames > seen) { seen = d.frames; advancedAt = Date.now(); }
      else if (Date.now() - advancedAt > STALL_MS) break;   // the tab stopped rendering
      if (Date.now() > cap) break;                          // absolute backstop
      await new Promise((r) => setTimeout(r, 30));
    }
    const framesRun = window.App.debug().frames - frames0;
    yawAcc += wrap(window.App.car().yaw - yawPrev);
    const out = { scheme, steer: peakSteer, dYaw: yawAcc,
                  speed: window.App.debug().speed, frames: framesRun,
                  // Judging steering on a window that never filled is judging
                  // the box. The caller refuses to score an unfilled leg.
                  filled: framesRun >= MIN_FRAMES, want: frameWindow, min: MIN_FRAMES };
    stop();
    return out;
  }, [dir, ms, FRAME_WINDOW, MIN_FRAMES]);

  const steering = [];
  for (const p of players) {
    await p.page.bringToFront();
    // A BASELINE FIRST: how far does the car's heading wander over the same
    // window with NO input at all? Yaw-per-wall-second is a statement about
    // how many frames this box managed to render — three software-rasterised
    // worlds, and a starved tab turns less for the same held input. Measured:
    // the same full-lock command produced 0.11 rad in one tab and 0.02 in
    // another on one run. Comparing the turn against this tab's OWN straight
    // line cancels the frame rate out and leaves the product claim, which is
    // simply that steering bends the car and not steering does not.
    // A car wedged against a wall by the previous turn steers nothing, and
    // would report that as a broken control scheme. unstick() is the app's own
    // "put me back on the road" button — the same one a player reaches for.
    const ready = async () => p.body().evaluate(async () => {
      // Unstick REPEATEDLY, not once (the 2026-08-08 gate FLAKY, 'speed 0.0
      // m/s, yaw 0.00/0.00'): one unstick at i=8 then 8 more seconds of
      // silent waiting delivered a PARKED car to the steering legs on a
      // loaded box, and the suite reported the park as a broken control
      // scheme. The car has to be moving before a steering measurement means
      // anything; keep reaching for the app's own recovery button.
      // AND HOLD THE THROTTLE while waiting: the default is MANUAL now
      // (sources.js, 2026-08-08) — an unthrottled car legitimately sits at 0
      // forever, which is the product working, not a car to measure.
      // COUNT THE CHANCES IN FRAMES, NOT TICKS. The car accelerates per
      // rendered frame, so 40 x 250 ms gives a 60 fps tab ~600 frames to get
      // moving and a 1 fps tab about ten — and then the leg runs anyway on a
      // parked car and blames the control scheme. Keep going while frames are
      // still arriving, up to a real ceiling.
      const f0 = window.App.debug().frames;
      const tEnd = Date.now() + 15000;
      for (let i = 0; Date.now() < tEnd; i++) {
        if (window.App.debug().speed > 4) { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' })); return window.App.debug().speed; }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
        if (i % 8 === 7) window.App.unstick();
        if (window.App.debug().frames - f0 > 120) break;   // plenty of frames, still parked
        await new Promise((r) => setTimeout(r, 250));
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      return window.App.debug().speed;
    });
    const r0 = await ready();
    const straight = await steerFor(p, 0, STEER_CAP_MS);
    await sleep(400);
    const r1 = await ready();
    const left = await steerFor(p, -1, STEER_CAP_MS);
    await sleep(400);
    const r2 = await ready();
    const right = await steerFor(p, +1, STEER_CAP_MS);
    await sleep(400);
    steering.push({ name: p.name, straight, left, right, ready: [r0, r1, r2] });
  }
  for (const s of steering) {
    const d = `${s.left.scheme}: steer ${s.left.steer.toFixed(2)}/${s.right.steer.toFixed(2)}, ` +
              `yaw ${s.left.dYaw.toFixed(2)}/${s.right.dYaw.toFixed(2)} rad, ` +
              `speed ${s.right.speed.toFixed(1)} m/s, ${s.right.frames} frames`;
    // A WINDOW THAT NEVER FILLED CANNOT BE JUDGED. Every threshold below is a
    // property of the car over a FIXED slice of simulated time; on a leg that
    // rendered 8 of its 55 frames they describe the box instead, which is
    // exactly the false red this suite produced in the 0.9.7 gate. Say so, in
    // those words, and do not pretend to a verdict about steering.
    // A LEG THAT STARTED PARKED IS NOT A STEERING MEASUREMENT. ready() holds
    // the throttle and hammers the app's own unstick() until the car is above
    // 4 m/s; when it gives up, the car is wedged or the tab is starved, and
    // steering a stationary car tells you nothing about the control scheme.
    // This is the residual flake behind 'was genuinely driving forward while
    // steering (1.7 m/s)' and its -2.2 m/s twin, and it reproduces on the tree
    // BEFORE the frame-window work as well as after (measured, interleaved).
    if ((s.ready || []).some((v) => !(v > 4))) {
      check(s.name + ' — the car was MOVING when each window opened (about the box, not the car)', false,
        'speeds at window open: ' + (s.ready || []).map((v) => Number(v).toFixed(1)).join(' , ')
        + ' m/s — ready() could not get it above 4 m/s, so it is wedged or starved. Re-run on an idle box.');
      continue;
    }
    const legs = [s.straight, s.left, s.right];
    if (!legs.every((l) => l.filled)) {
      check(s.name + ' — the steering window FILLED (this is about the box, not the car)', false,
        legs.map((l) => l.frames + '/' + l.want).join(' , ') + ' frames (need ' + legs[0].min + ') — the tab could not render the '
        + 'window inside ' + Math.round(STEER_CAP_MS / 1000) + 's, so the '
        + 'steering numbers below would be a measurement of this machine. Re-run on an idle box.');
      continue;
    }
    check(s.name + ' — the ' + s.left.scheme + ' reaches the car at all',
      Math.abs(s.left.steer) > 0.15 && Math.abs(s.right.steer) > 0.15, d);
    check(s.name + ' — the ' + s.left.scheme + ' steers BOTH ways, not just one',
      Math.sign(s.left.steer) === -Math.sign(s.right.steer) && s.left.steer !== 0, d);
    // Against this tab's own straight line, not against a fixed number of
    // radians. `drift` is what the road and the terrain do to a car nobody is
    // steering; a real turn has to beat it by a wide margin in BOTH directions.
    // Both tests now: several times the car's own straight-line wander, AND a
    // floor in radians — which only means anything because the window is a
    // fixed number of frames rather than a fixed number of seconds.
    const drift = Math.abs(s.straight.dYaw);
    // The floor is per-window: 0.04 rad is what a full-lock turn clears over a
    // FULL 55 frames, so over a short window it must be scaled or it is asking
    // the car to turn further than the simulated time allows.
    const frac = Math.min(1, Math.min(s.left.frames, s.right.frames) / s.left.want);
    const floor = 0.04 * frac;
    check(s.name + ' — and the car actually turns, in opposite directions',
      Math.sign(s.left.dYaw) === -Math.sign(s.right.dYaw)
      && Math.abs(s.left.dYaw) > Math.max(floor, drift * 3)
      && Math.abs(s.right.dYaw) > Math.max(floor, drift * 3),
      d + ', drift ' + s.straight.dYaw.toFixed(3) + ' over ' + s.straight.frames + ' frames, floor ' + floor.toFixed(3));
    // "Feels right" is not a frame timing on this box — but a car that is
    // stationary, reversing or supersonic while being steered is not a
    // judgement call, and any of them means the drive under test was not a
    // drive at all.
    check(s.name + ' — was genuinely driving forward while steering',
      s.right.speed > 2 && s.right.speed < 70, s.right.speed.toFixed(1) + ' m/s');
  }
  }   // end: steering schemes, first door only

  // ---- Let them drive together — via the throttle SETTING ------------------
  // The default is MANUAL now (sources.js, 2026-08-08), so hands-free driving
  // is a SETTING — and settings are per-player prefs. Flip every player to
  // AUTO through the REAL control (the settings select + change event, the
  // handler a user's tap runs), and assert each car actually cruises: this is
  // the old drive-together section AND the per-player setting exercised at
  // once, and it feeds the ghost-freshness legs below exactly as before
  // (mp.js drops a car whose position stops CHANGING, so parked cars would
  // fail those legs while the product worked).
  const DRIVE_MS = Number(process.env.DRIVE_MS || 40000);
  const preDrive = [];
  for (const p of players) {
    await p.body().evaluate(() => {
      window.App.unstick(); // a wedged car would measure the wall, not the setting
      const s = document.getElementById('ctl-throttle');
      s.value = 'auto'; s.dispatchEvent(new Event('change'));
    });
    preDrive.push(await p.body().evaluate(() => { const c = window.App.car(); return { x: c.x, z: c.z }; }));
  }
  await sleep(DRIVE_MS);
  for (let i = 0; i < players.length; i++) {
    const cur = await players[i].body().evaluate(() => { const c = window.App.car(); return { x: c.x, z: c.z, speed: c.speed }; });
    const d = Math.hypot(cur.x - preDrive[i].x, cur.z - preDrive[i].z);
    check(players[i].name + ' — throttle=auto (their own setting): the car cruises hands-free',
      d > 0.5, d.toFixed(1) + ' m in ' + (DRIVE_MS / 1000) + 's, now ' + cur.speed.toFixed(1) + ' m/s');
  }

  // ---- Can each of them SEE the other two? --------------------------------
  // TWO SEPARATE QUESTIONS, asked separately on purpose.
  //
  //   Did the record ARRIVE? — pure state. Three rows in the players
  //   collection or not; a box under load cannot change the answer.
  //   Is the ghost FRESH? — mp.js drops a car unheard-from for 7 s, measured by
  //   its position CHANGING. On a software rasteriser a car covers metres per
  //   minute, so this is partly a statement about the machine. Asserted, but
  //   asserted second, so a failure here reads as what it is.
  // POLLED, NOT SAMPLED ONCE. mp.js publishes at 5 Hz, so on a real device a
  // row is ~200 ms old; measured here, with three software-rasterised worlds
  // and a sign-and-broadcast round trip between them, rows arrive 2–6 s old
  // against a 7 s staleness cliff. A single sample therefore passes or fails on
  // where in that window it lands — the first version of this suite reported a
  // missing ghost for exactly that reason. What is being claimed is CONVERGENCE
  // ("everybody ends up seeing everybody"), so poll for it and let the box take
  // as long as the box takes. A latency number asserted here would be a
  // statement about this machine, not about the product.
  const snapshot = async (p) => p.body().evaluate(() => window.Host.db('players').getAll().then((rows) => ({
      rows: (rows || []).map((r) => r.name).sort(),
      // THE DISCRIMINATOR when a ghost goes missing. mp.js drops a car whose
      // position has not CHANGED for 7 s, so "the row is here but the car is
      // not drawn" has exactly two causes and this tells them apart:
      //   a stale `t`  → that player's updates are not reaching this tab at all
      //   a fresh `t`  → they are arriving and the app is not being woken
      age: (rows || []).reduce((o, r) => (o[r.name] = Date.now() - (r.t || 0), o), {}),
      count: window.MP.count(),
      ghosts: window.MP.ghosts().map((g) => ({ name: g.name, x: Math.round(g.x), z: Math.round(g.z), tint: g.tint })),
      me: (() => { const c = window.App.car(); return { x: Math.round(c.x), z: Math.round(c.z), spd: +c.speed.toFixed(1), odo: Math.round(c.odometer) }; })(),
    })));

  let view = [];
  const converged = (v) => v.length === 3 && v.every((x) => x.rows.length === 3 && x.count === 3 && x.ghosts.length === 2);
  for (let i = 0; i < 30; i++) {
    view = [];
    for (const p of players) view.push(await snapshot(p));
    if (converged(view)) break;
    await sleep(2000);
  }
  players.forEach((p, i) => console.log('  [' + p.name + '] ' + JSON.stringify(view[i])));

  check('all three players\' positions reached every tab (the shared collection has 3 rows)',
    view.every((v) => v.rows.length === 3), JSON.stringify(view.map((v) => v.rows)));
  check('every player counts THREE people in the game',
    view.every((v) => v.count === 3), JSON.stringify(view.map((v) => v.count)));
  check('every player can see the other TWO cars, not just one',
    view.every((v) => v.ghosts.length === 2), JSON.stringify(view.map((v) => v.ghosts.length)));
  // A ghost drawn at the origin is the classic "positions never crossed the
  // wire" failure — the record arrived, the geo conversion did not.
  check('the ghosts are at real positions, not stacked on the origin',
    view.every((v) => v.ghosts.length && v.ghosts.every((g) => Math.hypot(g.x, g.z) > 0.5)),
    JSON.stringify(view.map((v) => v.ghosts.map((g) => [g.x, g.z]))));
  // tintFor() derives colour from the player id with no coordination, so the
  // same car must be the same colour in every tab.
  const tintOf = (v, n) => (v.ghosts.find((g) => g.name === n) || {}).tint;
  const adaSeenByBen = tintOf(view[1], NAMES[0]), adaSeenByCyd = tintOf(view[2], NAMES[0]);
  check('the same car is the same colour in everybody\'s tab',
    !!adaSeenByBen && JSON.stringify(adaSeenByBen) === JSON.stringify(adaSeenByCyd),
    JSON.stringify([adaSeenByBen, adaSeenByCyd]));
  check('the cars actually drove somewhere', view.every((v) => v.me.odo > 0),
    JSON.stringify(view.map((v) => v.me.odo)) + ' m');
  check('…all three of them, not just the tab that happened to be in front',
    view.every((v) => v.me.odo > 0) && Math.min(...view.map((v) => v.me.odo)) > 0,
    JSON.stringify(view.map((v) => v.me.odo)) + ' m');

  // ---- THE POOL, on a real app's real URLs --------------------------------
  // Anyroad asks Overpass with a GET whose query string IS the question, so
  // three players standing in one place ask an identical URL. Without pooling
  // that is three requests to a donated server; with it, one.
  const perPlayer = players.map((p) => p.hits.overpass);
  const total = perPlayer.reduce((a, b) => a + b, 0);
  const all = players.flatMap((p) => p.hits.urls);
  const distinct = new Set(all).size;
  console.log('  [overpass] per-player ' + JSON.stringify(perPlayer) + ' = ' + total + ' request(s), ' + distinct + ' distinct URL(s)');
  check('…somebody did actually fetch (a pool that fetches nothing is a broken app)',
    total > 0, total + ' requests');
  // THE WHOLE CLAIM, in one equality. Every tile the room needed was fetched
  // from the donated server EXACTLY ONCE, no matter how many people needed it.
  // Turn the capability off (Abilities → uncheck Pool, i.e. gifos_capoff_anyroad)
  // and this becomes one request per player per tile — up to 3× this number.
  check('every tile crossed the wire ONCE for the whole room, not once per player',
    total === distinct, total + ' requests for ' + distinct + ' distinct URLs');
  // The equality above could also be produced by two players simply never
  // needing any roads. So: everyone has BUILT road geometry, and somebody built
  // it having asked the donated server for less than the world needed. A player
  // driving on roads it never downloaded is the pool, and nothing else.
  const built = [];
  for (const p of players) {
    built.push(await p.body().evaluate(() => {
      const w = window.App.world;
      return Object.keys(w.roads).filter((k) => w.roads[k] && w.roads[k].built).length;
    }));
  }
  console.log('  [roads built] ' + JSON.stringify(built));
  check('every player is driving on real road geometry, not an empty world',
    built.every((n) => n > 0), JSON.stringify(built));
  check('…and at least one of them built it from tiles it never downloaded',
    Math.min(...perPlayer) < distinct, 'fetched ' + JSON.stringify(perPlayer) + ' of ' + distinct + ' tiles');

  // ---- A race: two points, and everyone sees it --------------------------
  await ada.page.bringToFront();
  const raceSeen = [];
  await ada.body().evaluate(() => {
    const f = window.App.world.frame, c = window.App.car();
    const s = f.toGeo(c.x, c.z), e = f.toGeo(c.x + 120, c.z + 120);
    return window.MP.setRace(s, e);
  });
  for (const p of players) {
    await p.page.bringToFront();
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await p.body().evaluate(() => !!(window.MP.hasRace() && window.MP.raceState(window.App.car()))).catch(() => false);
      if (!ok) await sleep(1000);
    }
    raceSeen.push(ok);
  }
  check('a race started by one player reaches all three', raceSeen.every(Boolean), JSON.stringify(raceSeen));
  const countdowns = [];
  for (const p of players) {
    await p.page.bringToFront();
    countdowns.push(await p.body().evaluate(() => {
      const st = window.MP.raceState(window.App.car());
      if (!st) return null;
      // THE FINISH AS A POINT, IN GEO. raceState gives `finish` in WORLD
      // coordinates, and each player's world frame is anchored where THEY
      // loaded, so world x/z is not comparable between them either. Geo is.
      const g = window.App.world.frame.toGeo(st.finish.x, st.finish.z);
      return { toFinish: Math.round(st.toFinish), started: st.countdown === 0, lat: g.lat, lon: g.lon };
    }));
  }
  // ONE FINISH LINE, NOT THREE SIMILAR DISTANCES.
  //
  // This compared each car's OWN distance to the finish and demanded they
  // agree within 250 m — which is not the claim. Three people racing are in
  // three different places, so their distances differ by exactly as much as
  // they have driven apart. It only ever passed because on one shared box the
  // cars were too starved to go anywhere; the first run with a machine each
  // produced [131, 489, 540] and called a perfectly good race a failure.
  //
  // The claim is that everyone is racing to the SAME POINT, so compare the
  // point. Distances are kept in the message because they are useful
  // forensics, never as the verdict.
  const fin0 = countdowns[0];
  const metresApart = (a, b) => {
    if (!a || !b) return Infinity;
    const mLat = 111320, mLon = 111320 * Math.cos((a.lat || 0) * Math.PI / 180);
    return Math.hypot((a.lat - b.lat) * mLat, (a.lon - b.lon) * mLon);
  };
  const finApart = countdowns.map((c) => metresApart(c, fin0));
  check('every player is racing to the SAME finish line',
    countdowns.every((c) => c) && finApart.every((m) => m < 25),
    JSON.stringify({ apartFromFirst_m: finApart.map((m) => Math.round(m)),
      toFinish_m: countdowns.map((c) => c && c.toFinish) }));

  // ---- ONE PLAYER HOPS, AND THE ROOM GOES WITH THEM ----------------------
  // "Was in a 2 player game and was not able to see the other player after a
  // while — may have been after teleporting." It was. The shared world record
  // was only ever adopted by a player who had NEVER hopped (the joining
  // guest), so once everyone had hopped once, a teleport by one left the
  // others behind: the traveller's ghost is drawn from lat/lon in the OTHERS'
  // frame, which is now continents away, where no terrain is loaded — so
  // ghosts() dropped them silently while count() (no terrain test) still
  // reported a full room. Two players, nobody visible, no explanation.
  const TOKYO = { lat: 35.6812, lon: 139.7671 };
  await ada.page.bringToFront();
  // (el, arg) — a LOCATOR evaluate passes the element first. Written as (t)
  // this hopped Ada to `undefined, undefined`, which is not a no-op: it built
  // a NaN frame, published a world record with no coordinates, and took the
  // host's world with it. The follow could not fire because there was nothing
  // coherent to follow, and I read that as the product being broken.
  await ada.body().evaluate((el, t) => window.App.hop(t.lat, t.lon, 'Tokyo'), TOKYO);
  const followed = [];
  for (const p of players) {
    await p.page.bringToFront();
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await p.body().evaluate(() => {
        const f = window.App.world.frame;
        return { place: window.App.world.place, lat: f && f.lat0, lon: f && f.lon0 };
      }).catch(() => null);
      if (st && Math.abs(st.lat - 35.6812) < 0.5) break;
      await sleep(1000);
    }
    followed.push(st);
  }
  // When this fails, say WHY: the follow has five inputs and "it didn't move"
  // names none of them.
  const why = [];
  for (const p of players) {
    await p.page.bringToFront();
    why.push(await p.body().evaluate(() => window.MP.worldState()).catch((e) => String(e)));
  }
  check('a hop by ONE player carries the whole room — nobody is left in the old city',
    followed.every((s) => s && Math.abs(s.lat - TOKYO.lat) < 0.5 && Math.abs(s.lon - TOKYO.lon) < 0.5),
    JSON.stringify(followed.map((s) => s && [s.place, s.lat, s.lon])) + '  inputs=' + JSON.stringify(why));
  // …and having followed, they can SEE each other again — the whole point.
  const reunited = [];
  for (const p of players) {
    await p.page.bringToFront();
    let n = 0;
    for (let i = 0; i < 30; i++) {
      n = await p.body().evaluate(() => window.MP.ghosts().length).catch(() => 0);
      if (n >= 2) break;
      await sleep(1000);
    }
    reunited.push(n);
  }
  check('…and after the hop everyone can see everyone again',
    reunited.every((n) => n >= 2), JSON.stringify(reunited));
  // The follow must not ping-pong: each side republishes the world under its
  // own id, and the distance gate — not a flag — is what stops the exchange.
  const settled = [];
  for (const p of players) {
    await p.page.bringToFront();
    const a = await p.body().evaluate(() => window.App.world.frame.lat0);
    await sleep(3000);
    const b = await p.body().evaluate(() => window.App.world.frame.lat0);
    settled.push(a === b);
  }
  check('…and the room STOPS moving — a followed hop does not ping-pong',
    settled.every(Boolean), JSON.stringify(settled));

  // ---- close, and collect the recordings ---------------------------------
  // Playwright names a recording by page GUID and only finalises it on context
  // close, so the handle is grabbed first and the file renamed after.
  const vids = RECORD ? players.map((p) => ({ name: p.name, v: p.page.video() })) : [];
  for (const p of players) await p.ctx.close();
  if (localBrowser) await localBrowser.close(); else await closeFleet(boxes);

  if (RECORD) {
    for (const { name, v } of vids) {
      if (!v) continue;
      try {
        const src = await v.path();
        const dst = path.join(OUT, name.toLowerCase() + '.webm');
        renameSync(src, dst);
        console.log('  [video] ' + name + ' → ' + dst);
      } catch (e) { console.log('  [video] ' + name + ': ' + e.message); }
    }
    // Anything left is a page we did not name (Ada's desktop tab); keep it, but
    // do not pretend it is gameplay.
    for (const name of NAMES) {
      const dir = path.join(OUT, name);
      if (existsSync(dir) && readdirSync(dir).length) console.log('  [video] (extra tab) ' + dir + ': ' + readdirSync(dir).join(', '));
    }
  }

  console.log('=== ROOM=' + MODE + ' finished in ' + Math.round((Date.now() - t0) / 1000) + 's\n');
}

(async () => {
  for (const m of MODES) await run(m);
  console.log(failures ? failures + ' FAILED' : 'all good');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
