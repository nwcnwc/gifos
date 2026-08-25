// Pack apps/q1k3/ into the finished, downloadable
// site/apps/q1k3/q1k3.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network (and gcc) is vendor.mjs, which rebuilds vendor/
// from the pinned upstream and is run only when the pin moves.
//
// Run:  node apps/q1k3/build.mjs
import { q1k3Icon, screenshotPng } from './icon.mjs';
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
  throw new Error('vendor/game.js is missing — run node apps/q1k3/vendor.mjs first (it needs the network and gcc).');
}
if (!existsSync(join(dir, 'vendor', 'assets.js'))) {
  throw new Error('vendor/assets.js is missing — run node apps/q1k3/vendor.mjs first.');
}

const SCRIPTS = ['vendor/assets.js', 'vendor/game.js', 'net.js', 'remote.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-q1k3.txt': read('vendor/COPYING-q1k3.txt'),
  'COPYING-sonant-x.txt': read('vendor/COPYING-sonant-x.txt'),
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
if (!html.includes('id="touch"')) throw new Error('index.html is missing the touch overlay');
if (!html.includes('id="c"')) throw new Error('index.html is missing canvas#c');
if (!html.includes('id="t-gun"')) throw new Error('index.html is missing the GUN button');
if (!html.includes('id="gate-keys-phone"')) throw new Error('index.html is missing phone gate keys');
if (!html.includes('id="gate-cont"')) throw new Error('index.html is missing Continue');
if (!/13 kB/i.test(listing.tagline)) {
  throw new Error('listing.tagline must lead with Quake in 13 kB');
}
if (!/^This is Q1K3 in a GIF/i.test(listing.description)) {
  throw new Error('listing.description must lead with in a GIF');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Q1K3') {
  throw new Error('listing.basedOn.name must be Q1K3');
}
if (listing.basedOn.url !== 'https://github.com/phoboslab/q1k3') {
  throw new Error('listing.basedOn.url must be https://github.com/phoboslab/q1k3');
}
if (listing.author && /gifos/i.test(listing.author.name || '')) {
  throw new Error('author is phoboslab, not GifOS');
}
if (!listing.author || listing.author.name !== 'phoboslab') {
  throw new Error('author.name must be phoboslab');
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
  throw new Error('Q1K3 has no network path. Do not declare capabilities.network.');
}
if (manifest.minBuild !== 1314) {
  throw new Error('minBuild must be 1314 — pointer lock is 1285 and fullscreen is 1314');
}
if (manifest.appId !== 'q1k3') throw new Error('appId must be q1k3');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|^\s*export\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — GifOS inlines classic scripts');
  }
}
for (const s of ['net.js', 'remote.js', 'touch.js', 'boot.js']) {
  const src = files[s];
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (src.includes(bad)) throw new Error(s + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/\bfetch\s*\(/.test(src)) throw new Error(s + ' uses fetch( — nothing leaves this tab.');
}
if (/\bfetch\s*\(/.test(files['vendor/game.js'])) {
  throw new Error('vendor/game.js still contains fetch( — rerun vendor.mjs');
}

const shotPath = join(dir, 'screenshot.png');
if (process.env.Q1K3_COVER === 'draw' || !existsSync(shotPath)) {
  const shot = screenshotPng();
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
  writeFileSync(shotPath, shot);
} else {
  const kept = readFileSync(shotPath);
  if (kept[0] !== 0x89 || kept[1] !== 0x50) throw new Error('screenshot.png is not a PNG');
}

const bytes = await gif.encode(files, { preview: q1k3Icon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'q1k3', 'q1k3.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/q1k3/q1k3.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('cover apps/q1k3/screenshot.png —', (readFileSync(shotPath).length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
