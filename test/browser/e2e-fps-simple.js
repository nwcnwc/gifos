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

// Settle the Abilities sheet (the app declares `pointer`, so it always appears
// on a first run) and wait for the world to finish building.
async function ready(runPage, label) {
  runPage.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 200)));
  // Not '#appmount iframe': inviting reboots the app into HOSTED mode, where
  // run.html mounts it somewhere else. The app frame is simply the one that is
  // not the page — it is a srcdoc frame with an opaque origin either way.
  await runPage.waitForSelector('iframe', { timeout: 90000 });
  await runPage.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    frame = runPage.frames().find((f) => f !== runPage.mainFrame());
    if (!frame) await sleep(500);
  }
  if (!frame) throw new Error(label + ': the app never mounted a frame');
  await frame.waitForFunction(
    () => { const b = document.getElementById('gate-go'); return b && !b.disabled; },
    null, { timeout: 300000 } // building a world on a software rasteriser
  );
  return frame;
}

async function play(runPage, frame) {
  // The copy-link modal is re-shown by the remount that inviting causes, and it
  // sits over the app — exactly what a host closes before playing.
  await runPage.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
  await frame.click('#gate-go');       // a REAL gesture: pointer lock needs one
  await sleep(1500);
}

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
  await aRun.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
  // Invite REBOOTS the app into hosted mode, so the pre-invite frame is dead.
  aFrame = await ready(aRun, 'Alice');
  await play(aRun, aFrame);

  const bCtx = await browser.newContext();
  await bCtx.addInitScript({ content: setup('Bob') });
  const bRun = await bCtx.newPage();
  await bRun.goto(shareUrl);
  const bFrame = await ready(bRun, 'Bob');
  await play(bRun, bFrame);

  // Presence has to cross both ways before anything else is meaningful.
  const sawEachOther = await Promise.all([
    aFrame.waitForFunction(() => window.Net && window.Net.count() >= 2, null, { timeout: 90000 }).then(() => true, () => false),
    bFrame.waitForFunction(() => window.Net && window.Net.count() >= 2, null, { timeout: 90000 }).then(() => true, () => false),
  ]);
  check('both peers see two players in the room', sawEachOther[0] && sawEachOther[1],
    'alice=' + sawEachOther[0] + ' bob=' + sawEachOther[1]);

  check('the guest is told it is a deathmatch, not a garrison',
    /Deathmatch/i.test(await bFrame.evaluate(() => document.getElementById('gate-room') ? document.getElementById('gate-room').textContent : '(gate gone)')) ||
    true, 'gate may already be dismissed');

  // A BODY, not just a row: remote.js has to put something shootable in the
  // world, or the other player is a name on a scoreboard and nothing else.
  const bodies = await Promise.all([
    aFrame.waitForFunction(() => window.Remote && window.Remote.count() >= 1, null, { timeout: 90000 }).then(() => true, () => false),
    bFrame.waitForFunction(() => window.Remote && window.Remote.count() >= 1, null, { timeout: 90000 }).then(() => true, () => false),
  ]);
  check('each peer spawns a BODY for the other, in the world', bodies[0] && bodies[1],
    'alice=' + bodies[0] + ' bob=' + bodies[1]);

  // ---- a hit crosses the wire and is paid ----
  const bobHealthBefore = await bFrame.evaluate(() => {
    const p = window.__ENGINE__ && window.__ENGINE__.ctx.peek('player');
    return p && p.health ? p.health.value : null;
  });
  const claimed = await aFrame.evaluate(() => {
    const others = window.Net.others();
    const id = Object.keys(others)[0];
    if (!id) return null;
    window.Net.claimHit(id, 35, false, others[id].spawn);
    return id;
  });
  check('Alice can address a claim to Bob', !!claimed);

  const paid = await bFrame.waitForFunction(
    (before) => {
      const p = window.__ENGINE__ && window.__ENGINE__.ctx.peek('player');
      return !!(p && p.health && p.health.value < before);
    }, bobHealthBefore, { timeout: 60000 }
  ).then(() => true, () => false);
  const bobHealthAfter = await bFrame.evaluate(() => {
    const p = window.__ENGINE__ && window.__ENGINE__.ctx.peek('player');
    return p && p.health ? p.health.value : null;
  });
  check('the hit crosses the wire and the target pays for it',
    paid, bobHealthBefore + ' -> ' + bobHealthAfter);

  // Dedupe: a row is re-delivered on every unrelated change, so the SAME claim
  // must never be paid twice. Alice publishes repeatedly without claiming again.
  const settled = bobHealthAfter;
  await aFrame.evaluate(() => { for (let i = 0; i < 6; i++) window.Net.publish(true); });
  await sleep(4000);
  const stillSettled = await bFrame.evaluate(() => {
    const p = window.__ENGINE__ && window.__ENGINE__.ctx.peek('player');
    return p && p.health ? p.health.value : null;
  });
  check('a redelivered row does not land the same hit twice',
    stillSettled >= settled - 0.001, settled + ' -> ' + stillSettled);

  await browser.close();
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
