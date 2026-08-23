// Pack apps/hex-chess/ into site/apps/hex-chess/hex-chess.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// First-party Gliński hexagonal chess. Classic scripts. No wasm, no network.
//
// Run:  node apps/hex-chess/build.mjs
import { hexChessIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

const SCRIPTS = ['board.js', 'app.js'];

const help = read('help.md').replace(/^\uFEFF/, '');
if (help.trim().length < 400) throw new Error('help.md is missing or too short — need >= 400 trimmed characters');
if (!/^#\s+\S/.test(help.trim())) throw new Error('help.md must start with # <App Name>');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'board.js': read('board.js'),
  'app.js': read('app.js'),
  'help.md': help,
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
  throw new Error('do not declare wasm — the AI is plain JavaScript, not a compiled engine');
}
if (manifest.capabilities.network) {
  throw new Error('hex-chess has no network path');
}
if (manifest.capabilities.pointer) {
  throw new Error('hex-chess does not need pointer lock');
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
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!html.includes('Play a friend')) throw new Error('index.html is missing Play a friend');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish moves on the player\'s own row');
}
if (!files['app.js'].includes('putBoard') || !files['app.js'].includes('isHost')) {
  throw new Error('host applies legal moves to the board row; nobody else writes it');
}
if (!files['style.css'].includes('touch-action:manipulation')) {
  throw new Error('the board must be touch-action:manipulation');
}
if (!files['style.css'].includes('#0a0a0f')) {
  throw new Error('dark background must be #0a0a0f');
}

// Sanity: starting counts, bishop colour-bound, knight leap, king into check, no castling.
{
  const ctx = { console };
  vm.runInNewContext(
    files['board.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var s = HEX.fresh();\n' +
    '  if (HEX.HEXES.length !== 91) throw new Error("board is " + HEX.HEXES.length + " hexes");\n' +
    '  var c = HEX.countSide(s.pieces);\n' +
    '  if (c.w.K !== 1 || c.w.Q !== 1 || c.w.R !== 2 || c.w.N !== 2 || c.w.B !== 3 || c.w.P !== 9)\n' +
    '    throw new Error("white start " + JSON.stringify(c.w));\n' +
    '  if (c.b.K !== 1 || c.b.Q !== 1 || c.b.R !== 2 || c.b.N !== 2 || c.b.B !== 3 || c.b.P !== 9)\n' +
    '    throw new Error("black start " + JSON.stringify(c.b));\n' +
    '  if (c.w.n !== 18 || c.b.n !== 18) throw new Error("side count " + c.w.n + "-" + c.b.n);\n' +
    '  var f1 = HEX.parseAlg("f1"), f2 = HEX.parseAlg("f2"), f3 = HEX.parseAlg("f3");\n' +
    '  var col1 = HEX.hexColor(f1.q, f1.r), col2 = HEX.hexColor(f2.q, f2.r), col3 = HEX.hexColor(f3.q, f3.r);\n' +
    '  if (col1 === col2 || col1 === col3 || col2 === col3) throw new Error("three bishops must start on three colours");\n' +
    '  var opening = HEX.legalMoves(s);\n' +
    '  if (!opening.length) throw new Error("white should have opening moves");\n' +
    '  if (opening.some(function (m) { return m.castle; })) throw new Error("Gliński has no castling");\n' +
    '  var kg = HEX.findKing(s.pieces, HEX.WHITE);\n' +
    '  opening.filter(function (m) { return m.fq === kg.q && m.fr === kg.r; }).forEach(function (m) {\n' +
    '    var d = HEX.cubeDist(m.fq, m.fr, m.tq, m.tr);\n' +
    '    if (d > 2) throw new Error("king leaped " + d + " — that would be castling");\n' +
    '  });\n' +
    '  var bms = opening.filter(function (m) { return m.fq === f1.q && m.fr === f1.r; });\n' +
    '  if (!bms.length) throw new Error("Bf1 should have a move");\n' +
    '  bms.forEach(function (m) {\n' +
    '    if (HEX.hexColor(m.tq, m.tr) !== col1) throw new Error("bishop left its colour");\n' +
    '  });\n' +
    '  var empty = HEX.fresh();\n' +
    '  empty.pieces = {};\n' +
    '  empty.pieces[HEX.key(0, 0)] = HEX.pack(HEX.WHITE, HEX.NIGHT);\n' +
    '  empty.pieces[HEX.key(0, -5)] = HEX.pack(HEX.WHITE, HEX.KING);\n' +
    '  empty.turn = HEX.WHITE;\n' +
    '  var kn = HEX.legalMoves(empty).filter(function (m) {\n' +
    '    return HEX.ptype(empty.pieces[HEX.key(m.fq, m.fr)]) === HEX.NIGHT;\n' +
    '  });\n' +
    '  if (kn.length !== 12) throw new Error("mid-board knight should leap to 12 hexes, got " + kn.length);\n' +
    '  kn.forEach(function (m) {\n' +
    '    var dq = m.tq - m.fq, dr = m.tr - m.fr, dz = (-m.tq - m.tr) - (-m.fq - m.fr);\n' +
    '    var abs = [Math.abs(dq), Math.abs(dr), Math.abs(dz)].sort(function (a, b) { return a - b; }).join(",");\n' +
    '    if (abs !== "1,2,3") throw new Error("knight leap was " + abs + " not 1,2,3");\n' +
    '    if (HEX.cubeDist(m.fq, m.fr, m.tq, m.tr) !== 3) throw new Error("knight cube dist");\n' +
    '  });\n' +
    '  var chk = HEX.fresh();\n' +
    '  chk.pieces = {};\n' +
    '  chk.pieces[HEX.key(0, 0)] = HEX.pack(HEX.WHITE, HEX.KING);\n' +
    '  chk.pieces[HEX.key(0, 5)] = HEX.pack(HEX.BLACK, HEX.ROOK);\n' +
    '  chk.turn = HEX.WHITE;\n' +
    '  if (!HEX.inCheck(chk.pieces, HEX.WHITE)) throw new Error("king on f6 should be in check from Rf11");\n' +
    '  var kms = HEX.legalMoves(chk);\n' +
    '  kms.forEach(function (m) {\n' +
    '    if (m.tq === 0) throw new Error("king walked along the checked file to " + HEX.alg(m.tq, m.tr));\n' +
    '  });\n' +
    '  if (!kms.length) throw new Error("king should have an escape off the file");\n' +
    '  var ai = HEX.aiMove(s, 40);\n' +
    '  if (!ai || !HEX.applyMove(s, ai)) throw new Error("AI picked an illegal move");\n' +
    '  var g1 = HEX.parseAlg("g1"), g10 = HEX.parseAlg("g10");\n' +
    '  var p1 = HEX.pixel(g1.q, g1.r, 10), p10 = HEX.pixel(g10.q, g10.r, 10);\n' +
    '  if (p1.y >= p10.y) throw new Error("g1 must sit south of g10 (white at the near side)");\n' +
    '  var f5 = HEX.parseAlg("f5"), pf = HEX.pixel(f5.q, f5.r, 10);\n' +
    '  var back = HEX.atPixel(pf.x, pf.y, 10);\n' +
    '  if (!back || back.q !== f5.q || back.r !== f5.r) throw new Error("atPixel missed f5");\n' +
    '  var f1 = HEX.parseAlg("f1");\n' +
    '  if (HEX.pixel(f1.q, f1.r, 10).y >= pf.y) throw new Error("f1 should be south of f5");\n' +
    '  var n1 = HEX.pixel(0, 0, 10), n2 = HEX.pixel(0, 1, 10);\n' +
    '  var d = Math.hypot(n2.x - n1.x, n2.y - n1.y);\n' +
    '  if (Math.abs(d - 10 * Math.sqrt(3)) > 0.01) throw new Error("flat-top north spacing " + d);\n' +
    '  return kn.length;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hexChessIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hex-chess', 'hex-chess.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hex-chess/hex-chess.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Gliński, no wasm, no network)');
console.log('wrote apps/hex-chess/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
