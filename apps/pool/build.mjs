// Pack apps/pool/ into the finished, downloadable
// site/apps/pool/pool.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned Classic-Pool-Game commit and is run only when the pin moves.
//
// Run:  node apps/pool/build.mjs
import { poolIcon, screenshotPng } from './icon.mjs';
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
  'vendor/Keys.js', 'vendor/Color.js', 'vendor/Vector2.js', 'vendor/ButtonState.js',
  'vendor/Keyboard.js', 'vendor/Mouse.js', 'vendor/Global.js', 'vendor/Canvas2D.js',
  'vendor/Score.js', 'vendor/Ball.js', 'vendor/Stick.js', 'vendor/Player.js',
  'vendor/Opponent.js', 'vendor/AIPolicy.js', 'vendor/AITrainer.js',
  'vendor/GamePolicy.js', 'vendor/GameWorld.js', 'vendor/Game.js',
  'menu-stub.js', 'vendor/COPYING-classic-pool-game.txt',
  'vendor/sprites/spr_background4.jpg',
  'vendor/sprites/spr_ball2.png', 'vendor/sprites/spr_redBall2.png',
  'vendor/sprites/spr_yellowBall2.png', 'vendor/sprites/spr_blackBall2.png',
  'vendor/sprites/spr_stick.png',
];
for (const need of NEED) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/pool/vendor.mjs first (it needs the network).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('pool has no network path');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}
if (listing.author && listing.author.name === 'GifOS') {
  throw new Error('author is henshmi, never GifOS — this is a port');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'Classic Pool Game') {
  throw new Error('basedOn.name must be Classic Pool Game');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'globals.js',
  'vendor/Keys.js', 'vendor/Color.js', 'vendor/Vector2.js', 'vendor/ButtonState.js',
  'vendor/Keyboard.js', 'vendor/Mouse.js', 'vendor/Global.js', 'vendor/Canvas2D.js',
  'vendor/Score.js', 'vendor/Ball.js', 'vendor/Stick.js', 'vendor/Player.js',
  'vendor/Opponent.js', 'vendor/AIPolicy.js', 'vendor/AITrainer.js',
  'vendor/GamePolicy.js', 'vendor/GameWorld.js', 'menu-stub.js', 'vendor/Game.js',
  'boot.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'globals.js': read('globals.js'),
  'menu-stub.js': read('menu-stub.js'),
  'boot.js': read('boot.js'),
  'COPYING-classic-pool-game.txt': read('vendor/COPYING-classic-pool-game.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'assets/sprites/spr_background4.jpg': bin('vendor/sprites/spr_background4.jpg'),
  'assets/sprites/spr_ball2.png': bin('vendor/sprites/spr_ball2.png'),
  'assets/sprites/spr_redBall2.png': bin('vendor/sprites/spr_redBall2.png'),
  'assets/sprites/spr_yellowBall2.png': bin('vendor/sprites/spr_yellowBall2.png'),
  'assets/sprites/spr_blackBall2.png': bin('vendor/sprites/spr_blackBall2.png'),
  'assets/sprites/spr_stick.png': bin('vendor/sprites/spr_stick.png'),
};
for (const s of SCRIPTS) {
  if (s === 'globals.js' || s === 'boot.js' || s === 'menu-stub.js') continue;
  files[s] = read(s);
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
for (const src of [
  'assets/sprites/spr_background4.jpg', 'assets/sprites/spr_ball2.png',
  'assets/sprites/spr_redBall2.png', 'assets/sprites/spr_yellowBall2.png',
  'assets/sprites/spr_blackBall2.png', 'assets/sprites/spr_stick.png',
]) {
  if (!html.includes('src="' + src + '"')) throw new Error('index.html does not reference ' + src);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
}
const src = files['boot.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('boot.js uses ' + bad);
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: poolIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pool', 'pool.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pool/pool.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
