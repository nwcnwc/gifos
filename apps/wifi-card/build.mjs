// Pack apps/wifi-card/ into the finished, downloadable
// site/apps/wifi-card/wifi-card.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/wifi-card/build.mjs
import { wifiCardIcon, screenshotPng } from './icon.mjs';
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
  'vendor/COPYING-wifi-card.txt',
  'vendor/COPYING-qrcode.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const QR_SHA256 = '79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c';
const qrBuf = readFileSync(join(dir, 'vendor', 'qrcode.js'));
const qrHex = createHash('sha256').update(qrBuf).digest('hex');
if (qrHex !== QR_SHA256) {
  throw new Error('vendor/qrcode.js sha256 ' + qrHex + ' ≠ pin ' + QR_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'wifi-card') throw new Error('appId must be wifi-card');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('wifi-card has no network path');
if (manifest.capabilities.wasm) throw new Error('wifi-card is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private — the last card stays on this device');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write — the meeting card has to sync');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'wifi-card') {
  throw new Error('basedOn.name must be wifi-card');
}
if (listing.basedOn.url !== 'https://github.com/bndw/wifi-card') {
  throw new Error('basedOn.url must be bndw/wifi-card');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'bndw' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is bndw, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/wifi-card') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
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
  'COPYING-wifi-card.txt': read('vendor/COPYING-wifi-card.txt'),
  'COPYING-qrcode.txt': read('vendor/COPYING-qrcode.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
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
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['mp.js'].includes('room') || !files['mp.js'].includes('Nobody writes')) {
  throw new Error('mp.js must share the card on own rows');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last card privately');
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
if (!files['COPYING-wifi-card.txt'].includes('Ben Woodward')) {
  throw new Error('COPYING-wifi-card.txt is not the upstream MIT notice');
}
if (!files['COPYING-qrcode.txt'].includes('Kazuhiko Arase')) {
  throw new Error('COPYING-qrcode.txt is not the qrcode-generator MIT notice');
}

{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(files['vendor/qrcode.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var W = WifiCard;\n' +
    '  var a = W.payload({ ssid: "Cafe", password: "secret12", encryptionMode: "WPA", hiddenSSID: false });\n' +
    '  if (a !== "WIFI:T:WPA;S:Cafe;P:secret12;H:false;;") throw new Error("wpa payload " + a);\n' +
    '  var b = W.payload({ ssid: "Open", password: "", encryptionMode: "", hiddenSSID: false });\n' +
    '  if (b !== "WIFI:T:nopass;S:Open;P:;H:false;;") throw new Error("open payload " + b);\n' +
    '  var c = W.payload({ ssid: "A;B", password: "x:y", encryptionMode: "WPA", hiddenSSID: true });\n' +
    '  if (c !== "WIFI:T:WPA;S:A\\\\;B;P:x\\\\:y;H:true;;") throw new Error("escape payload " + c);\n' +
    '  var d = W.payload({ ssid: "Corp", password: "pw", encryptionMode: "WPA2-EAP", eapMethod: "PWD", eapIdentity: "user", hiddenSSID: false });\n' +
    '  if (d !== "WIFI:T:WPA2-EAP;E:PWD;I:user;S:Corp;P:pw;H:false;;") throw new Error("eap payload " + d);\n' +
    '  if (W.escapeWifi("\\\\") !== "\\\\\\\\") throw new Error("backslash");\n' +
    '  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];\n' +
    '  var qr = qrcode(0, "M");\n' +
    '  qr.addData(a);\n' +
    '  qr.make();\n' +
    '  var n = qr.getModuleCount();\n' +
    '  if (n < 21 || n > 57) throw new Error("module count " + n);\n' +
    '  function dark(r, c) { return qr.isDark(r, c); }\n' +
    '  if (!dark(0,0) || !dark(0,6) || !dark(6,0) || !dark(6,6) || !dark(3,3)) throw new Error("finder missing");\n' +
    '  if (dark(1,1)) throw new Error("finder inner should be white at 1,1");\n' +
    '  return n;\n' +
    '})();',
    ctx
  );
  console.log('WIFI payload + QR finder checks ok — modules', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: wifiCardIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'wifi-card', 'wifi-card.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/wifi-card/wifi-card.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
