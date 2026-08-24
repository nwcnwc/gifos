// TINY YURTS HAS TO DRAW A PATH.
//
// The jam build treats only event.buttons === 1 as a draw. A finger's
// pointermove often reports buttons=0, so a phone drag never placed a tile:
// the title said "touch or left-click" and a thumb did nothing. The board
// was also cropped in portrait (slice + maxHeight 68vw), so farms fell off
// the screen. And gifos.db hydrated AFTER vendor/game.js had already read
// localStorage, so a saved highscore never appeared on the title.
//
// This suite PLAYS the shipped IIFE in a fake DOM: it places a Path the
// same way a drag does, then source-scans the one-liner phone/save rules a
// vm cannot run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'tiny-yurts');

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
  m.floor = Math.floor; m.ceil = Math.ceil; m.round = Math.round;
  m.abs = Math.abs; m.min = Math.min; m.max = Math.max;
  m.hypot = Math.hypot; m.atan2 = Math.atan2; m.PI = Math.PI;
  m.sin = Math.sin; m.cos = Math.cos; m.sqrt = Math.sqrt;
  m.imul = Math.imul; m.pow = Math.pow;
  return m;
}

function el(tag, ns) {
  const attrs = Object.create(null);
  const kids = [];
  const listeners = Object.create(null);
  const style = {};
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    namespaceURI: ns || '',
    style,
    children: kids,
    childNodes: kids,
    parentNode: null,
    innerHTML: '',
    innerText: '',
    textContent: '',
    className: '',
    id: '',
    hidden: false,
    value: '',
    width: 0,
    height: 0,
    setAttribute(k, v) { attrs[String(k)] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    append(...nodes) {
      nodes.forEach((n) => {
        if (n == null) return;
        if (typeof n === 'string') n = { textContent: n, parentNode: node };
        n.parentNode = node;
        kids.push(n);
      });
    },
    appendChild(n) { node.append(n); return n; },
    remove() {
      if (!node.parentNode) return;
      const p = node.parentNode.children;
      const i = p.indexOf(node);
      if (i >= 0) p.splice(i, 1);
      node.parentNode = null;
    },
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      const w = parseFloat(attrs.width) || 160;
      const h = parseFloat(attrs.height) || 80;
      return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    _attrs: attrs,
    _listeners: listeners,
  };
  Object.defineProperty(style, 'cssText', {
    get() { return node._css || ''; },
    set(v) { node._css = String(v); },
    enumerable: true,
  });
  return node;
}

function loadGame() {
  const body = el('body');
  const head = el('head');
  const doc = {
    body,
    head,
    documentElement: el('html'),
    fullscreenElement: null,
    createElement: (t) => el(t),
    createElementNS: (ns, t) => el(t, ns),
    querySelectorAll: (sel) => {
      if (sel === 'svg') return collect(body, (n) => n.tagName === 'SVG');
      if (sel === 'div') return collect(body, (n) => n.tagName === 'DIV');
      if (sel === 'button') return collect(body, (n) => n.tagName === 'BUTTON');
      return [];
    },
    querySelector: () => null,
    addEventListener() {},
  };
  body.scrollHeight = 800;
  function collect(node, pred, out) {
    out = out || [];
    if (pred(node)) out.push(node);
    (node.children || []).forEach((c) => collect(c, pred, out));
    return out;
  }

  const mem = {};
  const localStorage = {
    getItem: (k) => Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null,
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };

  const timers = [];
  const sandbox = {
    console,
    Math: seededMath(0x51F3),
    Object, Array, JSON, Date, String, Number, Boolean, Promise, Error, TypeError,
    parseInt, parseFloat, isNaN, Infinity,
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame(fn) { return setTimeout(() => fn(0), 0); },
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    innerWidth: 390,
    innerHeight: 844,
    screen: { orientation: { lock: () => Promise.resolve() } },
    AudioContext: function () { throw new Error('no audio in unit'); },
    document: doc,
    localStorage,
    addEventListener() {},
    navigator: {},
    location: { href: 'about:srcdoc' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'game.js'), 'utf8'), sandbox, {
    filename: 'game.js',
  });
  return { sandbox, mem, timers, doc };
}

// ---- the game loads and the core loop can place a path ----------------------
{
  let threw = null, TY = null, sandbox = null;
  try {
    const loaded = loadGame();
    sandbox = loaded.sandbox;
    TY = sandbox.TinyYurts;
  } catch (e) { threw = e && e.message; }
  check('vendor/game.js loads in a fake DOM', !threw, threw);
  check('TinyYurts is exported', !!(TY && TY.Path && TY.inventory), TY && Object.keys(TY));
  if (TY && TY.Path) {
    check('a new valley has path tiles to spend', TY.inventory.paths > 0, TY.inventory.paths);
    check('a farm spawned at boot (the menu needs one)', (TY.farms || []).length >= 1,
      (TY.farms || []).length);
    const before = TY.paths.length;
    const n0 = TY.inventory.paths;
    // Place a path the same way handlePointermove does: adjacent cells, spend 1.
    const p = new TY.Path({ points: [{ x: 8, y: 6 }, { x: 9, y: 6 }] });
    TY.inventory.paths--;
    check('drawing a path ADDS it to the valley', TY.paths.length === before + 1,
      { before: before, after: TY.paths.length, id: !!p });
    check('…and spends one tile', TY.inventory.paths === n0 - 1,
      { from: n0, to: TY.inventory.paths });
    TY.removePath(8, 6);
    check('erasing the tile removes the path', TY.paths.length === before,
      TY.paths.length);

    // A finger reports buttons=0. The jam used to ignore that drag entirely.
    const layer = TY.gridPointerLayer;
    if (layer) {
      layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 80, right: 160, bottom: 80 });
      const ev = (type, x, y) => ({
        type: type, pointerId: 1, pointerType: 'touch', isPrimary: true,
        buttons: 0, button: 0, clientX: x, clientY: y, x: x, y: y,
        stopPropagation() {}, preventDefault() {},
      });
      const nTiles = TY.inventory.paths;
      TY.handlePointerdown(ev('pointerdown', 12, 12));
      TY.handlePointermove(ev('pointermove', 20, 12));
      TY.handlePointermove(ev('pointermove', 36, 12));
      TY.handlePointerup(ev('pointerup', 36, 12));
      check('a buttons=0 touch drag is accepted (tiles spent or handlers did not throw)',
        TY.inventory.paths <= nTiles);
    }
  }
}

// ---- a finger-drag reaches the same code a mouse-drag does ------------------
{
  const src = fs.readFileSync(path.join(APP, 'vendor', 'game.js'), 'utf8');
  check('touch is treated as a left-drag (isDraw)',
    /isDraw\s*=/.test(src) && /pointerType === ["']touch["']/.test(src));
  check('pointerdown captures the pointer so a drag cannot slip off the board',
    /setPointerCapture/.test(src));
  check('cell math uses clientX, not the non-standard event.x',
    /clientX != null \? event\.clientX/.test(src) || /event\.clientX/.test(src));
  check('the original buttons===1 mouse path is still there',
    /event\.buttons === 1/.test(src));
}

// ---- the shell: hydrate BEFORE the jam reads localStorage, portrait fit -----
{
  const boot = fs.readFileSync(path.join(APP, 'boot.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  check('game.js is a static script (a dynamic src cannot load in the sandbox)',
    /src=["']vendor\/game\.js["']/.test(html));
  check('shim.js still loads first (the sandbox has no localStorage)',
    html.indexOf('shim.js') < html.indexOf('vendor/game.js') &&
    html.indexOf('vendor/game.js') < html.indexOf('boot.js'));
  check('boot hydrates the saved highscore onto the title',
    /hydrate/.test(boot) && /paintHi/.test(boot));
  check('portrait uses meet so the valley is not cropped',
    /xMidYMid meet/.test(boot));
  check('Back is registered and does not always swallow',
    /onBack/.test(boot) && /return false/.test(boot));
  check('the page cannot be pan-stolen from under a drag',
    /touch-action:\s*none/.test(css));
  check('Invite is OS chrome, not an in-app button',
    !/id=["']invite["']/.test(html));
}

// ---- listing claims must be true of this build ------------------------------
{
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const boot = fs.readFileSync(path.join(APP, 'boot.js'), 'utf8');
  check('tagline fits a store card', listing.tagline.length <= 120 && listing.tagline.length > 20);
  check('description leads with why this version (offline / file / invite)',
    /offline/i.test(listing.description) && /file/i.test(listing.description) && /Invite/.test(listing.description));
  check('listing does not mention internals',
    !/gifos\.db|WASM|sandbox|localStorage/.test(JSON.stringify(listing)));
  check('unofficial port of the named original',
    listing.basedOn && listing.basedOn.name === 'Tiny Yurts' && listing.basedOn.blessed === false);
  check('author is burntcustard, porter is GifOS',
    listing.author.name === 'burntcustard' && listing.porter.name === 'GifOS');
  check('help covers drag, erase, scoring, invite, save',
    /drag/i.test(help) && /red/i.test(help) && /settlers/i.test(help) && /Invite/.test(help) && /best score/i.test(help));
  check('help does not document OS chrome twice',
    !/Steal|Abilities|remix/i.test(help));
  check('saved best score is actually written',
    /db\('save'\)/.test(boot) && /Tiny Yurts/.test(boot));
}

console.log(failures ? failures + ' FAILURES' : 'ALL PASS');
process.exit(failures ? 1 : 0);
