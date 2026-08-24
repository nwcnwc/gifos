// Pack apps/orca/ into the finished, downloadable
// site/apps/orca/orca.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Run:  node apps/orca/build.mjs
import { orcaIcon, screenshotPng } from './icon.mjs';
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

const VENDOR = [
  'vendor/lib/acels.js',
  'vendor/lib/theme.js',
  'vendor/lib/history.js',
  'vendor/lib/source.js',
  'vendor/core/library.js',
  'vendor/core/io.js',
  'vendor/core/operator.js',
  'vendor/core/orca.js',
  'vendor/core/transpose.js',
  'vendor/core/io/cc.js',
  'vendor/core/io/midi.js',
  'vendor/core/io/mono.js',
  'vendor/core/io/osc.js',
  'vendor/core/io/udp.js',
  'vendor/clock.js',
  'vendor/commander.js',
  'vendor/cursor.js',
  'vendor/client.js',
  'vendor/main.css',
  'vendor/COPYING-orca.txt',
  'vendor/UPSTREAM.txt'
];
for (const need of VENDOR) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'orca') throw new Error('appId must be orca');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('orca has no network path');
if (manifest.capabilities.wasm) throw new Error('orca is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'Orca') throw new Error('basedOn.name must be Orca');
if (listing.basedOn.url !== 'https://github.com/hundredrabbits/Orca') {
  throw new Error('basedOn.url must be hundredrabbits/Orca');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Hundredrabbits, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('listing.categories must include Creativity');
}
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/orca') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = [
  'shim.js',
  'vendor/lib/acels.js',
  'vendor/lib/theme.js',
  'vendor/lib/history.js',
  'vendor/lib/source.js',
  'vendor/core/library.js',
  'vendor/core/io.js',
  'vendor/core/operator.js',
  'vendor/core/orca.js',
  'vendor/core/transpose.js',
  'vendor/core/io/cc.js',
  'vendor/core/io/midi.js',
  'vendor/core/io/mono.js',
  'vendor/core/io/osc.js',
  'vendor/core/io/udp.js',
  'vendor/clock.js',
  'vendor/commander.js',
  'vendor/cursor.js',
  'vendor/client.js',
  'boot.js'
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shim.js': read('shim.js'),
  'boot.js': read('boot.js'),
  'COPYING-orca.txt': read('vendor/COPYING-orca.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of VENDOR) {
  if (s.endsWith('COPYING-orca.txt') || s.endsWith('UPSTREAM.txt')) continue;
  files[s] = read(s);
}
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/main.css"')) throw new Error('index.html does not load vendor/main.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['boot.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['boot.js'].includes("db('save')") || !files['boot.js'].includes("id: 'grid'")) {
  throw new Error('boot.js must save the grid privately');
}
if (!files['boot.js'].includes(':04C') || !files['boot.js'].includes('STARTER')) {
  throw new Error('boot.js must ship the D4/:04C first-run program');
}
if (!files['boot.js'].includes('AudioContext') || !files['boot.js'].includes('hearNote')) {
  throw new Error('boot.js must hear notes in-browser when MIDI is missing');
}
if (!files['style.css'].includes('pointer: coarse') || !files['boot.js'].includes('pad')) {
  throw new Error('phone pad is missing');
}
if (files['vendor/clock.js'].includes('new Worker')) {
  throw new Error('clock.js still uses a blob Worker — keep the setInterval patch');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-orca.txt'].includes('Hundredrabbits')) {
  throw new Error('COPYING-orca.txt is not the upstream MIT notice');
}

{
  const ctx = { console, atob, btoa };
  vm.createContext(ctx);
  vm.runInContext(
    files['vendor/core/operator.js'] + '\n' +
    files['vendor/core/library.js'] + '\nthis.library = library;\n' +
    files['vendor/core/orca.js'] + '\n' +
    'this.result = (function () {\n' +
    '  var o = new Orca(library);\n' +
    '  o.load(8, 2, "D4...:a4........");\n' +
    '  if (o.w !== 8 || o.h !== 2) throw new Error("size");\n' +
    '  if (o.glyphAt(0,0) !== "D") throw new Error("glyph " + o.glyphAt(0,0));\n' +
    '  if (o.glyphAt(1,0) !== "4") throw new Error("clock");\n' +
    '  o.write(2, 0, "*");\n' +
    '  if (o.glyphAt(2,0) !== "*") throw new Error("write");\n' +
    '  return o.s.length;\n' +
    '})();',
    ctx
  );
  console.log('Orca load/write ok — cells', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: orcaIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'orca', 'orca.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/orca/orca.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
