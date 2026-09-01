// Pack apps/tic80/ into site/apps/tic80/tic80.gif.
// Offline and deterministic: vendor pins are sha256-checked, never fetched.
//
// The engine wasm is 5.7 MB — under the 8 MB pin floor — so it rides inside
// the GIF under .assets/, served by gifos.assets(). Glue is wrapped as
// window.TIC80_START so boot.js can hand it wasmBinary after the tap that
// unlocks audio.
import { tic80Icon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const PINS = {
  'vendor/tic80.js':   { sha: '78a794efa21e41f64ac0095474396c6f74eeafbfe38bb8e867d90744494a87fe', bytes: 240206 },
  'vendor/tic80.wasm': { sha: '464b1373f5e44836f7e580d25bbbc5955a9bfb880399dc7efcb66a6bdb4e4b56', bytes: 5716041 },
};

for (const [p, pin] of Object.entries(PINS)) {
  if (!existsSync(join(dir, p))) throw new Error('missing ' + p);
  const buf = bin(p);
  if (buf.length !== pin.bytes) throw new Error(p + ' size ' + buf.length + ' != ' + pin.bytes);
  const h = sha256(buf);
  if (h !== pin.sha) throw new Error(p + ' sha256 mismatch: ' + h);
}
{
  const wasm = bin('vendor/tic80.wasm');
  if (wasm.subarray(0, 4).toString() !== '\0asm') throw new Error('vendor/tic80.wasm is not a WebAssembly module');
}

const HEAD = 'var Module=typeof Module!="undefined"?Module:{};';
let glue = read('vendor/tic80.js');
if (!glue.startsWith(HEAD)) throw new Error('tic80.js preamble changed — re-check the TIC80_START wrap');
glue = glue.slice(HEAD.length);
if (!glue.includes('FS.staticInit();')) throw new Error('tic80.js lost FS.staticInit — cannot export FS/IDBFS');
glue = glue.replace(
  'FS.staticInit();',
  'FS.staticInit();Module.FS=FS;Module.IDBFS=IDBFS;window.FS=FS;window.IDBFS=IDBFS;'
);
const startJs = 'window.TIC80_START=function(Module){Module=Module||{};window.Module=Module;' + glue + '\n};\n';
if (/<\/script/i.test(startJs)) throw new Error('tic80.js contains </script — cannot inline safely');
try { new vm.Script(startJs, { filename: 'tic80-start.js' }); }
catch (e) { throw new Error('wrapped glue does not parse: ' + e.message); }

function ticChunk(type, data, bank = 0) {
  const size = data.length;
  const h = Buffer.alloc(4 + size);
  h[0] = (bank << 5) | (type & 31);
  h[1] = size & 0xff;
  h[2] = (size >> 8) & 0xff;
  h[3] = 0;
  data.copy(h, 4);
  return h;
}
function makeTic(codeStr) {
  const code = Buffer.from(String(codeStr).replace(/\r\n/g, '\n'), 'utf8');
  return Buffer.concat([
    ticChunk(5, code),          // CHUNK_CODE
    ticChunk(17, Buffer.alloc(0)), // CHUNK_DEFAULT — sweetie-16 + default sprites
  ]);
}

const SAMPLES = [
  {
    id: 'hello', file: 'hello.tic', name: 'HELLO WORLD',
    blurb: 'The default cart. Arrows move the little computer.',
    src: 'vendor/carts/hello.lua'
  },
  {
    id: 'fire', file: 'fire.tic', name: 'Fire',
    blurb: 'Filippo\'s particle fire. The code is the picture.',
    src: 'vendor/carts/fire.lua'
  },
];

function cartsJs() {
  const parts = ['(function(root){',
    'function dec(s){var b=atob(s),u=new Uint8Array(b.length),i=0;for(;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}',
    'root.TIC_CARTS=['];
  for (const s of SAMPLES) {
    const tic = makeTic(read(s.src));
    if (tic.length < 16) throw new Error(s.src + ' encoded too small');
    parts.push('{id:' + JSON.stringify(s.id) +
      ',file:' + JSON.stringify(s.file) +
      ',name:' + JSON.stringify(s.name) +
      ',blurb:' + JSON.stringify(s.blurb) +
      ',bytes:dec("' + tic.toString('base64') + '")},');
  }
  parts.push('];})(window);');
  return parts.join('\n');
}

const carts = cartsJs();
writeFileSync(join(dir, 'carts.js'), carts);

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const helpMd = read('help.md').replace(/^\uFEFF/, '');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.author && /gifos/i.test(listing.author.name)) throw new Error('author is them, not GifOS');
if (manifest.minBuild < 1178) throw new Error('minBuild must be ≥ 1178 — gifos.assets() for packed .assets/ files');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (!manifest.capabilities.wasm) throw new Error('capabilities.wasm');
if (!manifest.capabilities.multiplayer) throw new Error('capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('no network — the engine and carts are in the GIF');

const SCRIPTS = ['tic80-start.js', 'carts.js', 'fs.js', 'touch.js', 'net.js', 'boot.js'];
const html = read('index.html');
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!html.includes('id="canvas"')) throw new Error('canvas missing');
if (!html.includes('id="add-modal"')) throw new Error('add-modal missing — TIC-80 glue looks it up');
if (!html.includes('id="upload-input"')) throw new Error('upload-input missing');
if (!html.includes('id="dpad"')) throw new Error('touch d-pad missing');
if (!html.includes('gifos.assets') && !read('boot.js').includes('gifos.assets') && !read('boot.js').includes('api.assets')) {
  throw new Error('boot.js must load the wasm through gifos.assets');
}
if (!read('boot.js').includes("'--fs=/work'")) {
  throw new Error('boot.js must pass --fs=/work so studio_create uses /work (HTML IDBFS is a different folder)');
}
if (!read('boot.js').includes("'--skip'")) throw new Error('boot.js must pass --skip');
if (!read('fs.js').includes("WORK = '/work'")) throw new Error('fs.js must seed /work');
if (!startJs.includes('window.FS=FS')) throw new Error('glue wrap must export FS onto window — IDBFS/FS are function-local inside TIC80_START');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': html,
  'style.css': read('style.css'),
  'tic80-start.js': startJs,
  'carts.js': carts,
  'fs.js': read('fs.js'),
  'touch.js': read('touch.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING-tic80.txt': read('vendor/COPYING-tic80.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  '.assets/tic80.wasm': bin('vendor/tic80.wasm'),
};

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}
for (const n of ['boot.js', 'fs.js', 'touch.js', 'net.js', 'carts.js']) {
  try { new vm.Script(files[n], { filename: n }); }
  catch (e) { throw new Error(n + ' does not parse — the app would be dead at boot: ' + e.message); }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: tic80Icon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tic80', 'tic80.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tic80/tic80.gif —', (bytes.length / 1e6).toFixed(2), 'MB, from',
            Object.keys(files).length, 'files (wasm', (PINS['vendor/tic80.wasm'].bytes / 1e6).toFixed(2), 'MB)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
