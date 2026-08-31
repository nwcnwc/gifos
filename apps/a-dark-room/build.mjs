// Pack apps/a-dark-room/ into site/apps/a-dark-room/a-dark-room.gif
import { darkRoomIcon } from './icon.mjs';
import { creditsJson, CREDITS_PATH } from '../../scripts/app-credits.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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

const SCRIPTS = [
  'shim.js',
  'vendor/lib/jquery.min.js',
  'vendor/lib/jquery.color-2.1.2.min.js',
  'vendor/lib/jquery.event.move.js',
  'vendor/lib/jquery.event.swipe.js',
  'vendor/lib/base64.js',
  'vendor/lib/translate.js',
  'vendor/script/Button.js',
  'vendor/script/audioLibrary.js',
  'vendor/script/audio.js',
  'vendor/script/engine.js',
  'vendor/script/state_manager.js',
  'vendor/script/header.js',
  'vendor/script/notifications.js',
  'vendor/script/events.js',
  'vendor/script/room.js',
  'vendor/script/outside.js',
  'vendor/script/world.js',
  'vendor/script/path.js',
  'vendor/script/ship.js',
  'vendor/script/space.js',
  'vendor/script/fabricator.js',
  'vendor/script/prestige.js',
  'vendor/script/scoring.js',
  'vendor/script/events/global.js',
  'vendor/script/events/room.js',
  'vendor/script/events/outside.js',
  'vendor/script/events/encounters.js',
  'vendor/script/events/setpieces.js',
  'vendor/script/events/marketing.js',
  'vendor/script/events/executioner.js',
  'vendor/script/localization.js',
  'assets-index.js',
  'patch.js',
  'net.js',
  'touch.js',
  'boot.js',
];
const CSS = [
  'vendor/css/main.css', 'vendor/css/room.css', 'vendor/css/outside.css',
  'vendor/css/path.css', 'vendor/css/world.css', 'vendor/css/ship.css',
  'vendor/css/space.css', 'vendor/css/fabricator.css', 'vendor/css/dark.css',
  'style.css',
];

for (const need of [
  ...SCRIPTS.filter((s) => s !== 'assets-index.js'),
  ...CSS,
  'index.html', 'help.md', 'manifest.json', 'listing.json',
  'vendor/COPYING-adarkroom.txt', 'vendor/COPYING-jquery.txt', 'vendor/UPSTREAM.txt',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' missing');
}

if (manifest.minBuild !== 1206) throw new Error('minBuild 1206 — packed .assets/ audio');
if (manifest.appId !== 'a-dark-room') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('db');
if (!manifest.capabilities.multiplayer) throw new Error('multiplayer');
if (manifest.capabilities.network) throw new Error('no network');
if (manifest.data.save.visibility !== 'private') throw new Error('save private');
if (manifest.data.fire.visibility !== 'read-only') throw new Error('fire read-only');
if (manifest.data.actions.visibility !== 'read-write') throw new Error('actions');
if (listing.basedOn.blessed !== false) throw new Error('blessed');
if (listing.basedOn.name !== 'A Dark Room') throw new Error('basedOn.name');
if (listing.author.name.indexOf('Townsend') < 0) throw new Error('author');
if (/gifos/i.test(listing.author.name)) throw new Error('author is never GifOS');
if (listing.porter.name !== 'GifOS') throw new Error('porter');
if (listing.license !== 'MPL-2.0') throw new Error('license');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/a-dark-room') {
  throw new Error('homepage');
}
if (!/fire lives in the file/i.test(listing.tagline)) throw new Error('tagline');
if (!/^Close it mid-stoke/.test(listing.description)) throw new Error('description lead');
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (JSON.stringify(listing).includes(bad)) throw new Error('listing mentions ' + bad);
}

const audioFiles = readdirSync(join(dir, 'vendor/audio')).filter((n) => n.endsWith('.flac'));
if (audioFiles.length < 80) throw new Error('too few flac ' + audioFiles.length);
const audioIndex = {};
const assetFiles = {};
for (const n of audioFiles) {
  const buf = bin(join('vendor/audio', n));
  const key = 'audio/' + n;
  assetFiles['.assets/' + key] = buf;
  audioIndex[key] = buf.length;
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shim.js': read('shim.js'),
  'patch.js': read('patch.js'),
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'COPYING-adarkroom.txt': read('vendor/COPYING-adarkroom.txt'),
  'COPYING-jquery.txt': read('vendor/COPYING-jquery.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of SCRIPTS) {
  if (s === 'assets-index.js') continue;
  files[s] = read(s);
}
for (const c of CSS) files[c] = read(c);
files['assets-index.js'] = 'window.__ADR_AUDIO_INDEX = JSON.parse(' +
  JSON.stringify(JSON.stringify(audioIndex).replace(/</g, '\\u003c')) + ');\n';
for (const [n, b] of Object.entries(assetFiles)) files[n] = b;

{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  for (const bad of ['gifos.db', 'WASM', 'sandbox', 'localStorage', 'WebRTC', 'connect-src']) {
    if (helpMd.includes(bad)) throw new Error('help.md mentions ' + bad);
  }
  files['help.md'] = helpMd;
}
files[CREDITS_PATH] = creditsJson(listing, 'a-dark-room');

try {
  files['llms.txt'] = readFileSync(join(dir, '..', '..', 'site', 'llms.txt'), 'utf8');
} catch (e) {}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
for (const c of CSS) {
  if (!html.includes('href="' + c + '"')) throw new Error('index.html does not load ' + c);
}
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome');
}
if (!files['boot.js'].includes("db('save')") && !files['shim.js'].includes("db('save')")) {
  throw new Error('db save');
}
if (!files['boot.js'].includes('gifos.assets') && !files['boot.js'].includes('g.assets')) {
  throw new Error('packed audio via gifos.assets');
}
if (!files['net.js'].includes("db('fire')")) throw new Error('shared fire');
if (!files['patch.js'].includes('gifos.onBack') && !files['patch.js'].includes('onBack')) {
  throw new Error('onBack');
}
if (!files['style.css'].includes('max-width: 720px')) throw new Error('phone layout');
if (/div#outerSlider\s*,[\s\S]{0,120}div#locationSlider[\s\S]{0,80}div\.location/.test(files['style.css'])) {
  throw new Error('phone reflow must not hide slider parents with the location panels');
}
if (!files['style.css'].includes('div.location.adr-active')) {
  throw new Error('phone reflow must show the active location');
}
if (files['vendor/script/engine.js'].includes('location.reload()')) {
  throw new Error('engine still reloads');
}
if (files['vendor/script/engine.js'].includes('window.location =')) {
  throw new Error('engine still navigates');
}
if (/eval\s*\(/.test(files['vendor/script/state_manager.js'])) {
  throw new Error('state_manager still eval');
}
if (files['vendor/script/audio.js'].includes('fetch(')) {
  throw new Error('audio still fetches');
}

let srcdocBytes = 0;
for (const [n, s] of Object.entries(files)) {
  if (n.startsWith('.assets/')) continue;
  srcdocBytes += typeof s === 'string' ? Buffer.byteLength(s) : s.length;
}
if (srcdocBytes > 3 * 1024 * 1024) {
  throw new Error('app document too heavy: ' + srcdocBytes + ' — audio must ride .assets/');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (n === 'assets-index.js') continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
}

const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath)) throw new Error('screenshot.png missing — capture the running Times New Roman room');
const shot = bin('screenshot.png');
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 20 * 1024) throw new Error('screenshot.png is too small to be a frame of the running game');

const bytes = await gif.encode(files, { preview: darkRoomIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'a-dark-room');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'a-dark-room.gif'), bytes);

{
  const sharp = (await import('sharp')).default;
  const cover = await sharp(shot)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  writeFileSync(join(outDir, 'cover.jpg'), cover);
}
const audioBytes = Object.values(assetFiles).reduce((s, b) => s + b.length, 0);
console.log('wrote site/apps/a-dark-room/a-dark-room.gif —',
  (bytes.length / (1024 * 1024)).toFixed(2), 'MB, from', Object.keys(files).length, 'files');
console.log('app document', (srcdocBytes / 1024).toFixed(0), 'KB; audio .assets/',
  audioFiles.length, 'flac,', (audioBytes / (1024 * 1024)).toFixed(2), 'MB');
console.log('wrote site/apps/a-dark-room/cover.jpg from screenshot.png');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
