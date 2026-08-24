// Pack apps/json-diff/ into site/apps/json-diff/json-diff.gif
import { jsonDiffIcon, screenshotPng } from './icon.mjs';
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

for (const need of [
  'vendor/jsondiffpatch.umd.js', 'vendor/html.css',
  'vendor/COPYING-jsondiffpatch.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const PIN = 'eb65a73d668481786577fd7939cb8f2c86e108867ebe376a8abd2bb4617e9590';
const buf = readFileSync(join(dir, 'vendor', 'jsondiffpatch.umd.js'));
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== PIN) throw new Error('vendor/jsondiffpatch.umd.js sha256 ' + hex + ' ≠ pin ' + PIN);
const src = buf.toString('utf8');
if (src.includes('</script')) throw new Error('vendor still contains </script — escape it for srcdoc inlining');
if (!src.includes('<\\/script>')) throw new Error('vendor must keep the HTML-formatter script close, escaped');
const CSS_PIN = 'e9c3a085b7bcf600e8cb21ef82c8b004f262cbb51048cfdb54720310555397c0';
const cssBuf = readFileSync(join(dir, 'vendor', 'html.css'));
if (createHash('sha256').update(cssBuf).digest('hex') !== CSS_PIN) {
  throw new Error('vendor/html.css sha256 drifted');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'json-diff') throw new Error('appId must be json-diff');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('json-diff has no network path');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save must be private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') throw new Error('room must be read-only');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'jsondiffpatch') throw new Error('basedOn.name must be jsondiffpatch');
if (listing.basedOn.url !== 'https://github.com/benjamine/jsondiffpatch') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'benjamine' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is benjamine, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Developer') throw new Error('listing.categories must include Developer');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/json-diff') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['vendor/jsondiffpatch.umd.js', 'mp.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/jsondiffpatch.umd.js': buf.toString('utf8'),
  'vendor/html.css': cssBuf.toString('utf8'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-jsondiffpatch.txt': read('vendor/COPYING-jsondiffpatch.txt'),
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
if (!html.includes('href="vendor/html.css"')) throw new Error('index.html does not load html.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last pair privately');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n !== 'vendor/jsondiffpatch.umd.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax');
  }
  if (n === 'vendor/jsondiffpatch.umd.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-jsondiffpatch.txt'].includes('Benjamin Eidelman')) {
  throw new Error('COPYING-jsondiffpatch.txt is not the upstream MIT notice');
}

{
  const ctx = { console };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.global = ctx;
  vm.runInNewContext(files['vendor/jsondiffpatch.umd.js'] + '\n' +
    'result = (function () {\n' +
    '  var J = jsondiffpatch;\n' +
    '  if (!J || typeof J.diff !== "function") throw new Error("diff missing");\n' +
    '  var d = J.diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });\n' +
    '  if (!d || !d.b || d.b[0] !== 2 || d.b[1] !== 3) throw new Error("b " + JSON.stringify(d));\n' +
    '  if (!d.c || d.c[0] !== 4) throw new Error("c " + JSON.stringify(d));\n' +
    '  var html = J.formatters.html.format(d, { a: 1, b: 2 });\n' +
    '  if (html.indexOf("jsondiffpatch") < 0) throw new Error("html formatter");\n' +
    '  if (J.diff({ a: 1 }, { a: 1 }) !== undefined) throw new Error("equal should be undefined");\n' +
    '  return "ok";\n' +
    '})();',
    ctx
  );
  console.log('jsondiffpatch checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jsonDiffIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'json-diff', 'json-diff.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/json-diff/json-diff.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
