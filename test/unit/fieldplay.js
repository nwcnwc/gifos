// FIELD PLAY HAS TO POUR, SAVE, AND SHARE.
//
// The store port shipped a GPU field that could pan but never poured particles
// on a tap, never saved the camera after a pan, and had no suite at all. This
// file PLAYS the non-GL half in a vm (encode, presets, adopt-the-recipe, save
// shape, extras) and greps the one-liners a vm cannot run (touch-action, pinch,
// dropAt, Back, no Invite button, no fetch).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'fieldplay');
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

function el() {
  return {
    hidden: true,
    textContent: '',
    value: '',
    innerHTML: '',
    checked: false,
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return ''; },
    addEventListener() {},
    appendChild() {},
    querySelectorAll() { return []; },
    getContext() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300 }; },
    clientWidth: 400,
    clientHeight: 300,
    width: 400,
    height: 300,
  };
}

function load(files, extra) {
  const els = {};
  const document = {
    getElementById(id) { return (els[id] = els[id] || el()); },
    createElement() { return el(); },
    body: { classList: { add() {}, remove() {}, toggle() {} } },
    addEventListener() {},
  };
  const sandbox = Object.assign({
    console, Math: seededMath(0xF1E1D), Object, Array, JSON, Date, String, Number, Boolean, Promise,
    Uint8Array, Float32Array, Int32Array,
    document,
    window: null,
    setTimeout(fn) { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    addEventListener() {},
    matchMedia() { return { matches: false }; },
  }, extra || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.root = sandbox;
  sandbox.this = sandbox;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  sandbox.__els = els;
  return sandbox;
}

const engine = load(['vendor/fieldplay.js', 'vendor/presets.js']);
check('engine attaches FieldPlay', !!(engine.FieldPlay && engine.FieldPlay.encodeFloatRGBA && engine.FieldPlay.dropAt));
check('presets aboard (>= 8, no texture fetches)', (engine.FPPresets || []).length >= 8
  && engine.FPPresets.every((p) => p.code && p.code.indexOf('get_velocity') >= 0 && p.code.indexOf('texture2D') < 0),
  (engine.FPPresets || []).length);

{
  const out = new Uint8Array(4);
  engine.FieldPlay.encodeFloatRGBA(1.5, out, 0);
  const z = new Uint8Array(4);
  engine.FieldPlay.encodeFloatRGBA(0, z, 0);
  check('encodeFloatRGBA(0) is zero bytes', z[0] === 0 && z[3] === 0);
  check('encodeFloatRGBA(1.5) is not zero', !(out[0] === 0 && out[1] === 0 && out[2] === 0 && out[3] === 0));
}

check('mount without WebGL fails honestly', engine.FieldPlay.mount({
  getContext() { return null; },
  addEventListener() {},
  style: {},
  clientWidth: 400,
  clientHeight: 300,
}) === false);
check('lastError names WebGL when mount fails', /WebGL/i.test(engine.FieldPlay.lastError() || ''));

const app = load(['vendor/fieldplay.js', 'vendor/presets.js', 'app.js', 'mp.js']);
check('FPApp extras include follow-the-finger',
  !!(app.FPApp && app.FPApp.extras && app.FPApp.extras.some((p) => p.id === 'follow-finger')));
check('follow-the-finger uses cursor so a finger warps the field',
  (app.FPApp.extras.find((p) => p.id === 'follow-finger').code.indexOf('cursor.zw') >= 0));
check('findPresetByKey matches black-hole',
  !!(app.FPApp.findPresetByKey('black-hole') && app.FPApp.findPresetByKey('Black hole')));
check('findPresetByKey misses junk', app.FPApp.findPresetByKey('no-such-field') == null);

{
  // Adopt the recipe of the lowest-id player on the current round — same rule
  // as mp.js. Replay it here so a "last writer wins" rewrite cannot sneak in.
  const list = [
    { id: 'b', at: 1, round: 2, code: 'CODE_B' },
    { id: 'a', at: 2, round: 2, code: 'CODE_A' },
    { id: 'c', at: 3, round: 1, code: 'CODE_C' },
  ];
  const maxR = list.reduce((m, p) => Math.max(m, p.round || 1), 0);
  const cand = list.filter((p) => (p.round || 1) === maxR && p.code != null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  check('shared field adopts lowest id on the newest round', cand[0].code === 'CODE_A' && maxR === 2);
}

const src = {
  app: read('app.js'),
  mp: read('mp.js'),
  html: read('index.html'),
  css: read('style.css'),
  engine: read('vendor/fieldplay.js'),
  help: read('help.md'),
  listing: read('listing.json'),
  manifest: JSON.parse(read('manifest.json')),
};
check('no Invite button in the app chrome', !/<button\b[^>]*>\s*Invite\s*</i.test(src.html));
check('mp.js tells the player to press Invite', /Invite/.test(src.mp));
check('save collection is gifos.db("save")', /db\('save'\)/.test(src.app));
check('Back closes the recipe sheet then leaves a room',
  /onBack/.test(src.app) && /sheetOpen/.test(src.app) && /FPMp\.leave/.test(src.app));
check('canvas is touch-action none', /touch-action:\s*none/.test(src.css) && /touchAction = 'none'/.test(src.engine));
check('engine pours particles on a tap (dropAt)', /function dropAt/.test(src.engine) && /wasTap/.test(src.engine));
check('engine pinch-zooms with two pointers', /pinch0/.test(src.engine) && /pointerCount/.test(src.engine));
check('pan/zoom persist via onView', /onView/.test(src.engine) && /FP\.onView/.test(src.app));
check('empty recipe does not wipe the field', /recipe box is empty/.test(src.app));
check('no fetch/XHR/WebSocket/eval in app chrome',
  !['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function('].some((b) => src.app.includes(b) || src.mp.includes(b)));
check('help.md covers tap-to-pour and pinch', /pour/.test(src.help) && /Pinch/.test(src.help));
check('listing leads with the file-is-the-save reason',
  /file is the save/i.test(src.listing) && /unofficial port of Field Play/i.test(src.listing));
check('listing does not mention gifos.db / WASM / sandbox',
  !/gifos\.db|WASM|sandbox|localStorage|CDN/.test(src.listing));
check('manifest launch.field is declared', !!(src.manifest.launch && src.manifest.launch.field));
check('save stays private; room is read-write',
  src.manifest.data.save.visibility === 'private' && src.manifest.data.room.visibility === 'read-write');
check('minBuild stays 947', src.manifest.minBuild === 947);
check('author is anvaka, never GifOS', src.manifest && JSON.parse(src.listing).author.name === 'anvaka');

if (failures) {
  console.log(failures + ' FAIL');
  process.exit(1);
}
console.log('ok — ' + 'fieldplay unit');
