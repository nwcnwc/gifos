// Pack apps/svg-edit/ into the finished, downloadable
// site/apps/svg-edit/svg-edit.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/* from the
// pinned svgedit package and is run only when the pin moves.
//
// Run:  node apps/svg-edit/build.mjs
import { svgEditIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/iife-Editor.js', 'vendor/svgedit.css', 'vendor/images.js', 'vendor/COPYING.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/svg-edit/vendor.mjs first (it needs the network).');
  }
}

const SCRIPTS = ['boot.js', 'vendor/images.js', 'vendor/iife-Editor.js', 'app.js'];
const vendorJs = read('vendor/iife-Editor.js');
if (/^\s*export\s|export\{|import\.meta/m.test(vendorJs)) {
  throw new Error('vendor/iife-Editor.js uses ESM syntax — the classic-script inline path cannot carry it.');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'boot.js': read('boot.js'),
  'app.js': read('app.js'),
  'vendor/iife-Editor.js': vendorJs,
  'vendor/svgedit.css': read('vendor/svgedit.css'),
  'vendor/images.js': read('vendor/images.js'),
  'COPYING.txt': read('vendor/COPYING.txt'),
};
if (existsSync(join(dir, 'vendor', 'COPYING-Apache-2.0.txt'))) {
  files['COPYING-Apache-2.0.txt'] = read('vendor/COPYING-Apache-2.0.txt');
}
if (existsSync(join(dir, 'vendor', 'AUTHORS.txt'))) {
  files['AUTHORS.txt'] = read('vendor/AUTHORS.txt');
}
{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md trimmed length is ' + help.length + ' (need >= 400)');
  files['help.md'] = help + '\n';
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/svgedit.css"')) throw new Error('index.html does not load vendor/svgedit.css');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: svgEditIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'svg-edit', 'svg-edit.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/svg-edit/svg-edit.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
