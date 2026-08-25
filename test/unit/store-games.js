// THE STORE'S HAND-WRITTEN GAMES, HELD TO THE BUGS THAT ACTUALLY SHIPPED.
//
// After Eagle Defense shipped with every tank frozen, every store app whose game
// logic is GifOS-authored (not vendored upstream) was audited by PLAYING it
// headless. This suite pins each core-play bug that audit confirmed, replayed
// through the SHIPPED source in a vm — so none of them can come back:
//
//   snake         first keypress in the reverse direction was instant death
//   tanks         a hit claim re-applied every 12s until the victim died
//   one-stroke    two host deadlocks (round window after a skip; vote forever)
//   thumb-sprint  the ghost's best-run samples never reach the tape
//   hex-chess     end-of-game detection probed with en passant stripped
//
// Each block loads only what it needs, the way the GIF runs it. Everything is
// deterministic: fake clocks where the code reads Date.now, no dice anywhere
// on these paths. DOM-bound halves that a vm cannot run are pinned by source
// scan, clearly marked — a line that must stay is better guarded by a grep
// than by a browser suite that cannot launch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = (slug, f) => path.join(ROOT, 'apps', slug, f);

let failures = 0;
const MAIN = [];   // async blocks queue here; run in order at the bottom
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load(files, globals) {
  const sandbox = Object.assign({
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
  }, globals || {});
  sandbox.globalThis = sandbox;
  if (!('window' in sandbox)) sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
  return sandbox;
}

// ---- snake: a reversed first press is a nudge, never a death -----------------
// The original allowed a 180 on the first key of a life — safe upstream where
// the snake spawns as ONE cell, lethal here where it spawns as four: the head
// stepped straight into body[1] before anything had moved.
{
  const G = load([APP('snake', 'game.js')]).SnakeGame;
  check('snake: game.js loads', !!(G && G.freshSnake && G.setDir && G.stepSnake));
  if (G) {
    // Direction constants come from the module itself, never guessed.
    const oppOf = (d) => (d === G.UP ? G.DOWN : d === G.DOWN ? G.UP : d === G.LEFT ? G.RIGHT : G.LEFT);
    let anyDied = false, anyStuck = false;
    for (let i = 0; i < 4; i++) {
      const sp = G.spawn(i);
      const s = G.freshSnake(sp.x, sp.y, sp.d);
      const x0 = s.x, y0 = s.y;
      G.setDir(s, oppOf(sp.d));
      const r = G.stepSnake(s, [s], null);
      if (r && r.died) anyDied = true;
      if (s.x === x0 && s.y === y0) anyStuck = true;
    }
    check('snake: the reverse press kills at NO spawn', !anyDied);
    check('snake: …and still starts the run (a nudge, not a swallowed key)', !anyStuck);
    // The refusal must still hold mid-run: a 180 with a body behind you is death,
    // so it stays refused rather than becoming legal.
    const s = G.freshSnake(10, 5, G.RIGHT);
    G.setDir(s, G.RIGHT); G.stepSnake(s, [s], null);
    G.setDir(s, G.LEFT);
    const r = G.stepSnake(s, [s], null);
    check('snake: a mid-run 180 is still refused (keeps going right)', !r.died && s.direction !== G.LEFT ? s.x > 10 : s.x > 10, { x: s.x, died: r.died });
  }
}

// ---- tanks: one bullet is one application of damage, forever -----------------
// The claim dedup was pruned on a 12s clock while the shooter's row republishes
// its hit ring at 8 Hz forever: every hit re-applied at +12s and +24s, so any
// single hit killed within ~24s. A claim may be forgotten only when the
// shooter's row no longer carries it.
{
  let fakeTime = 100000;
  let subCb = null;
  const fakeApi = {
    db: () => ({
      subscribe: (cb) => { subCb = cb; },
      put: () => Promise.resolve(),
    }),
    me: () => Promise.resolve({ id: 'me1', name: 'Alice' }),
  };
  const sandbox = load([APP('tanks', 'net.js')], {
    Date: { now: () => fakeTime },
    setTimeout: (fn) => { fn(); return 0; },
    gifos: fakeApi,
  });
  const Net = sandbox.TanksNet;
  check('tanks: net.js loads', !!(Net && Net.init && Net.onHit));
  if (Net) {
    const hits = [];
    let alive = true, lives = 3;
    Net.onHit((d, id) => {
      hits.push(fakeTime);
      if (!alive) return;
      lives -= d;
      Net.tookHit(d, id, 'Bob');
      if (lives <= 0) alive = false;
    });
    const row = (t) => ({
      id: 'S', name: 'Bob', x: 300, y: 300, rot: 0, tur: 0,
      alive: true, lives: 3, k: 0, d: 0, sp: 0, t,
      hits: [{ n: 1, to: 'me1', d: 1, sp: 0 }], shots: [], lastKilledBy: null,
    });
    MAIN.push(async () => {
      await Net.init(); /* resolves on the microtask queue — must be awaited */
      check('tanks: harness init settled (subscription registered)', !!subCb);
      Net.tick(100, 100, 0, 0);
      const T0 = fakeTime;
      while (fakeTime < T0 + 40000) {
        fakeTime += 125;
        subCb([row(fakeTime)]);
        Net.tick(100, 100, 0, 0);
        if (!alive && fakeTime - hits[hits.length - 1] > 2200) { alive = true; lives = 3; Net.respawn(60, 60); }
      }
      check('tanks: ONE claimed hit applies exactly once across 40s of republished rows',
        hits.length === 1, { applications: hits.length });
      // And the ring going away releases the dedup entry (memory does not grow
      // per bullet forever): a NEW claim from the same shooter still lands.
      subCb([Object.assign(row(fakeTime), { hits: [] })]);
      fakeTime += 125;
      subCb([Object.assign(row(fakeTime), { hits: [{ n: 2, to: 'me1', d: 1, sp: 0 }] })]);
      check('tanks: a genuinely new claim from the same shooter still applies',
        hits.length === 2, { applications: hits.length });
    });
  }
}

// ---- one-stroke: no host path may strand the room ----------------------------
{
  const OS = load([APP('one-stroke', 'game.js')]).OS;
  check('one-stroke: game.js loads', !!(OS && OS.fresh && OS.applyIntent && OS.settleVotes));
  if (OS) {
    const PTS = [{ x: 10, y: 10 }, { x: 60, y: 40 }, { x: 120, y: 80 }];
    const stroke = (pic) => ({ kind: 'stroke', seq: pic.seq, pts: PTS, c: OS.COLORS[0], w: OS.WIDTHS[0] });

    // The shipped deadlock: draw, draw, skip the absent third, vote, "Another
    // round" — the modulo round-window then found the actor's own OLD stroke
    // and the host refused every stroke from the player whose turn it was.
    let pic = OS.fresh(['A', 'B', 'C'], { host: 'A' });
    pic = OS.applyIntent(pic, 'A', stroke(pic));
    pic = OS.applyIntent(pic, 'B', stroke(pic));
    pic = OS.skipAbsent(pic, { A: 1, B: 1 });
    check('one-stroke: skipping the absent seat ends the round', pic && pic.phase === 'vote', pic && pic.phase);
    pic = OS.applyIntent(pic, 'A', { kind: 'vote', seq: pic.seq, title: 'Cat' });
    pic = OS.applyIntent(pic, 'B', { kind: 'vote', seq: pic.seq, title: 'Cat' });
    pic = OS.settleVotes(pic, { A: 1, B: 1 });
    check('one-stroke: the vote settles without the seat that left', pic && pic.phase === 'play', pic && pic.phase);
    pic = OS.applyIntent(pic, 'A', { kind: 'again', seq: pic.seq });
    check('one-stroke: another round starts', pic && pic.phase === 'draw' && OS.actorOf(pic) === 'A');
    const drew = OS.drewThisRound(pic, 'A');
    const after = OS.applyIntent(pic, 'A', stroke(pic));
    check('one-stroke: the actor can DRAW in round 2 after a skipped round (the deadlock)',
      !drew && !!after, { drewThisRound: drew, applied: !!after });

    // settleVotes must not jump a vote a live seat still owes.
    let p2 = OS.fresh(['A', 'B'], { host: 'A' });
    p2 = OS.applyIntent(p2, 'A', stroke(p2));
    p2 = OS.applyIntent(p2, 'B', stroke(p2));
    check('one-stroke: two live seats reach the vote', p2 && p2.phase === 'vote', p2 && p2.phase);
    p2 = OS.applyIntent(p2, 'A', { kind: 'vote', seq: p2.seq, title: 'Dog' });
    check('one-stroke: settleVotes refuses while a LIVE seat still owes a vote',
      OS.settleVotes(p2, { A: 1, B: 1 }) === null);
    check('one-stroke: …and refuses when nobody voted at all',
      OS.settleVotes(Object.assign({}, p2, { votes: {} }), { A: 1 }) === null);
  }
}

// ---- thumb-sprint: the recorded best must be able to finish ------------------
// Sampling stopped the instant a run finished, so no best ever contained a 100
// and the replayed ghost stalled one step short of the tape forever.
{
  const T = load([APP('thumb-sprint', 'race.js')]).ThumbSprint;
  check('thumb-sprint: race.js loads', !!(T && T.freshLane && T.tap && T.ghostAt && T.samplePush));
  if (T) {
    // Record a run the way the FIXED app.js does: sample while unfinished,
    // then one final sample at the tape.
    const startAt = 1000, samples = [];
    let lane = T.freshLane('me', 'Me'), t = startAt, finishedAt = 0;
    while (!finishedAt && t < startAt + 30000) {
      t += 50;
      lane = T.tap(lane, { startAt }, t);
      if (!lane.finishedAt) T.samplePush(samples, startAt, t, lane.position || 0, T.SAMPLE_MS);
      else finishedAt = lane.finishedAt;
    }
    if (finishedAt && samples.length && samples[samples.length - 1] < T.FINISH) {
      T.samplePush(samples, startAt, finishedAt, T.FINISH, T.SAMPLE_MS);
      samples[samples.length - 1] = T.FINISH;
    }
    let maxPos = 0;
    for (let r = startAt; r < finishedAt + 5000; r += 50) maxPos = Math.max(maxPos, T.ghostAt(samples, startAt, r, T.SAMPLE_MS));
    check('thumb-sprint: a recorded best replays all the way to the tape',
      maxPos >= T.FINISH, { maxPos });

    // The app-side halves are DOM-bound; pin the two lines that make old and
    // new saves finish. Source scans, marked as such:
    const src = fs.readFileSync(APP('thumb-sprint', 'app.js'), 'utf8');
    check('thumb-sprint: [source] the ghost lane finishes on its recorded TIME',
      /t >= S\.race\.startAt \+ S\.best\.timeMs/.test(src));
    check('thumb-sprint: [source] the finish sample is recorded at the tape',
      /S\.samples\[S\.samples\.length - 1\] = T\.FINISH/.test(src));
  }
}

// ---- hex-chess: the game may not end while en passant is playable ------------
{
  const C = load([APP('hex-chess', 'board.js')], { window: undefined }).HEX;
  check('hex-chess: board.js loads', !!(C && C.play && C.legalMoves && C.key && C.pack));
  if (C) {
    // The audited position: black's ONLY reply to white's double step is the
    // ep capture. outcome() used to probe with ep stripped and called this
    // stalemate — scored, per Glinski, as a WIN for the mover.
    const p = {};
    const put = (q, r, color, t) => { p[C.key(q, r)] = C.pack(color, t); };
    put(5, -5, C.BLACK, C.KING);
    put(5, -4, C.BLACK, C.P);
    put(4, -5, C.BLACK, C.P);
    put(4, -4, C.BLACK, C.P);
    put(3, -5, C.BLACK, C.P);
    put(3, -4, C.BLACK, C.P);
    put(4, -3, C.BLACK, C.P);
    put(0, 0, C.BLACK, C.P);      // f6 — the ep capturer
    put(0, -1, C.WHITE, C.P);     // f5 blocker
    put(-1, -1, C.WHITE, C.P);    // e4 — about to double-step
    put(-5, 0, C.WHITE, C.KING);
    const s = { pieces: p, turn: C.WHITE, ep: null, winner: null, result: '', check: false, n: 0, last: null };
    const noEp = C.legalMoves({ pieces: p, turn: C.BLACK, ep: null, winner: null });
    check('hex-chess: construction — black has zero moves WITHOUT ep', noEp.length === 0, noEp.length);
    const ns = C.play(s, -1, -1, -1, 1, 0); // e4 double step
    check('hex-chess: the double step applies', !!ns);
    if (ns) {
      const withEp = C.legalMoves({ pieces: ns.pieces, turn: C.BLACK, ep: ns.ep, winner: null });
      check('hex-chess: construction — black has exactly the ep capture', withEp.length === 1 && !!withEp[0].ep);
      check('hex-chess: the game does NOT end while the ep capture is playable',
        !ns.winner, { winner: ns.winner, result: ns.result });
    }
  }
}

// ---- longwave: the satisfied deal intent is idempotent -----------------------
// DOM-bound host reconcile; pin the guard by source. Without it the host
// re-put an identical board row on every subscription event from the deal
// until the clue — a continuous write loop.
{
  const src = fs.readFileSync(APP('longwave', 'app.js'), 'utf8');
  check('longwave: [source] the deal branch is guarded against re-applying itself',
    /if \(b\.dealt && b\.target === tgt && b\.cardIndex === \(intent\.cardIndex \| 0\)\) return;/.test(src));
}

// ---- air-hockey: the loader shim keeps its async contract --------------------
// hockey.js writes `var me = this` AFTER its loadModels() call; a synchronous
// onLoad reached modelsLoaded while `me` was undefined and the app shipped as
// a black table. The real proof is e2e-air-hockey; this pins the line.
{
  const src = fs.readFileSync(APP('air-hockey', 'boot.js'), 'utf8');
  check('air-hockey: [source] the model loader delivers asynchronously',
    /setTimeout\(function \(\) \{ onLoad\(object\); \}, 0\);/.test(src));
}

(async () => {
  for (const block of MAIN) await block();
  console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR: ' + (e && e.message)); process.exit(1); });
