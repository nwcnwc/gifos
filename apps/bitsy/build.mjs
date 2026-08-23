// Pack apps/bitsy/ into the finished, downloadable
// site/apps/bitsy/bitsy.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// le-doux/bitsy commit and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/bitsy/build.mjs
import { bitsyIcon, screenshotPng } from './icon.mjs';
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

const ENGINE_SHA256 = 'aeb6e09d2976b7f63b1d1fb3ff0a0d18a51c08051cb07c4d6271ed4281bbe1a2';

for (const need of [
  'vendor/bitsy-engine.js', 'vendor/font.js', 'vendor/example.js',
  'vendor/COPYING-bitsy.txt', 'vendor/CREDITS-bitsy.txt',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/bitsy/vendor.mjs first (it needs the network).');
  }
}

const engineBuf = readFileSync(join(dir, 'vendor', 'bitsy-engine.js'));
const engineHex = createHash('sha256').update(engineBuf).digest('hex');
if (engineHex !== ENGINE_SHA256) {
  throw new Error('vendor/bitsy-engine.js sha256 ' + engineHex + ' ≠ pin ' + ENGINE_SHA256 + ' — rerun vendor.mjs or move the pin.');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the solo world does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the shared world has to sync.');
}
if (manifest.capabilities.network) throw new Error('bitsy has no network path');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'Bitsy' || listing.basedOn.url !== 'https://github.com/le-doux/bitsy') {
  throw new Error('listing.basedOn must name Bitsy at github.com/le-doux/bitsy');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'le-doux') {
  throw new Error('listing.author must be le-doux');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') throw new Error('category must start with Games');
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate must be 2026-08-23');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'canvas', 'JSON', 'textarea']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'vendor/bitsy-engine.js', 'vendor/font.js', 'vendor/example.js',
  'worlds.js', 'editor.js', 'app.js', 'mp.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/bitsy-engine.js': engineBuf.toString('utf8'),
  'vendor/font.js': read('vendor/font.js'),
  'vendor/example.js': read('vendor/example.js'),
  'worlds.js': read('worlds.js'),
  'editor.js': read('editor.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-bitsy.txt': read('vendor/COPYING-bitsy.txt'),
  'CREDITS-bitsy.txt': read('vendor/CREDITS-bitsy.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="game"')) throw new Error('index.html must mount the game canvas');
if (!html.includes('id="worldData"') || !html.includes('id="roomCanvas"') || !html.includes('id="paintCanvas"')) {
  throw new Error('index.html must ship the small editor');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}

if (!files['COPYING-bitsy.txt'].includes('Bitsy authors')) {
  throw new Error('COPYING-bitsy.txt is not the Bitsy MIT notice');
}
if (!files['worlds.js'].includes('BitsyWorlds') || (files['worlds.js'].match(/\bid:\s*'/g) || []).length < 3) {
  throw new Error('worlds.js must ship a handful of worlds');
}
if (!files['mp.js'].includes("db('room')") || !files['app.js'].includes("db('save')")) {
  throw new Error('app must use gifos.db save + room');
}
if (!files['mp.js'].includes('world:') || !files['mp.js'].includes('onApply')) {
  throw new Error('mp.js must share the world string on each player\'s own row');
}
if (!files['vendor/bitsy-engine.js'].includes('function loadGame') || !files['vendor/font.js'].includes('BITSY_DEFAULT_FONT')) {
  throw new Error('engine/font are not the bitsy player');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  if (n === 'vendor/bitsy-engine.js') {
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

const bytes = await gif.encode(files, { preview: bitsyIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'bitsy', 'bitsy.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/bitsy/bitsy.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (player + a few worlds + a small editor, no network)');
console.log('wrote apps/bitsy/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
