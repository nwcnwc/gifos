// Pack apps/skifree/ into the finished, downloadable
// site/apps/skifree/skifree.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the pinned
// basicallydan/skifree.js commit and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/skifree/build.mjs
import { skiFreeIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/engine.js', 'vendor/sprite-characters.png', 'vendor/skifree-objects.png',
  'vendor/COPYING.txt',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/skifree/vendor.mjs first (it needs the network).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.motion !== true) {
  throw new Error('manifest must declare capabilities.motion — tilt is how a phone steers');
}
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (manifest.capabilities.network) throw new Error('skifree has no network path');
if (manifest.appId !== 'skifree') throw new Error('appId must be skifree');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'SkiFree.js') {
  throw new Error('listing.basedOn.name must be SkiFree.js');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is basicallydan, never GifOS');
}
if (listing.author.name !== 'basicallydan') {
  throw new Error('author.name must be basicallydan');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/skifree') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
if (!/^Race a ghost/i.test(listing.tagline || '')) {
  throw new Error('listing.tagline must lead with racing a ghost');
}
if (!/one link/i.test(listing.tagline || '') && !/the link/i.test(listing.description || '')) {
  throw new Error('listing must say the race is one link');
}
if (!/unofficial/i.test(listing.description || '')) {
  throw new Error('listing.description must keep the unofficial credit');
}

const SCRIPTS = [
  'vendor/engine.js',
  'mp.js',
  'touch.js',
  'boot.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'mp.js': read('mp.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'vendor/engine.js': read('vendor/engine.js'),
  'vendor/sprite-characters.png': readBin('vendor/sprite-characters.png'),
  'vendor/skifree-objects.png': readBin('vendor/skifree-objects.png'),
  'COPYING.txt': read('COPYING.txt'),
  'NOTICE': read('NOTICE'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('src="vendor/sprite-characters.png"')) {
  throw new Error('index.html is missing the characters <img>');
}
if (!html.includes('src="vendor/skifree-objects.png"')) {
  throw new Error('index.html is missing the objects <img>');
}
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/gtag|googletagmanager|analytics/i.test(html)) {
  throw new Error('index.html still has analytics');
}

const sandbox = { window: {}, console, navigator: { vibrate: false, userAgent: '' }, globalThis: null };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(files['vendor/engine.js'], sandbox);
if (!sandbox.Ski || typeof sandbox.Ski.Skier !== 'function' || typeof sandbox.Ski.Game !== 'function') {
  throw new Error('vendor/engine.js did not attach Ski.Skier / Ski.Game');
}
if (!sandbox.Ski.sprites || !sandbox.Ski.sprites.skier) {
  throw new Error('vendor/engine.js did not attach Ski.sprites');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}

const ours = ['mp.js', 'touch.js', 'boot.js'];
for (const n of ours) {
  const src = files[n];
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (src.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
  if (/invite/i.test(src) && /button/i.test(src)) {
    throw new Error('invite is OS chrome — do not add an invite button');
  }
}
if (!files['mp.js'].includes("db('room')")) throw new Error('mp.js must use gifos.db room');
if (!files['boot.js'].includes("db('prefs')")) throw new Error('boot.js must use gifos.db prefs');
if (!files['mp.js'].includes('drawGhosts')) throw new Error('mp.js must draw ghost skiers');
if (!files['touch.js'].includes('pointerdown')) throw new Error('touch.js must ski on pointer');
if (!files['touch.js'].includes('deviceorientation') && !files['touch.js'].includes('gifos.motion')) {
  throw new Error('touch.js must steer from tilt');
}
if (!files['boot.js'].includes('seedSlope')) throw new Error('boot.js must seed the slope so first paint is not a void');

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: skiFreeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'skifree', 'skifree.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/skifree/skifree.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/skifree/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
