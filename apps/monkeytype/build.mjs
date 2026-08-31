// Pack apps/monkeytype/ into site/apps/monkeytype/monkeytype.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Run:  node apps/monkeytype/build.mjs
import { monkeytypeIcon } from './icon.mjs';
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

for (const need of [
  'vendor/COPYING.txt', 'vendor/data.js', 'engine.js', 'net.js', 'app.js',
  'style.css', 'index.html', 'help.md'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('monkeytype has no network path');
if (manifest.appId !== 'monkeytype') throw new Error('appId must be monkeytype');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private');
}
if (!manifest.data.match || manifest.data.match.visibility !== 'read-write') {
  throw new Error('manifest.data.match must be read-write');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'Monkeytype' || !/monkeytypegame\/monkeytype/.test(listing.basedOn.url)) {
  throw new Error('listing.basedOn must name monkeytypegame/monkeytype');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is Miodec, never GifOS');
if (listing.license !== 'GPL-3.0') throw new Error('listing.license must be GPL-3.0');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (!listing.categories || listing.categories[0] !== 'Learning') {
  throw new Error('listing.categories must start with Learning');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'CORS', 'React', 'localStorage', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const helpMd = read('help.md');
if (helpMd.replace(/^\uFEFF/, '').trim().length < 400) throw new Error('help.md is too short');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/data.js': read('vendor/data.js'),
  'engine.js': read('engine.js'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  'help.md': helpMd,
  'COPYING.txt': read('vendor/COPYING.txt'),
};

const html = files['index.html'];
for (const s of ['vendor/data.js', 'engine.js', 'net.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) throw new Error('index.html uses type=module');
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) throw new Error('index.html loads a remote URL');
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');
if (!html.includes('Invite')) throw new Error('tell the player to press Invite');
if (files['app.js'].includes("id !== 'test' && id !== 'race'")) {
  throw new Error('do not leave #testView up in the race lobby');
}
if (!files['app.js'].includes('coverShot')) {
  throw new Error('app.js must expose Monkeytype.coverShot for the store cover');
}

for (const n of ['engine.js', 'net.js', 'app.js', 'vendor/data.js']) {
  const s = files[n];
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM');
  }
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function(']) {
  if (files['engine.js'].includes(bad) || files['app.js'].includes(bad) || files['net.js'].includes(bad)) {
    throw new Error('packed JS uses ' + bad);
  }
}
if (files['app.js'].includes('localStorage')) throw new Error('no localStorage');
if (files['app.js'].includes('id="invite"')) throw new Error('do not draw a share button');
if (!files['COPYING.txt'].includes('GNU GENERAL PUBLIC LICENSE')) {
  throw new Error('COPYING.txt is not GPL-3');
}
if (/@import|fonts\.google|woff2?/i.test(files['style.css'])) {
  throw new Error('no webfonts');
}

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['vendor/data.js'], ctx);
  vm.runInContext(files['engine.js'], ctx);
  const E = ctx.MonkeyEngine;
  const D = ctx.MT_DATA;
  if (!E || !D) throw new Error('engine.js must export MonkeyEngine');
  if (!D.english || D.english.length !== 200) throw new Error('english must be 200 words');
  if (!D.english_1k || D.english_1k.length !== 1000) throw new Error('english 1k must be 1000 words');
  if (!D.quotes || D.quotes.length < 40) throw new Error('need a quote subset');

  const rng = E.seedFrom(1);
  const words = E.generateWords({ seed: 1, lang: 'english', count: 50 });
  if (words.length !== 50) throw new Error('generateWords count');
  const again = E.generateWords({ seed: 1, lang: 'english', count: 50 });
  if (words.join(' ') !== again.join(' ')) throw new Error('seeded words must repeat');
  const punct = E.generateWords({ seed: 2, lang: 'english', count: 80, punct: true });
  if (!punct.some((w) => /[.,!?;:'"()]/ .test(w))) throw new Error('punctuation should appear');
  const nums = E.generateWords({ seed: 3, lang: 'english', count: 80, numbers: true });
  if (!nums.some((w) => /^\d+$/.test(w))) throw new Error('numbers should appear');

  const q = E.pickQuote({ seed: 4, mode2: 'short' });
  if (!q || !q.text || q.text.length > 100) throw new Error('short quote length');

  if (Math.abs(E.wpmFrom(100, 60000) - 20) > 0.01) throw new Error('100 chars / 60s is 20 wpm');
  const st = E.wordChars('the', 'teh');
  if (st.correct !== 1 || st.incorrect !== 2) throw new Error('wordChars the/teh');
  const extra = E.wordChars('the', 'them');
  if (extra.correct !== 3 || extra.extra !== 1) throw new Error('wordChars extra');
  const miss = E.wordChars('the', 'th');
  if (miss.correct !== 2 || miss.missed !== 1) throw new Error('wordChars missed');

  const t = E.createTest({ mode: 'words', mode2: 10, seed: 9, lang: 'english' });
  if (t.words.length !== 10) throw new Error('words 10');
  let now = 1_000_000;
  const target = t.words[0];
  for (let i = 0; i < target.length; i++) E.typeChar(t, target.charAt(i), now + i * 50);
  E.typeChar(t, ' ', now + 800);
  if (t.wordIndex !== 1) throw new Error('space advances');
  const snap = E.snapshot(t, now + 1000);
  if (snap.chars.correct < target.length) throw new Error('correct chars too low');
  if (snap.wpm <= 0) throw new Error('live wpm should be > 0 after a word');

  const timed = E.createTest({ mode: 'time', mode2: 15, seed: 11 });
  E.typeChar(timed, 'a', 5_000_000);
  E.finish(timed, 5_000_000 + 15_000);
  const ts = E.snapshot(timed, 5_000_000 + 20_000);
  if (ts.ms !== 15000) throw new Error('time mode caps at mode2 seconds');
}

const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath)) {
  throw new Error('screenshot.png missing — run: node apps/monkeytype/tools/shoot.js');
}
{
  const keep = readFileSync(shotPath);
  if (keep[0] !== 0x89 || keep[1] !== 0x50) throw new Error('screenshot.png is not a PNG');
  if (keep.length < 8000) throw new Error('screenshot.png looks empty');
  console.log('keeping existing screenshot.png —', (keep.length / 1024).toFixed(0), 'KB (Playwright master)');
}

{
  const sharp = (await import('sharp')).default;
  const cover = await sharp(shotPath)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  const coverOut = join(dir, '..', '..', 'site', 'apps', 'monkeytype', 'cover.jpg');
  mkdirSync(dirname(coverOut), { recursive: true });
  writeFileSync(coverOut, cover);
  console.log('wrote site/apps/monkeytype/cover.jpg —', (cover.length / 1024).toFixed(0), 'KB');
}

const bytes = await gif.encode(files, { preview: monkeytypeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'monkeytype', 'monkeytype.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/monkeytype/monkeytype.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
