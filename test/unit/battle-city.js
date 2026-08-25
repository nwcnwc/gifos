// EAGLE DEFENSE HAS TO ACTUALLY MOVE.
//
// The app shipped with every tank frozen to its spawn tile. `tryMove` tests a
// COPY of the mover and handed it to `canMove`, which skipped the mover with a
// reference compare (`o === tank`) — a compare the copy can never satisfy. So
// every tank found "another" tank parked on its own previous position and
// every move in the game was refused. The player turned on the spot, the bots
// sat in the top row, no stage could be cleared: unplayable from the first
// frame of stage 1, and nothing in the repo noticed, because apps/battle-city
// had no test at all. A game that cannot be finished by a machine is not
// something a human should be asked to check by hand.
//
// So this suite PLAYS it. game.js is a plain IIFE over `root`, and its whole
// simulation is deterministic given the inputs, so the sim runs headless in a
// vm at a fixed 16ms step — no browser, no servers, nothing to go stale. The
// browser-only half (input, layout) is checked by reading boot.js, because the
// rules it has to keep are one-liners and a dead browser suite is worse than a
// source scan that cannot lie about whether the line is there.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'battle-city');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// ---- load the shipped sim exactly as the GIF would run it -------------------
// The bot AI and the spawn picker roll dice, so an unseeded run is a suite
// that fails one time in five and gets called a flake. Hand the sandbox a
// fixed stream instead: same tape every run, on every box.
function seededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  m.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function load() {
  const sandbox = {
    console, Math: seededMath(0x5AFE), Object, Array, JSON, Date, String, Number, Boolean,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['stages.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const sandbox = load();
const BC = sandbox.BattleCity;
check('stages.js and game.js load and attach BattleCity',
  !!(BC && BC.create && BC.tick && BC.render));
check('all 35 stages are aboard', (sandbox.BC_STAGES || []).length === 35,
  (sandbox.BC_STAGES || []).length);

const IDLE = [{ dir: null, fire: false }, { dir: null, fire: false }];
const STEP = 16;
const hold = (dir, fire) => [{ dir: dir, fire: !!fire }, { dir: null, fire: false }];

// Run to the first playable frame: title -> start -> curtain -> play.
function fresh(two, stage) {
  const g = BC.create();
  BC.start(g, !!two, stage || 0);
  for (let i = 0; i < 200 && g.phase !== 'play'; i++) BC.tick(g, STEP, IDLE);
  return g;
}

// ---- the bug that shipped ---------------------------------------------------
// One second of held input has to put the tank somewhere else. 0.045 px/ms is
// ~43px in 60 frames; stage 1 leaves the player a clear lane up and to the
// left of the eagle, so assert a floor well under a full run rather than an
// exact number — this is "did it move at all", not a physics pin.
{
  const g = fresh(false, 0);
  check('the game reaches play', g.phase === 'play', g.phase);
  const p = g.players[0];
  const x0 = p.x, y0 = p.y;

  for (let i = 0; i < 60; i++) BC.tick(g, STEP, hold('left'));
  check('the player MOVES when a direction is held', p.x < x0 - 8,
    { from: x0, to: p.x, dir: p.direction });
  check('…and faces the way it went', p.direction === 'left', p.direction);

  const xl = p.x;
  for (let i = 0; i < 60; i++) BC.tick(g, STEP, hold('up'));
  check('…and squares up to the 8px grid when it turns', p.x === Math.round(xl / 8) * 8,
    { xl: xl, x: p.x });
}

// All four directions, on a board cleared of everything that could honestly
// block one — otherwise "it did not move" and "a brick was in the way" are the
// same result, which is how the frozen board read as a hard stage.
{
  for (const dir of ['up', 'down', 'left', 'right']) {
    const g = fresh(false, 0);
    g.map.bricks.fill(false);
    g.map.steels.fill(false);
    g.map.rivers.fill(false);
    g.map.eagle.broken = true;
    g.tanks = g.tanks.filter((t) => t.side === 'player');
    g.players = g.tanks.slice();
    const p = g.players[0];
    p.x = 96; p.y = 96;
    const x0 = p.x, y0 = p.y;
    for (let i = 0; i < 40; i++) BC.tick(g, STEP, hold(dir));
    const d = { up: y0 - p.y, down: p.y - y0, left: x0 - p.x, right: p.x - x0 }[dir];
    check('a clear board lets the tank drive ' + dir, d > 8, { moved: d, x: p.x, y: p.y });
  }
}

// A tank blocking ITSELF is the exact failure, so pin it directly: one tank
// alone on the board, nothing near it, must be able to take a step.
{
  const g = fresh(false, 0);
  g.tanks = g.tanks.filter((t) => t.side === 'player');
  g.players = g.tanks.slice();
  const p = g.players[0];
  const x0 = p.x;
  for (let i = 0; i < 20; i++) BC.tick(g, STEP, hold('left'));
  check('a tank alone on the board does not block itself', p.x < x0,
    { from: x0, to: p.x });
}

// The bots run through the same tryMove/canMove pair, so they froze too.
{
  const g = fresh(false, 0);
  const start = g.tanks.filter((t) => t.side === 'bot').map((t) => ({ id: t.id, x: t.x, y: t.y }));
  check('bots spawn', start.length > 0, start.length);
  for (let i = 0; i < 180; i++) BC.tick(g, STEP, IDLE);
  const moved = start.filter((s) => {
    const t = g.tanks.filter((k) => k.id === s.id)[0];
    return t && (t.x !== s.x || t.y !== s.y);
  });
  check('the bots leave their spawn tiles', moved.length === start.length,
    { spawned: start.length, moved: moved.length });
}

// ---- the rest of the loop, so "playable" means finishable --------------------
{
  // Build the shot rather than hoping for one: bots roam, and "the bullet hit
  // a tank instead" and "the gun does nothing" look identical from the outside.
  const g = fresh(false, 0);
  g.tanks = g.tanks.filter((t) => t.side === 'player');
  g.players = g.tanks.slice();
  const p = g.players[0];
  p.x = 64; p.y = 96; p.direction = 'up'; p.cooldown = 0;
  g.map.bricks.fill(false);
  for (let c = 16; c < 20; c++) g.map.bricks[22 * 52 + c] = true; /* a wall right above the gun */
  const bricks = () => g.map.bricks.filter(Boolean).length;
  const before = bricks();
  check('the wall is standing before the shot', before === 4, before);
  for (let i = 0; i < 30; i++) BC.tick(g, STEP, hold('up', i === 0));
  check('a player bullet eats brick', bricks() < before, { before: before, after: bricks() });

  // A held trigger is one shot per cooldown, not one per frame.
  p.x = 64; p.y = 96; p.direction = 'up'; p.cooldown = 0;
  g.bullets = [];
  for (let i = 0; i < 10; i++) BC.tick(g, STEP, hold(null, true));
  check('firing is on a cooldown, not one bullet per frame',
    g.bullets.filter((b) => b.owner === p.id).length === 1,
    g.bullets.length);
}

{
  // Clear the board and the next stage has to load, or the game is 20 tanks long.
  const g = fresh(false, 0);
  g.remain = [];
  g.tanks.filter((t) => t.side === 'bot').forEach((t) => { t.alive = false; });
  for (let i = 0; i < 200; i++) BC.tick(g, STEP, IDLE);
  check('clearing the stage advances to the next one', g.stageIndex === 1,
    { stage: g.stageIndex, phase: g.phase });
}

{
  // Dying costs a life and gives one back; running out ends the run.
  const g = fresh(false, 0);
  const lives0 = g.players[0].lives;
  for (let death = 0; death < 3; death++) {
    const p = g.players[0];
    p.helmet = 0; p.alive = false; p.visible = false;
    for (let i = 0; i < 200; i++) BC.tick(g, STEP, IDLE);
  }
  check('a death costs a life', g.players[0].lives < lives0,
    { before: lives0, after: g.players[0].lives });
  check('the last life ends the run', g.phase === 'over', g.phase);
}

{
  // The eagle is the whole point. Losing it ends the run immediately.
  const g = fresh(false, 0);
  const e = g.map.eagle;
  g.map.bricks.fill(false); /* the base's own wall would eat the shot first */
  g.bullets.push({
    id: 'x1', owner: 'nobody', side: 'bot', x: e.x + 6, y: e.y - 12,
    direction: 'down', speed: 0.12, power: 1,
  });
  for (let i = 0; i < 60 && g.phase === 'play'; i++) BC.tick(g, STEP, IDLE);
  check('a bullet into the eagle ends the run', g.phase === 'over' && g.map.eagle.broken,
    { phase: g.phase, broken: g.map.eagle.broken });
}

{
  // Every prize has to do its one thing; a dud powerup is a silent tax.
  const g = fresh(false, 0);
  const p = g.players[0];
  const takes = (kind) => { g.pup = { x: p.x, y: p.y, kind: kind, blink: 0 }; BC.tick(g, STEP, IDLE); return g.pup === null; };

  const lives = p.lives;
  check('tank: an extra life', takes('tank') && p.lives === lives + 1);
  check('star: the gun goes up a level', takes('star') && p.level !== 'basic', p.level);
  check('grenade: the board is cleared of bots',
    takes('grenade') && g.tanks.filter((t) => t.side === 'bot' && t.alive).length === 0);
  check('timer: the bots freeze', takes('timer') && g.frozenBots > 0, g.frozenBots);
  check('helmet: a shield', takes('helmet') && p.helmet > 1000, p.helmet);
  const steelsBefore = g.map.steels.filter(Boolean).length;
  check('shovel: the base gets steel walls',
    takes('shovel') && g.map.steels.filter(Boolean).length > steelsBefore,
    { before: steelsBefore, after: g.map.steels.filter(Boolean).length });
}

// ---- two devices: the guest's tank is the host's simulation ------------------
{
  const g = fresh(true, 0);
  check('2P puts two tanks on the board', g.players.length === 2, g.players.length);
  const p2 = g.players[1];
  const x0 = p2.x;
  for (let i = 0; i < 60; i++) {
    BC.tick(g, STEP, [{ dir: null, fire: false }, { dir: 'left', fire: false }]);
  }
  check('the guest tank moves on the guest keys the host relays', p2.x < x0,
    { from: x0, to: p2.x });

  // fireN is an edge counter, not a boolean: the host fires once per bump and
  // not once per frame, however long the guest's row sits there unchanged.
  // Clear the lane first. The guest is parked beside the base: on the real
  // board its shot hits the eagle's own brick two frames later, and with the
  // brick gone it hits the EAGLE and ends the run — neither is a missed fire.
  g.map.bricks.fill(false);
  g.map.steels.fill(false);
  g.tanks.filter((t) => t.side === 'bot').forEach((t) => { t.alive = false; });
  g.bullets = [];
  p2.x = 32; p2.y = 96; p2.direction = 'up'; p2.cooldown = 0;
  const mine = () => g.bullets.filter((b) => b.owner === p2.id).length;
  const n0 = mine();
  for (let i = 0; i < 10; i++) {
    BC.tick(g, STEP, [{ dir: null, fire: false }, { dir: null, fire: false, fireN: 1 }]);
  }
  check('a guest fireN bump fires exactly once', mine() === n0 + 1, { before: n0, after: mine() });
  for (let i = 0; i < 10; i++) {
    BC.tick(g, STEP, [{ dir: null, fire: false }, { dir: null, fire: false, fireN: 1 }]);
  }
  check('…and a stale row does not keep firing', mine() === n0 + 1, mine());
}

{
  // The guest paints what the host sends, so the snapshot has to survive the trip.
  const g = fresh(false, 0);
  for (let i = 0; i < 120; i++) BC.tick(g, STEP, hold('up', i % 30 === 0));
  const snap = BC.snapshot(g);
  const guest = BC.create();
  BC.applySnap(guest, snap);
  check('the world snapshot round-trips the walls',
    guest.map.bricks.filter(Boolean).length === g.map.bricks.filter(Boolean).length &&
    guest.map.steels.filter(Boolean).length === g.map.steels.filter(Boolean).length,
    { bricks: [g.map.bricks.filter(Boolean).length, guest.map.bricks.filter(Boolean).length] });
  check('…and the tanks', guest.tanks.length === g.tanks.filter((t) => t.alive).length,
    { host: g.tanks.filter((t) => t.alive).length, guest: guest.tanks.length });
  check('…and the phase and the enemy count',
    guest.phase === g.phase && guest.remainN === g.remain.length,
    { phase: guest.phase, remainN: guest.remainN, host: g.remain.length });
}

// ---- drawing: a throw in render() is a black screen --------------------------
{
  // A recording stub, not a mock with opinions: it only has to not be missing
  // anything render() reaches for, and to prove the field was painted.
  function stubCtx() {
    const calls = Object.create(null);
    const target = {};
    const ctx = new Proxy(target, {
      get(t, k) {
        if (k === 'canvas') return { width: 256, height: 240 };
        if (typeof k === 'symbol') return undefined;
        if (!(k in t)) t[k] = () => { calls[k] = (calls[k] || 0) + 1; };
        return t[k];
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx: ctx, calls: calls };
  }
  const phases = [];
  const g = BC.create();
  for (const step of ['title', 'stage', 'play', 'over', 'win']) {
    if (step === 'stage') BC.start(g, false, 0);
    if (step === 'play') { for (let i = 0; i < 200 && g.phase !== 'play'; i++) BC.tick(g, STEP, IDLE); }
    if (step === 'over' || step === 'win') g.phase = step;
    const s = stubCtx();
    let threw = null;
    try { BC.render(s.ctx, g); } catch (e) { threw = e.message; }
    phases.push({ step: step, threw: threw, painted: s.calls.fillRect || 0 });
  }
  check('render() survives every phase', phases.every((p) => !p.threw),
    phases.filter((p) => p.threw));
  check('…and paints something in each', phases.every((p) => p.painted > 0),
    phases.map((p) => p.step + ':' + p.painted));

  // The explosions used to be a stroked circle that grew past a whole tile and
  // spilled onto the border chrome. The field is clipped now; keep it clipped.
  const src = fs.readFileSync(path.join(APP, 'game.js'), 'utf8');
  check('the playfield is clipped so effects cannot paint over the chrome',
    /ctx\.clip\(\)/.test(src));
}

// ---- the shell: what a finger and a small screen need ------------------------
{
  const boot = fs.readFileSync(path.join(APP, 'boot.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');

  // A tap is shorter than a frame: press and release both land between two
  // ticks, and the tank never sees the direction at all. The pad and the menu
  // are both unusable without a minimum hold.
  check('a tapped direction is held past the release', /MIN_HOLD/.test(boot) && /holdUntil/.test(boot));

  // An integer-only scale threw away half a phone: 390x844 floors to 1x.
  check('the board is not scaled by whole steps only',
    !/Math\.floor\(Math\.min\(w \/ 256, h \/ 240\)\)/.test(boot) && /Math\.floor\(scale \* 4\) \/ 4/.test(boot));
  check('the pad gets its own strip, and the board is fitted above it',
    /padH/.test(boot) && /paddingBottom/.test(boot));

  // A 45%-black control on a black page is not a control.
  const btn = (css.match(/#touch button \{[\s\S]*?\}/) || [''])[0];
  check('the pad buttons have a visible rim', /border:\s*[1-9]/.test(btn), btn);

  // index.html must still load every script the shell needs, in order.
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  for (const f of ['stages.js', 'sound.js', 'game.js', 'net.js', 'boot.js']) {
    check('index.html loads ' + f, html.includes('src="' + f + '"'));
  }
}

console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
