import { miniPhotoIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
const ENGINE_SHA = '59ab35e5a2c8c5854f7dcedc35ac003baef768758f2a701945b9a3a09e9028d0';

for (const need of ['vendor/mini-photo.js', 'vendor/COPYING-mini-photo-editor.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
{
  const buf = readFileSync(join(dir, 'vendor/mini-photo.js'));
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== ENGINE_SHA) throw new Error('mini-photo.js sha256 ' + hex + ' ≠ pin ' + ENGINE_SHA);
}

if (manifest.minBuild !== 947 || manifest.appId !== 'mini-photo-editor') throw new Error('manifest');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer || !manifest.capabilities.camera) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('no network');
if (!manifest.data.pic || manifest.data.pic.visibility !== 'private') throw new Error('pic must be private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') throw new Error('room must be read-only');
if (listing.basedOn.blessed !== false || listing.basedOn.name !== 'mini-photo-editor') throw new Error('basedOn');
if (listing.author.name !== 'xdadda' || listing.porter.name !== 'GifOS') throw new Error('author');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Creativity') throw new Error('meta');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/mini-photo-editor') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}

const SCRIPTS = ['vendor/mini-photo.js', 'app.js', 'mp.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/mini-photo.js': read('vendor/mini-photo.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-mini-photo-editor.txt': read('vendor/COPYING-mini-photo-editor.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('Invite is OS chrome');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes("db('save')")) throw new Error('Invite/save');
if (!files['app.js'].includes('takePhoto') || !files['app.js'].includes("db('pic')")) throw new Error('takePhoto/save pic');
if (!files['app.js'].includes("addEventListener('drop'") && !files['app.js'].includes('addEventListener("drop"')) {
  throw new Error('drop a picture onto the stage');
}
if (!files['vendor/mini-photo.js'].includes('applyPixels') || !files['vendor/mini-photo.js'].includes('hitHandle')) {
  throw new Error('filter pipeline + crop handles');
}
if (!files['COPYING-mini-photo-editor.txt'].includes('xdadda')) throw new Error('COPYING');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

{
  const ctx = { console, Math, Uint8Array, Uint8ClampedArray, document: { createElement() { return { getContext() { return null; } }; } } };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(files['vendor/mini-photo.js'] + '\n' +
    'result = (function () {\n' +
    '  if (!MiniPhoto || !MiniPhoto.MTX.polaroid || !MiniPhoto.MTX.kodak) throw new Error("mtx");\n' +
    '  MiniPhoto.setFilter("vintage");\n' +
    '  if (MiniPhoto.getFilter() !== "vintage") throw new Error("filter");\n' +
    '  var st = MiniPhoto.getState();\n' +
    '  if (st.adj.brightness !== 0) throw new Error("adj");\n' +
    '  var red = new Uint8Array([255, 0, 0, 255]);\n' +
    '  MiniPhoto.applyPixels(red, 1, 1, { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 }, "grayscale");\n' +
    '  if (Math.abs(red[0] - red[1]) > 1 || Math.abs(red[1] - red[2]) > 1) throw new Error("grey " + red);\n' +
    '  MiniPhoto.setSource({ width: 100, height: 80 });\n' +
    '  MiniPhoto.setCrop({ x: 10, y: 10, w: 50, h: 40 });\n' +
    '  MiniPhoto.rotate(1);\n' +
    '  var c = MiniPhoto.getCrop();\n' +
    '  if (c.W !== 80 || c.H !== 100) throw new Error("dims " + c.W + "x" + c.H);\n' +
    '  if (c.w !== 40 || c.h !== 50) throw new Error("crop rot " + JSON.stringify(c));\n' +
    '  return Object.keys(MiniPhoto.MTX).length;\n' +
    '})();', ctx);
  console.log('Mini Photo MTX looks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: miniPhotoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'mini-photo-editor', 'mini-photo-editor.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/mini-photo-editor/mini-photo-editor.gif —', (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
