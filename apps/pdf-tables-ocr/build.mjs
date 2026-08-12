// Pack apps/pdf-tables-ocr/ source into the downloadable
// site/apps/pdf-tables-ocr/pdf-tables-ocr.gif (see apps/README.md).
//
// The GPU sibling of pdf-tables. Everything rides IN the GIF — three ONNX
// models, the WebGPU inference engine, pdf.js and SheetJS — and there is no
// asset pin and no network:
//   pdf.js     → vendor/pdf.min.js, the 2.16 LEGACY UMD build (4.x uses dynamic
//                import(), which the sandbox CSP cannot load). Run with
//                isEvalSupported:false.
//   pdf-worker → window.PDF_WORKER_SRC, a string the app turns into a blob:
//                worker (worker-src blob:, the wasm hatch).
//   xlsx.js    → SheetJS, pure JS.
//   ort.js     → vendor/ort-esm.js (ort.webgpu.bundle.min.mjs), ESM rewritten to
//                window.ort exactly as offline-tts-kokoro does it.
//   ort-wasm.wasm, det.onnx, rec.onnx, table.onnx, and both dictionaries ride as
//                RAW BYTES. The runtime rewrites the <link href> pointing at
//                each one into a data: URL and the app fetch()es it back — the
//                browser does the base64 decode natively, so ~40 MB of weights
//                never becomes a JS string literal the parser has to chew.
//
// The DECODER CONTRACT is asserted here against the model files themselves: the
// recognition head must be 97 classes (blank + 95 en_dict entries + space) and
// the structure head 30 (sos + 28 tokens + eos). A model swapped for one with a
// different vocabulary would otherwise decode into convincing garbage.
//
// Run:  node apps/pdf-tables-ocr/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { pdfOcrIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

// ---- the classic libs -------------------------------------------------------
const pdfLib = read('vendor/pdf.min.js');
const pdfWorker = read('vendor/pdf.worker.min.js');
const xlsx = read('vendor/xlsx.full.min.js');
const ocrJs = read('ocr.js');
const appJs = read('app.js');
const indexHtml = read('index.html');

// ---- ORT: ESM → plain script (lock-step with offline-tts-kokoro) ------------
let ortJs = read('vendor/ort-esm.js');
const ORT_EXPORT_RE = /export\{([^}]*)\};?/;
const om = ORT_EXPORT_RE.exec(ortJs);
if (!om) throw new Error('vendor/ort-esm.js: export block not found — the bundle shape changed; update build.mjs.');
const ortExports = om[1].split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
  const parts = pair.split(/\s+as\s+/);
  return parts.length === 2 ? `${parts[1].trim()}: ${parts[0].trim()}` : parts[0];
});
for (const want of ['InferenceSession:', 'Tensor:', 'env:']) {
  if (!ortExports.some((e) => e.startsWith(want))) throw new Error('ORT no longer exports ' + want.slice(0, -1));
}
ortJs = ortJs.replace(ORT_EXPORT_RE, `window.ort = { ${ortExports.join(', ')} };`);
if (!ortJs.includes('import.meta.url')) throw new Error('vendor/ort-esm.js no longer uses import.meta.url — re-check the rewrite in build.mjs.');
ortJs = ortJs.split('import.meta.url').join('"https://ort.invalid/gifos-inlined/"');
for (const bad of ['import.meta', 'import(']) {
  if (ortJs.includes(bad)) throw new Error('ORT bundle still contains ' + bad + ' after the rewrite — it cannot be inlined as a classic script.');
}
if (/^export\s|export\{/m.test(ortJs)) throw new Error('vendor/ort-esm.js still contains an export statement after the rewrite.');
ortJs = '(function(){\n' + ortJs + '\n})();\n';

// ---- sandbox audits ---------------------------------------------------------
// The runtime INLINES each <script src> into the app document, so a </script in
// a bundle would end the tag early, and ESM syntax would be a SyntaxError in a
// classic script. A NUL byte is its own hazard: it makes the file "binary" to
// every ordinary grep, so a bug hides in a file nobody can search.
const SCRIPTS = [
  ['pdf.min.js', pdfLib], ['xlsx.full.min.js', xlsx], ['ort.js', ortJs],
  ['ocr.js', ocrJs], ['app.js', appJs], ['index.html', indexHtml],
];
for (const [n, s] of SCRIPTS.concat([['pdf.worker.min.js', pdfWorker]])) {
  if (n !== 'index.html' && /<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely; escape it in build.mjs.');
  if (s.includes('\u0000')) throw new Error(n + ' contains a NUL byte — strip it (it makes the file unsearchable by grep).');
}
for (const [n, s] of [['pdf.min.js', pdfLib], ['xlsx.full.min.js', xlsx], ['ort.js', ortJs], ['ocr.js', ocrJs], ['app.js', appJs]]) {
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' now uses ESM syntax — the classic-script inline path cannot carry it.');
}
// Our own code must never reach for eval or the network: the CSP forbids both,
// and a violation would only show up at run time in a user's hands. Comment
// lines are skipped — this file's own prose explains what it forbids, and so
// does app.js's.
const codeLines = (s) => s.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
}).join('\n');
for (const [n, s] of [['ocr.js', codeLines(ocrJs)], ['app.js', codeLines(appJs)]]) {
  // The trailing "(" is what makes these CALLS rather than prose: both files
  // discuss new Function/eval in comments explaining why they never use them.
  for (const bad of ['new Function(', 'eval(', 'XMLHttpRequest', 'importScripts(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ', which the app sandbox forbids.');
  }
}

// ---- the decoder contract, asserted against the ONNX files ------------------
// A hand-rolled ONNX (protobuf) output-shape reader. ModelProto.graph=7;
// GraphProto.output=12; ValueInfoProto.name=1,type=2; TypeProto.tensor_type=1;
// Tensor.shape=2; TensorShapeProto.dim=1; Dimension.dim_value=1.
function protoScan(buf, want) {
  let p = 0;
  const varint = () => { let r = 0n, s = 0n; for (;;) { const b = buf[p++]; r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) break; s += 7n; } return r; };
  const out = [];
  while (p < buf.length) {
    const k = Number(varint());
    const field = k >>> 3, wire = k & 7;
    if (wire === 2) {
      const n = Number(varint());
      const sub = buf.subarray(p, p + n); p += n;
      if (field === want) out.push(sub);
    } else if (wire === 0) varint();
    else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else throw new Error('unexpected protobuf wire type ' + wire);
  }
  return out;
}
function lastDims(onnxPath) {
  const buf = bin(onnxPath);
  const graph = protoScan(buf, 7)[0];
  if (!graph) throw new Error(onnxPath + ': no ONNX graph found — is this really a model file?');
  return protoScan(graph, 12).map((vi) => {
    const type = protoScan(vi, 2)[0];
    const tensor = type ? protoScan(type, 1)[0] : null;
    const shape = tensor ? protoScan(tensor, 2)[0] : null;
    const dims = shape ? protoScan(shape, 1).map((d) => {
      // dim_value is a varint field (wire 0), so protoScan skips it; read it here.
      let q = 0, v = null;
      while (q < d.length) {
        const kk = d[q] & 0x7f, f = kk >>> 3, w = kk & 7; q++;
        if (f === 1 && w === 0) { let r = 0n, s = 0n; for (;;) { const b = d[q++]; r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) break; s += 7n; } v = Number(r); break; }
        break;
      }
      return v;
    }) : [];
    return dims.length ? dims[dims.length - 1] : null;
  });
}

const dictLines = (p) => {
  const lines = read(p).split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
};
const recDict = dictLines('vendor/en_dict.txt');
const tableDict = dictLines('vendor/table_structure_dict.txt');
const REC_CLASSES = recDict.length + 2;      // blank + dict + space
const TABLE_CLASSES = tableDict.length + 2;  // sos + dict + eos
if (REC_CLASSES !== 97) throw new Error('vendor/en_dict.txt has ' + recDict.length + ' entries -> ' + REC_CLASSES + ' classes; the recognition head is 97. Wrong dictionary.');
if (TABLE_CLASSES !== 30) throw new Error('vendor/table_structure_dict.txt has ' + tableDict.length + ' entries -> ' + TABLE_CLASSES + ' classes; the structure head is 30. Wrong dictionary.');

const recOut = lastDims('vendor/rec.onnx');
if (!recOut.includes(REC_CLASSES)) throw new Error('vendor/rec.onnx outputs ' + JSON.stringify(recOut) + ' classes, not ' + REC_CLASSES + ' — this model does not match en_dict.txt, and the CTC decode would produce garbage.');
const tableOut = lastDims('vendor/table.onnx');
if (!tableOut.includes(TABLE_CLASSES)) throw new Error('vendor/table.onnx outputs ' + JSON.stringify(tableOut) + ', with no ' + TABLE_CLASSES + '-wide structure head — it does not match table_structure_dict.txt.');
if (!tableOut.includes(4)) throw new Error('vendor/table.onnx has no 4-wide box head — ocr.js decodes cell boxes as xyxy.');
// The detector emits a single-channel probability map; a 2-channel (prob+thresh)
// export would make ocr.js read the threshold map as text confidence.
const detOut = lastDims('vendor/det.onnx');
if (detOut.length !== 1) throw new Error('vendor/det.onnx has ' + detOut.length + ' outputs; ocr.js expects exactly one probability map.');

// The models must all be present as real weights, not LFS pointer stubs.
const MODELS = [['vendor/det.onnx', 2e6], ['vendor/rec.onnx', 6e6], ['vendor/table.onnx', 5e6], ['vendor/ort-wasm-simd-threaded.jsep.wasm', 15e6]];
for (const [p, floor] of MODELS) {
  const b = bin(p);
  if (b.length < floor) throw new Error(p + ' is only ' + b.length + ' bytes — a Git-LFS pointer or a truncated download, not the weights.');
}
// The JSEP build is the one with WebGPU kernels; the plain wasm gives a LinkError
// at session creation, which is a miserable thing to debug in the sandbox.
if (!bin('vendor/ort-wasm-simd-threaded.jsep.wasm').includes(Buffer.from('JsepOutput'))) {
  throw new Error('vendor/ort-wasm-simd-threaded.jsep.wasm has no JSEP symbols — this is the CPU-only wasm; WebGPU sessions will fail with a LinkError.');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': indexHtml,
  'app.js': appJs,
  'ocr.js': ocrJs,
  'pdf.js': pdfLib,
  'xlsx.js': xlsx,
  'ort.js': ortJs,
  'pdf-worker.js': ('window.PDF_WORKER_SRC=' + JSON.stringify(pdfWorker) + ';').split('</').join('<\\/'),
  // Raw bytes under `.assets/`, which gifos.assets(path) serves straight out of
  // the packed filesystem as a zero-copy ArrayBuffer transfer. They are NOT
  // top-level files and nothing in index.html may reference them: a src/href
  // naming a packed file becomes a data: URL inside the app's srcdoc, and 40 MB
  // of weights as base64 in one attribute crashes the renderer (measured — a
  // 57 MB srcdoc killed the tab before app.js ran). Same GIF, no network, no
  // manifest asset pin; only the transport is different.
  '.assets/ort-wasm.wasm': bin('vendor/ort-wasm-simd-threaded.jsep.wasm'),
  '.assets/det.onnx': bin('vendor/det.onnx'),
  '.assets/rec.onnx': bin('vendor/rec.onnx'),
  '.assets/table.onnx': bin('vendor/table.onnx'),
  '.assets/en_dict.txt': bin('vendor/en_dict.txt'),
  '.assets/table_structure_dict.txt': bin('vendor/table_structure_dict.txt'),
  'LICENSE-pdfjs.txt': read('vendor/LICENSE-pdfjs.txt'),
  'LICENSE-sheetjs.txt': read('vendor/LICENSE-sheetjs.txt'),
  'LICENSE-onnxruntime.txt': read('vendor/LICENSE-onnxruntime.txt'),
  'LICENSE-ppocr.txt': read('vendor/LICENSE-ppocr.txt'),
};

for (const m of indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  if (!(m[1] in files)) throw new Error('index.html loads script "' + m[1] + '", which build.mjs does not pack.');
}
// Every name in app.js's ASSETS map must be packed under `.assets/`, or the app
// ships with a model it can only fail to find at run time, in a user's hands.
const assetDecl = /var ASSETS = \{([^}]*)\}/.exec(appJs);
if (!assetDecl) throw new Error('app.js no longer declares a `var ASSETS = { … }` map — build.mjs can no longer check that every model it asks for is packed.');
const wanted = [...assetDecl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (wanted.length !== 6) throw new Error('app.js asks for ' + wanted.length + ' packed assets, expected 6 (engine wasm, 3 models, 2 dictionaries).');
for (const w of wanted) {
  if (!(('.assets/' + w) in files)) throw new Error('app.js calls gifos.assets("' + w + '") but build.mjs does not pack .assets/' + w + '.');
}
// And the reverse: nothing in the page may reference a packed file by src/href
// except the scripts, or the srcdoc grows a data: URL of that file's bytes.
const HREF_OK = new Set(Object.keys(files).filter((f) => f.endsWith('.js')));
for (const m of indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  if (m[1] in files && !HREF_OK.has(m[1])) throw new Error('index.html references packed file "' + m[1] + '" by src/href — the runtime would inline it into the app document as a data: URL. Reach it with gifos.assets() instead.');
}

const bytes = await gif.encode(files, { preview: pdfOcrIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pdf-tables-ocr', 'pdf-tables-ocr.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
const raw = Object.values(files).reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : v.length), 0);
console.log('wrote site/apps/pdf-tables-ocr/pdf-tables-ocr.gif —', (bytes.length / 1e6).toFixed(2), 'MB from',
  Object.keys(files).length, 'files (' + (raw / 1e6).toFixed(2), 'MB raw: pdf.js + SheetJS + ORT-WebGPU + 3 ONNX models, all in-GIF, no network, no asset pin)');
console.log('decoder contract OK — rec head', REC_CLASSES, 'classes, structure head', TABLE_CLASSES);
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
