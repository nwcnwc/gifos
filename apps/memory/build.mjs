// Pack apps/memory/ into site/apps/memory/memory.gif.
import { memoryIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'script.js'))) throw new Error('vendor/script.js missing');
const PIN = '0b06d958cca39e2d5fc6758375b101ae720a8fa6a809727c0c81314a72c53621';
const srcBuf = readFileSync(join(dir, 'vendor', 'script.js'));
const hex = createHash('sha256').update(srcBuf).digest('hex');
if (hex !== PIN) throw new Error('vendor/script.js sha256 ' + hex + ' ≠ pin ' + PIN);

if (manifest.minBuild !== 947) throw new Error('minBuild');
if (manifest.appId !== 'memory') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('db+mp');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/sepandhaghighi/mnimi') throw new Error('url');
if (listing.porter.name !== 'GifOS' || /gifos/i.test(listing.author.name)) throw new Error('author');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Games') throw new Error('listing');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.tagline.length > 120) throw new Error('tagline');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'COPYING-mnimi.txt': read('vendor/COPYING-mnimi.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
if (!html.includes('src="app.js"')) throw new Error('app.js');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes('sequenceOf')) {
  throw new Error('app.js must save and expose sequence rules');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*import\s|export\s+\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-mnimi.txt'].includes('Sepand Haghighi')) throw new Error('COPYING');

{
  const ctx = { console, document: { getElementById: () => ({ addEventListener() {}, textContent: '', hidden: true, innerHTML: '', className: '', children: [], appendChild() {}, style: {} }), createElement: () => ({ addEventListener() {}, setAttribute() {}, style: {}, classList: { toggle() {}, add() {} } }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files['app.js'], ctx);
  const R = ctx.MemoryRules;
  if (!R) throw new Error('MemoryRules missing');
  if (R.padsFor(1) !== 4 || R.padsFor(8) !== 6 || R.padsFor(15) !== 8) throw new Error('pad counts');
  if (R.speedFor(1) !== 2500) throw new Error('speed0');
  const a = R.sequenceOf(1, 8), b = R.sequenceOf(1, 8);
  if (a.join() !== b.join()) throw new Error('sequence not deterministic');
  if (a.slice(0, 7).some((n) => n > 3)) throw new Error('early steps must stay on 4 pads');
}

const cover = screenshotPng();
if (cover[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), cover);

const bytes = await gif.encode(files, { preview: memoryIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'memory', 'memory.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/memory/memory.gif —', bytes.length, 'bytes,',
            (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
