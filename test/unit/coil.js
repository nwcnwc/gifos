// COIL HAS TO ACTUALLY WRAP ORBS.
//
// The shipped game is Hakim's canvas port plus CoilCore: trail, loop, enclose,
// energy, score. Enclosure used to be getImageData of a cyan fill every other
// frame — untestable, and a miss on a dirty rect was a silent no-score. The
// suite PLAYS CoilCore in a vm: draw a circle around orbs, they die; wrap a
// bomb, energy drops; let an orb burst, the run can end. DOM-only phone/save
// rules are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'coil');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'core.js'), 'utf8'), sandbox, { filename: 'core.js' });
  return sandbox;
}

const S = load();
const CC = S.CoilCore;
check('core.js attaches CoilCore', !!(CC && CC.create && CC.tick && CC.pointInPoly));

{
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  check('a point inside a square is enclosed', CC.pointInPoly(square, 5, 5));
  check('a point outside a square is not', !CC.pointInPoly(square, 20, 5));
  check('a crossing pair of segments reports an intersection',
    !!CC.findLineIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }));
  check('parallel segments do not',
    !CC.findLineIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }));
}

function noSpawn() { return 0; }

function driveSquare(g, cx, cy, side, n) {
  const h = side / 2;
  function go(x, y, k) {
    const x0 = g.pointer.x, y0 = g.pointer.y;
    for (let i = 1; i <= k; i++) {
      CC.setPointer(g, x0 + (x - x0) * i / k, y0 + (y - y0) * i / k);
      CC.tick(g, 16);
    }
  }
  CC.setPointer(g, cx - h, cy - h);
  for (let i = 0; i < 12; i++) CC.tick(g, 16);
  go(cx + h, cy - h, n);
  go(cx + h, cy + h, n);
  go(cx - h, cy + h, n);
  go(cx - h, cy - h - 24, n);
}

{
  const g = CC.create({ w: 400, h: 400, rng: noSpawn });
  CC.start(g);
  g.enemies = [];
  CC.addEnemy(g, 200, 200, CC.ENEMY_NORMAL);
  CC.addEnemy(g, 206, 204, CC.ENEMY_NORMAL);
  CC.addEnemy(g, 194, 206, CC.ENEMY_NORMAL);
  const n0 = g.enemies.length;
  const s0 = g.score;
  const e0 = g.energy;
  driveSquare(g, 200, 200, 60, 8);
  check('the run is still playing after a loop', g.playing && !g.over, { playing: g.playing, over: g.over, energy: g.energy });
  check('wrapping three orbs KILLS them', g.enemies.length === 0, { left: g.enemies.length, started: n0, events: g.events });
  check('…and the score goes UP', g.score > s0 + 50, { from: s0, to: g.score });
  check('…and energy did not collapse', g.energy >= e0, { from: e0, to: g.energy });
  check('a multi-catch ticks the multiplier up', g.multiplier.minor > 0 || g.multiplier.major > 1, g.multiplier);
}

{
  const g = CC.create({ w: 400, h: 400, rng: noSpawn });
  CC.start(g);
  g.enemies = [];
  CC.addEnemy(g, 200, 200, CC.ENEMY_BOMB);
  const e0 = g.energy;
  driveSquare(g, 200, 200, 60, 8);
  check('wrapping a bomb does not score a catch', g.events.filter((e) => e.kind === 'catch').length === 0, g.events);
  check('wrapping a bomb HURTS energy', g.energy < e0, { from: e0, to: g.energy, events: g.events });
  check('…and resets the multiplier', g.multiplier.major === 1, g.multiplier);
}

{
  const g = CC.create({ w: 400, h: 400, rng: () => 1 });
  CC.start(g);
  g.enemies = [];
  const orb = CC.addEnemy(g, 80, 80, CC.ENEMY_NORMAL);
  orb.time = 0;
  const e0 = g.energy;
  for (let i = 0; i < 600 && g.enemies.length; i++) CC.tick(g, 16);
  check('an unwrapped orb eventually BURSTS', g.events.some((e) => e.kind === 'burst'), g.events);
  check('…and that burst costs energy', g.energy < e0, { from: e0, to: g.energy });
}

{
  const g = CC.create({ w: 400, h: 400, rng: () => 1 });
  CC.start(g);
  g.enemies = [];
  g.energy = 30;
  const orb = CC.addEnemy(g, 80, 80, CC.ENEMY_NORMAL);
  orb.time = 99;
  for (let i = 0; i < 20; i++) CC.tick(g, 16);
  check('energy hitting zero ENDs the run', g.over === true && g.playing === false,
    { over: g.over, playing: g.playing, energy: g.energy });
}

{
  const g = CC.create({ w: 400, h: 400, rng: seeded(9) });
  CC.start(g);
  const x0 = g.player.x, y0 = g.player.y;
  CC.setPointer(g, 350, 40);
  for (let i = 0; i < 20; i++) CC.tick(g, 16);
  check('the head FOLLOWS the pointer', g.player.x > x0 + 20 && g.player.y < y0 - 10,
    { from: [x0, y0], to: [g.player.x, g.player.y] });
  check('the trail has length', g.trail.length === CC.TRAIL_LENGTH, g.trail.length);
}

{
  const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
  const html = src('index.html');
  const boot = src('boot.js');
  const css = src('style.css');
  const coil = src('vendor/coil.js');
  const listing = JSON.parse(src('listing.json'));
  const manifest = JSON.parse(src('manifest.json'));
  const help = src('help.md');

  check('the live game encloses with CoilCore.pointInPoly, not getImageData',
    coil.includes('CoilCore.pointInPoly') && !/getImageData/.test(coil));
  check('a finger maps through pointerToWorld (canvas rect, not assumed 900×510)',
    coil.includes('pointerToWorld') && coil.includes('getBoundingClientRect'));
  check('pointermove is bound so a thumb steers the trail',
    coil.includes('pointermove') && /touch-action:\s*none/.test(css));
  check('Start Game is a button, not href=#',
    /<button[^>]+id="start-button"/.test(html) && !/id="start-button"[^>]*href=/.test(html));
  check('the high score is written through gifos.db',
    /db\('prefs'\)/.test(boot) && /CoilOnStop/.test(boot) && /put\(/.test(boot));
  check('Back from a live run returns to the menu',
    /onBack/.test(boot) && /CoilAPI/.test(boot) && /stop/.test(boot));
  check('a db failure is shown, not swallowed into a blank menu',
    html.includes('id="db-err"') && /dbErr/.test(boot));
  check('the phone menu is not locked at 830px',
    /max-width:\s*640px/.test(css) && coil.includes('world.width - 16'));
  check('no share widgets, no remote at load',
    !/facebook|twitter-share/.test(html) && !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  check('listing author is Hakim, not GifOS', listing.author && listing.author.name !== 'GifOS'
    && listing.basedOn && listing.porter);
  check('listing leads with the file-is-the-save',
    /GIF|file|offline/i.test(listing.description.slice(0, 180)));
  check('help names mouse, thumb, bombs, and what is saved',
    /thumb|finger/i.test(help) && /bomb/i.test(help) && /high score/i.test(help));
  check('db is declared and multiplayer is not',
    manifest.capabilities && manifest.capabilities.db === true && !manifest.capabilities.multiplayer);
  check('core.js is packed and loaded before coil.js',
    html.indexOf('src="core.js"') < html.indexOf('src="vendor/coil.js"'));
}

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nAll PASS');
