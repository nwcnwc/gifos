// Pack apps/server-survival/ into site/apps/server-survival/server-survival.gif
import { serverSurvivalIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
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
const bin = (p) => readFileSync(join(dir, p));
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const NEED = [
  'vendor/three.min.js', 'vendor/game.js', 'vendor/tailwind.css',
  'vendor/COPYING-server-survival.txt', 'vendor/COPYING-three.txt', 'vendor/UPSTREAM.txt',
  'vendor/assets/sounds/game-background.mp3', 'vendor/assets/sounds/menu.mp3',
  'vendor/assets/sounds/click-5.mp3', 'vendor/assets/sounds/click-9.mp3',
  'vendor/assets/sounds/click-10.mp3',
  'shim.js', 'app.js', 'style.css', 'index.html', 'help.md'
];
for (const need of NEED) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/server-survival/vendor.mjs first if it is a vendor file.');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'server-survival') throw new Error('appId');
if (manifest.shortName !== 'Servers') throw new Error('shortName');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('db required');
if (manifest.capabilities.network) throw new Error('no network');
if (manifest.data.save.visibility !== 'private') throw new Error('save private');
if (listing.basedOn.blessed !== false) throw new Error('blessed false');
if (listing.basedOn.name !== 'Server Survival') throw new Error('basedOn.name');
if (listing.basedOn.url !== 'https://github.com/pshenok/server-survival') throw new Error('basedOn.url');
if (listing.author.name !== 'Kostyantyn Pshenychnyy' || listing.porter.name !== 'GifOS') {
  throw new Error('author/porter');
}
if (/gifos/i.test(listing.author.name)) throw new Error('author is never GifOS');
if (listing.license !== 'MIT' || listing.releaseDate !== '2026-08-24') throw new Error('listing');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/server-survival') throw new Error('homepage');
if (!/no server/i.test(listing.tagline) || !/file is the save/i.test(listing.tagline)) {
  throw new Error('tagline must lead with no server / file is the save');
}
if (!/^The original is a webpage/.test(listing.description)) {
  throw new Error('description must lead with why this copy');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const three = read('vendor/three.min.js');
if (!/REVISION["':]{1,2}"?128/.test(three) && !three.includes('REVISION="128"') && !three.includes("r128")) {
  if (!three.slice(0, 400).includes('128')) throw new Error('three.min.js is not r128');
}

const audioBg = statSync(join(dir, 'vendor/assets/sounds/game-background.mp3')).size;
const audioMenu = statSync(join(dir, 'vendor/assets/sounds/menu.mp3')).size;
if (audioBg < 3_000_000 || audioMenu < 6_000_000) {
  throw new Error('soundtrack too small — do not drop the audio (' + audioBg + '+' + audioMenu + ')');
}

const SCRIPTS = ['shim.js', 'vendor/three.min.js', 'vendor/game.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shim.js': read('shim.js'),
  'app.js': read('app.js'),
  'vendor/three.min.js': three,
  'vendor/game.js': read('vendor/game.js'),
  'vendor/tailwind.css': read('vendor/tailwind.css'),
  'COPYING-server-survival.txt': read('vendor/COPYING-server-survival.txt'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'assets/sounds/game-background.mp3': bin('vendor/assets/sounds/game-background.mp3'),
  'assets/sounds/menu.mp3': bin('vendor/assets/sounds/menu.mp3'),
  'assets/sounds/click-5.mp3': bin('vendor/assets/sounds/click-5.mp3'),
  'assets/sounds/click-9.mp3': bin('vendor/assets/sounds/click-9.mp3'),
  'assets/sounds/click-10.mp3': bin('vendor/assets/sounds/click-10.mp3')
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  for (const bad of ['gifos.db', 'WASM', 'sandbox', 'localStorage', 'WebRTC', 'connect-src']) {
    if (helpMd.includes(bad)) throw new Error('help.md mentions ' + bad);
  }
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (!html.includes('href="vendor/tailwind.css"')) throw new Error('tailwind css');
if (!html.includes('href="style.css"')) throw new Error('style.css');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/cdn\.tailwindcss|cdnjs\.cloudflare|unpkg|jsdelivr|googleapis/i.test(html)) throw new Error('CDN');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');
if (!files['COPYING-server-survival.txt'].includes('Kostyantyn Pshenychnyy')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')")) throw new Error('db save');
if (!files['app.js'].includes('gifos.onBack')) throw new Error('onBack');
if (!files['app.js'].includes("saveDb.put")) throw new Error('gifos.db is the real save');
if (!files['shim.js'].includes('memoryStore')) throw new Error('shim is memory only');
if (!files['style.css'].includes('ss-narrow')) throw new Error('phone HUD');
if (!files['style.css'].includes('ss-desk-only')) throw new Error('phone stats compact');
if (!files['index.html'].includes('id="time-bar"')) throw new Error('time-bar id');
if (!files['index.html'].includes('btn-share-link')) throw new Error('share link button');
if (!/btn-share-link[\s\S]*style="display:none"/.test(files['index.html'])) {
  throw new Error('Copy Link must stay hidden — Invite is OS chrome');
}
if (!files['vendor/game.js'].includes('window.startGame')) throw new Error('game bundle');
if (/^\s*import\s/m.test(files['vendor/game.js'])) throw new Error('game.js still ESM');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: serverSurvivalIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'server-survival', 'server-survival.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/server-survival/server-survival.gif —',
  (bytes.length / (1024 * 1024)).toFixed(2), 'MB, from', Object.keys(files).length, 'files');
console.log('audio packed:', ((audioBg + audioMenu) / (1024 * 1024)).toFixed(2), 'MB soundtrack');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
