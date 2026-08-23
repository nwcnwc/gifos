// Pack apps/hat-sh/ into the finished, downloadable
// site/apps/hat-sh/hat-sh.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/sodium.js from
// the pinned libsodium.js tag and is run only when the pin moves.
//
// Run:  node apps/hat-sh/build.mjs
import { hatShIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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

if (!existsSync(join(dir, 'vendor', 'sodium.js'))) {
  throw new Error('vendor/sodium.js is missing — run node apps/hat-sh/vendor.mjs first (it needs the network).');
}

const SODIUM_SHA256 = 'b13df42138a77880bd8e18ab184ca74fac59c31471cf82f8ded677cc46b5087f';
const sodiumBuf = readFileSync(join(dir, 'vendor', 'sodium.js'));
const sodiumHex = createHash('sha256').update(sodiumBuf).digest('hex');
const sodium = sodiumBuf.toString('utf8');
if (sodiumHex !== SODIUM_SHA256) {
  throw new Error('vendor/sodium.js sha256 ' + sodiumHex + ' ≠ pin ' + SODIUM_SHA256 + ' — rerun vendor.mjs or move the pin.');
}
if (/<\/script/i.test(sodium)) throw new Error('sodium.js contains </script — cannot inline safely.');
if (/^\s*export\s|export\{|import\.meta/m.test(sodium)) {
  throw new Error('sodium.js now uses ESM syntax — the classic-script inline path cannot carry it.');
}
if (!sodium.includes('crypto_pwhash_ALG_ARGON2ID13')) {
  throw new Error('sodium.js is not the SUMO build — Argon2id is missing. hat.sh v2 passwords need it.');
}

const SCRIPTS = ['sodium.js', 'crypto.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sodium.js': sodium,
  'crypto.js': read('crypto.js'),
  'app.js': read('app.js'),
  // Notices ride INSIDE the GIF: a copy someone is handed is a distribution
  // of both MIT hat.sh and ISC libsodium.js.
  'COPYING-hat.sh.txt': read('vendor/COPYING-hat.sh.txt'),
  'COPYING-libsodium.txt': read('vendor/COPYING-libsodium.txt'),
};

{
  if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide.');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.wasm !== true) {
  throw new Error('manifest must declare capabilities.wasm — libsodium will not instantiate without it.');
}
if (manifest.capabilities.network) {
  throw new Error('hat.sh has no network path. Do not declare capabilities.network.');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js') || n === 'sodium.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hatShIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hat-sh', 'hat-sh.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hat-sh/hat-sh.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (libsodium sumo in-GIF, no network)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
