// Pack apps/trianglify-studio/ into site/apps/trianglify-studio/trianglify-studio.gif.
// Run:  node apps/trianglify-studio/build.mjs
import { trianglifyIcon, screenshotPng } from './icon.mjs';
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

const JS_SHA256 = 'f3a15f4bd721966e161f0c7321a667fb5aa3a23594aafacdd6521e5f08dc70f1';

for (const need of ['vendor/trianglify.js', 'vendor/COPYING-trianglify.txt', 'COPYING.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/trianglify-studio/vendor.mjs first (it needs the network).');
  }
}

const vendorBuf = readFileSync(join(dir, 'vendor', 'trianglify.js'));
const vendorHex = createHash('sha256').update(vendorBuf).digest('hex');
if (vendorHex !== JS_SHA256) {
  throw new Error('vendor/trianglify.js sha256 ' + vendorHex + ' ≠ pin ' + JS_SHA256 + ' — rerun vendor.mjs or move the pin.');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'requestAnimationFrame', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/trianglify.js', 'app.js', 'mp.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/trianglify.js': vendorBuf.toString('utf8'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-trianglify.txt': read('vendor/COPYING-trianglify.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
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
if (!html.includes('id="wall"') || !html.includes('id="chips"') || !html.includes('id="seed"')) {
  throw new Error('index.html must have the wallpaper canvas, palette chips, and a seed box');
}
if (!html.includes('id="pngBtn"') || !html.includes('id="svgBtn"')) {
  throw new Error('index.html must export PNG and SVG');
}
if (manifest.name !== 'Trianglify') throw new Error('manifest.name must be Trianglify');
if (manifest.appId !== 'trianglify-studio') throw new Error('manifest.appId must be trianglify-studio');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — the last wallpaper lives in gifos.db.');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer — Share the wallpaper is a room.');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the last wallpaper does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the seed has to sync.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('trianglify-studio has no network path');
if (!manifest.launch || !manifest.launch.seed) {
  throw new Error('manifest.launch.seed lets a link open onto a wallpaper');
}
if (listing.basedOn?.name !== 'Trianglify') {
  throw new Error('listing.basedOn.name must be Trianglify');
}
if (listing.basedOn?.url !== 'https://github.com/qrohlf/trianglify') {
  throw new Error('listing.basedOn.url must be https://github.com/qrohlf/trianglify');
}
if (listing.author?.name !== 'Quinn Rohlf') {
  throw new Error('listing.author.name must be Quinn Rohlf — they are the author, GifOS is the porter');
}
if (listing.porter?.name !== 'GifOS') {
  throw new Error('listing.porter.name must be GifOS');
}
if (listing.basedOn?.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.license !== 'GPL-3.0') throw new Error('listing.license must be GPL-3.0');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('category must be Creativity');
}
if (listing.releaseDate !== '2026-08-30') throw new Error('releaseDate must be 2026-08-30');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/trianglify-studio') {
  throw new Error('listing.homepage must be the gifos tree');
}

if (!files['COPYING.txt'].includes('GNU GENERAL PUBLIC LICENSE')) {
  throw new Error('COPYING.txt is not the GPLv3');
}
if (!files['COPYING-trianglify.txt'].includes('GNU GENERAL PUBLIC LICENSE')) {
  throw new Error('COPYING-trianglify.txt is not Quinn Rohlf\'s GPLv3 notice');
}
if (!files['mp.js'].includes("db('room')") || !files['app.js'].includes("db('save')")) {
  throw new Error('app must use gifos.db save + room');
}
if (!files['mp.js'].includes('seed:') || !files['mp.js'].includes('onChange')) {
  throw new Error('mp.js must share the seed on each player\'s own row');
}
if (!files['vendor/trianglify.js'].includes('trianglify') || !files['vendor/trianglify.js'].includes('interpolateLinear')) {
  throw new Error('vendor/trianglify.js does not look like the trianglify UMD');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/trianglify.js') continue;
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

{
  const sandbox = { self: {}, window: {}, console };
  vm.runInNewContext(files['vendor/trianglify.js'], sandbox);
  const t = sandbox.trianglify;
  if (typeof t !== 'function') throw new Error('UMD did not set trianglify');
  const p = t({ width: 80, height: 50, cellSize: 28, seed: 'gifos', xColors: 'YlGnBu' });
  if (!p.polys || p.polys.length < 8) throw new Error('trianglify produced too few triangles');
  const svg = p.toSVGTree().toString();
  if (!svg.includes('<svg') || !svg.includes('path')) throw new Error('toSVGTree did not serialize');
  const p2 = t({ width: 80, height: 50, cellSize: 28, seed: 'gifos', xColors: 'YlGnBu' });
  if (p.points[0][0] !== p2.points[0][0]) throw new Error('seed is not deterministic');

  // toCanvas only writes width/height when scaling is truthy. An empty canvas
  // plus {scaling:false} stays 300×150 — that was the postage-stamp PNG.
  const fakeCtx = {
    scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, lineJoin: '', fillStyle: '', strokeStyle: '', lineWidth: 0
  };
  const fake = { width: 300, height: 150, style: {}, getContext() { return fakeCtx; } };
  p.toCanvas(fake, { scaling: false, applyCssScaling: false });
  if (fake.width !== 300 || fake.height !== 150) {
    throw new Error('toCanvas(scaling:false) resized the canvas — the PNG size assumption moved');
  }
  fake.width = 1920;
  fake.height = 1080;
  p.toCanvas(fake, { scaling: false, applyCssScaling: false });
  if (fake.width !== 1920 || fake.height !== 1080) {
    throw new Error('pre-sized canvas + scaling:false must keep the picker size');
  }
}

{
  const png = files['app.js'].match(/function downloadPng\(\) \{[\s\S]*?\n  \}/);
  if (!png) throw new Error('downloadPng is missing');
  if (!/canvas\.width\s*=\s*sz\.w/.test(png[0]) || !/canvas\.height\s*=\s*sz\.h/.test(png[0])) {
    throw new Error('downloadPng must assign canvas.width/height to the picker size before toCanvas — scaling:false does not');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: trianglifyIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'trianglify-studio', 'trianglify-studio.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/trianglify-studio/trianglify-studio.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (trianglify UMD + studio, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
