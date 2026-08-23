// Pack apps/bingo/ into site/apps/bingo/bingo.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// The Node / Mongo hall is gone. Cards and the bag ride in classic
// scripts. Offline and deterministic.
//
// Run:  node apps/bingo/build.mjs
import { bingoIcon, screenshotPng } from './icon.mjs';
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
const listing = JSON.parse(read('listing.json'));
const SCRIPTS = ['deal.js', 'app.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-bingo.txt'))) {
  throw new Error('vendor/COPYING-bingo.txt is missing — the MIT notice has to ride inside the GIF');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'deal.js': read('deal.js'),
  'app.js': read('app.js'),
  'COPYING-bingo.txt': read('vendor/COPYING-bingo.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

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
  throw new Error('bingo has no network path. The Node hall stays behind.');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.card || manifest.data.card.visibility !== 'private') {
  throw new Error('manifest.data.card must be private — the daubs never leave this tab');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — calls have to sync');
}
if (!html.includes('Play with friends')) throw new Error('index.html is missing Play with friends');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}

const packed = files['app.js'] + files['deal.js'] + html;
if (/socket\.io|express\(|require\(["']mongodb|createServer|WebSocket|paper\.js|mongoose/i.test(packed)) {
  throw new Error('Node / Mongo hall must not ship — the server was ripped out');
}
if (!files['app.js'].includes('putMe') || !files['app.js'].includes('putCard')) {
  throw new Error('app.js must write the private card and the player\'s own room row');
}
if (!files['app.js'].includes("gifos.db('card')") || !files['app.js'].includes("gifos.db('room')")) {
  throw new Error('app.js must use private card and read-write room');
}
if (!files['COPYING-bingo.txt'].includes('Mihail Gaberov')) {
  throw new Error('COPYING-bingo.txt is not mihailgaberov\'s MIT notice');
}
if (!listing.basedOn || listing.basedOn.name !== 'bingo' || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn must be {name:"bingo", blessed:false}');
}
if (!listing.author || listing.author.name !== 'mihailgaberov') {
  throw new Error('listing.author must be mihailgaberov');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games');
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

// Sanity: same seed same card; FREE centre; column ranges; bag is 1–75;
// a row of daubs (with FREE) is a win; an uncalled daub is not a claim.
{
  const ctx = { console };
  vm.runInNewContext(
    files['deal.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var c1 = BG.card("seed-1", "a");\n' +
    '  var c2 = BG.card("seed-1", "a");\n' +
    '  var c3 = BG.card("seed-1", "b");\n' +
    '  if (JSON.stringify(c1) !== JSON.stringify(c2)) throw new Error("card is not deterministic");\n' +
    '  if (JSON.stringify(c1) === JSON.stringify(c3)) throw new Error("different players share a card");\n' +
    '  if (c1[2][2] !== 0) throw new Error("centre must be FREE");\n' +
    '  var col, r, n, seen;\n' +
    '  for (col = 0; col < 5; col++) {\n' +
    '    seen = {};\n' +
    '    if (c1[col].length !== 5) throw new Error("column " + col + " short");\n' +
    '    for (r = 0; r < 5; r++) {\n' +
    '      n = c1[col][r];\n' +
    '      if (col === 2 && r === 2) continue;\n' +
    '      if (n < BG.RANGES[col][0] || n > BG.RANGES[col][1]) throw new Error("out of range " + n);\n' +
    '      if (seen[n]) throw new Error("dup " + n);\n' +
    '      seen[n] = 1;\n' +
    '    }\n' +
    '  }\n' +
    '  var b1 = BG.bag("seed-1"), b2 = BG.bag("seed-1"), b3 = BG.bag("seed-2");\n' +
    '  if (b1.length !== 75) throw new Error("bag length " + b1.length);\n' +
    '  if (JSON.stringify(b1) !== JSON.stringify(b2)) throw new Error("bag is not deterministic");\n' +
    '  if (JSON.stringify(b1) === JSON.stringify(b3)) throw new Error("bags collided");\n' +
    '  var have = {};\n' +
    '  b1.forEach(function (x) { have[x] = 1; });\n' +
    '  var i;\n' +
    '  for (i = 1; i <= 75; i++) if (!have[i]) throw new Error("bag missing " + i);\n' +
    '  if (BG.callName(12) !== "B 12" || BG.callName(32) !== "N 32" || BG.callName(75) !== "O 75") {\n' +
    '    throw new Error("callName " + BG.callName(12) + " " + BG.callName(32));\n' +
    '  }\n' +
    '  var marks = {"0,0":1,"1,0":1,"2,0":1,"3,0":1,"4,0":1};\n' +
    '  var rowWin = BG.hasWin(c1, marks);\n' +
    '  if (!rowWin || rowWin.kind !== "row") throw new Error("row win missing");\n' +
    '  var corners = {"0,0":1,"4,0":1,"0,4":1,"4,4":1};\n' +
    '  var cw = BG.hasWin(c1, corners);\n' +
    '  if (!cw || cw.kind !== "corners") throw new Error("corners win missing");\n' +
    '  var mid = {"2,0":1,"2,1":1,"2,3":1,"2,4":1};\n' +
    '  var colWin = BG.hasWin(c1, mid);\n' +
    '  if (!colWin || colWin.kind !== "col") throw new Error("FREE must count in the N column");\n' +
    '  var called = [c1[0][0], c1[1][0], c1[2][0], c1[3][0], c1[4][0]];\n' +
    '  if (!BG.validClaim(c1, marks, called)) throw new Error("honest row claim refused");\n' +
    '  if (BG.validClaim(c1, marks, [c1[0][0]])) throw new Error("uncalled daub must not win");\n' +
    '  if (BG.hasWin(c1, {"0,0":1,"1,0":1})) throw new Error("partial row is not a win");\n' +
    '  return BG.callName(42);\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 'N 42') throw new Error('deal self-test returned ' + ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: bingoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'bingo', 'bingo.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/bingo/bingo.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Node hall ripped out, no network)');
console.log('wrote apps/bingo/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
