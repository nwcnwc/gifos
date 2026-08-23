// Pack apps/regexper/ into the finished, downloadable
// site/apps/regexper/regexper.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/regexper.js from
// the pinned upstream and is run only when the pin moves.
//
// Run:  node apps/regexper/build.mjs
import { regexperIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush — the
// encoder is not a streaming compressor anyway.
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
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (!existsSync(join(dir, 'vendor', 'regexper.js'))) {
  throw new Error('vendor/regexper.js is missing — run node apps/regexper/vendor.mjs first (it needs the network).');
}

const SCRIPTS = ['app.js', 'vendor/regexper.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'vendor/regexper.js': read('vendor/regexper.js'),
  'COPYING-regexper.txt': read('vendor/COPYING-regexper.txt'),
  'COPYING-snapsvg.txt': read('vendor/COPYING-snapsvg.txt'),
  'NOTICE.txt': read('vendor/NOTICE.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module — classic scripts only');
if (/googleapis|gstatic|cdn\.|google-analytics|sentry|fonts\.google/i.test(html + files['style.css'])) {
  throw new Error('page still pulls a CDN, analytics, or a webfont');
}
if (manifest.capabilities && (manifest.capabilities.network || manifest.capabilities.wasm)) {
  throw new Error('regexper has no network path and no wasm');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'javallone') {
  throw new Error('listing.author must be javallone');
}
if (!files['COPYING-regexper.txt'].includes('Jeffrey Avallone')) {
  throw new Error('COPYING-regexper.txt is not Jeffrey Avallone\'s MIT notice');
}
if (!files['vendor/regexper.js'].includes('word boundary') &&
    !files['vendor/regexper.js'].includes('Ignore Case')) {
  throw new Error('vendor/regexper.js does not look like Regexper');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/regexper.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — classic-script inline path cannot carry it');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: regexperIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'regexper', 'regexper.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/regexper/regexper.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Regexper IIFE in-GIF, no network)');
console.log('wrote apps/regexper/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
