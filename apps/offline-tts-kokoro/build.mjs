// Pack apps/offline-tts-kokoro/ source into the downloadable
// site/apps/offline-tts-kokoro/offline-tts-kokoro.gif (see apps/README.md).
//
// The GPU sibling of offline-tts-neural. Identical packing, with two swaps:
//   - ort-wasm.js ships the WebGPU-capable JSEP wasm (ort-wasm-simd-threaded
//     .jsep.wasm, ~21 MB) instead of the CPU-only one, so ORT can place the
//     transformer's ops on the device's GPU when there is one.
//   - the pinned model is Kokoro-82M fp16 (163 MB), whose ops HAVE WebGPU
//     kernels — the reason this provider exists next to KittenTTS int8.
// Everything else — ESM→window rewrites, the sandbox audits, the voice tables —
// is the sibling's, kept in lock-step on purpose.
//
// Run:  node apps/offline-tts-kokoro/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { kokoroTtsIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

// ---- phonemizer: ESM → plain script (identical to the sibling) --------------
const esm = read('vendor/phonemizer-esm.js');
const EXPORT_RE = /export\s*\{([^}]*)\};?\s*$/;
const m = EXPORT_RE.exec(esm);
if (!m) throw new Error('vendor/phonemizer-esm.js: export block not found — the bundle shape changed; update build.mjs.');
const exported = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
  const parts = pair.split(/\s+as\s+/);
  if (parts.length === 2) return `${parts[1].trim()}: ${parts[0].trim()}`;
  if (parts.length === 1) return parts[0];
  throw new Error('phonemizer export entry not understood: ' + pair);
});
for (const want of ['phonemize:', 'list_voices:']) {
  if (!exported.some((e) => e.startsWith(want))) throw new Error('phonemizer no longer exports ' + want.slice(0, -1));
}
let phon = esm.replace(EXPORT_RE, `window.Phonemizer = { ${exported.join(', ')} };\n`);
if (/^export\s/m.test(phon)) throw new Error('vendor/phonemizer-esm.js still contains an export statement after the rewrite.');
for (const bad of ['new Worker', 'import.meta', 'new Function', 'WebAssembly']) {
  if (phon.includes(bad)) throw new Error('phonemizer bundle now uses ' + bad + ' — re-audit it against the sandbox before shipping.');
}
if (/<\/script/i.test(phon)) throw new Error('phonemizer bundle contains </script — cannot inline safely.');

// ---- ORT: ESM → plain script, glue inlined (identical to the sibling) --------
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
if (/<\/script/i.test(ortJs)) throw new Error('ORT bundle contains </script — cannot inline safely.');

const isolate = (src) => '(function(){\n' + src + '\n})();\n';
phon = isolate(phon);
ortJs = isolate(ortJs);

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

// The voice tables and vocabulary are GENERATED but COMMITTED (tools/). Assert
// their shape: a truncated table sounds subtly wrong on long sentences only.
const voiceIndex = JSON.parse(read('vendor/voices-index.json'));
const voicesBin = bin('vendor/voices.f32');
const expect = voiceIndex.voices.length * voiceIndex.rows * voiceIndex.cols * 4;
if (voicesBin.length !== expect) {
  throw new Error(`vendor/voices.f32 is ${voicesBin.length} bytes, expected ${expect} for ${voiceIndex.voices.length}x${voiceIndex.rows}x${voiceIndex.cols} float32 — regenerate with tools/gen-vendor-data.py.`);
}
const vocab = JSON.parse(read('vendor/vocab.json'));
if (!vocab.map || Object.keys(vocab.map).length < 100) throw new Error('vendor/vocab.json looks wrong — regenerate with tools/gen-vendor-data.py.');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'ort.js': ortJs,
  // The WebGPU-capable JSEP wasm, handed to ORT as bytes via env.wasm.wasmBinary
  // — the sandbox has no network to fetch a .wasm from.
  'ort-wasm.js': strModule('window.TTS_ORT_WASM_B64', bin('vendor/ort-wasm-simd-threaded.jsep.wasm').toString('base64')),
  'phonemizer.js': phon,
  'voice-data.js': [
    strModule('window.TTS_VOICES_B64', voicesBin.toString('base64')),
    strModule('window.TTS_VOICE_INDEX_JSON', read('vendor/voices-index.json')),
    strModule('window.TTS_VOCAB_JSON', read('vendor/vocab.json')),
  ].join('\n'),
  'selftest-model.js': strModule('window.TTS_SELFTEST_B64', bin('vendor/selftest.onnx').toString('base64')),
  'COPYING-espeak-ng.txt': read('COPYING-espeak-ng.txt'),
  'LICENSE-phonemizer.txt': read('vendor/LICENSE-phonemizer.txt'),
  'LICENSE-onnxruntime.txt': read('vendor/LICENSE-onnxruntime.txt'),
};

const bytes = await gif.encode(files, { preview: kokoroTtsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'offline-tts-kokoro', 'offline-tts-kokoro.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/offline-tts-kokoro/offline-tts-kokoro.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (WebGPU engine + voices + self-test in-GIF; Kokoro fp16 weights by asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
