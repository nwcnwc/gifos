/*
 * FPS Simple — the POINTER contract on machines that are not phones.
 *
 * Split out of e2e-fps-touch.js, which release.sh had already had to give a
 * raised budget once and then blew through anyway: three legs, each needing its
 * own browser CONTEXT (a phone is a phone at the context level), and therefore
 * each paying for its own world build — 250-300s apiece in software on the gate
 * box. The instruction there is explicit about what to do instead of raising it
 * a third time: "SPLIT THE DESKTOP CONTROL LEG into its own file". This is that
 * file, and it takes the touchscreen-hybrid leg with it, because the two ask
 * one question between them.
 *
 * THE QUESTION: a machine that is not a phone must be treated as a machine that
 * is not a phone. A plain desktop must never be handed the thumb HUD; and a
 * TOUCHSCREEN LAPTOP — maxTouchPoints > 0 with a FINE primary pointer, which is
 * most laptops and Chromebooks now — must still be asked for the pointer lock
 * that mouselook is made of. That second one was reported from production
 * (2026-08-17) as "the mouse goes in and out of working": the app read "can
 * accept a finger" as "is a phone", never asked for the lock, and aiming came
 * apart. The person is holding a mouse; that they COULD also touch the screen
 * changes nothing until they do.
 *
 * The thumb controls themselves — the stick, the look drag, the buttons, and
 * the rule that a touch device never holds the lock — stay in e2e-fps-touch.js.
 *
 * Needs BASE only. No relay: one player, no room.
 */
const { chromium, CHROME } = require('../lib/pw');
const { INIT, sleep, openApp } = require('../lib/fps-app');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  // Close the browser on EVERY exit path, not only the green one. A suite that
  // throws with its browser alive leaves swiftshader chromiums for the next
  // suite to inherit — the exact pile-up CLAUDE.md documents the gate hunting
  // with pkill — and the throw path here is the one the gate actually takes
  // when a box is slow.
  try {

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
  // CHROME CANNOT EMULATE THIS COMBINATION, SO THE TWO INPUTS ARE SET DIRECTLY.
  // Three ways were tried and measured, and the first two cannot work:
  //   * `hasTouch: true` reports (pointer: coarse) TRUE even with isMobile
  //     false — Chrome ties the media feature to touch emulation. That is also
  //     what made an earlier session revert `(pointer: coarse)` after seeing it
  //     match on a headless desktop.
  //   * Emulation.setEmulatedMedia over CDP does not reach the app: a GifOS app
  //     is a sandboxed opaque-origin iframe in its own renderer, so the frame
  //     kept reporting coarse while the page above it was told fine. A
  //     browser-wide --blink-settings pointer type loses to the per-context
  //     touch emulation for the same reason.
  // The app decides from exactly two inputs — navigator.maxTouchPoints and
  // (pointer: coarse) — so a plain desktop context (fine pointer, as a
  // touchscreen laptop really reports) gets a digitiser count defined onto it,
  // in every frame. Both inputs then hold the values real hardware reports, and
  // what is under test is the DECISION the app makes from them.
  const hCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await hCtx.addInitScript({ content: INIT });
  await hCtx.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1, configurable: true });
  });
  const hyb = await openApp(hCtx, 'hybrid');
  const hybPre = await hyb.frame.evaluate(() => ({
    touchPoints: navigator.maxTouchPoints,
    coarse: matchMedia('(pointer: coarse)').matches,
    fine: matchMedia('(pointer: fine)').matches,
    bodyTouch: document.body.classList.contains('touch'),
  }));
  check('the hybrid really is the hard case: it takes touch AND points fine',
    hybPre.touchPoints > 0 && hybPre.coarse === false && hybPre.fine === true, JSON.stringify(hybPre));
  check('…so the thumb HUD does not pre-empt the desktop layout', hybPre.bodyTouch === false, JSON.stringify(hybPre));
  // The invariant that matters: Play asks for the pointer. Asserted through the
  // engine's own request path (the one touch.js wraps), so a regression that
  // bans the lock on any touch-capable screen fails here.
  const asked = await hyb.frame.evaluate(() => {
    const inp = window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.input;
    if (!inp || !inp.requestPointerLock) return 'no input';
    let n = 0; const orig = inp.requestPointerLock.bind(inp);
    // Counted BEFORE delegating: what is under test is whether the app's own
    // ban swallows the request, not whether the browser then grants it (it
    // refuses outside a user gesture, and that refusal is not the bug).
    inp.requestPointerLock = function () { n++; try { orig(); } catch (e) { /* refusal is fine */ } };
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
