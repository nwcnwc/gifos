// Pack apps/js-gauntlet/ into site/apps/js-gauntlet/js-gauntlet.gif
// Run:  node apps/js-gauntlet/build.mjs
import { gauntletIcon, screenshotPng } from './icon.mjs';
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

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/vendor.js', 'vendor/game.js', 'vendor/gauntlet.js',
  'vendor/assets.js', 'vendor/gauntlet.css', 'vendor/normalize.css',
  'vendor/COPYING.txt',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/js-gauntlet/vendor.mjs first.');
  }
}

const SCRIPTS = [
  'vendor/vendor.js', 'vendor/assets.js', 'vendor/game.js', 'vendor/gauntlet.js',
  'boot.js', 'net.js', 'touch.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/normalize.css': read('vendor/normalize.css'),
  'vendor/gauntlet.css': read('vendor/gauntlet.css'),
  'COPYING.txt': read('vendor/COPYING.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is too short (' + help.length + ')');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare db + multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.capabilities.network) throw new Error('no network');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('blessed must be false');
if ((listing.author && listing.author.name) === 'GifOS') throw new Error('author is THEM');
if (listing.homepage && !listing.homepage.includes('js-gauntlet')) {
  throw new Error('slug must be js-gauntlet');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: gauntletIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'js-gauntlet', 'js-gauntlet.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/js-gauntlet/js-gauntlet.gif —', bytes.length, 'bytes,',
            (bytes.length / 1024).toFixed(0), 'KB, from', Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
