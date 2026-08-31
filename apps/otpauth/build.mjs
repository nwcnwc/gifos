// Pack apps/otpauth/ into site/apps/otpauth/otpauth.gif
import { otpauthIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { TextEncoder, TextDecoder } from 'node:util';

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

for (const need of [
  'vendor/otpauth.umd.min.js',
  'vendor/qrcode.js',
  'vendor/COPYING-otpauth.txt',
  'vendor/COPYING-noble-hashes.txt',
  'vendor/COPYING-qrcodejs.txt',
  'vendor/COPYING-qrcode-generator.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const OTP_SHA = 'f7511bcf6a30eb3fdbc5b4d5155661ee2d45f7f498aac8b20e401ca4d298c498';
const QR_SHA = '3ee72de9f69c668f9567363a9358df955960bae9000d9ebd66414670f88e8735';
const otpBuf = readFileSync(join(dir, 'vendor', 'otpauth.umd.min.js'));
const qrBuf = readFileSync(join(dir, 'vendor', 'qrcode.js'));
const otpHex = createHash('sha256').update(otpBuf).digest('hex');
const qrHex = createHash('sha256').update(qrBuf).digest('hex');
if (otpHex !== OTP_SHA) throw new Error('vendor/otpauth.umd.min.js sha256 ' + otpHex + ' ≠ pin ' + OTP_SHA);
if (qrHex !== QR_SHA) throw new Error('vendor/qrcode.js sha256 ' + qrHex + ' ≠ pin ' + QR_SHA);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
if (manifest.appId !== 'otpauth') throw new Error('appId must be otpauth');
if (manifest.name !== 'OTP Auth') throw new Error('name must be OTP Auth');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (manifest.capabilities.multiplayer) {
  throw new Error('otpauth must not declare multiplayer — secrets never leave the owner tab');
}
if (manifest.capabilities.network) throw new Error('otpauth has no network path');
if (manifest.capabilities.camera || manifest.capabilities.microphone) {
  throw new Error('otpauth does not capture — add is paste / type / import');
}
if (!manifest.data || !manifest.data.accounts || manifest.data.accounts.visibility !== 'private') {
  throw new Error('accounts must be private');
}
if (!manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
for (const [k, v] of Object.entries(manifest.data)) {
  if (v && v.visibility && v.visibility !== 'private') {
    throw new Error('collection ' + k + ' must be private — secrets never sync');
  }
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial wrap');
}
if (listing.basedOn.name !== 'OTPAuth') throw new Error('basedOn.name must be OTPAuth');
if (listing.basedOn.url !== 'https://github.com/hectorm/otpauth') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Héctor Molinero Fernández, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-30') throw new Error('listing.releaseDate must be 2026-08-30');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/otpauth') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/otpauth.umd.min.js', 'vendor/qrcode.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/otpauth.umd.min.js': otpBuf.toString('utf8'),
  'vendor/qrcode.js': qrBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-otpauth.txt': read('vendor/COPYING-otpauth.txt'),
  'COPYING-noble-hashes.txt': read('vendor/COPYING-noble-hashes.txt'),
  'COPYING-qrcodejs.txt': read('vendor/COPYING-qrcodejs.txt'),
  'COPYING-qrcode-generator.txt': read('vendor/COPYING-qrcode-generator.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  if (/gifos\.db|sandbox|connect-src|localStorage|WASM/i.test(helpMd)) {
    throw new Error('help.md mentions GifOS internals');
  }
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
  throw new Error('do not draw an Invite button — that is OS chrome, and this app does not share secrets');
}
if (!files['app.js'].includes("db('accounts')") || !files['app.js'].includes("db('prefs')")) {
  throw new Error('app.js must use gifos.db accounts and prefs');
}
if (!files['app.js'].includes('onBack')) throw new Error('app.js must register gifos.onBack');
if (!html.includes('empty-state')) throw new Error('empty state must be obvious');
if (!html.includes('id="emptyImport"') || !html.includes('id="moreMenu"') || !html.includes('id="f-goto-import"')) {
  throw new Error('import/export must be reachable from empty, the header menu, and the add sheet — not only a desktop ghost button');
}
if (files['style.css'].includes('.top-actions .ghost { display: none')) {
  throw new Error('do not hide import/export at phone width');
}
if (!html.includes('row-del')) throw new Error('delete must use button.row-del');
if (!files['app.js'].includes('OTPAuth') && !files['app.js'].includes('window.OTPAuth')) {
  throw new Error('app.js must use OTPAuth');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-otpauth.txt'].includes('Héctor Molinero Fernández')) {
  throw new Error('COPYING-otpauth.txt is not the upstream MIT notice');
}
if (!files['COPYING-noble-hashes.txt'].includes('Paul Miller')) {
  throw new Error('COPYING-noble-hashes.txt is not the noble-hashes MIT notice');
}

{
  const ctx = {
    console,
    TextEncoder,
    TextDecoder,
    setTimeout, clearTimeout,
    Uint8Array, ArrayBuffer,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(files['vendor/otpauth.umd.min.js'] + '\n' +
    'result = (function () {\n' +
    '  if (!OTPAuth) throw new Error("OTPAuth missing");\n' +
    '  if (OTPAuth.version !== "9.4.1") throw new Error("version " + OTPAuth.version);\n' +
    '  var secret = OTPAuth.Secret.fromLatin1("12345678901234567890");\n' +
    '  var totp = new OTPAuth.TOTP({ algorithm:"SHA1", digits:8, period:30, secret: secret });\n' +
    '  function g(u){ return totp.generate({ timestamp: u * 1000 }); }\n' +
    '  var v = {\n' +
    '    a: g(59), b: g(1111111109), c: g(1111111111),\n' +
    '    d: g(1234567890), e: g(2000000000), f: g(20000000000)\n' +
    '  };\n' +
    '  if (v.a !== "94287082") throw new Error("RFC6238 T=59 " + v.a);\n' +
    '  if (v.b !== "07081804") throw new Error("RFC6238 T=1111111109 " + v.b);\n' +
    '  if (v.c !== "14050471") throw new Error("RFC6238 T=1111111111 " + v.c);\n' +
    '  if (v.d !== "89005924") throw new Error("RFC6238 T=1234567890 " + v.d);\n' +
    '  if (v.e !== "69279037") throw new Error("RFC6238 T=2000000000 " + v.e);\n' +
    '  if (v.f !== "65353130") throw new Error("RFC6238 T=20000000000 " + v.f);\n' +
    '  var hotp = new OTPAuth.HOTP({ algorithm:"SHA1", digits:6, secret: secret, counter: 0 });\n' +
    '  var h0 = hotp.generate({ counter: 0 });\n' +
    '  if (h0 !== "755224") throw new Error("RFC4226 C=0 " + h0);\n' +
    '  var uri = OTPAuth.URI.parse("otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub");\n' +
    '  if (uri.issuer !== "GitHub") throw new Error("issuer " + uri.issuer);\n' +
    '  if (uri.label !== "alice@example.com") throw new Error("label " + uri.label);\n' +
    '  if (uri.digits !== 6) throw new Error("digits");\n' +
    '  if (uri.period !== 30) throw new Error("period");\n' +
    '  var tok = uri.generate();\n' +
    '  if (!/^[0-9]{6}$/.test(tok)) throw new Error("token " + tok);\n' +
    '  return { version: OTPAuth.version, token: tok, remaining: uri.remaining() };\n' +
    '})();',
    ctx
  );
  console.log('RFC 6238 / 4226 vectors ok —', ctx.result);
}

{
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.document = {
    documentElement: { tagName: 'HTML' },
    getElementById: function () { return { innerHTML: '', style: {} }; },
    createElement: function () {
      return { style: {}, appendChild: function () {}, getContext: function () {
        return { fillRect: function () {}, fillStyle: '' };
      } };
    }
  };
  ctx.CanvasRenderingContext2D = function () {};
  vm.runInNewContext(files['vendor/qrcode.js'] + '\n' +
    'result = (function () {\n' +
    '  if (typeof QRCode !== "function") throw new Error("QRCode missing");\n' +
    '  if (!QRCode.CorrectLevel) throw new Error("CorrectLevel missing");\n' +
    '  return QRCode.CorrectLevel;\n' +
    '})();',
    ctx
  );
  console.log('QRCode ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: otpauthIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'otpauth', 'otpauth.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/otpauth/otpauth.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
