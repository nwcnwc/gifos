// Pack apps/super-sudoku/ into the finished, downloadable
// site/apps/super-sudoku/super-sudoku.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// TN1ck/super-sudoku commit and is run only when the pin moves.
//
// Run:  node apps/super-sudoku/build.mjs
import { sudokuIcon, screenshotPng } from './icon.mjs';
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

const DIFFS = ['easy', 'medium', 'hard', 'expert', 'evil'];

function puzzlesFromVendor() {
  const out = {};
  for (const d of DIFFS) {
    const path = join(dir, 'vendor', d + '.txt');
    if (!existsSync(path)) throw new Error('vendor/' + d + '.txt is missing — run node apps/super-sudoku/vendor.mjs first.');
    const lines = read('vendor/' + d + '.txt').split('\n').map((l) => l.trim()).filter((l) => l.length);
    if (lines.length < 500) throw new Error(d + ' has only ' + lines.length + ' puzzles');
    for (const line of lines) {
      if (!/^[0-9]{81}$/.test(line)) throw new Error('bad puzzle in ' + d + ': ' + line.slice(0, 20));
    }
    out[d] = lines;
  }
  return '(function(root){\n"use strict";\nroot.SS_PUZZLES=' + JSON.stringify(out) + ';\n})(this);\n';
}

const puzzlesJs = puzzlesFromVendor();
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const SCRIPTS = ['puzzles.js', 'game.js', 'mp.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'puzzles.js': puzzlesJs,
  'game.js': read('game.js'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-super-sudoku.txt': read('vendor/COPYING-super-sudoku.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module — classic scripts only');
if (/serviceWorker|sw\.js/.test(html)) throw new Error('index.html registers a service worker — drop it');
if (/https?:\/\//i.test(html) && /src=["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote script — nothing may be fetched.');
}
if (manifest.capabilities && manifest.capabilities.network) {
  throw new Error('super-sudoku has no network path');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare db + multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'TN1ck') {
  throw new Error('listing.author must be TN1ck');
}
if (listing.basedOn.name !== 'Super Sudoku') {
  throw new Error('listing.basedOn.name must be Super Sudoku');
}
if (!files['mp.js'].includes("db('players')") || !files['mp.js'].includes('deal')) {
  throw new Error('race must publish on players and deal a shared puzzle');
}
if (!files['app.js'].includes('pad') || !html.includes('id="pad"')) {
  throw new Error('touch number pad is required');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — classic-script inline path cannot carry it');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n !== 'puzzles.js') {
    for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
      if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — puzzles travel in the GIF, nothing is fetched.');
    }
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: sudokuIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'super-sudoku');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'super-sudoku.gif'), bytes);
console.log('wrote site/apps/super-sudoku/super-sudoku.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (puzzle bank in-GIF, no network)');
console.log('wrote apps/super-sudoku/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
