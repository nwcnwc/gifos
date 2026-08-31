// Pack apps/primitive/ into the finished, downloadable
// site/apps/primitive/primitive.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Run:  node apps/primitive/build.mjs
import { primitiveIcon, screenshotPng } from './icon.mjs';
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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const SRC_PINS = {
  'util.js': '90573fe9a7aa5861a952e3c073ffd71c59b29c2b8c044474245f8e6601a88b3d',
  'canvas.js': '893627056b632fa2be309ebe8e01fefa0feb90049eb2a0c187b59fcd46990897',
  'state.js': '2044b30118baa6b7acb552be5d187707faff426d3d7f9ae554987aa79f73400c',
  'shape.js': 'da88c2f8313e5bf13105974e324a13de8e8a8ad0f9b3a6b29d333ccc7d204927',
  'step.js': '158d3e251fa575aa272a3d717e378923a9a66d72cf085eb0a9dde03fa9931c88',
  'optimizer.js': 'b0b3f3863ea97922a6a63871aa87c6ad86cb4bc6c9f1675f704da9f41a96fc5b',
};

for (const need of [
  'vendor/primitive.js', 'vendor/COPYING-primitive.txt', 'vendor/UPSTREAM.txt', 'vendor/bundle.mjs',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
for (const [name, pin] of Object.entries(SRC_PINS)) {
  const p = join(dir, 'vendor', 'src', name);
  if (!existsSync(p)) throw new Error('vendor/src/' + name + ' is missing');
  const hex = createHash('sha256').update(readBin('vendor/src/' + name)).digest('hex');
  if (hex !== pin) throw new Error('vendor/src/' + name + ' sha256 ' + hex + ' ≠ pin ' + pin);
}

await import('./vendor/bundle.mjs');
const jsBuf = readBin('vendor/primitive.js');

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'primitive') throw new Error('appId must be primitive');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (manifest.capabilities.camera !== true) {
  throw new Error('manifest must declare capabilities.camera — Take photo is a still clip');
}
if (manifest.capabilities.multiplayer) throw new Error('primitive is solo');
if (manifest.capabilities.network) throw new Error('primitive has no network path');
if (manifest.capabilities.wasm) throw new Error('primitive is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'primitive.js' || listing.basedOn.url !== 'https://github.com/ondras/primitive.js') {
  throw new Error('listing.basedOn must name primitive.js at github.com/ondras/primitive.js');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Ondřej Žára, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('listing.categories must include Creativity');
}
if (listing.releaseDate !== '2026-08-30') throw new Error('listing.releaseDate must be 2026-08-30');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/primitive') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'getUserMedia']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
if (listing.tagline.toLowerCase().includes('drop ') || listing.description.toLowerCase().includes('drop a')) {
  throw new Error('listing copy must not say drop');
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/primitive.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-primitive.txt': read('vendor/COPYING-primitive.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const SCRIPTS = ['vendor/primitive.js', 'app.js'];
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
if (!html.includes('id="out"') || !html.includes('id="empty"') || !html.includes('No photo yet')) {
  throw new Error('index.html must ship a first-run empty state and a result canvas');
}
if (!html.includes('Take photo') || !html.includes('id="photoBtn"')) {
  throw new Error('index.html must offer Take photo');
}
if (!html.includes('Try a sample') || !html.includes('id="sampleBtn"')) {
  throw new Error('index.html must offer Try a sample');
}
if (!html.includes('Hold to see the original')) {
  throw new Error('index.html must offer hold-to-compare');
}
if (!html.includes('id="startBtn"') || !html.includes('Download PNG') || !html.includes('Download SVG')) {
  throw new Error('index.html must offer Start and raster/vector download');
}

const src = files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!src.includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!src.includes("id: 'src'")) throw new Error('app.js must persist the ORIGINAL picture as pic/src');
if (!src.includes("id: 'out'")) throw new Error('app.js must persist the reconstruction as pic/out');
if (!src.includes('takePhoto')) throw new Error('app.js must use gifos.takePhoto — never a live camera');
if (!src.includes('onBack')) throw new Error('app.js must register gifos.onBack');
if (!src.includes('pickRestoreUrl')) throw new Error('app.js must restore src (new) or out (old saves)');
if (!src.includes('PRESETS')) throw new Error('app.js must ship Quick/Classic/Fine presets');
if (!src.includes('optimizer.stop')) throw new Error('app.js must be able to stop a run');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/primitive.js') continue;
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — classic scripts only');
  }
}
if (!files['COPYING-primitive.txt'].includes('Ondřej Žára') && !files['COPYING-primitive.txt'].includes('Ondrej')) {
  throw new Error('COPYING-primitive.txt is not the upstream MIT notice');
}
if (!files['vendor/primitive.js'].includes('Canvas.fromImage')) {
  throw new Error('vendor IIFE must expose Canvas.fromImage');
}
if (!files['vendor/primitive.js'].includes('Optimizer.prototype.stop')) {
  throw new Error('vendor IIFE must expose Optimizer.stop');
}

{
  const ctx = {
    console,
    Math, Array, String, Number, Promise, Object, XMLSerializer: function () {},
    Image: function () {},
    Blob: function () {},
    URL: { createObjectURL: function () { return ''; } },
    document: {
      readyState: 'loading',
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      createElement: function () { return { getContext: function () { return null; } }; },
      createElementNS: function () { return { setAttribute: function () {} }; },
    },
    window: null,
  };
  ctx.window = ctx;
  vm.runInNewContext(
    files['vendor/primitive.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var P = Primitive, A = PrimitiveApp;\n' +
    '  if (!P || !P.Triangle || !P.Rectangle || !P.Ellipse || !P.Smiley) throw new Error("shapes");\n' +
    '  if (typeof P.Canvas.fromImage !== "function") throw new Error("fromImage");\n' +
    '  if (typeof P.Optimizer.prototype.stop !== "function") throw new Error("stop");\n' +
    '  if (P.clamp(3, 0, 2) !== 2 || P.clamp(-1, 0, 2) !== 0) throw new Error("clamp");\n' +
    '  if (A.clampInt(0, 1, 500) !== 1 || A.clampInt(999, 1, 500) !== 500) throw new Error("steps");\n' +
    '  if (A.PRESETS.length !== 3) throw new Error("presets");\n' +
    '  if (A.matchingPreset(A.DEFAULTS) !== "classic") throw new Error("classic");\n' +
    '  if (A.matchingPreset(A.PRESETS[0]) !== "quick") throw new Error("quick");\n' +
    '  if (A.pickRestoreUrl({png:"SRC"}, {png:"OUT"}) !== "SRC") throw new Error("restore prefers src");\n' +
    '  if (A.pickRestoreUrl(null, {png:"OUT"}) !== "OUT") throw new Error("restore old out");\n' +
    '  var d = A.downscaleNeed(1600, 900, 800);\n' +
    '  if (d.w !== 800 || d.h !== 450) throw new Error("downscale " + d.w + "x" + d.h);\n' +
    '  if (A.percentSimilar(0) !== "100.00") throw new Error("similar");\n' +
    '  var cfg = A.cfgFromSettings(A.DEFAULTS);\n' +
    '  if (cfg.steps !== 50 || cfg.shapeTypes.length < 1) throw new Error("cfg");\n' +
    '  var empty = A.cfgFromSettings({steps:50,shapes:200,mutations:30,alpha:0.5,mutateAlpha:true,computeSize:256,viewSize:512,shapeTypes:[],fill:"auto"});\n' +
    '  if (empty.shapeTypes.length < 1) throw new Error("triangle fallback");\n' +
    '  return A.PRESETS.length;\n' +
    '})();',
    ctx
  );
  console.log('engine + preset checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: primitiveIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'primitive', 'primitive.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/primitive/primitive.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
