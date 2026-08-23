// Pack apps/longwave/ into site/apps/longwave/longwave.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. This is a
// rewrite of Longwave's playable spectrum — no React, no Firebase, no
// game server.
//
// Run:  node apps/longwave/build.mjs
import { longwaveIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['cards.js', 'rules.js', 'app.js'];

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing — OS Help packs this file');
const helpMd = read('help.md');
if (helpMd.replace(/^\uFEFF/, '').trim().length < 400) {
  throw new Error('help.md is too short (need >= 400 trimmed chars)');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'cards.js': read('cards.js'),
  'rules.js': read('rules.js'),
  'app.js': read('app.js'),
  'help.md': helpMd,
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of the MIT work.
  'COPYING.txt': read('COPYING.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module — the runtime drops it.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) {
  throw new Error('longwave has no network path. Firebase/React stay behind.');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — the game is plain JavaScript');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
}
if (!Number.isInteger(manifest.minBuild)) throw new Error('minBuild must be an integer');
if (!html.includes('Play a friend')) throw new Error('index.html is missing Play a friend');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}

const packed = files['app.js'] + files['rules.js'] + html + JSON.stringify(listing);
if (/wavelength/i.test(packed) || /wavelength/i.test(files['index.html'])) {
  throw new Error('do not brand as Wavelength — this listing is Longwave');
}
if (/firebase|googleapis|rc-slider|i18next/i.test(packed)) {
  throw new Error('Firebase/React stack must not ship — the room was ripped out');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish moves on the player\'s own row');
}
if (!files['app.js'].includes('putBoard') || !files['app.js'].includes('isHost')) {
  throw new Error('host applies legal moves to the board row; nobody else writes it');
}
if (!files['app.js'].includes('psychic') || !files['app.js'].includes('guesser')) {
  throw new Error('app.js must seat a psychic and a guesser');
}
if (!files['rules.js'].includes('coopPoints')) {
  throw new Error('rules.js must include cooperative scoring');
}

const sandbox = { console, window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(files['cards.js'], sandbox);
vm.runInContext(files['rules.js'], sandbox);
const cards = sandbox.LW_CARDS;
const R = sandbox.LW;
if (!Array.isArray(cards) || cards.length < 240) {
  throw new Error('cards.js must ship the original deck (basic + advanced)');
}
if (R.score(10, 10) !== 4 || R.score(10, 11) !== 3 || R.score(10, 12) !== 2 || R.score(10, 13) !== 0) {
  throw new Error('GetScore parity failed — 4/3/2/0 by distance on a 0..20 line');
}
if (R.coopPoints(4) !== 3 || R.coopPoints(3) !== 3 || R.coopBonus(4) !== true) {
  throw new Error('cooperative bullseye is 3 points and keeps the card');
}
if (R.cardAt('abcd', 0).length !== 2) throw new Error('cardAt must return a pair');

if (listing.author?.name !== 'cynicaloptimist') throw new Error('author is cynicaloptimist');
if (listing.porter?.name !== 'GifOS') throw new Error('porter is GifOS');
if (!listing.basedOn || listing.basedOn.name !== 'Longwave' || listing.basedOn.blessed !== false) {
  throw new Error('basedOn Longwave, blessed false');
}
if (listing.license !== 'MIT') throw new Error('license must be MIT');
if (!listing.categories.includes('Games')) throw new Error('category Games');
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate 2026-08-23');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: longwaveIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'longwave', 'longwave.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/longwave/longwave.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no Firebase, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
