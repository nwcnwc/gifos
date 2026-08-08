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
const { appGif } = require('../lib/apps');
const { HOP, routeWorld } = require('../lib/anyroad-fixtures');
const need = require('../lib/need');   // a missing fixture must never look like a product bug
const { readFileSync, mkdirSync, existsSync, rmSync, readdirSync, renameSync } = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
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
  await need({ 8099: 'a static server on 8099 (python3 -m http.server 8099 -d site)', 8790: 'relay-local' });
  const t0 = Date.now();
  console.log('=== ROOM=' + MODE + (MODE === 'app' ? '  (app-pinned — no call layer)' : '  (meeting with an app on the stage)'));
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');
  if (RECORD) { if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true }); }

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
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
    ],
  });

  const players = [];
  for (const name of NAMES) {
    const ctx = await browser.newContext(Object.assign(
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
    players.push({ name, ctx, hits });
  }
  const [ada, ben, cyd] = players;

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
  const SCHEMES = { Ada: 'wheel', Ben: 'stick', Cyd: 'tilt' };
  for (const p of players) {
    await p.page.bringToFront();
    await p.body().evaluate((s) => window.Sources.set({ scheme: s }), SCHEMES[p.name]);
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
  const steerFor = (p, dir, ms) => p.body().evaluate(async ([dir, ms]) => {
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const scheme = window.Sources.current.scheme;
    const view = document.getElementById('view');
    const pad = document.getElementById('steerpad') || view;
    const pe = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, bubbles: true, cancelable: true, clientX: x, clientY: y,
      isPrimary: true, pointerType: 'touch', button: 0, buttons: 1,
    }));
    const box = (el) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
    let stop = () => {};
    if (scheme === 'tilt') {
      // gamma is the device's left/right tilt; car.js captures the FIRST value
      // it sees as neutral, so send an upright frame before tilting or the
      // whole test is measured against an already-turned wheel.
      const send = (g) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',
        { gamma: g, beta: 0, alpha: 0, absolute: true }));
      send(0);
      const t = setInterval(() => send(dir * 34), 50);
      stop = () => { clearInterval(t); send(0); };
    } else if (scheme === 'stick') {
      const [cx, cy] = box(view);
      pe(view, 'pointerdown', cx, cy);
      pe(view, 'pointermove', cx + dir * 110, cy);   // sideways only: speed held
      stop = () => pe(view, 'pointerup', cx + dir * 110, cy);
    } else {
      const [cx, cy] = box(pad);
      pe(pad, 'pointerdown', cx, cy);
      pe(pad, 'pointermove', cx + dir * 90, cy);
      stop = () => pe(pad, 'pointerup', cx + dir * 90, cy);
    }
    const yaw0 = window.App.car().yaw;
    let peakSteer = 0;
    const t1 = Date.now();
    while (Date.now() - t1 < ms) {
      await new Promise((r) => setTimeout(r, 60));
      const d = window.App.debug();
      if (d.input && Math.abs(d.input.steer) > Math.abs(peakSteer)) peakSteer = d.input.steer;
    }
    const out = { scheme, steer: peakSteer, dYaw: wrap(window.App.car().yaw - yaw0), speed: window.App.debug().speed };
    stop();
    return out;
  }, [dir, ms]);

  const steering = [];
  for (const p of players) {
    await p.page.bringToFront();
    const left = await steerFor(p, -1, 3000);
    await sleep(400);
    const right = await steerFor(p, +1, 3000);
    await sleep(400);
    steering.push({ name: p.name, left, right });
  }
  for (const s of steering) {
    const d = `${s.left.scheme}: steer ${s.left.steer.toFixed(2)}/${s.right.steer.toFixed(2)}, ` +
              `yaw ${s.left.dYaw.toFixed(2)}/${s.right.dYaw.toFixed(2)} rad, ` +
              `speed ${s.right.speed.toFixed(1)} m/s`;
    check(s.name + ' — the ' + s.left.scheme + ' reaches the car at all',
      Math.abs(s.left.steer) > 0.15 && Math.abs(s.right.steer) > 0.15, d);
    check(s.name + ' — the ' + s.left.scheme + ' steers BOTH ways, not just one',
      Math.sign(s.left.steer) === -Math.sign(s.right.steer) && s.left.steer !== 0, d);
    check(s.name + ' — and the car actually turns, in opposite directions',
      Math.sign(s.left.dYaw) === -Math.sign(s.right.dYaw)
      && Math.abs(s.left.dYaw) > 0.05 && Math.abs(s.right.dYaw) > 0.05, d);
    // "Feels right" is not a frame timing on this box — but a car that is
    // stationary, reversing or supersonic while being steered is not a
    // judgement call, and any of them means the drive under test was not a
    // drive at all.
    check(s.name + ' — was genuinely driving forward while steering',
      s.right.speed > 2 && s.right.speed < 70, s.right.speed.toFixed(1) + ' m/s');
  }

  // ---- Let them drive. No input at all: the car cruises by itself ---------
  // All three run at once (see the throttling flags above), which is the only
  // arrangement in which "driving together" means anything.
  const DRIVE_MS = Number(process.env.DRIVE_MS || 40000);
  await sleep(DRIVE_MS);

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
      return st ? { toFinish: Math.round(st.toFinish), started: st.countdown === 0 } : null;
    }));
  }
  check('every player is racing to the SAME finish line',
    countdowns.every((c) => c && Math.abs(c.toFinish - countdowns[0].toFinish) < 250),
    JSON.stringify(countdowns.map((c) => c && c.toFinish)));

  // ---- close, and collect the recordings ---------------------------------
  // Playwright names a recording by page GUID and only finalises it on context
  // close, so the handle is grabbed first and the file renamed after.
  const vids = RECORD ? players.map((p) => ({ name: p.name, v: p.page.video() })) : [];
  for (const p of players) await p.ctx.close();
  await browser.close();

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
