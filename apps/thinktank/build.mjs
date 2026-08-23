// Pack apps/thinktank/ into site/apps/thinktank/thinktank.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// Rules are averycrespi/thinktank (MIT), rewritten as classic scripts.
// The computer is ours — the original needed a match server.
//
// Run:  node apps/thinktank/build.mjs
import { thinktankIcon, screenshotPng } from './icon.mjs';
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
if (!existsSync(join(dir, 'vendor', 'COPYING-thinktank.txt'))) {
  throw new Error('vendor/COPYING-thinktank.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = ['board.js', 'vendor/ai.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'board.js': read('board.js'),
  'vendor/ai.js': read('vendor/ai.js'),
  'app.js': read('app.js'),
  'COPYING-thinktank.txt': read('vendor/COPYING-thinktank.txt'),
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
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — the AI is plain JavaScript, not a compiled engine');
}
if (manifest.capabilities.network) {
  throw new Error('thinktank has no network path');
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
if (!files['COPYING-thinktank.txt'].includes('Avery Crespi')) {
  throw new Error('COPYING-thinktank.txt is not averycrespi\'s MIT notice');
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
  throw new Error('phone-first dark #0a0a0f is required');
}
if (!files['style.css'].includes('.cell.hint') && !files['style.css'].includes('.hint')) {
  throw new Error('legal moves must be highlighted');
}

// Sanity: legal place, illegal rejected, a known win, AI a legal act.
{
  const ctx = { console };
  vm.runInNewContext(
    files['board.js'] + '\n' + files['vendor/ai.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var s = TT.fresh();\n' +
    '  if (s.turn !== TT.RED) throw new Error("red goes first");\n' +
    '  if (!s.cells[TT.RED_HOME_CENTER] || s.cells[TT.RED_HOME_CENTER].token !== TT.BASE) throw new Error("red base missing");\n' +
    '  if (!s.cells[TT.BLUE_HOME_CENTER] || s.cells[TT.BLUE_HOME_CENTER].token !== TT.BASE) throw new Error("blue base missing");\n' +
    '  var spawn = TT.coordsToIndex(1, 1);\n' +
    '  if (!TT.isRedSpawn(spawn)) throw new Error("(1,1) should be red spawn");\n' +
    '  var placed = TT.play(s, { k: "place", t: TT.BLOCKER, i: spawn });\n' +
    '  if (!placed) throw new Error("placing a shield on red spawn should be legal");\n' +
    '  if (!placed.cells[spawn] || placed.cells[spawn].token !== TT.BLOCKER) throw new Error("shield missing after place");\n' +
    '  if (placed.turn !== TT.BLUE) throw new Error("blue to play after a quiet place");\n' +
    '  if (TT.play(s, { k: "place", t: TT.BLOCKER, i: 0 })) throw new Error("place outside spawn must be rejected");\n' +
    '  if (TT.play(s, { k: "place", t: TT.BLOCKER, i: TT.RED_HOME_CENTER })) throw new Error("place on the base must be rejected");\n' +
    '  var homeStep = TT.coordsToIndex(2, 2);\n' +
    '  if (TT.play(placed, { k: "move", s: spawn, d: homeStep })) throw new Error("a shield cannot enter a home");\n' +
    '  var win = TT.fresh();\n' +
    '  win.cells = TT.cloneCells(win.cells);\n' +
    '  var tank = TT.coordsToIndex(11, 16);\n' +
    '  win.cells[tank] = { player: TT.RED, token: TT.TANK_L };\n' +
    '  win.turn = TT.RED; win.winner = null;\n' +
    '  var rotated = TT.play(win, { k: "rotate", t: TT.TANK_U, i: tank });\n' +
    '  if (!rotated) throw new Error("rotating the tank to face the blue base should be legal");\n' +
    '  if (rotated.winner !== TT.RED) throw new Error("known win: tank facing the blue base should destroy it, got " + rotated.winner);\n' +
    '  if (rotated.cells[TT.BLUE_HOME_CENTER]) throw new Error("blue base should be gone");\n' +
    '  var act = TT.aiMove(s);\n' +
    '  if (!act || !act.k) throw new Error("AI move " + JSON.stringify(act));\n' +
    '  if (!TT.play(s, act)) throw new Error("AI picked an illegal action");\n' +
    '  var replayed = TT.replay([{ k: "place", t: TT.BLOCKER, i: spawn }]);\n' +
    '  if (!replayed.cells[spawn] || replayed.cells[spawn].token !== TT.BLOCKER) throw new Error("replay lost the shield");\n' +
    '  return act;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: thinktankIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'thinktank', 'thinktank.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/thinktank/thinktank.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Thinktank rules vendored, on-device computer, no network)');
console.log('wrote apps/thinktank/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
