// Pack apps/particle-life/ into the finished, downloadable
// site/apps/particle-life/particle-life.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/COPYING from
// the pinned particle-life commit and is run only when the pin moves.
//
// Run:  node apps/particle-life/build.mjs
import { particleLifeIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'particle-life.js'))) {
  throw new Error('vendor/particle-life.js is missing');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-particle-life.txt'))) {
  throw new Error('vendor/COPYING-particle-life.txt is missing — run node apps/particle-life/vendor.mjs first (it needs the network).');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'requestAnimationFrame', 'lil-gui', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/particle-life.js', 'app.js', 'mp.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/particle-life.js': read('vendor/particle-life.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of hunar4321's MIT
  // work, and has to carry the notice with it.
  'COPYING-particle-life.txt': read('vendor/COPYING-particle-life.txt'),
};

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (manifest.name !== 'Particle Life') throw new Error('manifest.name must be Particle Life');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — the last mix lives in gifos.db.');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer — Share the jar is a room.');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the last mix does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — pokes have to sync.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('particle-life has no network path');
if (listing.basedOn?.name !== 'Particle Life') {
  throw new Error('listing.basedOn.name must be Particle Life');
}
if (listing.author?.name !== 'hunar4321') {
  throw new Error('listing.author.name must be hunar4321 — they are the author, GifOS is the porter');
}
if (listing.porter?.name !== 'GifOS') {
  throw new Error('listing.porter.name must be GifOS');
}
if (listing.basedOn?.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

// The extracted engine must boot, take a seed, and accept a poke — packing a
// GIF that cannot stir is the 0.8.4 class of bug.
{
  const fakeCtx = {
    fillRect() {}, fillStyle: '', strokeStyle: '', lineWidth: 0,
    beginPath() {}, arc() {}, closePath() {}, fill() {}, stroke() {}
  };
  const fakeCanvas = { width: 800, height: 800, getContext() { return fakeCtx; } };
  const sandbox = {
    window: null,
    globalThis: null,
    requestAnimationFrame(fn) { return 0; },
    cancelAnimationFrame() {},
    Math, isFinite, Date, parseInt, parseFloat, NaN, Infinity, undefined,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(files['vendor/particle-life.js'], sandbox);
  const PL = sandbox.ParticleLife;
  if (!PL || typeof PL.mount !== 'function' || typeof PL.poke !== 'function') {
    throw new Error('vendor/particle-life.js did not attach ParticleLife.mount/poke');
  }
  PL.mount(fakeCanvas);
  PL.setSeed(91651088029);
  const snap = PL.snapshot();
  if (snap.atomN !== 180 * 4) {
    throw new Error('default jar should be 180 atoms × 4 colours, got ' + snap.atomN);
  }
  if (typeof PL.step !== 'function' || typeof PL.getAtoms !== 'function') {
    throw new Error('vendor/particle-life.js must export step/getAtoms for the cover');
  }
  PL.poke(480, 320, 1);
  PL.poke(100, 100, -1);
  PL.step(4);
  if (PL.getAtoms().length !== 180 * 4) {
    throw new Error('step should keep the jar populated');
  }
  PL.setNumColors(3);
  if (PL.snapshot().atomN !== 180 * 3) {
    throw new Error('setNumColors(3) should rebuild 180×3 atoms');
  }
}

// Cover is a real jar: pour the default mix, let it cluster, paint that frame.
{
  const fakeCtx = {
    fillRect() {}, fillStyle: '', strokeStyle: '', lineWidth: 0,
    beginPath() {}, arc() {}, closePath() {}, fill() {}, stroke() {}
  };
  const fakeCanvas = { width: 800, height: 800, getContext() { return fakeCtx; } };
  const sandbox = {
    window: null,
    globalThis: null,
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    Math, isFinite, Date, parseInt, parseFloat, NaN, Infinity, undefined,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(files['vendor/particle-life.js'], sandbox);
  const PL = sandbox.ParticleLife;
  PL.mount(fakeCanvas);
  PL.settings.atoms.count = 280;
  PL.setNumColors(5);
  PL.setSeed(91651088029);
  PL.step(420);
  const atoms = PL.getAtoms().map(function (a) { return a.slice(); });
  const shot = screenshotPng({ atoms: atoms, colors: PL.settings.colors.slice() });
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
  writeFileSync(join(dir, 'screenshot.png'), shot);
}

const bytes = await gif.encode(files, { preview: particleLifeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'particle-life', 'particle-life.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/particle-life/particle-life.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (extracted particle-life + shared jar, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
