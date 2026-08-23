// Pack apps/backgammon/ into site/apps/backgammon/backgammon.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// The table is quasoft's backgammonjs RuleBgCasual (MIT), wrapped as
// classic scripts. Offline and deterministic. No service worker.
//
// Run:  node apps/backgammon/build.mjs
import { backgammonIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';
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

if (!existsSync(join(dir, 'vendor', 'model.js'))) {
  throw new Error('vendor/model.js is missing');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-backgammonjs.txt'))) {
  throw new Error('vendor/COPYING-backgammonjs.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = [
  'vendor/model.js', 'vendor/rule.js', 'vendor/RuleBgCasual.js',
  'board.js', 'vendor/ai.js', 'app.js'
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/model.js': read('vendor/model.js'),
  'vendor/rule.js': read('vendor/rule.js'),
  'vendor/RuleBgCasual.js': read('vendor/RuleBgCasual.js'),
  'board.js': read('board.js'),
  'vendor/ai.js': read('vendor/ai.js'),
  'app.js': read('app.js'),
  'COPYING-backgammonjs.txt': read('vendor/COPYING-backgammonjs.txt'),
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
  throw new Error('backgammon has no network path');
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
if (!files['vendor/RuleBgCasual.js'].includes('RuleBgCasual') || !files['vendor/model.js'].includes('PieceType')) {
  throw new Error('vendor files are not quasoft\'s engine');
}
if (files['vendor/model.js'].includes('require(') || files['vendor/rule.js'].includes('require(') || files['vendor/RuleBgCasual.js'].includes('require(')) {
  throw new Error('vendor still uses require — wrap as classic scripts');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!html.includes('Play a friend')) throw new Error('index.html is missing Play a friend');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}
if (!files['COPYING-backgammonjs.txt'].includes('quasoft')) {
  throw new Error('COPYING-backgammonjs.txt is not quasoft\'s MIT notice');
}
if (!files['app.js'].includes('intent') || !files['app.js'].includes('putMe')) {
  throw new Error('app.js must publish moves on the player\'s own row');
}
if (!files['app.js'].includes('putBoard') || !files['app.js'].includes('isHost')) {
  throw new Error('host applies legal moves to the board row; nobody else writes it');
}

if (listing.author.name !== 'quasoft') throw new Error('author is quasoft, never GifOS');
if (listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.basedOn || listing.basedOn.name !== 'backgammonjs' || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn must name backgammonjs with blessed:false');
}
if (listing.basedOn.url !== 'https://github.com/quasoft/backgammonjs') {
  throw new Error('listing.basedOn.url must be https://github.com/quasoft/backgammonjs');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/backgammon') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
if (!/^Play the computer on this device/.test(listing.tagline)) {
  throw new Error('tagline must lead with computer on this device');
}
if (!listing.description.includes('There is no game server')) {
  throw new Error('listing must say there is no game server');
}
if (!listing.description.includes('unofficial')) {
  throw new Error('listing must credit the unofficial port');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

// Sanity: opening fifteen, a six from white's 24 is legal, AI spends the dice.
{
  const ctx = { console, crypto: webcrypto, Uint8Array };
  vm.createContext(ctx);
  vm.runInContext(
    files['vendor/model.js'] + '\n' + files['vendor/rule.js'] + '\n' +
    files['vendor/RuleBgCasual.js'] + '\n' + files['board.js'] + '\n' + files['vendor/ai.js'] + '\n' +
    'result = (function () {\n' +
    '  var B = Backgammon;\n' +
    '  var g = B.fresh();\n' +
    '  if (g.state.whitePieces.length !== 15 || g.state.blackPieces.length !== 15) throw new Error("start count");\n' +
    '  if (g.state.points[23].length !== 2) throw new Error("white should start with two on 24");\n' +
    '  if (g.state.points[0].length !== 2) throw new Error("black should start with two on 1");\n' +
    '  B.roll(g, [6, 5]);\n' +
    '  var piece = g.state.points[23][g.state.points[23].length - 1];\n' +
    '  if (!B.tryMove(g, piece.id, 6)) throw new Error("opening 6 from 24 should be legal");\n' +
    '  if (g.state.points[17].length !== 1) throw new Error("checker should land on 18");\n' +
    '  var g2 = B.fresh();\n' +
    '  B.roll(g2, [3, 1]);\n' +
    '  var seq = B.aiChoose(g2);\n' +
    '  if (!seq || !seq.length) throw new Error("AI chose nothing");\n' +
    '  B.aiPlay(g2);\n' +
    '  if (g2.turnDice.movesLeft.length) throw new Error("AI left dice unplayed");\n' +
    '  if (!B.confirm(g2)) throw new Error("confirm after AI");\n' +
    '  if (g2.turnPlayer.currentPieceType !== B.BLACK) throw new Error("black to play");\n' +
    '  var illegal = B.fresh();\n' +
    '  B.roll(illegal, [2, 1]);\n' +
    '  if (B.tryMove(illegal, B.topAt(illegal, 23).id, 4)) throw new Error("die 4 was not rolled");\n' +
    '  var hit = B.fresh();\n' +
    '  var blot = hit.state.points[18].pop();\n' +
    '  hit.state.points[22].push(blot);\n' +
    '  B.rebuild(hit);\n' +
    '  B.roll(hit, [1, 2]);\n' +
    '  if (!B.tryMove(hit, B.topAt(hit, 23).id, 1)) throw new Error("hit 1 from 24");\n' +
    '  if (hit.state.bar[B.BLACK].length !== 1) throw new Error("hit should send the blot to the bar");\n' +
    '  if (!hit.state.points[22].length || hit.state.points[22][0].type !== B.WHITE) throw new Error("hitter should sit on 23");\n' +
    '  var doubles = B.fresh();\n' +
    '  B.roll(doubles, [3, 3]);\n' +
    '  if ((doubles.turnDice.moves || []).length !== 4) throw new Error("doubles are four moves");\n' +
    '  var bear = B.fresh();\n' +
    '  var st = bear.state, wi;\n' +
    '  for (wi = 0; wi < 24; wi++) st.points[wi] = st.points[wi].filter(function (p) { return p.type === B.BLACK; });\n' +
    '  st.bar[B.WHITE] = []; st.outside[B.WHITE] = [];\n' +
    '  for (wi = 0; wi < 15; wi++) st.points[wi % 6].push(st.whitePieces[wi]);\n' +
    '  B.rebuild(bear);\n' +
    '  B.roll(bear, [1, 2]);\n' +
    '  if (!B.tryMove(bear, B.topAt(bear, 0).id, 1)) throw new Error("bearing a 1 from the ace");\n' +
    '  if (bear.state.outside[B.WHITE].length !== 1) throw new Error("checker should be off");\n' +
    '  var gD = B.fresh();\n' +
    '  B.roll(gD, [6, 5]);\n' +
    '  var dests = B.destsFor(gD, B.topAt(gD, 23));\n' +
    '  if (!dests.length) throw new Error("opening 6 from 24 should list a dest");\n' +
    '  return seq.length;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: backgammonIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'backgammon', 'backgammon.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/backgammon/backgammon.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (backgammonjs engine vendored, no network, no service worker)');
console.log('wrote apps/backgammon/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
