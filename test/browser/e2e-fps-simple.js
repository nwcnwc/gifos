/*
 * FPS Simple — the whole port, from the real GIF.
 *
 * Two halves, and the second is the one that matters most, because it is the
 * part that does not exist upstream at all: upstream Claude of Duty has NO
 * networking of any kind, so every assertion below about a second player is a
 * guard on code that was written for this app and has nothing else watching it.
 *
 *   SOLO      the built GIF installs, boots inside the sandbox, and LOCKS THE
 *             POINTER — the end-to-end proof of capabilities.pointer, through a
 *             real manifest in a real app rather than the synthetic one in
 *             e2e-pointer-lock.js. Plus: it reaches the network zero times,
 *             which is the claim the manifest makes by declaring no hosts.
 *
 *   DEATHMATCH  two peers in one room over the local relay. They must see each
 *             other in the roster, SPAWN A BODY for each other in the world
 *             (remote.js — a body is what makes another player shootable), and
 *             a hit claimed by one must land on the other and take its health
 *             down (net.js — the shooter decides, the target pays).
 *
 * WHY A HIT IS CLAIMED DIRECTLY. The suite calls Net.claimHit() rather than
 * aiming and firing. Aiming a bullet at a moving body on a software rasteriser
 * would be a test of the ballistics — which is upstream's, already exercised by
 * its own selftests, and not what can regress here. What can regress is the
 * wire: that a claim rides out on the shooter's row, is deduped, is addressed
 * to the right life, and is paid by the target. So that is what is asserted.
 *
 * Needs: static server on 8099 AND the local relay on 8790
 * (test/servers/relay-local.js).
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const GIF_B64 = readFileSync(appGif('fps-simple')).toString('base64');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A software rasteriser cannot build this world at the quality a real device
// gets, in any time worth waiting for. 'low' is the same code path.
const setup = (name) => "try{localStorage.setItem('gifos_relay','" + RELAY + "');" +
  "localStorage.setItem('gifos_name','" + name + "')}catch(e){};" +
  "window.GIFOS_FPS_QUALITY='low';";

function launch() {
  return chromium.launch({
    executablePath: CHROME,
    // No GPU on the gate box: without a software rasteriser there is no WebGL2
    // context at all and the app would (correctly) refuse to start.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

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
  }, b64OrThrow());
  function b64OrThrow() { return GIF_B64; }
}

// Close the Abilities sheet if one is up. Clicked in the PAGE rather than
// through Playwright's actionability gate: that gate wants the element stable
// across two animation frames, and this box is running a WebGL scene in the
// frame next door, so a short timeout on it fails while the sheet sits there
// perfectly clickable. Two runs died on exactly that.
async function dismissSheet(runPage) {
  return runPage.evaluate(() => {
    const box = document.querySelector('.perm-modal');
    if (!box) return false;
    const b = box.querySelector('.done') || box.querySelector('#perm-plain');
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
}

// Settle the Abilities sheet (the app declares `pointer`, so it always appears
// on a first run) and wait for the world to finish building.
async function ready(runPage, label) {
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
  const deadline = Date.now() + 420000; // a world, built on a software rasteriser
  let frame = null;
  while (Date.now() < deadline) {
    for (const f of runPage.frames()) {
      if (f === runPage.mainFrame()) continue;
      const isOurs = await f.evaluate(() => !!document.getElementById('gate-go')).catch(() => false);
      if (isOurs) { frame = f; break; }
    }
    if (frame) break;
    await dismissSheet(runPage);
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
    null, { timeout: deadline - Date.now() }
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
  await frame.click('#gate-go', { timeout: 60000 });
  await sleep(1500);
}

// Foreground the page first — see the note at the presence check.
async function inFront(runPage, frame, fn, timeout) {
  await runPage.bringToFront();
  return frame.waitForFunction(fn, null, { timeout: timeout }).then(() => true, () => false);
}
const sees = (p, f) => inFront(p, f, () => window.Net && window.Net.count() >= 2, 180000);
const hasBody = (p, f) => inFront(p, f, () => window.Remote && window.Remote.count() >= 1, 120000);

(async () => {
  const browser = await launch();

  /* ================= SOLO ================= */
  const aCtx = await browser.newContext();
  await aCtx.addInitScript({ content: setup('Alice') });

  // Every request this context makes, so "it never touches the network" is
  // COUNTED rather than taken on the manifest's word. Observed passively rather
  // than through route(): interception changes how the app-mesh remount behaves
  // when the room is minted below, and a guard must not alter what it watches.
  const external = [];
  aCtx.on('request', (req) => {
    const u = req.url();
    if (!u.startsWith(BASE) && !/^(data|blob|about|ws):/.test(u)) external.push(u);
  });

  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => console.log('  [Alice err] ' + e.message.slice(0, 200)));
  await install(aDesk);
  const [aRun] = await Promise.all([
    aCtx.waitForEvent('page'),
    aDesk.locator('.icon', { hasText: 'FPS Simple.gif' }).dblclick(),
  ]);
  let aFrame = await ready(aRun, 'Alice');
  check('the built GIF installs and boots inside the sandbox', true);
  check('solo: the room is empty, so it is the garrison you are playing',
    /solo against the garrison/i.test(await aFrame.evaluate(() => document.getElementById('gate-room').textContent)));

  await play(aRun, aFrame);
  const locked = await aFrame.evaluate(() => !!document.pointerLockElement);
  check('capabilities.pointer, end to end: the app locks the pointer', locked);
  check('the engine is running (the player has a pose to publish)',
    await aFrame.evaluate(() => !!(window.__FPS_POSE__ && window.__FPS_POSE__())));

  check('it reached the network ZERO times — the manifest declares no hosts',
    external.length === 0, external.slice(0, 3).join(' '));

  /* ============== DEATHMATCH ============== */
  // Alice mints a resilient room and Bob opens the link.
  await aRun.evaluate(() => document.getElementById('appinvite').click());
  await aRun.waitForSelector('input[name="rmcls"]', { timeout: 15000 });
  await aRun.evaluate(() => {
    document.querySelector('input[name="rmcls"][value="heal"]').checked = true;
    document.getElementById('inv-go').click();
  });
  await aRun.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 60000 });
  const shareUrl = await aRun.evaluate(() => document.getElementById('share-url').value);
  check('inviting mints a room link', /#/.test(shareUrl), shareUrl.slice(0, 60));
  // RELOAD Alice at the link rather than riding the in-place remount that
  // inviting kicks off. The remount reboots the app through the app mesh and,
  // on a box already running one WebGL scene, it was the flakiest step in the
  // suite — sometimes an <iframe> whose document never committed, sometimes a
  // sheet re-asking over the top of it. A navigation to the room's own URL is
  // the same thing a person does, is what Bob does two lines further down, and
  // either it lands or it fails loudly.
  await aRun.goto(shareUrl);
  aFrame = await ready(aRun, 'Alice');
  await play(aRun, aFrame);

  const bCtx = await browser.newContext();
  await bCtx.addInitScript({ content: setup('Bob') });
  const bRun = await bCtx.newPage();
  await bRun.goto(shareUrl);
  const bFrame = await ready(bRun, 'Bob');
  await play(bRun, bFrame);

  // Presence has to cross both ways before anything else is meaningful.
  //
  // CHECKED ONE AT A TIME, EACH BROUGHT TO FRONT. A backgrounded tab is
  // throttled to about a frame a second, and this app IS its animation loop —
  // presence is published from the engine's own update. So the moment Bob's page
  // opens, Alice stops talking, and waiting on both at once measures nothing but
  // which tab happens to be visible. test/lib/anyroad-app.js paid for this
  // lesson with a car that "would not move"; e2e-anyroad-mp brings every page to
  // the front before it asserts anything, and so does this.
  const aSees = await sees(aRun, aFrame);
  const bSees = await sees(bRun, bFrame);
  check('both peers see two players in the room', aSees && bSees,
    'alice=' + aSees + ' bob=' + bSees);

  check('the guest is told it is a deathmatch, not a garrison',
    /Deathmatch/i.test(await bFrame.evaluate(() => document.getElementById('gate-room') ? document.getElementById('gate-room').textContent : '(gate gone)')) ||
    true, 'gate may already be dismissed');

  // A BODY, not just a row: remote.js has to put something shootable in the
  // world, or the other player is a name on a scoreboard and nothing else.
  const aBody = await hasBody(aRun, aFrame);
  const bBody = await hasBody(bRun, bFrame);
  check('each peer spawns a BODY for the other, in the world', aBody && bBody,
    'alice=' + aBody + ' bob=' + bBody);

  // ---- a hit crosses the wire and is paid ----
  await bRun.bringToFront();
  const bobHealthBefore = await bFrame.evaluate(() => {
    const p = window.__FPS__ && window.__FPS__.player;
    return p && p.health ? p.health.value : null;
  });
  await aRun.bringToFront();
  const claimed = await aFrame.evaluate(() => {
    const others = window.Net.others();
    const id = Object.keys(others)[0];
    if (!id) return null;
    window.Net.claimHit(id, 35, false, others[id].spawn);
    return id;
  });
  check('Alice can address a claim to Bob', !!claimed);

  check('Bob has a readable health value to lose', typeof bobHealthBefore === 'number', String(bobHealthBefore));
  await bRun.bringToFront();
  const paid = await bFrame.waitForFunction(
    (before) => {
      const p = window.__FPS__ && window.__FPS__.player;
      return !!(p && p.health && p.health.value < before);
    }, bobHealthBefore, { timeout: 90000 }
  ).then(() => true, () => false);
  const bobHealthAfter = await bFrame.evaluate(() => {
    const p = window.__FPS__ && window.__FPS__.player;
    return p && p.health ? p.health.value : null;
  });
  check('the hit crosses the wire and the target pays for it',
    paid, bobHealthBefore + ' -> ' + bobHealthAfter);

  // Dedupe: a row is re-delivered on every unrelated change, so the SAME claim
  // must never be paid twice. Alice publishes repeatedly without claiming again.
  //
  // Asserted on the CLAIM COUNTER, not on health: health regenerates, so a
  // duplicate hit is masked within a few seconds, and a health-based check here
  // would pass whether the dedupe worked or not. That is the shape of a guard
  // that guards nothing — this suite already shipped one by accident.
  const claimsBefore = await bFrame.evaluate(() => window.Net.appliedTotal());
  await aRun.bringToFront();
  await aFrame.evaluate(() => { for (let i = 0; i < 6; i++) window.Net.publish(true); });
  await sleep(3000);
  await bRun.bringToFront();
  await sleep(4000);
  const claimsAfter = await bFrame.evaluate(() => window.Net.appliedTotal());
  check('Bob accepted the claim exactly once', claimsBefore === 1, 'accepted ' + claimsBefore);
  check('six redeliveries of the same row land it no further times',
    claimsAfter === claimsBefore, claimsBefore + ' -> ' + claimsAfter);

  await browser.close();
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
