// Pack apps/underrun/ into the finished, downloadable
// site/apps/underrun/underrun.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which copies vendor/ from the pinned
// upstream and is run only when the pin moves.
//
// Run:  node apps/underrun/build.mjs
import { underrunIcon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const VENDOR_JS = [
  'vendor/game.js', 'vendor/random.js', 'vendor/renderer.js', 'vendor/entity.js',
  'vendor/entity-cpu.js', 'vendor/entity-player.js', 'vendor/entity-plasma.js',
  'vendor/entity-spider.js', 'vendor/entity-sentry.js', 'vendor/entity-particle.js',
  'vendor/entity-health.js', 'vendor/entity-explosion.js',
  'vendor/sonantx-reduced.js', 'vendor/music-dark-meat-beat.js',
  'vendor/sound-effects.js', 'vendor/audio.js', 'vendor/terminal.js', 'vendor/main.js',
];
const VENDOR_PNG = ['vendor/m/q2.png', 'vendor/m/l1.png', 'vendor/m/l2.png', 'vendor/m/l3.png'];
const OURS = ['touch.js', 'net.js', 'boot.js'];

for (const f of [...VENDOR_JS, ...VENDOR_PNG]) {
  if (!existsSync(join(dir, f))) {
    throw new Error(f + ' is missing — run node apps/underrun/vendor.mjs first (it needs the network).');
  }
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-underrun.txt': read('vendor/COPYING-underrun.txt'),
  'COPYING-sonantx.txt': read('vendor/COPYING-sonantx.txt'),
};
for (const s of OURS) files[s] = read(s);
for (const s of VENDOR_JS) files[s] = read(s);
for (const s of VENDOR_PNG) files[s] = bin(s);

const html = files['index.html'];
for (const s of [...OURS, ...VENDOR_JS]) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="touch"')) throw new Error('index.html is missing the touch overlay');
for (const s of VENDOR_PNG) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not embed ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Underrun') {
  throw new Error('listing.basedOn.name must be Underrun');
}
if (!listing.author || listing.author.name !== 'phoboslab') {
  throw new Error('author.name must be phoboslab');
}
if (listing.author && /gifos/i.test(listing.author.name || '')) {
  throw new Error('author is phoboslab, not GifOS');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('porter.name must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('categories must start with Games');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (manifest.capabilities.network) {
  throw new Error('Underrun has no network path. Do not declare capabilities.network.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.appId !== 'underrun') throw new Error('appId must be underrun');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|^\s*export\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — GifOS inlines classic scripts');
  }
}
for (const s of OURS) {
  const src = files[s];
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (src.includes(bad)) throw new Error(s + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/\bfetch\s*\(/.test(src)) throw new Error(s + ' uses fetch( — nothing leaves this tab.');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: underrunIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'underrun', 'underrun.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/underrun/underrun.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/underrun/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
