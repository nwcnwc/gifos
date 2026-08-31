// Pack apps/hydra/ into the finished, downloadable
// site/apps/hydra/hydra.gif (see apps/README.md).
import { hydraIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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

const GLSL_SHA = 'aa0bc41fec48673c3c134e50c5a6cd5a0ece35d08f0f14a61afff1a573eb06da';
function pin(rel, want) {
  const buf = readFileSync(join(dir, rel));
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== want) throw new Error(rel + ' sha256 ' + hex + ' ≠ pin ' + want);
  return buf;
}

for (const need of [
  'vendor/glsl-functions.js', 'vendor/utility-functions.js', 'vendor/hydra-engine.js',
  'vendor/COPYING-hydra-synth.txt', 'vendor/UPSTREAM.txt', 'COPYING.txt',
  'sketch.js', 'snippets.js', 'app.js', 'mp.js'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'CDN', 'regl', 'eval']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'vendor/glsl-functions.js', 'vendor/utility-functions.js', 'vendor/hydra-engine.js',
  'sketch.js', 'snippets.js', 'app.js', 'mp.js'
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/glsl-functions.js': pin('vendor/glsl-functions.js', GLSL_SHA).toString('utf8'),
  'vendor/utility-functions.js': read('vendor/utility-functions.js'),
  'vendor/hydra-engine.js': read('vendor/hydra-engine.js'),
  'sketch.js': read('sketch.js'),
  'snippets.js': read('snippets.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING.txt': read('COPYING.txt'),
};

{
  const helpPath = join(dir, 'help.md');
  if (!existsSync(helpPath)) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md trimmed length must be >= 400');
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
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (!html.includes('id="recipe"') || !html.includes('id="chips"') || !html.includes('id="view"')) {
  throw new Error('index.html must have canvas, chips, and recipe box');
}
if (manifest.name !== 'Hydra') throw new Error('manifest.name must be Hydra');
if (manifest.appId !== 'hydra') throw new Error('appId must be hydra');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('hydra has no network path');
if (listing.basedOn?.name !== 'Hydra') throw new Error('listing.basedOn.name must be Hydra');
if (listing.basedOn?.url !== 'https://github.com/hydra-synth/hydra') {
  throw new Error('listing.basedOn.url must be https://github.com/hydra-synth/hydra');
}
if (listing.author?.name !== 'Olivia Jack') {
  throw new Error('listing.author.name must be Olivia Jack');
}
if (listing.porter?.name !== 'GifOS') throw new Error('listing.porter.name must be GifOS');
if (listing.basedOn?.blessed !== false) throw new Error('listing.basedOn.blessed must be false');
if (listing.license !== 'AGPL-3.0') throw new Error('listing.license must be AGPL-3.0');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('category must be Creativity');
}
if (listing.releaseDate !== '2026-08-30') throw new Error('releaseDate must be 2026-08-30');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/hydra') {
  throw new Error('homepage must be the gifos tree');
}
if (!files['COPYING.txt'].includes('GNU AFFERO GENERAL PUBLIC LICENSE')) {
  throw new Error('COPYING.txt is not the AGPL notice');
}
if (!files['snippets.js'].includes('HydraSnippets') || (files['snippets.js'].match(/\bid:\s*'/g) || []).length < 6) {
  throw new Error('snippets.js must ship a handful of hydra patches');
}
if (!files['mp.js'].includes("db('room')") || !files['app.js'].includes("db('save')")) {
  throw new Error('app must use gifos.db save + room');
}
if (!files['sketch.js'].includes('HydraSketch') || files['sketch.js'].includes('eval(') || files['sketch.js'].includes('new Function(')) {
  throw new Error('sketch.js must interpret without eval/Function');
}
if (!files['vendor/hydra-engine.js'].includes('HydraSynth')) {
  throw new Error('hydra-engine.js must export HydraSynth');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  if (n.startsWith('vendor/glsl') || n === 'vendor/utility-functions.js') continue;
  if (n === 'vendor/hydra-engine.js') {
    for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
      if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
    }
    continue;
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

const sandbox = { window: {}, Math, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(files['sketch.js'], sandbox, { timeout: 1000 });
vm.runInContext(files['snippets.js'], sandbox, { timeout: 1000 });
const mock = {
  time: 0, bpm: 30, speed: 1, width: 1280, height: 720,
  mouse: { x: 0, y: 0 }, Math,
  osc: function () { return chain(); },
  noise: function () { return chain(); },
  voronoi: function () { return chain(); },
  shape: function () { return chain(); },
  gradient: function () { return chain(); },
  solid: function () { return chain(); },
  src: function () { return chain(); },
  o0: { getTexture: function () { return {}; } }
};
function chain() {
  const o = {};
  'color kaleid modulate rotate repeat scale out blend mult add diff colorama scroll pixelate hue saturate invert contrast brightness'.split(' ').forEach(function (m) {
    o[m] = function () { return o; };
  });
  return o;
}
const snips = sandbox.window.HydraSnippets || sandbox.HydraSnippets;
if (!snips || snips.length < 6) throw new Error('snippets did not register');
for (const sn of snips) {
  sandbox.window.HydraSketch.run(sn.code, mock);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hydraIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hydra', 'hydra.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hydra/hydra.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
