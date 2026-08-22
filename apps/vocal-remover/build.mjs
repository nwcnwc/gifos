// Pack apps/vocal-remover/ source into the downloadable
// site/apps/vocal-remover/vocal-remover.gif (see apps/README.md).
//
// WHAT RIDES WHERE
//   in the GIF   the app, the transcribed UVR pipeline (fft/mdx/wav/models),
//                ONNX Runtime Web + its WebGPU-capable JSEP wasm, and the tiny
//                labelled self-test model that makes the pipeline provable
//                offline and in the gate.
//   by asset pin the two UVR model weights (~120 MB) — manifest "assets",
//                sha256-pinned, cached in the computer's Blob store. Same tier
//                the offline-llm and Kokoro apps use.
//
// THE ORT BYTES ARE THE KOKORO APP'S. onnxruntime-web's WebGPU build is 22 MB;
// a private copy here would be 22 MB twice in every clone and two versions that
// drift apart. apps/offline-tts-kokoro/vendor/ holds the JSEP pairing already
// (that app exists BECAUSE it needs the GPU build), this app needs exactly the
// same pairing, so it reads them from there. The rewrite below asserts the
// bundle's shape, so a vendor bump that changes it fails here rather than in a
// player's browser.
//
// Run:  node apps/vocal-remover/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { vocalRemoverIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

// ---- the asset pins must agree with what models.js expects ------------------
// A manifest pin whose `path` no models.js entry asks for downloads 67 MB
// nobody reads; a models.js entry with no pin behind it is an app that always
// falls into self-test. Both are silent, so both are checked here.
const pins = JSON.parse(read('MODEL-PINS.json'));
{
  const wanted = new Set();
  const src = read('models.js');
  for (const m of src.matchAll(/asset:\s*'([^']+)'/g)) wanted.add(m[1]);
  const pinned = new Set((manifest.assets || []).map((a) => a.path));
  for (const w of wanted) if (!pinned.has(w)) throw new Error('models.js wants asset "' + w + '" but manifest.json pins no such path');
  for (const p of pinned) if (!wanted.has(p)) throw new Error('manifest.json pins asset "' + p + '" that models.js never reads');
  for (const p of pins.pins) {
    const a = (manifest.assets || []).find((x) => x.path === p.id + '.onnx');
    if (!a) throw new Error('MODEL-PINS.json records ' + p.id + ' but the manifest does not pin it');
    if (a.sha256 !== p.sha256 || a.bytes !== p.bytes) {
      throw new Error(p.id + ': manifest.json and MODEL-PINS.json disagree about the bytes — one of them was edited alone');
    }
  }
}

// ---- ORT: ESM -> plain script (the rewrite offline-tts-kokoro's build does) --
let ortJs = readFileSync(join(dir, '..', 'offline-tts-kokoro', 'vendor', 'ort-esm.js'), 'utf8');
const ORT_EXPORT_RE = /export\{([^}]*)\};?/;
const om = ORT_EXPORT_RE.exec(ortJs);
if (!om) throw new Error('offline-tts-kokoro/vendor/ort-esm.js: export block not found — the bundle shape changed; update build.mjs.');
const ortExports = om[1].split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
  const parts = pair.split(/\s+as\s+/);
  return parts.length === 2 ? `${parts[1].trim()}: ${parts[0].trim()}` : parts[0];
});
for (const want of ['InferenceSession:', 'Tensor:', 'env:']) {
  if (!ortExports.some((e) => e.startsWith(want))) throw new Error('ORT no longer exports ' + want.slice(0, -1));
}
ortJs = ortJs.replace(ORT_EXPORT_RE, `window.ort = { ${ortExports.join(', ')} };`);
if (!ortJs.includes('import.meta.url')) throw new Error('ort-esm.js no longer uses import.meta.url — re-check the rewrite in build.mjs.');
ortJs = ortJs.split('import.meta.url').join('"https://ort.invalid/gifos-inlined/"');
for (const bad of ['import.meta', 'import(']) {
  if (ortJs.includes(bad)) throw new Error('ORT bundle still contains ' + bad + ' after the rewrite — it cannot be inlined as a classic script.');
}
if (/^export\s|export\{/m.test(ortJs)) throw new Error('ort-esm.js still contains an export statement after the rewrite.');
if (/<\/script/i.test(ortJs)) throw new Error('ORT bundle contains </script — cannot inline safely.');
ortJs = '(function(){\n' + ortJs + '\n})();\n';

const ortWasm = readFileSync(join(dir, '..', 'offline-tts-kokoro', 'vendor', 'ort-wasm-simd-threaded.jsep.wasm'));

const selftest = join(dir, 'vendor', 'selftest.onnx');
if (!existsSync(selftest)) {
  throw new Error('vendor/selftest.onnx is missing — run: python3 apps/vocal-remover/tools/make-selftest-model.py');
}

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

// Script order matters: fft.js attaches window.VRFFT and mdx.js reads it at
// call time, but models.js/app.js read each other at load. index.html lists
// them in this order and the runtime inlines each <script src> where it stands.
const SCRIPTS = ['fft.js', 'mdx.js', 'wav.js', 'models.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'ort.js': ortJs,
  // Handed to ORT as bytes via env.wasm.wasmBinary — the sandbox has no
  // network to fetch a .wasm from.
  'ort-wasm.js': strModule('window.VR_ORT_WASM_B64', ortWasm.toString('base64')),
  'selftest-model.js': strModule('window.VR_SELFTEST_B64', readFileSync(selftest).toString('base64')),
  // The licences ride INSIDE the GIF, not just beside it in the repo: a copy of
  // this app that someone was handed is a distribution of both MIT works.
  'COPYING-uvr.txt': read('COPYING-uvr.txt'),
  'LICENSE-onnxruntime.txt': readFileSync(join(dir, '..', 'offline-tts-kokoro', 'vendor', 'LICENSE-onnxruntime.txt'), 'utf8'),
};
for (const s of SCRIPTS) files[s] = read(s);

// The runtime inlines every <script src> it finds by rewriting the tag, so a
// script the HTML never references would travel in the GIF and never run.
const html = files['index.html'];
for (const s of SCRIPTS.concat(['ort.js', 'ort-wasm.js', 'selftest-model.js'])) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

const bytes = await gif.encode(files, { preview: vocalRemoverIcon(), accent: manifest.accent });
// Into the PUBLISH boundary: site/ is what GitHub Pages serves, so a GIF
// anywhere else is not downloadable (see apps/README.md).
const out = join(dir, '..', '..', 'site', 'apps', 'vocal-remover', 'vocal-remover.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/vocal-remover/vocal-remover.gif —', (bytes.length / 1e6).toFixed(2), 'MB from',
            Object.keys(files).length, 'files (engine + pipeline + self-test in-GIF; UVR weights by asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
