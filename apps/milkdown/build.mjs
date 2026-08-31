// Pack apps/milkdown/ into site/apps/milkdown/milkdown.gif.
import { milkdownIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const pin = (rel, hex) => {
  const buf = readFileSync(join(dir, rel));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== hex) throw new Error(rel + ' sha256 ' + got + ' ≠ pin ' + hex);
  return buf;
};

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const JS_SHA = '7c48ec7072949689d3b9b6b0b4a715dadfc4a75744093591f91a0968f8adaf0b';
pin('vendor/milkdown.js', JS_SHA);

for (const need of [
  'vendor/milkdown.css', 'vendor/COPYING-milkdown.txt', 'vendor/UPSTREAM.txt',
  'help.md', 'app.js', 'mp.js', 'style.css', 'index.html', 'GAUNTLET.md'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'milkdown') throw new Error('appId must be milkdown');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/Milkdown/milkdown') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/milkdown') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'CDN', 'IIFE']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/milkdown.js': read('vendor/milkdown.js'),
  'vendor/milkdown.css': read('vendor/milkdown.css'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-milkdown.txt': read('vendor/COPYING-milkdown.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['vendor/milkdown.js', 'mp.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/milkdown.css"')) throw new Error('missing vendor css');
if (!html.includes('href="style.css"')) throw new Error('missing style.css');
if (!html.includes('tabWrite') || !html.includes('tabSource')) throw new Error('Write/Source tabs missing');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'doc'")) {
  throw new Error('app.js must save the document privately');
}
if (!files['app.js'].includes('Milkdown.create')) throw new Error('app.js must construct Milkdown');
if (!files['COPYING-milkdown.txt'].includes('Mirone')) throw new Error('COPYING must name Mirone');
if (/url\(\s*['"]?https?:/i.test(files['vendor/milkdown.css']) || /fonts\.google/i.test(files['vendor/milkdown.css'])) {
  throw new Error('vendor css fetches remote');
}
if (/url\(\s*['"]?https?:/i.test(files['style.css']) || /@font-face|fonts\.google/i.test(files['style.css'])) {
  throw new Error('style.css fetches a font');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: milkdownIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'milkdown', 'milkdown.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/milkdown/milkdown.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
