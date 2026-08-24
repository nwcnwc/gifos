// PAC-MAN HAS TO ACTUALLY MOVE, EAT, AND BE HUNTED.
//
// mumuy's engine is a canvas Game() with 12 mazes and four ghosts on a
// finder. The GIF shipped a pad that stayed hidden until the first
// touch, a Back-on-title that STARTED a run (it sent Space), and a
// high-score save that forgot the furthest maze. This suite boots the
// shipped engine in a vm with a fake 2d context, presses Start, and
// asserts the yellow one leaves its tile and the score goes up — the
// loop a thumb is asked to play. The shell (pad, hold, Back, save) is
// grepped, because those rules are one-liners.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'pacman');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

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
  m.floor = Math.floor; m.abs = Math.abs; m.max = Math.max; m.min = Math.min;
  m.sin = Math.sin; m.cos = Math.cos; m.PI = Math.PI; m.sqrt = Math.sqrt;
  return m;
}

function load() {
  let now = 10000;
  let raf = null;
  function FakeDate(...args) {
    if (!(this instanceof FakeDate)) return new FakeDate(...args);
    if (args.length) return new Date(...args);
    return new Date(now);
  }
  FakeDate.now = () => now;
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;

  const ctx2d = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '',
    textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: function () {}, clearRect: function () {},
    beginPath: function () {}, closePath: function () {},
    arc: function () {}, fill: function () {}, stroke: function () {},
    moveTo: function () {}, lineTo: function () {}, quadraticCurveTo: function () {},
    save: function () {}, restore: function () {},
    fillText: function () {},
    measureText: function (t) { return { width: String(t).length * 8 }; },
    getImageData: function (x, y, w, h) {
      return { data: new Uint8ClampedArray(Math.max(4, (w * h * 4) | 0)), width: w, height: h };
    },
    putImageData: function () {},
  };
  const canvas = {
    width: 960, height: 640, style: {},
    getContext: function (t) { return t === '2d' ? ctx2d : null; },
    addEventListener: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 960, height: 640 }; },
  };
  const listeners = {};
  const sandbox = {
    console, Math: seededMath(0x0A60), Object, Array, JSON,
    Date: FakeDate, String, Number, Boolean,
    parseInt, parseFloat, isNaN, Infinity, NaN,
    setTimeout: function (fn) { fn(); return 0; },
    clearTimeout: function () {},
    requestAnimationFrame: function (cb) { raf = cb; return 1; },
    cancelAnimationFrame: function () { raf = null; },
    navigator: { userAgent: 'node' },
    KeyboardEvent: function KeyboardEvent(type, init) {
      this.type = type;
      this.keyCode = (init && init.keyCode) || 0;
      this.bubbles = true;
      this.cancelable = true;
      this.preventDefault = function () {};
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    getElementById: function (id) { return id === 'canvas' ? canvas : null; },
    addEventListener: function (t, fn) { (listeners[t] || (listeners[t] = [])).push(fn); },
  };
  sandbox.window.addEventListener = sandbox.document.addEventListener;
  sandbox.window.dispatchEvent = function (e) {
    (listeners[e.type] || []).forEach(function (fn) { fn(e); });
    return true;
  };
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  sandbox.window.cancelAnimationFrame = sandbox.cancelAnimationFrame;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'index.js'), 'utf8'), sandbox, { filename: 'index.js' });
  sandbox.__pump = function (n) {
    for (let i = 0; i < n; i++) {
      now += 20;
      if (raf) raf(now);
    }
  };
  sandbox.__now = function (t) { if (t != null) now = t; return now; };
  return sandbox;
}

const sandbox = load();
const Pacman = sandbox.Pacman;
check('engine loads and exposes Pacman', !!(Pacman && Pacman.score && Pacman.steer && Pacman.phase));
check('title + 12 mazes + game-over = 14 stages', Pacman.game.getStages().length === 14,
  Pacman.game.getStages().length);
check('boots on the title, five lives, score 0',
  Pacman.phase() === 'title' && Pacman.life() === 5 && Pacman.score() === 0,
  { phase: Pacman.phase(), life: Pacman.life(), score: Pacman.score() });

function start() {
  Pacman._key = 32;
  sandbox.window.dispatchEvent(new sandbox.KeyboardEvent('keydown', { keyCode: 32 }));
  Pacman._key = 0;
  sandbox.__pump(8);
}

{
  start();
  check('Space on the title starts maze 1', Pacman.phase() === 'play' && Pacman.stageIndex() === 1,
    { phase: Pacman.phase(), stage: Pacman.stageIndex() });
  const p = Pacman.player();
  check('the yellow one spawns', !!(p && p.x && p.y), p && { x: p.x, y: p.y });
  const x0 = p.x, y0 = p.y, s0 = Pacman.score();
  Pacman.steer(2); // left — the spawn corridor
  sandbox.__pump(160);
  const p2 = Pacman.player();
  check('the yellow one MOVES when steered', p2 && (Math.abs(p2.x - x0) > 40 || Math.abs(p2.y - y0) > 40),
    p2 && { from: [x0, y0], to: [p2.x, p2.y] });
  check('eating pellets raises the score', Pacman.score() > s0,
    { from: s0, to: Pacman.score() });
}

{
  const stage = Pacman.game.getStages()[Pacman.stageIndex()];
  const ghosts = stage.getItemsByType(2);
  check('four ghosts are in the maze', ghosts.length === 4, ghosts.length);
  const moved = ghosts.filter((g) => Math.abs(g.x - 320) > 8 || Math.abs(g.y - 290) > 8);
  check('the ghosts leave the house and hunt', moved.length >= 2,
    ghosts.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y), path: (g.path || []).length })));
  const hunting = ghosts.filter((g) => g.path && g.path.length > 0);
  check('ghost AI has a path to the player', hunting.length >= 1, hunting.length);
}

{
  const maps = (fs.readFileSync(path.join(APP, 'vendor', 'index.js'), 'utf8').match(/'map':/g) || []).length;
  check('twelve maze configs are packed', maps === 12, maps);
}

// Finder on a tiny open grid — the same Map.finder the ghosts call.
{
  const stage = Pacman.game.getStages()[1];
  const map = stage.maps[0];
  const path = map.finder({
    map: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ],
    start: { x: 0, y: 0 },
    end: { x: 2, y: 2 },
  });
  check('finder returns a walkable path', Array.isArray(path) && path.length > 0, path);
}

// Pause is Space during play; Space on title already consumed.
{
  check('still in play before pause', Pacman.phase() === 'play', Pacman.phase());
  Pacman._key = 32;
  sandbox.window.dispatchEvent(new sandbox.KeyboardEvent('keydown', { keyCode: 32 }));
  Pacman._key = 0;
  sandbox.__pump(4);
  check('Space during play pauses', Pacman.phase() === 'pause', Pacman.phase());
}

// ---- shell: pad, hold, Back, save ------------------------------------------
const boot = fs.readFileSync(path.join(APP, 'boot.js'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const indexJs = fs.readFileSync(path.join(APP, 'vendor', 'index.js'), 'utf8');
const gameJs = fs.readFileSync(path.join(APP, 'vendor', 'game.js'), 'utf8');

check('pad is in the markup with four directions + pause',
  html.includes('data-key="38"') && html.includes('data-key="37"') &&
  html.includes('data-key="39"') && html.includes('data-key="40"') &&
  html.includes('data-key="32"'));
check('CSS shows the pad on a coarse pointer / narrow screen without waiting for touch',
  /pointer:\s*coarse/.test(css) && /max-width:\s*720px/.test(css));
check('boot reveals the pad on phoneish() at load', /phoneish/.test(boot) && /revealPad/.test(boot));
check('a narrow cabinet crops the maze (not the SCORE strip)', /padVisible/.test(boot) && /MAZE_W/.test(boot));
check('holding a direction re-steers every frame', /held/.test(boot) && /steer/.test(boot));
check('swipe on the maze turns', /swipe/.test(boot) && /pointerup/.test(boot));
check('onBack pauses play and does NOT start a title run',
  /onBack/.test(boot) && /ph === 'play'/.test(boot) && /return false/.test(boot));
check('high score AND furthest maze are saved',
  /db\('save'\)/.test(boot) && /bestLevel/.test(boot) && /id: 'hi'/.test(boot));
check('old {id:hi, score} still loads', /row\.score/.test(boot));
check('cabinet roster is published', /db\('players'\)/.test(boot) && /subscribe/.test(boot));
check('no in-app Invite button', !/>\s*Invite\s*</.test(html) && !/id=["']invite/i.test(html));
check('no Namco / Bandai in the running product',
  !/Namco|NAMCO|Bandai/.test(gameJs + indexJs + boot + html));
check('no CDN font / remote fetch in the engine',
  !/FontFace|PressStart2P|https?:/.test(indexJs.replace(/https:\/\/(passer-by\.com|github\.com)[^\s"']*/g, '')));
check('listing leads with offline / the file', /plane|file/.test(listing) && /no account/i.test(listing));
check('help says what is saved', /best score/i.test(help) && /furthest maze/i.test(help));
check('help does not claim 10 points per pellet', !/Pellets are 10 points/.test(help));

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nAll PASS');
process.exit(0);
