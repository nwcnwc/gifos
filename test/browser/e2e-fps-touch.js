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
  const [run] = await Promise.all([
    ctx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'FPS Simple.gif' }).dblclick(),
  ]);
  run.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 180)));
  await run.waitForSelector('#appmount iframe', { timeout: 90000 });
  await run.locator('.perm-modal .done').click({ timeout: 5000 }).catch(() => {});
  const frame = await (await run.$('#appmount iframe')).contentFrame();
  await frame.waitForFunction(() => { const b = document.getElementById('gate-go'); return b && !b.disabled; },
    null, { timeout: 300000 });
  await frame.click('#gate-go');
  await frame.waitForFunction(() => !!window.__FPS__, null, { timeout: 30000 });
  await sleep(1200);
  return { run, frame };
}

// One synthetic pointer stroke, dispatched in the page. Playwright cannot give
// us a real finger; the handlers do not care whether the event is trusted, and
// what is under test is what they DO with it.
const STROKE = (sel, from, to, steps) => {
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

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

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
  await phone.frame.evaluate(STROKE, ['#t-move', { x: 0.5, y: 0.5 }, { x: 0.06, y: 0.5 }, 4]);
  await sleep(700); // _pollGamepad runs in beginFrame; give it frames
  const stick = await phone.frame.evaluate(() => ({
    x: window.__FPS__.engine.input.stick.moveX,
    y: window.__FPS__.engine.input.stick.moveY,
  }));
  check('dragging the pad left drives the engine\'s own move axis', stick.x < -0.5,
    'stick.moveX=' + stick.x.toFixed(2));

  // Sprint is not a button: upstream sprints past 0.92, so the pad's edge does it.
  await phone.frame.evaluate(STROKE, ['#t-move', { x: 0.5, y: 0.5 }, { x: 0.5, y: -0.6 }, 4]);
  await sleep(700);
  const fwd = await phone.frame.evaluate(() => window.__FPS__.engine.input.stick.moveY);
  check('pushing the pad to its forward edge reaches the sprint threshold',
    fwd <= -0.92, 'stick.moveY=' + fwd.toFixed(2));

  /* ---- drag to look: the view actually turns ----------------------------- */
  const yaw0 = await phone.frame.evaluate(() => window.__FPS__.player.yaw);
  await phone.frame.evaluate(STROKE, ['#t-look', { x: 0.2, y: 0.5 }, { x: 0.85, y: 0.5 }, 8]);
  const turned = await phone.frame.waitForFunction(
    (before) => Math.abs(window.__FPS__.player.yaw - before) > 0.02, yaw0, { timeout: 20000 }
  ).then(() => true, () => false);
  const yaw1 = await phone.frame.evaluate(() => window.__FPS__.player.yaw);
  check('dragging on the right half turns the view', turned,
    yaw0.toFixed(3) + ' -> ' + yaw1.toFixed(3));

  /* ---- the action buttons ----------------------------------------------- */
  await phone.frame.evaluate(() => {
    const b = document.querySelector('#t-buttons .t-btn[data-code="KeyR"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true }));
  });
  const held = await phone.frame.waitForFunction(
    () => window.__FPS__.engine.input.down.has('KeyR'), null, { timeout: 20000 }
  ).then(() => true, () => false);
  check('a button press reaches the engine as its key code (RELOAD -> KeyR)', held);

  await phone.frame.evaluate(() => {
    const b = document.querySelector('#t-buttons .t-btn[data-code="KeyR"]');
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true }));
  });
  const released = await phone.frame.waitForFunction(
    () => !window.__FPS__.engine.input.down.has('KeyR'), null, { timeout: 20000 }
  ).then(() => true, () => false);
  check('and releasing it lets go — a stuck key would reload forever', released);

  await pCtx.close();

  /* ---- a desktop must NOT get a phone HUD -------------------------------- */
  const dCtx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await dCtx.addInitScript({ content: INIT });
  const desk = await openApp(dCtx, 'desktop');
  await sleep(2000);
  check('on a mouse machine the touch controls never appear',
    await desk.frame.evaluate(() => document.getElementById('touch').hidden && !document.body.classList.contains('touch')));

  await browser.close();
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
