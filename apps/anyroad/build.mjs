// Pack apps/anyroad/ source into the finished, downloadable
// site/apps/anyroad/anyroad.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Run:  node apps/anyroad/build.mjs
import { anyroadIcon } from './icon.mjs';
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

// Script order matters: each module attaches itself to window and the ones
// after it read what came before. index.html lists them in the same order.
const SCRIPTS = ['host.js', 'geo.js', 'sources.js', 'net.js', 'terrain.js',
                 'roads.js', 'render.js', 'car.js', 'animals.js', 'traffic.js', 'blaster.js', 'sound.js', 'mp.js', 'ui.js', 'app.js'];

const files = { 'manifest.json': JSON.stringify(manifest),
                'index.html': read('index.html'),
                'style.css': read('style.css') };
for (const s of SCRIPTS) files[s] = read(s);

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md is too short');

// The runtime inlines every <script src> it finds by rewriting the tag, so a
// script the HTML never references would travel in the GIF and never run.
// Catching that here is much cheaper than catching it as a blank app.
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

const bytes = await gif.encode(files, { preview: anyroadIcon(), accent: manifest.accent });
// Into the PUBLISH boundary: site/ is what GitHub Pages serves, so a GIF
// anywhere else is not downloadable (see apps/README.md).
const out = join(dir, '..', '..', 'site', 'apps', 'anyroad', 'anyroad.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/anyroad/anyroad.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
