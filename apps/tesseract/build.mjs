// Pack apps/tesseract/ into site/apps/tesseract/tesseract.gif (see apps/README.md).
//
// WHAT RIDES WHERE
//   in the GIF   the app, the tesseract.js-core SIMD-LSTM glue, and the wasm
//                under `.assets/tesseract-core.wasm` (gifos.assets, no network).
//   by asset pin English tessdata_best (~15 MB) — optional, sha256-pinned.
//                Downloaded the first time you read a page.
//
// The wasm must NOT be referenced from index.html: the runtime would inline
// it as a data: URL in the srcdoc. Same lesson as pdf-tables-ocr.
//
// Run:  node apps/tesseract/build.mjs
import { deflateRawSync } from 'node:zlib';
import { tesseractIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Same polyfill as the other app packers.
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
const pins = JSON.parse(read('LANG-PINS.json'));

// ---- pins must agree with the manifest and the vendored bytes ---------------
{
  const wanted = new Set(pins.langs.map((l) => l.asset));
  const pinned = new Set((manifest.assets || []).map((a) => a.path));
  for (const w of wanted) if (!pinned.has(w)) throw new Error('LANG-PINS.json wants asset "' + w + '" but manifest.json pins no such path');
  for (const p of pinned) if (!wanted.has(p)) throw new Error('manifest.json pins asset "' + p + '" that LANG-PINS.json never names');
  for (const l of pins.langs) {
    const a = (manifest.assets || []).find((x) => x.path === l.asset);
    if (!a) throw new Error('missing manifest pin for ' + l.asset);
    if (a.sha256 !== l.sha256 || a.bytes !== l.bytes || a.url !== l.url) {
      throw new Error(l.id + ': manifest.json and LANG-PINS.json disagree — edit them together');
    }
    if (a.optional !== true) throw new Error(l.asset + ' must be optional — the GIF is supposed to stay small');
  }
}

const glue = read('vendor/tesseract-core-simd-lstm.js');
const wasm = bin('vendor/tesseract-core-simd-lstm.wasm');
const workerSrc = read('worker.js');
const appJs = read('app.js');
const indexHtml = read('index.html');
const styleCss = read('style.css');

const gluePin = pins.core.files['tesseract-core-simd-lstm.js'];
const wasmPin = pins.core.files['tesseract-core-simd-lstm.wasm'];
if (sha256(Buffer.from(glue)) !== gluePin.sha256) throw new Error('vendor glue sha256 drifted from LANG-PINS.json — rerun vendor.mjs or update the pin');
if (sha256(wasm) !== wasmPin.sha256 || wasm.length !== wasmPin.bytes) throw new Error('vendor wasm drifted from LANG-PINS.json');
if (wasm.subarray(0, 4).toString() !== '\0asm') throw new Error('vendor wasm is not a WebAssembly module');

if (!glue.startsWith('var TesseractCore=')) throw new Error('glue no longer assigns var TesseractCore= — update worker boot');
if (!glue.includes('instantiateWasm')) throw new Error('glue lost instantiateWasm — the no-fetch boot path is gone');
if (!glue.includes('SetImageFile')) throw new Error('glue lost SetImageFile — worker.js cannot feed images');
if (!glue.includes('GetUTF8Text')) throw new Error('glue lost GetUTF8Text');
if (/<\/script/i.test(glue)) throw new Error('glue contains </script — cannot put it in a blob worker inlined as a JS string');
if (glue.includes('import.meta')) throw new Error('glue uses import.meta — cannot run as a classic worker');

const codeLines = (s) => s.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');
for (const [n, s] of [['app.js', codeLines(appJs)], ['worker.js', codeLines(workerSrc)]]) {
  for (const bad of ['new Function(', 'eval(', 'XMLHttpRequest', 'importScripts(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ', which the app sandbox forbids.');
  }
}

// Glue + worker as one classic script the app turns into a blob: Worker.
const workerBundle = glue + '\n' + workerSrc;
if (/<\/script/i.test(workerBundle)) throw new Error('worker bundle contains </script');
const workerModule = ('window.OCR_WORKER_SRC=' + JSON.stringify(workerBundle) + ';').split('</').join('<\\/');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': indexHtml,
  'style.css': styleCss,
  'app.js': appJs,
  'worker-src.js': workerModule,
  '.assets/tesseract-core.wasm': wasm,
  'COPYING-tesseract.txt': read('COPYING-tesseract.txt'),
};
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md trimmed length must be >= 400');

if (!appJs.includes('tesseract-core.wasm')) throw new Error('app.js no longer asks for tesseract-core.wasm');
if (!appJs.includes('eng.traineddata')) throw new Error('app.js no longer asks for eng.traineddata');
if (!appJs.includes('gifos.assets')) throw new Error('app.js does not call gifos.assets');

for (const m of indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  if (!(m[1] in files)) throw new Error('index.html loads script "' + m[1] + '", which build.mjs does not pack.');
}
if (!indexHtml.includes('href="style.css"')) throw new Error('index.html does not load style.css');
const HREF_OK = new Set(['app.js', 'worker-src.js', 'style.css']);
for (const m of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  if (m[1] in files && !HREF_OK.has(m[1])) {
    throw new Error('index.html references packed file "' + m[1] + '" by src/href — would become a data: URL. Use gifos.assets() instead.');
  }
}

const bytes = await gif.encode(files, { preview: tesseractIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'tesseract');
mkdirSync(outDir, { recursive: true });
const gifPath = join(outDir, 'tesseract.gif');
writeFileSync(gifPath, bytes);

const rec = {
  catalog: '1.0',
  slug: 'tesseract',
  appId: manifest.appId,
  name: manifest.name,
  shortName: manifest.shortName,
  version: manifest.version,
  minBuild: manifest.minBuild,
  tagline: listing.tagline,
  description: listing.description,
  author: listing.author,
  releaseDate: listing.releaseDate,
  updated: listing.updated || listing.releaseDate,
  categories: listing.categories,
  tags: listing.tags || [],
  license: listing.license,
  homepage: listing.homepage || '',
  accent: manifest.accent || null,
  capabilities: manifest.capabilities || {},
  cover: '/apps/tesseract/cover.jpg',
  screenshots: [],
  gif: '/apps/tesseract/tesseract.gif',
  bytes: bytes.length,
  download: 0,
  provides: null,
  sha256: sha256(bytes),
  signature: null,
  porter: listing.porter,
  basedOn: listing.basedOn,
};
writeFileSync(join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');

const raw = Object.values(files).reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : v.length), 0);
console.log('wrote site/apps/tesseract/tesseract.gif —', (bytes.length / 1e6).toFixed(2), 'MB from',
  Object.keys(files).length, 'files (' + (raw / 1e6).toFixed(2), 'MB raw: engine in-GIF, English by optional asset pin)');
console.log('English on-demand:', (pins.langs[0].bytes / 1e6).toFixed(2), 'MB', pins.langs[0].url);
if (!existsSync(join(outDir, 'cover.jpg'))) {
  console.log('note: site/apps/tesseract/cover.jpg is missing — generate it from screenshot.png');
}
