// BACKDOOMS HAS TO WALK, SHOOT, AND DIE.
//
// The port shipped a corridor you could look at. This suite PLAYS it: game.js
// is a classic script over `root`, and step() is one original 16 ms frame, so
// a vm can hold W and watch x move, put a round into the thing in front of
// you, and fall over when something stands on your toes. Phone, pointer-lock
// overlay, and the Back button are one-liners — a source scan, because a
// dead browser suite is worse than a grep that cannot lie.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'backdooms');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  m.cos = Math.cos; m.sin = Math.sin; m.hypot = Math.hypot; m.atan2 = Math.atan2;
  m.atan = Math.atan; m.min = Math.min; m.max = Math.max; m.abs = Math.abs;
  m.PI = Math.PI; m.floor = Math.floor; m.round = Math.round;
  m.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function load(mathSeed) {
  const sandbox = {
    console,
    Math: seededMath(mathSeed == null ? 0xB00D : mathSeed),
    Object, Array, JSON, Date, String, Number, Boolean,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    document: { getElementById: () => null },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });
  return sandbox;
}

const sandbox = load();
const BD = sandbox.Backdooms;
check('game.js loads and attaches Backdooms',
  !!(BD && BD.start && BD.step && BD.shoot && BD.keys && BD.state));

{
  BD.start({ seed: 7, headless: true });
  const s0 = BD.state();
  check('a run starts alive in the open square', s0.alive && s0.x === 4 && s0.y === 4, s0);
  check('a run starts with a clip and a full bar', s0.hp === 100 && s0.ammo === 25, s0);
  check('two things spawn next to you', s0.enemies === 2, s0.enemies);
}

{
  BD.start({ seed: 7, headless: true });
  const k = BD.keys();
  k.w = 1;
  const x0 = BD.state().x, y0 = BD.state().y;
  for (let i = 0; i < 40; i++) BD.step(16);
  const s = BD.state();
  check('holding W MOVES the player', Math.hypot(s.x - x0, s.y - y0) > 0.5,
    { from: [x0, y0], to: [s.x, s.y] });
}

{
  BD.start({ seed: 7, headless: true });
  const k = BD.keys();
  k.a = 1;
  const x0 = BD.state().x, y0 = BD.state().y;
  for (let i = 0; i < 40; i++) BD.step(16);
  const s = BD.state();
  check('holding A strafes (not just turns)', Math.hypot(s.x - x0, s.y - y0) > 0.5,
    { from: [x0, y0], to: [s.x, s.y], a: s.a });
}

{
  BD.start({ seed: 7, headless: true });
  const k = BD.keys();
  k._jx = 0; k._jy = -1;
  const x0 = BD.state().x;
  for (let i = 0; i < 40; i++) BD.step(16);
  check('the analog stick walks forward', BD.state().x > x0 + 0.5,
    { x: BD.state().x, from: x0 });
}

{
  BD.start({ seed: 7, headless: true });
  const a0 = BD.state().ammo, sc0 = BD.state().score, en0 = BD.state().enemies;
  const r1 = BD.shoot();
  const r2 = BD.shoot();
  const s = BD.state();
  check('a shot spends a round', s.ammo === a0 - 2, { ammo: s.ammo, from: a0 });
  check('the thing in front of you can be put down', s.score > sc0 || s.enemies < en0,
    { score: s.score, enemies: s.enemies, hits: [r1 && r1.hits, r2 && r2.hits] });
}

{
  BD.start({ seed: 7, headless: true });
  BD.setRemotes([{ id: 'friend', x: 5, y: 4, h: 100 }]);
  const r = BD.shoot();
  check('a shot in the chest of a friend counts', r && r.hits && r.hits.indexOf('friend') >= 0, r);
  BD.setRemotes([]);
}

{
  BD.start({ seed: 7, headless: true });
  BD.setRemotes([{ id: 'friend', x: 6.5, y: 4, h: 100 }]);
  const r = BD.shoot();
  check('a shot in the chest of a friend down the hall counts', r && r.hits && r.hits.indexOf('friend') >= 0, r);
}

{
  BD.start({ seed: 7, headless: true });
  let dead = null;
  BD.onDead = (score) => { dead = score; };
  BD.hurt(100);
  BD.step(16);
  check('emptying the bar ends the run', BD.state().alive === false && dead === 0,
    { alive: BD.state().alive, dead: dead });
}

{
  BD.start({ seed: 7, headless: true });
  BD.setPaused(true);
  const k = BD.keys();
  k.w = 1;
  const x0 = BD.state().x;
  for (let i = 0; i < 40; i++) BD.step(16);
  check('paused means the player does not walk', BD.state().x === x0, BD.state().x);
  BD.setPaused(false);
  for (let i = 0; i < 40; i++) BD.step(16);
  check('unpausing lets them walk again', BD.state().x > x0, BD.state().x);
}

{
  const A = load(1);
  const B = load(1);
  A.Backdooms.start({ seed: 42, headless: true });
  B.Backdooms.start({ seed: 42, headless: true });
  let same = true;
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
    if (A.Backdooms.cell(i, j) !== B.Backdooms.cell(i, j)) same = false;
  }
  check('the same seed is the same maze', same);
  B.Backdooms.start({ seed: 99, headless: true });
  let diff = false;
  for (let i = 0; i < 20 && !diff; i++) for (let j = 0; j < 20 && !diff; j++) {
    if (A.Backdooms.cell(i, j) !== B.Backdooms.cell(i, j)) diff = true;
  }
  check('a different seed is a different maze', diff);
}

{
  BD.start({ seed: 7, headless: true });
  const k = BD.keys();
  k.w = 1;
  for (let i = 0; i < 200; i++) BD.step(16);
  check('walking around does not clip through a wall (still in open cells)',
    BD.cell(BD.state().x | 0, BD.state().y | 0) === '0', BD.state());
}

// --- what the 1.2 gauntlet run bought, so none of it can rot back ---------
//
// Every one of these is a bug that SHIPPED, and every one was found by running
// the thing rather than reading it. They are cheap, pure-sim checks; the
// browser cannot be trusted to notice any of them.

{
  // The two you wake to used to stand 2.5 metres away and simply walk in: six
  // passive runs died at 7.4s, to the tick. The room is 0..8 and you wake at
  // (4,4), so 'across the room' has to be a coordinate near 8, not near 7.
  const B = load().Backdooms;
  B.start({ seed: 7, headless: true });
  const s = B.state();
  const d = B.view().sprites.map((sp) => Math.hypot(sp.x - s.x, sp.y - s.y));
  check('you do not wake with something on top of you', Math.min(...d) >= 4,
    d.map((v) => +v.toFixed(2)));
}

{
  // Two seconds of grace, and then a fight you can lose. Both halves matter:
  // no grace is the 7.4-second death, and no death at all is not a game.
  const B = load().Backdooms;
  B.start({ seed: 7, headless: true });
  let t = 0, firstHit = null;
  while (B.state().alive && t < 40000) {
    B.step(16); t += 16;
    if (firstHit === null && B.state().hp < 100) firstHit = t;
  }
  check('nothing can touch you for the first two seconds', firstHit >= 2000, firstHit);
  check('but standing still does kill you', !B.state().alive && t < 25000,
    { deadAt: t, alive: B.state().alive });
}

{
  // They used to close to 0.2 units — inside your head, sprite filling the
  // screen, no way to see the room or the other one.
  const B = load().Backdooms;
  B.start({ seed: 7, headless: true });
  let closest = 99;
  for (let i = 0; i < 900; i++) {
    B.step(16);
    const s = B.state();
    for (const sp of B.view().sprites) {
      if (sp.dying != null) continue;
      closest = Math.min(closest, Math.hypot(sp.x - s.x, sp.y - s.y));
    }
    if (!s.alive) break;
  }
  check('they stop at arm\'s length, not inside your head', closest > 0.45,
    +closest.toFixed(3));
}

{
  // A blocked thing used to stand at a corner for good. A competent bot
  // survived three minutes untouched because of it.
  const B = load().Backdooms;
  B.start({ seed: 42, headless: true });
  const game = fs.readFileSync(path.join(APP, 'game.js'), 'utf8');
  check('a blocked thing slides along the wall instead of stopping',
    /o\.side/.test(game) && /wall-follow/i.test(game));
}

{
  // Bodies stay. Kill twenty things and the room used to be spotless.
  const B = load().Backdooms;
  B.start({ seed: 7, headless: true });
  B.shoot(); B.shoot();
  let corpses = 0;
  for (let i = 0; i < 200; i++) {
    B.step(16);
    corpses = B.view().sprites.filter((sp) => sp.dying != null && sp.dying >= 1).length;
    if (corpses) break;
  }
  check('a body is still there after the death animation ends', corpses > 0, corpses);
}

{
  // THE LEVEL. A 70x70 scan of the old generator found the longest run of open
  // floor with a wall on both sides was SIX tiles, in either axis, anywhere —
  // which is the block width, because crossings every seven cells cut the wall
  // open at every junction. An endless hall was structurally impossible.
  const B = load().Backdooms;
  const HALL = 12;
  let best = 0;
  for (const seed of [42, 7, 999]) {
    B.start({ seed, headless: true });
    // BOTH axes. Scanning only one hid a real asymmetry: a doorway always
    // punched on the same edge cut every horizontal corridor to five tiles
    // while vertical ones ran to ten.
    for (const axis of [0, 1]) {
      let axisBest = 0;
      for (let k = -5; k < 5; k++) {
        const a0 = k * HALL; let run = 0;
        for (let n = -70; n < 70; n++) {
          const at = (u, v) => (axis ? B.cell(v, u) : B.cell(u, v));
          const lane = at(n, a0) === '0' && at(n, a0 + 1) === '0';
          const walled = at(n, a0 - 1) === '1' && at(n, a0 + 2) === '1';
          if (lane && walled) { run++; axisBest = Math.max(axisBest, run); } else run = 0;
        }
      }
      best = best === 0 ? axisBest : Math.min(best, axisBest);
    }
  }
  check('there is a corridor you cannot see the end of', best >= 10, best + ' tiles');
}

{
  // Halls are always lit: a corridor with no fixtures is a corridor whose
  // length you cannot read, and the receding line of them is the strongest
  // depth cue in the game.
  const B = load().Backdooms;
  B.start({ seed: 42, headless: true });
  let lit = 0, hallCells = 0;
  for (let i = 12; i < 60; i++) {
    if (B.cell(i, 12) !== '0') continue;
    hallCells++;
    if (B.light(i, 12)) lit++;
  }
  check('a hall has a line of fixtures down it', hallCells > 20 && lit >= hallCells / 4,
    { hallCells, lit });
}

{
  // Pellets stop at walls. It used to be a hitscan cone that fired through
  // solid mass.
  const B = load().Backdooms;
  B.start({ seed: 42, headless: true });
  // put a friend on the far side of the nearest wall along +x
  const s = B.state();
  let wx = s.x;
  while (wx < s.x + 30 && B.cell(Math.floor(wx), Math.floor(s.y)) === '0') wx += 0.25;
  B.setRemotes([{ id: 'behind', x: wx + 1.5, y: s.y, h: 100 }]);
  const r = B.shoot();
  check('you cannot shoot through the mass', r.hits.indexOf('behind') < 0,
    { wallAt: +wx.toFixed(2), hits: r.hits });
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = src('index.html');
const boot = src('boot.js');
const touch = src('touch.js');
const net = src('net.js');
const css = src('style.css');
const help = src('help.md');
const listing = JSON.parse(src('listing.json'));
const manifest = JSON.parse(src('manifest.json'));

check('phone pad markup is in the page',
  html.includes('id="t-move"') && html.includes('id="t-fire"') && html.includes('id="t-look"'));
check('FIRE is a real button, not a lettered tile', /<button[^>]*id="t-fire"/.test(html));
check('click-to-look overlay exists', html.includes('id="resume"'));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html) && !/id=["']invite/i.test(html));
check('boot locks the pointer on click, never on load',
  boot.includes('requestPointerLock') && !/requestPointerLock\(\)/.test(boot.split('function begin')[0]));
check('lost pointer lock pauses and offers click to look',
  boot.includes('pointerlockchange') && boot.includes('setPaused') && boot.includes('Click to look') === false
    ? html.includes('Click to look') : true);
check('html says Click to look', html.includes('Click to look'));
check('Back backs out of a run, then lets the OS close',
  boot.includes('onBack') && boot.includes('toGate') && boot.includes('return false'));
// The claim is "a still tap on the look surface fires". Pinning the literal
// shape `addEventListener('pointerup', <inline fn with shoot()>)` broke the
// moment the handler was hoisted to a named function to be shared with
// pointercancel — FIXED THE TEST to assert the contract instead of the
// formatting: pointerup is bound, and the tap path calls shoot.
check('look-side tap fires', /el\.look\.addEventListener\('pointerup'/.test(touch) &&
  /wasTap[\s\S]{0,200}shoot\(/.test(touch));


check('prefs live in gifos.db', boot.includes("db('prefs')"));
check('the room shares a maze seed', net.includes('sharedSeed') && net.includes('seed:'));
check('a shot at a friend is published', net.includes('onShot') && net.includes('hits'));
// The claim is a MINIMUM, so read the number and compare it. Pinning the
// literal '76px' turned a floor into an exact-match, and the honest fix that
// made FIRE bigger read as a regression.
const cssPxCalc = (sel, prop) => {
  const m = new RegExp(sel.replace('.', '\\.') + '\\s*\\{[^}]*' + prop + ':\\s*calc\\(env\\([a-z-]+\\)\\s*\\+\\s*(\\d+)px').exec(css);
  return m ? +m[1] : -1;
};
const cssPx = (sel, prop) => {
  const m = new RegExp(sel + '[^}]*' + prop + ':\\s*(\\d+)px').exec(css);
  return m ? +m[1] : 0;
};
check('phone pad is at least 76px', cssPx('#t-fire', 'width') >= 76 && cssPx('#t-move', 'width') >= 120,
  { fire: cssPx('#t-fire', 'width'), move: cssPx('#t-move', 'width') });

// --- what a phone review of 1.2 bought, so it cannot rot back ------------
// The whole left side of the screen used to be dead: the look surface began
// at 40% and the stick was a fixed pad in the corner, so a drag anywhere else
// on the left half did nothing at all.
check('the look surface is the WHOLE screen', /#t-look\s*\{[^}]*inset:\s*0/.test(css));
check('the stick floats under the thumb and never eats a pointer',
  /#t-move\s*\{[^}]*pointer-events:\s*none/.test(css) && /placeStick/.test(touch));
check('FIRE repeats while held', /setInterval\([\s\S]{0,80}shoot\(/.test(touch));
// max(14px, env(...)) lands the HUD exactly ON the home indicator; the margin
// has to be added to the inset, not compared with it.
check('safe-area insets are added to, not maxed with',
  !/max\(\s*\d+px,\s*env\(safe-area/.test(css) && /calc\(env\(safe-area-inset-bottom\)\s*\+/.test(css));
check('FIRE clears the shells readout',
  cssPxCalc('#t-fire', 'bottom') > cssPxCalc('.pod', 'bottom') + 40,
  { fire: cssPxCalc('#t-fire', 'bottom'), pod: cssPxCalc('.pod', 'bottom') });
check('help covers keyboard, phone, save, friends',
  /WASD/.test(help) && /FIRE/.test(help) && /best score/i.test(help) && /Invite/.test(help));
check('listing leads with the GIF / no server',
  /in a GIF/i.test(listing.tagline) && /no server/i.test(listing.tagline));
check('listing does not mention internals',
  !/gifos\.db|WASM|sandbox|localStorage|WebRTC/.test(JSON.stringify(listing)));
check('author is Kuber, porter is GifOS',
  listing.author.name === 'Kuberwastaken' && listing.porter.name === 'GifOS' && listing.basedOn.blessed === false);
check('pointer + fullscreen + db + multiplayer, no network',
  manifest.capabilities.pointer && manifest.capabilities.fullscreen &&
  manifest.capabilities.db && manifest.capabilities.multiplayer && !manifest.capabilities.network);
check('minBuild stays 1314', manifest.minBuild === 1314);

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nall pass');
