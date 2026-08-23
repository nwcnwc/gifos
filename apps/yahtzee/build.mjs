// Pack apps/yahtzee/ into the finished, downloadable
// site/apps/yahtzee/yahtzee.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// Alhissar/Yahtzee commit and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/yahtzee/build.mjs
import { yahtzeeIcon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/Card.js', 'vendor/Dices.js', 'vendor/Player.js', 'vendor/functions.js',
  'vendor/main.css', 'vendor/COPYING-yahtzee.txt',
  'vendor/images/colors_small.png', 'vendor/images/numbers.png', 'vendor/images/scores.jpg',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/yahtzee/vendor.mjs first (it needs the network).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('yahtzee has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the original is plain JS');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the solo game does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — live scores have to sync.');
}
if (manifest.appId !== 'yahtzee') throw new Error('appId must be yahtzee');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Yahtzee' || listing.basedOn.url !== 'https://github.com/Alhissar/Yahtzee') {
  throw new Error('listing.basedOn must name Alhissar/Yahtzee');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'Alhissar' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Alhissar, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/yahtzee') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = [
  'vendor/Card.js',
  'vendor/Dices.js',
  'vendor/Player.js',
  'vendor/functions.js',
  'scores.js',
  'storage.js',
  'rules.js',
  'mp.js',
  'app.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'vendor/main.css': read('vendor/main.css'),
  'style.css': read('style.css'),
  'COPYING-yahtzee.txt': read('vendor/COPYING-yahtzee.txt'),
  'vendor/images/colors_small.png': bin('vendor/images/colors_small.png'),
  'vendor/images/numbers.png': bin('vendor/images/numbers.png'),
  'vendor/images/scores.jpg': bin('vendor/images/scores.jpg'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/main.css"')) throw new Error('index.html does not load vendor/main.css');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('src="vendor/images/colors_small.png"') || !html.includes('src="vendor/images/numbers.png"')) {
  throw new Error('index.html must load the colour and number sheets as <img>');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /^export\s/m.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}
if (files['vendor/main.css'].match(/url\(\s*(['"]?)(?!data:)[^'")]+/)) {
  throw new Error('vendor/main.css still has a relative url() — images would 404 once inlined');
}
if (!files['COPYING-yahtzee.txt'].includes('Alhissar')) {
  throw new Error('COPYING-yahtzee.txt is not Alhissar\'s MIT notice');
}
if (!files['mp.js'].includes("db('room')")) {
  throw new Error('mp.js must use gifos.db room');
}
if (!files['mp.js'].includes('Invite')) {
  throw new Error('mp.js must tell the player to press Invite');
}
if (files['mp.js'].includes('id="invite"') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (files['app.js'].includes(bad)) throw new Error('app.js uses ' + bad);
  if (files['mp.js'].includes(bad)) throw new Error('mp.js uses ' + bad);
  if (files['storage.js'].includes(bad)) throw new Error('storage.js uses ' + bad);
  if (files['scores.js'].includes(bad)) throw new Error('scores.js uses ' + bad);
  if (files['rules.js'].includes(bad)) throw new Error('rules.js uses ' + bad);
}
if (files['rules.js'].includes('id="invite"')) throw new Error('Invite is OS chrome — do not draw a share button');
if (!files['rules.js'].includes('KEEP')) throw new Error('rules.js must tap-to-keep');

if (!files['scores.js'].includes('UPPER_BONUS: 35')) throw new Error('scores.js must award +35 at 63');
if (!files['scores.js'].includes('FULL_HOUSE: 25')) throw new Error('full house is 25');
if (!files['scores.js'].includes('YAHTZEE: 50')) throw new Error('yahtzee is 50');

if (!html.includes('id="rollBtn"')) throw new Error('a Roll button is required — the deck is easy to miss on a phone');
if (!html.includes('die-hit')) throw new Error('non-overlapping die hit targets are required — the fan stacks canvases');
if (!html.includes('Ones') || !html.includes('Full house') || !html.includes('Chance')) {
  throw new Error('scorecard must use English names, not Brelan/Carré');
}
if (/Brelan|Carré/.test(html)) throw new Error('French Yams names leaked into the scorecard');
if (!listing.tagline.toLowerCase().includes('meeting') && !listing.tagline.toLowerCase().includes('invite')) {
  throw new Error('listing tagline must lead with the table / invite');
}
if (!listing.description.toLowerCase().includes('not a hasbro')) {
  throw new Error('listing must keep Hasbro credit honest — unofficial, not a Hasbro product');
}

// Official box values. Wrong scores fail the round. No DOM.
{
  const ctx = { globalThis: {}, window: {} };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files['scores.js'], ctx);
  vm.runInContext(
    'result = (function () {\n' +
    '  var S = YahtzeeScores;\n' +
    '  function hand() { return Array.prototype.map.call(arguments, function (n) { return { number: n }; }); }\n' +
    '  var y = S.preview(hand(6, 6, 6, 6, 6));\n' +
    '  if (y.yahtzee !== 50) throw new Error("yahtzee " + y.yahtzee);\n' +
    '  if (y.fh !== 0) throw new Error("yahtzee is not a full house");\n' +
    '  if (y.three !== 30 || y.four !== 30 || y.chance !== 30) throw new Error("yahtzee sums");\n' +
    '  var fh = S.preview(hand(2, 2, 5, 5, 5));\n' +
    '  if (fh.fh !== 25) throw new Error("full house " + fh.fh);\n' +
    '  if (fh.three !== 19) throw new Error("full house 3oak is the sum");\n' +
    '  if (fh.four !== 0) throw new Error("full house is not 4oak");\n' +
    '  var lg = S.preview(hand(1, 2, 3, 4, 5));\n' +
    '  if (lg.lg !== 40 || lg.sm !== 30) throw new Error("large straight");\n' +
    '  var sm = S.preview(hand(1, 2, 3, 4, 6));\n' +
    '  if (sm.sm !== 30 || sm.lg !== 0) throw new Error("small straight");\n' +
    '  var oak = S.preview(hand(1, 1, 1, 4, 6));\n' +
    '  if (oak.three !== 13 || oak.four !== 0 || oak.upper[0] !== 3) throw new Error("three ones");\n' +
    '  if (S.upperBonus(62) !== 0 || S.upperBonus(63) !== 35) throw new Error("upper bonus");\n' +
    '  if (S.EXTRA_YAHTZEE !== 100) throw new Error("extra yahtzee");\n' +
    '  return y.yahtzee;\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 50) throw new Error('scoring smoke test did not return 50');
}

// Detection still agrees with Dices (five sixes is a Yahtzee, 2+3 is a full house).
{
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(files['vendor/Dices.js'], ctx);
  vm.runInContext(
    'result = (function () {\n' +
    '  var d = Object.create(Dices.prototype);\n' +
    '  d.result = [0, 0, 0, 0, 0, 0];\n' +
    '  d.ordered = [];\n' +
    '  function hand() { return Array.prototype.map.call(arguments, function (n) { return { number: n, color: 0 }; }); }\n' +
    '  var y = d.yahtzee(hand(6, 6, 6, 6, 6));\n' +
    '  if (!y || y.nb !== 5 || y.dice !== 6) throw new Error("yahtzee " + JSON.stringify(y));\n' +
    '  if (!d.isFull(hand(2, 2, 5, 5, 5))) throw new Error("full house");\n' +
    '  if (d.isFull(hand(1, 2, 3, 4, 5))) throw new Error("straight is not a full house");\n' +
    '  if (d.isStraight(hand(1, 2, 3, 4, 5)) !== 2) throw new Error("large straight");\n' +
    '  if (d.isStraight(hand(1, 2, 3, 4, 6)) !== 1) throw new Error("small straight");\n' +
    '  var same = d.sameDice(hand(1, 1, 1, 4, 6));\n' +
    '  if (same[0] !== 3) throw new Error("three ones");\n' +
    '  return y.nb;\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 5) throw new Error('detection smoke test did not return 5');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: yahtzeeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'yahtzee', 'yahtzee.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/yahtzee/yahtzee.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (original Yahtzee + a table, no network)');
console.log('wrote apps/yahtzee/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
