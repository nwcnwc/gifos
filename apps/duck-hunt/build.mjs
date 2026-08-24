import { duckHuntIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['vendor/assets.js', 'fetch-hook.js', 'vendor/duckhunt.js', 'boot.js'];

for (const need of ['vendor/duckhunt.js', 'vendor/assets.js', 'vendor/COPYING-duckhunt.txt', 'vendor/UPSTREAM.txt', 'vendor/sprites.png']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' missing — run vendor.mjs');
}

const PNG_SHA = '55d1b2ad30e5476bcf34a438c05eb0c14dea4aa336dbd1d53e0ec49330febeeb';
const pngHex = createHash('sha256').update(readFileSync(join(dir, 'vendor', 'sprites.png'))).digest('hex');
if (pngHex !== PNG_SHA) throw new Error('sprites.png sha256 ' + pngHex + ' ≠ pin');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/assets.js': read('vendor/assets.js'),
  'fetch-hook.js': read('fetch-hook.js'),
  'vendor/duckhunt.js': read('vendor/duckhunt.js'),
  'boot.js': read('boot.js'),
  'COPYING-duckhunt.txt': read('vendor/COPYING-duckhunt.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md too short');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');
if (!files['boot.js'].includes('Invite')) throw new Error('tell the player to press Invite');
if (!files['boot.js'].includes("db('save')")) throw new Error('save');
if (!files['boot.js'].includes('onScore')) throw new Error('score hook');
if (!files['boot.js'].includes('replay')) throw new Error('replay');
if (!files['boot.js'].includes('onBack')) throw new Error('onBack');
if (!files['vendor/duckhunt.js'].includes('DuckHuntStart')) throw new Error('vendor not patched');
if (!files['vendor/duckhunt.js'].includes('DHSave.onScore')) throw new Error('vendor score hook');
if (files['vendor/duckhunt.js'].includes('window.location=window.location.pathname')) {
  throw new Error('replay must not navigate');
}
if (files['vendor/duckhunt.js'].includes('creator.html')) throw new Error('no creator escape');
if (!files['index.html'].includes('btn-mute')) throw new Error('phone mute');
if (!files['fetch-hook.js'].includes('sprites.json')) throw new Error('fetch-hook must serve sprites');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/MattSurabian/DuckHunt-JS') throw new Error('basedOn.url');
if (!listing.author || listing.author.name !== 'MattSurabian' || /gifos/i.test(listing.author.name)) {
  throw new Error('author MattSurabian');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (listing.license !== 'MIT') throw new Error('MIT');
if (listing.categories[0] !== 'Games') throw new Error('Games');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'Nintendo']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (manifest.appId !== 'duck-hunt') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network || manifest.capabilities.wasm) throw new Error('no net/wasm');
if (!files['COPYING-duckhunt.txt'].includes('Matt Surabian')) throw new Error('COPYING');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s/m.test(s) || /^\s*export\s/m.test(s)) throw new Error(n + ' ESM');
  if (n === 'fetch-hook.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath) || process.env.REWRITE_SHOT) {
  const shot = screenshotPng();
  if (shot[0] !== 0x89) throw new Error('screenshot');
  writeFileSync(shotPath, shot);
}
const bytes = await gif.encode(files, { preview: duckHuntIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'duck-hunt', 'duck-hunt.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/duck-hunt/duck-hunt.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
