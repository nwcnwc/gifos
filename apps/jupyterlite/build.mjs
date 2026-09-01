// Pack apps/jupyterlite/ into site/apps/jupyterlite/jupyterlite.gif (see apps/README.md).
//
// WHAT RIDES WHERE
//   in the GIF   the notebook UI, Pyodide 0.27.7 glue (classic worker bundle),
//                python_stdlib.zip and pyodide-lock.json under `.assets/`.
//   by asset pin pyodide.asm.wasm (~10 MB, optional) — hashed in vendor/UPSTREAM.txt.
//                Downloaded the first time a cell runs, then stays on this device.
//
// Glue is concatenated with kernel.js into window.KERNEL_WORKER_SRC. Wasm,
// stdlib and lock arrive via gifos.assets() and are transferred into the
// worker. kernel.js replaces fetch() with a map of those buffers so
// loadPyodide's CDN URLs resolve from memory — the worker never hits the wire.
//
// Run:  node apps/jupyterlite/build.mjs
import { deflateRawSync } from 'node:zlib';
import { jupyterliteIcon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function pinsFromUpstream() {
  const pins = {};
  const re = /https:\/\/cdn\.jsdelivr\.net\/pyodide\/v0\.27\.7\/full\/(\S+)\n\s+sha256\s+([0-9a-f]{64})\n\s+bytes\s+(\d+)/g;
  const txt = read('vendor/UPSTREAM.txt');
  let m;
  while ((m = re.exec(txt))) {
    pins[m[1]] = { url: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' + m[1], sha256: m[2], bytes: +m[3] };
  }
  for (const need of ['pyodide.js', 'pyodide.asm.js', 'python_stdlib.zip', 'pyodide-lock.json', 'pyodide.asm.wasm']) {
    if (!pins[need]) throw new Error('UPSTREAM.txt missing pin for ' + need);
  }
  return pins;
}

for (const need of [
  'vendor/pyodide.js', 'vendor/pyodide.asm.js', 'vendor/python_stdlib.zip',
  'vendor/pyodide-lock.json', 'vendor/UPSTREAM.txt',
  'kernel.js', 'app.js', 'index.html', 'style.css', 'help.md',
  'COPYING.txt', 'COPYING-pyodide.txt', 'COPYING-python.txt',
  'manifest.json', 'listing.json', 'icon.mjs'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const pins = pinsFromUpstream();

if (manifest.appId !== 'jupyterlite') throw new Error('appId');
if (manifest.minBuild !== 1381) throw new Error('minBuild must be 1381 — optional asset pin');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (!manifest.capabilities.wasm) throw new Error('capabilities.wasm');
if (!manifest.capabilities.multiplayer) throw new Error('capabilities.multiplayer — Invite shares cells');
if (manifest.capabilities.network) throw new Error('no network — wasm is an OS pin, not gifos.fetch');
if (!manifest.data || !manifest.data.notebook || manifest.data.notebook.visibility !== 'read-write') {
  throw new Error('data.notebook must be read-write so Invite shares cells');
}
if (!manifest.data.prefs || manifest.data.prefs.visibility !== 'private') throw new Error('prefs private');
if (!Array.isArray(manifest.assets) || manifest.assets.length !== 1) throw new Error('one optional wasm pin');
{
  const a = manifest.assets[0];
  const p = pins['pyodide.asm.wasm'];
  if (!p) throw new Error('UPSTREAM.txt has no pyodide.asm.wasm pin');
  if (a.path !== 'pyodide.asm.wasm') throw new Error('asset path');
  if (a.optional !== true) throw new Error('wasm pin must be optional — do not pack 10 MB in the GIF');
  if (a.sha256 !== p.sha256) throw new Error('manifest wasm sha256 drifted from UPSTREAM.txt');
  if (a.bytes !== p.bytes) throw new Error('manifest wasm bytes drifted from UPSTREAM.txt');
  if (a.url !== p.url) throw new Error('manifest wasm url drifted from UPSTREAM.txt');
}

if (listing.license !== 'BSD-3-Clause') throw new Error('listing.license must be BSD-3-Clause (JupyterLite)');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'JupyterLite') throw new Error('basedOn.name');
if (listing.author.name === 'GifOS') throw new Error('author is them, never GifOS');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (!listing.homepage.includes('/apps/jupyterlite')) throw new Error('homepage');
if (listing.tagline.length > 120) throw new Error('tagline too long');
{
  const blob = JSON.stringify(listing) + read('help.md');
  for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN']) {
    if (blob.includes(bad)) throw new Error('listing/help mentions ' + bad);
  }
}

const VENDOR_FILES = {
  'pyodide.js': 'vendor/pyodide.js',
  'pyodide.asm.js': 'vendor/pyodide.asm.js',
  'python_stdlib.zip': 'vendor/python_stdlib.zip',
  'pyodide-lock.json': 'vendor/pyodide-lock.json',
};
for (const [name, path] of Object.entries(VENDOR_FILES)) {
  const p = pins[name];
  if (!p) throw new Error('UPSTREAM.txt has no pin for ' + name);
  const buf = bin(path);
  if (buf.length !== p.bytes) throw new Error(path + ' size ' + buf.length + ' != ' + p.bytes);
  const h = sha256(buf);
  if (h !== p.sha256) throw new Error(path + ' sha256 drifted from UPSTREAM.txt — ' + h);
}

const glueJs = read('vendor/pyodide.js');
const asmJs = read('vendor/pyodide.asm.js');
const kernelSrc = read('kernel.js');
const appJs = read('app.js');
const indexHtml = read('index.html');
const styleCss = read('style.css');
const stdlib = bin('vendor/python_stdlib.zip');
const lockBuf = bin('vendor/pyodide-lock.json');

if (!glueJs.includes('loadPyodide')) throw new Error('pyodide.js lost loadPyodide');
if (!asmJs.includes('_createPyodideModule')) throw new Error('pyodide.asm.js lost _createPyodideModule');
if (asmJs.includes('import.meta')) throw new Error('pyodide.asm.js uses import.meta — cannot run as a classic worker');
if (stdlib[0] !== 0x50 || stdlib[1] !== 0x4b) throw new Error('python_stdlib.zip is not a zip');
{
  const lock = JSON.parse(lockBuf.toString('utf8'));
  if (!lock.info || lock.info.version !== '0.27.7') throw new Error('pyodide-lock.json is not 0.27.7');
}

for (const [n, s] of [['kernel.js', kernelSrc], ['app.js', appJs]]) {
  try { new vm.Script(s, { filename: n }); }
  catch (e) { throw new Error(n + ' does not parse: ' + e.message); }
}

const codeLines = (s) => s.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');
for (const [n, s] of [['app.js', codeLines(appJs)], ['kernel.js', codeLines(kernelSrc)]]) {
  for (const bad of ['new Function(', 'eval(', 'XMLHttpRequest', "type: 'module'", 'type:"module"']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (codeLines(appJs).includes('importScripts(')) throw new Error('app.js importScripts');
if (codeLines(kernelSrc).includes('importScripts(')) throw new Error('kernel.js importScripts — glue is concatenated');
if (!appJs.includes('gifos.assets')) throw new Error('app.js does not call gifos.assets');
if (!appJs.includes('pyodide.asm.wasm')) throw new Error('app.js no longer asks for pyodide.asm.wasm');
if (!appJs.includes('python_stdlib.zip')) throw new Error('app.js no longer asks for python_stdlib.zip');
if (!appJs.includes('pyodide-lock.json')) throw new Error('app.js no longer asks for pyodide-lock.json');
if (!appJs.includes("gifos.db('notebook')")) throw new Error('app.js must persist the notebook in gifos.db');
if (!kernelSrc.includes('installFetch')) throw new Error('kernel.js must intercept fetch so the loader never hits the network');
if (!kernelSrc.includes('There is no pip here')) throw new Error('kernel.js must tell the truth about missing packages');
if (!kernelSrc.includes('REPODATA_PACKAGES_IMPORT_TO_PACKAGE_NAME')) {
  throw new Error('kernel.js must silence Pyodide package-install notes');
}
if (!kernelSrc.includes('_NotInThisFile')) throw new Error('kernel.js must intercept lock-listed imports');
{
  const blob = JSON.stringify(listing) + read('help.md');
  if (!/not in this file/.test(blob)) throw new Error('listing/help must say numpy is not in this file');
  if (!/\bno pip\b/i.test(blob)) throw new Error('listing/help must not claim pip');
  for (const bad of ['micropip.install', 'pyodide.loadPackage', 'pip install']) {
    if (blob.includes(bad)) throw new Error('listing/help offers ' + bad);
  }
}
if (!indexHtml.includes('src="worker-src.js"') || !indexHtml.includes('src="app.js"')) {
  throw new Error('index.html missing scripts');
}
if (!indexHtml.includes('href="style.css"')) throw new Error('index.html missing style.css');
if (/<button\b[^>]*>\s*Invite\s*</i.test(indexHtml)) throw new Error('Invite is OS chrome');

const workerBundle = glueJs + '\n' + asmJs + '\n' + kernelSrc;
if (/<\/script/i.test(workerBundle)) throw new Error('worker bundle contains </script');
const workerModule = ('window.KERNEL_WORKER_SRC=' + JSON.stringify(workerBundle) + ';').split('</').join('<\\/');
try { new vm.Script(workerModule, { filename: 'worker-src.js' }); }
catch (e) { throw new Error('worker-src.js does not parse: ' + e.message); }

const help = read('help.md').replace(/^\uFEFF/, '').trim();
if (help.length < 400) throw new Error('help.md trimmed length must be >= 400, got ' + help.length);

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': indexHtml,
  'style.css': styleCss,
  'worker-src.js': workerModule,
  'app.js': appJs,
  '.assets/python_stdlib.zip': stdlib,
  '.assets/pyodide-lock.json': lockBuf,
  'help.md': read('help.md'),
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-pyodide.txt': read('COPYING-pyodide.txt'),
  'COPYING-python.txt': read('COPYING-python.txt'),
};

const HREF_OK = new Set(['app.js', 'worker-src.js', 'style.css']);
for (const m of indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  if (!(m[1] in files)) throw new Error('index.html loads script "' + m[1] + '", which build.mjs does not pack.');
}
for (const m of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  if (m[1] in files && !HREF_OK.has(m[1])) {
    throw new Error('index.html references packed file "' + m[1] + '" by src/href — would become a data: URL. Use gifos.assets() instead.');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jupyterliteIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'jupyterlite');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'jupyterlite.gif'), bytes);

try {
  const sharp = (await import('sharp')).default;
  const cover = await sharp(shot)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  writeFileSync(join(outDir, 'cover.jpg'), cover);
  console.log('wrote site/apps/jupyterlite/cover.jpg —', (cover.length / 1024).toFixed(0), 'KB');
} catch (e) {
  console.log('note: could not write cover.jpg (' + e.message + ') — catalog will make it from screenshot.png');
}

const raw = Object.values(files).reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : v.length), 0);
console.log('wrote site/apps/jupyterlite/jupyterlite.gif —', (bytes.length / 1e6).toFixed(2), 'MB from',
  Object.keys(files).length, 'files (' + (raw / 1e6).toFixed(2), 'MB raw: stdlib in-GIF, interpreter wasm by optional asset pin)');
console.log('Python wasm on-demand:', (pins['pyodide.asm.wasm'].bytes / 1e6).toFixed(2), 'MB', pins['pyodide.asm.wasm'].url);
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
