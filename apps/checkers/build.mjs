// Pack apps/checkers/ into site/apps/checkers/checkers.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// The computer is stroibot's Checkers AI (MIT), wrapped as a classic
// script. Offline and deterministic. No service worker.
//
// Run:  node apps/checkers/build.mjs
import { checkersIcon, screenshotPng } from './icon.mjs';
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
if (!existsSync(join(dir, 'vendor', 'COPYING-checkers.txt'))) {
  throw new Error('vendor/COPYING-checkers.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = ['board.js', 'vendor/ai.js', 'app.js'];

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'board.js': read('board.js'),
  'vendor/ai.js': read('vendor/ai.js'),
  'app.js': read('app.js'),
  'COPYING-checkers.txt': read('vendor/COPYING-checkers.txt'),
  'help.md': helpMd,
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
  throw new Error('checkers has no network path');
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
if (!files['vendor/ai.js'].includes('prefer it with a 50% chance') || !files['vendor/ai.js'].includes('Math.random')) {
  throw new Error('vendor/ai.js is not stroibot\'s AI — king preference / Math.random is missing');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!html.includes('Play a friend')) throw new Error('index.html is missing Play a friend');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (!files['COPYING-checkers.txt'].includes('stroibot')) {
  throw new Error('COPYING-checkers.txt is not stroibot\'s MIT notice');
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
if (!files['style.css'].includes('grid-template-rows:repeat(10,1fr)')) {
  throw new Error('board rows must be 1fr each so empty dest squares stay square');
}
if (!/piece-size:\s*calc\(var\(--board-size\) \/ 10 \* 0\.8[2-9]/.test(files['style.css'])) {
  throw new Error('pieces must fill at least 82% of a square — phone tap targets');
}
if (!files['style.css'].includes('hint.cap') && !files['style.css'].includes('.hint.cap')) {
  throw new Error('capture destinations must look different from quiet steps');
}
if (!files['app.js'].includes('You must jump') || !files['style.css'].includes('mustpulse')) {
  throw new Error('forced jumps must be named and pulsed, not a silent illegal tap');
}
if (!files['index.html'].includes('The computer plays on this device')) {
  throw new Error('setup must say the computer plays on this device');
}

// Sanity: 20 aside, white to move, a jump captures, a crown, AI a legal step.
{
  const ctx = { console };
  vm.runInNewContext(
    files['board.js'] + '\n' + files['vendor/ai.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var s = CK.fresh();\n' +
    '  if (s.blacks !== 20 || s.whites !== 20) throw new Error("start count " + s.blacks + "-" + s.whites);\n' +
    '  if (s.turn !== CK.WHITE) throw new Error("white goes first");\n' +
    '  var opening = CK.legalMoves(s);\n' +
    '  if (!opening.length) throw new Error("white should have opening moves");\n' +
    '  if (opening.some(function (m) { return m.capture; })) throw new Error("opening has no jumps");\n' +
    '  var ns = CK.play(s, 6, 1, 5, 0);\n' +
    '  if (!ns) throw new Error("white 6,1 to 5,0 should be legal");\n' +
    '  if (ns.map[5][0] !== CK.WHITE) throw new Error("moved man missing");\n' +
    '  if (ns.map[6][1] !== CK.EMPTY) throw new Error("from square should be empty");\n' +
    '  if (ns.turn !== CK.BLACK) throw new Error("black to move after a quiet step");\n' +
    '  var back = CK.play(s, 6, 1, 7, 0);\n' +
    '  if (back) throw new Error("a man cannot step backwards");\n' +
    '  var cap = CK.fresh();\n' +
    '  cap.map = CK.cloneMap(cap.map);\n' +
    '  for (var r = 0; r < 10; r++) for (var c = 0; c < 10; c++) cap.map[r][c] = CK.EMPTY;\n' +
    '  cap.map[5][4] = CK.WHITE; cap.map[4][3] = CK.BLACK;\n' +
    '  cap.turn = CK.WHITE; cap.locked = null; cap.winner = CK.EMPTY;\n' +
    '  cap.whites = 1; cap.blacks = 1;\n' +
    '  var jumped = CK.play(cap, 5, 4, 3, 2);\n' +
    '  if (!jumped) throw new Error("white should jump 5,4 over 4,3 to 3,2");\n' +
    '  if (jumped.map[4][3] !== CK.EMPTY) throw new Error("captured man still on the board");\n' +
    '  if (jumped.map[3][2] !== CK.WHITE) throw new Error("jumper missing");\n' +
    '  if (jumped.blacks !== 0) throw new Error("black should be gone");\n' +
    '  if (jumped.winner !== CK.WHITE) throw new Error("last capture should win");\n' +
    '  var quietWhileJump = CK.play(cap, 5, 4, 4, 5);\n' +
    '  if (quietWhileJump) throw new Error("must jump when a jump is on");\n' +
    '  var crown = CK.fresh();\n' +
    '  crown.map = CK.cloneMap(crown.map);\n' +
    '  for (r = 0; r < 10; r++) for (c = 0; c < 10; c++) crown.map[r][c] = CK.EMPTY;\n' +
    '  crown.map[1][2] = CK.WHITE; crown.turn = CK.WHITE; crown.locked = null; crown.winner = CK.EMPTY;\n' +
    '  crown.whites = 1; crown.blacks = 0;\n' +
    '  var crowned = CK.play(crown, 1, 2, 0, 3);\n' +
    '  if (!crowned) throw new Error("white 1,2 to 0,3 should crown");\n' +
    '  if (!CK.isKing(crowned.map[0][3])) throw new Error("should be a king");\n' +
    '  var col = CK.aiMove(s);\n' +
    '  if (!col || typeof col.fr !== "number" || typeof col.tr !== "number") throw new Error("AI move " + JSON.stringify(col));\n' +
    '  if (!CK.play(s, col.fr, col.fc, col.tr, col.tc)) throw new Error("AI picked an illegal square");\n' +
    '  var replayed = CK.replay([{ fr: 6, fc: 1, tr: 5, tc: 0 }]);\n' +
    '  if (replayed.map[5][0] !== CK.WHITE) throw new Error("replay lost the man");\n' +
    '  return col;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: checkersIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'checkers', 'checkers.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/checkers/checkers.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Checkers AI vendored, no network, no service worker)');
console.log('wrote apps/checkers/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
