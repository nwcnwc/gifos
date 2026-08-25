// Pack apps/vintage-poker/ into site/apps/vintage-poker/vintage-poker.gif
import { pokerIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const SCRIPTS = ['poker.js', 'app.js'];
if (!existsSync(join(dir, 'vendor', 'COPYING-vintage-poker.txt'))) throw new Error('COPYING');
if (!existsSync(join(dir, 'vendor', 'UPSTREAM.txt'))) throw new Error('UPSTREAM');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'poker.js': read('poker.js'),
  'app.js': read('app.js'),
  'COPYING-vintage-poker.txt': read('vendor/COPYING-vintage-poker.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error(s);
if (/type=["']module["']/.test(html)) throw new Error('module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('url');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite');
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('network');
if (manifest.data.save.visibility !== 'private' || manifest.data.room.visibility !== 'read-write') {
  throw new Error('data');
}
if (!listing.basedOn || listing.basedOn.blessed !== false || listing.basedOn.name !== 'Vintage Poker') {
  throw new Error('basedOn');
}
if (!listing.author || /gifos/i.test(listing.author.name) || listing.porter.name !== 'GifOS') throw new Error('credits');
if (listing.license !== 'MIT' || listing.releaseDate !== '2026-08-24') throw new Error('listing');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/vintage-poker') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error(bad);
}
if (!files['COPYING-vintage-poker.txt'].includes('Patrick Obermeier')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("db('room')")) throw new Error('db');
if (!files['app.js'].includes('Invite')) throw new Error('Invite copy');
if (/>\s*Invite\s*</.test(files['index.html']) || /id=["']invite/i.test(files['index.html'])) {
  throw new Error('in-app Invite');
}
if (!files['app.js'].includes('if (roomDb && !owner) mpEnter()')) throw new Error('guests must sit');
if (!files['style.css'].includes('min-height:48px')) throw new Error('phone targets');
if (!files['style.css'].includes('[hidden]{display:none !important}')) throw new Error('hidden');
if (/class="card[\s"]/.test(files['index.html'])) throw new Error('setup is not a playing card');
if (!files['app.js'].includes("t.phase !== 'showdown' && t.phase !== 'idle'")) throw new Error('chips persist at hand end');
if (/socket\.io|express|mongoose|pokersolver|lodash/i.test(files['app.js'] + files['poker.js'])) {
  throw new Error('their server stays behind');
}
if (!/^Texas Hold'em/.test(listing.description)) throw new Error('listing must lead with the game');
if (!/takes a seat/i.test(listing.description) || !/host deals/i.test(listing.description)) {
  throw new Error('listing must say friends take seats and the host deals');
}
if (/gifos\.db|sandbox|localStorage|WebRTC/.test(files['help.md'])) throw new Error('help internals');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = { console, Math };
  vm.runInNewContext(
    files['poker.js'] + '\n' +
    'result = (function () {\n' +
    '  var d = PK.makeDeck();\n' +
    '  if (d.length !== 52) throw new Error("deck " + d.length);\n' +
    '  var c = function (r, s) { return { r: r, s: s }; };\n' +
    '  var rf = PK.eval5([c(14,"s"),c(13,"s"),c(12,"s"),c(11,"s"),c(10,"s")]);\n' +
    '  if (rf.cat !== 9) throw new Error("royal " + rf.cat);\n' +
    '  var sf = PK.eval5([c(9,"h"),c(8,"h"),c(7,"h"),c(6,"h"),c(5,"h")]);\n' +
    '  if (sf.cat !== 8) throw new Error("sf " + sf.cat);\n' +
    '  var quad = PK.eval5([c(14,"s"),c(14,"h"),c(14,"d"),c(14,"c"),c(2,"s")]);\n' +
    '  if (quad.cat !== 7) throw new Error("quad");\n' +
    '  var fh = PK.eval5([c(8,"s"),c(8,"h"),c(8,"d"),c(3,"c"),c(3,"s")]);\n' +
    '  if (fh.cat !== 6) throw new Error("boat");\n' +
    '  var fl = PK.eval5([c(14,"d"),c(10,"d"),c(7,"d"),c(6,"d"),c(2,"d")]);\n' +
    '  if (fl.cat !== 5) throw new Error("flush");\n' +
    '  var st = PK.eval5([c(14,"s"),c(2,"h"),c(3,"d"),c(4,"c"),c(5,"s")]);\n' +
    '  if (st.cat !== 4) throw new Error("wheel " + st.cat);\n' +
    '  var trips = PK.eval5([c(9,"s"),c(9,"h"),c(9,"d"),c(4,"c"),c(2,"s")]);\n' +
    '  if (trips.cat !== 3) throw new Error("trips");\n' +
    '  var tp = PK.eval5([c(11,"s"),c(11,"h"),c(4,"d"),c(4,"c"),c(2,"s")]);\n' +
    '  if (tp.cat !== 2) throw new Error("two pair");\n' +
    '  var pr = PK.eval5([c(14,"s"),c(14,"h"),c(9,"d"),c(4,"c"),c(2,"s")]);\n' +
    '  if (pr.cat !== 1) throw new Error("pair");\n' +
    '  var hc = PK.eval5([c(14,"s"),c(12,"h"),c(9,"d"),c(4,"c"),c(2,"s")]);\n' +
    '  if (hc.cat !== 0) throw new Error("high");\n' +
    '  if (rf.score <= sf.score) throw new Error("royal beats sf");\n' +
    '  var t = PK.newTable();\n' +
    '  PK.sit(t, "a", "A", 1000, false);\n' +
    '  PK.sit(t, "b", "B", 1000, false);\n' +
    '  var rng = (function () { var x = 1; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; })();\n' +
    '  if (!PK.startHand(t, rng)) throw new Error("deal");\n' +
    '  if (t.phase !== "preflop") throw new Error("phase " + t.phase);\n' +
    '  if (t.seats[0].hand.length !== 2 || t.seats[1].hand.length !== 2) throw new Error("hole");\n' +
    '  var L = PK.legal(t, t.toAct);\n' +
    '  if (!L.fold) throw new Error("legal");\n' +
    '  PK.applyAction(t, t.toAct, "fold");\n' +
    '  if (t.phase !== "showdown") throw new Error("fold wins " + t.phase);\n' +
    '  if (!t.winners.length) throw new Error("winner");\n' +
    '  var t2 = PK.newTable();\n' +
    '  PK.sit(t2, "a", "A", 1000, false);\n' +
    '  PK.sit(t2, "b", "B", 1000, false);\n' +
    '  if (!PK.startHand(t2, rng)) throw new Error("deal2");\n' +
    '  var g = 0;\n' +
    '  while (t2.phase !== "showdown" && g++ < 80) {\n' +
    '    var L2 = PK.legal(t2, t2.toAct);\n' +
    '    if (!PK.applyAction(t2, t2.toAct, L2.toCall > 0 ? "call" : "check")) throw new Error("act");\n' +
    '  }\n' +
    '  if (t2.phase !== "showdown") throw new Error("calldown " + t2.phase);\n' +
    '  if (t2.board.length !== 5) throw new Error("board " + t2.board.length);\n' +
    '  var sum = t2.pot; t2.seats.forEach(function (s) { sum += s.stack; });\n' +
    '  if (sum !== 2000) throw new Error("chips " + sum);\n' +
    '  return PK.label({ r: 14, s: "s" });\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 'A♠') throw new Error('poker self-test ' + ctx.result);
  console.log('holdem ranking + deal ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: pokerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'vintage-poker', 'vintage-poker.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/vintage-poker/vintage-poker.gif —', bytes.length, 'bytes');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
