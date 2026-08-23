// Pack apps/snake/ into the finished, downloadable
// site/apps/snake/snake.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Run:  node apps/snake/build.mjs
import { snakeIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['game.js', 'app.js'];

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md must exist and be at least 400 characters after trim');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'game.js': read('game.js'),
  'app.js': read('app.js'),
  // The MIT notice rides INSIDE the GIF: a copy someone is handed is a
  // distribution of patorjk's JavaScript Snake.
  'COPYING.txt': read('COPYING.txt'),
  'help.md': helpMd,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare db + multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.capabilities.network) throw new Error('snake has no network path');
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/^\s*import\s|export\s/m.test(s)) throw new Error(n + ' must stay a classic script');
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: snakeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'snake', 'snake.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/snake/snake.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/snake/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
