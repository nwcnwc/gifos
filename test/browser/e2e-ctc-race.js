// Catch the Cat: the race UI a friend actually sees.
//
// test/unit/catch-the-cat.js proves the SCORING — that two clients reach the
// same tally from the same rows. Nothing there touches a screen. This suite
// runs the shipped app in a browser with gifos.db stubbed in-page as one
// shared collection, and pins the four things that are only true in the DOM:
//
//   1. The standings are the SERIES. The crown follows wins, not whoever has
//      the best board in front of them right now — the whole point of the
//      change is that a round no longer evaporates when someone deals a new
//      board.
//   2. Finishing your board STOPS it taking taps. Upstream starts a fresh
//      chase when you tap a finished board; in a race that is a private board
//      and a row that flips back to 'playing' after everyone else has stopped.
//      Guarded as pointer-events, and the pinch must survive it (touch-action
//      stays pinch-zoom — see e2e-ctc-pinch.js for why that matters).
//   3. The result is CALLED — a flash over the board, a status line, and the
//      New board button turning into Next round — and a new round clears all
//      three, so round 2 never opens under round 1's verdict.
//   4. A player's NAME is other people's text. It is escaped, or the room is
//      an injection vector into every screen in it.
//
// Needs: nothing — spawns its own static server over apps/catch-the-cat (the
// app SOURCE; the committed GIF is the signed build of exactly these files).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('../lib/pw');

const DIR = path.join(__dirname, '..', '..', 'apps', 'catch-the-cat');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined && !c ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

// Everything the app needs from the OS: an identity and one shared collection.
// Rows land and subscribers fire synchronously — tighter than the real db, and
// the app must not care.
function stub() {
  const rows = new Map();
  const subs = [];
  const snap = () => [...rows.values()].map((r) => JSON.parse(JSON.stringify(r)));
  const notify = () => subs.slice().forEach((cb) => cb(snap()));
  window.__room = {
    rows,
    notify,
    // A friend on the current round, heartbeating like a live tab.
    seat(row) {
      const beat = () => {
        const r = window.CTCNet.round();
        rows.set(row.id, Object.assign({ round: r.id, rn: r.n, seed: r.seed }, row, { t: Date.now() }));
        notify();
      };
      beat();
      setInterval(beat, 1500);
      return { update(next) { Object.assign(row, next); beat(); } };
    },
  };
  window.gifos = {
    me: () => Promise.resolve({ id: 'me', name: 'Ana' }),
    db: () => ({
      put: (r) => { rows.set(r.id, JSON.parse(JSON.stringify(r))); notify(); return Promise.resolve(r); },
      getAll: () => Promise.resolve(snap()),
      subscribe: (cb) => { subs.push(cb); cb(snap()); },
    }),
  };
  // Catch the Phaser game as boot.js constructs it, so a round can be ENDED
  // here instead of solving an 11x11 honeycomb by hand. A property hook, not a
  // poll: game.js and boot.js are synchronous scripts, so no timer of ours
  // could ever run between them.
  let real = null;
  Object.defineProperty(window, 'CatchTheCatGame', {
    configurable: true,
    get() {
      if (!real) return undefined;
      return function (opts) { const g = new real(opts); window.__game = g; return g; };
    },
    set(v) { real = v; },
  });
}

(async () => {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(DIR, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(DIR)) { res.writeHead(403); return res.end(); }
    const f = (p === DIR || p.endsWith(path.sep)) ? path.join(DIR, 'index.html') : p;
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 760 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  await page.addInitScript(stub);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CTCNet && window.CTCNet.round().id && window.__game, null, { timeout: 20000 });

  const roster = () => page.innerText('#roster');
  const rowText = (name) => page.evaluate((n) => {
    const row = [...document.querySelectorAll('#roster .row')].filter((r) => r.textContent.indexOf(n) >= 0)[0];
    return row ? row.textContent : '';
  }, name);

  check('the app boots into a room', !!(await page.evaluate(() => window.CTCNet.round().id)));
  check('alone, the roster asks for a friend', (await roster()).indexOf('Waiting for someone else') >= 0, await roster());

  // Bo has won two rounds already; Cy has none but the better board today.
  await page.evaluate(() => {
    window.__seats = {
      bo: window.__room.seat({ id: 'bo', name: 'Bo', clicks: 22, status: 'playing', wins: 2, played: 3, best: 14, streak: 2 }),
      cy: window.__room.seat({ id: 'cy', name: 'Cy', clicks: 4, status: 'playing', wins: 0, played: 3, best: 0, streak: 0 }),
    };
  });
  await page.waitForTimeout(300);

  check('the standings appear once someone else is in', (await roster()).indexOf('WINS') >= 0 || (await roster()).toLowerCase().indexOf('wins') >= 0, await roster());
  check('the head counts who is still chasing', (await roster()).toLowerCase().indexOf('3 still chasing') >= 0, await roster());
  check('the crown follows the SERIES, not this board',
    (await rowText('Bo')).indexOf('♛') >= 0 && (await rowText('Cy')).indexOf('♛') < 0,
    { bo: await rowText('Bo'), cy: await rowText('Cy') });
  check('a streak is shown, and only when there is one',
    (await rowText('Bo')).indexOf('🔥' + 2) >= 0 && (await rowText('Cy')).indexOf('🔥') < 0,
    { bo: await rowText('Bo'), cy: await rowText('Cy') });

  // I finish — through the real rules, not a Phaser event: the visible board is
  // GifCat.view over GifCat.rules now and the Phaser scene is a hidden engine
  // with its loop stopped, so nothing listens for 'ctc-win' any more. Wall
  // five of my cat's six neighbours straight into the engine, then lay the
  // sixth with a genuine tap on its hex pad, so the pen closes the way a
  // player's does (view → boot's tap → rules.tap). Same recipe as
  // e2e-catch-the-cat-room.js. The round is not over — two friends are still
  // chasing.
  const myClicks = await page.evaluate(() => {
    const R = window.GifCat.rules, E = window.GifCat.engine;
    const me = R.myCat();
    const nbs = E.neighbours(me.i, me.j).filter((n) => E.inside(n.i, n.j));
    const last = nbs.find((n) => !R.isWall(n.i, n.j));
    nbs.forEach((n) => { if (n !== last) E.setWall(n.i, n.j, true); });
    const h = document.querySelector('.cell .hit[data-i="' + last.i + '"][data-j="' + last.j + '"]');
    h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5 }));
    document.getElementById('stage').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 5, clientY: 5 }));
    return R.clicks();
  });
  const myTaps = myClicks === 1 ? '1 tap' : myClicks + ' taps';   // boot.js taps()
  await page.waitForTimeout(1000);
  check('finishing says the round is not over yet', (await page.innerText('#status')).indexOf('Waiting on the others') >= 0, await page.innerText('#status'));
  // The lock is #stage.done: the hex pads stop taking a pointer, while the
  // stage itself keeps every gesture (touch-action: none is the APP owning
  // the pinch and the drag, not the browser) — so a finished board can still
  // be turned and zoomed.
  check('...and my finished board stops taking taps',
    await page.evaluate(() => getComputedStyle(document.querySelector('.cell .hit')).pointerEvents) === 'none');
  check('...while the pinch survives the lock',
    await page.evaluate(() => { const s = getComputedStyle(document.getElementById('stage')); return s.pointerEvents !== 'none' && s.touchAction === 'none'; }));
  check('...and the round is NOT called early',
    await page.evaluate(() => document.getElementById('flash').hidden) === true);
  check('...and the button is still New board',
    (await page.innerText('#again')).trim() === 'New board', await page.innerText('#again'));

  // Bo turns in a worse board, Cy loses the cat: the round can be scored.
  await page.evaluate(() => {
    window.__seats.bo.update({ clicks: 15, status: 'win' });
    window.__seats.cy.update({ clicks: 20, status: 'lose' });
  });
  await page.waitForTimeout(300);

  const flash = await page.evaluate(() => document.getElementById('flash').textContent);
  check('the winner is told, over the board', /yours/i.test(flash) && flash.indexOf(myTaps) >= 0, { flash, myTaps });
  check('...and in the status line', /take[s]? round 1/i.test(await page.innerText('#status')), await page.innerText('#status'));
  check('...and the button asks for the next round', (await page.innerText('#again')).trim() === 'Next round');
  check('the win lands in my column', (await rowText('Ana')).indexOf('1') >= 0 && (await rowText('Ana')).indexOf(myTaps) >= 0, await rowText('Ana'));
  check('the escaped cat is named, not scored', (await rowText('Cy')).indexOf('got away') >= 0, await rowText('Cy'));
  check('the round head says it is over', (await roster()).toLowerCase().indexOf('over') >= 0, await roster());

  // Next round: everyone jumps to a new shared board.
  const before = await page.evaluate(() => window.CTCNet.round().seed);
  await page.click('#again');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.CTCNet.round());
  check('Next round deals a new board', after.seed !== before, { before, after: after.seed });
  check('...and numbers it', after.n === 2, after);
  check('...and clears the verdict', await page.evaluate(() => document.getElementById('flash').hidden) === true);
  check('...and gives the board back', await page.evaluate(() => getComputedStyle(document.querySelector('.cell .hit')).pointerEvents) !== 'none');
  check('...and the series carries over', (await rowText('Ana')).indexOf('1') >= 0 && (await rowText('Bo')).indexOf('2') >= 0,
    { ana: await rowText('Ana'), bo: await rowText('Bo') });
  check('...while this board starts blank', (await rowText('Ana')).indexOf('0 taps') >= 0, await rowText('Ana'));

  // A name is somebody else's text.
  await page.evaluate(() => window.__seats.bo.update({ name: '<img src=x onerror="window.__pwned=1">' }));
  await page.waitForTimeout(200);
  check('a player name cannot inject markup',
    await page.evaluate(() => !window.__pwned && document.querySelectorAll('#roster img').length === 0));
  check('...and is shown as the text it is',
    (await roster()).indexOf('<img src=x') >= 0, await roster());

  check('no page errors along the way', errs.length === 0, errs);

  await browser.close();
  srv.close();
  console.log(failures ? '\nFAIL ' + failures : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
