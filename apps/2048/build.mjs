// Pack apps/2048/ into the finished, downloadable
// site/apps/2048/2048.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// gabrielecirulli/2048 commit and is run only when the pin moves.
//
// Run:  node apps/2048/build.mjs
import { icon2048, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'game_manager.js'))) {
  throw new Error('vendor/game_manager.js is missing — run node apps/2048/vendor.mjs first (it needs the network).');
}
if (!existsSync(join(dir, 'vendor', 'main.css'))) {
  throw new Error('vendor/main.css is missing — run node apps/2048/vendor.mjs first.');
}

const SCRIPTS = [
  'vendor/bind_polyfill.js',
  'vendor/classlist_polyfill.js',
  'vendor/animframe_polyfill.js',
  'vendor/keyboard_input_manager.js',
  'vendor/html_actuator.js',
  'vendor/grid.js',
  'vendor/tile.js',
  'storage.js',
  'vendor/game_manager.js',
  'mp.js',
  'app.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'vendor/main.css': read('vendor/main.css'),
  'style.css': read('style.css'),
  'COPYING-2048.txt': read('vendor/COPYING-2048.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md is too short');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/main.css"')) throw new Error('index.html does not load vendor/main.css');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — the save lives in gifos.db.');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer — Play a friend is a room.');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the solo game does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — live scores have to sync.');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: icon2048(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', '2048', '2048.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/2048/2048.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (original 2048 + friend-mode, no network)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
