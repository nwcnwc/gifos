// TINY PLATFORMER HAS TO ACTUALLY JUMP, COLLECT, AND STOMP.
//
// The original is a keyboard demo that XHR-loads a Tiled map and paints the
// entire cave at once. This port has to (a) run without XHR, (b) move the
// yellow square, (c) take gold, (d) stomp a grey block, (e) keep a best run.
// A suite that only greps for "JUMP" would green while the player was frozen.
//
// The sim is deterministic given the inputs, so it runs headless in a vm at
// a fixed 1/60 step — no browser. The phone pad and Back hook are one-liners
// a vm cannot click; those are pinned by source scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'tiny-platformer');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function fakeCanvas() {
  return {
    width: 640,
    height: 480,
    style: {},
    getContext: () => ({
      setTransform() {},
      clearRect() {},
      fillRect() {},
      fillStyle: '',
      globalAlpha: 1,
    }),
  };
}

function load() {
  const canvas = fakeCanvas();
  const els = {};
  const makeEl = (id) => {
    if (els[id]) return els[id];
    els[id] = {
      id,
      textContent: '',
      hidden: id === 'touch' || id === 'banner',
      classList: { add() {}, remove() {}, contains: () => false },
      style: {},
      querySelectorAll: () => [],
      addEventListener() {},
      setAttribute() {},
      getAttribute: () => null,
    };
    return els[id];
  };
  makeEl('canvas');
  els.canvas = canvas;
  const sandbox = {
    console,
    Math,
    Object, Array, JSON, Date, String, Number, Boolean,
    parseInt, parseFloat, isNaN, Infinity,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    navigator: { maxTouchPoints: 0, userAgent: 'node' },
    matchMedia: () => ({ matches: false }),
    Tiny: { headless: true },
    gifos: null,
  };
  const document = {
    readyState: 'complete',
    body: { classList: { add() {}, contains: () => false }, style: {} },
    getElementById: (id) => makeEl(id),
    addEventListener() {},
    querySelectorAll: () => [],
  };
  sandbox.document = document;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.innerWidth = 390;
  sandbox.innerHeight = 844;
  vm.createContext(sandbox);
  for (const f of ['boot.js', 'vendor/level.js', 'vendor/platformer.js', 'touch.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const sandbox = load();
const Tiny = sandbox.Tiny;

check('the sim loads and exposes Tiny.step', !!(Tiny && Tiny.step && Tiny.player));
check('the Tiled cave is aboard (no XHR)', !!sandbox.TINY_LEVEL && Array.isArray(sandbox.TINY_LEVEL.layers));
check('eight gold and eight grey blocks', (() => {
  const tot = Tiny.totals();
  return tot.coins === 8 && tot.stomps === 8;
})(), Tiny.totals && Tiny.totals());

{
  const p = Tiny.player();
  check('the player spawns in the cave', !!(p && p.player && p.x === 96 && p.y === 480), p && { x: p.x, y: p.y });
}

{
  const p = Tiny.player();
  const x0 = p.x;
  p.right = true;
  Tiny.step(45);
  p.right = false;
  Tiny.step(5);
  check('holding right MOVES the yellow square', p.x > x0 + 16, { from: x0, to: p.x });
}

{
  Tiny.restart();
  const p = Tiny.player();
  const y0 = p.y;
  p.jump = true;
  Tiny.step(8);
  p.jump = false;
  check('a jump leaves the ground (y decreases)', p.y < y0 - 8 && p.jumping, { from: y0, to: p.y, jumping: p.jumping });
  Tiny.step(80);
  check('…and lands again', !p.jumping && p.y >= y0 - 1, { y: p.y, jumping: p.jumping, falling: p.falling });
}

{
  Tiny.restart();
  const p = Tiny.player();
  const gold = Tiny.treasure()[0];
  p.x = gold.x;
  p.y = gold.y;
  Tiny.step(2);
  check('walking onto gold COLLECTS it', p.collected === 1 && gold.collected, { collected: p.collected });
}

{
  Tiny.restart();
  const p = Tiny.player();
  const m = Tiny.monsters()[0];
  p.x = m.x;
  p.y = m.y - 24;
  p.dy = 12;
  Tiny.step(1);
  check('landing on a grey block STOMPS it', m.dead && p.killed === 1, { dead: m.dead, killed: p.killed, y: p.y });
}

{
  Tiny.restart();
  const p = Tiny.player();
  const m = Tiny.monsters()[0];
  const startX = p.start.x, startY = p.start.y;
  p.x = m.x;
  p.y = m.y;
  p.dy = 0;
  Tiny.step(1);
  check('walking into a grey block sends you back to the start', p.x === startX && p.y === startY, { x: p.x, y: p.y });
}

{
  Tiny.restart();
  const p = Tiny.player();
  Tiny.treasure().forEach((t) => { t.collected = true; p.collected++; });
  Tiny.monsters().forEach((m) => { m.dead = true; p.killed++; });
  check('taking all gold and stomps CLEARS the cave', Tiny.cleared() === true);
  Tiny.restart();
  check('R / restart puts the gold and grey blocks back', Tiny.cleared() === false && p.collected === 0 && Tiny.treasure().every((t) => !t.collected));
}

// Saved data of the CURRENT version: id 'best' with coins + stomps.
{
  const boot = src('boot.js');
  check('best run is written to gifos.db as id best', /id:\s*['"]best['"]/.test(boot) && /coins:\s*best\.coins/.test(boot));
  check('a missing db still boots (opened outside GifOS)', /if\s*\(!d\)\s*return/.test(boot) || /api\s*&&\s*api\.db/.test(boot));
}

{
  const t = src('touch.js');
  const html = src('index.html');
  const css = src('style.css');
  check('the phone pad has LEFT, RIGHT, JUMP',
    html.includes('data-key="left"') && html.includes('data-key="right"') && html.includes('data-key="jump"'));
  check('JUMP is a labelled thumb button', /aria-label="Jump"/.test(html) && html.includes('JUMP'));
  check('the pad appears on a narrow phone, not only after a finger',
    /narrow/.test(t) && /520/.test(t) && t.includes('reveal()'));
  check('the pad writes player.left / player.right / player.jump',
    t.includes('p.left = on') && t.includes('p.right = on') && t.includes('p.jump = on'));
  check('canvas fit leaves a bottom strip for the pad', src('boot.js').includes('paddingBottom'));
  check('pad buttons are large enough to hit', /4\.6rem/.test(css) || /5\.2rem/.test(css));
}

{
  const js = src('vendor/platformer.js');
  check('WASD and Up jump, not arrows-only',
    js.includes('KEY.A') && js.includes('KEY.D') && js.includes('KEY.W') && js.includes('KEY.UP'));
  check('no XHR of level.json', !js.includes('get("level.json"') && js.includes('TINY_LEVEL'));
  check('camera follows the player', js.includes('function camera()'));
  check('Back restarts the cave', src('boot.js').includes('onBack') && src('boot.js').includes('restart'));
}

{
  const man = JSON.parse(src('manifest.json'));
  const listing = JSON.parse(src('listing.json'));
  check('no multiplayer claim on a solo cave', man.capabilities.db === true && !man.capabilities.multiplayer);
  check('minBuild stays 947', man.minBuild === 947);
  check('listing names Jake Gordon, not GifOS', listing.author.name === 'Jake Gordon' && listing.basedOn.blessed === false);
  check('tagline fits a card', listing.tagline.length <= 90);
  check('description does not claim Invite', !/invite/i.test(listing.description));
  check('help.md is a real how-to', src('help.md').trim().length >= 400);
}

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nAll ' + (process.stdout._ok || '') + 'tiny-platformer checks passed');
