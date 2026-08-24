// ONOFF HAS TO CROSS A ROOM.
//
// The port shipped with 25 rooms, a layer toggle, and a phone pad — and then
// START always set index=0, so the "best lvl" saved in the file was a lie.
// The suite loads the bundled vendor (the GIF's script) in a vm, walks the
// first room, jumps the gap, and reaches the goal. A second run flips the
// world on a room whose floor is the other layer. DOM-only phone/save rules
// are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'onoff');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function El(name, attrs) {
  this.tagName = String(name).toUpperCase();
  this.nodeName = this.tagName;
  this.attrs = Object.assign({}, attrs || {});
  this.children = [];
  this.parentNode = null;
  this.style = {};
  this._inner = '';
  this.listeners = {};
  const classes = new Set(String(this.attrs.class || this.attrs.className || '').split(/\s+/).filter(Boolean));
  this.classList = {
    add: (c) => classes.add(c),
    remove: (c) => classes.delete(c),
    contains: (c) => classes.has(c),
    toggle: (c, on) => {
      if (on === undefined) { if (classes.has(c)) classes.delete(c); else classes.add(c); }
      else if (on) classes.add(c); else classes.delete(c);
    }
  };
  this._classes = classes;
}
El.prototype.setAttribute = function (k, v) {
  this.attrs[k] = String(v);
  if (k === 'class') String(v).split(/\s+/).forEach((c) => { if (c) this._classes.add(c); });
};
El.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null; };
El.prototype.hasAttribute = function (k) { return k in this.attrs; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
El.prototype.remove = function () {
  if (!this.parentNode) return;
  this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
  this.parentNode = null;
};
El.prototype.addEventListener = function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); };
El.prototype.createSVGPoint = function () {
  return { x: 0, y: 0, matrixTransform: function () { return { x: this.x, y: this.y }; } };
};
El.prototype.getScreenCTM = function () { return { inverse: function () { return {}; } }; };
Object.defineProperty(El.prototype, 'innerHTML', {
  get() { return this._inner; },
  set(v) { this._inner = String(v); this.children = []; }
});
Object.defineProperty(El.prototype, 'hidden', {
  get() { return 'hidden' in this.attrs; },
  set(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
});
Object.defineProperty(El.prototype, 'id', {
  get() { return this.attrs.id; },
  set(v) { this.attrs.id = v; }
});

function match(el, sel) {
  if (sel.charAt(0) === '#') return el.attrs.id === sel.slice(1);
  if (sel.charAt(0) === '.') return el._classes.has(sel.slice(1));
  if (sel.charAt(0) === '[') {
    const m = sel.match(/^\[([^=\]]+)/);
    return m && (m[1] in el.attrs);
  }
  return el.tagName === sel.toUpperCase();
}
function walkFind(root, pred, out) {
  for (const c of root.children) {
    if (pred(c)) out.push(c);
    walkFind(c, pred, out);
  }
}
El.prototype.querySelectorAll = function (selector) {
  const parts = String(selector).trim().split(/\s+/);
  let set = [this];
  for (const part of parts) {
    const next = [];
    for (const n of set) walkFind(n, (c) => match(c, part), next);
    set = next;
  }
  return set;
};
El.prototype.querySelector = function (selector) {
  return this.querySelectorAll(selector)[0] || null;
};

function makeDoc() {
  const ids = {};
  function id(name, tag) {
    const n = new El(tag || 'div', { id: name });
    ids[name] = n;
    return n;
  }
  const body = new El('body', { class: 'on' });
  const title = id('title', 'svg');
  const menu = new El('g', { class: 'menu' });
  menu.appendChild(new El('g', { class: 'item' }));
  menu.appendChild(new El('g', { class: 'item' }));
  menu.appendChild(new El('g', { class: 'item' }));
  title.appendChild(menu);
  body.appendChild(title);

  const controls = id('controls', 'svg');
  ['key-w', 'key-a', 'key-d', 'key-space', 'button-toggle', 'button-jump', 'button-left', 'button-right']
    .forEach((k) => controls.appendChild(id(k, 'g')));
  const cmenu = new El('g', { class: 'menu' });
  cmenu.appendChild(new El('g', { class: 'item' }));
  controls.appendChild(cmenu);
  body.appendChild(controls);

  const game = id('game', 'svg');
  game.appendChild(id('congrats', 'svg'));
  game.appendChild(id('esc', 'svg'));
  game.appendChild(id('death-counter', 'g'));
  game.appendChild(id('level-counter', 'g'));
  game.appendChild(id('death', 'svg'));
  body.appendChild(game);

  const editor = id('editor', 'svg');
  body.appendChild(editor);
  const dialog = id('dialog', 'div');
  dialog.appendChild(id('close-dialog', 'button'));
  body.appendChild(dialog);
  body.appendChild(id('from-start', 'button'));
  body.appendChild(id('db-err', 'p'));
  body.appendChild(id('best', 'div'));
  const touch = id('touch', 'div');
  ['left', 'right', 'jump', 'toggle'].forEach((k) => {
    const b = new El('button', { 'data-key': k, class: 't-btn' });
    touch.appendChild(b);
  });
  body.appendChild(touch);

  const listeners = {};
  const doc = {
    body,
    documentElement: body,
    readyState: 'complete',
    createElementNS: (ns, name) => new El(name),
    createElement: (name) => new El(name),
    getElementById: (n) => ids[n] || null,
    querySelectorAll: (s) => body.querySelectorAll(s),
    querySelector: (s) => body.querySelector(s),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    dispatchEvent: function (ev) {
      const ls = listeners[ev.type] || [];
      for (const f of ls) f(ev);
    }
  };
  body.ownerDocument = doc;
  return { doc, body, listeners, ids };
}

function load(extra) {
  const { doc, body, listeners } = makeDoc();
  let now = 1000;
  const raf = [];
  const sandbox = Object.assign({
    console,
    Math, Object, Array, JSON, Date, String, Number, Boolean, Promise, Set, Map,
    parseInt, parseFloat, isNaN, Infinity, NaN,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    cancelAnimationFrame: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn, ms) => { fn(); return 1; },
    clearTimeout: () => {},
    document: doc,
    navigator: { getGamepads: () => [], maxTouchPoints: 0 },
    KeyboardEvent: function (type, init) {
      this.type = type;
      this.key = init && init.key;
      this.bubbles = !!(init && init.bubbles);
      this.preventDefault = function () {};
      this.stopPropagation = function () {};
    },
    Image: function () {},
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  }, extra || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor/onoff.js'), 'utf8'), sandbox, { filename: 'onoff.js' });
  return { sandbox, doc, body, listeners, raf, nowRef: () => now, setNow: (n) => { now = n; } };
}

function scale16(v) { return Math.round(v * 16 / 1000); }

function hold(S, keys, on) {
  const D = S.ONOFF_DOWN;
  keys.forEach((k) => { if (on) D.add(k); else D.delete(k); });
}

function flushSleep(env, ms) {
  env.setNow(env.nowRef() + ms);
  const q = env.raf.splice(0);
  for (const fn of q) fn(env.nowRef());
}

{
  const env = load();
  const S = env.sandbox;
  check('vendor/onoff.js boots a game', !!(S.ONOFF_GAME && S.ONOFF_DOWN && S.ONOFF_LEVELS));
  check('all 25 rooms are aboard', S.ONOFF_LEVELS && S.ONOFF_LEVELS.length === 25,
    S.ONOFF_LEVELS && S.ONOFF_LEVELS.length);
}

{
  const env = load();
  const S = env.sandbox;
  const g = S.ONOFF_GAME;
  g.title.selected = 0;
  g.title.choose();
  check('Start puts you in a room', g.state === 'play' && g.scene.index === 0,
    { state: g.state, index: g.scene.index });
  const guy = g.scene.guy;
  const x0 = guy.x;
  hold(S, ['d', 'ArrowRight'], true);
  for (let i = 0; i < 20; i++) g.tick(scale16);
  check('holding right MOVES the robot', guy.x > x0 + 8, { from: x0, to: guy.x });

  for (let i = 0; i < 80 && guy.x < 280; i++) g.tick(scale16);
  const y0 = guy.y;
  hold(S, ['w', 'ArrowUp'], true);
  for (let i = 0; i < 8; i++) g.tick(scale16);
  hold(S, ['w', 'ArrowUp'], false);
  check('JUMP leaves the floor', guy.y < y0 - 4, { from: y0, to: guy.y, vy: guy.vy });

  for (let i = 0; i < 220 && !g.scene.paused; i++) g.tick(scale16);
  check('the first room can be FINISHED (goal reached)', g.scene.paused === true || g.scene.index > 0,
    { paused: g.scene.paused, index: g.scene.index, x: guy.x, y: guy.y });
}

{
  const env = load();
  const S = env.sandbox;
  const g = S.ONOFF_GAME;
  g.title.selected = 0;
  g.title.choose();
  g.scene.index = 2;
  check('room 3 has an OFF floor on the right', (function () {
    const bars = g.scene.bars;
    return bars.some((b) => !b.on && b.x > 400);
  })(), { n: g.scene.bars.length, ons: g.scene.bars.map((b) => [b.x, b.on]) });
  const on0 = g.scene.on;
  S.document.dispatchEvent({ type: 'keydown', key: ' ', preventDefault: function () {} });
  check('Space flips the world', g.scene.on !== on0, { from: on0, to: g.scene.on });
}

{
  const env = load();
  const S = env.sandbox;
  const g = S.ONOFF_GAME;
  g.title.selected = 0;
  g.title.choose();
  const deaths0 = g.scene.deaths.value;
  g.scene.guy.y = 500;
  g.tick(scale16);
  check('falling off the world starts a death', g.scene.paused === true && g.scene.deaths.value > deaths0,
    { paused: g.scene.paused, deaths: g.scene.deaths.value });
}

{
  const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
  const html = src('index.html');
  const boot = src('boot.js');
  const touch = src('touch.js');
  const css = src('style.css');
  const vendor = src('vendor/onoff.js');
  const listing = JSON.parse(src('listing.json'));
  const manifest = JSON.parse(src('manifest.json'));
  const help = src('help.md');

  check('Start continues from the furthest saved room',
    /resumeIndex/.test(boot) && /best - 1/.test(boot));
  check('from the first room is a real control when you have progress',
    html.includes('id="from-start"') && /fromStart/.test(boot));
  check('Back leaves a room / controls / editor for the title',
    /onBack/.test(boot) && /state = 'title'/.test(boot));
  check('the pad injects keys the sim already reads',
    /data-key="jump"/.test(html) && /ONOFF_DOWN/.test(touch) && /MIN_HOLD/.test(touch));
  check('the pad keeps a strip so landscape does not cover the floor',
    /padding-bottom/.test(css) && /body\.touch/.test(css));
  check('a db failure is shown', html.includes('id="db-err"') && /dbErr/.test(boot));
  check('AudioContext cannot kill the rooms',
    vendor.includes('FakeAudioContext') && vendor.includes('ONOFF_LEVELS'));
  check('vendor is classic script, not ESM',
    !/^\s*import\s/m.test(vendor) && !/export\s+\{/.test(vendor));
  check('listing author is them, not GifOS',
    listing.author && listing.author.name !== 'GifOS' && listing.basedOn && listing.porter);
  check('listing leads with the file-is-the-save',
    /room 18|GIF|file/i.test(listing.description.slice(0, 200)));
  check('help names jump, flip, phone pad, and the save',
    /JUMP/.test(help) && /ON\/OFF/.test(help) && /furthest room/i.test(help));
  check('db is declared and multiplayer is not',
    manifest.capabilities && manifest.capabilities.db === true && !manifest.capabilities.multiplayer);
}

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nAll PASS');
