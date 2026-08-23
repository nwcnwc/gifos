// Pack apps/hangman/ into site/apps/hangman/hangman.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/hangman/build.mjs
import { hangmanIcon, screenshotPng } from './icon.mjs';
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
  'vendor/hangman.js', 'vendor/COPYING-hangman.txt',
  'vendor/images/0.jpg', 'vendor/images/1.jpg', 'vendor/images/2.jpg',
  'vendor/images/3.jpg', 'vendor/images/4.jpg', 'vendor/images/5.jpg',
  'vendor/images/6.jpg',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — pin lives under vendor/ (offline).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('hangman has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the original is plain JS');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private — the solo game does not leave this device.');
}
if (!manifest.data.match || manifest.data.match.visibility !== 'read-write') {
  throw new Error('manifest.data.match must be read-write — the shared word has to sync.');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — live rows have to sync.');
}
if (manifest.appId !== 'hangman') throw new Error('appId must be hangman');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Vanilla Javascript Hangman Game' ||
    listing.basedOn.url !== 'https://github.com/simonjsuh/Vanilla-Javascript-Hangman-Game') {
  throw new Error('listing.basedOn must name simonjsuh/Vanilla-Javascript-Hangman-Game');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'simonjsuh' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is simonjsuh, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/hangman') {
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
  'app.js': read('app.js'),
  'COPYING-hangman.txt': read('vendor/COPYING-hangman.txt'),
};
for (let i = 0; i <= 6; i++) {
  const name = 'images/' + i + '.jpg';
  const buf = bin('vendor/images/' + i + '.jpg');
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error(name + ' is not a PNG (upstream named them .jpg)');
  files[name] = buf;
}

{
  if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide.');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
if (!html.includes('src="app.js"')) throw new Error('index.html does not load app.js');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="gallows"') || !html.includes('data-part="1"')) {
  throw new Error('index.html must draw an SVG gallows with staged parts');
}
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote URL — nothing may be fetched.');
}
if (/href\s*=\s*["']#/.test(html)) {
  throw new Error('index.html has href="#" — hash escape is a failed round');
}
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome — do not draw a share button');

if (/<\/script/i.test(files['app.js'])) throw new Error('app.js contains </script — cannot inline safely');
if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(files['app.js'])) {
  throw new Error('app.js uses ESM syntax — classic scripts only (runtime drops type=module).');
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (files['app.js'].includes(bad)) throw new Error('app.js uses ' + bad + ' — nothing leaves this tab.');
}
if (files['app.js'].includes('location.hash') || files['app.js'].includes('location.replace') ||
    files['app.js'].includes('location.href')) {
  throw new Error('app.js must not navigate — hash escape is a failed round');
}
if (!files['app.js'].includes('players') || !files['app.js'].includes('guessed')) {
  throw new Error('app.js must publish on the players collection');
}
if (!files['app.js'].includes("'race'") || !files['app.js'].includes("'share'")) {
  throw new Error('app.js must offer race and shared-gallows modes');
}
if (!files['app.js'].includes('qwertyuiop') || !files['app.js'].includes('asdfghjkl')) {
  throw new Error('keyboard must be QWERTY — a 7-column A–Z grid is unusable on a phone');
}
if (files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
if (!files['COPYING-hangman.txt'].includes('simonjsuh')) {
  throw new Error('COPYING-hangman.txt is not simonjsuh\'s MIT notice');
}

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['app.js'], ctx);
  const R = ctx.HangmanRules;
  if (!R) throw new Error('app.js must export HangmanRules on the global');
  if (R.words.length !== 14) throw new Error('word list must be the original 14, got ' + R.words.length);
  if (R.maxWrong !== 6) throw new Error('maxWrong must be 6');
  if (R.spotlight('python', ['p', 'y']) !== 'py____') throw new Error('spotlight');
  if (R.wrongOf('python', ['p', 'x', 'z']).length !== 2) throw new Error('wrong count');
  if (!R.wonOf('python', 'python'.split(''))) throw new Error('win');
  if (!R.lostOf('python', ['a', 'b', 'd', 'e', 'f', 'g'])) throw new Error('lose');
  if (R.lostOf('python', ['a', 'b', 'd', 'e', 'f'])) throw new Error('five wrong is not lost');
  if (!R.words.includes('javascript') || !R.words.includes('csharp')) {
    throw new Error('original word list drifted');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hangmanIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hangman', 'hangman.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hangman/hangman.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (frames in-GIF, no network)');
console.log('wrote apps/hangman/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
