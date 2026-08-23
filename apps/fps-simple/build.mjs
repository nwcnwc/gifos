// Pack apps/fps-simple/ into the finished, downloadable
// site/apps/fps-simple/fps-simple.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/game.js from the
// pinned upstream and is run only when the pin moves.
//
// Run:  node apps/fps-simple/build.mjs
import { fpsSimpleIcon } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'game.js'))) {
  throw new Error('vendor/game.js is missing — run node apps/fps-simple/vendor.mjs first (it needs the network).');
}

// Script order matters: each file attaches itself to window and the ones after
// it read what came before. index.html lists them in the same order, and the
// runtime inlines each <script src> where it stands.
const SCRIPTS = ['vendor/game.js', 'texcache.js', 'meshcache.js', 'voicecache.js', 'framelog.js', 'net.js', 'remote.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  // The licences ride INSIDE the GIF, not just beside it in the repo. A copy of
  // this app that someone was handed is a distribution of both MIT works, and
  // has to carry their notices with it.
  'COPYING-claude-of-duty.txt': read('vendor/COPYING-claude-of-duty.txt'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

{
  if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide.');
  files['help.md'] = helpMd;
}

// The runtime inlines every <script src> it finds by rewriting the tag, so a
// script the HTML never references would travel in the GIF and never run.
// Catching that here is much cheaper than catching it as a blank app.
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

const bytes = await gif.encode(files, { preview: fpsSimpleIcon(), accent: manifest.accent });
// Into the PUBLISH boundary: site/ is what GitHub Pages serves, so a GIF
// anywhere else is not downloadable (see apps/README.md).
const out = join(dir, '..', '..', 'site', 'apps', 'fps-simple', 'fps-simple.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/fps-simple/fps-simple.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
