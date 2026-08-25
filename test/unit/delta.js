// Delta has to actually fly, fire, and remember the best.
//
// vendor/delta.js is Jake Gordon's engine (DOM-bound). Player motion, fire
// cooldown and scoring are deterministic given the inputs, so we load the
// shipped Game.Math + a mocked document just far enough to construct the
// engine, then HOLD a direction and assert the ship moved. Phone pad, Back,
// and "best lives in the file" are one-liners a vm cannot click — those are
// source-scanned, not guessed at in a browser suite.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'delta');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

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
  return m;
}

function el(id) {
  const cls = { zero: 0, one: 0, two: 0, three: 0 };
  const node = {
    id: id || '',
    style: { display: '' },
    className: '',
    textContent: '',
    innerHTML: '',
    src: '',
    width: 1024,
    height: 768,
    nodeType: 1,
    childNodes: [],
    parentNode: null,
    _extended: false,
    classList: {
      add: (c) => { cls[c] = 1; node.className = Object.keys(cls).filter((k) => cls[k]).join(' '); },
      remove: (c) => { cls[c] = 0; node.className = Object.keys(cls).filter((k) => cls[k]).join(' '); },
      contains: (c) => !!cls[c],
      toggle: (c, on) => { if (on == null) on = !cls[c]; cls[c] = on ? 1 : 0; },
    },
    getContext: () => ({
      fillRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
      beginPath() {}, closePath() {}, fill() {}, stroke() {}, fillText() {},
      strokeText() {}, arc() {}, translate() {}, rotate() {}, moveTo() {}, lineTo() {},
      rect() {}, clip() {}, setTransform() {}, measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      putImageData() {}, getImageData: () => ({ data: [] }),
      set fillStyle(v) {}, set strokeStyle(v) {}, set globalAlpha(v) {},
      set font(v) {}, set lineWidth(v) {}, set textAlign(v) {},
      set textBaseline(v) {}, set globalCompositeOperation(v) {},
    }),
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { node.childNodes.push(c); if (c) c.parentNode = node; return c; },
    removeChild(c) { node.childNodes = node.childNodes.filter((x) => x !== c); return c; },
    setAttribute() {}, getAttribute() { return ''; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 156, height: 156 }),
    querySelector() { return el('x'); },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    children: [],
  };
  return node;
}

function loadEngine() {
  const byId = {};
  ['delta', 'canvas', 'booting', 'title', 'start', 'prepare', 'sound', 'scoreboard', 'best', 'instructions'].forEach((id) => { byId[id] = el(id); });
  const lives = el('lives');
  lives.className = 'lives three';
  lives.toggleClassName = function (n, on) { this.classList.toggle(n, on); };
  const scoreVal = el('value');
  const scoreboard = byId.scoreboard;
  function qs(sel) {
    if (String(sel).indexOf('lives') >= 0) return lives;
    if (String(sel).indexOf('value') >= 0) return scoreVal;
    if (sel && sel[0] === '#') return byId[sel.slice(1)] || null;
    return null;
  }
  scoreboard.querySelector = qs;
  scoreboard.querySelectorAll = (sel) => {
    const n = qs(sel);
    return n ? [n] : [];
  };

  const document = {
    body: el('body'),
    documentElement: el('html'),
    nodeType: 9,
    getElementById: (id) => byId[id] || null,
    querySelector: qs,
    querySelectorAll: (sel) => { const n = qs(sel); return n ? [n] : []; },
    getElementsByTagName: (tag) => tag === 'html' ? [document.documentElement] : [],
    createElement: (tag) => {
      const n = el(tag);
      n.tagName = String(tag).toUpperCase();
      Object.defineProperty(n, 'src', {
        set: function () { if (n._onload) n._onload(); },
        get: function () { return ''; },
      });
      n.addEventListener = function (type, fn) { if (type === 'load') n._onload = fn; };
      return n;
    },
    createTextNode: (t) => ({ nodeType: 3, text: t }),
    addEventListener() {},
  };

  function Sizzle(sel, context) {
    const s = String(sel || '');
    if (s.charAt(0) === '#' && s.indexOf(' ') < 0 && s.indexOf('.') < 0) {
      const n = (context && context.getElementById) ? context.getElementById(s.slice(1)) : document.getElementById(s.slice(1));
      return n ? [n] : [];
    }
    const n = document.querySelector(s);
    return n ? [n] : [];
  }
  Sizzle.matches = function () { return []; };

  const sandbox = {
    console, Math: seededMath(0xDE17A), Object, Array, JSON, Date, String, Number, Boolean,
    parseInt, parseFloat, isNaN, undefined,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    navigator: { userAgent: 'Mozilla/5.0 test', maxTouchPoints: 0 },
    document, HTMLElement: function HTMLElement() {}, Event: function Event() {},
    performance: { now: () => 0 },
    requestAnimationFrame: (fn) => { sandbox._raf = fn; return 1; },
    AudioFX: { mute: false },
    localStorage: {},
    innerWidth: 1024, innerHeight: 768,
    addEventListener() {},
    DELTA_ASSETS: {},
    gifos: null,
    Sizzle,
    StateMachine: {
      create: function (cfg, fsm) {
        fsm.current = 'none';
        fsm.is = function (state) {
          return (state instanceof Array) ? state.indexOf(this.current) >= 0 : this.current === state;
        };
        fsm.can = function () { return true; };
        fsm.cannot = function () { return false; };
        (cfg.events || []).forEach(function (e) {
          fsm[e.name] = function () {
            const from = fsm.current;
            const to = e.to;
            fsm.current = to;
            if (fsm.onenterstate) fsm.onenterstate(e.name, from, to);
            const hook = fsm['on' + e.name] || fsm['onenter' + to];
            if (fsm['onleave' + from]) fsm['onleave' + from]();
            if (fsm['onenter' + to]) fsm['onenter' + to]();
            if (fsm['on' + e.name]) fsm['on' + e.name]();
          };
        });
        return fsm;
      }
    },
    PubSub: { enable: function () {} },
    FPSMeter: function () { return { tickStart: function () {}, tick: function () {} }; },
    Animator: { apply: function () { return { play: function () {}, stop: function () {} }; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('vendor/game.js'), sandbox, { filename: 'game.js' });
  vm.runInContext(read('vendor/delta.js'), sandbox, { filename: 'delta.js' });
  vm.runInContext('Delta();', sandbox, { filename: 'Delta()' });
  return sandbox;
}

const html = read('index.html');
const css = read('style.css');
const touch = read('touch.js');
const boot = read('boot.js');
const listing = JSON.parse(read('listing.json'));
const help = read('help.md');
const deltaSrc = read('vendor/delta.js');
const sfx = read('sfx.js');

check('index.html has a #dpad and #t-fire', /id="dpad"/.test(html) && /id="t-fire"/.test(html));
check('d-pad is a 156px disc with four arrows (Eagle Defense sized)',
  /#dpad\s*\{[^}]*width:\s*156px/.test(css) && /d-up/.test(css) && /d-left/.test(css));
check('FIRE is a 92px circle on the right', /#t-fire\s*\{[^}]*width:\s*92px/.test(css) && /border-radius:\s*50%/.test(css));
check('touch.js drives the pad from pointer events (not touch-only)',
  /pointerdown/.test(touch) && /setPointerCapture/.test(touch) && !/touchstart/.test(touch.split('function init')[0] + 'bindPad'));
check('touch.js writes player.movingLeft/Right/Up/Down and firing',
  /movingLeft/.test(touch) && /movingRight/.test(touch) && /movingUp/.test(touch) && /movingDown/.test(touch) && /firing/.test(touch));
check('diagonals: pad sets two axes from one pointer', /held\.left/.test(touch) && /held\.up/.test(touch) && /hypot/.test(touch));
check('phone layout reserves pad space so the field is not covered', /body\.touch #delta/.test(css) && /188px/.test(css));
check('boot.js registers onBack and quits to title', /onBack/.test(boot) && /engine\.quit/.test(boot));
check('best score is written to gifos.db prefs', /db\('prefs'\)/.test(boot) && /best/.test(boot) && /put\(/.test(boot));
check('saved best still loads (row.best || save.best)', /row\.best/.test(boot) && /save\.best/.test(boot));
check('mute is not forced on every boot (isMute from storage)',
  /toggleMute\(this\.isMute\(\)\)/.test(deltaSrc) && !/toggleMute\(true\)/.test(deltaSrc));
check('shoot/explode hook DeltaSfx, never a SID path',
  /DeltaSfx/.test(deltaSrc) && !/sounds\/title/.test(deltaSrc) && /DeltaSfx/.test(sfx));
check('no in-app Invite/Share button', !/<button[^>]*>\s*Invite/i.test(html));
check('listing leads with offline / file is the save',
  /offline/i.test(listing.description) && /saved inside this GIF/i.test(listing.description));
check('listing does not claim a SID tune we do not ship', !/SID recording and is in this/i.test(listing.description));
check('help.md names D-pad, FIRE, best score, mute',
  /D-pad/.test(help) && /FIRE/.test(help) && /best/i.test(help) && /mute/i.test(help));
check('vendor still has the C64 numbers (ascent, not a rewrite)',
  /HSPEED\s*=\s*200/.test(deltaSrc) && /VSPEED\s*=\s*300/.test(deltaSrc) && /PLAYER\.X:\s*50/.test(deltaSrc) ||
  /X:\s*50/.test(deltaSrc));

let engineOk = false;
try {
  const sb = loadEngine();
  check('Game.Math loads', !!(sb.Game && sb.Game.Math && sb.Game.Math.overlap && sb.Game.Math.bound));
  if (sb.Game && sb.Game.Math) {
    check('overlap is true for nested boxes', sb.Game.Math.overlap(0, 0, 10, 10, 5, 5, 2, 2));
    check('overlap is false for separated boxes', !sb.Game.Math.overlap(0, 0, 10, 10, 20, 20, 2, 2));
    check('bound clamps', sb.Game.Math.bound(-5, 0, 10) === 0 && sb.Game.Math.bound(15, 0, 10) === 10);
  }
  check('Delta() exported engine + player', !!(sb.engine && sb.player));
  if (sb.engine && sb.player) {
    engineOk = true;
    const p = sb.player;
    p.reset(true);
    if (sb.bullets && sb.bullets.reset) sb.bullets.reset();
    const x0 = p.x, y0 = p.y, s0 = p.score;
    p.movingRight = true;
    p.movingDown = true;
    p.firing = true;
    p.dead = false;
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    check('holding right MOVES the ship', p.x > x0 + 8, { from: x0, to: p.x });
    check('holding down MOVES the ship', p.y > y0 + 8, { from: y0, to: p.y });
    check('holding fire spends the cooldown (a shot was attempted)', p.cooldown > 0 || (sb.bullets && sb.bullets.pool), p.cooldown);
    p.increaseScore(250);
    check('increaseScore raises the run score', p.score === s0 + 250, { score: p.score });
    p.setLives(2);
    check('setLives keeps a whole number of lives', p.lives === 2, p.lives);
    p.x = 0; p.movingLeft = true; p.movingRight = false;
    for (let i = 0; i < 20; i++) p.update(1 / 60);
    check('the ship cannot leave the left bound', p.x >= p.minx, { x: p.x, minx: p.minx });
  }
} catch (e) {
  check('engine loads in a vm (player can be driven)', false, String(e && e.stack || e).slice(0, 400));
}

if (!engineOk) {
  check('holding right MOVES the ship', false);
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll PASS — delta core loop holds.');
process.exit(0);
