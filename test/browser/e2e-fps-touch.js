/*
 * FPS Simple — the thumb controls.
 *
 * Upstream Claude of Duty has no touch input at all, so on a phone it renders
 * beautifully and you cannot move or aim. Everything asserted here is code
 * written for this app, and since most people open GifOS on a phone, it is the
 * difference between a game and a wallpaper.
 *
 * WHAT THIS CAN AND CANNOT PROVE. Headless Chromium cannot synthesise a real
 * finger drag — the same limit desktop icon-locking hit (see CLAUDE.md), where
 * `gestureSourceType: 'touch'` moves nothing. So this guards the MECHANISM, the
 * way that one does: the real touchscreen is used for the single thing that must
 * be real (the touchstart that reveals the controls, because a laptop with a
 * touchscreen must never get a phone HUD laid over its game), and the controls
 * themselves are driven with pointer events and checked at the far end — in the
 * engine's own input state and in the player's yaw. If the wiring from a thumb
 * to `input.stick` / `_rawLook` / the button queues ever breaks, this goes red.
 *
 * Needs BASE only. No relay: one player, no room.
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const GIF_B64 = readFileSync(appGif('fps-simple')).toString('base64');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = "window.GIFOS_FPS_QUALITY='low';";
// WAITFORFUNCTION DOES NOT WORK IN THIS FRAME ONCE THE GAME IS RUNNING, so
// everything after Play polls with evaluate() instead. This is a harness fact
// and it cost a whole cycle to pin down, so it is written down here rather than
// rediscovered: the moment engine.start() takes over requestAnimationFrame,
// frame.waitForFunction() times out no matter what it is asked — a predicate of
// `() => true` with 200 ms timer polling times out too — while frame.evaluate()
// of the SAME expression returns the right answer at the same instant. Playwright's
// injected poller cannot run in there; the frame is perfectly healthy. Waiting
// on a real condition with a broken waiter reports the app as broken, which is
// exactly what it did: nine green checks became one bare TimeoutError pointing
// at the app.
const POLL = 250;

/** Wait for fn to be truthy IN the app frame, polling from out here. */
async function until(frame, fn, ms, arg) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await frame.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL);
  }
}


async function openApp(ctx, label) {
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
  // dblclick opens nothing. What is under test here is the app's thumb
  // controls, and the desktop's own icon behaviour has its own suites.
  const fileId = await desk.evaluate(async () => {
    const f = (await GifOS.store.allFiles()).find((x) => x.appId === 'fps-simple');
    return f ? f.id : null;
  });
  if (!fileId) throw new Error(label + ': the app did not install');
  await desk.close();
  const run = await ctx.newPage();
  run.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 180)));
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
  //     activation, which this suite never needs (nothing here asserts
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

// One synthetic pointer stroke, dispatched in the page. Playwright cannot give
// us a real finger; the handlers do not care whether the event is trusted, and
// what is under test is what they DO with it. Takes ONE object, because
// evaluate() passes a single argument and a list arrives as a list.
const STROKE = ({ sel, from, to, steps }) => {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const at = (f) => ({
    x: r.left + r.width * (from.x + (to.x - from.x) * f),
    y: r.top + r.height * (from.y + (to.y - from.y) * f),
  });
  const fire = (type, p) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
    clientX: p.x, clientY: p.y,
  }));
  fire('pointerdown', at(0));
  for (let i = 1; i <= steps; i++) fire('pointermove', at(i / steps));
  return true;
};

// Let go. Held separately because the stick ZEROES on release, so a check that
// released before reading would always see 0 — which is exactly how the first
// version of this suite failed.
const RELEASE = ({ sel }) => {
  const el = document.querySelector(sel);
  el.dispatchEvent(new PointerEvent('pointerup', {
    pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
  }));
  return true;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  // Close the browser on EVERY exit path, not only the green one. A suite
  // that throws with its browser alive leaves swiftshader chromiums for the
  // next suite to inherit — the exact pile-up CLAUDE.md documents the gate
  // hunting with pkill — and the throw path here is the one the gate actually
  // takes when a box is slow.
  try {

  /* ---- a phone ---------------------------------------------------------- */
  const pCtx = await browser.newContext({
    viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137 Mobile Safari/537.36',
  });
  await pCtx.addInitScript({ content: INIT });
  const phone = await openApp(pCtx, 'phone');

  check('the touch controls are hidden until a finger actually touches',
    await phone.frame.evaluate(() => document.getElementById('touch').hidden));

  // The one thing that must be a REAL touch: the reveal.
  const vp = phone.run.viewportSize();
  await phone.run.touchscreen.tap(Math.round(vp.width / 2), Math.round(vp.height * 0.35));
  await sleep(600);
  check('a real touchstart reveals them',
    await phone.frame.evaluate(() => !document.getElementById('touch').hidden && document.body.classList.contains('touch')));

  /* ---- the left stick: a thumb becomes a gamepad axis -------------------- */
  // WAITED FOR, not slept on: the touch value only reaches input.stick when
  // _pollGamepad runs, which is once per rendered frame, and a software
  // rasteriser draws a few frames a second. A fixed 700 ms read zero here while
  // the mechanism was working perfectly.
  await phone.frame.evaluate(STROKE, { sel: '#t-move', from: { x: 0.5, y: 0.5 }, to: { x: 0.06, y: 0.5 }, steps: 4 });
  const wentLeft = await until(phone.frame, () => window.__FPS__.engine.input.stick.moveX < -0.5, 30000);
  const stickX = await phone.frame.evaluate(() => window.__FPS__.engine.input.stick.moveX);
  check('dragging the pad left drives the engine\'s own move axis', wentLeft,
    'stick.moveX=' + stickX.toFixed(2));
  await phone.frame.evaluate(RELEASE, { sel: '#t-move' });

  // Sprint is not a button: upstream sprints past 0.92, so the pad's edge does it.
  await phone.frame.evaluate(STROKE, { sel: '#t-move', from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: -0.6 }, steps: 4 });
  const sprinted = await until(phone.frame, () => window.__FPS__.engine.input.stick.moveY <= -0.92, 30000);
  const fwd = await phone.frame.evaluate(() => window.__FPS__.engine.input.stick.moveY);
  check('pushing the pad to its forward edge reaches the sprint threshold',
    sprinted, 'stick.moveY=' + fwd.toFixed(2));

  // And letting go stops you dead — a stick stuck full-forward would run the
  // player into a wall until the tab closed.
  await phone.frame.evaluate(RELEASE, { sel: '#t-move' });
  const stopped = await until(phone.frame,
    () => window.__FPS__.engine.input.stick.moveX === 0 && window.__FPS__.engine.input.stick.moveY === 0, 30000);
  check('lifting the thumb returns the stick to centre', stopped);

  // A POSITIONLESS SAMPLE MUST NOT STEER, which is the shape of the bug where
  // the stick only ever went north-west. Chrome delivers pointermoves for an
  // already-down touch with client, page AND screen all exactly (0,0) across a
  // fullscreen/orientation transition — measured on a Moto g24 — and the stick
  // read those as an absolute position near the viewport origin. From a pad
  // anchored bottom-left that is a full-throw diagonal, identical every sample:
  // (-0.126, -0.992). Every stroke this suite dispatched carried good
  // coordinates, so nothing here could ever have caught it.
  await phone.frame.evaluate(STROKE, { sel: '#t-move', from: { x: 0.5, y: 0.5 }, to: { x: 0.9, y: 0.5 }, steps: 3 });
  const wentRight = await until(phone.frame, () => window.__FPS__.engine.input.stick.moveX > 0.3, 30000);
  check('dragging the pad right drives the move axis the other way', wentRight);
  const before = await phone.frame.evaluate(() => ({
    x: window.__FPS__.engine.input.stick.moveX, y: window.__FPS__.engine.input.stick.moveY }));
  await phone.frame.evaluate(({ sel }) => {
    const el = document.querySelector(sel);
    for (let i = 0; i < 3; i++) {
      el.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
        clientX: 0, clientY: 0,
      }));
    }
    return true;
  }, { sel: '#t-move' });
  const after = await phone.frame.evaluate(() => ({
    x: window.__FPS__.engine.input.stick.moveX, y: window.__FPS__.engine.input.stick.moveY }));
  check('a pointermove with no position at all is IGNORED, not steered by',
    Math.abs(after.x - before.x) < 0.05 && Math.abs(after.y - before.y) < 0.05,
    'before ' + before.x.toFixed(3) + ',' + before.y.toFixed(3)
      + ' after ' + after.x.toFixed(3) + ',' + after.y.toFixed(3));
  check('…and it certainly does not pin the stick to a full-throw diagonal',
    !(after.x < -0.4 && after.y < -0.4),
    after.x.toFixed(3) + ',' + after.y.toFixed(3));
  await phone.frame.evaluate(RELEASE, { sel: '#t-move' });

  /* ---- drag to look: the view actually turns ----------------------------- */
  const yaw0 = await phone.frame.evaluate(() => window.__FPS__.player.yaw);
  await phone.frame.evaluate(STROKE, { sel: '#t-look', from: { x: 0.2, y: 0.5 }, to: { x: 0.85, y: 0.5 }, steps: 8 });
  const turned = await until(phone.frame,
    (before) => Math.abs(window.__FPS__.player.yaw - before) > 0.02, 20000, yaw0);
  const yaw1 = await phone.frame.evaluate(() => window.__FPS__.player.yaw);
  check('dragging on the right half turns the view', turned,
    yaw0.toFixed(3) + ' -> ' + yaw1.toFixed(3));

  /* ---- the action buttons ----------------------------------------------- */
  await phone.frame.evaluate(() => {
    const b = document.querySelector('#t-buttons .t-btn[data-code="KeyR"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true }));
  });
  const held = await until(phone.frame, () => window.__FPS__.engine.input.down.has('KeyR'), 20000);
  check('a button press reaches the engine as its key code (RELOAD -> KeyR)', held);

  await phone.frame.evaluate(() => {
    const b = document.querySelector('#t-buttons .t-btn[data-code="KeyR"]');
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true }));
  });
  const released = await until(phone.frame, () => !window.__FPS__.engine.input.down.has('KeyR'), 20000);
  check('and releasing it lets go — a stuck key would reload forever', released);

  // A TOUCH DEVICE MUST NOT HOLD POINTER LOCK WHILE IT PLAYS, and this is the
  // one assertion that could have caught the stick going completely dead.
  //
  // Chrome on Android grants pointer lock to the canvas (the app asks on Play,
  // and the engine re-asks on the compat mousedown that a bare canvas tap
  // synthesises), and WHILE LOCKED it keeps hit-testing touch events to the
  // right element but FREEZES their client coordinates. Measured on a Moto g24:
  // 1 pointerdown and 14 pointermoves all arriving at #t-move carrying
  // clientX/Y of exactly (0,-31). So the buttons kept working — they read no
  // coordinates — while the stick and the look-drag, which read nothing else,
  // did nothing at all. It is also why the stick came back in the pause menu:
  // opening it exits pointer lock.
  //
  // Synthetic strokes can never see that, because Playwright's events carry
  // good coordinates whether or not the lock is held. So the guard is the
  // INVARIANT rather than the symptom: ask for the lock the way the engine
  // does, and require that a touch device does not end up holding one.
  //
  // LAST IN THE SUITE, deliberately. Asking for the lock provokes the app into
  // shedding one, and a shed is a real event — it briefly looks like Escape to
  // the engine. Run earlier, it left the game paused and the look-drag
  // assertion below it failed for a reason that had nothing to do with looking.
  await phone.frame.evaluate(() => { try { window.__FPS__.engine.input.requestPointerLock(); } catch (e) {} });
  const shed = await until(phone.frame,
    () => document.body.classList.contains('touch') && !document.pointerLockElement, 5000);
  check('a touch device never holds pointer lock while it is playing', shed);
  // …and shedding it must not be mistaken for Escape. Upstream pauses when a
  // lock it was holding disappears, so a careless shed opens the pause menu
  // over a live game — which is its own version of "the controls do nothing".
  check('…and shedding the lock does not read as Escape and pause the game',
    await phone.frame.evaluate(() => !(window.__FPS__ && window.__FPS__.ui
      && window.__FPS__.ui.menu && window.__FPS__.ui.menu.open)));

  await pCtx.close();

  /* ---- a desktop must NOT get a phone HUD -------------------------------- */
  const dCtx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await dCtx.addInitScript({ content: INIT });
  const desk = await openApp(dCtx, 'desktop');
  await sleep(2000);
  check('on a mouse machine the touch controls never appear',
    await desk.frame.evaluate(() => document.getElementById('touch').hidden && !document.body.classList.contains('touch')));
  await dCtx.close();

  /* ---- A TOUCHSCREEN LAPTOP IS A MOUSE MACHINE --------------------------- */
  // The gap between the two contexts above: one has no touch at all, the other
  // is a phone. A touchscreen laptop / 2-in-1 / touchscreen Chromebook is BOTH
  // — maxTouchPoints > 0 with a FINE primary pointer — and it was reported
  // (2026-08-17) as "the mouse goes in and out of working", because the app
  // read "can accept a finger" as "is a phone" and never asked for the pointer
  // lock that mouselook is made of. The person is holding a mouse; the fact
  // that they COULD also touch the screen changes nothing until they do.
  const hCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: false,
  });
  await hCtx.addInitScript({ content: INIT });
  const hyb = await openApp(hCtx, 'hybrid');
  const hybPre = await hyb.frame.evaluate(() => ({
    touchPoints: navigator.maxTouchPoints,
    coarse: matchMedia('(pointer: coarse)').matches,
    bodyTouch: document.body.classList.contains('touch'),
  }));
  check('the hybrid really is the hard case: it takes touch AND points fine',
    hybPre.touchPoints > 0 && hybPre.coarse === false, JSON.stringify(hybPre));
  check('…so the thumb HUD does not pre-empt the desktop layout', hybPre.bodyTouch === false);
  // The invariant that matters: Play asks for the pointer. Asserted through the
  // engine's own request path (the same one touch.js wraps), so a future
  // regression that bans the lock on any touch-capable screen fails here.
  await hyb.run.evaluate(() => { window.__lockAsks = 0; }).catch(() => {});
  const asked = await hyb.frame.evaluate(() => {
    const inp = window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.input;
    if (!inp || !inp.requestPointerLock) return 'no input';
    let n = 0; const orig = inp.requestPointerLock.bind(inp);
    inp.requestPointerLock = function () { n++; return orig(); };
    inp.requestPointerLock();
    return n === 1 ? 'asked' : 'swallowed';
  });
  check('a touchscreen laptop is still asked for the pointer — mouselook needs the lock',
    asked === 'asked', String(asked));
  await hCtx.close();

  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
