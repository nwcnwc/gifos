// Pack apps/bip39/ into the finished, downloadable
// site/apps/bip39/bip39.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/bip39/build.mjs
import { bip39Icon, screenshotPng } from './icon.mjs';
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
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const WORDLISTS = [
  ['wordlist_english.js', '39fe7e02d9d6392817302698653b28e56b0540c55c646f6705adbcd19b34086e'],
  ['wordlist_japanese.js', 'f4f9db34ee12f889adab087de2d1b8fc111945e43879d3bc7f293b196ea32be2'],
  ['wordlist_spanish.js', 'b0d214b044915f0803e38d5597daf58e8177d40686be7b58a8de695b2b04f62a'],
  ['wordlist_chinese_simplified.js', '0a96a3af5e46cc26db300a78dea073dfc94f29fcabcb00328defb45183066f7e'],
  ['wordlist_chinese_traditional.js', '0f264ca613adbb5ed99aba0e9befe0e1cf64f288a5fc103fa5d67836a3b2b769'],
  ['wordlist_french.js', '5970ef537d41ae73c7de623ecbd7833762257d0e95803fb7cf23412e4b53dc5b'],
  ['wordlist_italian.js', '7d8c34095a647ee164a431a05057b8cabdbe29e0ee1aa1a94c49846ad6eb998e'],
  ['wordlist_korean.js', '790fc97de72dea659e12c23a7fb1ac1a1148a3b9db1fc4fa926d95e7e4f77813'],
  ['wordlist_czech.js', '0d2a2cff9abaeb94b701b4d814050a53e90f97c21d58496206d78e684d90650b'],
  ['wordlist_portuguese.js', '509f57e86140b7c0baf77e03dee4f9db006066224fe022761b89b239659f4463'],
];

const PINS = {
  'bip39-libs.js': 'a6c1301b7506adac77a6bc42d82f44d6556ef866f94c9b317a78c1934b0d7622',
  'jquery-3.2.1.js': '0d9027289ffa5d9f6c8b4e0782bb31bbff2cef5ee3708ccbcb7a22df9128bb21',
  'jsbip39.js': '239cf9fd4bdebb5c29e396dda98883205cc9b1843a94df3ffb28d8a48bfc66ab',
  'sjcl-bip39.js': '81af80dc0c14ac943e9178787c186ecde51deb025456854ccea3fa65314f32c6',
  'index.js': '3dd950f5d2f32cfe32963c1b3d4adea06e787ec7adb66daaaf19812e55a6f370',
};

const SCRIPTS = [
  'app.js',
  'vendor/jquery-3.2.1.js',
  'vendor/bootstrap.js',
  'vendor/bip39-libs.js',
  'vendor/bitcoinjs-extensions.js',
  'vendor/segwit-parameters.js',
  'vendor/ripple-util.js',
  'vendor/jingtum-util.js',
  'vendor/casinocoin-util.js',
  'vendor/cosmos-util.js',
  'vendor/eos-util.js',
  'vendor/fio-util.js',
  'vendor/xwc-util.js',
  'vendor/sjcl-bip39.js',
  ...WORDLISTS.map(([n]) => 'vendor/' + n),
  'vendor/jsbip39.js',
  'vendor/entropy.js',
  'vendor/index.js',
];

for (const need of [
  ...SCRIPTS,
  'vendor/bootstrap.css',
  'vendor/COPYING-bip39.txt',
  'vendor/COPYING-jsbip39.txt',
  'vendor/NOTICE.txt',
  'vendor/UPSTREAM.txt',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

for (const [name, pin] of [...WORDLISTS, ...Object.entries(PINS)]) {
  const hex = sha256(readFileSync(join(dir, 'vendor', name)));
  if (hex !== pin) throw new Error('vendor/' + name + ' sha256 ' + hex + ' ≠ pin ' + pin);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'bip39') throw new Error('appId must be bip39');
if (manifest.capabilities && manifest.capabilities.network) {
  throw new Error('bip39 has no network path. Do not declare capabilities.network.');
}
if (manifest.capabilities && manifest.capabilities.wasm) {
  throw new Error('bip39 is classic JS — no wasm');
}
if (manifest.capabilities && Object.keys(manifest.capabilities).length) {
  throw new Error('bip39 declares no capabilities — recovery words stay in the tab');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'bip39') {
  throw new Error('basedOn.name must be bip39');
}
if (listing.basedOn.url !== 'https://github.com/iancoleman/bip39') {
  throw new Error('basedOn.url must be iancoleman/bip39');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'iancoleman' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is iancoleman, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') {
  throw new Error('listing.categories must include Utilities');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/bip39') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (!/never leave this device/i.test(listing.description) && !/never leave this device/i.test(listing.tagline)) {
  throw new Error('listing must say recovery words never leave this device');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/bootstrap.css': read('vendor/bootstrap.css'),
  'COPYING-bip39.txt': read('vendor/COPYING-bip39.txt'),
  'COPYING-jsbip39.txt': read('vendor/COPYING-jsbip39.txt'),
  'NOTICE.txt': read('vendor/NOTICE.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('href="vendor/bootstrap.css"')) throw new Error('index.html does not load bootstrap.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (!html.includes('Recovery words never leave this device.')) {
  throw new Error('index.html must say recovery words never leave this device');
}
if (!html.includes('id="phrase"') || !html.includes('generate')) {
  throw new Error('index.html is missing the phrase field or generate button');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/jquery-3.2.1.js' || n === 'vendor/bip39-libs.js' || n === 'vendor/bootstrap.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-bip39.txt'].includes('Ian Coleman')) {
  throw new Error('COPYING-bip39.txt is not Ian Coleman\'s MIT notice');
}
if (!files['COPYING-jsbip39.txt'].includes('Pavol Rusnak')) {
  throw new Error('COPYING-jsbip39.txt is not Pavol Rusnak\'s MIT notice');
}

{
  // sjcl is "use strict"; jsbip39 writes the implicit global PBKDF2_ROUNDS.
  // Run them as separate scripts so sjcl's pragma does not cover jsbip39.
  const ctx = vm.createContext({ console, WORDLISTS: {} });
  ctx.window = ctx;
  ctx.$ = function () {
    return { find: function () { return { val: function () { return '2048'; } }; } };
  };
  vm.runInContext(files['vendor/sjcl-bip39.js'], ctx);
  vm.runInContext(files['vendor/wordlist_english.js'], ctx);
  vm.runInContext(files['vendor/jsbip39.js'], ctx);
  vm.runInContext(
    'result = (function () {\n' +
    '  if (!WORDLISTS.english || WORDLISTS.english.length !== 2048) throw new Error("english len");\n' +
    '  if (WORDLISTS.english[0] !== "abandon" || WORDLISTS.english[2047] !== "zoo") throw new Error("english ends");\n' +
    '  var m = new Mnemonic("english");\n' +
    '  var phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";\n' +
    '  if (!m.check(phrase)) throw new Error("check failed");\n' +
    '  if (m.check("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon")) throw new Error("bad checksum accepted");\n' +
    '  var seed = m.toSeed(phrase, "");\n' +
    '  if (seed !== "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4") throw new Error("seed " + seed);\n' +
    '  return seed.slice(0, 16);\n' +
    '})();',
    ctx
  );
  console.log('BIP39 english check + seed vector ok —', ctx.result);
}

for (const [name] of WORDLISTS) {
  const ctx = { WORDLISTS: {} };
  vm.runInNewContext(files['vendor/' + name], ctx);
  const keys = Object.keys(ctx.WORDLISTS);
  if (keys.length !== 1) throw new Error(name + ' should define one wordlist');
  const list = ctx.WORDLISTS[keys[0]];
  if (!list || list.length !== 2048) throw new Error(name + ' has ' + (list && list.length) + ' words, not 2048');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: bip39Icon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'bip39', 'bip39.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/bip39/bip39.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (wordlists in-GIF, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
