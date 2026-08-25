// Pack apps/backdooms/ into site/apps/backdooms/backdooms.gif
import { backdoomsIcon } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const SCRIPTS = ['art.js', 'render.js', 'game.js', 'net.js', 'touch.js', 'boot.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-backdooms.txt'))) {
  throw new Error('vendor/COPYING-backdooms.txt is missing');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-backdooms.txt': read('vendor/COPYING-backdooms.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);
{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is missing or shorter than 400 chars');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'Backdooms') throw new Error('basedOn.name must be Backdooms');
if (listing.basedOn.url !== 'https://github.com/Kuberwastaken/backdooms') {
  throw new Error('basedOn.url must be Kuberwastaken/backdooms');
}
if (!listing.author || listing.author.name !== 'Kuberwastaken' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Kuberwastaken, never GifOS');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (listing.license !== 'MIT') throw new Error('license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') throw new Error('categories must include Games');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate must be 2026-08-24');
if (!/DOOM/i.test(listing.tagline) || !/GIF/i.test(listing.tagline)) {
  throw new Error('listing.tagline must lead with DOOM in a GIF');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('db required');
if (!manifest.capabilities.multiplayer) throw new Error('multiplayer required');
if (!manifest.capabilities.pointer) throw new Error('pointer required');
if (!manifest.capabilities.fullscreen) throw new Error('fullscreen required');
if (manifest.capabilities.network) throw new Error('no network path');
if (manifest.minBuild !== 1314) throw new Error('minBuild must be 1314 — pointer lock is 1285 and fullscreen is 1314');
if (manifest.appId !== 'backdooms') throw new Error('appId must be backdooms');
if (!files['COPYING-backdooms.txt'].includes('Kuber Mehta')) {
  throw new Error('COPYING-backdooms.txt is not the upstream MIT notice');
}
if (!Object.values(files).some((f) => /Press Invite/.test(f))) {
  throw new Error('tell the player to press Invite');
}
// The renderer is the whole point of the 1.2 ascent: never ship the flat-fill
// build again. These are the four things that made a corridor read.
{
  const r = files['render.js'];
  if (!/perpWallDist|perp =/.test(r)) throw new Error('render.js must raycast with a perpendicular distance (DDA)');
  if (!/side === 1 \? 0\./.test(r)) throw new Error('render.js must shade N/S walls differently from E/W');
  if (!/rowDist/.test(r)) throw new Error('render.js must cast the floor and ceiling in perspective');
  if (!/function fog/.test(r)) throw new Error('render.js must diminish light with distance');
  if (!/createImageData/.test(r)) throw new Error('render.js must write pixels, not fillRect columns');
  const a = files['art.js'];
  for (const t of ['makeWall', 'makeCarpet', 'makeCeiling', 'gunBody', 'figure']) {
    if (!a.includes(t)) throw new Error('art.js must generate ' + t);
  }
}
if (!files['boot.js'].includes("db('prefs')")) throw new Error('boot.js must save prefs');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|^\s*export\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
  if (/\bfetch\s*\(/.test(s)) throw new Error(n + ' uses fetch(');
}

// The cover is a REAL captured frame of the running game, committed — not a
// drawing of it generated here. A hand-drawn cover cannot be better than
// whoever drew it, and it drifts from the app without anything noticing.
// This only checks it is present and the right shape.
{
  const shotPath = join(dir, 'screenshot.png');
  if (!existsSync(shotPath)) throw new Error('screenshot.png is missing — capture a real frame of the game');
  const shot = readFileSync(shotPath);
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot.png is not a PNG');
  const w = shot.readUInt32BE(16), h = shot.readUInt32BE(20);
  if (w !== 1200 || h !== 720) throw new Error('screenshot.png must be 1200x720, got ' + w + 'x' + h);
  if (shot.length < 40000) {
    throw new Error('screenshot.png is ' + shot.length + ' bytes — that is a flat drawing, not a frame of the game');
  }
}

const bytes = await gif.encode(files, { preview: backdoomsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'backdooms', 'backdooms.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/backdooms/backdooms.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
