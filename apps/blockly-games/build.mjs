// Pack apps/blockly-games/ into site/apps/blockly-games/blockly-games.gif
import { gamesIcon, screenshotPng } from './icon.mjs';
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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (!existsSync(join(dir, 'vendor', 'blockly_compressed.js'))) {
  throw new Error('vendor/blockly_compressed.js missing');
}
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');

function dataUrl(rel, mime) {
  return 'data:' + mime + ';base64,' + readBin(rel).toString('base64');
}

const assetsJs = 'window.BG_ASSETS=' + JSON.stringify({
  sprites: dataUrl('vendor/sprites.png', 'image/png'),
  pegman: dataUrl('vendor/pegman.png', 'image/png'),
  marker: dataUrl('vendor/marker.png', 'image/png'),
  duck: dataUrl('vendor/duck.jpg', 'image/jpeg'),
  cat: dataUrl('vendor/cat.jpg', 'image/jpeg'),
  bee: dataUrl('vendor/bee.jpg', 'image/jpeg'),
  snail: dataUrl('vendor/snail.jpg', 'image/jpeg')
}) + ';\n';
writeFileSync(join(dir, 'vendor', 'assets.js'), assetsJs);

const spriteUrl = dataUrl('vendor/sprites.png', 'image/png');
let blockly = read('vendor/blockly_compressed.js').split('sprites.png').join(spriteUrl);
blockly = blockly.split('<<<PATH>>>').join('');
if (/<\/script/i.test(blockly)) throw new Error('blockly contains </script');

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
if (/invite|gifos\.db|localStorage|sandbox/i.test(helpMd)) {
  throw new Error('help.md must not mention Invite / gifos.db / localStorage / sandbox');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (listing.author && listing.author.name === 'GifOS') throw new Error('author is Google, not GifOS');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (!listing.porter) throw new Error('porter required');
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');

const SCRIPTS = [
  'vendor/blockly_compressed.js', 'vendor/msg-en.js', 'vendor/assets.js',
  'blocks.js', 'maze.js', 'turtle.js', 'puzzle.js', 'net.js', 'boot.js'
];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/blockly_compressed.js': blockly,
  'vendor/msg-en.js': read('vendor/msg-en.js'),
  'vendor/assets.js': assetsJs,
  'blocks.js': read('blocks.js'),
  'maze.js': read('maze.js'),
  'turtle.js': read('turtle.js'),
  'puzzle.js': read('puzzle.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING-blockly-games.txt': read('vendor/COPYING-blockly-games.txt'),
  'COPYING-blockly.txt': read('vendor/COPYING-blockly.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.data || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s) && n !== 'vendor/blockly_compressed.js') {
    throw new Error(n + ' contains </script');
  }
  if (/localStorage/.test(s) && !n.startsWith('vendor/')) {
    throw new Error(n + ' mentions localStorage');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: gamesIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'blockly-games', 'blockly-games.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/blockly-games/blockly-games.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
