// Pack apps/periodic-table/ into site/apps/periodic-table/periodic-table.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop uses
// (site/js/gifos-gif.js).
//
// 118 confirmed elements, classic scripts, a same-seed quiz race.
// Ununennium is 119 — we vendor Oganesson as 118.
//
// Run:  node apps/periodic-table/build.mjs
import { periodicTableIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'COPYING-periodic-table.txt'))) {
  throw new Error('vendor/COPYING-periodic-table.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = ['elements.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'elements.js': read('elements.js'),
  'app.js': read('app.js'),
  'COPYING-periodic-table.txt': read('vendor/COPYING-periodic-table.txt'),
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
  throw new Error('do not declare wasm — the table is plain JavaScript');
}
if (manifest.capabilities.network) {
  throw new Error('periodic-table has no network path');
}
if (manifest.capabilities.pointer) {
  throw new Error('do not declare pointer');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the shared quiz has to sync');
}
if (html.includes('id="invite"') || /id=["']invite/i.test(files['app.js'])) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
if (!files['app.js'].includes('Invite') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must tell the player to press Invite, and write only their own row');
}
if (!files['COPYING-periodic-table.txt'].includes('Caleb Ephrem')) {
  throw new Error('COPYING-periodic-table.txt is not calebephrem\'s MIT notice');
}
if (!listing.basedOn || listing.basedOn.name !== 'Periodic Table' || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn must be {name:"Periodic Table", blessed:false}');
}
if (!listing.author || listing.author.name !== 'calebephrem') {
  throw new Error('listing.author must be calebephrem');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Learning') {
  throw new Error('listing.categories must start with Learning');
}
if (!listing.description.toLowerCase().includes('118') || !listing.description.toLowerCase().includes('no account')) {
  throw new Error('listing must lead with 118 on this device and no account');
}
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'JSON', 'React']) {
  if (listing.description.includes(bad) || listing.tagline.includes(bad)) {
    throw new Error('listing copy must not use ' + bad);
  }
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

// Sanity: 118 elements, Gold is Au 79, Oganesson is 118, quiz item has 4 choices and one right.
{
  const ctx = { console };
  vm.runInNewContext(
    files['elements.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var P = this.PT;\n' +
    '  if (!P || !P.ELEMENTS) throw new Error("PT missing");\n' +
    '  if (P.ELEMENTS.length !== 118) throw new Error("expected 118, got " + P.ELEMENTS.length);\n' +
    '  var seen = {};\n' +
    '  for (var i = 0; i < P.ELEMENTS.length; i++) {\n' +
    '    var e = P.ELEMENTS[i];\n' +
    '    if (seen[e.z]) throw new Error("dup Z " + e.z);\n' +
    '    seen[e.z] = 1;\n' +
    '    if (!e.symbol || !e.name || !e.category || !e.shells || !e.config) throw new Error("incomplete " + e.z);\n' +
    '  }\n' +
    '  for (var z = 1; z <= 118; z++) if (!seen[z]) throw new Error("missing Z " + z);\n' +
    '  var au = P.byName("Gold");\n' +
    '  if (!au || au.symbol !== "Au" || au.z !== 79) throw new Error("Gold is Au 79");\n' +
    '  if (au.config.indexOf("6s1") < 0) throw new Error("Gold config");\n' +
    '  if (P.bySymbol("C").z !== 6) throw new Error("Carbon is 6");\n' +
    '  if (P.bySymbol("Fe").z !== 26) throw new Error("Iron is 26");\n' +
    '  if (P.bySymbol("Au").z !== 79) throw new Error("Au is not 79");\n' +
    '  var e118 = P.byZ(118);\n' +
    '  if (!e118) throw new Error("118 missing");\n' +
    '  if (e118.symbol !== "Og") throw new Error("118 symbol " + e118.symbol);\n' +
    '  if (e118.name !== "Oganesson" && e118.name !== "Ununennium") {\n' +
    '    throw new Error("118 must be Oganesson (Ununennium is 119)");\n' +
    '  }\n' +
    '  if (P.byName("Ununennium") && P.byName("Ununennium").z !== 118) {\n' +
    '    throw new Error("Ununennium, if present, is not 118");\n' +
    '  }\n' +
    '  var q = P.quizItem(1, 0);\n' +
    '  if (!q || !q.choices || q.choices.length !== 4) throw new Error("quiz needs 4 choices");\n' +
    '  if (q.answer < 0 || q.answer > 3) throw new Error("answer index");\n' +
    '  var nRight = 0, k, seenC = {};\n' +
    '  for (k = 0; k < 4; k++) {\n' +
    '    if (seenC[q.choices[k]]) throw new Error("dup choice");\n' +
    '    seenC[q.choices[k]] = 1;\n' +
    '    if (k === q.answer) nRight++;\n' +
    '  }\n' +
    '  if (nRight !== 1) throw new Error("exactly one right");\n' +
    '  var q2 = P.quizItem(1, 0);\n' +
    '  if (q.prompt !== q2.prompt || q.choices.join() !== q2.choices.join()) throw new Error("quiz not deterministic");\n' +
    '  return q.prompt;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: periodicTableIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'periodic-table', 'periodic-table.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/periodic-table/periodic-table.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (118 elements vendored, no network)');
console.log('wrote apps/periodic-table/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
