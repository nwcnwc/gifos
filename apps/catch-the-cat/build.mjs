// Pack apps/catch-the-cat/ into the finished, downloadable
// site/apps/catch-the-cat/catch-the-cat.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/phaser.js and
// vendor/game.js from the pins and is run only when a pin moves.
//
// Run:  node apps/catch-the-cat/build.mjs
import { catchTheCatIcon, screenshotPng } from './icon.mjs';
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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

if (!existsSync(join(dir, 'vendor', 'phaser.js')) || !existsSync(join(dir, 'vendor', 'game.js'))) {
  throw new Error('vendor/phaser.js or vendor/game.js is missing — run node apps/catch-the-cat/vendor.mjs first (it needs the network).');
}

const PHASER_SHA256 = '02e25ee129cafe81835ab3c4a9d1aa80cdb79e34de006ea6f83a97458c3879d9';
const phaserBuf = readBin('vendor/phaser.js');
const phaserHex = createHash('sha256').update(phaserBuf).digest('hex');
if (phaserHex !== PHASER_SHA256) {
  throw new Error('vendor/phaser.js sha256 ' + phaserHex + ' ≠ pin ' + PHASER_SHA256 + ' — rerun vendor.mjs or move the pin.');
}
const phaser = phaserBuf.toString('utf8');
const game = read('vendor/game.js');
if (/<\/script/i.test(phaser) || /<\/script/i.test(game)) {
  throw new Error('vendor script contains </script — cannot inline safely.');
}
if (/^\s*export\s|export\{|import\.meta/m.test(game)) {
  throw new Error('game.js now uses ESM syntax — the classic-script inline path cannot carry it.');
}
if (!game.includes('window["CatchTheCatGame"]') && !game.includes("window['CatchTheCatGame']")) {
  throw new Error('game.js does not attach window.CatchTheCatGame');
}
if (!phaser.includes('t.Phaser=e()')) {
  throw new Error('phaser.js is not the UMD build that attaches window.Phaser');
}

const SCRIPTS = ['vendor/phaser.js', 'vendor/game.js', 'net.js', 'boot.js'];

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/phaser.js': phaser,
  'vendor/game.js': game,
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING-catch-the-cat.txt': read('vendor/COPYING-catch-the-cat.txt'),
  'COPYING-phaser.txt': read('vendor/COPYING-phaser.txt'),
  'help.md': helpMd,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the App Store.');
}
if (manifest.capabilities.network) {
  throw new Error('Catch the Cat has no network path. Do not declare capabilities.network.');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js') || n.startsWith('vendor/')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: catchTheCatIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'catch-the-cat', 'catch-the-cat.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/catch-the-cat/catch-the-cat.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (Phaser in-GIF, no CDN)');
