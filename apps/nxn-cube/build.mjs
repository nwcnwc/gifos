// Pack apps/nxn-cube/ into the finished, downloadable
// site/apps/nxn-cube/nxn-cube.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/cube.js from the
// pinned upstream and is run only when the pin moves.
//
// Run:  node apps/nxn-cube/build.mjs
import { nxnCubeIcon, screenshotPng } from './icon.mjs';
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
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (!existsSync(join(dir, 'vendor', 'cube.js'))) {
  throw new Error('vendor/cube.js is missing — run node apps/nxn-cube/vendor.mjs first (it needs the network).');
}

const cubeJs = read('vendor/cube.js');
if (/<\/script/i.test(cubeJs)) throw new Error('vendor/cube.js contains </script — cannot inline safely.');
if (/^\s*export\s|export\{|import\.meta/m.test(cubeJs)) {
  throw new Error('vendor/cube.js uses ESM syntax — the classic-script inline path cannot carry it.');
}
if (!/\bNXN\b/.test(cubeJs)) throw new Error('vendor/cube.js does not define NXN.');

const boot = read('boot.js');
if (/<\/script/i.test(boot)) throw new Error('boot.js contains </script — cannot inline safely.');
for (const bad of ["type=\"module\"", "type='module'"]) {
  if (boot.includes(bad) || read('index.html').includes(bad)) {
    throw new Error('type=module does not survive the runtime inline — keep classic scripts.');
  }
}
if (/Rubik'?s Cube/i.test(JSON.stringify(listing) + boot + read('index.html'))) {
  throw new Error("do not brand as Rubik's Cube (trademark) — NxN Cube / Pocket Cube only.");
}

const SCRIPTS = ['vendor/cube.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/cube.js': cubeJs,
  'boot.js': boot,
  'COPYING-rubiks-cube.txt': read('vendor/COPYING-rubiks-cube.txt'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare db + multiplayer.');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 (store floor).');

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: nxnCubeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'nxn-cube', 'nxn-cube.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/nxn-cube/nxn-cube.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
