// Pack apps/smartcrop/ into the finished, downloadable
// site/apps/smartcrop/smartcrop.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/smartcrop/build.mjs
import { smartcropIcon, screenshotPng } from './icon.mjs';
import { createRequire } from 'node:module';
import { createHash as sha256 } from 'node:crypto';
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

const JS_SHA256 = 'fbc74cd1edd245b335af2404b5b55e29dca3f0c22053a4b6027df1ae05c340c7';

for (const need of ['vendor/smartcrop.js', 'vendor/COPYING-smartcrop.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const jsBuf = readFileSync(join(dir, 'vendor', 'smartcrop.js'));
const jsHex = sha256('sha256').update(jsBuf).digest('hex');
if (jsHex !== JS_SHA256) {
  throw new Error('vendor/smartcrop.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'smartcrop') throw new Error('appId must be smartcrop');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (manifest.capabilities.camera !== true) {
  throw new Error('manifest must declare capabilities.camera — Take photo is a still clip');
}
if (manifest.capabilities.multiplayer) throw new Error('smartcrop is solo — the picture stays private');
if (manifest.capabilities.network) throw new Error('smartcrop has no network path');
if (manifest.capabilities.wasm) throw new Error('smartcrop is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.pic || manifest.data.pic.visibility !== 'private') {
  throw new Error('pic must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'smartcrop.js' || listing.basedOn.url !== 'https://github.com/jwagner/smartcrop.js') {
  throw new Error('listing.basedOn must name smartcrop.js at github.com/jwagner/smartcrop.js');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'Jonas Wagner' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Jonas Wagner, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('listing.categories must include Creativity');
}
if (listing.releaseDate !== '2026-08-30') throw new Error('listing.releaseDate must be 2026-08-30');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/smartcrop') {
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
  'vendor/smartcrop.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-smartcrop.txt': read('vendor/COPYING-smartcrop.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const SCRIPTS = ['vendor/smartcrop.js', 'app.js'];
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
if (!html.includes('id="overlay"') || !html.includes('id="result"')) {
  throw new Error('index.html must host overlay + result canvases');
}
if (!html.includes('id="photoBtn"') || !html.includes('Take photo')) {
  throw new Error('index.html must offer Take photo');
}
if (!html.includes('id="empty"') || !html.includes('No photo yet')) {
  throw new Error('index.html must ship a first-run empty state');
}
if (!html.includes('Try a sample') || !html.includes('id="sampleBtn"')) {
  throw new Error('index.html must offer Try a sample');
}
if (!html.includes('Hold for the crop')) {
  throw new Error('index.html must offer hold-to-compare');
}
if (!html.includes('id="resultwrap"')) {
  throw new Error('index.html must always show the cropped result');
}

const src = files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!src.includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!src.includes("id: 'src'")) throw new Error('app.js must persist the ORIGINAL picture as pic/src, not the crop');
if (!src.includes('takePhoto')) throw new Error('app.js must use gifos.takePhoto — never a live camera');
if (!src.includes('onBack')) throw new Error('app.js must register gifos.onBack so heatmap / hold-to-compare dismisses');
if (!src.includes('pickRestoreUrl')) throw new Error('app.js must restore src (new) or out (old saves)');
if (!src.includes('skinBlobs')) throw new Error('app.js must cluster skin regions as face boosts');
if (!src.includes('ASPECTS')) throw new Error('app.js must ship Twitter-style aspect presets');
if (listing.tagline.toLowerCase().includes('drop ') || listing.description.toLowerCase().includes('drop a')) {
  throw new Error('listing copy must not say drop');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/smartcrop.js') continue;
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — classic scripts only');
  }
}
if (!files['COPYING-smartcrop.txt'].includes('Jonas Wagner')) {
  throw new Error('COPYING-smartcrop.txt is not the upstream MIT notice');
}

{
  const ctx = {
    window: {},
    console,
    Math,
    Array,
    String,
    Number,
    Uint8Array,
    Uint8ClampedArray,
    Promise,
    document: { getElementById: function () { return null; } }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInNewContext(
    files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var A = SmartcropApp;\n' +
    '  if (A.clamp(0, 0.5, 1) !== 0.5 || A.clamp(9, 0.5, 1) !== 1) throw new Error("clamp");\n' +
    '  if (A.ASPECTS.length < 5) throw new Error("aspects");\n' +
    '  if (A.aspectById("banner").w / A.aspectById("banner").h !== 3) throw new Error("banner");\n' +
    '  if (A.aspectById("square").w !== A.aspectById("square").h) throw new Error("square");\n' +
    '  if (A.pickRestoreUrl({jpg:"SRC"}, {jpg:"OUT"}) !== "SRC") throw new Error("restore prefers src");\n' +
    '  if (A.pickRestoreUrl(null, {png:"OUT"}) !== "OUT") throw new Error("restore old out");\n' +
    '  var d = A.downscaleNeed(1600, 900, 800);\n' +
    '  if (d.w !== 800 || d.h !== 450) throw new Error("downscale " + d.w + "x" + d.h);\n' +
    '  var W = 32, H = 32;\n' +
    '  var data = new Uint8Array(W * H * 4);\n' +
    '  var x, y, p;\n' +
    '  for (y = 6; y < 18; y++) for (x = 6; x < 18; x++) {\n' +
    '    p = (y * W + x) * 4; data[p] = 200; data[p+1] = 10; data[p+2] = 10; data[p+3] = 255;\n' +
    '  }\n' +
    '  var blobs = A.skinBlobs(data, W, H, 320, 320);\n' +
    '  if (!blobs.length) throw new Error("skinBlobs found none");\n' +
    '  if (blobs[0].width < 40) throw new Error("blob scale " + blobs[0].width);\n' +
    '  var ids = A.ASPECTS.map(function (a) { return a.id; }).join(",");\n' +
    '  if (ids.indexOf("square") < 0 || ids.indexOf("banner") < 0 || ids.indexOf("story") < 0) throw new Error("presets");\n' +
    '  return A.ASPECTS.length;\n' +
    '})();',
    ctx
  );
  console.log('aspects + skinBlobs checks ok —', ctx.result);
}

{
  const require = createRequire(import.meta.url);
  const smartcrop = require('./vendor/smartcrop.js');
  const W = 256, H = 128;
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const inFace = (x - 48) * (x - 48) + (y - 56) * (y - 56) < 28 * 28;
    if (inFace) { pixels[i] = 199; pixels[i + 1] = 145; pixels[i + 2] = 112; pixels[i + 3] = 255; }
    else { pixels[i] = 40; pixels[i + 1] = 44; pixels[i + 2] = 70; pixels[i + 3] = 255; }
  }
  const ops = {
    open: function () {
      return Promise.resolve({ width: W, height: H, data: pixels });
    },
    resample: function (image, nw, nh) {
      nw = nw | 0; nh = nh | 0;
      const out = new Uint8ClampedArray(nw * nh * 4);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const sx = Math.min(image.width - 1, (x * image.width / nw) | 0);
        const sy = Math.min(image.height - 1, (y * image.height / nh) | 0);
        const si = (sy * image.width + sx) * 4;
        const di = (y * nw + x) * 4;
        out[di] = image.data[si]; out[di + 1] = image.data[si + 1];
        out[di + 2] = image.data[si + 2]; out[di + 3] = image.data[si + 3];
      }
      return Promise.resolve({ width: nw, height: nh, data: out });
    },
    getData: function (image) {
      return Promise.resolve(new smartcrop.ImgData(image.width, image.height, image.data));
    }
  };
  const result = await smartcrop.crop({ width: W, height: H }, {
    width: 64, height: 64, minScale: 1, prescale: false, debug: true,
    imageOperations: ops
  });
  if (!result || !result.topCrop) throw new Error('smartcrop returned no topCrop');
  const c = result.topCrop;
  if (c.width < 50 || c.height < 50) throw new Error('crop too small ' + c.width + 'x' + c.height);
  if (c.x > 48) throw new Error('crop missed the face on the left, x=' + c.x);
  if (c.width > H + 2) throw new Error('1:1 crop should be square-ish, got ' + c.width + 'x' + c.height);
  console.log('smartcrop.crop keeps the face —', c.x | 0, c.y | 0, (c.width | 0) + 'x' + (c.height | 0));
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: smartcropIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'smartcrop', 'smartcrop.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/smartcrop/smartcrop.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
