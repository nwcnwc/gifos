// Pack apps/mykonos/ into the finished, downloadable
// site/apps/mykonos/mykonos.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/mykonos/build.mjs
import { mykonosIcon, screenshotPng } from './icon.mjs';
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

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of ['world.js', 'game.js', 'mp.js', 'touch.js', 'boot.js',
                    'vendor/COPYING-mykonos.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'mykonos') throw new Error('appId must be mykonos');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('mykonos has no network path');
if (manifest.capabilities.wasm) throw new Error('mykonos is classic canvas — no wasm');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write — live walkers have to sync');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Mykonos Island Voxels') {
  throw new Error('basedOn.name must be Mykonos Island Voxels');
}
if (listing.basedOn.url !== 'https://github.com/boona13/mykonos-island-voxels') {
  throw new Error('basedOn.url must be https://github.com/boona13/mykonos-island-voxels');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'boona13' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is boona13, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/mykonos') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'WebGL', 'canvas', 'ESM', 'PNG']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['world.js', 'game.js', 'mp.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'world.js': read('world.js'),
  'game.js': read('game.js'),
  'mp.js': read('mp.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'COPYING-mykonos.txt': read('vendor/COPYING-mykonos.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['boot.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['mp.js'].includes('only THEIR row') && !files['mp.js'].includes('only their own')) {
  throw new Error('mp.js must say each player writes only their own row');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-mykonos.txt'].includes('boona13')) {
  throw new Error('COPYING-mykonos.txt is not the upstream MIT notice');
}
if (!files['world.js'].includes('smallMykonosHouse') && !files['world.js'].includes('mainChapel')) {
  throw new Error('world.js lost the village builders');
}

{
  const sandbox = {
    window: null,
    Math, Date, parseInt, parseFloat, isFinite, NaN, Infinity, undefined,
    Object, Array, String, Number, Boolean, console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(files['world.js'], sandbox);
  const MW = sandbox.MykWorld;
  if (!MW || typeof MW.seed !== 'function') throw new Error('world.js did not attach MykWorld.seed');
  const island = MW.seed();
  if (!island.voxels || island.voxels.length < 400) {
    throw new Error('seed island is too small: ' + (island.voxels && island.voxels.length));
  }
  if (MW.blocked(island.occ, island.spawn.x, island.spawn.y)) {
    throw new Error('spawn is blocked');
  }
  if (!MW.blocked(island.occ, 2.5, 2.5)) {
    throw new Error('the house at 2,2 should block a walker');
  }
  if (!MW.blocked(island.occ, 0.5, 13.5)) {
    throw new Error('the water strip should not be walkable');
  }
  if (MW.blocked(island.occ, 5.5, 12.5)) {
    throw new Error('the bridge over the water should be walkable');
  }
  const fig = MW.person(1, 1, 1, [27, 91, 168], 1, 0.2);
  if (!fig || fig.length < 3) throw new Error('person() must return a walker');
  console.log('island checks ok —', island.voxels.length, 'surface voxels, spawn', island.spawn.x, island.spawn.y);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: mykonosIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'mykonos', 'mykonos.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/mykonos/mykonos.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/mykonos/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
