// Pack apps/koil/ into the finished, downloadable
// site/apps/koil/koil.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Run:  node apps/koil/build.mjs
import { koilIcon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || !manifest.capabilities.db || !manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare db + multiplayer');
}
if (manifest.capabilities.network) {
  throw new Error('Koil has no network path. The game server is gone. Do not declare capabilities.network.');
}

const SCRIPTS = ['game.js', 'net.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-sounds.txt': read('COPYING-sounds.txt'),
  'assets/images/wall.png': bin('assets/images/wall.png'),
  'assets/images/player.png': bin('assets/images/player.png'),
  'assets/images/bomb.png': bin('assets/images/bomb.png'),
  'assets/images/key.png': bin('assets/images/key.png'),
  'assets/images/particle.png': bin('assets/images/particle.png'),
  'assets/sounds/blast.ogg': bin('assets/sounds/blast.ogg'),
  'assets/sounds/bomb-pickup.ogg': bin('assets/sounds/bomb-pickup.ogg'),
  'assets/sounds/ricochet.wav': bin('assets/sounds/ricochet.wav'),
  'assets/sounds/key-pickup.wav': bin('assets/sounds/key-pickup.wav'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/\bnew\s+WebSocket\b|\bWebSocket\s*\(/.test(s)) {
    throw new Error(n + ' opens a socket — the game server is gone.');
  }
  if (s.includes('XMLHttpRequest') || s.includes('navigator.sendBeacon')) {
    throw new Error(n + ' has a leftover network primitive — the game server is gone.');
  }
  // gifos.fetch would be a network path we do not have. Bare fetch is blocked by CSP anyway.
  if (/\bfetch\s*\(/.test(s)) throw new Error(n + ' uses fetch( — nothing leaves this tab.');
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: koilIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'koil', 'koil.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/koil/koil.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('screenshot.png', (shot.length / 1024).toFixed(0), 'KB');
