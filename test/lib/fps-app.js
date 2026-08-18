/*
 * fps-app.js — install FPS Simple and get it PLAYING, for the suites that need
 * a running game and are not about how it starts.
 *
 * Extracted when e2e-fps-touch had to be split. That suite ran three legs — a
 * phone, a desktop, a touchscreen hybrid — and each one pays for its own world
 * build, because each needs its own browser CONTEXT (a phone is a phone at the
 * context level: hasTouch, isMobile, the UA) and a context is a fresh profile
 * with an empty texture cache. On the gate box, in software, that is 250-300s
 * EACH: measured 44s to Play plus 297s / 249s / 278s to a counting engine, for
 * a suite whose budget had already been raised once. release.sh says what to do
 * about that rather than raise it again — "SPLIT THE DESKTOP CONTROL LEG into
 * its own file" — and splitting means this walk has two callers.
 *
 * It is a walk, not an assertion: everything here THROWS with what it saw. The
 * claims belong to the suites.
 */
const { appGif } = require('./apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const GIF_B64 = readFileSync(appGif('fps-simple')).toString('base64');

// Every caller wants the cheap street: none of them looks at it, and 'medium'
// on a software rasteriser spends minutes on scenery nothing then reads.
const INIT = "window.GIFOS_FPS_QUALITY='low';";

// WAITFORFUNCTION DOES NOT WORK IN THIS FRAME ONCE THE GAME IS RUNNING, so
// everything after Play polls with evaluate() instead. This is a harness fact
// and it cost a whole cycle to pin down, so it is written down here rather than
// rediscovered: the moment engine.start() takes over requestAnimationFrame,
// frame.waitForFunction() times out no matter what it is asked — a predicate of
// `() => true` with 200 ms timer polling times out too — while frame.evaluate()
// of the SAME expression returns the right answer at the same instant.
// Playwright's injected poller cannot run in there; the frame is perfectly
// healthy. Waiting on a real condition with a broken waiter reports the app as
// broken, which is exactly what it did: nine green checks became one bare
// TimeoutError pointing at the app.
const POLL = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for fn to be truthy IN the app frame, polling from out here. */
async function until(frame, fn, ms, arg) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await frame.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL);
  }
}

// `prep` runs against the app's page BEFORE it navigates — the only moment
// media emulation can reach boot.js, which decides how to treat the device
// once, at startup.
async function openApp(ctx, label, prep) {
  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [' + label + ' err] ' + e.message.slice(0, 180)));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 30000 });
  await desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'FPS Simple.gif', bytes, kind: 'gif', isApp: true, appId: 'fps-simple', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'FPS Simple.gif', parent: null, x: 40, y: 40, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, GIF_B64);
  // Opened by URL rather than by double-clicking the icon: on a touch context a
  // desktop icon is TAP-to-open and locked against dragging (CLAUDE.md), so a
  // dblclick opens nothing. What is under test in these suites is the app, and
  // the desktop's own icon behaviour has its own suites.
  const fileId = await desk.evaluate(async () => {
    const f = (await GifOS.store.allFiles()).find((x) => x.appId === 'fps-simple');
    return f ? f.id : null;
  });
  if (!fileId) throw new Error(label + ': the app did not install');
  await desk.close();
  const run = await ctx.newPage();
  run.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 180)));
  if (prep) await prep(run);
  await run.goto(BASE + '/run.html#id=' + fileId);
  await run.waitForSelector('#appmount iframe', { timeout: 90000 });
  // The Abilities sheet is dismissed inside the wait loops below, on EVERY
  // pass, never in one fixed window up front: on a loaded box it can appear
  // later than any window you pick, and a missed sheet is a full-screen
  // overlay in the PARENT document, over the whole iframe. Playwright's
  // frame.click cannot see it (its hit check runs in the iframe's own
  // document), so the CDP click lands on the sheet's backdrop — which closes
  // the sheet and nothing else. Play never happens, and the failure reads as
  // "the engine never started", pointing at the app.
  const dismissSheet = () => run.evaluate(() => {
    const box = document.querySelector('.perm-modal');
    if (!box) return false;
    const b = box.querySelector('.done') || box.querySelector('#perm-plain');
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
  const frame = await (await run.$('#appmount iframe')).contentFrame();
  const t0 = Date.now();
  for (;;) {
    if (await frame.evaluate(() => { const b = document.getElementById('gate-go'); return b && !b.disabled; }).catch(() => false)) break;
    if (Date.now() - t0 > 300000) throw new Error(label + ': Play never lit (world did not finish building in 300s)');
    await dismissSheet();
    await sleep(POLL);
  }
  console.log('  [' + label + '] Play lit after ' + Math.round((Date.now() - t0) / 1000) + 's');
  // PLAY, VERIFIED BY WHAT IT DOES — and clicked IN the frame, not through
  // Playwright's actionability gate. Two measured reasons, both from runs on
  // a deliberately starved box recreating the gate's conditions:
  //
  //   * The old wait polled `window.__FPS__` — which boot.js assigns at the
  //     END OF BOOT, before Play is even enabled. It never tested "the engine
  //     started"; it tested "can this suite complete one evaluate within
  //     30 s", and on the gate box (two full swiftshader boots deep, loadavg
  //     ~5) the answer was no — recorded RED twice with 13 passed, 0 failed.
  //     The fact that IS Play: engine.time.frame starts counting.
  //   * frame.click waits for the button to be "stable" across two animation
  //     frames, and a starved renderer barely ticks rAF — measured: the click
  //     itself timing out at 30 s with the button resolved, visible and
  //     enabled the whole time. A frame-side .click() carries no user
  //     activation, which these suites never need (nothing here asserts
  //     pointer lock being HELD, fullscreen, or audio — the touch leg asserts
  //     the lock is NOT held), and framelog's own autostart presses Play the
  //     same way for the same reason.
  //
  // The click is re-issued while the engine has not started (the app's
  // `starting` guard makes repeats free), because a click can still race the
  // sheet appearing over it.
  const deadline = Date.now() + 240000;
  let started = false;
  while (Date.now() < deadline) {
    await dismissSheet();
    await frame.evaluate(() => { const b = document.getElementById('gate-go'); if (b && !b.disabled) b.click(); }).catch(() => {});
    if (await until(frame,
      () => !!(window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.time && window.__FPS__.engine.time.frame > 0),
      15000)) { started = true; break; }
  }
  if (!started) {
    // Say what was there — a bare "never started" sent the last reader at the
    // app when the app was fine.
    const seen = {
      fps: await frame.evaluate(() => !!window.__FPS__).catch((e) => 'ERR:' + String(e.message).slice(0, 60)),
      gate: await frame.evaluate(() => !!document.getElementById('gate')).catch(() => '?'),
      sheet: await run.evaluate(() => !!document.querySelector('.perm-modal')).catch(() => '?'),
    };
    throw new Error(label + ': the engine never started after Play — ' + JSON.stringify(seen));
  }
  console.log('  [' + label + '] engine running after ' + Math.round((Date.now() - t0) / 1000) + 's');
  await sleep(1200);
  return { run, frame };
}

module.exports = { BASE, GIF_B64, INIT, POLL, sleep, until, openApp };
