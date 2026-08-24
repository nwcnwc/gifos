// Pack apps/pivot/ into site/apps/pivot/pivot.gif.
import { pivotIcon, screenshotPng } from './icon.mjs';
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

const PINS = {
  'vendor/jquery.min.js': 'ff1523fb7389539c84c65aba19260648793bb4f5e29329d2ee8804bc37a3fe6e',
  'vendor/jquery-ui.min.js': '9528ca634fecad433d044ddd3e6f9ce1f068d5d932dafdbb19d8e6daea1968bd',
  'vendor/jquery.ui.touch-punch.min.js': '000854d782781aff1b16ea5451c1da3d07efadd35ab911ccb7e4b851571a25bd',
  'vendor/papaparse.min.js': 'b8e870c5d2b29772f10c9fa9a693c8b896aac8540ed6701e3cc6304c683febdb',
  'vendor/pivot.js': 'f84311f4637bdcc8adc73d0bebf1470e45bed0174cc32b30b36a07256ca92f93',
  'vendor/export_renderers.js': '21ed04edadcb7445fe9bf27c2ec3020a2533184e0bdcd1baeafaf12fb483ebc4',
};

for (const need of [
  ...Object.keys(PINS),
  'vendor/pivot.css',
  'vendor/sample.js',
  'vendor/COPYING-pivottable.txt',
  'vendor/COPYING-jquery.txt',
  'vendor/COPYING-jquery-ui.txt',
  'vendor/COPYING-papaparse.txt',
  'vendor/COPYING-touch-punch.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
for (const [rel, hex] of Object.entries(PINS)) pin(rel, hex);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'pivot') throw new Error('appId must be pivot');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('must declare capabilities.db');
if (manifest.capabilities.network) throw new Error('pivot has no network path');
if (manifest.capabilities.wasm) throw new Error('pivot is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/nicolaskruchten/pivottable') {
  throw new Error('basedOn.url must be nicolaskruchten/pivottable');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = [
  'vendor/jquery.min.js', 'vendor/jquery-ui.min.js', 'vendor/jquery.ui.touch-punch.min.js',
  'vendor/papaparse.min.js', 'vendor/pivot.js', 'vendor/export_renderers.js',
  'vendor/sample.js', 'app.js'
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/jquery.min.js': read('vendor/jquery.min.js'),
  'vendor/jquery-ui.min.js': read('vendor/jquery-ui.min.js'),
  'vendor/jquery.ui.touch-punch.min.js': read('vendor/jquery.ui.touch-punch.min.js'),
  'vendor/papaparse.min.js': read('vendor/papaparse.min.js'),
  'vendor/pivot.js': read('vendor/pivot.js'),
  'vendor/pivot.css': read('vendor/pivot.css'),
  'vendor/export_renderers.js': read('vendor/export_renderers.js'),
  'vendor/sample.js': read('vendor/sample.js'),
  'app.js': read('app.js'),
  'COPYING-pivottable.txt': read('vendor/COPYING-pivottable.txt'),
  'COPYING-jquery.txt': read('vendor/COPYING-jquery.txt'),
  'COPYING-jquery-ui.txt': read('vendor/COPYING-jquery-ui.txt'),
  'COPYING-papaparse.txt': read('vendor/COPYING-papaparse.txt'),
  'COPYING-touch-punch.txt': read('vendor/COPYING-touch-punch.txt'),
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
if (!html.includes('href="style.css"') || !html.includes('href="vendor/pivot.css"')) {
  throw new Error('index.html does not load CSS');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (/gtag\(|googletagmanager|google-analytics/i.test(html + files['app.js'])) {
  throw new Error('tracking leaked into the port');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last table privately');
}
if (!files['app.js'].includes('pivotUI') || !files['app.js'].includes('Papa.parse')) {
  throw new Error('app.js must call pivotUI and Papa.parse');
}
if (!files['vendor/sample.js'].includes('PIVOT_SAMPLE_CSV')) {
  throw new Error('sample.js must export PIVOT_SAMPLE_CSV');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-pivottable.txt'].includes('Nicolas Kruchten')) {
  throw new Error('COPYING-pivottable.txt is not the upstream MIT notice');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: pivotIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pivot', 'pivot.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pivot/pivot.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
