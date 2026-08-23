// Pack apps/air-hockey/ into the finished, downloadable
// site/apps/air-hockey/air-hockey.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned AirHockeyWebGL commit and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/air-hockey/build.mjs
import { airHockeyIcon, screenshotPng } from './icon.mjs';
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

const NEED = [
  'vendor/three.min.js', 'vendor/box2d.js', 'vendor/OBJMTLLoader.js',
  'vendor/physics.js', 'vendor/AI.js', 'vendor/audio.js', 'vendor/hockey.js',
  'vendor/model.js', 'vendor/assets.js',
  'vendor/images/floor.jpg', 'vendor/images/surface.png',
  'vendor/audio/hit1.ogg', 'vendor/audio/hit2.ogg',
  'vendor/audio/edge1.ogg', 'vendor/audio/edge2.ogg', 'vendor/audio/goal1.ogg',
  'vendor/COPYING-airhockeywebgl.txt', 'vendor/COPYING-three.txt', 'vendor/COPYING-box2d.txt',
];
for (const need of NEED) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/air-hockey/vendor.mjs first (it needs the network).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('air-hockey has no network path');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}
if (listing.author && listing.author.name === 'GifOS') {
  throw new Error('author is MortimerGoro, never GifOS — this is a port');
}
if (listing.author.name !== 'MortimerGoro') {
  throw new Error('author must be MortimerGoro');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'AirHockeyWebGL') {
  throw new Error('basedOn.name must be AirHockeyWebGL');
}

const listingBlob = (listing.tagline || '') + '\n' + (listing.description || '');
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'WebGL', 'Box2D', 'three.js']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'vendor/three.min.js', 'vendor/OBJMTLLoader.js', 'vendor/box2d.js',
  'vendor/physics.js', 'vendor/AI.js', 'vendor/audio.js', 'vendor/hockey.js',
  'vendor/model.js', 'vendor/assets.js', 'boot.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'boot.js': read('boot.js'),
  'vendor/three.min.js': read('vendor/three.min.js'),
  'vendor/OBJMTLLoader.js': read('vendor/OBJMTLLoader.js'),
  'vendor/box2d.js': read('vendor/box2d.js'),
  'vendor/physics.js': read('vendor/physics.js'),
  'vendor/AI.js': read('vendor/AI.js'),
  'vendor/audio.js': read('vendor/audio.js'),
  'vendor/hockey.js': read('vendor/hockey.js'),
  'vendor/model.js': read('vendor/model.js'),
  'vendor/assets.js': read('vendor/assets.js'),
  'vendor/images/floor.jpg': bin('vendor/images/floor.jpg'),
  'vendor/images/surface.png': bin('vendor/images/surface.png'),
  'vendor/audio/hit1.ogg': bin('vendor/audio/hit1.ogg'),
  'vendor/audio/hit2.ogg': bin('vendor/audio/hit2.ogg'),
  'vendor/audio/edge1.ogg': bin('vendor/audio/edge1.ogg'),
  'vendor/audio/edge2.ogg': bin('vendor/audio/edge2.ogg'),
  'vendor/audio/goal1.ogg': bin('vendor/audio/goal1.ogg'),
  'COPYING-airhockeywebgl.txt': read('vendor/COPYING-airhockeywebgl.txt'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
  'COPYING-box2d.txt': read('vendor/COPYING-box2d.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('src="vendor/images/floor.jpg"')) throw new Error('index.html is missing the floor <img>');
if (!html.includes('src="vendor/images/surface.png"')) throw new Error('index.html is missing the surface <img>');
if (!html.includes('id="vs_floor"') || !html.includes('id="fs_floor"')) {
  throw new Error('index.html is missing the floor shaders the original scene samples');
}
if (!html.includes('Invite')) throw new Error('tell the player to press Invite');
if (/id=["']invite["']/i.test(html) || /id=["']share["']/i.test(html)) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/three.min.js' && n !== 'vendor/box2d.js' && n !== 'vendor/assets.js') {
    if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
      throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
    }
  }
}
if (!files['vendor/assets.js'].includes('HOCKEY_FILES')) {
  throw new Error('vendor/assets.js is not the inlined OBJ/MTL map');
}
if (!files['vendor/three.min.js'].includes('REVISION:"66"') && !files['vendor/three.min.js'].includes("REVISION:'66'")) {
  throw new Error('vendor/three.min.js is not three.js r66');
}
if (!files['boot.js'].includes('Invite') || files['boot.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['COPYING-airhockeywebgl.txt'].includes('MortimerGoro')) {
  throw new Error('COPYING-airhockeywebgl.txt is not the upstream MIT notice');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: airHockeyIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'air-hockey', 'air-hockey.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/air-hockey/air-hockey.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/air-hockey/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
