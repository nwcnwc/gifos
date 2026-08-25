// Pack apps/contrast-ratio/ into the finished, downloadable
// site/apps/contrast-ratio/contrast-ratio.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/contrast-ratio/build.mjs
import { contrastRatioIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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

for (const need of [
  'vendor/color.js',
  'vendor/COPYING-contrast-ratio.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const COLOR_SHA256 = '19b6e953b935ec806770b7074d404c27c1f86e7ac2966cd8eee833ac505f4cb3';
const colorBuf = readFileSync(join(dir, 'vendor', 'color.js'));
const colorHex = createHash('sha256').update(colorBuf).digest('hex');
if (colorHex !== COLOR_SHA256) {
  throw new Error('vendor/color.js sha256 ' + colorHex + ' ≠ pin ' + COLOR_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'contrast-ratio') throw new Error('appId must be contrast-ratio');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (manifest.capabilities.multiplayer) throw new Error('contrast-ratio has no room');
if (manifest.capabilities.network) throw new Error('contrast-ratio has no network path');
if (manifest.capabilities.wasm) throw new Error('contrast-ratio is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private — the last pair stays on this device');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'contrast-ratio') {
  throw new Error('basedOn.name must be contrast-ratio');
}
if (listing.basedOn.url !== 'https://github.com/siege-media/contrast-ratio') {
  throw new Error('basedOn.url must be siege-media/contrast-ratio');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'siege-media' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is siege-media, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/contrast-ratio') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/color.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/color.js': colorBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-contrast-ratio.txt': read('vendor/COPYING-contrast-ratio.txt'),
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
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (!html.includes('id="background"') || !html.includes('id="foreground"')) {
  throw new Error('index.html must have the two colour fields');
}
if (!html.includes('id="contrast"') || !html.includes('id="swap"')) {
  throw new Error('index.html must have the contrast circle and swap');
}
if (!html.includes('id="backgroundBest"') || !html.includes('id="foregroundBest"')) {
  throw new Error('index.html must have a Best button on each side');
}
if (!html.includes('id="backgroundHex"') || !html.includes('id="foregroundHex"')) {
  throw new Error('index.html must show the hex for each side');
}
if (/gtag\(|googletagmanager|google-analytics|buttons\.github/i.test(html + files['app.js'])) {
  throw new Error('tracking leaked into the port — strip it');
}

if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last pair privately');
}
if (!files['app.js'].includes('.contrast(')) {
  throw new Error('app.js must call Color.contrast');
}
if (!/bestAgainst: bestAgainst/.test(files['app.js']) || !/hexOf: hexOf/.test(files['app.js'])) {
  throw new Error('app.js must export bestAgainst and hexOf — test/unit/contrast-ratio.js asserts both');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-contrast-ratio.txt'].includes('Lea Verou')) {
  throw new Error('COPYING-contrast-ratio.txt is not Lea Verou\'s MIT notice');
}

{
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInNewContext(files['vendor/color.js'] + '\n' +
    'result = (function () {\n' +
    '  var w = Color.WHITE, b = Color.BLACK;\n' +
    '  var a = w.contrast(b).ratio;\n' +
    '  if (a !== 21) throw new Error("white on black " + a);\n' +
    '  var c = b.contrast(w).ratio;\n' +
    '  if (c !== 21) throw new Error("black on white " + c);\n' +
    '  var d = w.contrast(w).ratio;\n' +
    '  if (d !== 1) throw new Error("white on white " + d);\n' +
    '  var gray = new Color([119, 119, 119]);\n' +
    '  var g = w.contrast(gray).ratio;\n' +
    '  if (g < 4.47 || g > 4.49) throw new Error("#777 on white " + g);\n' +
    '  var mist = new Color([0, 0, 0, 0.7]);\n' +
    '  var m = w.contrast(mist);\n' +
    '  if (m.ratio < 8 || m.ratio > 9) throw new Error("70% black on white " + m.ratio);\n' +
    '  if (typeof Color.prototype.toHex !== "function") throw new Error("toHex missing");\n' +
    '  if (b.toHex(false) !== "#000000") throw new Error("black hex " + b.toHex(false));\n' +
    '  return { whiteBlack: a, gray: g, mist: m.ratio };\n' +
    '})();',
    ctx
  );
  console.log('WCAG contrast checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: contrastRatioIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'contrast-ratio', 'contrast-ratio.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/contrast-ratio/contrast-ratio.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
