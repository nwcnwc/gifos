// Pack apps/reversi/ into site/apps/reversi/reversi.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// The computer is alex-berson's Reversi MCTS (MIT), wrapped as a classic
// script. Offline and deterministic. No service worker.
//
// Run:  node apps/reversi/build.mjs
import { reversiIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'ai.js'))) {
  throw new Error('vendor/ai.js is missing');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-reversi.txt'))) {
  throw new Error('vendor/COPYING-reversi.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = ['board.js', 'vendor/ai.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'board.js': read('board.js'),
  'vendor/ai.js': read('vendor/ai.js'),
  'app.js': read('app.js'),
  'COPYING-reversi.txt': read('vendor/COPYING-reversi.txt'),
};
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md trimmed length must be >= 400');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (/serviceWorker|service-worker/i.test(html + files['app.js'] + files['board.js'])) {
  throw new Error('strip the service worker — GifOS apps do not register one');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — the AI is plain JavaScript, not a compiled engine');
}
if (manifest.capabilities.network) {
  throw new Error('reversi has no network path');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the shared board has to sync');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}
if (files['app.js'].includes('cdn.') || files['index.html'].includes('http://') || /https:\/\//.test(files['index.html'])) {
  throw new Error('do not load anything from the network — vendor everything');
}
if (!files['vendor/ai.js'].includes('backprapogation') || !files['vendor/ai.js'].includes('Number.MIN_VALUE')) {
  throw new Error('vendor/ai.js is not Berson\'s MCTS — backprapogation / MIN_VALUE is missing');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!html.includes('Play a friend')) throw new Error('index.html is missing Play a friend');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (!files['COPYING-reversi.txt'].includes('Alexander Berson')) {
  throw new Error('COPYING-reversi.txt is not Alexander Berson\'s MIT notice');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish moves on the player\'s own row');
}
if (!files['app.js'].includes('putBoard') || !files['app.js'].includes('isHost')) {
  throw new Error('host applies legal moves to the board row; nobody else writes it');
}
if (!files['app.js'].includes('flipping') || files['app.js'].includes('inversion')) {
  throw new Error('flips must be a disc turning over, not a CSS invert flash');
}
if (!files['app.js'].includes('show-b') || !files['style.css'].includes('.hint')) {
  throw new Error('legal-move dots must be their own marks, readable on a phone');
}
if (files['app.js'].includes('location.hash') || files['app.js'].includes("location.replace('#'")) {
  throw new Error('do not write the hash — that walks the app out of its frame');
}

// Sanity: opening four, a place flips, MCTS returns a legal square.
// Illegal flips fail the build — that is a failed round.
{
  const ctx = { console };
  vm.runInNewContext(
    files['board.js'] + '\n' + files['vendor/ai.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var s = RV.fresh();\n' +
    '  if (s.blacks !== 2 || s.whites !== 2) throw new Error("start count");\n' +
    '  if (s.map[3][3] !== RV.WHITE || s.map[3][4] !== RV.BLACK) throw new Error("opening d4/e4");\n' +
    '  if (s.map[4][3] !== RV.BLACK || s.map[4][4] !== RV.WHITE) throw new Error("opening d5/e5");\n' +
    '  var opening = RV.availableMoves(s.map, RV.BLACK);\n' +
    '  if (opening.length !== 4) throw new Error("opening should have 4 moves, got " + opening.length);\n' +
    '  var ns = RV.place(s, 2, 3);\n' +
    '  if (!ns) throw new Error("d3 should be legal for black");\n' +
    '  if (ns.map[2][3] !== RV.BLACK) throw new Error("placed disk missing");\n' +
    '  if (ns.map[3][3] !== RV.BLACK) throw new Error("d4 should have flipped");\n' +
    '  if (ns.map[3][4] !== RV.BLACK) throw new Error("e4 must stay black");\n' +
    '  if (ns.map[4][4] !== RV.WHITE) throw new Error("e5 must stay white — that is not in the sandwich");\n' +
    '  if (ns.flipped.length !== 2) throw new Error("d3 flips exactly one, got " + ns.flipped.length);\n' +
    '  if (ns.blacks !== 4 || ns.whites !== 1) throw new Error("after d3 counts " + ns.blacks + "-" + ns.whites);\n' +
    '  var illegal = RV.place(s, 0, 0);\n' +
    '  if (illegal) throw new Error("corner is not legal on move 1");\n' +
    '  var occupied = RV.place(s, 3, 3);\n' +
    '  if (occupied) throw new Error("cannot place on an occupied square");\n' +
    '  var empty = RV.cloneMap(RV.fresh().map);\n' +
    '  var r, c;\n' +
    '  for (r = 0; r < 8; r++) for (c = 0; c < 8; c++) empty[r][c] = 0;\n' +
    '  empty[0][0] = RV.BLACK;\n' +
    '  empty[0][1] = RV.WHITE; empty[0][2] = RV.WHITE; empty[0][3] = RV.WHITE; empty[0][4] = RV.WHITE;\n' +
    '  var long = { map: empty, n: 0, turn: RV.BLACK, last: null, flipped: null, winner: 0, blacks: 1, whites: 4, passed: false };\n' +
    '  var longNs = RV.place(long, 0, 5);\n' +
    '  if (!longNs) throw new Error("a four-disc sandwich must be legal");\n' +
    '  if (longNs.flipped.length !== 5) throw new Error("four whites must all flip, got " + longNs.flipped.length);\n' +
    '  if (longNs.map[0][1] !== RV.BLACK || longNs.map[0][4] !== RV.BLACK) throw new Error("long line missed a disc");\n' +
    '  var two = RV.cloneMap(empty);\n' +
    '  for (r = 0; r < 8; r++) for (c = 0; c < 8; c++) two[r][c] = 0;\n' +
    '  two[3][3] = RV.WHITE; two[3][4] = RV.BLACK;\n' +
    '  two[4][2] = RV.WHITE; two[5][2] = RV.BLACK;\n' +
    '  var twoS = { map: two, n: 1, turn: RV.BLACK, last: null, flipped: null, winner: 0, blacks: 2, whites: 2, passed: false };\n' +
    '  var twoNs = RV.place(twoS, 3, 2);\n' +
    '  if (!twoNs) throw new Error("two-direction sandwich must be legal");\n' +
    '  if (twoNs.map[3][3] !== RV.BLACK) throw new Error("horizontal flip missing");\n' +
    '  if (twoNs.map[4][2] !== RV.BLACK) throw new Error("vertical flip missing");\n' +
    '  if (twoNs.map[3][4] !== RV.BLACK || twoNs.map[5][2] !== RV.BLACK) throw new Error("anchors must stay");\n' +
    '  if (twoNs.flipped.length !== 3) throw new Error("two-dir should flip two, got " + twoNs.flipped.length);\n' +
    '  var gap = RV.cloneMap(empty);\n' +
    '  for (r = 0; r < 8; r++) for (c = 0; c < 8; c++) gap[r][c] = 0;\n' +
    '  gap[0][2] = RV.WHITE; gap[0][3] = RV.BLACK;\n' +
    '  if (RV.validMove(gap, RV.BLACK, 0, 0)) throw new Error("must not flip across a gap");\n' +
    '  var col = RV.aiMove(s.map, RV.BLACK, 40);\n' +
    '  if (!col || typeof col.r !== "number" || typeof col.c !== "number") throw new Error("AI move " + JSON.stringify(col));\n' +
    '  if (!RV.validMove(s.map, RV.BLACK, col.r, col.c)) throw new Error("AI picked an illegal square");\n' +
    '  var book = RV.OPENING;\n' +
    '  if (book.length !== 4) throw new Error("opening book");\n' +
    '  return col;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: reversiIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'reversi', 'reversi.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/reversi/reversi.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Reversi AI vendored, no network, no service worker)');
console.log('wrote apps/reversi/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
