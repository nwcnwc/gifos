// Pack apps/jungle/ into site/apps/jungle/jungle.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// First-party Jungle / Dou Shou Qi. Classic scripts, minimax on this
// device. No network.
//
// Run:  node apps/jungle/build.mjs
import { jungleIcon, screenshotPng } from './icon.mjs';
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

const SCRIPTS = ['board.js', 'ai.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'board.js': read('board.js'),
  'ai.js': read('ai.js'),
  'app.js': read('app.js'),
};

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
  throw new Error('jungle has no network path');
}
if (manifest.capabilities.pointer) {
  throw new Error('jungle does not need pointer lock');
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
if (!files['ai.js'].includes('alphabeta') || !files['ai.js'].includes('MAX_DEPTH')) {
  throw new Error('ai.js is not minimax/alpha-beta');
}
if (!files['ai.js'].includes('aiMoveAsync')) {
  throw new Error('ai.js must yield between root moves so the UI is not frozen');
}
if (!files['board.js'].includes('GLYPH') || !files['app.js'].includes('GLYPH')) {
  throw new Error('pieces must be animals (GLYPH), not letters');
}
if (!html.includes('rankRow') || !html.includes('turnPill')) {
  throw new Error('first-run rank strip and whose-turn pill are required');
}
if (!files['style.css'].includes('turnpill') || !files['style.css'].includes('.piece .gly')) {
  throw new Error('animal faces and whose-turn chrome missing from CSS');
}
if (files['app.js'].includes('localStorage') || files['board.js'].includes('localStorage')) {
  throw new Error('no localStorage — gifos.db only');
}

// Sanity: rat captures elephant, elephant cannot capture rat, cannot enter
// own den, lion jump over empty water, rat in water blocks the jump.
{
  const ctx = { console };
  vm.runInNewContext(
    files['board.js'] + '\n' + files['ai.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var J = JG;\n' +
    '  var s = J.fresh();\n' +
    '  if (s.reds !== 8 || s.blues !== 8) throw new Error("start count " + s.reds + "-" + s.blues);\n' +
    '  if (s.turn !== J.BLUE) throw new Error("blue goes first");\n' +
    '  if (J.rankOf(s.map[8][0]) !== J.LION || J.sideOf(s.map[8][0]) !== J.RED) throw new Error("red lion start");\n' +
    '  if (J.rankOf(s.map[6][6]) !== J.ELEPHANT) throw new Error("red elephant start");\n' +
    '  if (J.rankOf(s.map[6][0]) !== J.RAT) throw new Error("red rat start");\n' +
    '  if (!J.isWater(3, 1) || J.isWater(3, 0) || J.isWater(3, 3)) throw new Error("river layout");\n' +
    '  var opening = J.legalMoves(s);\n' +
    '  if (!opening.length) throw new Error("blue should have opening moves");\n' +
    '\n' +
    '  var rat = J.emptyMap();\n' +
    '  rat[4][0] = J.pack(J.RED, J.RAT);\n' +
    '  rat[3][0] = J.pack(J.BLUE, J.ELEPHANT);\n' +
    '  var rs = { map: rat, n: 0, turn: J.RED, last: null, winner: J.EMPTY, reds: 1, blues: 1 };\n' +
    '  var took = J.play(rs, 4, 0, 3, 0);\n' +
    '  if (!took) throw new Error("rat should capture elephant");\n' +
    '  if (J.rankOf(took.map[3][0]) !== J.RAT || J.sideOf(took.map[3][0]) !== J.RED) throw new Error("rat missing after taking elephant");\n' +
    '  if (took.map[4][0] !== J.EMPTY) throw new Error("rat still on from-square");\n' +
    '\n' +
    '  var el = J.emptyMap();\n' +
    '  el[3][0] = J.pack(J.BLUE, J.ELEPHANT);\n' +
    '  el[4][0] = J.pack(J.RED, J.RAT);\n' +
    '  var es = { map: el, n: 0, turn: J.BLUE, last: null, winner: J.EMPTY, reds: 1, blues: 1 };\n' +
    '  if (J.play(es, 3, 0, 4, 0)) throw new Error("elephant cannot capture rat");\n' +
    '\n' +
    '  var den = J.emptyMap();\n' +
    '  den[8][2] = J.pack(J.RED, J.LION);\n' +
    '  var ds = { map: den, n: 0, turn: J.RED, last: null, winner: J.EMPTY, reds: 1, blues: 0 };\n' +
    '  if (J.play(ds, 8, 2, 8, 3)) throw new Error("cannot enter own den");\n' +
    '\n' +
    '  var jump = J.emptyMap();\n' +
    '  jump[3][0] = J.pack(J.RED, J.LION);\n' +
    '  var js = { map: jump, n: 0, turn: J.RED, last: null, winner: J.EMPTY, reds: 1, blues: 0 };\n' +
    '  var jumped = J.play(js, 3, 0, 3, 3);\n' +
    '  if (!jumped) throw new Error("lion jump over empty water");\n' +
    '  if (J.rankOf(jumped.map[3][3]) !== J.LION) throw new Error("lion missing after jump");\n' +
    '  if (jumped.map[3][0] !== J.EMPTY) throw new Error("lion still on bank");\n' +
    '\n' +
    '  jump[3][1] = J.pack(J.BLUE, J.RAT);\n' +
    '  js = { map: jump, n: 0, turn: J.RED, last: null, winner: J.EMPTY, reds: 1, blues: 1 };\n' +
    '  if (J.play(js, 3, 0, 3, 3)) throw new Error("rat in water blocks the jump");\n' +
    '\n' +
    '  var win = J.emptyMap();\n' +
    '  win[1][3] = J.pack(J.RED, J.CAT);\n' +
    '  var ws = { map: win, n: 0, turn: J.RED, last: null, winner: J.EMPTY, reds: 1, blues: 0 };\n' +
    '  var won = J.play(ws, 1, 3, 0, 3);\n' +
    '  if (!won || won.winner !== J.RED) throw new Error("entering opponent den should win");\n' +
    '\n' +
    '  var col = J.aiMove(s);\n' +
    '  if (!col || typeof col.fr !== "number" || typeof col.tr !== "number") throw new Error("AI move " + JSON.stringify(col));\n' +
    '  if (!J.play(s, col.fr, col.fc, col.tr, col.tc)) throw new Error("AI picked an illegal square");\n' +
    '  var replayed = J.replay([{ fr: col.fr, fc: col.fc, tr: col.tr, tc: col.tc }]);\n' +
    '  if (!replayed.map[col.tr][col.tc]) throw new Error("replay lost the piece");\n' +
    '  return col;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jungleIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'jungle', 'jungle.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/jungle/jungle.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Jungle engine, no network)');
console.log('wrote apps/jungle/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
