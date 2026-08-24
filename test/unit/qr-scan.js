// QR Scan has to actually decode, and the empty state has to be on the page.
//
// Upstream jsQR's demo is a live webcam. The sandbox never grants that. This
// suite plays the still-photo path: classify the payloads a phone actually
// produces, refuse an empty picture, and round-trip a raster jsQR can read.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'qr-scan');
const GEN = path.join(ROOT, 'apps', 'qr-code');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function mockEl() {
  return {
    innerHTML: '',
    title: '',
    style: {},
    hidden: false,
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    appendChild: function (c) { this.child = c; return c; },
    querySelector: function () { return this.child || null; },
    addEventListener: function () {},
    textContent: ''
  };
}
function mockCanvas() {
  return {
    width: 64,
    height: 64,
    style: {},
    tagName: 'CANVAS',
    hidden: false,
    getContext: function () {
      return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        imageSmoothingEnabled: true,
        fillRect: function () {},
        strokeRect: function () {},
        clearRect: function () {},
        beginPath: function () {},
        moveTo: function () {},
        lineTo: function () {},
        closePath: function () {},
        stroke: function () {},
        drawImage: function () {},
        getImageData: function (x, y, w, h) {
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        }
      };
    },
    toDataURL: function () { return 'data:image/png;base64,xx'; }
  };
}

function loadScan() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    Uint8ClampedArray, Uint8Array, Int32Array, Float32Array, Float64Array,
    parseInt, parseFloat, isNaN, Infinity, Error, TypeError, RegExp,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: function () {},
    navigator: { userAgent: 'node', clipboard: null },
    CanvasRenderingContext2D: function () {},
    Blob: function () {},
    URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} },
    Image: function () {},
    FileReader: function () {},
    Promise
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = {
    documentElement: { tagName: 'HTML' },
    body: { classList: { add: function () {}, remove: function () {}, toggle: function () {} } },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function (tag) {
      if (tag === 'canvas') return mockCanvas();
      return mockEl();
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'jsQR.js'), 'utf8'), sandbox, { filename: 'jsQR.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = loadScan();
const App = sandbox.QrScanApp;
check('app.js loads and attaches QrScanApp', !!(App && App.classify && App.decodePixels));
check('jsQR is aboard', typeof sandbox.jsQR === 'function');

// ---- classify the payloads a phone actually produces --------------------------
check('empty is empty', App.classify('').kind === 'empty');
check('plain text is text', App.classify('hello').kind === 'text');
{
  const c = App.classify('https://gifos.app');
  check('https is a link', c.kind === 'url' && c.label === 'Link', c);
}
{
  const c = App.classify('WIFI:T:WPA;S:Cafe;P:secret;;');
  check('WIFI: is wifi', c.kind === 'wifi' && c.ssid === 'Cafe' && c.password === 'secret', c);
}
{
  const c = App.classify('WIFI:T:WPA;S:Cafe\\;Room;P:a\\;b;;');
  check('WIFI: unescapes semicolon in SSID', c.kind === 'wifi' && c.ssid === 'Cafe;Room', c);
}
{
  const v = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nTEL:555\nEND:VCARD';
  const c = App.classify(v);
  check('vCard is a contact', c.kind === 'contact' && c.fn === 'Ada Lovelace', c);
}
check('tel: is a phone', App.classify('tel:+1555').kind === 'phone');
check('SMSTO is sms', App.classify('SMSTO:555:hi').kind === 'sms' && App.classify('SMSTO:555:hi').hint === '555');
check('mailto is email', App.classify('mailto:a@b.c?subject=Hi').kind === 'email');
check('geo is a place', App.classify('geo:0,0').kind === 'geo');

// empty image → null, not a guess
{
  const data = new Uint8ClampedArray(16);
  const r = App.decodePixels(data, 2, 2);
  check('an empty picture is null, not a fake code', r === null, r);
}

// ---- PLAY: draw a code with qr-code's engine, read it with jsQR ---------------
function loadGen() {
  const s = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    Uint8ClampedArray, Uint8Array, parseInt, parseFloat, encodeURIComponent,
    decodeURIComponent, encodeURI, isNaN, Infinity, Error, TypeError,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: function () {},
    navigator: { userAgent: 'node' },
    CanvasRenderingContext2D: function () {}
  };
  s.globalThis = s;
  s.window = s;
  s.self = s;
  s.document = {
    documentElement: { tagName: 'HTML' },
    getElementById: function () { return null; },
    createElement: function (tag) {
      if (tag === 'canvas') return mockCanvas();
      return mockEl();
    }
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(GEN, 'vendor', 'qrcode.js'), 'utf8'), s, { filename: 'qrcode.js' });
  vm.runInContext(fs.readFileSync(path.join(GEN, 'app.js'), 'utf8'), s, { filename: 'qr-code-app.js' });
  return s;
}

{
  const gen = loadGen();
  const G = gen.QrCodeApp;
  const grid = G.makeGrid('https://gifos.app', 'M');
  check('qr-code produced a grid', !!(grid && grid.n > 10), grid);
  const img = grid && grid.n ? G.rasterGrid(grid, 6, 4) : null;
  const code = img ? App.decodePixels(img.data, img.width, img.height) : null;
  check('jsQR reads the URL qr-code just drew', !!(code && code.data === 'https://gifos.app'), code && code.data);
}
{
  const gen = loadGen();
  const payload = gen.QrCodeApp.encodeKind('phone', { phone: '+15550100' });
  const grid = gen.QrCodeApp.makeGrid(payload, 'M');
  const img = grid && grid.n ? gen.QrCodeApp.rasterGrid(grid, 6, 4) : null;
  const code = img ? App.decodePixels(img.data, img.width, img.height) : null;
  check('jsQR reads a tel: code', !!(code && code.data === 'tel:+15550100'), code && code.data);
  check('…and classify calls it a phone', App.classify(code && code.data || '').kind === 'phone');
}

// ---- source-scan: empty state, brokered photo, walls --------------------------
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

check('empty state says No picture yet', html.includes('No picture yet') && html.includes('empty-shot'));
check('author CSS cannot un-hide [hidden] (the empty canvas bug)', /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));
check('decoded empty copy is on screen', html.includes('The words will show up here'));
check('Take a photo is a 48px button', /height:\s*48px/.test(css) && html.includes('Take a photo'));
check('uses gifos.takePhoto, never getUserMedia', js.includes('takePhoto') && !/getUserMedia|mediaDevices|webkitGetUserMedia/.test(js + html));
check('no WebRTC / fetch', !/RTCPeerConnection|WebSocket|XMLHttpRequest/.test(js));
check('gifos.onBack clears the picture', js.includes('onBack') && js.includes('clearShot'));
check('history is private', js.includes("db('history')") && manifest.data.history.visibility === 'private');
check('row-del is the trash, not x', js.includes('row-del') && js.includes('M3 6h18'));
check('honest bad-image copy', js.includes('Could not read that picture. Try a JPEG or a PNG.'));
check('honest no-QR copy', js.includes('No QR code in that picture'));
check('listing does not say drop / if you want', !/\bdrop\b/i.test(listing) && !/if you want/i.test(listing));
check('listing does not claim a live camera', !/live camera view/i.test(listing) || /no live camera/i.test(listing));
check('minBuild stays 947', manifest.minBuild === 947);
check('camera capability is declared', manifest.capabilities.camera === true);
check('author is cozmo, not GifOS', JSON.parse(listing).author.name === 'cozmo');
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
