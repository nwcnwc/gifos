// Pack apps/star-battle/ into the finished, downloadable
// site/apps/star-battle/star-battle.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which copies vendor/ from the pinned
// upstream and is run only when the pin moves.
//
// Run:  node apps/star-battle/build.mjs
import { starBattleIcon, screenshotPng } from './icon.mjs';
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

const VENDOR = [
  'vendor/assets.js',
  'vendor/css/common.css',
  'vendor/css/style.css',
  'vendor/js/config/config.js',
  'vendor/js/utils/utils.js',
  'vendor/js/utils/res.js',
  'vendor/js/class/scene.js',
  'vendor/js/class/cooldown.js',
  'vendor/js/class/element.js',
  'vendor/js/class/animation.js',
  'vendor/js/class/plane.js',
  'vendor/js/class/bullet.js',
  'vendor/js/class/player.js',
  'vendor/js/class/enemy.js',
  'vendor/js/class/meteorite.js',
  'vendor/js/class/friend.js',
  'vendor/js/class/star.js',
  'vendor/js/class/fuel.js',
  'vendor/js/scenes/start.js',
  'vendor/js/scenes/play.js',
  'vendor/js/scenes/over.js',
  'vendor/js/scenes/rank.js',
  'vendor/js/game.js',
];
const OURS = ['boot.js', 'net.js', 'touch.js', 'wrap.js'];

for (const f of VENDOR) {
  if (!existsSync(join(dir, f))) {
    throw new Error(f + ' is missing — run node apps/star-battle/vendor.mjs first (it needs the network).');
  }
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of that MIT work.
  'COPYING-star-battle.txt': read('vendor/COPYING-star-battle.txt'),
};
for (const s of OURS) files[s] = read(s);
for (const s of VENDOR) files[s] = read(s);

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md trimmed length must be >= 400, got ' + help.length);
}
files['help.md'] = read('help.md');

const html = files['index.html'];
for (const s of [...OURS, ...VENDOR]) {
  if (!html.includes('src="' + s + '"') && !html.includes('href="' + s + '"')) {
    throw new Error('index.html does not load ' + s);
  }
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="touch"')) throw new Error('index.html is missing the touch overlay');
if (!html.includes('id="gate"')) throw new Error('index.html is missing the portrait start gate');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (html.includes('vendor/js/main.js')) {
  throw new Error('do not load vendor/js/main.js — boot.js starts the Game');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Star Battle') {
  throw new Error('listing.basedOn.name must be Star Battle');
}
if (listing.author && /gifos/i.test(listing.author.name || '')) {
  throw new Error('author is gd4Ark, not GifOS');
}
if (!listing.author || listing.author.name !== 'gd4Ark') {
  throw new Error('author.name must be gd4Ark');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('porter.name must be GifOS');
}
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') {
  throw new Error('releaseDate must be 2026-08-23');
}
if (listing.license !== 'MIT') throw new Error('license must be MIT');
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
  throw new Error('Star Battle has no network path. Do not declare capabilities.network.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.appId !== 'star-battle') throw new Error('appId must be star-battle');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}
if (!manifest.data.world || manifest.data.world.visibility !== 'read-only') {
  throw new Error('world must be read-only');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}
for (const s of OURS) {
  const src = files[s];
  if (/^\s*import\s|^\s*export\s/m.test(src)) {
    throw new Error(s + ' uses ESM syntax — GifOS inlines classic scripts');
  }
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (src.includes(bad)) throw new Error(s + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/\bfetch\s*\(/.test(src)) throw new Error(s + ' uses fetch( — nothing leaves this tab.');
}
if (/invite/i.test(files['boot.js'] + files['net.js'] + files['wrap.js'] + files['touch.js']) &&
    /button/i.test(files['boot.js'] + files['wrap.js'])) {
  /* comment mentioning invite is fine; a share button is not */
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: starBattleIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'star-battle', 'star-battle.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/star-battle/star-battle.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/star-battle/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
