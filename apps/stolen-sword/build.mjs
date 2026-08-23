// Pack apps/stolen-sword/ into the finished, downloadable
// site/apps/stolen-sword/stolen-sword.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the
// pinned upstream and is run only when the pin moves.
//
// Run:  node apps/stolen-sword/build.mjs
import { stolenSwordIcon, screenshotPng } from './icon.mjs';
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
  throw new Error('vendor/game.js is missing — run node apps/stolen-sword/vendor.mjs first (it needs the network).');
}

const SCRIPTS = ['boot.js', 'vendor/game.js', 'mp.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-stolen-sword.txt': read('vendor/COPYING-stolen-sword.txt'),
  'NOTICE': read('NOTICE'),
};
for (const s of SCRIPTS) files[s] = read(s);

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md trimmed length must be >= 400, got ' + help.length);
}
files['help.md'] = read('help.md');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('<canvas')) throw new Error('index.html is missing a canvas');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Stolen Sword') {
  throw new Error('listing.basedOn.name must be Stolen Sword');
}
if (listing.basedOn.url !== 'https://github.com/chiaogu/stolen-sword') {
  throw new Error('listing.basedOn.url must be https://github.com/chiaogu/stolen-sword');
}
if (listing.author && /gifos/i.test(listing.author.name || '')) {
  throw new Error('author is chiaogu, not GifOS');
}
if (!listing.author || listing.author.name !== 'chiaogu') {
  throw new Error('author.name must be chiaogu');
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
if (manifest.capabilities.network) {
  throw new Error('Stolen Sword has no network path. Do not declare capabilities.network.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.appId !== 'stolen-sword') throw new Error('appId must be stolen-sword');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/game.js') {
    if (/^\s*import\s|^\s*export\s/m.test(s)) {
      throw new Error(n + ' uses ESM syntax — GifOS inlines classic scripts');
    }
  }
}
if (/^\s*import\s|export default|export const |export function /m.test(files['vendor/game.js'].replace(/^\/\*[\s\S]*?\*\//, ''))) {
  // comments in the generated bundle may mention export; the IIFE must not
  // start a statement with it.
  const body = files['vendor/game.js'];
  if (/^\s*import\s/m.test(body) || /^\s*export\s/m.test(body)) {
    throw new Error('vendor/game.js still has ESM — rerun vendor.mjs');
  }
}
for (const s of ['boot.js', 'mp.js']) {
  const src = files[s];
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (src.includes(bad)) throw new Error(s + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/\bfetch\s*\(/.test(src)) throw new Error(s + ' uses fetch( — nothing leaves this tab.');
}
if (!files['mp.js'].includes("db('players')")) throw new Error('mp.js must use gifos.db players');
if (!files['boot.js'].includes("db('prefs')")) throw new Error('boot.js must use gifos.db prefs');
if (/invite/i.test(files['mp.js']) && /button/i.test(files['mp.js'])) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (/invite/i.test(files['boot.js']) && /button/i.test(files['boot.js'])) {
  throw new Error('invite is OS chrome — do not add an invite button');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: stolenSwordIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'stolen-sword', 'stolen-sword.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/stolen-sword/stolen-sword.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/stolen-sword/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
