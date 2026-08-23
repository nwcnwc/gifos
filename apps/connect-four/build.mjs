// Pack apps/connect-four/ into site/apps/connect-four/connect-four.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// The computer is kenrick95's c4 minimax (MIT), transcribed to a classic
// script. Offline and deterministic.
//
// Run:  node apps/connect-four/build.mjs
import { connectFourIcon, screenshotPng } from './icon.mjs';
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
if (!existsSync(join(dir, 'vendor', 'COPYING-c4.txt'))) {
  throw new Error('vendor/COPYING-c4.txt is missing — the MIT notice has to ride inside the GIF');
}

const SCRIPTS = ['board.js', 'vendor/ai.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'board.js': read('board.js'),
  'vendor/ai.js': read('vendor/ai.js'),
  'app.js': read('app.js'),
  'COPYING-c4.txt': read('vendor/COPYING-c4.txt'),
};

{
  const helpPath = join(dir, 'help.md');
  if (!existsSync(helpPath)) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md trimmed length must be >= 400');
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
  throw new Error('do not declare wasm — the AI is plain JavaScript, not a compiled engine');
}
if (manifest.capabilities.network) {
  throw new Error('connect-four has no network path');
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
if (!files['vendor/ai.js'].includes('MAX_DEPTH')) {
  throw new Error('vendor/ai.js is not kenrick95\'s minimax — MAX_DEPTH is missing');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['app.js'].includes('coverShot')) {
  throw new Error('app.js must expose C4.coverShot for the store cover');
}
if (/location\.hash|href\s*=\s*["']#/.test(files['app.js'] + files['index.html'])) {
  throw new Error('no hash navigation — that walks the app out of its frame');
}
if (!files['COPYING-c4.txt'].includes('Kenrick')) {
  throw new Error('COPYING-c4.txt is not kenrick95\'s MIT notice');
}

const listing = JSON.parse(read('listing.json'));
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'CORS', 'COOP', 'Argon2', 'CDN', 'Node']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
const lead = (listing.tagline + '\n' + listing.description).toLowerCase();
if (!/computer/.test(lead) || !/invite|one link|friend/.test(lead) || !/no game server|there is no game server/.test(lead)) {
  throw new Error('listing must lead with computer here / friend from one link / no server');
}
if (!/unofficial/.test(lead) || !/kenrick/.test(lead)) {
  throw new Error('listing must credit kenrick95 as unofficial');
}
if (!/file is the save/.test(lead)) {
  throw new Error('listing must say the file is the save');
}

// Sanity: empty board, AI returns a legal column; a vertical four is a win.
{
  const ctx = { console };
  vm.runInNewContext(
    files['board.js'] + '\n' + files['vendor/ai.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var s = C4.fresh();\n' +
    '  var col = C4.aiColumn(s.map, C4.P2);\n' +
    '  if (col < 0 || col >= C4.COLUMNS) throw new Error("AI column " + col);\n' +
    '  if (!C4.mockDrop(s.map, C4.P2, col).success) throw new Error("AI picked a full column");\n' +
    '  var v = C4.fresh();\n' +
    '  v = C4.drop(v, 0); v = C4.drop(v, 1);\n' +
    '  v = C4.drop(v, 0); v = C4.drop(v, 1);\n' +
    '  v = C4.drop(v, 0); v = C4.drop(v, 1);\n' +
    '  v = C4.drop(v, 0);\n' +
    '  if (v.winner !== C4.P1) throw new Error("vertical four should win");\n' +
    '  var cover = C4.replay(C4.COVER_MOVES);\n' +
    '  if (cover.winner) throw new Error("cover position must not already be won");\n' +
    '  if (!C4.canDrop(cover, 0)) throw new Error("cover must be able to drop column 0");\n' +
    '  var won = C4.drop(cover, 0);\n' +
    '  if (!won || won.winner !== C4.P1) throw new Error("cover column 0 should complete four");\n' +
    '  if (!won.winLine || won.winLine.length < 4) throw new Error("cover win must have a line");\n' +
    '  return col;\n' +
    '})();',
    ctx
  );
}

const shotPath = join(dir, 'screenshot.png');
// Playwright capture (tools/shoot.js) is the store master. Do not clobber it
// with the procedural fallback — that shot is mid-game with four about to land.
if (!existsSync(shotPath) || process.env.C4_SHOT === 'gen') {
  const shot = screenshotPng();
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
  if (shot.length < 1000) throw new Error('screenshot png looks empty');
  writeFileSync(shotPath, shot);
  console.log('wrote apps/connect-four/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB (fallback)');
} else {
  const keep = readFileSync(shotPath);
  if (keep[0] !== 0x89 || keep[1] !== 0x50) throw new Error('screenshot.png is not a PNG');
  if (keep.length < 1000) throw new Error('screenshot.png looks empty');
  console.log('keeping apps/connect-four/screenshot.png (Playwright master)');
}

const bytes = await gif.encode(files, { preview: connectFourIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'connect-four', 'connect-four.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/connect-four/connect-four.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (c4 AI vendored, no network)');
