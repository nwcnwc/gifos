// Pack apps/qr-scan/ into the finished, downloadable
// site/apps/qr-scan/qr-scan.gif (see apps/README.md).
import { qrScanIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/jsQR.js', 'vendor/COPYING-jsqr.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const PIN = '3325b0888fa4745c4e6940897d8c4f426fbaae76901fcbfe1871a04e90a51655';
const buf = readFileSync(join(dir, 'vendor', 'jsQR.js'));
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== PIN) throw new Error('vendor/jsQR.js sha256 ' + hex + ' ≠ pin ' + PIN);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'qr-scan') throw new Error('appId must be qr-scan');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.camera !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.camera');
}
if (manifest.capabilities.network) throw new Error('qr-scan has no network path');
if (manifest.capabilities.microphone) throw new Error('qr-scan has no microphone');
if (!manifest.data || !manifest.data.history || manifest.data.history.visibility !== 'private') {
  throw new Error('history must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'jsQR') throw new Error('basedOn.name must be jsQR');
if (listing.basedOn.url !== 'https://github.com/cozmo/jsQR') throw new Error('basedOn.url must be cozmo/jsQR');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'cozmo' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is cozmo, never GifOS');
}
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
if (!listing.categories || listing.categories[0] !== 'Utilities') throw new Error('listing.categories must include Utilities');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/qr-scan') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'getUserMedia']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['vendor/jsQR.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/jsQR.js': buf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-jsqr.txt': read('vendor/COPYING-jsqr.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (/mediaDevices|getUserMedia|webkitGetUserMedia/.test(files['app.js'] + html)) {
  throw new Error('qr-scan must not open a live camera stream');
}
if (!files['app.js'].includes('takePhoto') || !files['app.js'].includes('jsQR(')) {
  throw new Error('app.js must decode via jsQR from takePhoto or a drop');
}
if (!files['app.js'].includes("db('history')")) throw new Error('app.js must save history privately');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/jsQR.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax');
  }
  if (n === 'vendor/jsQR.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-jsqr.txt'].includes('Apache License')) {
  throw new Error('COPYING-jsqr.txt is not the Apache-2.0 notice');
}

{
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(files['vendor/jsQR.js'] + '\n' +
    'result = (function () {\n' +
    '  if (typeof jsQR !== "function") throw new Error("jsQR missing");\n' +
    '  var data = new Uint8ClampedArray(16);\n' +
    '  var r = jsQR(data, 2, 2);\n' +
    '  if (r !== null) throw new Error("empty image should be null");\n' +
    '  return "ok";\n' +
    '})();',
    ctx
  );
  console.log('jsQR empty-image check ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: qrScanIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'qr-scan', 'qr-scan.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/qr-scan/qr-scan.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
