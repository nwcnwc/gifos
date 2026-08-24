// Pack apps/json-editor/ into site/apps/json-editor/json-editor.gif.
import { jsonEditorIcon, screenshotPng } from './icon.mjs';
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
pin('vendor/jsoneditor.min.js', '360304912c19bcc2ec39e15af0031903634a2f19c47f0f1afeff3e93aafdbae4');
pin('vendor/jsoneditor.min.css', 'c73be501ba5b0c24113323e815475994205bd2abbfe818644772b6ff22b00e80');

for (const need of ['vendor/COPYING-jsoneditor.txt', 'vendor/NOTICE.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'json-editor') throw new Error('appId must be json-editor');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') {
  throw new Error('room must be read-only');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/josdejong/jsoneditor') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/jsoneditor.min.js': read('vendor/jsoneditor.min.js'),
  'vendor/jsoneditor.min.css': read('vendor/jsoneditor.min.css'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-jsoneditor.txt': read('vendor/COPYING-jsoneditor.txt'),
  'NOTICE.txt': read('vendor/NOTICE.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of ['vendor/jsoneditor.min.js', 'mp.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/jsoneditor.min.css"')) throw new Error('missing css');
if (!html.includes('tabTree') || !html.includes('tabCode')) throw new Error('Tree/Code tabs missing');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the document privately');
}
if (!files['app.js'].includes('JSONEditor')) throw new Error('app.js must construct JSONEditor');
if (!files['app.js'].includes('parseJson') || !files['app.js'].includes('repairText')) {
  throw new Error('app.js must export parseJson / repairText');
}
if (!files['vendor/jsoneditor.min.css'].includes('data:image/svg+xml')) {
  throw new Error('css must inline the icon sprite');
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

const bytes = await gif.encode(files, { preview: jsonEditorIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'json-editor', 'json-editor.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/json-editor/json-editor.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
