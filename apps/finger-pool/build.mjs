// Pack apps/finger-pool/ into the finished, downloadable
// site/apps/finger-pool/finger-pool.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/finger-pool/build.mjs
import { fingerPoolIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/Vec2.js', 'vendor/Sphere.js', 'vendor/COPYING-fingerpool.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'finger-pool') throw new Error('appId must be finger-pool');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('finger-pool has no network path');
if (manifest.capabilities.wasm) throw new Error('finger-pool is classic canvas — no wasm');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write — live scores have to sync');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'fingerPool') {
  throw new Error('basedOn.name must be fingerPool');
}
if (listing.basedOn.url !== 'https://github.com/victorqribeiro/fingerPool') {
  throw new Error('basedOn.url must be victorqribeiro/fingerPool');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'victorqribeiro' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is victorqribeiro, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/finger-pool') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'Babylon', 'Havok', 'WebGL']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/Vec2.js', 'vendor/Sphere.js', 'game.js', 'mp.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/Vec2.js': read('vendor/Vec2.js'),
  'vendor/Sphere.js': read('vendor/Sphere.js'),
  'game.js': read('game.js'),
  'mp.js': read('mp.js'),
  'boot.js': read('boot.js'),
  'COPYING-fingerpool.txt': read('vendor/COPYING-fingerpool.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is too short (' + help.length + ')');
  files['help.md'] = help;
}

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
if (!files['mp.js'].includes('players') || !files['mp.js'].includes('Nobody writes')) {
  throw new Error('mp.js must score on own rows');
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
if (!files['COPYING-fingerpool.txt'].includes('Victor Ribeiro')) {
  throw new Error('COPYING-fingerpool.txt is not the upstream MIT notice');
}
if (!files['game.js'].includes('impulseOf') || !files['game.js'].includes('distance / dt * 12')) {
  throw new Error('game.js lost the flick formula');
}
if (!files['vendor/Sphere.js'].includes('collideSphere') || !files['vendor/Vec2.js'].includes('projectUonV')) {
  throw new Error('vendor bounce files are incomplete');
}

{
  const ctx = { window: {}, console, Math, Date, setTimeout: function () {}, devicePixelRatio: 1 };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInNewContext(
    files['vendor/Vec2.js'] + '\n' + files['vendor/Sphere.js'] + '\n' + files['game.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var G = FingerPool;\n' +
    '  if (G.impulseOf(80, 80) !== -12) throw new Error("impulse 80/80 is " + G.impulseOf(80, 80));\n' +
    '  if (G.impulseOf(0, 100) !== -7) throw new Error("min flick is " + G.impulseOf(0, 100));\n' +
    '  G.reset();\n' +
    '  if (spheres.length !== 16) throw new Error("rack is " + spheres.length);\n' +
    '  if (G.coloredLeft() !== 15) throw new Error("coloured is " + G.coloredLeft());\n' +
    '  var white = null, i;\n' +
    '  for (i = 0; i < spheres.length; i++) if (spheres[i].c === "hsl(360, 100%, 100%)") white = spheres[i];\n' +
    '  if (!white) throw new Error("no white");\n' +
    '  var x0 = white.pos.x;\n' +
    '  if (!G.flick(white.pos.x, white.pos.y, white.pos.x - 80, white.pos.y, 80)) throw new Error("flick refused");\n' +
    '  var guard = 0;\n' +
    '  while (!G.still() && guard++ < 4000) G.step();\n' +
    '  if (!G.still()) throw new Error("flick never settled");\n' +
    '  if (white.pos.x >= x0 - 1) throw new Error("white did not move left");\n' +
    '  var p = G.pack();\n' +
    '  if (!p.balls || p.balls.length !== spheres.length) throw new Error("pack lost balls");\n' +
    '  G.applyPack(p);\n' +
    '  if (spheres.length !== p.balls.length) throw new Error("applyPack lost balls");\n' +
    '  G.reset();\n' +
    '  white = null;\n' +
    '  for (i = 0; i < spheres.length; i++) if (spheres[i].c === "hsl(360, 100%, 100%)") white = spheres[i];\n' +
    '  var homeX = white.pos.x, homeY = white.pos.y;\n' +
    '  white.pos.set(r / 2, r / 2);\n' +
    '  white.vel.set(0, 0);\n' +
    '  G.step();\n' +
    '  if (white.isGone) throw new Error("white stayed gone");\n' +
    '  if (Math.abs(white.pos.x - homeX) > 1 || Math.abs(white.pos.y - homeY) > 1) throw new Error("white did not respawn");\n' +
    '  return G.coloredLeft();\n' +
    '})();',
    ctx
  );
  console.log('flick + rack checks ok — coloured left', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: fingerPoolIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'finger-pool', 'finger-pool.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/finger-pool/finger-pool.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
