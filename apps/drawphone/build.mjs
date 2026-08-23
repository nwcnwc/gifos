// Pack apps/drawphone/ into site/apps/drawphone/drawphone.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// Upstream is a Node + socket.io room. This copy has no game server.
//
// Run:  node apps/drawphone/build.mjs
import { drawphoneIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'COPYING-drawphone.txt'))) {
  throw new Error('vendor/COPYING-drawphone.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = ['words.js', 'game.js', 'draw.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'words.js': read('words.js'),
  'game.js': read('game.js'),
  'draw.js': read('draw.js'),
  'app.js': read('app.js'),
  'COPYING-drawphone.txt': read('vendor/COPYING-drawphone.txt'),
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
  throw new Error('do not declare wasm — drawing is plain canvas');
}
if (manifest.capabilities.network) {
  throw new Error('drawphone has no network path — the Node room stays behind');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the shared chain has to sync');
}
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['app.js'].includes("id: 'archive'") || !files['app.js'].includes('saveDb')) {
  throw new Error('finished rounds must live in gifos.db(save) — the file is the archive');
}
if (!files['app.js'].includes('revealNext') || !files['app.js'].includes('revealStep')) {
  throw new Error('results must step through the chain — dumping it all kills the joke');
}
if (!files['draw.js'].includes('quadraticCurveTo') || !files['draw.js'].includes('getCoalescedEvents')) {
  throw new Error('the pad must smooth a finger stroke (quadratic + coalesced points)');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish turns on the player\'s own row');
}
if (!files['app.js'].includes('putBoard') || !files['app.js'].includes('isHost')) {
  throw new Error('host advances the chain on the board row; nobody else writes it');
}
if (!files['app.js'].includes('touch-action') && !files['style.css'].includes('touch-action:none')) {
  throw new Error('the pad must set touch-action:none so a finger draws instead of scrolling');
}

const packed = files['app.js'] + files['game.js'] + files['draw.js'] + html;
if (/socket\.io|express\(|createServer|colyseus|fabric\.js|jquery/i.test(packed)) {
  throw new Error('Node room / fabric / jquery must not ship — the server was ripped out');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
}
if (!files['COPYING-drawphone.txt'].includes('Tanner Krewson')) {
  throw new Error('COPYING-drawphone.txt is not Tanner Krewson\'s MIT notice');
}
if (!files['words.js'].includes('snowman') || !files['words.js'].includes('octopus')) {
  throw new Error('words.js is not the Simple words pack');
}

// Sanity: 2-player pack round ends on a guess; host applies both intents.
{
  const ctx = { console };
  vm.runInNewContext(
    files['words.js'] + '\n' + files['game.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  if (DP.turnsWanted(2, false) !== 2) throw new Error("2-pack turns " + DP.turnsWanted(2, false));\n' +
    '  if (DP.turnsWanted(3, false) !== 4) throw new Error("3-pack turns " + DP.turnsWanted(3, false));\n' +
    '  if (DP.turnsWanted(2, true) !== 3) throw new Error("2-write turns " + DP.turnsWanted(2, true));\n' +
    '  var rng = (function () { var n = 0; return function () { n = (n + 0.17) % 1; return n; }; })();\n' +
    '  var people = [{id:"a",name:"Ann"},{id:"b",name:"Bob"}];\n' +
    '  var b = DP.start(people, { wordFirst: false, rng: rng, host: "a" });\n' +
    '  if (b.phase !== "play") throw new Error("start phase");\n' +
    '  if (DP.expectedKind(b) !== "draw") throw new Error("first kind " + DP.expectedKind(b));\n' +
    '  if (b.chains[0].links[0].type !== "word") throw new Error("seed word missing");\n' +
    '  var act = DP.actors(b);\n' +
    '  if (act.length !== 2) throw new Error("actors " + act.length);\n' +
    '  var stroke = [{c:"#111",w:4,p:[10,10,40,40,80,20]}];\n' +
    '  var intents = {};\n' +
    '  act.forEach(function (id) { intents[id] = { kind:"draw", seq: b.seq, strokes: stroke }; });\n' +
    '  var b2 = DP.applyIntents(b, intents);\n' +
    '  if (!b2) throw new Error("draw intents rejected");\n' +
    '  if (DP.expectedKind(b2) !== "word") throw new Error("second kind " + DP.expectedKind(b2));\n' +
    '  var act2 = DP.actors(b2);\n' +
    '  var intents2 = {};\n' +
    '  act2.forEach(function (id) { intents2[id] = { kind:"word", seq: b2.seq, word: "hat" }; });\n' +
    '  var b3 = DP.applyIntents(b2, intents2);\n' +
    '  if (!b3 || b3.phase !== "results") throw new Error("should end on results");\n' +
    '  if (DP.lastWord(b3.chains[0]) !== "hat") throw new Error("last word");\n' +
    '  var blank = DP.applyIntents(b2, { a:{kind:"word",seq:b2.seq,word:""}, b:{kind:"word",seq:b2.seq,word:"x"} });\n' +
    '  if (blank) throw new Error("blank word must be refused");\n' +
    '  var wf = DP.start(people, { wordFirst: true, rng: rng, host: "a" });\n' +
    '  if (DP.expectedKind(wf) !== "word") throw new Error("word-first should write");\n' +
    '  if (wf.chains[0].links.length !== 0) throw new Error("word-first starts empty");\n' +
    '  return DP.pickWord(rng);\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: drawphoneIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'drawphone', 'drawphone.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/drawphone/drawphone.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Node room ripped out, no network)');
console.log('wrote apps/drawphone/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
