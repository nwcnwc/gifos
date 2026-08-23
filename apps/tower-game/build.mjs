// Pack apps/tower-game/ into the finished, downloadable
// site/apps/tower-game/tower-game.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the pinned
// iamkun/tower_game commit and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/tower-game/build.mjs
import { towerGameIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/main.js', 'vendor/assets.js', 'vendor/COPYING.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/tower-game/vendor.mjs first (it needs the network).');
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
if (manifest.capabilities.network) throw new Error('tower-game has no network path');
if (manifest.appId !== 'tower-game') throw new Error('appId must be tower-game');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is iamkun, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/tower-game') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'vendor/assets.js',
  'vendor/main.js',
  'mp.js',
  'boot.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'mp.js': read('mp.js'),
  'boot.js': read('boot.js'),
  'vendor/assets.js': read('vendor/assets.js'),
  'vendor/main.js': read('vendor/main.js'),
  'COPYING.txt': read('COPYING.txt'),
  'NOTICE': read('NOTICE'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/gtag|googletagmanager|micromessenger|wxShare/i.test(html)) {
  throw new Error('index.html still has analytics or WeChat chrome');
}

const main = files['vendor/main.js'];
if (!main.includes('window.TowerGame')) throw new Error('vendor/main.js does not attach window.TowerGame');
if (!main.includes('TOWER_ASSETS')) throw new Error('vendor/main.js was not patched to read TOWER_ASSETS');
if (main.includes('"./assets/".concat')) throw new Error('vendor/main.js still uses ./assets/ paths');

if (!files['vendor/assets.js'].includes('var TOWER_ASSETS')) {
  throw new Error('vendor/assets.js must define TOWER_ASSETS');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/main.js' && n !== 'vendor/assets.js') {
    if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
      throw new Error(n + ' uses ESM — the runtime drops type=module.');
    }
  }
}

const src = files['mp.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('mp.js uses ' + bad);
}
if (!src.includes("db('room')")) throw new Error('mp.js must use gifos.db room');
if (!files['boot.js'].includes("db('prefs')")) throw new Error('boot.js must use gifos.db prefs');
if (/invite/i.test(src) && /button/i.test(src)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (/invite/i.test(files['boot.js']) && /button/i.test(files['boot.js'])) {
  throw new Error('invite is OS chrome — do not add an invite button');
}

{
  if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing — the OS Help popup reads it from the GIF');
  const help = read('help.md');
  if (help.trim().length < 400) throw new Error('help.md is too short (need >= 400 trimmed chars)');
  files['help.md'] = help;
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: towerGameIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tower-game', 'tower-game.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tower-game/tower-game.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/tower-game/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
