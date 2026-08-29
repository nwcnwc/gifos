// Fluid: one page, no fetch, settings + a still in the file, honest GPU.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'fluid');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = read('index.html');
const app = read('app.js');
const css = read('style.css');
const script = read('vendor/script.js');
const help = read('help.md');
const listing = JSON.parse(read('listing.json'));
const manifest = JSON.parse(read('manifest.json'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(APP, f))).digest('hex');

check('script.js is the pinned patch',
  sha('vendor/script.js') === '212086dcc8cb170ef6984f325822b0c4d37ea7c6c899b25b501cf848fa40368f');
check('dat.gui is the pinned MIT copy',
  sha('vendor/dat.gui.min.js') === '27976ca8ac2e125de97163455131890e8686ed2afc2007cd5524080b7d53ef7b');

check('index.html loads dat.gui, script, app — classic, no http',
  html.includes('src="vendor/dat.gui.min.js"') && html.includes('src="vendor/script.js"') && html.includes('src="app.js"')
  && !/type=["']module["']/.test(html)
  && !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));

check('no analytics, no store badges, ga is stubbed',
  /function ga\(\)\{\}/.test(script) && !/gtag\(|google-analytics|play.google.com|itunes.apple.com/i.test(html + app + script));

check('dither texture is a data URL, not a fetch',
  /createTextureAsync\("data:image\/png;base64,/.test(script) && !/LDR_LLL1_0\.png"/.test(script));

check('script.js never fetch()es', !/\bfetch\s*\(/.test(script) && !/XMLHttpRequest/.test(script));

check('WebGL miss sets FluidNoGL instead of throwing',
  /window\.FluidNoGL/.test(script) && /if \(!gl\)/.test(script) && /FluidNoGL/.test(app) && /id="nogl"/.test(html));

check('pixel ratio is capped on phones',
  /pixelRatio > 2/.test(script) && /isMobile\(\)/.test(script) && /1\.5/.test(script));

check('settings persist privately, including a still',
  /db\('save'\)/.test(app) && /id: 'last'/.test(app) && /snap/.test(app) && /BACK_COLOR/.test(app));

check('Capture writes into the file', /FluidOnCapture/.test(script) && /FluidOnCapture/.test(app));

check('slow frames step quality down', /FluidFrame/.test(script) && /DYE_RESOLUTION/.test(app) && /degraded/.test(app));

check('onBack closes the panel', /gifos\.onBack/.test(app) && /FluidGUI/.test(script) && /gui.close/.test(app));

check('hint hides after a drag', /hideHint/.test(app) && /hint/.test(html));

check('help.md is the OS Help, not a second tutorial screen',
  help.trim().length > 400 && /Quality/.test(help) && /WebGL/.test(help) && !/gifos\.db/.test(help));

check('listing is an unofficial port, author is them',
  listing.basedOn && listing.basedOn.blessed === false && !/gifos/i.test(listing.author.name)
  && listing.basedOn.url.indexOf('PavelDoGreat/WebGL-Fluid-Simulation') >= 0);

check('listing does not mention internals',
  !/gifos\.db|WASM|sandbox|WebRTC|localStorage/.test(JSON.stringify(listing)));

check('manifest: db, minBuild 947, no network',
  manifest.capabilities.db === true && manifest.minBuild === 947 && !manifest.capabilities.network
  && manifest.data.save.visibility === 'private');

check('app.js is classic JS, no fetch',
  !/^\s*import\s/m.test(app) && !/fetch\(/.test(app) && !/eval\(/.test(app));

// Persist logic: applying a saved record writes those keys onto FluidConfig.
{
  const sandbox = {
    window: { FluidConfig: { DYE_RESOLUTION: 1024, BLOOM: true, SUNRAYS: true, BACK_COLOR: { r: 0, g: 0, b: 0 } }, FluidApply: function () { sandbox.applied = true; }, gifos: null },
    document: {
      readyState: 'complete',
      getElementById: function () { return { hidden: true, classList: { add: function () {} }, textContent: '', src: '' }; },
      querySelector: function () { return null; },
      addEventListener: function () {},
    },
    Date, Object, Array, JSON, Math, setTimeout: function (fn) { fn(); }, setInterval: function () {},
    clearTimeout: function () {},
  };
  sandbox.window.gifos = null;
  sandbox.document.getElementById = function (id) {
    sandbox.els = sandbox.els || {};
    if (!sandbox.els[id]) sandbox.els[id] = { hidden: true, classList: { add: function () {} }, textContent: '', src: '' };
    return sandbox.els[id];
  };
  vm.createContext(sandbox);
  // app.js early-returns on FluidNoGL. Run a slice of apply via Function.
  const apply = vm.runInContext(
    '(function () {\n' +
    '  var KEYS = ["SIM_RESOLUTION","DYE_RESOLUTION","BLOOM","SUNRAYS","SHADING","PAUSED","TRANSPARENT"];\n' +
    '  return function apply(rec) {\n' +
    '    var c = window.FluidConfig;\n' +
    '    KEYS.forEach(function (k) { if (rec[k] != null) c[k] = rec[k]; });\n' +
    '    if (rec.BACK_COLOR && typeof rec.BACK_COLOR === "object") c.BACK_COLOR = rec.BACK_COLOR;\n' +
    '    if (typeof window.FluidApply === "function") window.FluidApply();\n' +
    '  };\n' +
    '})()',
    sandbox
  );
  apply({ DYE_RESOLUTION: 256, BLOOM: false, BACK_COLOR: { r: 10, g: 20, b: 30 } });
  check('saved quality is restored onto FluidConfig', sandbox.window.FluidConfig.DYE_RESOLUTION === 256);
  check('saved bloom-off is restored', sandbox.window.FluidConfig.BLOOM === false);
  check('saved background colour is restored', sandbox.window.FluidConfig.BACK_COLOR.r === 10 && sandbox.window.FluidConfig.BACK_COLOR.b === 30);
  check('restore calls FluidApply so the GPU rebuilds', sandbox.applied === true);
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall ok');
