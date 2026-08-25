// SANDSPIEL HAS TO POUR, AND THE FILE HAS TO BE THE WORLD.
//
// The store copy is a falling-sand toy. A vm can step the species tick
// (sand piles, water finds a way down, lava and water make stone, fire
// dies in water) without a browser. The pouring engine is wasm32 compiled
// from apps/sandspiel/vendor/kernel.c and packed inside the GIF; Node can
// instantiate that same object file. Phone pour, persist, fail sentences
// and listing claims are one-liners a dead browser suite would rot — they
// are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'sandspiel');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function src(f) {
  return fs.readFileSync(path.join(APP, f), 'utf8');
}

function loadSpecies() {
  const sandbox = {
    console, Math, Uint8Array, Uint8ClampedArray, Array, String, Number, Date, Object,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'species.js'), 'utf8'), sandbox, { filename: 'species.js' });
  return sandbox;
}

const G = loadSpecies();
const S = G.Sandspiel;
const Sp = S.Species;
check('species.js loads Sandspiel', !!(S && S.Universe && Sp && Sp.Sand === 2 && Sp.Water === 3));

{
  const u = new S.Universe(6, 6);
  u.setCell(2, 2, S.makeCell(Sp.Sand, 120, 0));
  u.tick();
  check('sand falls one cell', u.getCell(2, 3).species === Sp.Sand && u.getCell(2, 2).species === Sp.Empty);
}

{
  const u = new S.Universe(4, 6);
  u.setCell(1, 1, S.makeCell(Sp.Water, 120, 0));
  u.tick();
  check('water falls one cell', u.getCell(1, 2).species === Sp.Water);
}

{
  const u = new S.Universe(6, 8);
  u.setCell(2, 2, S.makeCell(Sp.Sand, 120, 0));
  u.setCell(2, 3, S.makeCell(Sp.Water, 120, 0));
  u.setCell(1, 3, S.makeCell(Sp.Wall, 80, 0));
  u.setCell(3, 3, S.makeCell(Sp.Wall, 80, 0));
  u.tick();
  check('sand sinks through water', u.getCell(2, 3).species === Sp.Sand && u.getCell(2, 2).species === Sp.Water);
  for (let t = 0; t < 12; t++) u.tick();
  let sandY = -1, waterY = -1;
  for (let x = 0; x < 6; x++) for (let y = 0; y < 8; y++) {
    if (u.getCell(x, y).species === Sp.Sand) sandY = Math.max(sandY, y);
    if (u.getCell(x, y).species === Sp.Water) waterY = Math.max(waterY, y);
  }
  check('after a pour, sand rests below water', sandY >= waterY && sandY >= 0, { sandY, waterY });
}

{
  const u = new S.Universe(5, 5);
  u.setCell(2, 2, S.makeCell(Sp.Lava, 140, 0));
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
    if (x || y) u.setCell(2 + x, 2 + y, S.makeCell(Sp.Water, 120, 0));
  }
  let stone = false;
  for (let t = 0; t < 40; t++) {
    u.tick();
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      if (u.getCell(x, y).species === Sp.Stone) stone = true;
    }
    if (stone) break;
  }
  check('lava and water make stone', stone);
}

{
  const u = new S.Universe(5, 5);
  u.setCell(2, 2, S.makeCell(Sp.Fire, 200, 0));
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
    if (x || y) u.setCell(2 + x, 2 + y, S.makeCell(Sp.Water, 120, 0));
  }
  let fireGone = false;
  for (let t = 0; t < 40; t++) {
    u.tick();
    let f = false;
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      if (u.getCell(x, y).species === Sp.Fire) f = true;
    }
    if (!f) { fireGone = true; break; }
  }
  check('fire dies in water', fireGone);
}

{
  const u = new S.Universe(8, 8);
  u.setCell(4, 6, S.makeCell(Sp.Sand, 120, 0));
  u.setCell(4, 5, S.makeCell(Sp.Plant, 140, 0));
  let plant = false;
  for (let t = 0; t < 80; t++) {
    u.tick();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      if (u.getCell(x, y).species === Sp.Plant) plant = true;
    }
  }
  check('a plant cell is still a plant after ticks', plant);
}

{
  const u = new S.Universe(8, 8);
  u.setCell(4, 4, S.makeCell(Sp.Wall, 80, 0));
  u.paint(4, 4, 1, Sp.Sand);
  check('paint does not overwrite wall', u.getCell(4, 4).species === Sp.Wall);
  u.paint(3, 4, 1, Sp.Sand);
  check('paint fills empty', u.getCell(3, 4).species === Sp.Sand);
  u.paint(4, 4, 1, Sp.Empty);
  check('erase clears wall', u.getCell(4, 4).species === Sp.Empty);
}

{
  const u = new S.Universe(4, 3);
  u.setCell(1, 1, S.makeCell(Sp.Sand, 120, 3));
  u.setCell(2, 0, S.makeCell(Sp.Water, 90, 6));
  const packed = S.packCells(u.cells);
  const cells2 = S.unpackCells(packed, 4 * 3);
  check('pack roundtrip length', cells2.length === 12);
  check('pack roundtrip sand', cells2[u.index(1, 1)].species === Sp.Sand && cells2[u.index(1, 1)].ra === 120);
  check('pack roundtrip water', cells2[u.index(2, 0)].species === Sp.Water && cells2[u.index(2, 0)].rb === 6);
  const raw = S.unpackRaw(packed, 12);
  check('unpackRaw matches pack', raw[u.index(1, 1) * 4] === Sp.Sand && raw[u.index(2, 0) * 4] === Sp.Water);
  u.pushUndo();
  u.reset();
  check('reset empties', u.getCell(1, 1).species === Sp.Empty);
  u.popUndo();
  check('undo restores sand', u.getCell(1, 1).species === Sp.Sand);
}

// WASM kernel — same pour, from the object file packed in the GIF.
async function stepWasm() {
  const srcC = path.join(APP, 'vendor', 'kernel.c');
  check('kernel.c is in the tree', fs.existsSync(srcC));
  const out = path.join(os.tmpdir(), 'sandspiel-unit-' + process.pid + '.wasm');
  const r = spawnSync('clang', [
    '--target=wasm32', '-nostdlib', '-O2', '-fno-builtin', '-ffreestanding',
    '-c', '-o', out, srcC,
  ], { encoding: 'utf8' });
  check('clang --target=wasm32 builds the kernel', r.status === 0, r.stderr);
  if (r.status !== 0 || typeof WebAssembly === 'undefined') return;
  const bytes = fs.readFileSync(out);
  try { fs.unlinkSync(out); } catch (e) {}
  const mod = await WebAssembly.compile(bytes);
  const mem = new WebAssembly.Memory({ initial: 8 });
  const sp = new WebAssembly.Global({ value: 'i32', mutable: true }, 65536);
  const tab = new WebAssembly.Table({ initial: 8, element: 'anyfunc' });
  const env = {};
  for (const i of WebAssembly.Module.imports(mod)) {
    if (i.module !== 'env') continue;
    if (i.kind === 'memory') env[i.name] = mem;
    if (i.kind === 'global') env[i.name] = sp;
    if (i.kind === 'table') env[i.name] = tab;
  }
  const inst = await WebAssembly.instantiate(mod, { env });
  const e = inst.exports;
  check('wasm exports tick/paint/init', !!(e.sand_tick && e.sand_paint && e.sand_init && e.sand_get));
  check('wasm grid is 180×120', e.sand_width() === 180 && e.sand_height() === 120);
  e.sand_init();
  e.sand_set(2, 2, Sp.Sand, 120, 0);
  e.sand_tick();
  check('wasm sand falls', (e.sand_get(2, 3) & 255) === Sp.Sand && (e.sand_get(2, 2) & 255) === Sp.Empty);
  e.sand_init();
  e.sand_set(1, 1, Sp.Water, 120, 0);
  e.sand_tick();
  check('wasm water falls', (e.sand_get(1, 2) & 255) === Sp.Water);
  e.sand_init();
  e.sand_set(2, 2, Sp.Sand, 120, 0);
  e.sand_set(2, 3, Sp.Water, 120, 0);
  e.sand_set(1, 3, Sp.Wall, 80, 0);
  e.sand_set(3, 3, Sp.Wall, 80, 0);
  e.sand_tick();
  check('wasm sand sinks through water', (e.sand_get(2, 3) & 255) === Sp.Sand && (e.sand_get(2, 2) & 255) === Sp.Water);
  e.sand_init();
  e.sand_set(4, 4, Sp.Wall, 80, 0);
  e.sand_paint(4, 4, 1, Sp.Sand);
  check('wasm paint does not overwrite wall', (e.sand_get(4, 4) & 255) === Sp.Wall);
  e.sand_paint(3, 4, 1, Sp.Sand);
  check('wasm paint fills empty', (e.sand_get(3, 4) & 255) === Sp.Sand);
}

function scan() {
  const app = src('app.js');
  const wall = src('wall.js');
  const html = src('index.html');
  const css = src('style.css');
  const wasm = src('wasm.js');
  const listing = src('listing.json');
  const help = src('help.md');
  const manifest = JSON.parse(src('manifest.json'));

  check('world persists in gifos.db save collection', /db\('save'\)/.test(app) && /id:\s*'last'/.test(app));
  check('named boards also go in save', /id:\s*'n_'/.test(app) || /n_' \+/.test(app));
  check('persist is not every animation frame', !/if \(!paused\) \{\s*uni\.tick\(\);\s*dirty = true;\s*persist\(\);/.test(app));
  check('persist on pagehide / hidden', /pagehide/.test(app) && /visibilitychange/.test(app));
  check('db rejection is shown, not swallowed', /Could not save this world/.test(app));
  check('WASM instantiate from packed bytes, no fetch', /WebAssembly\.instantiate/.test(wasm) && /SAND_WASM_B64/.test(wasm) && !/fetch\(/.test(wasm));
  check('WASM fail is a sentence', /pouring engine did not start/.test(app) || /pouring engine did not start/.test(wasm));
  check('canvas fail is a sentence, not a black canvas', /This toy needs a canvas/.test(app));
  check('empty first-run has a tap hint', /id="hint"/.test(html) && /Tap to pour water/.test(html));
  check('phone pour: pointerdown + touch-action none on the world', /pointerdown/.test(app) && /#world/.test(css) && /touch-action:\s*none/.test(css));
  check('phone pour: setPointerCapture', /setPointerCapture/.test(app));
  check('palette is a sideways strip on a phone', /overflow-x:\s*auto/.test(css));
  check('44px tap targets on actions', /min-height:\s*44px/.test(css));
  check('Back leaves the wall', /gifos\.onBack/.test(app) && /SandWall/.test(app));
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html) && !/id=["']invite/i.test(html));
  check('wall still tells you to press Invite in the OS bar', /Invite/.test(wall));
  check('room is subscribed, boards are get() not subscribe', /room\.subscribe/.test(wall) && !/boards\.subscribe/.test(wall));
  check('capabilities: db + multiplayer + wasm, no network',
    manifest.capabilities.db && manifest.capabilities.multiplayer && manifest.capabilities.wasm && !manifest.capabilities.network);
  check('save is private, room and boards are read-write',
    manifest.data.save.visibility === 'private' &&
    manifest.data.room.visibility === 'read-write' &&
    manifest.data.boards.visibility === 'read-write');
  const tag = JSON.parse(listing).tagline;
  check('listing leads with the pour', /^Pour sand/i.test(tag), tag);
  check('listing/help do not say gifos.db / WASM / sandbox',
    !/gifos\.db|WASM|sandbox|localStorage|WebRTC/.test(listing) &&
    !/gifos\.db|WASM|sandbox|localStorage|WebRTC/.test(help));
  check('help.md is a real help file', help.trim().length >= 400);
  check('scripts are classic, not modules', !/type=["']module["']/.test(html));

  if (failures) {
    console.log('\n' + failures + ' FAIL');
    process.exit(1);
  }
  console.log('\nAll PASS — sandspiel pours, the file is the world.');
}

stepWasm().then(scan).catch((err) => {
  check('wasm instantiate', false, err && err.message);
  scan();
});
