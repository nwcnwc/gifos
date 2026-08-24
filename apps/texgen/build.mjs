// Pack apps/texgen/ into site/apps/texgen/texgen.gif.
// Run:  node apps/texgen/build.mjs
import { texgenIcon, screenshotPng } from './icon.mjs';
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

const JS_SHA256 = '9f565b1d2b7ad04a8fc5d99894809bd9690a35301139e9f9d0a80f63d97500a1';
const ORIG_SHA256 = '598d8d218f31cb3d227b31033494ab5587e3d32b49a02e7979214e264641be9d';

for (const need of ['vendor/texgen.js', 'vendor/TexGen.orig.js', 'vendor/COPYING-texgen.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const jsBuf = readFileSync(join(dir, 'vendor', 'texgen.js'));
const jsHex = createHash('sha256').update(jsBuf).digest('hex');
if (jsHex !== JS_SHA256) throw new Error('vendor/texgen.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256);
const origHex = createHash('sha256').update(readFileSync(join(dir, 'vendor', 'TexGen.orig.js'))).digest('hex');
if (origHex !== ORIG_SHA256) throw new Error('vendor/TexGen.orig.js sha256 drifted from upstream pin');

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'texgen') throw new Error('appId must be texgen');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('manifest must declare capabilities.db');
if (manifest.capabilities.multiplayer) throw new Error('texgen is solo');
if (manifest.capabilities.network) throw new Error('texgen has no network path');
if (manifest.capabilities.wasm) throw new Error('texgen is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'texgen.js' || listing.basedOn.url !== 'https://github.com/mrdoob/texgen.js') {
  throw new Error('listing.basedOn must name texgen.js at github.com/mrdoob/texgen.js');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'mrdoob' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is mrdoob, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') throw new Error('category must be Creativity');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/texgen') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/texgen.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-texgen.txt': read('vendor/COPYING-texgen.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of ['vendor/texgen.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!html.includes('id="tex"') || !html.includes('id="layers"')) throw new Error('index.html must host the canvas and layers');

const src = files['app.js'] + files['vendor/texgen.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('a script uses ' + bad);
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) throw new Error(n + ' uses ESM');
}
if (!files['COPYING-texgen.txt'].includes('texgen.js authors')) {
  throw new Error('COPYING-texgen.txt is not the upstream MIT notice');
}

{
  const ctx = {
    window: {}, console, Math, Array, String, Number, Float32Array, Uint8Array, JSON,
    document: { getElementById: function () { return null; }, createElement: function () { return { getContext: function () { return null; } }; } }
  };
  ctx.window = ctx;
  vm.runInNewContext(
    files['vendor/texgen.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var t = new TG.Texture(8, 8).add(new TG.XOR());\n' +
    '  var a = t.buffer.array;\n' +
    '  if (Math.abs(a[0] - 0) > 1e-9) throw new Error("xor00 " + a[0]);\n' +
    '  if (Math.abs(a[4] - 0.125) > 1e-9) throw new Error("xor10 " + a[4]);\n' +
    '  var u = new TG.Texture(8, 8).add(new TG.XOR().tint(1, 0.5, 0));\n' +
    '  if (Math.abs(u.buffer.array[5] - 0.125 * 0.5) > 1e-9) throw new Error("tint");\n' +
    '  var n = new TG.Texture(8, 8).add(new TG.Noise().seed(7));\n' +
    '  if (!(n.buffer.array[0] > 0) || n.buffer.array[0] > 1) throw new Error("noise");\n' +
    '  if (TexgenApp.SAMPLE.length < 3) throw new Error("sample");\n' +
    '  return a[4];\n' +
    '})();',
    ctx
  );
  console.log('XOR + tint + noise checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: texgenIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'texgen', 'texgen.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/texgen/texgen.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
