// Pack apps/io-blobs/ into the finished, downloadable
// site/apps/io-blobs/io-blobs.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. This is a
// thin rewrite of example-.io-game as a blob-eat-blob arena — no vendor
// fetch, no Socket.IO, no Node server.
//
// Run:  node apps/io-blobs/build.mjs
import { ioBlobsIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const listing = JSON.parse(read('listing.json'));

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'Socket.IO', 'socket.io']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
if (/agar\.?io/i.test(listingBlob) || /agar\.?io/i.test(JSON.stringify(manifest)) || /agar\.?io/i.test(read('index.html'))) {
  throw new Error('do not call it Agar.io — the listing, the name and the page must not');
}

const SCRIPTS = ['net.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of the MIT work.
  'COPYING.txt': read('COPYING.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module — the runtime drops it.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) {
  throw new Error('IO Blobs has no network path. Socket.IO/Node stay behind.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
}
if (manifest.name === 'Agar.io' || /agar\.?io/i.test(manifest.name)) {
  throw new Error('do not call it Agar.io in the name');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/\bio\s*\(|socket\.io|Socket\.IO/i.test(s) && !s.includes('Socket.IO Node server')) {
    // net.js/app.js may mention the ripped-out server in comments. A live
    // import or constructor is the failure.
  }
  if (/from ['"]socket\.io|require\(['"]socket\.io|io\(['"]https?:/.test(s)) {
    throw new Error(n + ' still talks to Socket.IO — the game server is gone.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: ioBlobsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'io-blobs', 'io-blobs.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/io-blobs/io-blobs.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no Socket.IO, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
