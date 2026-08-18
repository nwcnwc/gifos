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
 * THE PHONE LEG, AND ONLY THAT. This file used to carry a desktop leg and a
 * touchscreen-hybrid leg as well, and each leg pays for its own world build
 * because each needs its own browser CONTEXT — 250-300s apiece in software on
 * the gate box, which took the suite past a budget that had already been raised
 * once. release.sh says what to do about that instead of raising it again, and
 * this is it: those two now live in e2e-fps-pointer.js, where they ask one
 * question between them (a machine that is not a phone must not be treated as
 * one). Both files are discovered by the gate, so neither can rot.
 *
 * Needs BASE only. No relay: one player, no room.
 */
const { chromium, CHROME } = require('../lib/pw');
// The install-and-get-playing walk lives in test/lib/fps-app.js: this suite and
// e2e-fps-pointer.js both need it, and they are two files because each leg pays
// for its own world build (see that file's header, and the split note in
// e2e-fps-pointer.js).
const { INIT, sleep, until, openApp } = require('../lib/fps-app');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

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

  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
