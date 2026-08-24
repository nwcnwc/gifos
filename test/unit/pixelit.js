// Pixel It has to convert, not redraw, and the file has to be the save.
//
// The 1.0 port saved the PIXELATED canvas and loaded it as the next source,
// so every reopen pixelated the pixelation. This suite plays the converter
// in a vm: palette snap on a known RGB buffer, restore prefers the original
// src over the old out row, and a source scan for the phone/input rules a
// vm cannot run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'pixelit');

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
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');

const S = load();
const A = S.PixelitApp;
check('app.js loads and attaches PixelitApp', !!(A && A.PALETTES && A.similarColor));
check('ships the original demo palettes', A.PALETTES.length === 12, A.PALETTES.length);
check('palette names match the list', A.PALETTE_NAMES.length === 12);
check('classic palette is the library default', A.PALETTES[8][0][0] === 140 && A.PALETTES[8][0][1] === 143);

{
  check('block size 0 clamps to 1', A.clampScale(0) === 1);
  check('block size 99 clamps to 50', A.clampScale(99) === 50);
  check('block size 8 stays 8', A.clampScale(8) === 8);
}

{
  const def = A.PALETTES[8];
  const hit = A.similarColor([140, 143, 174], def);
  check('an exact palette colour snaps to itself', hit[0] === 140 && hit[1] === 143 && hit[2] === 174);
  const near = A.similarColor([230, 150, 60], def);
  check('a nearby orange snaps to the classic orange', near[0] === 228 && near[1] === 148 && near[2] === 58, near);
  check('black is farther from white than from near-black',
    A.colorSim([0, 0, 0], [255, 255, 255]) > A.colorSim([0, 0, 0], [1, 1, 1]));
}

{
  // Core loop: a 2-pixel buffer, one exact palette colour, one off-palette.
  const def = A.PALETTES[8];
  const px = [140, 143, 174, 255, 10, 10, 10, 255];
  A.applyPaletteToPixels(px, def);
  check('palette pass keeps an exact colour', px[0] === 140 && px[1] === 143 && px[2] === 174);
  const snapped = A.similarColor([10, 10, 10], def);
  check('palette pass snaps the off-palette pixel', px[4] === snapped[0] && px[5] === snapped[1] && px[6] === snapped[2], [px[4], px[5], px[6]]);
}

{
  const d = A.downscaleNeed(1600, 900, 800);
  check('a 1600×900 photo downscales to 800×450', d.w === 800 && d.h === 450, d);
  const s = A.downscaleNeed(240, 160, 800);
  check('a small photo is left alone', s.w === 240 && s.h === 160 && s.scale === 1, s);
}

{
  check('restore prefers the original src over the old out row',
    A.pickRestoreUrl({ png: 'SRC' }, { png: 'OUT' }) === 'SRC');
  check('an old save with only out still loads',
    A.pickRestoreUrl(null, { png: 'OUT' }) === 'OUT');
  check('empty db is empty, not a fake photo',
    A.pickRestoreUrl(null, null) === null);
}

check('persists the ORIGINAL as pic/src, not the pixelated canvas', /id:\s*'src'/.test(src) && src.includes("db('pic')"));
check('does not write pic/out any more (that was the re-pixelate bug)', !/id:\s*'out'/.test(src));
check('uses gifos.takePhoto, never getUserMedia', src.includes('takePhoto') && !src.includes('getUserMedia'));
check('no fetch / xhr / websocket / eval',
  !src.includes('fetch(') && !src.includes('XMLHttpRequest') && !src.includes('WebSocket') && !src.includes('eval('));
check('registers gifos.onBack so hold-to-compare dismisses', src.includes('onBack'));

check('first-run empty state is in the markup', html.includes('id="empty"') && html.includes('No photo yet'));
check('empty state offers Take photo, Choose, and Try a sample',
  html.includes('id="emptyPhoto"') && html.includes('id="emptyChoose"') && html.includes('id="sampleBtn"'));
check('hold-to-compare hint is in the markup', html.includes('Hold to see the original'));
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
check('listing is an unofficial port of Pixel It', listing.basedOn && listing.basedOn.name === 'Pixel It' && listing.basedOn.blessed === false);
check('author is giventofly, never GifOS', listing.author.name === 'giventofly' && listing.porter.name === 'GifOS');
check('manifest camera + db, no network, minBuild 947',
  manifest.capabilities.camera === true && manifest.capabilities.db === true &&
  !manifest.capabilities.network && manifest.minBuild === 947);
check('help covers take photo, hold-to-compare, and the original picture in the file',
  /Take photo/.test(help) && /Hold the picture/.test(help) && /original/i.test(help) && help.trim().length >= 400);

if (failures) {
  console.log('\n' + failures + ' FAIL');
  process.exit(1);
}
console.log('\nok');
