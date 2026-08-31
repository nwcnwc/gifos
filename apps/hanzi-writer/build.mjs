// Pack apps/hanzi-writer/ into site/apps/hanzi-writer/hanzi-writer.gif.
import { hanziWriterIcon, screenshotPng } from './icon.mjs';
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
  'vendor/hanzi-writer.min.js', 'vendor/chars.js',
  'vendor/COPYING-hanzi-writer.txt', 'vendor/ARPHICPL.TXT'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('hanzi-writer has no network path');
if (manifest.appId !== 'hanzi-writer') throw new Error('appId must be hanzi-writer');
if (!manifest.launch || !manifest.launch.char) throw new Error('manifest.launch.char is required');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'Hanzi Writer' ||
    listing.basedOn.url !== 'https://github.com/chanind/hanzi-writer') {
  throw new Error('listing.basedOn must name chanind/hanzi-writer');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is David Chanin, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Learning') {
  throw new Error('listing.categories must start with Learning');
}
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/hanzi-writer') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/hanzi-writer.min.js': read('vendor/hanzi-writer.min.js'),
  'vendor/chars.js': read('vendor/chars.js'),
  'app.js': read('app.js'),
  'COPYING-hanzi-writer.txt': read('vendor/COPYING-hanzi-writer.txt'),
  'ARPHICPL.TXT': read('vendor/ARPHICPL.TXT'),
};
{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md trimmed length is ' + help.length);
  files['help.md'] = help + '\n';
}

const html = files['index.html'];
if (!html.includes('src="vendor/hanzi-writer.min.js"')) throw new Error('index.html must load hanzi-writer');
if (!html.includes('src="vendor/chars.js"')) throw new Error('index.html must load chars.js');
if (!html.includes('src="app.js"')) throw new Error('index.html must load app.js');
if (/type\s*=\s*["']module["']/.test(html)) throw new Error('classic scripts only');
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) throw new Error('no remote URLs');
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');
if (!html.includes('id="lobby"')) throw new Error('must have a race lobby');
if (!html.includes('id="writer"')) throw new Error('must have a writer target');
if (!html.includes('touch-action') && !files['style.css'].includes('touch-action: none')) {
  throw new Error('quiz stage must set touch-action: none');
}

for (const n of ['app.js', 'vendor/chars.js']) {
  if (/<\/script/i.test(files[n])) throw new Error(n + ' contains </script');
}
if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(files['app.js'])) {
  throw new Error('app.js uses ESM — classic scripts only');
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function(']) {
  if (files['app.js'].includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!files['app.js'].includes('charDataLoader')) {
  throw new Error('app.js must pass charDataLoader — never hit the CDN');
}
if (!files['app.js'].includes("renderer: 'canvas'") && !files['app.js'].includes('renderer:"canvas"')) {
  throw new Error('app.js must use the canvas renderer');
}
if (!files['app.js'].includes('players')) throw new Error('app.js must publish on players');
if (files['app.js'].includes('location.hash') || files['app.js'].includes('location.replace') ||
    files['app.js'].includes('location.href')) {
  throw new Error('app.js must not navigate');
}
if (!files['COPYING-hanzi-writer.txt'].includes('David Chanin')) {
  throw new Error('COPYING-hanzi-writer.txt is not David Chanin MIT');
}
if (!files['ARPHICPL.TXT'].includes('ARPHIC PUBLIC LICENSE')) {
  throw new Error('ARPHICPL.TXT missing');
}

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['vendor/chars.js'] + '\n' + files['app.js'], ctx);
  const Q = ctx.HanziQuiz;
  if (!Q) throw new Error('app.js must export HanziQuiz');
  if (Q.count() < 600) throw new Error('need 600+ characters, got ' + Q.count());
  if (!Q.hasChar('好') || !Q.hasChar('一') || !Q.hasChar('永')) {
    throw new Error('missing 好 / 一 / 永');
  }
  const hsk1 = Q.levelChars(1);
  if (hsk1.length < 150) throw new Error('HSK 1 too small: ' + hsk1.length);
  if (Q.lexOf('好').p !== 'hǎo') throw new Error('好 pinyin should be hǎo, got ' + Q.lexOf('好').p);
  if (Q.lexOf('一').m !== 'one') throw new Error('一 gloss should be one');
  if (Q.lexOf('好').h !== 1) throw new Error('好 should be HSK 1');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hanziWriterIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hanzi-writer', 'hanzi-writer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hanzi-writer/hanzi-writer.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (HSK 1–3 vendored, no network)');
console.log('wrote apps/hanzi-writer/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
