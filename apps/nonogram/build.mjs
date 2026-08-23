// Pack apps/nonogram/ into site/apps/nonogram/nonogram.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/nonogram/build.mjs
import { nonogramIcon, screenshotPng } from './icon.mjs';
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
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/nonogram.js', 'vendor/COPYING-nonogram.txt',
  'puzzles.js', 'mp.js', 'app.js', 'index.html', 'style.css',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — pin lives under vendor/ (offline).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('nonogram has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the original is plain JS');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the solo game does not leave this device.');
}
if (!manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — live rows have to sync.');
}
if (!manifest.data.race || manifest.data.race.visibility !== 'read-write') {
  throw new Error('manifest.data.race must be read-write — the shared puzzle has to sync.');
}
if (manifest.appId !== 'nonogram') throw new Error('appId must be nonogram');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Nonogram' ||
    listing.basedOn.url !== 'https://github.com/HandsomeOne/Nonogram') {
  throw new Error('listing.basedOn must name HandsomeOne/Nonogram');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'HandsomeOne' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is HandsomeOne, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/nonogram') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'nonogram.js': read('vendor/nonogram.js'),
  'puzzles.js': read('puzzles.js'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-nonogram.txt': read('vendor/COPYING-nonogram.txt'),
};

const html = files['index.html'];
const SCRIPTS = ['nonogram.js', 'puzzles.js', 'mp.js', 'app.js'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="board"') || !html.includes('<canvas')) {
  throw new Error('index.html must have a canvas#board');
}
if (!html.includes('id="fillBtn"') || !html.includes('id="crossBtn"')) {
  throw new Error('touch fill/cross pad is required');
}
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote URL — nothing may be fetched.');
}
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome — do not draw a share button');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}
if (!files['nonogram.js'].includes('touchstart')) {
  throw new Error('nonogram.js must handle touch — upstream only wired mouse');
}
if (!files['mp.js'].includes("db('players')") || !files['mp.js'].includes('deal')) {
  throw new Error('race must publish on players and deal a shared puzzle');
}
if (!files['app.js'].includes('fillBtn') || !files['app.js'].includes('crossBtn')) {
  throw new Error('app.js must wire Fill and Cross for a finger');
}
if (!files['COPYING-nonogram.txt'].includes('Zhou Qi')) {
  throw new Error('COPYING-nonogram.txt is not Zhou Qi\'s MIT notice');
}

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['puzzles.js'], ctx);
  const P = ctx.NGPuzzles;
  if (!P) throw new Error('puzzles.js must export NGPuzzles on the global');
  if (P.SIZES.join(',') !== '5,8,10,15') throw new Error('sizes must be 5,8,10,15');
  const plus = P.pick(5, 0);
  if (P.countFilled(plus.grid) !== 9) throw new Error('first 5×5 must be the plus (9 filled)');
  const h = P.hintsOf(plus.grid);
  if (h.row.map((r) => r.join(',')).join('|') !== '1|1|5|1|1') throw new Error('plus row hints');
  if (h.column.map((c) => c.join(',')).join('|') !== '1|1|5|1|1') throw new Error('plus col hints');
  const a = P.generate(8, 8, 42, 0.55);
  const b = P.generate(8, 8, 42, 0.55);
  if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) throw new Error('generator must be deterministic');
  if (P.pick(10, 0).filled < 20) throw new Error('10×10 heart looks empty');
  const prog = P.progress(plus.grid, plus.grid);
  if (prog.filled !== prog.total || prog.filled !== 9) throw new Error('progress of a solved plus');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: nonogramIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'nonogram', 'nonogram.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/nonogram/nonogram.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (frames in-GIF, no network)');
console.log('wrote apps/nonogram/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
