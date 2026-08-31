// Pack apps/chrome-dino/ into site/apps/chrome-dino/chrome-dino.gif
// Run:  node apps/chrome-dino/build.mjs
import { chromeDinoIcon, screenshotPng } from './icon.mjs';
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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/game.js', 'vendor/sprites-1x.png', 'vendor/sprites-2x.png',
  'vendor/sound-press.ogg', 'vendor/sound-hit.ogg', 'vendor/sound-reached.ogg',
  'vendor/COPYING-chromium.txt', 'vendor/COPYING-t-rex-runner.txt',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/chrome-dino/vendor.mjs first.');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}
if (manifest.capabilities.network) throw new Error('chrome-dino has no network path');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false');
}
if ((listing.author && listing.author.name) === 'GifOS') {
  throw new Error('author is THEM, not GifOS');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/game.js', 'net.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/game.js': read('vendor/game.js'),
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'vendor/sprites-1x.png': readBin('vendor/sprites-1x.png'),
  'vendor/sprites-2x.png': readBin('vendor/sprites-2x.png'),
  'vendor/sound-press.ogg': readBin('vendor/sound-press.ogg'),
  'vendor/sound-hit.ogg': readBin('vendor/sound-hit.ogg'),
  'vendor/sound-reached.ogg': readBin('vendor/sound-reached.ogg'),
  'COPYING-chromium.txt': read('vendor/COPYING-chromium.txt'),
  'COPYING-t-rex-runner.txt': read('vendor/COPYING-t-rex-runner.txt'),
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
if (!html.includes('vendor/sprites-1x.png') || !html.includes('vendor/sprites-2x.png')) {
  throw new Error('index.html must reference both sprite sheets');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon']) {
  if (files['net.js'].includes(bad) || files['boot.js'].includes(bad) || files['touch.js'].includes(bad)) {
    throw new Error('shell uses ' + bad);
  }
}
if (!files['net.js'].includes("db('players')") || !files['boot.js'].includes("db('prefs')")) {
  throw new Error('must use gifos.db prefs + players');
}
if (/invite/i.test(files['net.js']) && /button/i.test(files['net.js'])) {
  throw new Error('invite is OS chrome — do not add an invite button');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: chromeDinoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'chrome-dino', 'chrome-dino.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/chrome-dino/chrome-dino.gif —', bytes.length, 'bytes,',
            (bytes.length / 1024).toFixed(0), 'KB, from', Object.keys(files).length, 'files');
console.log('wrote apps/chrome-dino/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
