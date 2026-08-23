// Pack apps/floppy-bird/ into the finished, downloadable
// site/apps/floppy-bird/floppy-bird.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned upstream and is run only when the pin moves.
//
// Run:  node apps/floppy-bird/build.mjs
import { floppyBirdIcon, screenshotPng } from './icon.mjs';
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

for (const need of [
  'vendor/jquery.min.js', 'vendor/jquery.transit.min.js', 'vendor/buzz.min.js',
  'vendor/assets.js', 'vendor/main.js', 'vendor/reset.css', 'vendor/main.css',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/floppy-bird/vendor.mjs first (it needs the network).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (manifest.capabilities.network) throw new Error('floppy-bird has no network path');
if (manifest.name === 'Flappy Bird' || /flappy bird/i.test(manifest.name)) {
  throw new Error('do not call it Flappy Bird in the name — upstream is Floppy Bird');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'vendor/jquery.min.js',
  'vendor/jquery.transit.min.js',
  'vendor/buzz.min.js',
  'vendor/assets.js',
  'vendor/main.js',
  'mp.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'mp.js': read('mp.js'),
  'vendor/jquery.min.js': read('vendor/jquery.min.js'),
  'vendor/jquery.transit.min.js': read('vendor/jquery.transit.min.js'),
  'vendor/buzz.min.js': read('vendor/buzz.min.js'),
  'vendor/assets.js': read('vendor/assets.js'),
  'vendor/main.js': read('vendor/main.js'),
  'vendor/reset.css': read('vendor/reset.css'),
  'vendor/main.css': read('vendor/main.css'),
  'COPYING.txt': read('COPYING.txt'),
  'NOTICE': read('NOTICE'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
for (const href of ['vendor/reset.css', 'vendor/main.css', 'style.css']) {
  if (!html.includes('href="' + href + '"')) throw new Error('index.html does not load ' + href);
}
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');

const src = files['mp.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('mp.js uses ' + bad);
}
if (/<\/script/i.test(src) || /<\/script/i.test(files['vendor/main.js'])) {
  throw new Error('a script contains </script — cannot inline safely');
}
if (!src.includes("db('room')") || !src.includes("db('prefs')")) {
  throw new Error('mp.js must use gifos.db prefs + room');
}
if (/invite/i.test(src) && /button/i.test(src)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: floppyBirdIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'floppy-bird', 'floppy-bird.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/floppy-bird/floppy-bird.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/floppy-bird/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
