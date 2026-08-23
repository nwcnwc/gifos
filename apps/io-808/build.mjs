// Pack apps/io-808/ into the finished, downloadable
// site/apps/io-808/io-808.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The original
// React/Redux tree is not shipped — synth graphs are transcribed into classic
// scripts (vendor/UPSTREAM.txt).
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/io-808/build.mjs
import { io808Icon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'COPYING-io-808.txt'))) {
  throw new Error('vendor/COPYING-io-808.txt is missing — the MIT notice must ride inside the GIF');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('io-808 has no network path. Do not declare capabilities.network.');
if (!manifest.data || !manifest.data.patterns || manifest.data.patterns.visibility !== 'private') {
  throw new Error('manifest.data.patterns must be private — patterns stay on this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — a shared pattern has to sync.');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'io-808' || listing.basedOn.url !== 'https://github.com/vincentriemer/io-808') {
  throw new Error('listing.basedOn must name io-808 at github.com/vincentriemer/io-808');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'vincentriemer') {
  throw new Error('listing.author must be vincentriemer');
}
if (listing.author.name === 'GifOS') {
  throw new Error('author is vincentriemer, never GifOS — this is a port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || (listing.categories[0] !== 'Creativity' && listing.categories[0] !== 'Media')) {
  throw new Error('category must be Creativity or Media');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate must be 2026-08-23');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'WebGL', 'Web Audio', 'React', 'Redux', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['synth.js', 'app.js', 'mp.js'];

const help = read('help.md').replace(/^\uFEFF/, '');
if (help.trim().length < 400) throw new Error('help.md is missing or too short — need >= 400 trimmed characters');
if (!/^#\s+\S/.test(help.trim())) throw new Error('help.md must start with # <App Name>');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'synth.js': read('synth.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-io-808.txt': read('vendor/COPYING-io-808.txt'),
  'help.md': help,
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
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (!html.includes('Share a pattern')) throw new Error('tell the player to share a pattern');
if (!html.includes('Invite')) throw new Error('tell the player to press Invite');

const src = files['synth.js'] + files['app.js'] + files['mp.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('a script uses ' + bad);
}
if (!files['app.js'].includes("db('patterns')")) {
  throw new Error('app must persist patterns privately in gifos.db(\'patterns\')');
}
if (!files['mp.js'].includes("db('room')")) {
  throw new Error('mp.js must share a pattern on gifos.db(\'room\')');
}
if (!files['mp.js'].includes('Invite') || files['mp.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share sheet');
}
if (!files['synth.js'].includes('bassDrum') && !files['synth.js'].includes('BASS_DRUM')) {
  throw new Error('synth.js must carry the 808 bass drum');
}
if (!files['COPYING-io-808.txt'].includes('Vincent Riemer')) {
  throw new Error('COPYING-io-808.txt is not the upstream MIT notice');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}

const sandbox = { window: {}, console, setTimeout, clearTimeout, Math };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(files['synth.js'], sandbox);
const IO = sandbox.IO808 || sandbox.window.IO808;
if (!IO || typeof IO.stepKey !== 'function' || typeof IO.equalPower !== 'function') {
  throw new Error('synth.js did not attach IO808.stepKey');
}
if (IO.stepKey(0, 1, 'FIRST_PART', 'A_VARIATION', 0) !== 'PATTERN_0-INSTRUMENT_1-FIRST_PART-A_VARIATION-STEP_0') {
  throw new Error('stepKey drifted from upstream');
}
if (IO.equalPower(0) !== 0 || IO.equalPower(100) !== 1) {
  throw new Error('equalPower(0) must be 0 and equalPower(100) must be 1');
}
if (typeof IO.stepTrigger !== 'function' || typeof IO.Clock !== 'function') {
  throw new Error('synth.js must expose stepTrigger and Clock');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: io808Icon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'io-808', 'io-808.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/io-808/io-808.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (classic IIFE, no network)');
console.log('wrote apps/io-808/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
