// Pack apps/spyfall/ into site/apps/spyfall/spyfall.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// The Node socket room is gone. Locations and the deal ride in classic
// scripts. Offline and deterministic.
//
// Run:  node apps/spyfall/build.mjs
import { spyfallIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
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
const SCRIPTS = ['locations.js', 'deal.js', 'app.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-spyfall.txt'))) {
  throw new Error('vendor/COPYING-spyfall.txt is missing — the MIT notice has to ride inside the GIF');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'locations.js': read('locations.js'),
  'deal.js': read('deal.js'),
  'app.js': read('app.js'),
  'COPYING-spyfall.txt': read('vendor/COPYING-spyfall.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — the deal is plain JavaScript');
}
if (manifest.capabilities.network) {
  throw new Error('spyfall has no network path. The Node room stays behind.');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.role || manifest.data.role.visibility !== 'private') {
  throw new Error('manifest.data.role must be private — the card never leaves this tab');
}
if (!manifest.data.votes || manifest.data.votes.visibility !== 'read-write') {
  throw new Error('manifest.data.votes must be read-write — location votes have to sync');
}
if (!html.includes('Play with friends')) throw new Error('index.html is missing Play with friends');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}

const packed = files['app.js'] + files['deal.js'] + files['locations.js'] + html;
if (/socket\.io|express\(|require\(["']next|createServer|WebSocket/i.test(packed)) {
  throw new Error('Node / socket room must not ship — the server was ripped out');
}
if (!files['app.js'].includes('putMe') || !files['app.js'].includes('putRole')) {
  throw new Error('app.js must write the private card and the player\'s own votes row');
}
if (!files['app.js'].includes("gifos.db('role')") || !files['app.js'].includes("gifos.db('votes')")) {
  throw new Error('app.js must use private role and read-write votes');
}
if (!files['COPYING-spyfall.txt'].includes('Tanner Krewson')) {
  throw new Error('COPYING-spyfall.txt is not tannerkrewson\'s MIT notice');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

// Sanity: same seed same cards; exactly one spy; non-spies share a location.
{
  const ctx = { console };
  vm.runInNewContext(
    files['locations.js'] + '\n' + files['deal.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var ids = ["a","b","c","d","e"];\n' +
    '  var d1 = SF.deal("seed-1", ids);\n' +
    '  var d2 = SF.deal("seed-1", ids);\n' +
    '  if (d1.location !== d2.location) throw new Error("deal is not deterministic");\n' +
    '  if (d1.spyId !== d2.spyId) throw new Error("spy is not deterministic");\n' +
    '  var spies = 0, loc = null, i, c;\n' +
    '  for (i = 0; i < ids.length; i++) {\n' +
    '    c = d1.cards[ids[i]];\n' +
    '    if (!c) throw new Error("missing card for " + ids[i]);\n' +
    '    if (c.spy) { spies++; if (c.location) throw new Error("spy must not know the place"); }\n' +
    '    else {\n' +
    '      if (!c.location || !c.role) throw new Error("non-spy needs place and role");\n' +
    '      if (loc && loc !== c.location) throw new Error("split locations");\n' +
    '      loc = c.location;\n' +
    '    }\n' +
    '  }\n' +
    '  if (spies !== 1) throw new Error("need exactly one spy, got " + spies);\n' +
    '  if (d1.cards[d1.spyId].spy !== true) throw new Error("spyId is not the spy");\n' +
    '  if (SF.LOCATIONS.length < 20) throw new Error("location pack is short");\n' +
    '  return d1.location;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: spyfallIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'spyfall', 'spyfall.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/spyfall/spyfall.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Node room ripped out, no network)');
console.log('wrote apps/spyfall/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
