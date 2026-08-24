// Pack apps/fend/ into site/apps/fend/fend.gif.
// fend-wasm.js is generated here: window.FEND_WASM_B64 from the pinned .wasm.
import { fendIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const pin = (rel, hex) => {
  const buf = readFileSync(join(dir, rel));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== hex) throw new Error(rel + ' sha256 ' + got + ' ≠ pin ' + hex);
  return buf;
};

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const wasmBuf = pin('vendor/fend_wasm_bg.wasm', '85007e78314c433158767514f7a3874dbc872156c1e290604c75911834cffc71');
pin('vendor/fend_wasm.js', '71335d51907a19f7e36798cb4759590d37e84d1f03bf149610505fd62f498f4a');

for (const need of ['vendor/COPYING-fend.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'fend') throw new Error('appId must be fend');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.wasm !== true) {
  throw new Error('must declare capabilities.db and capabilities.wasm');
}
if (manifest.capabilities.network) throw new Error('no network path');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/printfn/fend') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');
const wasmJs = strModule('window.FEND_WASM_B64', wasmBuf.toString('base64'));

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'fend-wasm.js': wasmJs,
  'vendor/fend_wasm.js': read('vendor/fend_wasm.js'),
  'app.js': read('app.js'),
  'COPYING-fend.txt': read('vendor/COPYING-fend.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['fend-wasm.js', 'vendor/fend_wasm.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the pad privately');
}
if (!files['app.js'].includes('initSync') || !files['app.js'].includes('FEND_WASM_B64')) {
  throw new Error('app.js must instantiate wasm from bytes');
}
if (!files['app.js'].includes('The calculator engine did not start on this device.')) {
  throw new Error('WASM miss must be one user-facing sentence');
}
if (!files['app.js'].includes('out.message') && !files['app.js'].includes('answerOf')) {
  throw new Error('errors must surface the engine message');
}
if (!html.includes('id="pad"') || !html.includes('data-token="ft"') || !html.includes('inputmode="none"')) {
  throw new Error('phone keypad (pad + unit chips + inputmode none) required');
}
if (!files['style.css'].includes('max-width: 640px') || !files['style.css'].includes('.pad { display: grid; }')) {
  throw new Error('keypad must show on a phone-width screen');
}
if (!files['vendor/fend_wasm.js'].includes('window.Fend') && !files['vendor/fend_wasm.js'].includes('root.Fend')) {
  throw new Error('glue must expose Fend');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/') || n === 'fend-wasm.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: fendIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'fend', 'fend.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/fend/fend.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (wasm', (wasmBuf.length / 1024).toFixed(0), 'KB)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
