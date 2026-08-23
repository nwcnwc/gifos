// Pack apps/racer/ into the finished, downloadable
// site/apps/racer/racer.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Run:  node apps/racer/build.mjs
import { racerIcon, screenshotPng } from './icon.mjs';
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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

for (const need of ['vendor/common.js', 'images/sprites.png', 'images/background.png', 'index.html']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const SCRIPTS = ['vendor/common.js', 'game.js', 'net.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'images/background.png': readBin('images/background.png'),
  'images/sprites.png': readBin('images/sprites.png'),
  // Notices ride INSIDE the GIF: a copy someone is handed is a distribution
  // of Jake Gordon's MIT work.
  'COPYING.txt': read('vendor/COPYING.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('src="images/background.png"')) throw new Error('index.html is missing the background <img>');
if (!html.includes('src="images/sprites.png"')) throw new Error('index.html is missing the sprites <img>');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.pointer) {
  throw new Error('Racer does not use pointer lock — do not declare capabilities.pointer');
}
if (manifest.capabilities.network) {
  throw new Error('Racer has no network path. Do not declare capabilities.network.');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string') continue;
  if (/<\/script/i.test(s) && n.endsWith('.js')) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: racerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'racer', 'racer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/racer/racer.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/racer/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
