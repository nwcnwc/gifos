// Pack apps/pixelit/ into the finished, downloadable
// site/apps/pixelit/pixelit.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/pixelit/build.mjs
import { pixelitIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

{
  const Orig = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (Orig) return new Orig(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) {
          controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks))));
        }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const JS_SHA256 = 'b20c9b22c8809b5c83ddc2525629ff50b608b713f4ed115e0a08843ed3021df6';

for (const need of ['vendor/pixelit.js', 'vendor/COPYING-pixelit.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const jsBuf = readFileSync(join(dir, 'vendor', 'pixelit.js'));
const jsHex = createHash('sha256').update(jsBuf).digest('hex');
if (jsHex !== JS_SHA256) {
  throw new Error('vendor/pixelit.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'pixelit') throw new Error('appId must be pixelit');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (manifest.capabilities.camera !== true) {
  throw new Error('manifest must declare capabilities.camera — Take photo is a still clip');
}
if (manifest.capabilities.multiplayer) throw new Error('pixelit is solo');
if (manifest.capabilities.network) throw new Error('pixelit has no network path');
if (manifest.capabilities.wasm) throw new Error('pixelit is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'Pixel It' || listing.basedOn.url !== 'https://github.com/giventofly/pixelit') {
  throw new Error('listing.basedOn must name Pixel It at github.com/giventofly/pixelit');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'giventofly' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is giventofly, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('listing.categories must include Creativity');
}
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/pixelit') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'getUserMedia']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/pixelit.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-pixelit.txt': read('vendor/COPYING-pixelit.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const SCRIPTS = ['vendor/pixelit.js', 'app.js'];
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!html.includes('id="pixelitcanvas"') || !html.includes('id="pixelitimg"')) {
  throw new Error('index.html must host pixelit from/to elements');
}
if (!html.includes('id="photoBtn"') || !html.includes('Take photo')) {
  throw new Error('index.html must offer Take photo');
}

const src = files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!src.includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!src.includes('takePhoto')) throw new Error('app.js must use gifos.takePhoto — never a live camera');
if (!src.includes('PALETTES')) throw new Error('app.js must ship the original palettes');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/pixelit.js') continue;
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — classic scripts only');
  }
}
if (!files['COPYING-pixelit.txt'].includes('José Moreira') && !files['COPYING-pixelit.txt'].includes('Jose Moreira')) {
  throw new Error('COPYING-pixelit.txt is not the upstream MIT notice');
}

{
  const ctx = { window: {}, console, Math, Array, String, Number, document: { getElementById: function () { return null; } } };
  ctx.window = ctx;
  vm.runInNewContext(
    files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var A = PixelitApp;\n' +
    '  if (A.clampScale(0) !== 1 || A.clampScale(99) !== 50) throw new Error("scale");\n' +
    '  if (A.PALETTES.length < 8) throw new Error("palettes");\n' +
    '  var def = A.PALETTES[8];\n' +
    '  var hit = A.similarColor([140, 143, 174], def);\n' +
    '  if (hit[0] !== 140 || hit[1] !== 143) throw new Error("exact " + hit);\n' +
    '  var near = A.similarColor([230, 150, 60], def);\n' +
    '  if (!near || near.length !== 3) throw new Error("near");\n' +
    '  if (A.colorSim([0,0,0],[255,255,255]) <= A.colorSim([0,0,0],[1,1,1])) throw new Error("sim");\n' +
    '  return A.PALETTES.length;\n' +
    '})();',
    ctx
  );
  console.log('palette + nearest-color checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: pixelitIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pixelit', 'pixelit.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pixelit/pixelit.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
