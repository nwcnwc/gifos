// Pack apps/solitaire/ into site/apps/solitaire/solitaire.gif.
import { solitaireIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['app.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-solitaire.txt'))) {
  throw new Error('vendor/COPYING-solitaire.txt is missing');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'COPYING-solitaire.txt': read('vendor/COPYING-solitaire.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('Invite is OS chrome');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (manifest.capabilities.multiplayer) throw new Error('solitaire is one-player — no multiplayer');
if (manifest.capabilities.network) throw new Error('no network');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('blessed');
if (listing.basedOn.name !== 'js-solitaire') throw new Error('basedOn.name');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (!listing.author || listing.author.name !== 'rjanjic') throw new Error('author');
if (listing.license !== 'MIT') throw new Error('license');
if (listing.categories[0] !== 'Games') throw new Error('categories');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (!files['COPYING-solitaire.txt'].includes('Radovan Janjic')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')")) throw new Error('must save privately');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

{
  const ctx = { window: {}, console, document: { getElementById: () => ({ onclick: null, hidden: true, appendChild: () => {}, addEventListener: () => {} }) }, Date };
  ctx.window = ctx;
  // stub enough DOM for the IIFE to boot without throwing on missing nodes
  const stub = () => {
    const el = {
      className: '', classList: { add() {}, remove() {}, toggle() {} },
      style: {}, innerHTML: '', onclick: null, onpointerdown: null,
      appendChild() { return el; }, querySelector() { return { textContent: '' }; },
      querySelectorAll() { return []; }, getBoundingClientRect() { return { top: 0, left: 0, width: 10, height: 10 }; }
    };
    return el;
  };
  ctx.document = {
    getElementById: stub,
    createElement: stub,
    addEventListener() {}
  };
  ctx.window.addEventListener = () => {};
  vm.runInNewContext(
    files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  if (!Klondike.canPlace(12, "h", 13, "s")) throw new Error("qh on ks");\n' +
    '  if (Klondike.canPlace(12, "h", 13, "d")) throw new Error("same colour");\n' +
    '  if (!Klondike.kingOnEmpty(13) || Klondike.kingOnEmpty(12)) throw new Error("king");\n' +
    '  if (!Klondike.aceOnFoundation(1) || Klondike.aceOnFoundation(2)) throw new Error("ace");\n' +
    '  return "ok";\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 'ok') throw new Error('klondike self-test ' + ctx.result);
  console.log('klondike rules ok');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: solitaireIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'solitaire', 'solitaire.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/solitaire/solitaire.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
