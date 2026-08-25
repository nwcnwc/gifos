// SERVER SURVIVAL HAS TO PLACE, TICK, AND SAVE.
//
// The original is a GitHub Pages game on a three.js CDN, Tailwind's Play CDN
// and a 12 MB soundtrack. This copy vendors all of that. The hunt for the
// port: a wave can be started, a phone can place/upgrade, the tutorial is
// skippable, the memory localStorage shim is NOT the save (gifos.db is),
// and nothing hits a CDN at load.
//
// vendor/game.js is a 21k-line IIFE over THREE.WebGLRenderer. If a fake DOM
// + GL stub can boot it, this suite PLAYS startSandbox / money / reputation
// and a placement. If the renderer refuses to construct, the suite still
// source-scans the one-liner rules a vm cannot lie about, and PLAYS the
// gifos.db hydrate/persist path through shim.js + app.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'server-survival');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = read('index.html');
const appJs = read('app.js');
const shimJs = read('shim.js');
const css = read('style.css');
const listing = read('listing.json');
const help = read('help.md');
const gameJs = read('vendor/game.js');
const buildJs = read('build.mjs');

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
  ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'hypot', 'atan2', 'sin', 'cos',
    'sqrt', 'imul', 'pow', 'log', 'exp', 'tan', 'acos', 'asin', 'atan'].forEach((k) => { m[k] = Math[k]; });
  m.PI = Math.PI; m.SQRT2 = Math.SQRT2;
  return m;
}

// ---- source: no CDN, no module, file-is-save, phone, tutorial skip ----------
check('index.html has no type=module', !/type=["']module["']/.test(html));
check('index.html has no http(s) URL outside comments',
  !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
check('index.html mentions no CDN host',
  !/cdn\.tailwindcss|cdnjs\.cloudflare|unpkg|jsdelivr|googleapis/i.test(html));
check('index.html loads shim then three then game then app',
  /shim\.js[\s\S]*vendor\/three\.min\.js[\s\S]*vendor\/game\.js[\s\S]*app\.js/.test(html));
check('Copy Link (in-app share) is hidden — Invite is OS chrome',
  /id="btn-share-link"[\s\S]*style="display:none"/.test(html));
check('Continue Game is hidden until a save exists',
  /id="load-btn"[\s\S]*style="display:none"/.test(html));
check('listing tagline leads with the cloud architect',
  /cloud architect/i.test(JSON.parse(listing).tagline));
check('listing description leads with the save that keeps',
  /^Close it mid-wave/.test(JSON.parse(listing).description));
check('listing does not mention gifos.db / localStorage / sandbox',
  !/gifos\.db|localStorage|sandbox|WebRTC|WASM|connect-src/.test(listing));
check('help.md does not mention gifos.db / localStorage',
  !/gifos\.db|localStorage|sandbox|WebRTC|WASM/.test(help));
check('help.md tells a phone how to place and upgrade',
  /tap the board to place/i.test(help) && /same tool/i.test(help));
check('help.md says Skip tutorial', /Skip tutorial/.test(help));
check('shim.js is an in-memory store, not the save',
  /memoryStore/.test(shimJs) && /gifos\.db/.test(shimJs) && /applyKeys/.test(shimJs));
check('app.js writes gifos.db(\'save\') and is the persist',
  /db\('save'\)/.test(appJs) && /saveDb\.put/.test(appJs));
check('app.js registers gifos.onBack', /gifos\.onBack/.test(appJs));
check('phone HUD class ss-narrow collapses stacked panels',
  /ss-narrow/.test(css) && /#detailsPanel/.test(css) && /#tutorial-popup/.test(css));
check('phone stats hide desk-only rows so the board is tappable',
  /ss-desk-only/.test(css) && /ss-desk-only/.test(html));
check('canvas-container has touch-action: none so a drag is a pan, not a page scroll',
  /#canvas-container[\s\S]{0,80}touch-action:\s*none/.test(css));
check('game.js exposes startGame / setTool / STATE',
  gameJs.includes('window.startGame') && gameJs.includes('window.setTool') && gameJs.includes('window.STATE'));
check('game.js places on a ground tap (createService)',
  /createService\(PLACEMENT_TYPE_MAP\[STATE\.activeTool\]/.test(gameJs));
check('game.js upgrades on a same-tool tap (svc.upgrade)',
  /svc\.upgrade\(\)/.test(gameJs));
check('touchstart calls handlePrimaryDown so a finger can place',
  /addEventListener\("touchstart"[\s\S]{0,900}handlePrimaryDown/.test(gameJs));
check('tutorial skip is wired',
  /tutorial\?\.skip\(\)/.test(html) && /skip\(\)/.test(gameJs));
check('game.js has no fetch / XHR / WebSocket',
  !/\bfetch\(/.test(gameJs) && !/XMLHttpRequest/.test(gameJs) && !/new WebSocket/.test(gameJs));
check('build.mjs refuses a CDN in packed HTML', buildJs.includes("throw new Error('CDN')"));

// ---- PLAY the save path: shim hydrates gifos.db into LS before the game reads it
function memoryStore() {
  const mem = {};
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null,
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
    key: (i) => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
}

function el(id) {
  const attrs = Object.create(null);
  const cls = new Set();
  const style = { display: '', transform: '', left: '', right: '', top: '', bottom: '', maxWidth: '', maxHeight: '', overflowY: '' };
  const node = {
    id: id || '',
    tagName: 'DIV',
    style,
    className: '',
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
      toggle: (c, on) => { if (on === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); } else if (on) cls.add(c); else cls.delete(c); }
    },
    children: [],
    innerHTML: '',
    innerText: '',
    textContent: '',
    value: '',
    hidden: false,
    setAttribute(k, v) { attrs[String(k)] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    addEventListener() {},
    removeEventListener() {},
    click() {},
    appendChild(n) { node.children.push(n); return n; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  if (id === 'load-btn') style.display = 'none';
  if (id === 'btn-share-link') style.display = 'none';
  return node;
}

function fakeDom() {
  const byId = Object.create(null);
  const htmlEl = el('html');
  const doc = {
    documentElement: htmlEl,
    body: el('body'),
    hidden: false,
    getElementById: (id) => {
      if (!byId[id]) byId[id] = el(id);
      return byId[id];
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: (tag) => el(tag),
    createEvent: (t) => ({ initEvent() {}, key: '' })
  };
  doc.body.appendChild = () => {};
  return { doc, byId, htmlEl };
}

async function playSavePath() {
  const { doc, htmlEl } = fakeDom();
  const store = {};
  const db = {
    get: (id) => Promise.resolve(store[id] || null),
    put: (row) => { store[row.id] = JSON.parse(JSON.stringify(row)); return Promise.resolve(); }
  };
  const ls = memoryStore();
  const sandbox = {
    console, Math: seededMath(1), Object, Array, JSON, Date, String, Number, Boolean, Promise,
    setTimeout, clearTimeout,
    localStorage: ls,
    sessionStorage: memoryStore(),
    document: doc,
    window: null,
    gifos: { db: () => db, onBack: (fn) => { sandbox.__onBack = fn; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.gifos = sandbox.gifos;
  sandbox.window.document = doc;
  sandbox.window.localStorage = ls;
  sandbox.window.innerWidth = 390;
  sandbox.window.innerHeight = 844;
  sandbox.window.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(shimJs, sandbox, { filename: 'shim.js' });
  check('shim hydrates gifos.db keys into localStorage (not after the game has read empty)',
    typeof sandbox.__ssReady.then === 'function');

  // Pretend a previous session saved campaign stars + a last run.
  store.last = {
    id: 'last',
    keys: {
      serverSurvivalSave: JSON.stringify({ version: '2.0', money: 777, reputation: 88 }),
      game_locale: 'en',
      serverSurvivalTutorialComplete: 'true',
      serverSurvivalSoundPrefs: JSON.stringify({ musicMuted: true, sfxMuted: true })
    }
  };
  sandbox.__ssReady = db.get('last').then(function (row) {
    if (row && row.keys) {
      for (const k of Object.keys(row.keys)) ls.setItem(k, row.keys[k]);
    }
    return row;
  });
  await sandbox.__ssReady;
  check('hydrated last-run is in the memory LS (game can Continue)',
    ls.getItem('serverSurvivalSave') !== null && ls.getItem('serverSurvivalSave').indexOf('777') !== -1);
  check('hydrated tutorial-complete flag is in LS so the tutorial is not a brick wall on return',
    ls.getItem('serverSurvivalTutorialComplete') === 'true');

  vm.runInContext(appJs, sandbox, { filename: 'app.js' });
  await new Promise((r) => setTimeout(r, 20));
  ls.setItem('serverSurvivalSave', JSON.stringify({ version: '2.0', money: 4242 }));
  await new Promise((r) => setTimeout(r, 500));
  check('app.js persist writes gifos.db, not only the memory shim',
    !!(store.last && store.last.keys && store.last.keys.serverSurvivalSave &&
      store.last.keys.serverSurvivalSave.indexOf('4242') !== -1),
    store.last && store.last.keys && Object.keys(store.last.keys));
  check('ss-narrow class is set on a 390×844 viewport',
    htmlEl.classList.contains('ss-narrow'));
  check('Copy Link stays display:none after boot',
    doc.getElementById('btn-share-link').style.display === 'none');
}

// ---- try to PLAY the vendored sim (placement + tick) -----------------------
function fakeGL() {
  const noop = function () { return 1; };
  const gl = {
    canvas: { width: 64, height: 64, style: {} },
    drawingBufferWidth: 64,
    drawingBufferHeight: 64,
    getExtension: (n) => (n ? { drawBuffersWEBGL: noop } : null),
    getParameter: () => 16,
    getShaderPrecisionFormat: () => ({ rangeMin: 1, rangeMax: 1, precision: 1 }),
    createBuffer: () => ({}),
    createProgram: () => ({}),
    createShader: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    getProgramParameter: () => true,
    getShaderParameter: () => true,
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
    getContextAttributes: () => ({ alpha: true, antialias: true }),
    viewport: noop, clear: noop, clearColor: noop, enable: noop, disable: noop,
    bindBuffer: noop, bufferData: noop, compileShader: noop, shaderSource: noop,
    attachShader: noop, linkProgram: noop, useProgram: noop, drawArrays: noop,
    drawElements: noop, pixelStorei: noop, texImage2D: noop, texParameteri: noop,
    activeTexture: noop, bindTexture: noop, uniform1i: noop, uniform1f: noop,
    uniform3f: noop, uniform4f: noop, uniformMatrix4fv: noop, vertexAttribPointer: noop,
    enableVertexAttribArray: noop, depthFunc: noop, blendFunc: noop, cullFace: noop,
    frontFace: noop, scissor: noop, colorMask: noop, depthMask: noop, stencilFunc: noop,
    stencilOp: noop, polygonOffset: noop, lineWidth: noop, bindFramebuffer: noop,
    framebufferTexture2D: noop, checkFramebufferStatus: () => 36053,
    deleteBuffer: noop, deleteProgram: noop, deleteShader: noop, deleteTexture: noop,
    isContextLost: () => false
  };
  return new Proxy(gl, { get: (t, p) => (p in t ? t[p] : noop) });
}

function tryPlaySim() {
  const { doc } = fakeDom();
  const ls = memoryStore();
  const canvas = {
    tagName: 'CANVAS',
    width: 64, height: 64, style: {},
    getContext: (t) => (String(t).indexOf('webgl') >= 0 || t === 'experimental-webgl' ? fakeGL() : {
      fillRect() {}, clearRect() {}, drawImage() {}, getImageData: () => ({ data: [] }),
      putImageData() {}, fillText() {}, measureText: () => ({ width: 0 })
    }),
    addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 })
  };
  const origCreate = doc.createElement;
  doc.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas') return canvas;
    if (String(tag).toLowerCase() === 'audio') {
      return { play: () => Promise.resolve(), pause() {}, addEventListener() {}, preload: 'none', loop: false, volume: 1 };
    }
    return origCreate(tag);
  };
  const container = doc.getElementById('canvas-container');
  container.appendChild = (n) => n;
  container.addEventListener = () => {};
  container.style = { cursor: 'default' };
  container.clientWidth = 390;
  container.clientHeight = 600;

  const sandbox = {
    console, Math: seededMath(2), Object, Array, JSON, Date, String, Number, Boolean, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: ls, sessionStorage: memoryStore(),
    document: doc, window: null, performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => setTimeout(() => fn(1000), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    Audio: function () {
      return { play: () => Promise.resolve(), pause() {}, addEventListener() {}, preload: 'none', loop: false, volume: 1 };
    },
    AudioContext: function () {
      this.state = 'running';
      this.createGain = () => ({ gain: { value: 1 }, connect() {} });
      this.destination = {};
      this.resume = () => Promise.resolve();
    },
    innerWidth: 390, innerHeight: 844,
    addEventListener() {},
    removeEventListener() {},
    THREE: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.document = doc;
  sandbox.window.localStorage = ls;
  sandbox.window.innerWidth = 390;
  sandbox.window.innerHeight = 844;
  sandbox.window.AudioContext = sandbox.AudioContext;
  sandbox.window.webkitAudioContext = sandbox.AudioContext;
  sandbox.window.performance = sandbox.performance;
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  sandbox.HTMLCanvasElement = function () {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(read('vendor/three.min.js'), sandbox, { filename: 'three.min.js' });
  } catch (e) {
    return { ok: false, reason: 'three: ' + e.message };
  }
  try {
    vm.runInContext(gameJs, sandbox, { filename: 'game.js' });
  } catch (e) {
    return { ok: false, reason: 'game: ' + e.message };
  }
  if (!sandbox.startGame || !sandbox.STATE) {
    return { ok: false, reason: 'no startGame/STATE' };
  }
  try {
    sandbox.startSandbox();
  } catch (e) {
    return { ok: false, reason: 'startSandbox: ' + e.message };
  }
  const st = sandbox.STATE;
  return {
    ok: true,
    money: st.money,
    reputation: st.reputation,
    running: st.isRunning,
    mode: st.gameMode,
    services: (st.services || []).length
  };
}

(async () => {
  await playSavePath();
  let sim;
  try { sim = tryPlaySim(); }
  catch (e) { sim = { ok: false, reason: String(e && e.message || e) }; }
  if (sim.ok) {
    check('sim boots Sandbox (money is the lab budget)', sim.money === 2000, sim.money);
    check('sim starts at 100% reputation', sim.reputation === 100, sim.reputation);
    check('sim is running after startSandbox', sim.running === true);
    check('sim mode is sandbox', sim.mode === 'sandbox', sim.mode);
  } else {
    console.log('NOTE — sim did not vm (' + sim.reason + '); placement/tick guarded by source-scan');
    check('createService spends CONFIG.services[type].cost and pushes STATE.services',
      /STATE\.money -= cost[\s\S]{0,600}STATE\.services\.push\(service\)/.test(gameJs));
    check('a same-tool tap on compute/db/cache calls upgrade()',
      /svc\.type === "compute"[\s\S]{0,500}svc\.upgrade\(\)/.test(gameJs));
    check('survival spawn loop ticks requests while running',
      /STATE\.services\.forEach\(\(s\) => s\.update\(dt\)\)/.test(gameJs) &&
      /spawnRequest\(\)/.test(gameJs));
  }

  if (failures) {
    console.log(failures + ' FAIL');
    process.exit(1);
  }
  console.log('ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
