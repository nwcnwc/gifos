// Pack apps/monaco-code/ into site/apps/monaco-code/monaco-code.gif.
import { monacoCodeIcon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (manifest.appId !== 'monaco-code') throw new Error('appId must be monaco-code');
if (manifest.minBuild !== 1178) {
  throw new Error('minBuild must be 1178 — gifos.assets() for packed .assets/ workers');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) throw new Error('must declare capabilities.multiplayer');
if (manifest.capabilities.wasm !== true) {
  throw new Error('must declare capabilities.wasm — blob Workers need the wasm hatch');
}
if (manifest.capabilities.network) throw new Error('no network path');
if (!manifest.data || manifest.data.files.visibility !== 'read-write') {
  throw new Error('files must be read-write (pair editor)');
}
if (manifest.data.prefs.visibility !== 'private') throw new Error('prefs must be private');
if (manifest.data.cursors.visibility !== 'read-write') throw new Error('cursors must be read-write');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/microsoft/monaco-editor') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const pins = {};
for (const line of read('vendor/UPSTREAM.txt').split('\n')) {
  const m = line.match(/^(\S+)\s+(\d+)\s+([0-9a-f]{64})$/);
  if (m) pins[m[1]] = { bytes: +m[2], sha256: m[3] };
}
function pin(name) {
  const buf = bin('vendor/' + name);
  const got = sha256(buf);
  const want = pins[name];
  if (!want) throw new Error('no pin for ' + name);
  if (buf.length !== want.bytes) throw new Error(name + ' size ' + buf.length + ' ≠ pin ' + want.bytes);
  if (got !== want.sha256) throw new Error(name + ' sha256 ' + got + ' ≠ pin ' + want.sha256);
  return buf;
}

const monacoJs = pin('monaco.js').toString('utf8');
const monacoCss = pin('monaco.css').toString('utf8');
const editorWorker = pin('editor.worker.js');
const jsonWorker = pin('json.worker.js');
const tsWorker = pin('ts.worker.js');
pin('COPYING-monaco.txt');
pin('ThirdPartyNotices.txt');

for (const [n, s] of [
  ['monaco.js', monacoJs],
  ['editor.worker.js', editorWorker.toString('utf8')],
  ['json.worker.js', jsonWorker.toString('utf8')],
  ['ts.worker.js', tsWorker.toString('utf8')]
]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'workers.js': read('workers.js'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  'vendor/monaco.js': monacoJs,
  'vendor/monaco.css': monacoCss,
  '.assets/editor.worker.js': editorWorker,
  '.assets/json.worker.js': jsonWorker,
  '.assets/ts.worker.js': tsWorker,
  'COPYING-monaco.txt': read('vendor/COPYING-monaco.txt'),
  'ThirdPartyNotices.txt': read('vendor/ThirdPartyNotices.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

{
  if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of ['workers.js', 'vendor/monaco.js', 'net.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/monaco.css"')) throw new Error('missing monaco.css');
if (!html.includes('href="style.css"')) throw new Error('missing style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['net.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['workers.js'].includes('gifos.assets') && !files['workers.js'].includes('api.assets')) {
  throw new Error('workers.js must mint workers from gifos.assets()');
}
if (!files['workers.js'].includes('new Worker')) throw new Error('workers.js must construct a Worker');
if (!files['app.js'].includes('monaco.editor.create')) throw new Error('app.js must create the editor');
if (!files['app.js'].includes("db('files')") && !files['net.js'].includes("db('files')")) {
  throw new Error('must save files in gifos.db');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM');
  }
  if (n === 'workers.js' || n === 'vendor/monaco.js') continue;
  const code = s.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*');
  }).join('\n');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (code.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

let srcdocBytes = 0;
for (const [n, s] of Object.entries(files)) {
  if (n.startsWith('.assets/')) continue;
  srcdocBytes += typeof s === 'string' ? Buffer.byteLength(s) : s.length;
}
if (srcdocBytes > 8 * 1024 * 1024) {
  throw new Error('app document too heavy: ' + srcdocBytes + ' — workers must ride .assets/');
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: monacoCodeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'monaco-code', 'monaco-code.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/monaco-code/monaco-code.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('app document', (srcdocBytes / 1048576).toFixed(2), 'MB; workers .assets/',
  ((editorWorker.length + jsonWorker.length + tsWorker.length) / 1048576).toFixed(2), 'MB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
