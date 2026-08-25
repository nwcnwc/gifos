// CATCH THE CAT: TWO REAL CLIENTS, BOTH ROOM MODES, ON THE SHIPPED APP.
//
// test/unit/catch-the-cat.js pins the SCORING rule by running net.js twice in
// one node process. That is the right test for arithmetic and the wrong test
// for a game: it never loads index.html, never boots the engine, never places
// a wall and never asks whether the two screens are looking at the same board.
// Everything 1.2.0 added lives in that gap — a shared board in co-op, a cat per
// player, walls that cross between them, and a verdict that is the ROOM's and
// not one player's.
//
// So this drives two real copies of the app, in two same-origin iframes, over
// one fake gifos.db shared through window.top. That is the same shape the real
// runtime gives an app (one collection, a subscribe callback, put() for your
// own row) and it is the only way to catch the failures that matter here:
//
//   1. RACE: the same seed must lay the same walls on both screens. If it does
//      not, "fewest taps takes it" is comparing two different games.
//   2. CO-OP: a wall placed by one player must appear on the other's board, and
//      must be able to pen the OTHER player's cat. If walls do not cross, the
//      mode is two solo games sharing a scoreboard.
//   3. CO-OP: a player's cat is theirs alone. Only their taps move it, and
//      every other screen draws it where THEY said it is. Nobody simulates
//      anybody else's cat, because two clients that saw walls land in a
//      different order would then disagree about where a cat is standing.
//   4. CO-OP: one escape loses the round for the room, at once, on both
//      screens — it does not wait for the other cats to be penned, because
//      that verdict is already decided.
//
// The CLEAR half of the co-op verdict is not here, deliberately. Penning a cat
// is the game — a cat with a free neighbour always takes it, so there is no
// short scripted line that wins, and a drill that tried to play well enough
// would be testing its own heuristic. That verdict is arithmetic over rows, so
// test/unit/catch-the-cat.js drives it directly on two real net.js clients.
//
// The board is deliberately driven through rules.js rather than through
// synthesised taps: where a hex lands on a rotated 3D plate is view.js's
// business and e2e-catch-the-cat-view.js's problem, not this suite's.
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

// The harness page: two copies of the app, side by side, same origin.
const HARNESS = `<!doctype html><meta charset="utf-8"><title>room</title>
<style>html,body{margin:0;height:100%;display:flex}iframe{flex:1;height:100%;border:0}</style>
<iframe id="a" src="/index.html?who=a"></iframe>
<iframe id="b" src="/index.html?who=b"></iframe>`;

// One collection, shared by both frames, notified synchronously — tighter than
// the real db, which only makes the interleaving harder than reality.
const FAKE_GIFOS = `(() => {
  const top = window.top;
  if (!top.__ROOM) {
    top.__ROOM = { rows: new Map(), subs: [], puts: [] };
  }
  const room = top.__ROOM;
  const who = new URLSearchParams(location.search).get('who');
  if (!who) return;                       // the harness page itself
  const snap = () => [...room.rows.values()].map((r) => JSON.parse(JSON.stringify(r)));
  window.gifos = {
    me: () => Promise.resolve({ id: who, name: who === 'a' ? 'Ana' : 'Bo' }),
    db: () => ({
      put(rec) { room.puts.push({ by: who, wrote: rec.id }); room.rows.set(rec.id, JSON.parse(JSON.stringify(rec)));
                 room.subs.slice().forEach((cb) => cb(snap())); return Promise.resolve(rec); },
      getAll() { return Promise.resolve(snap()); },
      subscribe(cb) { room.subs.push(cb); cb(snap()); },
    }),
  };
})();`;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const rel = url.pathname === '/' ? '/harness.html' : url.pathname;
      if (rel === '/harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(HARNESS); return; }
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.join(APP, rel);
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('crash', () => errors.push('RENDERER CRASHED'));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(FAKE_GIFOS);
  await page.goto('http://127.0.0.1:' + port + '/harness.html', { waitUntil: 'load' });

  const A = () => page.frame({ url: /who=a/ });
  const B = () => page.frame({ url: /who=b/ });
  const ready = async (f) => f.waitForFunction(() => window.GifCat && window.GifCat.rules && window.GifCat.rules.cats().length > 0, null, { timeout: 20000 });
  await ready(A()); await ready(B());
  await sleep(3200);   // net.js settles its first round after the 2.5s guard

  const walls = (f) => f.evaluate(() => {
    const R = window.GifCat.rules, E = window.GifCat.engine, out = [];
    for (let i = 0; i < E.w; i++) for (let j = 0; j < E.h; j++) if (R.isWall(i, j)) out.push(i * 100 + j);
    return out.sort((x, y) => x - y);
  });
  const cats = (f) => f.evaluate(() => window.GifCat.rules.cats().map((c) => ({ id: c.id, i: c.i, j: c.j, state: c.state })).sort((x, y) => (x.id < y.id ? -1 : 1)));
  const mode = (f) => f.evaluate(() => window.CTCNet.mode());
  const seed = (f) => f.evaluate(() => window.CTCNet.round().seed);
  const tap = (f, i, j) => f.evaluate(([i, j]) => {
    const r = window.GifCat.rules.tap(i, j);
    // the shell does this for a real tap; drive it the same way
    window.GifCat.view.setWalls(window.GifCat.rules.isWall);
    window.GifCat.view.setCats(window.GifCat.rules.cats());
    window.__push();
    return r;
  }, [i, j]);

  // The shell keeps push() private. Expose it the same way the tap handler
  // uses it, so this suite drives the real publish path and not a copy of it.
  const expose = (f) => f.evaluate(() => {
    if (window.__push) return;
    window.__push = () => {
      const R = window.GifCat.rules;
      if (R.mode() === 'coop') {
        const c = R.myCat();
        window.CTCNet.reportCoop({ clicks: R.clicks(), walls: R.walls(), i: c.i, j: c.j, dir: c.dir, state: R.state(), seat: R.seat() });
      } else {
        const st = R.state();
        window.CTCNet.report(R.clicks(), st === 'caught' ? 'win' : st === 'gone' ? 'lose' : 'playing');
      }
    };
  });
  await expose(A()); await expose(B());

  // ------------------------------------------------------------------- race
  check('both clients landed in the same room, on a race', await mode(A()) === 'race' && await mode(B()) === 'race',
    [await mode(A()), await mode(B())]);
  check('...on the same seed', await seed(A()) === await seed(B()), [await seed(A()), await seed(B())]);
  const wa = await walls(A()), wb = await walls(B());
  check('...and the same seed laid the same walls', JSON.stringify(wa) === JSON.stringify(wb), { a: wa, b: wb });
  check('...with one cat each, at the centre', (await cats(A())).length === 1 && (await cats(B())).length === 1);

  // A race board is PRIVATE. Ana's wall must not appear on Bo's board.
  const free = await A().evaluate(() => {
    const R = window.GifCat.rules, E = window.GifCat.engine, me = R.cats()[0];
    for (let i = 1; i < E.w - 1; i++) for (let j = 1; j < E.h - 1; j++) {
      if (!R.isWall(i, j) && !(i === me.i && j === me.j)) return [i, j];
    }
  });
  await tap(A(), free[0], free[1]);
  await sleep(250);
  check('a race board is private — your wall is not on my board',
    !(await B().evaluate(([i, j]) => window.GifCat.rules.isWall(i, j), free)), free);

  // ------------------------------------------------------------------ co-op
  await A().evaluate(() => window.CTCNet.startRound(0x5eed, 'coop'));
  await sleep(900);
  check('either player can put the room into co-op', await mode(A()) === 'coop' && await mode(B()) === 'coop',
    [await mode(A()), await mode(B())]);
  const ca = await cats(A()), cb = await cats(B());
  check('co-op puts a cat on the board for every player', ca.length === 2 && cb.length === 2, { a: ca, b: cb });
  check('...and both screens agree where they are', JSON.stringify(ca) === JSON.stringify(cb), { a: ca, b: cb });
  check('...on different seats', ca[0].i !== ca[1].i || ca[0].j !== ca[1].j, ca);
  const cwa = await walls(A()), cwb = await walls(B());
  check('...and on the same shared board', JSON.stringify(cwa) === JSON.stringify(cwb), { a: cwa, b: cwb });

  // A co-op wall is EVERYONE'S. Ana taps; Bo's board must carry it.
  const spot = await A().evaluate(() => {
    const R = window.GifCat.rules, E = window.GifCat.engine;
    const cs = R.cats();
    for (let i = 1; i < E.w - 1; i++) for (let j = 1; j < E.h - 1; j++) {
      if (R.isWall(i, j)) continue;
      if (cs.some((c) => c.i === i && c.j === j)) continue;
      return [i, j];
    }
  });
  const before = await cats(B());
  await tap(A(), spot[0], spot[1]);
  await sleep(400);
  check('a co-op wall lands on everybody\'s board',
    await B().evaluate(([i, j]) => window.GifCat.rules.isWall(i, j), spot), spot);
  const after = await cats(B());
  const mineMoved = after.find((c) => c.id === 'a');
  const yoursMoved = after.find((c) => c.id === 'b');
  const yoursWas = before.find((c) => c.id === 'b');
  check('...and moves only the cat of whoever tapped',
    yoursMoved.i === yoursWas.i && yoursMoved.j === yoursWas.j, { was: yoursWas, now: yoursMoved });
  check('...which every other screen sees move',
    mineMoved.i === (await cats(A())).find((c) => c.id === 'a').i, { onB: mineMoved, onA: (await cats(A())).find((c) => c.id === 'a') });

  // Nobody wrote anybody else's row, in either mode.
  const puts = await page.evaluate(() => window.__ROOM.puts);
  check('nobody wrote anybody else\'s row', puts.every((p) => p.by === p.wrote), puts.filter((p) => p.by !== p.wrote));

  // ------------------------------------------- one escape loses it for the room
  await B().evaluate(() => window.CTCNet.startRound(0x1234, 'coop'));
  await sleep(900);
  // Watch the verdict on BOTH screens. net.js exposes onResult as a setter, so
  // this replaces the shell's handler — which is the point: the claim is that
  // net.js reaches the same verdict independently in each client.
  for (const f of [A(), B()]) {
    await f.evaluate(() => {
      window.__results = [];
      window.CTCNet.onResult = (r) => { window.__results.push(r); };
    });
  }
  // Drive Ana's cat to the rim by walling behind it until it escapes.
  await A().evaluate(async () => {
    const R = window.GifCat.rules, E = window.GifCat.engine;
    for (let n = 0; n < 40 && R.state() === 'chasing'; n++) {
      const me = R.myCat();
      // wall the hex the cat just came from-ish: pick any free neighbour that
      // is not the way out, so the solver keeps running for the rim.
      const nbs = E.neighbours(me.i, me.j).filter((b) => E.inside(b.i, b.j) && !R.isWall(b.i, b.j));
      if (!nbs.length) break;
      const pick = nbs[nbs.length - 1];
      R.tap(pick.i, pick.j);
      window.__push();
      await new Promise((r) => setTimeout(r, 30));
    }
    return R.state();
  });
  await sleep(800);
  const stA = await A().evaluate(() => window.GifCat.rules.state());
  const rA = await A().evaluate(() => window.__results);
  const rB = await B().evaluate(() => window.__results);
  if (stA === 'gone') {
    check('one cat out loses the round for the room, at once', rA.length === 1 && rA[0].cleared === false, rA);
    check('...and says so on the other screen too', rB.length === 1 && rB[0].cleared === false, rB);
    check('...without waiting for the other cat to be penned',
      rB.length === 1 && (await cats(B())).some((c) => c.state === 'chasing'), await cats(B()));
  } else {
    check('the drill drove a cat to the rim (it was penned instead — not a product red)', false, { stA });
  }

  check('no page errors in either client', errors.length === 0, errors);

  await browser.close();
  srv.close();
  console.log(failures ? '\nFAIL ' + failures : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
