// Pack apps/pickr/ into the finished, downloadable
// site/apps/pickr/pickr.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// @simonwep/pickr release and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/pickr/build.mjs
import { pickrIcon, screenshotPng } from './icon.mjs';
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

const JS_SHA256 = '0321b41cb174529fa06990513d7a2b33f4567770f14ebb4c48c04fd5c884d5f5';
const CSS_SHA256 = 'e8215c4d69606947bb17c4d135649f93d1ebfbe22d9d4da6dc3abbf6cb78a287';

for (const need of ['vendor/pickr.js', 'vendor/pickr.css', 'vendor/COPYING-pickr.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/pickr/vendor.mjs first (it needs the network).');
  }
}

const jsBuf = readFileSync(join(dir, 'vendor', 'pickr.js'));
const cssBuf = readFileSync(join(dir, 'vendor', 'pickr.css'));
const jsHex = createHash('sha256').update(jsBuf).digest('hex');
const cssHex = createHash('sha256').update(cssBuf).digest('hex');
if (jsHex !== JS_SHA256) {
  throw new Error('vendor/pickr.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256 + ' — rerun vendor.mjs or move the pin.');
}
if (cssHex !== CSS_SHA256) {
  throw new Error('vendor/pickr.css sha256 ' + cssHex + ' ≠ pin ' + CSS_SHA256 + ' — rerun vendor.mjs or move the pin.');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'pickr') throw new Error('appId must be pickr');
if (manifest.name !== 'Pickr') throw new Error('manifest.name must be Pickr');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — recent colors live in gifos.db.');
}
if (manifest.capabilities.multiplayer) throw new Error('pickr is solo — do not declare multiplayer');
if (manifest.capabilities.network) throw new Error('pickr has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the original is plain JS');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — recent colors do not leave this device.');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'Pickr' || listing.basedOn.url !== 'https://github.com/simonwep/pickr') {
  throw new Error('listing.basedOn must name Pickr at github.com/simonwep/pickr');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'simonwep') {
  throw new Error('listing.author must be simonwep');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') throw new Error('category must be Utilities');
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/pickr') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'CSS', 'JavaScript']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/pickr.js', 'app.js'];

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/pickr.css': cssBuf.toString('utf8'),
  'vendor/pickr.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-pickr.txt': read('vendor/COPYING-pickr.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/pickr.css"')) throw new Error('index.html does not load vendor/pickr.css');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (html.indexOf('href="vendor/pickr.css"') > html.indexOf('src="vendor/pickr.js"')) {
  throw new Error('pickr.css must load before pickr.js');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (!html.includes('id="picker"')) throw new Error('index.html is missing the picker mount');
if (!html.includes('id="recents"')) throw new Error('index.html is missing recent colors');
if (!html.includes('data-fmt="hex"') || !html.includes('data-fmt="rgb"')) {
  throw new Error('index.html must offer hex and RGB copy lines');
}

if (!files['style.css'].includes('touch-action: none')) {
  throw new Error('style.css must set touch-action: none on the palette — a finger picks, the page must not scroll');
}
if (!files['COPYING-pickr.txt'].includes('Simon Reinisch')) {
  throw new Error('COPYING-pickr.txt is not Simon Reinisch\'s MIT notice');
}

const src = files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('a script uses ' + bad);
}
if (!src.includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!src.includes('recents') || !src.includes("id: 'state'")) {
  throw new Error('app.js must persist recent colors privately as id state');
}
if (!src.includes('Pickr.create') || !src.includes('inline: true') || !src.includes('showAlways: true')) {
  throw new Error('app.js must create an always-visible inline Pickr');
}
if (!src.includes('clipboard') && !src.includes('execCommand')) {
  throw new Error('app.js must copy the color code');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/pickr.js') continue; // generated UMD, already checked in vendor.mjs
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}

{
  const ctx = { window: {}, console, result: null };
  ctx.window = ctx;
  vm.runInNewContext(
    files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var A = PickrApp;\n' +
    '  if (A.luma(255, 255, 255) <= A.luma(0, 0, 0)) throw new Error("luma");\n' +
    '  var a = A.pushRecent([], "#E8416C", 3);\n' +
    '  if (a[0] !== "#E8416C") throw new Error("first " + a[0]);\n' +
    '  var b = A.pushRecent(a, "#112233", 3);\n' +
    '  if (b[0] !== "#112233" || b[1] !== "#E8416C") throw new Error("unshift");\n' +
    '  var c = A.pushRecent(b, "#e8416c", 3);\n' +
    '  if (c[0] !== "#E8416C" || c.length !== 2) throw new Error("dedupe " + c);\n' +
    '  var d = A.pushRecent(["#A","#B","#C"], "#D", 3);\n' +
    '  if (d.join(",") !== "#D,#A,#B") throw new Error("cap " + d);\n' +
    '  if (A.defaultColor !== "#E8416C") throw new Error("default");\n' +
    '  return c.length;\n' +
    '})();',
    ctx
  );
  console.log('recent-list + luma checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: pickrIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pickr', 'pickr.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pickr/pickr.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (UMD pickr, no network)');
console.log('wrote apps/pickr/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
