// POLYGON SHREDDER HAS TO DEGRADE, AIM, AND SAVE.
//
// The store port shipped a 64² cloud with no float-texture probe, so a weak
// GPU got a black square, and the first tap never aimed the spawn. This suite
// PLAYS the non-GL half (params, mp adopt, defaults) and greps the one-liners
// a vm cannot run (touch-action, first-tap aim, Back, Invite, no fetch).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'polygon-shredder');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function el() {
  return {
    hidden: true, textContent: '', value: '', innerHTML: '', checked: false, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, appendChild() {},
    clientWidth: 800, clientHeight: 500,
  };
}

function load(files, extra) {
  const els = {};
  const sandbox = Object.assign({
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    Uint8Array, Float32Array, Int32Array,
    document: {
      getElementById(id) { return (els[id] = els[id] || el()); },
      createElement() { return el(); },
      body: { classList: { add() {}, remove() {}, toggle() {} } },
      addEventListener() {},
    },
    window: null,
    setTimeout() { return 0; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    THREE: undefined,
    Simulation: undefined,
  }, extra || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  sandbox.__els = els;
  return sandbox;
}

{
  const ctx = { console, Math, THREE: undefined };
  vm.runInNewContext(read('vendor/shaders.js') + '\nresult = Object.keys(PSShaders).sort().join(",");', ctx);
  check('all five shaders aboard',
    ctx.result === 'fs-particles,fs-particles-shadow,texture_fragment_simulation_shader,texture_vertex_simulation_shader,vs-particles',
    ctx.result);
}

const S = load(['vendor/shaders.js', 'vendor/shredder.js']);
check('PolygonShredder attaches', !!(S.PolygonShredder && S.PolygonShredder.getParams && S.PolygonShredder.mount));
{
  const p = S.PolygonShredder.getParams();
  check('default knobs are the original mix',
    p.factor === 0.5 && p.evolution === 0.5 && p.rotation === 0.5 && p.radius === 2 && p.scale === 1 && p.pulsate === false);
  S.PolygonShredder.setParams({ factor: 0.9, pulsate: true, radius: 3 });
  const q = S.PolygonShredder.getParams();
  check('setParams keeps a saved mix', q.factor === 0.9 && q.pulsate === true && q.radius === 3 && q.evolution === 0.5);
  S.PolygonShredder.setParams({ factor: 0.5, pulsate: false, radius: 2 });
}
check('mount without THREE fails honestly', S.PolygonShredder.mount({ clientWidth: 400 }) === false);
check('lastError names the miss', /could not load/i.test(S.PolygonShredder.lastError() || ''));

{
  const list = [
    { id: 'b', at: 1, round: 2, st: { factor: 0.2 } },
    { id: 'a', at: 2, round: 2, st: { factor: 0.8 } },
    { id: 'c', at: 3, round: 1, st: { factor: 0.1 } },
  ];
  const maxR = list.reduce((m, p) => Math.max(m, p.round || 1), 0);
  const cand = list.filter((p) => (p.round || 1) === maxR && p.st)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  check('shared shred adopts lowest id on the newest round', cand[0].st.factor === 0.8 && cand[0].id === 'a');
}

const src = {
  app: read('app.js'),
  mp: read('mp.js'),
  html: read('index.html'),
  css: read('style.css'),
  engine: read('vendor/shredder.js'),
  sim: read('vendor/Simulation.js'),
  help: read('help.md'),
  listing: read('listing.json'),
  manifest: JSON.parse(read('manifest.json')),
};
check('no Invite button in the app chrome', !/<button\b[^>]*>\s*Invite\s*</i.test(src.html));
check('mp.js tells the player to press Invite', /Invite/.test(src.mp));
check('save collection is gifos.db("save")', /db\('save'\)/.test(src.app));
check('Back closes knobs then leaves a room',
  /onBack/.test(src.app) && /sheetOpen/.test(src.app) && /PSMp\.leave/.test(src.app));
check('canvas is touch-action none', /touch-action:\s*none/.test(src.css) && /touchAction = 'none'/.test(src.engine));
check('first tap aims the spawn', /aimFromEvent/.test(src.engine) && /pointerdown/.test(src.engine));
check('float-texture probe before the sim starts', /pickFloat/.test(src.engine) && /__psFloatType/.test(src.sim));
check('GPU remount tries 64 then 32 then 16', /mount\(stage, 32\)/.test(src.app) && /mount\(stage, 16\)/.test(src.app));
check('no spotlight.jpg fetch', !src.engine.includes('spotlight.jpg') && /spotlightTexture/.test(src.engine));
check('no fetch/XHR/WebSocket/eval in app chrome',
  !['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function('].some((b) => src.app.includes(b) || src.mp.includes(b)));
check('help.md covers pinch, knobs sheet, GPU honesty',
  /Pinch/.test(src.help) && /Knobs/.test(src.help) && /black square/.test(src.help));
check('listing leads with the file-is-the-save reason',
  /live in the file/.test(src.listing) && /unofficial port of The Polygon Shredder/i.test(src.listing));
check('listing does not mention gifos.db / WASM / sandbox / WebGL',
  !/gifos\.db|WASM|sandbox|localStorage|CDN|WebGL|Three\.js/.test(src.listing));
check('save stays private; room is read-write',
  src.manifest.data.save.visibility === 'private' && src.manifest.data.room.visibility === 'read-write');
check('minBuild stays 947', src.manifest.minBuild === 947);
check('author is spite, never GifOS', JSON.parse(src.listing).author.name === 'spite');

if (failures) {
  console.log(failures + ' FAIL');
  process.exit(1);
}
console.log('ok — polygon-shredder unit');
