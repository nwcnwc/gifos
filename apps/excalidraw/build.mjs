// Pack apps/excalidraw/ into the finished, downloadable
// site/apps/excalidraw/excalidraw.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/excalidraw.js
// from the pinned npm packages and is run only when the pin moves.
//
// Run:  node apps/excalidraw/build.mjs
import { deflateRawSync } from 'node:zlib';
import { excalidrawIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Same polyfill as hat-sh/build.mjs.
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

if (!existsSync(join(dir, 'vendor', 'excalidraw.js'))) {
  throw new Error('vendor/excalidraw.js is missing — run node apps/excalidraw/vendor.mjs first (it needs the network).');
}

const vendorJs = read('vendor/excalidraw.js');
const vendorCss = read('vendor/excalidraw.css');
for (const [n, s] of [['excalidraw.js', vendorJs], ['excalidraw.css', vendorCss]]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely; escape it in vendor.mjs.');
}
if (/^\s*export\s|export\{|import\.meta/m.test(vendorJs)) {
  throw new Error('excalidraw.js uses ESM syntax — the classic-script inline path cannot carry it.');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shim.js': read('shim.js'),
  'app.js': read('app.js'),
  'vendor/excalidraw.js': vendorJs,
  'vendor/excalidraw.css': vendorCss,
  'COPYING-excalidraw.txt': read('vendor/COPYING-excalidraw.txt'),
  'COPYING-react.txt': read('vendor/COPYING-react.txt'),
};
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of ['shim.js', 'vendor/excalidraw.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/excalidraw.css"')) throw new Error('index.html does not load vendor/excalidraw.css');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

const bytes = await gif.encode(files, { preview: excalidrawIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'excalidraw', 'excalidraw.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/excalidraw/excalidraw.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
