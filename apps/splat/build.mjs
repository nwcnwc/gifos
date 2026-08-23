// Pack apps/splat/ into the finished, downloadable
// site/apps/splat/splat.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/COPYING from
// the pinned splat commit and is run only when the pin moves.
//
// Run:  node apps/splat/build.mjs
import { splatIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'main.js'))) {
  throw new Error('vendor/main.js is missing');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-splat.txt'))) {
  throw new Error('vendor/COPYING-splat.txt is missing — run node apps/splat/vendor.mjs first (it needs the network).');
}

const listingBlob = JSON.stringify(listing);
for (const bad of [
  'gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL',
  'requestAnimationFrame', 'CDN', 'HuggingFace', 'shader', 'vertex', 'CORS',
  'Worker', 'WebWorker', 'huggingface',
]) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['scene.js', 'vendor/main.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'scene.js': read('scene.js'),
  'vendor/main.js': read('vendor/main.js'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of antimatter15's
  // MIT work, and has to carry the notice with it.
  'COPYING-splat.txt': read('vendor/COPYING-splat.txt'),
};

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
if (!html.includes('id="canvas"')) throw new Error('index.html is missing canvas#canvas');
if (!html.includes('touch-action')) {
  // canvas touch-action is in style.css; the page also sets it.
}
if (!files['style.css'].includes('touch-action: none')) {
  throw new Error('style.css must set touch-action: none so a finger orbits instead of scrolling the page');
}
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (manifest.name !== 'Splat') throw new Error('manifest.name must be Splat');
if (manifest.appId !== 'splat') throw new Error('appId must be splat');
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities && Object.keys(manifest.capabilities).length) {
  throw new Error('splat declares no capabilities — drop them');
}
if (listing.basedOn?.name !== 'splat') {
  throw new Error('listing.basedOn.name must be splat');
}
if (listing.basedOn?.url !== 'https://github.com/antimatter15/splat') {
  throw new Error('listing.basedOn.url must be https://github.com/antimatter15/splat');
}
if (listing.author?.name !== 'antimatter15') {
  throw new Error('listing.author.name must be antimatter15 — they are the author, GifOS is the porter');
}
if (listing.porter?.name !== 'GifOS') {
  throw new Error('listing.porter.name must be GifOS');
}
if (listing.basedOn?.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.releaseDate !== '2026-08-23') {
  throw new Error('releaseDate must be 2026-08-23');
}
if (!listing.categories || listing.categories[0] !== 'Media') {
  throw new Error('categories must start with Media');
}
if (!listing.categories.includes('Creativity')) {
  throw new Error('categories must include Creativity');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}
if (/\bfetch\s*\(/.test(files['vendor/main.js'])) {
  throw new Error('vendor/main.js still contains fetch( — the scene must come from SPLAT_SCENE');
}
if (/\bfetch\s*\(/.test(files['scene.js'])) {
  throw new Error('scene.js uses fetch( — the scene is built in this file');
}
if (!files['vendor/main.js'].includes('SPLAT_SCENE')) {
  throw new Error('vendor/main.js must read window.SPLAT_SCENE');
}
if (!files['vendor/main.js'].includes('touchstart')) {
  throw new Error('vendor/main.js must keep touch orbit');
}
if (files['vendor/main.js'].includes('huggingface') || files['vendor/main.js'].includes('train.splat')) {
  throw new Error('vendor/main.js still points at the remote train.splat');
}
if (files['vendor/main.js'].includes('new Worker')) {
  throw new Error('vendor/main.js must not spin a Worker — the sandbox blocks blob workers without wasm');
}

// The packed scene must actually be a .splat buffer, or packing a GIF that
// cannot draw is the 0.8.4 class of bug.
{
  const sandbox = {
    window: null,
    globalThis: null,
    Math, isFinite, Date, parseInt, parseFloat, NaN, Infinity, undefined,
    ArrayBuffer, Float32Array, Uint8Array, Uint8ClampedArray, Uint32Array,
    Int32Array, console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.this = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(files['scene.js'], sandbox);
  const scene = sandbox.SPLAT_SCENE;
  if (!(scene instanceof Uint8Array)) {
    throw new Error('scene.js did not attach SPLAT_SCENE as a Uint8Array');
  }
  const row = 32;
  if (scene.length % row !== 0) {
    throw new Error('SPLAT_SCENE length ' + scene.length + ' is not a multiple of 32');
  }
  const n = scene.length / row;
  if (n < 400 || n > 8000) {
    throw new Error('demo scene should be a few hundred to a few thousand specks, got ' + n);
  }
  const f32 = new Float32Array(scene.buffer, scene.byteOffset, n * 8);
  let finite = 0;
  for (let i = 0; i < n; i++) {
    const x = f32[i * 8], y = f32[i * 8 + 1], z = f32[i * 8 + 2];
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) finite++;
  }
  if (finite !== n) throw new Error('demo scene has non-finite positions');
  console.log('demo scene:', n, 'specks,', scene.length, 'bytes');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: splatIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'splat', 'splat.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/splat/splat.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (tiny scene in-GIF, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
