// JPG Glitch has to smash JPEG bytes, not re-glitch the last output.
//
// The 1.0 port saved the GLITCHED jpeg and loaded it as the next original,
// so every reopen smashed a smash. This suite plays the databender in a vm:
// a fake JPEG with an SOS marker is smashed (deterministic), restore prefers
// the original src over the old out row, and a source scan for the phone
// slider rules a vm cannot run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'jpg-glitch');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    document: {
      getElementById: function () { return null; },
      createElement: function () { return { getContext: function () { return null; } }; },
      addEventListener: function () {},
      readyState: 'complete'
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'glitch-canvas.js'), 'utf8'), sandbox, { filename: 'glitch-canvas.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const vendor = fs.readFileSync(path.join(APP, 'vendor', 'glitch-canvas.js'), 'utf8');

const S = load();
const A = S.JpgGlitchApp;
const G = S.glitchCanvas;
check('vendor + app load', !!(A && G && G.smashBytes && G.getNormalizedParameters));
check('defaults match the original demo',
  A.DEFAULTS.amount === 24 && A.DEFAULTS.seed === 53 && A.DEFAULTS.iterations === 21 && A.DEFAULTS.quality === 46);
check('classic preset is those defaults', A.matchingPreset(A.DEFAULTS) === 'classic');
check('four named looks', A.PRESETS.length === 4 && A.PRESETS.map((p) => p.id).join(',') === 'mild,classic,heavy,melt');

{
  const p = G.getNormalizedParameters({ amount: 24, seed: 53, iterations: 21, quality: 46 });
  check('amount 24 normalises to 0.24', Math.abs(p.amount - 0.24) < 1e-9, p.amount);
  check('seed 53 normalises to 0.53', Math.abs(p.seed - 0.53) < 1e-9, p.seed);
  check('iterations stay a count', p.iterations === 21);
}

{
  const bytes = [];
  for (let i = 0; i < 800; i++) bytes[i] = (i === 100) ? 255 : ((i === 101) ? 218 : (i % 251));
  const header = G.getJpegHeaderSize(bytes);
  check('SOS marker at 100 means header 102', header === 102, header);
  const before = bytes.slice();
  const p = G.getNormalizedParameters({ amount: 24, seed: 53, iterations: 21, quality: 46 });
  G.smashBytes(bytes, p);
  let changed = 0;
  const hits = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== before[i]) { changed++; hits.push(i); }
  }
  check('smash mutates JPEG bytes past the header', changed >= 1, { changed: changed, hits: hits.slice(0, 8) });
  check('smash does not rewrite the SOS marker', bytes[100] === 255 && bytes[101] === 218);
  // Same params, same smash: the core loop is deterministic.
  const again = before.slice();
  G.smashBytes(again, p);
  let same = true;
  for (let i = 0; i < bytes.length; i++) if (again[i] !== bytes[i]) same = false;
  check('the same seed smashes the same way', same);
}

{
  check('restore prefers the original src over the old out row',
    A.pickRestoreUrl({ jpg: 'SRC' }, { jpg: 'OUT' }) === 'SRC');
  check('an old save with only out still loads',
    A.pickRestoreUrl(null, { jpg: 'OUT' }) === 'OUT');
  check('empty db is empty, not a fake photo',
    A.pickRestoreUrl(null, null) === null);
  const d = A.downscaleNeed(1600, 900, 800);
  check('a 1600×900 photo downscales to 800×450', d.w === 800 && d.h === 450, d);
  check('clamp floors and caps', A.clamp(-3, 0, 99) === 0 && A.clamp(200, 0, 99) === 99);
}

check('persists the ORIGINAL as pic/src, not the glitched canvas', /id:\s*'src'/.test(src) && src.includes("db('pic')"));
check('does not write pic/out any more (that was the re-glitch bug)', !/id:\s*'out'/.test(src));
check('uses gifos.takePhoto, never getUserMedia', src.includes('takePhoto') && !src.includes('getUserMedia'));
check('no fetch / xhr / websocket / eval',
  !src.includes('fetch(') && !src.includes('XMLHttpRequest') && !src.includes('WebSocket') && !src.includes('eval('));
check('registers gifos.onBack so hold-to-compare dismisses', src.includes('onBack'));
check('vendor does not spawn a worker or hold a live camera',
  !vendor.includes('new Worker') && !vendor.includes('getUserMedia'));

check('first-run empty state is in the markup', html.includes('id="empty"') && html.includes('No photo yet'));
check('empty state offers Take photo, Choose, and Try a sample',
  html.includes('id="emptyPhoto"') && html.includes('id="emptyChoose"') && html.includes('id="sampleBtn"'));
check('hold-to-compare hint is in the markup', html.includes('Hold to see the original'));
check('four sliders are present', html.includes('id="amount"') && html.includes('id="seed"') && html.includes('id="iterations"') && html.includes('id="quality"'));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('classic scripts, no module, no http',
  !/type=["']module["']/.test(html) && !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));

check('range thumbs are 28px (phone)', css.includes('width: 28px') && css.includes('height: 28px'));
check('range track is 44px tall', /input\[type=range\][\s\S]*height:\s*44px/.test(css));
check('buttons are 44px tall', css.includes('min-height: 44px'));
check('stage is flex-first so the picture is on screen', css.includes('flex: 1 1 auto') && css.includes('min-height: 180px'));
check('hidden wins over canvas display:block (phone empty state)', css.includes('[hidden] { display: none !important; }') || css.includes('[hidden]{display:none!important;}'));

check('listing leads with on-device, no upload',
  /on this device/i.test(listing.tagline) && /nothing is uploaded/i.test(listing.tagline));
check('listing does not say drop', !/drop /i.test(listing.tagline) && !/drop a/i.test(listing.description));
check('listing says the file is the save', /app file/i.test(listing.description));
check('listing is an unofficial port of jpg-glitch', listing.basedOn && listing.basedOn.name === 'jpg-glitch' && listing.basedOn.blessed === false);
check('author is snorpey, never GifOS', listing.author.name === 'snorpey' && listing.porter.name === 'GifOS');
check('manifest camera + db, no network, minBuild 947',
  manifest.capabilities.camera === true && manifest.capabilities.db === true &&
  !manifest.capabilities.network && manifest.minBuild === 947);
check('help covers take photo, sliders, hold-to-compare, and the original in the file',
  /Take photo/.test(help) && /Amount/.test(help) && /Hold the picture/.test(help) && /original/i.test(help) && help.trim().length >= 400);

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nok');
