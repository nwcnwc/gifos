// Pack apps/kana-quiz/ into site/apps/kana-quiz/kana-quiz.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Node 18: CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/kana-quiz/build.mjs
import { kanaQuizIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/kana.js', 'vendor/COPYING-kanaquiz.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — pin lives under vendor/ (offline).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('kana-quiz has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the original is plain JS');
if (manifest.capabilities.pointer) throw new Error('do not declare pointer');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private — solo progress does not leave this device.');
}
if (!manifest.data.match || manifest.data.match.visibility !== 'read-write') {
  throw new Error('manifest.data.match must be read-write — the shared deck has to sync.');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — live score rows have to sync.');
}
if (manifest.appId !== 'kana-quiz') throw new Error('appId must be kana-quiz');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Kana Quiz' ||
    listing.basedOn.url !== 'https://github.com/anzzstuff/kanaquiz') {
  throw new Error('listing.basedOn must name anzzstuff/kanaquiz');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'anzzstuff' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is anzzstuff, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Learning') {
  throw new Error('listing.categories must start with Learning');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/kana-quiz') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'React', 'PWA', 'IndexedDB', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/kana.js': read('vendor/kana.js'),
  'app.js': read('app.js'),
  'COPYING-kanaquiz.txt': read('vendor/COPYING-kanaquiz.txt'),
};

const html = files['index.html'];
if (!html.includes('src="vendor/kana.js"')) throw new Error('index.html does not load vendor/kana.js');
if (!html.includes('src="app.js"')) throw new Error('index.html does not load app.js');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote URL — nothing may be fetched.');
}
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome — do not draw a share button');

for (const n of ['app.js', 'vendor/kana.js']) {
  if (/<\/script/i.test(files[n])) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(files[n])) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (files['app.js'].includes(bad)) throw new Error('app.js uses ' + bad + ' — nothing leaves this tab.');
}
if (!files['app.js'].includes('players') || !files['app.js'].includes('score')) {
  throw new Error('app.js must publish on the players collection');
}
if (!files['app.js'].includes("'firstN'") || !files['app.js'].includes("'deck'")) {
  throw new Error('app.js must offer first-to-N and whole-deck races');
}
if (files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
if (!files['COPYING-kanaquiz.txt'].includes('Antti Pilto')) {
  throw new Error('COPYING-kanaquiz.txt is not anzzstuff/Antti Pilto\'s MIT notice');
}
if (!files['vendor/kana.js'].includes("'し'") || !files['vendor/kana.js'].includes("'shi'")) {
  throw new Error('vendor/kana.js is missing し → shi');
}

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['vendor/kana.js'] + '\n' + files['app.js'], ctx);
  const K = ctx.KanaQuiz;
  if (!K) throw new Error('app.js must export KanaQuiz on the global');
  const basic = K.basicHiragana();
  if (basic.length !== 46) throw new Error('46 basic hiragana, got ' + basic.length);
  const uniq = new Set(basic);
  if (uniq.size !== 46) throw new Error('basic hiragana must be 46 unique, got ' + uniq.size);
  if (!uniq.has('あ') || !uniq.has('ん') || !uniq.has('し')) {
    throw new Error('basic hiragana missing あ / し / ん');
  }
  if (K.romajiOf('し') !== 'shi') throw new Error('し should map to shi, got ' + K.romajiOf('し'));
  if (K.scoreAfter(0, true) !== 1) throw new Error('score increment on correct');
  if (K.scoreAfter(5, false) !== 5) throw new Error('score must not increment on wrong');
  if (K.scoreAfter(7, true) !== 8) throw new Error('score increment on correct from 7');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: kanaQuizIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'kana-quiz', 'kana-quiz.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/kana-quiz/kana-quiz.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (kana tables vendored, no network)');
console.log('wrote apps/kana-quiz/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
