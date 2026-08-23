// Pack apps/jspaint/ into the finished, downloadable
// site/apps/jspaint/jspaint.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned upstream and is run only when the pin moves.
//
// Run:  node apps/jspaint/build.mjs
import { jspaintIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush.
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

for (const need of ['vendor/libs.js', 'vendor/core.js', 'vendor/app.js', 'vendor/style.css', 'vendor/assets.js']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/jspaint/vendor.mjs first (it needs the network).');
  }
}

const SCRIPTS = [
  'boot.js',
  'vendor/libs.js',
  'vendor/assets.js',
  'src/app-localization.js',
  'vendor/core.js',
  'src/app-state.js',
  'vendor/app.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'boot.js': read('boot.js'),
  'vendor/style.css': read('vendor/style.css'),
  'vendor/libs.js': read('vendor/libs.js'),
  'vendor/assets.js': read('vendor/assets.js'),
  'vendor/core.js': read('vendor/core.js'),
  'vendor/app.js': read('vendor/app.js'),
  'src/app-localization.js': read('src/app-localization.js'),
  'src/app-state.js': read('src/app-state.js'),
  'COPYING-jspaint.txt': read('vendor/COPYING-jspaint.txt'),
  'images/icons/128x128.png': readBin('vendor/icon-128.png'),
};

{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md trimmed length is ' + help.length + ' (need >= 400)');
  files['help.md'] = help + '\n';
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/style.css"')) throw new Error('index.html does not load vendor/style.css');
for (const [n, s] of [['libs.js', files['vendor/libs.js']], ['core.js', files['vendor/core.js']], ['app.js', files['vendor/app.js']]]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely; escape it in vendor.mjs.');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jspaintIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'jspaint', 'jspaint.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/jspaint/jspaint.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
