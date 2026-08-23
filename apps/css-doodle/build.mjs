// Pack apps/css-doodle/ into the finished, downloadable
// site/apps/css-doodle/css-doodle.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// css-doodle npm tarball and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/css-doodle/build.mjs
import { cssDoodleIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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

const JS_SHA256 = '47dbd5196ef91f44372056a72d3d6f59512f597f46cd98555146df8eb1463e48';

for (const need of ['vendor/css-doodle.js', 'vendor/COPYING-css-doodle.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/css-doodle/vendor.mjs first (it needs the network).');
  }
}

const vendorBuf = readFileSync(join(dir, 'vendor', 'css-doodle.js'));
const vendorHex = createHash('sha256').update(vendorBuf).digest('hex');
if (vendorHex !== JS_SHA256) {
  throw new Error('vendor/css-doodle.js sha256 ' + vendorHex + ' ≠ pin ' + JS_SHA256 + ' — rerun vendor.mjs or move the pin.');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'requestAnimationFrame', 'custom element', 'CDN', '@grid', ':doodle']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/css-doodle.js', 'snippets.js', 'app.js', 'mp.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/css-doodle.js': vendorBuf.toString('utf8'),
  'snippets.js': read('snippets.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of css-doodle's MIT
  // work, and has to carry the notice with it.
  'COPYING-css-doodle.txt': read('vendor/COPYING-css-doodle.txt'),
};

{
  const helpPath = join(dir, 'help.md');
  if (!existsSync(helpPath)) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md trimmed length must be >= 400');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (!html.includes('<css-doodle')) throw new Error('index.html must mount a <css-doodle> square');
if (!html.includes('id="chips"') || !html.includes('id="recipe"')) {
  throw new Error('index.html must have remix chips and a recipe box');
}
if (manifest.name !== 'CSS Doodle') throw new Error('manifest.name must be CSS Doodle');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — the last pattern lives in gifos.db.');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer — Share the pattern is a room.');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the last pattern does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the pattern string has to sync.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('css-doodle has no network path');
if (listing.basedOn?.name !== 'css-doodle') {
  throw new Error('listing.basedOn.name must be css-doodle');
}
if (listing.basedOn?.url !== 'https://github.com/css-doodle/css-doodle') {
  throw new Error('listing.basedOn.url must be https://github.com/css-doodle/css-doodle');
}
if (listing.author?.name !== 'css-doodle') {
  throw new Error('listing.author.name must be css-doodle — they are the author, GifOS is the porter');
}
if (listing.porter?.name !== 'GifOS') {
  throw new Error('listing.porter.name must be GifOS');
}
if (listing.basedOn?.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('category must be Creativity');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate must be 2026-08-23');

if (!files['COPYING-css-doodle.txt'].includes('Yuan Chuan')) {
  throw new Error('COPYING-css-doodle.txt is not Yuan Chuan\'s MIT notice');
}
if (!files['snippets.js'].includes('CDSnippets') || (files['snippets.js'].match(/\bid:\s*'/g) || []).length < 6) {
  throw new Error('snippets.js must ship a handful of remix recipes');
}
if (/fonts\.googleapis|@font-face/i.test(files['snippets.js'])) {
  throw new Error('snippets must not ask for a font — the sandbox has no network');
}
if (!files['mp.js'].includes("db('room')") || !files['app.js'].includes("db('save')")) {
  throw new Error('app must use gifos.db save + room');
}
if (!files['mp.js'].includes('code:') || !files['mp.js'].includes('onApply')) {
  throw new Error('mp.js must share the pattern string on each player\'s own row');
}
if (!files['vendor/css-doodle.js'].includes('customElements') || !files['vendor/css-doodle.js'].includes('css-doodle')) {
  throw new Error('vendor/css-doodle.js does not register <css-doodle>');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  // vendor/css-doodle.js is the pinned IIFE; it still contains a dead Google
  // Fonts fetch that the sandbox (connect-src none) never completes. Our
  // chrome and snippets must not grow a network path of their own.
  if (n === 'vendor/css-doodle.js') {
    for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
      if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
    }
    continue;
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: cssDoodleIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'css-doodle', 'css-doodle.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/css-doodle/css-doodle.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (css-doodle IIFE + remix snippets, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
