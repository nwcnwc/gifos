// Pack apps/pdf-tables/ source into the downloadable
// site/apps/pdf-tables/pdf-tables.gif (see apps/README.md).
//
// Everything rides IN the GIF — there is no asset pin and no network:
//   pdf.js     → vendor/pdf.min.js (Apache-2.0), the 2.16 LEGACY UMD build. 2.x
//                on purpose: 4.x uses dynamic import() and the sandbox CSP has
//                no blob: in script-src, so it cannot load. 2.x is classic
//                scripts + a blob: worker, which capabilities.wasm allows. The
//                app runs it with isEvalSupported:false so its new Function/eval
//                paths (which the CSP also forbids) are never taken.
//   pdf-worker → window.PDF_WORKER_SRC: the worker source as a string; app.js
//                mints a blob: URL from it (worker-src blob:, the wasm hatch).
//   xlsx.js    → vendor/xlsx.full.min.js (SheetJS, Apache-2.0), pure JS.
//
// Run:  node apps/pdf-tables/build.mjs
import { pdfTablesIcon } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush — the
// encoder is not a streaming compressor anyway.
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
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

const pdfLib = read('vendor/pdf.min.js');
const pdfWorker = read('vendor/pdf.worker.min.js');
const xlsx = read('vendor/xlsx.full.min.js');

// The runtime INLINES each <script src> into the app document, so a </script in
// a bundle would end the tag early. The legacy libs have none, but assert it —
// a future bump that minifies a string containing </script must break HERE.
for (const [n, s] of [['pdf.min.js', pdfLib], ['xlsx.full.min.js', xlsx], ['pdf.worker.min.js', pdfWorker]]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely; escape it in build.mjs.');
}
// These are CLASSIC UMD scripts (they self-attach window.pdfjsLib / window.XLSX)
// — no ESM syntax may sneak in, or the inlined classic <script> is a SyntaxError.
for (const [n, s] of [['pdf.min.js', pdfLib], ['xlsx.full.min.js', xlsx]]) {
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' now uses ESM syntax — the classic-script inline path cannot carry it.');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'pdf.js': pdfLib,
  'xlsx.js': xlsx,
  // The worker source as a string the app turns into a blob: worker.
  'pdf-worker.js': ('window.PDF_WORKER_SRC=' + JSON.stringify(pdfWorker) + ';').split('</').join('<\\/'),
  'LICENSE-pdfjs.txt': read('vendor/LICENSE-pdfjs.txt'),
  'LICENSE-sheetjs.txt': read('vendor/LICENSE-sheetjs.txt'),
};

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

const bytes = await gif.encode(files, { preview: pdfTablesIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pdf-tables', 'pdf-tables.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pdf-tables/pdf-tables.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (pdf.js + SheetJS in-GIF, no network, no asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
