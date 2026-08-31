// Pack apps/ffmpeg-studio/ into site/apps/ffmpeg-studio/ffmpeg-studio.gif.
//
// WHAT RIDES WHERE
//   in the GIF   the app, the @ffmpeg/core 0.12.10 glue (classic worker bundle).
//   by asset pin ffmpeg-core.wasm (~31 MB, required) — hashed in UPSTREAM.txt.
//
// Glue is concatenated with worker.js into window.FF_WORKER_SRC. Wasm bytes
// arrive via gifos.assets('ffmpeg-core.wasm'). Instantiation uses wasmBinary
// + instantiateWasm, so the glue never fetch()es.
//
// Run:  node apps/ffmpeg-studio/build.mjs
import { deflateRawSync } from 'node:zlib';
import { ffmpegStudioIcon, screenshotPng } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

function pinsFromUpstream() {
  const pins = {};
  for (const line of read('vendor/UPSTREAM.txt').split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s+([0-9a-f]{64})\s*$/);
    if (m) pins[m[1]] = { bytes: +m[2], sha256: m[3] };
  }
  return pins;
}

for (const need of [
  'vendor/ffmpeg-core.js', 'vendor/UPSTREAM.txt', 'worker.js', 'engine.js', 'app.js',
  'index.html', 'style.css', 'help.md', 'COPYING-ffmpeg-core.txt', 'COPYING-ffmpegwasm.txt',
  'manifest.json', 'listing.json'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.appId !== 'ffmpeg-studio') throw new Error('appId');
if (manifest.minBuild < 1178) throw new Error('minBuild must be ≥ 1178 — required asset pin');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (!manifest.capabilities.wasm) throw new Error('capabilities.wasm');
if (manifest.capabilities.network) throw new Error('no network');
if (manifest.capabilities.multiplayer) throw new Error('this converter is solo — do not declare multiplayer');
if (!manifest.data.prefs || manifest.data.prefs.visibility !== 'private') throw new Error('prefs private');
if (!manifest.data.files || manifest.data.files.visibility !== 'private') throw new Error('files private');
if (!Array.isArray(manifest.assets) || manifest.assets.length !== 1) throw new Error('one required wasm pin');
{
  const a = manifest.assets[0];
  if (a.path !== 'ffmpeg-core.wasm') throw new Error('asset path');
  if (a.optional) throw new Error('wasm pin is required — the app cannot run without it');
  if (a.bytes !== 32232419) throw new Error('asset bytes');
  if (a.sha256 !== '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7') {
    throw new Error('asset sha256 drifted from the pin');
  }
  if (!/^https:\/\/cdn\.jsdelivr\.net\/npm\/@ffmpeg\/core@0\.12\.10\//.test(a.url)) {
    throw new Error('asset url must be the pinned jsDelivr @ffmpeg/core@0.12.10 wasm');
  }
}

if (listing.license !== 'GPL-2.0-or-later') throw new Error('listing.license must be GPL-2.0-or-later');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'ffmpeg.wasm') throw new Error('basedOn.name');
if (listing.author.name !== 'Jerome Wu') throw new Error('author is Jerome Wu, not GifOS');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (!listing.homepage.includes('/apps/ffmpeg-studio')) throw new Error('homepage');
if (listing.tagline.length > 120) throw new Error('tagline too long');
{
  const blob = JSON.stringify(listing) + read('help.md');
  for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN']) {
    if (blob.includes(bad)) throw new Error('listing/help mentions ' + bad);
  }
}

const pins = pinsFromUpstream();
const glue = read('vendor/ffmpeg-core.js');
if (sha256(Buffer.from(glue)) !== pins['ffmpeg-core.js'].sha256) {
  throw new Error('vendor/ffmpeg-core.js drifted from UPSTREAM.txt — rerun vendor.mjs');
}
if (Buffer.byteLength(glue) !== pins['ffmpeg-core.js'].bytes) throw new Error('glue size drifted');
if (!glue.includes('createFFmpegCore')) throw new Error('glue lost createFFmpegCore');
if (!glue.includes('wasmBinary')) throw new Error('glue lost wasmBinary');
if (!glue.includes('instantiateWasm')) throw new Error('glue lost instantiateWasm');
if (glue.includes('import.meta')) throw new Error('glue uses import.meta');
if (/<\/script/i.test(glue)) throw new Error('glue contains </script');
if (pins['ffmpeg-core.wasm'].sha256 !== manifest.assets[0].sha256) {
  throw new Error('UPSTREAM wasm sha256 ≠ manifest pin');
}
if (pins['ffmpeg-core.wasm'].bytes !== manifest.assets[0].bytes) throw new Error('UPSTREAM wasm bytes ≠ manifest');

const workerSrc = read('worker.js');
const engineJs = read('engine.js');
const appJs = read('app.js');
const indexHtml = read('index.html');
const styleCss = read('style.css');

for (const [n, s] of [['worker.js', workerSrc], ['engine.js', engineJs], ['app.js', appJs]]) {
  try { new vm.Script(s, { filename: n }); }
  catch (e) { throw new Error(n + ' does not parse: ' + e.message); }
}

const codeLines = (s) => s.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');
for (const [n, s] of [['app.js', codeLines(appJs)], ['engine.js', codeLines(engineJs)], ['worker.js', codeLines(workerSrc)]]) {
  for (const bad of ['new Function(', 'eval(', 'XMLHttpRequest', "type: 'module'", 'type:"module"']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (codeLines(appJs).includes('importScripts(')) throw new Error('app.js importScripts');
if (codeLines(engineJs).includes('importScripts(')) throw new Error('engine.js importScripts');
if (codeLines(workerSrc).includes('importScripts(')) throw new Error('worker.js importScripts — glue is concatenated');
if (!appJs.includes("gifos.db('files')") || !appJs.includes("gifos.db('prefs')")) {
  throw new Error('app.js must persist output/prefs in gifos.db');
}
if (!engineJs.includes("gifos.assets('ffmpeg-core.wasm')") && !engineJs.includes('ffmpeg-core.wasm')) {
  throw new Error('engine.js must load ffmpeg-core.wasm via gifos.assets');
}
if (!indexHtml.includes('src="worker-src.js"') || !indexHtml.includes('src="engine.js"') || !indexHtml.includes('src="app.js"')) {
  throw new Error('index.html missing scripts');
}
if (!indexHtml.includes('href="style.css"')) throw new Error('index.html missing style.css');
if (/<button\b[^>]*>\s*Invite\s*</i.test(indexHtml)) throw new Error('Invite is OS chrome');

const workerBundle = glue + '\n' + workerSrc;
if (/<\/script/i.test(workerBundle)) throw new Error('worker bundle contains </script');
const workerModule = ('window.FF_WORKER_SRC=' + JSON.stringify(workerBundle) + ';').split('</').join('<\\/');
try { new vm.Script(workerModule, { filename: 'worker-src.js' }); }
catch (e) { throw new Error('worker-src.js does not parse: ' + e.message); }

const help = read('help.md').replace(/^\uFEFF/, '').trim();
if (help.length < 400) throw new Error('help.md trimmed length must be >= 400, got ' + help.length);

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': indexHtml,
  'style.css': styleCss,
  'worker-src.js': workerModule,
  'engine.js': engineJs,
  'app.js': appJs,
  'help.md': read('help.md'),
  'COPYING-ffmpeg-core.txt': read('COPYING-ffmpeg-core.txt'),
  'COPYING-ffmpegwasm.txt': read('COPYING-ffmpegwasm.txt'),
};

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: ffmpegStudioIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'ffmpeg-studio', 'ffmpeg-studio.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/ffmpeg-studio/ffmpeg-studio.gif —', (bytes.length / 1024).toFixed(0), 'KB from',
  Object.keys(files).length, 'files (wasm pin', (manifest.assets[0].bytes / 1e6).toFixed(1), 'MB, not in GIF)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
