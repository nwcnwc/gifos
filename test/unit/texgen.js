// TEXGEN HAS TO DRAW, AND THE FILE HAS TO HOLD THE RECIPE.
//
// The store copy is a live editor around mrdoob's generators — not a
// library demo. This suite PLAYS the core loop in a vm: XOR pixels, the
// classic sample stack, preset load, old-save round-trip, empty stack,
// PNG-export path present. Phone/Back/empty one-liners a vm cannot click
// are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'texgen');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    Float32Array, Uint8Array, Int32Array,
    document: {
      readyState: 'complete',
      getElementById: () => null,
      createElement: () => ({ getContext: () => null, style: {} }),
      addEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['vendor/texgen.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const S = load();
const TG = S.TG;
const A = S.TexgenApp;
check('texgen.js and editor load', !!(TG && A && A.SAMPLE && A.SAMPLE.length >= 3));

{
  const t = new TG.Texture(8, 8).add(new TG.XOR());
  const a = t.buffer.array;
  check('XOR(0,0) is 0', Math.abs(a[0] - 0) < 1e-9, a[0]);
  check('XOR(1,0) is 1/8', Math.abs(a[4] - 0.125) < 1e-9, a[4]);
  const u = new TG.Texture(8, 8).add(new TG.XOR().tint(1, 0.5, 0));
  check('tint multiplies the green channel', Math.abs(u.buffer.array[5] - 0.125 * 0.5) < 1e-9);
  const n = new TG.Texture(8, 8).add(new TG.Noise().seed(7));
  check('noise is in 0–1', n.buffer.array[0] > 0 && n.buffer.array[0] <= 1, n.buffer.array[0]);
}

{
  const buf = A.renderBuffer(A.SAMPLE, 16);
  check('classic XOR sample renders a buffer', !!(buf && buf.length === 16 * 16 * 4));
  let sum = 0, i;
  for (i = 0; i < buf.length; i += 4) sum += buf[i] + buf[i + 1] + buf[i + 2];
  check('classic sample is not a black frame', sum > 10, sum);
  const c = A.cloneLayer(A.SAMPLE[0]);
  c.tint[0] = 0;
  check('cloneLayer is a copy, not an alias', A.SAMPLE[0].tint[0] === 1 && c.tint[0] === 0);
}

{
  A.loadState({ layers: A.SAMPLE, at: 1 });
  const rec = A.serializeState();
  check('old save {layers} still round-trips as id:state', rec.id === 'state' && rec.layers.length === 4);
  A.loadState({ layers: [], name: 'Empty', size: 128 });
  check('an empty stack is a real state, not a reset to the sample',
    A.getState().layers.length === 0 && A.getState().size === 128, A.getState());
  A.loadState({
    layers: [{ type: 'XOR', op: 'add', tint: [1, 1, 1], params: {} }],
    name: 'Just XOR', size: 256
  });
  check('a one-layer save loads', A.getState().layers.length === 1 && A.getState().name === 'Just XOR');
}

{
  const twirl = A.PRESETS.filter((p) => p.id === 'twirl')[0];
  check('twirl preset is aboard', !!(twirl && twirl.layers.length >= 2));
  A.applyPreset(twirl, false);
  check('applyPreset(twirl) replaces the stack', A.getState().name === 'Twirl' && A.getState().layers[1].type === 'Twirl', A.getState());
  const buf = A.renderBuffer(A.getState().layers, 32);
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4) sum += buf[i] + buf[i + 1] + buf[i + 2];
  check('twirl actually paints', sum > 1, sum);
  A.applyLaunch({ preset: 'classic' });
  check('launch preset=classic restores the XOR sample',
    A.getState().name === 'Classic XOR' && A.getState().layers[0].type === 'XOR', A.getState());
}

{
  const layer = A.cloneLayer({
    type: 'Circle', op: 'add', tint: [1, 1, 1],
    params: { position: [128, 128], radius: 64, delta: 8 }
  });
  A.scaleParams(layer, 256, 512);
  check('spatial params scale with size',
    layer.params.radius === 128 && layer.params.position[0] === 256, layer.params);
}

{
  const ids = A.PRESETS.map((p) => p.id);
  check('presets cover XOR, checkers, twirl, circle — the original examples',
    ids.indexOf('classic') >= 0 && ids.indexOf('checkers') >= 0 &&
    ids.indexOf('twirl') >= 0 && ids.indexOf('circle') >= 0, ids);
  const ops = A.OPS.map((o) => o.id);
  check('every combine op from texgen.js is on the editor',
    ['add', 'set', 'sub', 'mul', 'xor', 'min', 'max'].every((o) => ops.indexOf(o) >= 0), ops);
}

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8') + fs.readFileSync(path.join(APP, 'vendor/texgen.js'), 'utf8');
const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

check('viewport-fit for a phone', /viewport-fit=cover/.test(html));
check('empty state is a real element, not a blank canvas', /id="empty"/.test(html));
check('PNG is a button the thumb can hit', /id="saveBtn"/.test(html));
check('no Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('no CDN / remote at load', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
check('classic scripts, no type=module', !/type=["']module["']/.test(html));
check('gifos.onBack collapses the open layer', /gifos\.onBack/.test(js));
check('gifos.db save is the file', /db\('save'\)/.test(js));
check('no eval / Function / fetch / getUserMedia',
  !/eval\(|new Function\(|fetch\(|getUserMedia|XMLHttpRequest|WebSocket/.test(js));
check('row-del uses the shared trash glyph', /row-del/.test(js) && /viewBox="0 0 16 16"/.test(js));
check('params are sliders, not a wall of number boxes', /inp\.type = 'range'/.test(js));
check('param labels are words (Width), not size[0]', /niceLabel/.test(js) && /Width/.test(js));
check('buttons are 44px tall', /min-height:\s*44px/.test(css));
check('canvas stays on screen while you edit', /position:\s*sticky/.test(css));
check('no webfont import', !/@import|fonts\.google|typekit/i.test(css));
check('listing leads with offline / file holds the recipe',
  /offline/i.test(listing) && /recipe/i.test(listing) && /file/i.test(listing));
check('listing does not mention internals',
  !/gifos\.db|WASM|sandbox|localStorage|WebRTC/.test(listing));
check('help covers layers, presets, PNG, and what is saved',
  /Layers/.test(help) && /PNG/.test(help) && /file/.test(help) && help.trim().length >= 400);
check('manifest is solo + private save + launch-to-a-preset',
  manifest.capabilities.db === true &&
  !manifest.capabilities.multiplayer &&
  manifest.data.save.visibility === 'private' &&
  !!(manifest.launch && manifest.launch.preset) &&
  manifest.minBuild === 947);

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll PASS — texgen core loop holds.');
process.exit(0);
