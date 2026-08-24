// Pack apps/jpg-glitch/ into site/apps/jpg-glitch/jpg-glitch.gif.
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
// Run:  node apps/jpg-glitch/build.mjs
import { jpgGlitchIcon, screenshotPng } from './icon.mjs';
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

const JS_SHA256 = 'f992050729a12ed11ed05ec47581cb360dcf08e5d1672d1b911ad072e81908bb';

for (const need of ['vendor/glitch-canvas.js', 'vendor/COPYING-jpg-glitch.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const jsBuf = readFileSync(join(dir, 'vendor', 'glitch-canvas.js'));
const jsHex = createHash('sha256').update(jsBuf).digest('hex');
if (jsHex !== JS_SHA256) {
  throw new Error('vendor/glitch-canvas.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'jpg-glitch') throw new Error('appId must be jpg-glitch');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('manifest must declare capabilities.db');
if (manifest.capabilities.camera !== true) throw new Error('manifest must declare capabilities.camera');
if (manifest.capabilities.multiplayer) throw new Error('jpg-glitch is solo');
if (manifest.capabilities.network) throw new Error('jpg-glitch has no network path');
if (manifest.capabilities.wasm) throw new Error('jpg-glitch is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'jpg-glitch' || listing.basedOn.url !== 'https://github.com/snorpey/jpg-glitch') {
  throw new Error('listing.basedOn must name jpg-glitch at github.com/snorpey/jpg-glitch');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'snorpey' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is snorpey, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') throw new Error('category must be Creativity');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/jpg-glitch') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'getUserMedia']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/glitch-canvas.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-jpg-glitch.txt': read('vendor/COPYING-jpg-glitch.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of ['vendor/glitch-canvas.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!html.includes('id="amount"') || !html.includes('id="seed"') || !html.includes('id="iterations"') || !html.includes('id="quality"')) {
  throw new Error('index.html must offer the four glitch sliders');
}
if (!html.includes('Take photo')) throw new Error('index.html must offer Take photo');

const src = files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!src.includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!src.includes('takePhoto')) throw new Error('app.js must use gifos.takePhoto');
if (files['vendor/glitch-canvas.js'].includes('new Worker') || files['vendor/glitch-canvas.js'].includes('getUserMedia')) {
  throw new Error('vendor must not spawn a worker or hold a live camera');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM');
  }
}
if (!files['COPYING-jpg-glitch.txt'].includes('Georg Fischer')) {
  throw new Error('COPYING-jpg-glitch.txt is not the upstream MIT notice');
}

{
  const ctx = { window: {}, console, Math, Array, String, Number, document: { getElementById: function () { return null; } } };
  ctx.window = ctx;
  vm.runInNewContext(
    files['vendor/glitch-canvas.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var G = glitchCanvas;\n' +
    '  var p = G.getNormalizedParameters({ amount: 24, seed: 53, iterations: 21, quality: 46 });\n' +
    '  if (Math.abs(p.amount - 0.24) > 1e-9) throw new Error("amount " + p.amount);\n' +
    '  if (Math.abs(p.seed - 0.53) > 1e-9) throw new Error("seed");\n' +
    '  if (p.iterations !== 21) throw new Error("iter");\n' +
    '  var bytes = [];\n' +
    '  for (var i = 0; i < 800; i++) bytes[i] = (i === 100) ? 255 : ((i === 101) ? 218 : (i % 251));\n' +
    '  var header = G.getJpegHeaderSize(bytes);\n' +
    '  if (header !== 102) throw new Error("header " + header);\n' +
    '  var before = bytes.slice();\n' +
    '  G.smashBytes(bytes, p);\n' +
    '  var changed = 0;\n' +
    '  for (i = 0; i < bytes.length; i++) if (bytes[i] !== before[i]) changed++;\n' +
    '  if (changed < 1) throw new Error("smash did nothing");\n' +
    '  if (JpgGlitchApp.clamp(-3, 0, 99) !== 0) throw new Error("clamp");\n' +
    '  if (JpgGlitchApp.DEFAULTS.amount !== 24) throw new Error("defaults");\n' +
    '  return changed;\n' +
    '})();',
    ctx
  );
  console.log('slider-normalise + jpeg-smash checks ok —', ctx.result, 'bytes hit');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jpgGlitchIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'jpg-glitch', 'jpg-glitch.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/jpg-glitch/jpg-glitch.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
