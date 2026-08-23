// Pack apps/falling-blocks/ into the finished, downloadable
// site/apps/falling-blocks/falling-blocks.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// canvas-tetris commit and is run only when the pin moves.
//
// Run:  node apps/falling-blocks/build.mjs
import { fallingBlocksIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
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
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

if (!existsSync(join(dir, 'vendor', 'tetris.js'))) {
  throw new Error('vendor/tetris.js is missing — run node apps/falling-blocks/vendor.mjs first (it needs the network).');
}

const SCRIPTS = [
  'vendor/tetris.js',
  'vendor/render.js',
  'vendor/controller.js',
  'app.js',
  'mp.js',
  'touch.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-canvas-tetris.txt': read('vendor/COPYING-canvas-tetris.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (manifest.name !== 'Falling Blocks') throw new Error('manifest.name must be Falling Blocks');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — the save lives in gifos.db.');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer — Play a friend is a room.');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the solo best does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — live scores have to sync.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('falling-blocks has no network path');

const listing = JSON.parse(read('listing.json'));
if (listing.basedOn?.name !== 'canvas-tetris') {
  throw new Error('listing.basedOn.name must be canvas-tetris');
}
if (/\bTetris\b/.test(html) || /\bTetris\b/.test(manifest.name) || /\bTetris\b/.test(listing.tagline) || /\bTetris\b/.test(listing.description.split('unofficial')[0])) {
  throw new Error('user-facing copy must not brand as Tetris');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: fallingBlocksIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'falling-blocks', 'falling-blocks.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/falling-blocks/falling-blocks.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (original canvas-tetris + friend-mode, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
