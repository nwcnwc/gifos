// Pack apps/qr-code/ into the finished, downloadable
// site/apps/qr-code/qr-code.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/qr-code/build.mjs
import { qrCodeIcon, screenshotPng } from './icon.mjs';
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
  'vendor/qrcode.js',
  'vendor/COPYING-qrcodejs.txt',
  'vendor/COPYING-qrcode-generator.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const QR_SHA256 = '3ee72de9f69c668f9567363a9358df955960bae9000d9ebd66414670f88e8735';
const qrBuf = readFileSync(join(dir, 'vendor', 'qrcode.js'));
const qrHex = createHash('sha256').update(qrBuf).digest('hex');
if (qrHex !== QR_SHA256) {
  throw new Error('vendor/qrcode.js sha256 ' + qrHex + ' ≠ pin ' + QR_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'qr-code') throw new Error('appId must be qr-code');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('qr-code has no network path');
if (manifest.capabilities.wasm) throw new Error('qr-code is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private — the last payload stays on this device');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') {
  throw new Error('room must be read-only — guests see the host code');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'qrcodejs') {
  throw new Error('basedOn.name must be qrcodejs');
}
if (listing.basedOn.url !== 'https://github.com/davidshimjs/qrcodejs') {
  throw new Error('basedOn.url must be davidshimjs/qrcodejs');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'davidshimjs' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is davidshimjs, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/qr-code') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/qrcode.js', 'mp.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/qrcode.js': qrBuf.toString('utf8'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-qrcodejs.txt': read('vendor/COPYING-qrcodejs.txt'),
  'COPYING-qrcode-generator.txt': read('vendor/COPYING-qrcode-generator.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
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
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last payload privately');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'vendor/qrcode.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  if (n === 'vendor/qrcode.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-qrcodejs.txt'].includes('davidshimjs')) {
  throw new Error('COPYING-qrcodejs.txt is not the upstream MIT notice');
}
if (!files['COPYING-qrcode-generator.txt'].includes('Kazuhiko Arase')) {
  throw new Error('COPYING-qrcode-generator.txt is not the qrcode-generator MIT notice');
}

{
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.document = {
    documentElement: { tagName: 'HTML' },
    getElementById: function () { return { innerHTML: '', style: {} }; },
    createElement: function () { return { style: {}, appendChild: function () {}, getContext: function () { return { fillRect: function () {}, fillStyle: '' }; } }; }
  };
  ctx.CanvasRenderingContext2D = function () {};
  vm.runInNewContext(files['vendor/qrcode.js'] + '\n' +
    'result = (function () {\n' +
    '  if (typeof QRCode !== "function") throw new Error("QRCode missing");\n' +
    '  if (!QRCode.CorrectLevel) throw new Error("CorrectLevel missing");\n' +
    '  if (QRCode.CorrectLevel.L !== 1) throw new Error("L " + QRCode.CorrectLevel.L);\n' +
    '  if (QRCode.CorrectLevel.M !== 0) throw new Error("M " + QRCode.CorrectLevel.M);\n' +
    '  if (QRCode.CorrectLevel.Q !== 3) throw new Error("Q " + QRCode.CorrectLevel.Q);\n' +
    '  if (QRCode.CorrectLevel.H !== 2) throw new Error("H " + QRCode.CorrectLevel.H);\n' +
    '  return QRCode.CorrectLevel;\n' +
    '})();',
    ctx
  );
  console.log('QRCode CorrectLevel checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: qrCodeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'qr-code', 'qr-code.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/qr-code/qr-code.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
