// THE CAT WALKS, AND THE BOARD YOU TURN IS STILL THE BOARD YOU TAP.
//
// 1.2.0 exists because the walk had quietly stopped being reachable. Upstream
// moves the cat on 'animationcomplete'; MainScene.playerClick() opens with
// `if (cat.anims.isPlaying) cat.anims.stop()`; and Phaser 3.16's stop() EMITS
// 'animationcomplete'. So a tap inside the ~380 ms stride fired the queued move
// at once — the cat jumped a hex without one frame of walking — and tapping
// faster than the stride meant it never walked at all. It sat on one dot,
// blinked, and sat on the next. Nothing was red. Nothing could be: no suite
// had ever asked how long the cat took to get anywhere.
//
// So this suite asks. It samples the cat's own transform across a step and
// pins the four things that were wrong or would have gone wrong:
//
//   1. A step TAKES TIME and is CONTINUOUS. Many frames, a real duration, and
//      no single frame that covers most of the distance. A teleport passes
//      "the cat is one hex further along" and fails this.
//   2. Tapping mid-stride does not skip the hex. The stride SHORTENS — the cat
//      breaks into a run — and every hex on the way is still walked through.
//   3. A drag TURNS the board and never walls a hex, and a tap after the turn
//      still lands on the hex under the finger. Hit testing is the browser's
//      (a hexagonal clip-path pad per hex), so this is really asking whether
//      anything above the pads is eating pointers — which three things were:
//      an opacity:0 wall cap, a raised cap covering its neighbours, and a cat
//      billboard standing in front of the pads behind it.
//   4. A spun board changes which sprite the cat wears. The cat counter-rotates
//      the plate to stay on its feet, so on a turned board its travel and its
//      facing come apart: walking board-left goes UP the screen, and with the
//      raw direction it would do that in profile, sliding like a sticker.
//
// Runs the app straight from apps/catch-the-cat over its own server — no room,
// no relay, no GifOS runtime. e2e-app-frame-escape already boots this GIF
// inside the real runtime; what is under test here is the view.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium, CHROME } = require('../lib/pw');

const APP = path.join(__dirname, '..', '..', 'apps', 'catch-the-cat');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = new URL(req.url, 'http://x').pathname;
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.join(APP, rel === '/' ? '/index.html' : rel);
      if (!file.startsWith(APP) || !fs.existsSync(file)) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.GifCat && window.GifCat.rules && document.querySelector('.cat'), null, { timeout: 30000 });
  await sleep(600);

  // Where a hex's pad actually is on screen right now. getBoundingClientRect on
  // a 3D-transformed element is its projected bounding box, and the pad is a
  // regular hexagon centred in it, so the centre of the box is inside the pad.
  const hexPoint = (i, j) => page.evaluate(([i, j]) => {
    const h = document.querySelector('.cell .hit[data-i="' + i + '"][data-j="' + j + '"]');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [i, j]);

  const freeHex = () => page.evaluate(() => {
    const R = window.GifCat.rules, E = window.GifCat.engine, me = R.cats()[0];
    for (let i = 1; i < E.w - 1; i++) for (let j = 1; j < E.h - 1; j++) {
      if (!R.isWall(i, j) && !(i === me.i && j === me.j)) return [i, j];
    }
  });

  // ------------------------------------------------ 1. a step takes time
  //
  // Everything asserted here is a CLOCK claim, deliberately, because a frame
  // COUNT is a fact about the box and not about the app. This box is six cores
  // and a browser suite can drag it to 10 fps, at which a perfectly good 620 ms
  // walk is only six samples — so "at least ten frames" is a check that goes
  // red when the kernel is busy and green when it is not, which is the exact
  // shape of a guard people learn to ignore. The frame counts below are
  // PRINTED, never asserted.
  {
    const step = await page.evaluate(async () => {
      const R = window.GifCat.rules, E = window.GifCat.engine;
      const el = document.querySelector('.cat');
      const at = () => {
        const m = /translate3d\(([-\d.]+)px, *([-\d.]+)px/.exec(el.style.transform);
        return m ? [Number(m[1]), Number(m[2])] : null;
      };
      const art = () => document.querySelector('.cat .art').getAttribute('src');
      const rec = [];
      let stop = false;
      const tick = () => { if (stop) return; rec.push([performance.now(), at(), art()]); requestAnimationFrame(tick); };

      const from = at();
      requestAnimationFrame(tick);
      const me = R.cats()[0];
      const spot = E.neighbours(me.i, me.j).find((n) => E.inside(n.i, n.j) && !R.isWall(n.i, n.j));
      const t0 = performance.now();
      R.tap(spot.i, spot.j);
      window.GifCat.view.setWalls(R.isWall);
      window.GifCat.view.setCats(R.cats());
      const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, t0 + ms - performance.now())));
      await wait(380);
      const mid = at();
      await wait(1600);
      const end = at();
      stop = true;
      const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
      const total = d(from, end);
      const moved = rec.filter((x) => x[1]);
      let biggest = 0;
      for (let n = 1; n < moved.length; n++) biggest = Math.max(biggest, d(moved[n - 1][1], moved[n][1]));
      return {
        total, biggest,
        midFrac: total > 0 ? d(from, mid) / total : 0,
        endFrac: total > 0 ? d(from, end) / total : 0,
        sprites: new Set(rec.map((x) => x[2]).filter(Boolean)).size,
        samples: moved.length,
        pitch: 2 * Number(getComputedStyle(document.getElementById('plate')).getPropertyValue('--r').replace('px', '')),
      };
    });
    console.log('     (box: ' + step.samples + ' animation frames sampled across the step)');
    check('a tap moves the cat exactly one hex', Math.abs(step.total - step.pitch) < step.pitch * 0.06,
      { moved: step.total.toFixed(1), hexPitch: step.pitch });
    // THE GUARD. A teleport is at the far hex the instant the tap lands, so it
    // reads 1.0 here whatever the box is doing; a walk cannot be, whatever the
    // box is doing.
    check('380 ms after the tap the cat is still crossing', step.midFrac < 0.9,
      { fractionOfHexCovered: step.midFrac.toFixed(3) });
    check('...and it does arrive', step.endFrac > 0.999, { endFrac: step.endFrac });
    check('...cycling the stride frames on the way', step.sprites >= 3, { distinctSprites: step.sprites });
    check('...without one frame covering the hex', step.biggest < step.total * 0.6,
      { biggestFrameStep: step.biggest.toFixed(1), total: step.total.toFixed(1) });
  }

  // -------------------------------------- 2. tapping mid-stride never skips
  //
  // The old failure exactly: four taps inside one stride. Same clock-not-frames
  // rule — the claim is that a moment after the fourth tap the DRAWN cat is
  // still hexes behind the logical one, which a skip cannot be.
  {
    const run = await page.evaluate(async () => {
      const R = window.GifCat.rules, E = window.GifCat.engine, V = window.GifCat.view;
      const el = () => document.querySelector('.cat');
      const at = () => {
        const m = /translate3d\(([-\d.]+)px, *([-\d.]+)px/.exec(el().style.transform);
        return m ? [Number(m[1]), Number(m[2])] : null;
      };
      const path = [];
      let stop = false;
      const tick = () => { if (stop) return; const p = at(); if (p) path.push(p); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const hexes = [[R.cats()[0].i, R.cats()[0].j]];
      for (let n = 0; n < 4; n++) {
        const me = R.cats()[0];
        const spot = E.neighbours(me.i, me.j).find((x) => E.inside(x.i, x.j) && !R.isWall(x.i, x.j));
        if (!spot || R.state() !== 'chasing') break;
        R.tap(spot.i, spot.j);
        V.setWalls(R.isWall); V.setCats(R.cats());
        hexes.push([R.cats()[0].i, R.cats()[0].j]);
        await new Promise((r) => setTimeout(r, 80));
      }
      await new Promise((r) => setTimeout(r, 120));
      const behind = at();
      await new Promise((r) => setTimeout(r, 3000));
      stop = true;
      const arrived = at();
      let biggest = 0;
      for (let n = 1; n < path.length; n++) {
        biggest = Math.max(biggest, Math.hypot(path[n][0] - path[n - 1][0], path[n][1] - path[n - 1][1]));
      }
      return {
        hexes, biggest, samples: path.length,
        lag: Math.hypot(arrived[0] - behind[0], arrived[1] - behind[1]),
        pitch: 2 * Number(getComputedStyle(document.getElementById('plate')).getPropertyValue('--r').replace('px', '')),
      };
    });
    check('four fast taps step the cat four times', run.hexes.length === 5, run.hexes);
    check('...and it is still walking them well after the last tap',
      run.lag > run.pitch * 1.2, { stillToCover: run.lag.toFixed(1), hexPitch: run.pitch });
    check('...never jumping a hex to catch up',
      run.biggest < run.pitch * 0.75, { biggestFrameStep: run.biggest.toFixed(1), hexPitch: run.pitch });
  }

  // ---------------------------------------- 3. turn the board, then tap it
  {
    await page.click('#recenter');
    await sleep(600);
    const before = await page.evaluate(() => ({ v: window.GifCat.view.state(), c: window.GifCat.rules.clicks() }));
    const mid = await page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    for (let n = 1; n <= 12; n++) { await page.mouse.move(mid.x + n * 7, mid.y + n * 2); await sleep(12); }
    await page.mouse.up();
    const after = await page.evaluate(() => ({ v: window.GifCat.view.state(), c: window.GifCat.rules.clicks() }));
    check('a drag turns the board', Math.abs(after.v.spin - before.v.spin) > 5 && after.v.tilt !== before.v.tilt,
      { before: before.v, after: after.v });
    check('...and a drag is never a move', after.c === before.c, [before.c, after.c]);

    // THE BOARD TURNS UNDER THE FINGER. Stated as what a finger can see, not
    // as a sign on a variable: put the pointer on a hex and drag, and THAT HEX
    // must go the way the finger went. The two halves of a tilted board move
    // opposite ways under any turn, so a fixed sign is right for one half and
    // backwards for the other — this asks both.
    for (const [half, j] of [['near', 9], ['far', 1]]) {
      await page.click('#recenter');
      await sleep(600);
      const grab = await hexPoint(5, j);
      const drag = async (ddx, ddy) => {
        const was = await hexPoint(5, j);
        await page.mouse.move(grab.x, grab.y);
        await page.mouse.down();
        for (let n = 1; n <= 10; n++) { await page.mouse.move(grab.x + ddx * n / 10, grab.y + ddy * n / 10); await sleep(10); }
        await page.mouse.up();
        await sleep(80);
        const now = await hexPoint(5, j);
        return { dx: now.x - was.x, dy: now.y - was.y };
      };
      const right = await drag(70, 0);
      check('a ' + half + ' hex pushed RIGHT goes right', right.dx > 8, { half, moved: right });
      await page.click('#recenter');
      await sleep(600);
      const down = await drag(0, 60);
      check('a ' + half + ' hex pulled DOWN comes down', down.dy > 6, { half, moved: down });
    }

    const spot = await freeHex();
    const pt = await hexPoint(spot[0], spot[1]);
    await page.mouse.click(pt.x, pt.y);
    await sleep(150);
    const tapped = await page.evaluate(([i, j]) => ({ c: window.GifCat.rules.clicks(), wall: window.GifCat.rules.isWall(i, j) }), spot);
    check('a tap on a turned board still walls the hex under the finger',
      tapped.wall === true && tapped.c === after.c + 1, { spot, tapped, was: after.c });

    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, -400);
    await sleep(120);
    const zoomed = await page.evaluate(() => window.GifCat.view.state());
    check('the wheel dollies in', zoomed.zoom > after.v.zoom, { was: after.v.zoom, now: zoomed.zoom });
  }

  // ------------------------------- 4. the sprite follows the SCREEN, not the board
  {
    // Read what sprite a cat facing board-left wears, flat and then after a
    // real quarter-turn drag — the same code path a finger takes, because a
    // test hook that set the spin directly would not prove the gesture does.
    const facing = await page.evaluate(async () => {
      const V = window.GifCat.view, R = window.GifCat.rules;
      const art = window.GifCat.engine.art();
      const nameOf = (src) => { for (const k in art.frames) if (art.frames[k].url === src) return k.replace(/_\d+$/, ''); return '?'; };
      const el = () => document.querySelector('.cat .art');
      const readAll = () => ({ name: nameOf(el().src), flip: /scaleX\(-1\)/.test(el().style.transform) });
      // From the home view, whatever the stage shape chose it to be — the
      // sprite is picked from board direction PLUS spin, so reading "flat"
      // from a board somebody has already turned proves nothing.
      document.getElementById('recenter').click();
      await new Promise((r) => setTimeout(r, 520));
      const home = V.state().spin;
      // Park the cat facing board-left and stop it walking.
      R.reset({ seed: 7, mode: 'solo', me: { id: 'me', name: 'You' } });
      V.setWalls(R.isWall);
      V.setCats(R.cats().map((c) => Object.assign({}, c, { dir: 0 })));
      await new Promise((r) => setTimeout(r, 60));
      const flat = readAll();
      // A quarter turn, by dragging — the same code path a finger takes.
      const stage = document.getElementById('stage');
      const b = stage.getBoundingClientRect();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const ev = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 }));
      ev('pointerdown', cx, cy);
      for (let n = 1; n <= 20; n++) ev('pointermove', cx + n * (90 / 0.42) / 20, cy);
      ev('pointerup', cx + (90 / 0.42), cy);
      await new Promise((r) => setTimeout(r, 80));
      return { flat, turned: readAll(), home: home, spin: V.state().spin };
    });
    // Either way round: which way a drag turns the board depends on which half
    // of it the finger landed on, and this drag starts at the centre. The claim
    // is a QUARTER TURN, not a direction — the direction has its own checks.
    const turnedBy = (((facing.spin - facing.home) % 360) + 360) % 360;
    check('the drag turned the board about a quarter turn',
      Math.abs(turnedBy - 90) < 25 || Math.abs(turnedBy - 270) < 25,
      { home: facing.home, spin: facing.spin, turnedBy });
    // The stage here is wide, so the home view is unturned — asserted, not
    // assumed, because a conditional version of the next check would be a
    // check that passes by not asking anything.
    check('this stage shape puts the home view square on', facing.home === 0, facing);
    check('a cat facing board-left is drawn in profile on the home view',
      facing.flat.name === 'left' && facing.flat.flip === false, facing.flat);
    check('...and is NOT still in profile once the board is turned a quarter turn',
      facing.turned.name !== 'left', { flat: facing.flat, turned: facing.turned, spin: facing.spin });
  }

  check('no page errors', errors.length === 0, errors);

  await browser.close();
  srv.close();
  console.log(failures ? '\nFAIL ' + failures : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
