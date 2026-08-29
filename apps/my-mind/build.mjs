// Pack apps/my-mind/ into site/apps/my-mind/my-mind.gif.
import { myMindIcon, screenshotPng } from './icon.mjs';
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
pin('vendor/my-mind.js', '8a408302d55fe7b55273728c5967a54569ac106b87d366c5b1b5bd5c7ff33c6f');
pin('vendor/my-mind.css', 'bf6038b3dd37f9b8178827c6f483ee0e6c3891b035076992b33f0db588be4682');

for (const need of ['vendor/map-css.js', 'vendor/COPYING-my-mind.txt', 'vendor/UPSTREAM.txt', 'ls-stub.js', 'mp.js']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'my-mind') throw new Error('appId must be my-mind');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('must declare capabilities.db');
if (manifest.capabilities.network) throw new Error('no network path');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/ondras/my-mind') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!/Tab for a child/i.test(listing.tagline)) throw new Error('tagline must lead with the keys');
if (!/Invite/.test(listing.description)) throw new Error('listing must claim Invite watch');
if (!/Child/.test(listing.description)) throw new Error('listing must mention the phone Child bar');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'ls-stub.js': read('ls-stub.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'vendor/map-css.js': read('vendor/map-css.js'),
  'vendor/my-mind.js': read('vendor/my-mind.js'),
  'vendor/my-mind.css': read('vendor/my-mind.css'),
  'COPYING-my-mind.txt': read('vendor/COPYING-my-mind.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['ls-stub.js', 'vendor/map-css.js', 'app.js', 'mp.js', 'vendor/my-mind.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('id="phone-bar"') || !html.includes('data-cmd="insert-child"')) {
  throw new Error('index.html must ship a phone bar with Child');
}
if (!html.includes('id="empty"')) throw new Error('index.html must ship an empty-map hint');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (/gtag\(|firebase|googletagmanager/i.test(html + files['app.js'])) throw new Error('tracking leaked');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the map privately');
}
if (!files['app.js'].includes('MMMap') || !files['app.js'].includes('addChild')) {
  throw new Error('app.js must expose MMMap.addChild for the node loop');
}
if (!files['mp.js'].includes("db('room')")) throw new Error('mp.js must open the room');
if (/\bInvite\b/.test(files['help.md']) || /\bSave\b/.test(files['help.md'])) {
  throw new Error('help.md must not document Invite/Save');
}
if (!manifest.capabilities.multiplayer) throw new Error('must declare capabilities.multiplayer');
if (!manifest.data || !manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (!files['vendor/my-mind.js'].includes('window.MyMind') || !files['vendor/my-mind.js'].includes('MYMIND_MAP_CSS')) {
  throw new Error('my-mind.js must expose MyMind and skip fetch(map.css)');
}
if (files['vendor/my-mind.js'].includes('FirebaseUI, GDriveUI')) {
  throw new Error('cloud backends must stay unconstructed');
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

const bytes = await gif.encode(files, { preview: myMindIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'my-mind', 'my-mind.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/my-mind/my-mind.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
