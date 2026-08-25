/*
 * Eagle Defense — the real GIF, installed and PLAYED in the real sandbox.
 *
 * test/unit/battle-city.js plays the simulation headless, and that is where the
 * game rules are pinned. This suite exists for the half a vm cannot see: that
 * the GIF the store actually ships unpacks, that index.html's five scripts all
 * arrive and run inside the app frame, that a KEY PRESS reaches the tank, and
 * that a finger on the on-screen pad does too.
 *
 * The app shipped with every tank frozen — `canMove` compared the mover by
 * reference against a copy of itself, so every move in the game was refused.
 * Nothing caught it because nothing opened the app. A build that boots, paints
 * a stage and accepts input is exactly what "it looked fine" means, so none of
 * those are the assertion here: the assertion is that the tank is somewhere
 * else afterwards.
 *
 * Two legs, one box each, no timing claims — every question here is about
 * STATE, so a loaded kernel gives the same answer as an idle one.
 *
 *   desktop   keyboard: arrows move, J fires, P pauses.
 *   phone     a real touch reveals the pad; the pad's buttons are ON the pad,
 *             not over the board; a d-pad TAP moves the tank (press and release
 *             both land between two frames, and the first build dropped it).
 *
 * Needs: a static server on 8099 serving site/.
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const GIF_B64 = readFileSync(appGif('battle-city')).toString('base64');

let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined && !c ? '  ' + JSON.stringify(d) : ''));
  if (!c) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The app's own state, read from inside its frame. boot.js keeps `g` in a
// closure, so it is reached through the one object that IS on the window.
//
// Two things here are the difference between a guard and a coin flip, and
// both were paid for: this hook lost the race one run in three before it
// looked like this.
//
//   It wraps render(), not create(). create() is called ONCE, at the top of
//   boot.js's IIFE — a hook that lands a millisecond late never sees it and
//   the suite times out looking for a game that is running perfectly well.
//   render() is called on every frame forever, so whenever the hook lands,
//   the next frame hands `g` over.
//
//   It ADOPTS an existing BattleCity instead of shadowing it. Defining an
//   accessor over a property that is already set throws the object away:
//   boot.js then reads `root.BattleCity` as undefined and the app dies with
//   "Cannot read properties of undefined (reading 'create')" — the harness
//   breaking the app and then reporting the app as broken.
const HOOK = `(() => {
  if (window.__bcHook) return;
  window.__bcHook = 1;
  const wrap = (v) => {
    if (!v || v.__bcWrapped) return v;
    const r = v.render;
    v.render = function (ctx, g) { window.__bc = g; return r.apply(this, arguments); };
    v.__bcWrapped = 1;
    return v;
  };
  const d = Object.getOwnPropertyDescriptor(window, 'BattleCity');
  let real = wrap(d ? d.value : undefined);
  Object.defineProperty(window, 'BattleCity', {
    configurable: true,
    get() { return real; },
    set(v) { real = wrap(v); }
  });
})();`;

async function install(ctx, label) {
  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [' + label + ' desk err] ' + e.message.slice(0, 160)));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 30000 });
  const fileId = await desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Eagle Defense.gif', bytes, kind: 'gif', isApp: true, appId: 'battle-city', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Eagle Defense.gif', parent: null, x: 40, y: 40, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
    const f = (await GifOS.store.allFiles()).find((x) => x.appId === 'battle-city');
    return f ? f.id : null;
  }, GIF_B64);
  await desk.close();
  if (!fileId) throw new Error(label + ': the app did not install');
  return fileId;
}

// Open the app and hand back its frame, already at the title screen.
async function open(ctx, fileId, label) {
  const run = await ctx.newPage();
  run.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 160)));
  await run.goto(BASE + '/run.html#id=' + fileId);
  await run.waitForSelector('#appmount iframe', { timeout: 90000 });
  const frame = await (await run.$('#appmount iframe')).contentFrame();
  const t0 = Date.now();
  for (;;) {
    const ok = await frame.evaluate(() => !!(window.__bc && window.__bc.menu && window.__bc.menu.length)).catch(() => false);
    if (ok) break;
    if (Date.now() - t0 > 60000) {
      // Say WHICH thing is missing. "No title screen" covers both a dead app
      // and a harness that never got its hook in, and those want opposite fixes.
      const seen = await frame.evaluate(() => ({
        hook: !!window.__bcHook, bc: !!window.BattleCity, g: !!window.__bc,
        canvas: !!document.getElementById('game'),
      })).catch((e) => ({ err: String(e) }));
      throw new Error(label + ': the game never reached its title screen in 60s — ' + JSON.stringify(seen));
    }
    await sleep(200);
  }
  return { run: run, frame: frame };
}

const state = (frame) => frame.evaluate(() => {
  const g = window.__bc;
  const p = g && g.players && g.players[0];
  return {
    phase: g.phase, stage: g.stageIndex, paused: !!g.paused,
    tanks: g.tanks.length, bots: g.tanks.filter((t) => t.side === 'bot').length,
    x: p ? p.x : null, y: p ? p.y : null, dir: p ? p.direction : null,
    bullets: g.bullets.length,
  };
});

// Wait for the curtain: 'stage' runs ~1.8s of real time before 'play'.
async function toPlay(frame, label) {
  const t0 = Date.now();
  for (;;) {
    const s = await state(frame);
    if (s.phase === 'play') return s;
    if (Date.now() - t0 > 20000) throw new Error(label + ': never reached play (phase=' + s.phase + ')');
    await sleep(200);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  // ---- desktop: a keyboard ---------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await ctx.addInitScript(HOOK); /* the app is a srcdoc frame — page-level lands too late */
    const fileId = await install(ctx, 'desktop');
    const { run, frame } = await open(ctx, fileId, 'desktop');

    check('the built GIF boots to its title screen', (await state(frame)).phase === 'title');

    // Every script in index.html has to have arrived: the GifOS runtime inlines
    // <script src>, and a dropped file is a game that paints nothing.
    const parts = await frame.evaluate(() => ({
      stages: (window.BC_STAGES || []).length,
      game: !!(window.BattleCity && window.BattleCity.tick),
      net: !!(window.BCNet && window.BCNet.init),
      sound: !!(window.BCSound && window.BCSound.play),
      canvas: !!document.getElementById('game'),
    }));
    check('all 35 stages rode inside the GIF', parts.stages === 35, parts);
    check('game.js, net.js and sound.js all arrived',
      parts.game && parts.net && parts.sound && parts.canvas, parts);

    await frame.click('canvas'); /* focus, so the keys land in the app frame */
    await run.keyboard.press('Enter');
    const played = await toPlay(frame, 'desktop');
    check('Enter starts a game and the stage builds', played.phase === 'play' && played.bots > 0, played);

    // THE BUG. Hold a direction; the tank has to be somewhere else.
    const before = await state(frame);
    await run.keyboard.down('ArrowLeft');
    await sleep(700);
    await run.keyboard.up('ArrowLeft');
    const after = await state(frame);
    check('a held arrow key MOVES the tank', after.x < before.x - 4,
      { from: before.x, to: after.x, dir: after.dir });
    check('…and turns it', after.dir === 'left', after.dir);

    const b0 = (await state(frame)).bullets;
    await run.keyboard.press('KeyJ');
    await sleep(60);
    check('J fires', (await state(frame)).bullets > b0 || b0 > 0, { before: b0 });

    await run.keyboard.press('KeyP');
    await sleep(120);
    check('P pauses', (await state(frame)).paused === true);
    await run.keyboard.press('KeyP');
    await sleep(120);
    check('…and unpauses', (await state(frame)).paused === false);

    await ctx.close();
  }

  // ---- phone: a finger -------------------------------------------------------
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    });
    await ctx.addInitScript(HOOK);
    const fileId = await install(ctx, 'phone');
    const { run, frame } = await open(ctx, fileId, 'phone');

    check('the pad is hidden until a real finger arrives',
      await frame.evaluate(() => document.getElementById('touch').hidden) === true);

    const canvasBox = await (await frame.$('canvas')).boundingBox();
    await run.touchscreen.tap(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await sleep(200);
    check('a touch reveals the pad',
      await frame.evaluate(() => document.getElementById('touch').hidden) === false);

    // The board must be worth looking at. An integer-only scale gave a 390pt
    // phone 1x — a 256px stamp in ~14% of the screen with the pad marooned
    // below it.
    const fit = await frame.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      return { w: c.width, h: c.height, top: c.top, vw: innerWidth, vh: innerHeight };
    });
    check('the board is scaled up to the phone, not left at 1x',
      fit.w >= fit.vw * 0.85, fit);
    check('…and it sits clear of the top of the screen', fit.top > 0, fit);

    // No control may sit on the board: the first build put START and PAUSE over
    // the enemy counter and the score column.
    const overlaps = await frame.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect();
      const bad = [];
      document.querySelectorAll('#touch button').forEach((b) => {
        if (b.offsetParent === null) return; /* not shown right now */
        const r = b.getBoundingClientRect();
        if (r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top) bad.push(b.id || b.className);
      });
      return bad;
    });
    check('no pad control is drawn over the board', overlaps.length === 0, overlaps);

    // And no control may sit on another one.
    const collisions = await frame.evaluate(() => {
      const els = [].slice.call(document.querySelectorAll('#touch button')).filter((b) => b.offsetParent !== null);
      const bad = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          bad.push((els[i].id || els[i].className) + ' x ' + (els[j].id || els[j].className));
        }
      }
      return bad;
    });
    check('no pad control is drawn over another', collisions.length === 0, collisions);

    const startBox = await (await frame.$('#t-start')).boundingBox();
    await run.touchscreen.tap(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    const played = await toPlay(frame, 'phone');
    check('START starts the game from the pad', played.phase === 'play', played);

    check('START stands down once the fight begins',
      await frame.evaluate(() => getComputedStyle(document.getElementById('t-start')).display === 'none'));
    check('…and PAUSE takes its place',
      await frame.evaluate(() => getComputedStyle(document.getElementById('t-pause')).display !== 'none'));

    // A TAP, not a hold: press and release land between two frames, and the
    // first build threw the direction away before any tick could see it.
    const before = await state(frame);
    const leftBox = await (await frame.$('.d-left')).boundingBox();
    await run.touchscreen.tap(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2);
    await sleep(400);
    const after = await state(frame);
    check('a TAP on the d-pad moves the tank', after.x < before.x,
      { from: before.x, to: after.x, dir: after.dir });

    // And FIRE has to fire.
    const fireBox = await (await frame.$('#t-fire')).boundingBox();
    const shots = await frame.evaluate(() => {
      window.__shots = 0;
      const g = window.__bc;
      const p = g.players[0];
      return p.id;
    });
    await run.touchscreen.tap(fireBox.x + fireBox.width / 2, fireBox.y + fireBox.height / 2);
    await sleep(120);
    check('FIRE fires', await frame.evaluate((id) => window.__bc.bullets.some((b) => b.owner === id), shots), shots);

    await ctx.close();
  }

  await browser.close();
  console.log(failures ? failures + ' FAILURES' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('NO-VERDICT — the suite could not finish: ' + (e && e.message));
  process.exit(4);
});
