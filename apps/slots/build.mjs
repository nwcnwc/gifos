// Pack apps/slots/ into site/apps/slots/slots.gif (see apps/README.md).
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
import { slotsIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['symbols.js', 'slot.js', 'mp.js', 'app.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-slots.txt'))) {
  throw new Error('vendor/COPYING-slots.txt is missing');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'symbols.js': read('symbols.js'),
  'slot.js': read('slot.js'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-slots.txt': read('vendor/COPYING-slots.txt'),
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
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('slots has no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'html5-slot-machine') throw new Error('basedOn.name');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || listing.author.name !== 'johakr' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is johakr, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') throw new Error('categories');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (!files['COPYING-slots.txt'].includes('Johannes Kronmüller')) {
  throw new Error('COPYING-slots.txt is not the upstream MIT notice');
}
if (!files['app.js'].includes("db('save')") || !files['mp.js'].includes("db('room')") && !files['app.js'].includes("db('room')")) {
  throw new Error('must use gifos.db save + room');
}
if (!files['mp.js'].includes('Invite') && !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(
    files['symbols.js'] + '\n' + files['slot.js'] + '\n' +
    'result = (function () {\n' +
    '  if (SLOT_NAMES.length !== 9) throw new Error("symbol count " + SLOT_NAMES.length);\n' +
    '  if (!SlotSymbols.seven || !SlotSymbols.cherry) throw new Error("missing symbol");\n' +
    '  var n = SlotSymbol.random();\n' +
    '  if (SLOT_NAMES.indexOf(n) < 0) throw new Error("random " + n);\n' +
    '  return n;\n' +
    '})();',
    ctx
  );
  console.log('slots symbol check ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: slotsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'slots', 'slots.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/slots/slots.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
