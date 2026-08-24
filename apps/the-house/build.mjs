// Pack apps/the-house/ into site/apps/the-house/the-house.gif
import { houseIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, posix } from 'node:path';

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

for (const need of [
  'vendor/COPYING-the-house.txt', 'vendor/UPSTREAM.txt',
  'vendor/css/styles.css', 'vendor/css/reset.css',
  'vendor/js/min/game-min.js', 'vendor/js/libs/min/jstorage-min.js',
  'boot.js', 'patch.js', 'app.js', 'help.md',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' missing');
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  woff: 'font/woff', ttf: 'font/ttf', mp3: 'audio/mpeg', ogg: 'audio/ogg',
};
function dataUri(rel, buf) {
  const ext = extname(rel).slice(1).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + Buffer.from(buf).toString('base64');
}
function walk(rel, acc) {
  const abs = join(dir, rel);
  for (const name of readdirSync(abs)) {
    if (name === '.' || name === '..') continue;
    const p = posix.join(rel, name);
    const st = statSync(join(dir, p));
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const images = {};
for (const p of walk('vendor/images', [])) {
  const key = p.replace(/^vendor\//, '');
  images[key] = dataUri(p, readBin(p));
}
for (const p of walk('vendor/fonts', [])) {
  const key = p.replace(/^vendor\//, '');
  images[key] = dataUri(p, readBin(p));
}
const sounds = {};
for (const p of walk('vendor/sound', [])) {
  const key = p.replace(/^vendor\//, '');
  sounds[key] = dataUri(p, readBin(p));
}
const rooms = {};
for (const name of readdirSync(join(dir, 'vendor'))) {
  if (!name.endsWith('.html')) continue;
  if (name === 'index.html') continue; // original shell — we ship our own
  rooms[name] = read(join('vendor', name));
}
if (Object.keys(images).length < 100) throw new Error('too few images ' + Object.keys(images).length);
if (Object.keys(sounds).length < 20) throw new Error('too few sounds ' + Object.keys(sounds).length);
if (!rooms['intro.html'] || !rooms['room.html'] || !rooms['corridor.html']) {
  throw new Error('missing core rooms');
}

const reset = read('vendor/css/reset.css');
const styles = read('vendor/css/styles.css').replace(/@import\s+["']reset\.css["']\s*;?/, '');
const gameCss = reset + '\n' + styles;

const SCRIPTS = [
  'boot.js',
  'vendor/js/libs/modernizr.custom.13520.js',
  'vendor/js/libs/min/soundmanager2-nodebug-jsmin-min.js',
  'patch.js',
  'vendor/js/libs/jquery-1.7.min.js',
  'vendor/js/libs/jquery.animate-colors-min.js',
  'vendor/js/libs/min/preloadCssImages.jQuery_v5-min.js',
  'vendor/js/libs/min/jstorage-min.js',
  'vendor/js/libs/min/jquery.spritely-0.6-min.js',
  'vendor/js/libs/min/jquery-ui-1.8.11.draggable.min-min.js',
  'vendor/js/libs/min/jquery.transit.min-min.js',
  'vendor/js/libs/min/jquery.idle-timer.min.js',
  'vendor/js/min/dialogue_box-min.js',
  'vendor/js/min/tooltip-min.js',
  'vendor/js/min/text_cloud-min.js',
  'vendor/js/min/data-min.js',
  'vendor/js/min/settings-min.js',
  'vendor/js/min/audio-min.js',
  'vendor/js/min/items-min.js',
  'vendor/js/min/view-min.js',
  'vendor/js/min/room-min.js',
  'vendor/js/min/scenes-min.js',
  'vendor/js/min/npcs-min.js',
  'vendor/js/min/game-min.js',
  'images.js',
  'sounds.js',
  'rooms.js',
  'app.js',
];

function jsLiteral(name, obj) {
  // Inlined as <script>…</script>; a raw </script> inside a JSON string would
  // close the tag. JSON never needs a real less-than in keys/values we emit.
  return 'window.' + name + ' = ' + JSON.stringify(obj).replace(/<\/script/gi, '<\\/script') + ';\n';
}
const imagesJs = jsLiteral('HOUSE_IMAGES', images);
const soundsJs = jsLiteral('HOUSE_SOUNDS', sounds);
const roomsJs = jsLiteral('HOUSE_ROOMS', rooms);

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/css/game.css': gameCss,
  'COPYING-the-house.txt': read('vendor/COPYING-the-house.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'images.js': imagesJs,
  'sounds.js': soundsJs,
  'rooms.js': roomsJs,
};
for (const s of SCRIPTS) {
  if (s === 'images.js' || s === 'sounds.js' || s === 'rooms.js') continue;
  files[s] = read(s);
}
{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md too short (' + help.length + ')');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('style.css');
if (!html.includes('href="vendor/css/game.css"')) throw new Error('game.css');
if (/type=["']module["']/.test(html)) throw new Error('module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('url');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite');

if (manifest.minBuild !== 947) throw new Error('minBuild');
if (manifest.appId !== 'the-house') throw new Error('appId');
if (!manifest.capabilities.db) throw new Error('caps.db');
if (manifest.capabilities.network) throw new Error('network');
if (manifest.capabilities.fullscreen) throw new Error('fullscreen');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('data.save');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('blessed');
if (listing.basedOn.name !== 'The House') throw new Error('basedOn.name');
if (listing.basedOn.url !== 'https://github.com/arturkot/the-house-game') throw new Error('basedOn.url');
if (!listing.author || listing.author.name !== 'Artur Kot' || /gifos/i.test(listing.author.name)) {
  throw new Error('author');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (listing.license !== 'MIT') throw new Error('MIT');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/the-house') throw new Error('homepage');
if (!listing.categories || listing.categories[0] !== 'Games') throw new Error('Games');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}
const helpBlob = files['help.md'];
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (helpBlob.includes(bad)) throw new Error('help ' + bad);
}
if (!files['COPYING-the-house.txt'].includes('Artur Kot')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')")) throw new Error('save db');
if (!files['app.js'].includes('HOUSE_ROOMS') || !files['app.js'].includes('HOUSE_SOUNDS')) {
  throw new Error('maps');
}
if (!files['boot.js'].includes('SM2_DEFER')) throw new Error('SM2_DEFER');
if (!files['patch.js'].includes('useHTML5Audio')) throw new Error('html5 audio');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/') || n === 'images.js' || n === 'sounds.js' || n === 'rooms.js') continue;
  if (/^\s*import\s/m.test(s) || /^\s*export\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: houseIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'the-house', 'the-house.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/the-house/the-house.gif —', bytes.length, 'bytes,',
            (bytes.length / (1024 * 1024)).toFixed(2), 'MB, from',
            Object.keys(files).length, 'files');
console.log('images', Object.keys(images).length, 'sounds', Object.keys(sounds).length,
            'rooms', Object.keys(rooms).length);
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
