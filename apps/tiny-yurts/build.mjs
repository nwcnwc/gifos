// Pack apps/tiny-yurts/ into site/apps/tiny-yurts/tiny-yurts.gif.
import { yurtsIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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
const listing = JSON.parse(read('listing.json'));

if (!existsSync(join(dir, 'vendor', 'game.js'))) throw new Error('vendor/game.js missing');
const GAME_SHA256 = '5f6f0f06750dac8cfa8ff97de3bd21e8115a7e5094bf96e442231acf2c2c3a78';
const gameBuf = readFileSync(join(dir, 'vendor', 'game.js'));
const gameHex = createHash('sha256').update(gameBuf).digest('hex');
if (gameHex !== GAME_SHA256) throw new Error('vendor/game.js sha256 ' + gameHex + ' ≠ pin ' + GAME_SHA256);

if (manifest.minBuild !== 947) throw new Error('minBuild');
if (manifest.appId !== 'tiny-yurts') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('db+mp');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/burntcustard/tiny-yurts') throw new Error('url');
if (listing.porter.name !== 'GifOS' || /gifos/i.test(listing.author.name)) throw new Error('author/porter');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Games') throw new Error('listing');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.tagline.length > 120) throw new Error('tagline');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}

const game = gameBuf.toString('utf8');
if (/eval\(/.test(game) || /new Function\(/.test(game)) throw new Error('game.js uses eval');
if (/<\/script/i.test(game)) throw new Error('game.js </script');

const SCRIPTS = ['shim.js', 'vendor/game.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shim.js': read('shim.js'),
  'vendor/game.js': game,
  'boot.js': read('boot.js'),
  'COPYING-tiny-yurts.txt': read('vendor/COPYING-tiny-yurts.txt'),
  'COPYING-kontra.txt': read('vendor/COPYING-kontra.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
}
if (html.indexOf('shim.js') > html.indexOf('vendor/game.js')) {
  throw new Error('shim.js must load before the game');
}
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');
if (!files['shim.js'].includes('localStorage')) throw new Error('shim must stub localStorage');
if (!files['boot.js'].includes("db('save')")) throw new Error('boot must save');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js') || n.startsWith('vendor/')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*import\s|export\s+\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
}

const cover = screenshotPng();
if (cover[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), cover);

const bytes = await gif.encode(files, { preview: yurtsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tiny-yurts', 'tiny-yurts.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tiny-yurts/tiny-yurts.gif —', bytes.length, 'bytes,',
            (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
