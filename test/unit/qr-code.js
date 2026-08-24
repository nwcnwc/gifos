// QR Code has to actually encode, and last-save from 1.0 still loads.
//
// The GIF wraps davidshimjs/qrcodejs. A library demo that only draws whatever
// you type is not a finished tool — encodeKind must produce real URL / tel /
// SMSTO / mailto / vCard payloads, makeGrid must be a QR jsQR can read, and a
// v1.0 {id:'last', payload} row (no kind) must still fill the text box.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'qr-code');

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
    appendChild: function (c) { this.child = c; return c; },
    querySelector: function () { return this.child || null; }
  };
}

function mockCanvas() {
  const c = {
    width: 64,
    height: 64,
    style: {},
    tagName: 'CANVAS',
    getContext: function () {
      return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
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
  return c;
}

function load() {
  const sandbox = {
    console,
    Math,
    Object,
    Array,
    JSON,
    Date,
    String,
    Number,
    Boolean,
    Uint8ClampedArray,
    Uint8Array,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    isNaN,
    Infinity,
    Error,
    TypeError,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: function () {},
    navigator: { userAgent: 'node' },
    CanvasRenderingContext2D: function () {},
    Blob: function () {},
    URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} }
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
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'qrcode.js'), 'utf8'), sandbox, { filename: 'qrcode.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = load();
const App = sandbox.QrCodeApp;
check('app.js loads and attaches QrCodeApp', !!(App && App.encodeKind && App.makeGrid));
check('QRCode constructor is aboard', typeof sandbox.QRCode === 'function');
check('CorrectLevel.M is 0', sandbox.QRCode.CorrectLevel.M === 0, sandbox.QRCode.CorrectLevel);

// ---- encode the jobs a stranger actually types --------------------------------
check('empty text is empty', App.encodeKind('text', { text: '' }) === '');
check('plain text passes through', App.encodeKind('text', { text: 'hello' }) === 'hello');
check('a bare host becomes https', App.encodeKind('url', { url: 'gifos.app' }) === 'https://gifos.app');
check('https is left alone', App.encodeKind('url', { url: 'https://gifos.app/x' }) === 'https://gifos.app/x');
check('empty url is empty', App.encodeKind('url', { url: '  ' }) === '');
check('phone is tel:', App.encodeKind('phone', { phone: '+1 555 0100' }) === 'tel:+15550100');
check('sms without body', App.encodeKind('sms', { phone: '5550100' }) === 'SMSTO:5550100');
check('sms with body', App.encodeKind('sms', { phone: '555', body: 'hi' }) === 'SMSTO:555:hi');
check('email is mailto', App.encodeKind('email', { email: 'a@b.c' }) === 'mailto:a@b.c');
check('email subject and body', /mailto:a@b\.c\?/.test(App.encodeKind('email', { email: 'a@b.c', subject: 'Hi', body: 'Yo' })));
{
  const v = App.encodeKind('contact', { name: 'Ada', phone: '555', email: 'ada@ex', org: 'Labs' });
  check('vCard starts and ends', /^BEGIN:VCARD\nVERSION:3.0\n/.test(v) && /END:VCARD$/.test(v), v);
  check('vCard carries FN and TEL', /FN:Ada/.test(v) && /TEL:555/.test(v), v);
}
check('empty contact is empty', App.encodeKind('contact', { name: '', phone: '', email: '' }) === '');

// ---- a v1.0 save (payload only) still loads -----------------------------------
{
  const row = { id: 'last', payload: 'saved-from-1.0', ecc: 'Q', size: 192, dark: '#111111', light: '#fefefe' };
  App.hydrate(row);
  const s = App.settings();
  check('old save restores the payload', s.payload === 'saved-from-1.0', s.payload);
  check('old save defaults kind to text', s.kind === 'text', s.kind);
  check('old save puts payload in the text field', s.fields && s.fields.text === 'saved-from-1.0', s.fields);
  check('old save keeps ecc/size/colours', s.ecc === 'Q' && s.size === 192 && s.dark === '#111111', s);
}

// ---- contrast: phones need a light quiet zone ---------------------------------
check('black on white is high contrast', App.contrastRatio('#000000', '#ffffff') > 20);
check('near-grey pair is too close', App.contrastRatio('#777777', '#888888') < 2);
check('light lum is higher than dark lum', App.hexLum('#ffffff') > App.hexLum('#000000'));

// ---- PLAY: encode → modules → raster → jsQR reads it back ---------------------
const jsSandbox = {
  console, Math, Object, Array, JSON, Date, String, Number, Boolean,
  Uint8ClampedArray, Uint8Array, Int32Array, Float32Array, Float64Array,
  parseInt, parseFloat, isNaN, Infinity, Error, TypeError
};
jsSandbox.globalThis = jsSandbox;
jsSandbox.window = jsSandbox;
jsSandbox.self = jsSandbox;
vm.createContext(jsSandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps', 'qr-scan', 'vendor', 'jsQR.js'), 'utf8'),
  jsSandbox, { filename: 'jsQR.js' });
check('jsQR loads for the roundtrip', typeof jsSandbox.jsQR === 'function');

function roundtrip(text, ecc) {
  const grid = App.makeGrid(text, ecc || 'M');
  if (!grid || grid.error) return { ok: false, err: grid && grid.error, grid: grid };
  const img = App.rasterGrid(grid, 6, 4);
  const code = jsSandbox.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return { ok: !!(code && code.data === text), got: code && code.data, n: grid.n };
}

{
  const r = roundtrip('https://gifos.app', 'M');
  check('jsQR reads a URL we just drew', r.ok, r);
}
{
  const r = roundtrip('hello from gifos', 'M');
  check('jsQR reads plain text we just drew', r.ok, r);
}
{
  const payload = App.encodeKind('phone', { phone: '+15550100' });
  const r = roundtrip(payload, 'M');
  check('jsQR reads a tel: payload we just drew', r.ok, r);
}
{
  const too = 'x'.repeat(4000);
  const g = App.makeGrid(too, 'H');
  check('too-long text is refused rather than guessed', !!(g && g.error && /too long/i.test(g.error)), g);
}

// ---- source-scan: phone, save, walls a vm cannot run --------------------------
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

check('primary buttons are 48px', /height:\s*48px/.test(css));
check('fields are 16px (no iOS zoom)', /font:\s*16px/.test(css) || /font-size:\s*16px/.test(css));
check('kinds include link and contact', html.includes('data-kind="url"') && html.includes('data-kind="contact"'));
check('empty state copy is on screen', html.includes('Type something to draw a code'));
check('author CSS cannot un-hide [hidden]', /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('gifos.onBack is registered', js.includes('onBack'));
check('last payload is private', js.includes("db('save')") && js.includes("id: 'last'"));
check('no live camera / fetch', !/getUserMedia|mediaDevices|WebSocket|XMLHttpRequest/.test(js));
check('launch.text and launch.url are declared', !!(manifest.launch && manifest.launch.text && manifest.launch.url));
check('listing does not say drop / if you want', !/\bdrop\b/i.test(listing) && !/if you want/i.test(listing));
check('minBuild stays 947', manifest.minBuild === 947);
check('save stays private', manifest.data.save.visibility === 'private');
check('room stays read-only', manifest.data.room.visibility === 'read-only');
check('author is davidshimjs, not GifOS', /davidshimjs/.test(listing) && JSON.parse(listing).author.name === 'davidshimjs');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
