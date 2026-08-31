// Pack apps/nullboard/ into site/apps/nullboard/nullboard.gif.
import { nullboardIcon, screenshotPng } from './icon.mjs';
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
const pin = (rel, hex) => {
  const buf = readFileSync(join(dir, rel));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== hex) throw new Error(rel + ' sha256 ' + got + ' ≠ pin ' + hex);
  return buf;
};

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
pin('vendor/jquery-3.6.0.min.js', 'ff1523fb7389539c84c65aba19260648793bb4f5e29329d2ee8804bc37a3fe6e');
pin('vendor/nullboard.js', '9b2ff275eafcfe38bdad8daf65a0181608b76d25de044834316b8c4b31b832c2');
pin('vendor/nullboard.css', 'e7b4453c3279d21fb686f75ff930f636e2a81c76ac58a84a190e55978a794279');

for (const need of [
  'vendor/COPYING-nullboard.txt', 'vendor/COPYING-jquery.txt', 'vendor/COPYING-barlow.txt',
  'vendor/UPSTREAM.txt', 'ls-stub.js', 'mp.js', 'touch.js', 'boot.js', 'COPYING.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 2154) throw new Error('minBuild must be 2154 — capabilities.links');
if (manifest.appId !== 'nullboard') throw new Error('appId must be nullboard');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('must declare capabilities.db');
if (!manifest.capabilities.multiplayer) throw new Error('must declare capabilities.multiplayer');
if (!manifest.capabilities.links) throw new Error('must declare capabilities.links');
if (manifest.capabilities.network) throw new Error('no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/apankrat/nullboard') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (!/Commons Clause/i.test(listing.license)) throw new Error('listing.license must name Commons Clause');
if (!/no Trello/i.test(listing.tagline) && !/Invite/i.test(listing.tagline)) {
  throw new Error('tagline must sell the file / invite');
}
if (!/Invite/.test(listing.description)) throw new Error('listing must claim Invite');
if (!/phone/i.test(listing.description)) throw new Error('listing must mention the phone');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'ls-stub.js': read('ls-stub.js'),
  'boot.js': read('boot.js'),
  'mp.js': read('mp.js'),
  'touch.js': read('touch.js'),
  'vendor/jquery-3.6.0.min.js': read('vendor/jquery-3.6.0.min.js'),
  'vendor/nullboard.js': read('vendor/nullboard.js'),
  'vendor/nullboard.css': read('vendor/nullboard.css'),
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-jquery.txt': read('vendor/COPYING-jquery.txt'),
  'COPYING-barlow.txt': read('vendor/COPYING-barlow.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['ls-stub.js', 'vendor/jquery-3.6.0.min.js', 'vendor/nullboard.js', 'mp.js', 'touch.js', 'boot.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/nullboard.css"') || !html.includes('href="style.css"')) {
  throw new Error('index.html does not load css');
}
if (!html.includes('id="phone-bar"') || !html.includes('data-act="note"')) {
  throw new Error('index.html must ship a phone bar with + Note');
}
if (!html.includes('id="meet"')) throw new Error('index.html must ship a meet line');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/code\.jquery\.com/.test(html)) throw new Error('jquery CDN leftover');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (/\bInvite\b/.test(files['help.md']) || /\bSave\b/.test(files['help.md'])) {
  throw new Error('help.md must not document Invite/Save');
}
if (!files['boot.js'].includes("db('save')") || !files['ls-stub.js'].includes('_hydrate')) {
  throw new Error('boot/ls-stub must persist privately');
}
if (!files['mp.js'].includes("db('room')")) throw new Error('mp.js must open the room');
if (!files['vendor/nullboard.js'].includes('window.startNullboard')) {
  throw new Error('vendor must wrap init as startNullboard');
}
if (!/var NB;\s*\n\twindow\.startNullboard/.test(files['vendor/nullboard.js'])) {
  throw new Error('NB must be a real global, not a var inside startNullboard');
}
if (!files['vendor/nullboard.js'].includes('NB = window.NB =')) {
  throw new Error('window.NB must be assigned before vendor helpers run');
}
const nbAssign = files['vendor/nullboard.js'].indexOf('NB = window.NB =');
const startFn = files['vendor/nullboard.js'].indexOf('window.startNullboard');
const nbBackups = files['vendor/nullboard.js'].indexOf('NB.storage.initBackups', startFn);
if (nbAssign < 0 || startFn < 0 || nbBackups < 0 || nbAssign > nbBackups) {
  throw new Error('window.NB must be assigned before initBackups');
}
if (files['boot.js'].includes('.catch(boot)')) {
  throw new Error('boot must not re-enter after a throw');
}
if (!files['vendor/nullboard.css'].includes('data:font/woff;base64,')) {
  throw new Error('css must inline Barlow');
}
if (files['vendor/nullboard.js'].includes('code.jquery.com')) {
  throw new Error('jquery CDN leftover in vendor js');
}
for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' uses ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: nullboardIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'nullboard', 'nullboard.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/nullboard/nullboard.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
