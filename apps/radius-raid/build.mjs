// Pack apps/radius-raid/ into the finished, downloadable
// site/apps/radius-raid/radius-raid.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which copies vendor/js from the pinned
// upstream and is run only when the pin moves.
//
// Run:  node apps/radius-raid/build.mjs
import { deflateRawSync } from 'node:zlib';
import { radiusRaidIcon, screenshotPng } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const VENDOR = [
  'vendor/js/jsfxr.js',
  'vendor/js/util.js',
  'vendor/js/storage.js',
  'vendor/js/definitions.js',
  'vendor/js/audio.js',
  'vendor/js/text.js',
  'vendor/js/hero.js',
  'vendor/js/enemy.js',
  'vendor/js/bullet.js',
  'vendor/js/explosion.js',
  'vendor/js/powerup.js',
  'vendor/js/particle.js',
  'vendor/js/particleemitter.js',
  'vendor/js/textpop.js',
  'vendor/js/levelpop.js',
  'vendor/js/button.js',
  'vendor/js/game.js',
];
const OURS = ['boot.js', 'touch.js', 'net.js', 'wrap.js'];

for (const f of VENDOR) {
  if (!existsSync(join(dir, f))) {
    throw new Error(f + ' is missing — run node apps/radius-raid/vendor.mjs first (it needs the network).');
  }
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-radius-raid.txt': read('vendor/COPYING-radius-raid.txt'),
};
for (const s of OURS) files[s] = read(s);
for (const s of VENDOR) files[s] = read(s);
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md trimmed length must be >= 400');

const html = files['index.html'];
for (const s of [...OURS, ...VENDOR]) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="touch"')) throw new Error('index.html is missing the twin-stick overlay');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.author && /gifos/i.test(listing.author.name || '')) {
  throw new Error('author is jackrugile, not GifOS');
}
if (!manifest.capabilities || !manifest.capabilities.db || !manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: radiusRaidIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'radius-raid', 'radius-raid.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/radius-raid/radius-raid.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/radius-raid/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
