/*
 * FPS Simple — the whole port, from the real GIF.
 *
 * Two halves, and they need two different amounts of hardware, so they ask for
 * it separately.
 *
 *   SOLO      one box, and one box is enough. The built GIF installs, boots
 *             inside the sandbox, and LOCKS THE POINTER — the end-to-end proof
 *             of capabilities.pointer, through a real manifest in a real app
 *             rather than the synthetic one in e2e-pointer-lock.js. Plus: it
 *             reaches the network zero times, which is the claim the manifest
 *             makes by declaring no hosts. Every one of those is a question
 *             about STATE. A slow box gives the same answer as a fast one.
 *
 *   DEATHMATCH  NEEDS A MACHINE PER PLAYER, and refuses to run without one.
 *             Two peers in one room over the relay: they must see each other in
 *             the roster, SPAWN A BODY for each other (remote.js — a body is
 *             what makes another player shootable), and a hit claimed by one
 *             must land on the other, take its health down, KILL it, and be
 *             scored to the right player. Upstream Claude of Duty has no
 *             networking of any kind, so all of that is code written for this
 *             app with nothing else watching it.
 *
 * WHY THE DEATHMATCH HALF DECLARES NEEDS-FLEET. This app IS its animation loop:
 * presence is published from the engine's own update, a remote body is driven
 * from the wire per rendered frame, and a death is a state machine that has to
 * tick. Two Chromiums building a 3D world through a software rasteriser on one
 * kernel render at around a frame a second, and every timing this file depends
 * on becomes a timing about that box. The one-box version of this suite had
 * already grown the tell: it pinned GIFOS_FPS_QUALITY='low' so the world would
 * finish building, gave itself a SEVEN MINUTE boot deadline, and brought each
 * tab to the front before every single assertion because the backgrounded one
 * stopped talking. Those are not test settings, they are apologies for the
 * machine — exactly the shape test/lib/fleet.js was written to stop us from
 * shipping as a verdict. On real boxes none of them are needed and none of them
 * are here.
 *
 * WHY A HIT IS CLAIMED DIRECTLY. The suite calls Net.claimHit() rather than
 * aiming and firing. Aiming a bullet at a moving body is a test of the
 * ballistics — which is upstream's, exercised by its own selftests, and not what
 * can regress here. What can regress is the wire: that a claim rides out on the
 * shooter's row, is deduped, is addressed to the right life, is paid by the
 * target, and that the KILL it causes is credited to the player who fired it.
 * So that is what is asserted. (Whether a human can lead a shot at 6 Hz is a
 * question for a human; it is in apps/fps-simple/README.md under its limits.)
 *
 * Needs: the stack on the orchestrator, reachable by the fleet's browsers —
 * a static server on 8099 bound to 0.0.0.0 and test/servers/relay-local.js.
 */
const { chromium, CHROME } = require('../lib/pw');
const needFleet = require('../lib/fleet');
const { openFleet, closeFleet } = require('../lib/fleet-browsers');
const { appGif } = require('../lib/apps');
const need = require('../lib/need');
const { readFileSync } = require('fs');

// The deathmatch browsers are on OTHER MACHINES, so the stack address cannot be
// loopback: they dial the orchestrator at the base/relay in the hosts file.
const FLEETCFG = needFleet.load() || {};
const BASE = process.env.BASE || FLEETCFG.base || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || FLEETCFG.relay || 'ws://127.0.0.1:8790';
const GIF_B64 = readFileSync(appGif('fps-simple')).toString('base64');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// QUALITY IS ASKED FOR DIFFERENTLY BY THE TWO HALVES, and that difference is
// the whole point of splitting them.
//
// SOLO runs wherever the battery runs — the gate box, four cores and no GPU —
// and pins 'low', because it is asking whether the app BOOTS and locks the
// pointer and those answers do not depend on how pretty the street is. It is
// the same code path; 'medium' on a software rasteriser spends minutes building
// scenery nothing then looks at.
//
// DEATHMATCH pins 'low' as well, and it is worth being exact about why that is
// not a cop-out. The fleet is asked for ISOLATION — a CPU per player, so that
// "did the presence arrive" is not really "was the kernel scheduling two 3D
// browsers". It is not asked for FIDELITY: nothing in this half looks at the
// street, and a peer may be a Raspberry Pi rendering through swiftshader, which
// at 'medium' never finishes building a world at all. What the frame rate
// actually is on real hardware is a different question with a different tool,
// and answering it by making this suite slow enough to time out answers neither.
// Override to measure something else.
const setup = (name, quality) => "try{localStorage.setItem('gifos_relay','" + RELAY + "');" +
  "localStorage.setItem('gifos_name','" + name + "')}catch(e){};" +
  ((process.env.GIFOS_FPS_QUALITY || quality)
    ? "window.GIFOS_FPS_QUALITY='" + (process.env.GIFOS_FPS_QUALITY || quality) + "';" : '');

const ARGS = [
  // A box with no GPU still needs a rasteriser, or there is no WebGL2 context
  // at all and the app would (correctly) refuse to start. A box WITH one
  // ignores these and uses it.
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  // WITHOUT THESE THERE IS NO MULTIPLAYER TO TEST. Chromium throttles a
  // backgrounded tab's requestAnimationFrame to about one frame a second, and
  // this app publishes its presence from the engine's own update — so a peer
  // that is not in front goes quiet, and the other correctly stops drawing it.
  // e2e-anyroad-mp carries the same three flags for the same reason.
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

async function install(page) {
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 30000 });
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'FPS Simple.gif', bytes, kind: 'gif', isApp: true, appId: 'fps-simple', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'FPS Simple.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, GIF_B64);
}

// Close the Abilities sheet if one is up. Clicked in the PAGE rather than
// through Playwright's actionability gate: that gate wants the element stable
// across two animation frames, and there is a WebGL scene in the frame next
// door, so a short timeout on it fails while the sheet sits there perfectly
// clickable. Two runs died on exactly that.
async function dismissSheet(runPage) {
  return runPage.evaluate(() => {
    const box = document.querySelector('.perm-modal');
    if (!box) return false;
    const b = box.querySelector('.done') || box.querySelector('#perm-plain');
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
}

// Close the share card if one is up. It appears the moment a room is minted and
// sits over the app; it is dismissed on every pass rather than once, because the
// app remounts underneath it and the card outlives the mount it was opened from.
async function dismissInvite(runPage) {
  return runPage.evaluate(() => {
    const d = document.getElementById('inv-done');
    if (d) { d.click(); return true; }
    const m = document.getElementById('inv-modal');
    if (m && getComputedStyle(m).display !== 'none') { m.style.display = 'none'; return true; }
    return false;
  }).catch(() => false);
}

// Settle the Abilities sheet (the app declares `pointer`, so it always appears
// on a first run) and wait for the world to finish building.
async function ready(runPage, label, budgetMs, replacing) {
  runPage.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 200)));
  // Look for the frame that IS our app, rather than for an <iframe> element or
  // "the frame that is not the page". Inviting reboots the app through the app
  // mesh, and during that remount there are moments with an iframe element in
  // the DOM whose document has not committed yet — a frame list that is empty,
  // then briefly holds a frame that is not ours. Both were flaky to look at.
  // The gate is unmistakable and only our app has one.
  //
  // The sheet is clicked on every pass, not once up front: a capability
  // acknowledgement can arrive after the remount as easily as before it.
  //
  // The fleet half allows two minutes: a real machine building a world at the
  // quality it actually chose, and if it cannot manage that, that is a finding
  // rather than something to wait out. The solo half, pinned to 'low' on a
  // software rasteriser, is given the room it genuinely needs.
  const deadline = Date.now() + (budgetMs || 120000);
  let frame = null;
  while (Date.now() < deadline) {
    for (const f of runPage.frames()) {
      if (f === runPage.mainFrame()) continue;
      // THE MOUNT WE ARE REPLACING IS STILL THERE, AND STILL LOOKS RIGHT.
      // Inviting remounts the app, but the old frame does not vanish the
      // instant the click lands — and because Alice now invites BEFORE playing,
      // that old frame still has a gate with an enabled Play button on it. So
      // the first thing this loop found was the frame about to be thrown away,
      // and the click on it died with "Frame was detached" a moment later. Skip
      // it by identity; the runtime builds a genuinely new iframe.
      if (replacing && f === replacing) continue;
      const isOurs = await f.evaluate(() => !!document.getElementById('gate-go')).catch(() => false);
      if (isOurs) { frame = f; break; }
    }
    if (frame) break;
    await dismissSheet(runPage);
    await dismissInvite(runPage);
    await sleep(1000);
  }
  if (!frame) {
    // Say what was actually there. A bare timeout here sent two runs chasing
    // the wrong thing.
    const seen = await runPage.evaluate(() => ({
      iframes: document.querySelectorAll('iframe').length,
      mount: (document.getElementById('appmount') || {}).innerHTML ? 'has content' : 'empty',
      sheet: !!document.querySelector('.perm-modal'),
      text: document.body.innerText.slice(0, 160).replace(/\s+/g, ' '),
    })).catch((e) => ({ err: String(e).slice(0, 120) }));
    throw new Error(label + ': the app never mounted a frame with a gate in it — ' + JSON.stringify(seen));
  }
  await frame.waitForFunction(
    () => { const b = document.getElementById('gate-go'); return b && !b.disabled; },
    null, { timeout: Math.max(5000, deadline - Date.now()) }
  );
  return frame;
}

// Clear whatever GifOS has put over the app, then press Play.
//
// Two things can be in the way after inviting, because inviting REMOUNTS the
// app: the copy-link modal, and the Abilities sheet — a remount is a fresh
// mount, and it asks again. A host closes both before playing, and Play must be
// a REAL click, because pointer lock will not be granted without a gesture.
async function play(runPage, frame) {
  for (let i = 0; i < 20; i++) {
    await runPage.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
    await dismissSheet(runPage);
    const clear = await runPage.evaluate(() => {
      const p = document.querySelector('.perm-modal'), m = document.getElementById('inv-modal');
      return !p && (!m || getComputedStyle(m).display === 'none');
    });
    if (clear) break;
    await sleep(500);
  }
  // A detached frame here means the mount was replaced under us after ready()
  // picked it. Say so plainly rather than failing as a click problem.
  try {
    await frame.click('#gate-go', { timeout: 60000 });
  } catch (e) {
    if (/detach/i.test(String(e && e.message))) {
      throw new Error('the app was remounted between finding its gate and pressing Play'
        + ' — ready() returned a frame that was on its way out');
    }
    throw e;
  }
  await sleep(1500);
}

// WAITFORFUNCTION DOES NOT WORK IN THE APP FRAME ONCE THE GAME IS RUNNING, so
// everything after Play polls with evaluate() from out here instead. A harness
// fact, written down because it cost a cycle: the moment engine.start() takes
// over requestAnimationFrame, frame.waitForFunction() times out no matter what
// it is asked — a predicate of `() => true` on 200 ms timer polling times out
// too — while frame.evaluate() of the SAME expression answers correctly at the
// same instant. Playwright's injected poller cannot run in there; the frame is
// healthy. e2e-fps-touch.js was silently dead this way: nine assertions became
// one bare TimeoutError that read as a broken app.
const POLL = 250;
async function waitFor(frame, fn, ms, arg) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await frame.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL);
  }
}

/* ======================================================================= */
/* SOLO — one box                                                          */
/* ======================================================================= */
async function solo() {
  console.log('=== SOLO  (one box is enough: every assertion is about state)');
  const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: setup('Alice', 'low') });

    // Every request this context makes, so "it never touches the network" is
    // COUNTED rather than taken on the manifest's word. Observed passively
    // rather than through route(): interception changes how the app mounts, and
    // a guard must not alter what it watches.
    const external = [];
    ctx.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(BASE) && !/^(data|blob|about|ws):/.test(u)) external.push(u);
    });

    const desk = await ctx.newPage();
    desk.on('pageerror', (e) => console.log('  [Alice err] ' + e.message.slice(0, 200)));
    await install(desk);
    const [run] = await Promise.all([
      ctx.waitForEvent('page'),
      desk.locator('.icon', { hasText: 'FPS Simple.gif' }).dblclick(),
    ]);
    const frame = await ready(run, 'Alice', 420000);
    check('the built GIF installs and boots inside the sandbox', true);
    check('solo: the room is empty, so it is the garrison you are playing',
      /solo against the garrison/i.test(await frame.evaluate(() => document.getElementById('gate-room').textContent)));

    await play(run, frame);
    check('capabilities.pointer, end to end: the app locks the pointer',
      await frame.evaluate(() => !!document.pointerLockElement));
    check('the engine is running (the player has a pose to publish)',
      await frame.evaluate(() => !!(window.__FPS_POSE__ && window.__FPS_POSE__())));

    // Tab is OURS. Upstream binds it to swapWeapon alongside Digit1/Digit2, and
    // the gate card tells the player to hold it for scores — so before this was
    // fixed, checking the scoreboard swapped your rifle for your sidearm and
    // letting go swapped it back. The scoreboard is the multiplayer surface,
    // but the collision is in the engine's binding table and is asserted here,
    // in the half that always runs.
    const tab = await frame.evaluate(() => {
      const F = window.__FPS__, input = F.engine.input;
      input._pendingDown.add('Tab');            // the same channel a real key uses
      const before = F.ctx.peek('weapon');
      const swapBefore = input.actionPressed('swapWeapon') || input.action('swapWeapon');
      input.down.add('Tab');
      const swapHeld = input.action('swapWeapon');
      input.down.delete('Tab'); input._pendingDown.delete('Tab');
      input.down.add('Digit2');
      const digitStillSwaps = input.action('swapWeapon');
      input.down.delete('Digit2');
      return { swapBefore: !!swapBefore, swapHeld: !!swapHeld, digitStillSwaps: !!digitStillSwaps, had: !!before };
    });
    check('holding Tab for the scoreboard does NOT swap the weapon', !tab.swapHeld,
      'held Tab -> swapWeapon=' + tab.swapHeld);
    check('...and 1/2 still swap it, which is what the gate card says', tab.digitStillSwaps);

    check('it reached the network ZERO times — the manifest declares no hosts',
      external.length === 0, external.slice(0, 3).join(' '));
  } finally {
    await browser.close();
  }
}

/* ======================================================================= */
/* DEATHMATCH — a machine per player                                       */
/* ======================================================================= */
async function deathmatch() {
  // A dead relay looks EXACTLY like a broken app here: the room forms locally,
  // the invite link mints, and the guest then sits waiting on a room that will
  // never answer. Check the stack where the fleet's browsers reach it, not on
  // loopback, or a healthy remote stack is refused as missing.
  await need({ 8099: 'a static server on 8099 bound to 0.0.0.0 (python3 -m http.server 8099 -d site --bind 0.0.0.0)',
               8790: 'relay-local (node test/servers/relay-local.js)' },
    new URL(BASE).hostname);

  const fleet = await needFleet(2, {
    why: 'each player needs their own CPU — presence is published from the engine\'s own update, '
       + 'a remote body is driven per RENDERED FRAME, and two 3D browsers on one box render at ~1 fps, '
       + 'so every timing this half depends on becomes a timing about that box',
    roles: ['alice', 'bob'],
  });
  const boxes = await openFleet(fleet.hosts.slice(0, 2), { args: ARGS, origin: BASE });

  try {
    console.log('=== DEATHMATCH  (Alice on ' + (boxes[0].host.name || boxes[0].host.ssh)
      + ', Bob on ' + (boxes[1].host.name || boxes[1].host.ssh) + ')');

    /* ---- Alice, on her own machine, mints the room ---- */
    const aCtx = await boxes[0].browser.newContext({ viewport: { width: 1100, height: 720 } });
    await aCtx.addInitScript({ content: setup('Alice', 'low') });
    const aDesk = await aCtx.newPage();
    aDesk.on('pageerror', (e) => console.log('  [Alice err] ' + e.message.slice(0, 200)));
    await install(aDesk);
    const [aRun0] = await Promise.all([
      aCtx.waitForEvent('page'),
      aDesk.locator('.icon', { hasText: 'FPS Simple.gif' }).dblclick(),
    ]);
    let aFrame = await ready(aRun0, 'Alice', 240000);

    // ALICE INVITES BEFORE SHE PLAYS, and that is the realistic order as well as
    // the fast one. Pressing Play first locks the pointer, and a suite can then
    // click Invite through the lock in a way a person never can: with the cursor
    // captured by the canvas there is nothing to click Invite WITH, so a real
    // player presses Esc — which releases the lock and opens the pause menu —
    // and only then reaches the app bar. Inviting through a live pointer lock
    // put the page in a state the remount did not survive: the app frame went
    // away and never came back, and the failure read as "the app never mounted",
    // which sent this straight at the app. It also saves a whole world build,
    // since inviting throws the first mount away regardless.
    await aRun0.evaluate(() => document.getElementById('appinvite').click());
    await aRun0.waitForSelector('input[name="rmcls"]', { timeout: 15000 });
    await aRun0.evaluate(() => {
      document.querySelector('input[name="rmcls"][value="heal"]').checked = true;
      document.getElementById('inv-go').click();
    });
    await waitFor(aRun0, () => !!(document.getElementById('share-url') || {}).value, 60000);
    const shareUrl = await aRun0.evaluate(() => (document.getElementById('share-url') || {}).value || '');
    check('inviting mints a room link', /#/.test(shareUrl), shareUrl.slice(0, 60));

    // ALICE DOES NOT GO TO THE LINK. She IS the link: an app room is hosted by
    // the browser that minted it, and the app's bytes are served to every guest
    // from there. Inviting REMOUNTS her app in place as the room's host — the
    // frame is back within a few seconds — so there is nothing to navigate to
    // and the share card just needs closing, which ready() now does on every
    // pass alongside the Abilities sheet.
    //
    // Navigating her there was tried twice and both ways lie. run.html#id=<file>
    // to run.html#j=<room> differs only in the FRAGMENT, so goto() is a
    // same-document navigation that reloads nothing; forcing it with reload()
    // is worse, because it tears down the host while she is it and she arrives
    // at a room with nobody left to serve the app.
    const aRun = aRun0;
    aFrame = await ready(aRun, 'Alice', 240000, aFrame);
    await play(aRun, aFrame);

    /* ---- Bob, on a DIFFERENT machine, opens the link ---- */
    const bCtx = await boxes[1].browser.newContext({ viewport: { width: 1100, height: 720 } });
    await bCtx.addInitScript({ content: setup('Bob', 'low') });
    const bRun = await bCtx.newPage();
    await bRun.goto(shareUrl);
    const bFrame = await ready(bRun, 'Bob', 240000);
    await play(bRun, bFrame);

    // No bringToFront anywhere below. Each browser is alone on its box with
    // nothing to be backgrounded BY — that is what the fleet bought.
    //
    // BOTH CLOCKS START TOGETHER. Waiting on Alice and then on Bob spends
    // Alice's whole budget before Bob's begins, so the second peer is judged on
    // a stopwatch that has been running since before it was asked anything.
    // Measured: Alice reported false at 60 s and was demonstrably seeing Bob a
    // moment later — she goes on to spawn his body, shoot him and score the
    // kill. The first join into a freshly minted room over a real relay is the
    // slowest thing here, so it is given room and both are timed from the same
    // instant.
    const [aSees, bSees] = await Promise.all([
      waitFor(aFrame, () => window.Net && window.Net.count() >= 2, 180000),
      waitFor(bFrame, () => window.Net && window.Net.count() >= 2, 180000),
    ]);
    const roomState = async () => (await Promise.all([aFrame, bFrame].map((f) => f.evaluate(() => ({
      count: window.Net ? window.Net.count() : 'no Net',
      others: window.Net ? Object.keys(window.Net.others()) : [],
      me: window.Net && window.Net.me() ? window.Net.me().id : null,
    })).catch((e) => ({ err: String(e).slice(0, 60) }))))).map((r, i) => (i ? 'bob' : 'alice') + '=' + JSON.stringify(r)).join(' ');
    check('both peers see two players in the room', aSees && bSees,
      aSees && bSees ? 'alice=true bob=true' : await roomState());

    // A BODY, not just a row: remote.js has to put something shootable in the
    // world, or the other player is a name on a scoreboard and nothing else.
    const [aBody, bBody] = await Promise.all([
      waitFor(aFrame, () => window.Remote && window.Remote.count() >= 1, 60000),
      waitFor(bFrame, () => window.Remote && window.Remote.count() >= 1, 60000),
    ]);
    check('each peer spawns a BODY for the other, in the world', aBody && bBody,
      'alice=' + aBody + ' bob=' + bBody);

    // THE SAME STREET. One shared seed, nothing sent — so if the world were
    // being built differently on two machines, two players would be taking
    // cover behind buildings the other cannot see.
    //
    // COMPARED ON THE BUILDINGS, and asserted to be non-empty first. The first
    // version of this read `spawnPoints[i].x`, and a spawn point is
    // `{position, yaw, tag}` — so every coordinate came out `NaN`, both sides
    // produced the identical string of NaNs, and it PASSED while comparing
    // nothing at all. Spawn points were the wrong thing to read anyway: they
    // are a fixed table run through the level transform, so they would match
    // even if the two clients had seeded different worlds. The buildings are
    // what the RNG actually places, which is what "same cover" means.
    const worldOf = (f) => f.evaluate(() => {
      const w = window.__FPS__.ctx.peek('world');
      const out = [];
      const walk = (v, d) => {
        if (out.length > 600 || d > 4) return;
        if (typeof v === 'number') { if (Number.isFinite(v)) out.push(Math.round(v * 100)); return; }
        if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) walk(v[i], d + 1); return; }
        if (v && typeof v === 'object') { const k = Object.keys(v).sort(); for (let i = 0; i < k.length; i++) walk(v[k[i]], d + 1); }
      };
      walk((w && w.buildings) || [], 0);
      return out.join(',');
    });
    const aWorld = await worldOf(aFrame), bWorld = await worldOf(bFrame);
    check('the street is real geometry to compare, not an empty read',
      aWorld.length > 50, aWorld.length + ' numbers');
    check('two different machines built the SAME street from the shared seed',
      !!aWorld && aWorld === bWorld, aWorld.slice(0, 60) + '…');

    /* ---- a hit crosses the wire and is paid ---- */
    const bobHealthBefore = await bFrame.evaluate(() => {
      const p = window.__FPS__ && window.__FPS__.player;
      return p && p.health ? p.health.value : null;
    });
    check('Bob has a readable health value to lose', typeof bobHealthBefore === 'number', String(bobHealthBefore));

    const claimed = await aFrame.evaluate(() => {
      const others = window.Net.others();
      const id = Object.keys(others)[0];
      if (!id) return null;
      window.Net.claimHit(id, 35, false, others[id].spawn);
      return id;
    });
    check('Alice can address a claim to Bob', !!claimed);

    const paid = await waitFor(bFrame, (before) => {
      const p = window.__FPS__ && window.__FPS__.player;
      return !!(p && p.health && p.health.value < before);
    }, 30000, bobHealthBefore);
    const bobHealthAfter = await bFrame.evaluate(() => {
      const p = window.__FPS__ && window.__FPS__.player;
      return p && p.health ? p.health.value : null;
    });
    check('the hit crosses the wire and the target pays for it',
      paid, bobHealthBefore + ' -> ' + bobHealthAfter);

    // Dedupe: a row is re-delivered on every unrelated change, so the SAME claim
    // must never be paid twice. Alice publishes repeatedly without claiming
    // again.
    //
    // Asserted on the CLAIM COUNTER, not on health: health regenerates, so a
    // duplicate hit is masked within a few seconds, and a health-based check
    // here would pass whether the dedupe worked or not. That is the shape of a
    // guard that guards nothing — this suite already shipped one by accident.
    const claimsBefore = await bFrame.evaluate(() => window.Net.appliedTotal());
    await aFrame.evaluate(() => { for (let i = 0; i < 6; i++) window.Net.publish(true); });
    await sleep(4000);
    const claimsAfter = await bFrame.evaluate(() => window.Net.appliedTotal());
    check('Bob accepted the claim exactly once', claimsBefore === 1, 'accepted ' + claimsBefore);
    check('six redeliveries of the same row land it no further times',
      claimsAfter === claimsBefore, claimsBefore + ' -> ' + claimsAfter);

    /* ---- YOU CAN ACTUALLY KILL SOMEONE ---- */
    // Everything above stops at a health bar going down. This is the thing the
    // game is for, and the whole chain is here: enough damage kills Bob, Bob
    // concedes the death on his OWN row (nobody writes to anybody else's), the
    // kill is credited BY ID to Alice — not by matching the killer's NAME, which
    // credited the wrong player in any room where two people had the same one,
    // and the default name for someone who never set one is "Player" — and Bob
    // comes back somewhere else with a new life that the old claims cannot
    // follow him into.
    const feetOf = (f) => f.evaluate(() => {
      const p = window.__FPS__.player;
      return p && p.feetPosition ? [p.feetPosition.x, p.feetPosition.z] : null;
    });
    const bobSpawnBefore = await feetOf(bFrame);

    await aFrame.evaluate(() => {
      const others = window.Net.others();
      const id = Object.keys(others)[0];
      // Enough to be fatal from full health regardless of what the 35 above
      // has already regenerated. One claim, one sequence number.
      window.Net.claimHit(id, 400, true, others[id].spawn);
    });

    const bobDied = await waitFor(bFrame, () => {
      const rows = window.Net.roster().filter((r) => r.me);
      return rows.length === 1 && rows[0].d >= 1;
    }, 30000);
    const bobDeaths = await bFrame.evaluate(() => (window.Net.roster().find((r) => r.me) || {}).d);
    check('enough damage KILLS the target', bobDied, 'bob deaths=' + bobDeaths);

    const aliceScored = await waitFor(aFrame, () => {
      const mine = window.Net.roster().find((r) => r.me);
      return !!mine && mine.k >= 1;
    }, 30000);
    const roster = await aFrame.evaluate(() => window.Net.roster().map((r) => r.name + ' k=' + r.k + ' d=' + r.d + (r.me ? ' (me)' : '')).join(' | '));
    check('the kill is scored to the player who fired it, on the scoreboard', aliceScored, roster);

    check('and it is scored to exactly ONE player',
      await aFrame.evaluate(() => window.Net.roster().reduce((n, r) => n + (r.k > 0 ? 1 : 0), 0)) === 1, roster);

    // ASKED OF THE APP, NOT INFERRED FROM A NUMBER. "Alive" is a thing this app
    // decides and publishes (doRespawn clears `dead` and pushes it); health is a
    // value that is restored around the same moment and regenerates besides, so
    // reading health raced the respawn and reported a corpse that had already
    // stood up somewhere else.
    const respawned = await waitFor(bFrame, () => {
      const mine = window.Net.roster().find((r) => r.me);
      return !!(mine && mine.alive);
    }, 60000);
    const respawnHp = await bFrame.evaluate(() => {
      const p = window.__FPS__ && window.__FPS__.player;
      return p && p.health ? p.health.value : null;
    }).catch(() => null);
    const bobSpawnAfter = await feetOf(bFrame);
    check('the target respawns, alive again', respawned, 'health ' + respawnHp);
    check('...somewhere else, not on the spot it died',
      !!bobSpawnBefore && !!bobSpawnAfter &&
      (Math.abs(bobSpawnBefore[0] - bobSpawnAfter[0]) + Math.abs(bobSpawnBefore[1] - bobSpawnAfter[1])) > 1,
      JSON.stringify(bobSpawnBefore) + ' -> ' + JSON.stringify(bobSpawnAfter));

    // A claim fired at the life Bob was wearing before he respawned must not
    // follow him into the new one — the spawn counter on the claim is what
    // stops it, and without it a burst fired as someone died would kill them
    // again the instant they came back.
    const afterRespawnHealth = await bFrame.evaluate(() => window.__FPS__.player.health.value);
    await aFrame.evaluate((stale) => {
      const others = window.Net.others();
      const id = Object.keys(others)[0];
      window.Net.claimHit(id, 400, false, stale);
    }, await aFrame.evaluate(() => { const o = window.Net.others(); const id = Object.keys(o)[0]; return o[id].spawn - 1; }));
    await sleep(4000);
    const stillAlive = await bFrame.evaluate(() => window.__FPS__.player.health.value);
    check('a claim against the PREVIOUS life does not follow the target into the new one',
      stillAlive > 0 && stillAlive >= afterRespawnHealth - 1,
      afterRespawnHealth + ' -> ' + stillAlive);

    /* ---- the garrison rule, in the join order that actually happens ---- */
    // Alone you fight AI soldiers; in a room they stand down, because they are
    // generated per client from a local RNG and stand in different places for
    // each player — one person shooting at something nobody else can see.
    //
    // ASSERTED ON THE HOST, WHICH IS THE HARD CASE AND THE COMMON ONE. Alice
    // above did exactly what a person does: played solo, then invited a friend.
    // She therefore booted ALONE and got a garrison, while Bob booted into a
    // room and got none. Deciding this once at boot is right for Bob and wrong
    // for Alice, and it is Alice who is doing the inviting — so the soldiers
    // have to leave when the room fills, not merely fail to arrive.
    const garrison = await Promise.all([aFrame, bFrame].map((f) => f.evaluate(() => ({
      soldiers: window.Remote.garrison(), bodies: window.Remote.count(),
    }))));
    check('in a room the garrison stands down — for the HOST too, who booted alone',
      garrison.every((g) => g.soldiers === 0),
      garrison.map((g, i) => (i ? 'bob' : 'alice') + ': ' + g.soldiers + ' soldiers, '
        + g.bodies + ' player bodies').join('  '));

    await aCtx.close();
    await bCtx.close();
  } finally {
    await closeFleet(boxes);
  }
}

(async () => {
  await solo();
  // A PRODUCT FAILURE OUTRANKS "I NEED MACHINES". If the solo half is red the
  // app is broken here, on this box, and saying NEEDS-FLEET instead would hide
  // it behind a hardware request.
  if (failures) {
    console.log('\nFAILURES: ' + failures + '  (solo half — not running the deathmatch half on top of a broken boot)');
    process.exit(1);
  }
  await deathmatch();
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
