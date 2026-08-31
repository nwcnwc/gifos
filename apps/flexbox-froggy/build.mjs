// Pack apps/flexbox-froggy/ into site/apps/flexbox-froggy/flexbox-froggy.gif
import { froggyIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

{
  const lv = read('vendor/levels.js');
  const n = (lv.match(/"name":/g) || []).length;
  if (n !== 25) throw new Error('expected 24 levels + win, got name-count ' + n);
  if (!lv.includes('justify-content 1') || !lv.includes('align-content 4')) {
    throw new Error('level extract is missing the first or last puzzle');
  }
}
if (!existsSync(join(dir, 'vendor', 'levels.js'))) throw new Error('vendor/levels.js missing');
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');

const images = readdirSync(join(dir, 'vendor', 'images')).filter((n) => n.endsWith('.svg'));
if (images.length < 12) throw new Error('expected 12 frog/lilypad SVGs');

function dataUrl(rel) {
  const svg = readFileSync(join(dir, rel));
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg.toString('utf8')) + '")';
}
let css = read('style.css');
css = css.replace(/url\("vendor\/images\/([^"]+)"\)/g, (_, n) => dataUrl('vendor/images/' + n));
if (css.includes('vendor/images/')) throw new Error('CSS still has a relative image url');

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
if (/invite|gifos\.db|localStorage|sandbox/i.test(helpMd)) {
  throw new Error('help.md must not mention Invite / gifos.db / localStorage / sandbox');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (listing.author && listing.author.name === 'GifOS') throw new Error('author is Thomas Park, not GifOS');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (!listing.porter) throw new Error('porter required');

const SCRIPTS = ['vendor/levels.js', 'game.js', 'net.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': css,
  'vendor/levels.js': read('vendor/levels.js'),
  'game.js': read('game.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING-flexboxfroggy.txt': read('vendor/COPYING-flexboxfroggy.txt'),
  'COPYING-images.txt': read('vendor/COPYING-images.txt'),
};
for (const n of images) {
  files['vendor/images/' + n] = readFileSync(join(dir, 'vendor', 'images', n));
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.data || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/localStorage/.test(s) && n !== 'vendor/levels.js') {
    throw new Error(n + ' mentions localStorage');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: froggyIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'flexbox-froggy', 'flexbox-froggy.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/flexbox-froggy/flexbox-froggy.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
