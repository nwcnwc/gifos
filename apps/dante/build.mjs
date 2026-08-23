// Pack apps/dante/ into the finished, downloadable
// site/apps/dante/dante.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which copies vendor/ from the pinned
// upstream and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/dante/build.mjs
import { danteIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'game.js'))) {
  throw new Error('vendor/game.js is missing — run node apps/dante/vendor.mjs first (it needs the network).');
}

const SCRIPTS = ['storage.js', 'vendor/game.js', 'net.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-dante.txt': read('vendor/COPYING-dante.txt'),
  'COPYING-soundbox.txt': read('vendor/COPYING-soundbox.txt'),
  'NOTICE': read('NOTICE'),
};
for (const s of SCRIPTS) files[s] = read(s);
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="touch"')) throw new Error('index.html is missing the touch overlay');
if (!html.includes('id="hC"')) throw new Error('index.html is missing canvas#hC');
if (!html.includes('id="hD"')) throw new Error('index.html is missing canvas#hD');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Dante') {
  throw new Error('listing.basedOn.name must be Dante');
}
if (listing.basedOn.url !== 'https://github.com/SalvatorePreviti/js13k-2022') {
  throw new Error('listing.basedOn.url must be https://github.com/SalvatorePreviti/js13k-2022');
}
if (listing.author && /gifos/i.test(listing.author.name || '')) {
  throw new Error('author is SalvatorePreviti, not GifOS');
}
if (!listing.author || listing.author.name !== 'SalvatorePreviti') {
  throw new Error('author.name must be SalvatorePreviti');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('porter.name must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') {
  throw new Error('releaseDate must be 2026-08-23');
}
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/dante') {
  throw new Error('listing.homepage must be the gifos tree');
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
if (!manifest.capabilities.pointer) {
  throw new Error('manifest must declare capabilities.pointer — a sandboxed frame is refused the lock');
}
if (!manifest.capabilities.fullscreen) {
  throw new Error('manifest must declare capabilities.fullscreen');
}
if (manifest.capabilities.network) {
  throw new Error('Dante has no network path. Do not declare capabilities.network.');
}
if (manifest.minBuild !== 1314) {
  throw new Error('minBuild must be 1314 — pointer lock is 1285 and fullscreen is 1314');
}
if (manifest.appId !== 'dante') throw new Error('appId must be dante');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|^\s*export\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — GifOS inlines classic scripts');
  }
}
for (const s of ['storage.js', 'net.js', 'touch.js', 'boot.js']) {
  const src = files[s];
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (src.includes(bad)) throw new Error(s + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/\bfetch\s*\(/.test(src)) throw new Error(s + ' uses fetch( — nothing leaves this tab.');
}
if (/\bfetch\s*\(/.test(files['vendor/game.js'])) {
  throw new Error('vendor/game.js still contains fetch( — rerun vendor.mjs');
}
if (/location\.reload/.test(files['vendor/game.js'])) {
  throw new Error('vendor/game.js still contains location.reload — rerun vendor.mjs');
}
if (!files['vendor/game.js'].includes('window.DanteEngine')) {
  throw new Error('vendor/game.js does not attach window.DanteEngine — rerun vendor.mjs');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: danteIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'dante', 'dante.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/dante/dante.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/dante/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
