// Pack apps/offline-llm-bitnet/ source into the downloadable
// site/apps/offline-llm-bitnet/offline-llm-bitnet.gif (see apps/README.md).
//
// In the GIF (the engine — chess-grandmaster's pattern, scaled up):
//   wllama-lib.js       → vendor/wllama-esm.js (wllama, MIT — llama.cpp wasm
//                         binding) with its ESM export block rewritten to
//                         window.WllamaLib, so it runs as a plain inline script.
//   wllama-wasm.js      → window.LLM_WASM_B64: llama.cpp compiled to wasm
//                         (7.7 MB; TQ1_0/TQ2_0 ternary quants compiled in).
//                         The app mints a blob: URL from these bytes — the
//                         wasm hatch's connect-src blob: exists for this.
//   demo-model-data.js  → window.LLM_DEMO_B64: the ~4.9 MB SELF-TEST model
//                         (real llama tokenizer, tiny random weights) built
//                         by make-demo-model.py. Proves the whole pipeline
//                         offline and in the gate.
// NOT in the GIF: the BitNet b1.58 weights (~1+ GB) — those ride the
// install-time assets pattern (manifest "assets", pinned by sha256; cached in
// the computer's Blob store). See README.md for finalizing the pin.
//
// Run:  node apps/offline-llm-bitnet/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { bitnetIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

// wllama ESM → plain script: the bundle is self-contained (zero imports); its
// one export block becomes a window global the app reads.
const esm = read('vendor/wllama-esm.js');
const EXPORT_RE = /export\s*\{([\s\S]*?)\};\s*$/;
if (!EXPORT_RE.test(esm)) throw new Error('vendor/wllama-esm.js: export block not found — the bundle shape changed; update build.mjs.');
let lib = esm.replace(EXPORT_RE, 'window.WllamaLib = {$1};\n');
if (/^export\s/m.test(lib)) throw new Error('vendor/wllama-esm.js still contains an export statement after the rewrite.');
if (/<\/script/i.test(lib)) throw new Error('wllama lib contains </script — cannot inline safely.');
// MODULE → CLASSIC worker: Chromium refuses a { type: 'module' } worker whose
// script is a blob URL inside an opaque-origin (sandboxed) frame — the
// constructor succeeds and the worker just fires onerror, which reads as a
// silent hang. The generated worker/emscripten code carries zero module-only
// syntax (no import/import.meta/importScripts — asserted above/below), so a
// classic worker runs it byte-for-byte. Verified by the sandbox probe in
// e2e-providers (classic ok, module ERR).
const WORKER_CALL = 'new Worker(workerURL, { type: "module" })';
if (!lib.includes(WORKER_CALL)) throw new Error('wllama createWorker call not found — the bundle shape changed; update the classic-worker rewrite in build.mjs.');
lib = lib.replace(WORKER_CALL, 'new Worker(workerURL)');
for (const bad of ['importScripts', 'import(', 'import.meta']) {
  if (lib.includes(bad)) throw new Error('wllama bundle now uses ' + bad + ' — the classic-worker rewrite is no longer safe.');
}

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');
const wasmB64 = readFileSync(join(dir, 'vendor/wllama.wasm')).toString('base64');
const demoB64 = readFileSync(join(dir, 'vendor/demo-model.gguf')).toString('base64');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'wllama-lib.js': lib,
  'wllama-wasm.js': strModule('window.LLM_WASM_B64', wasmB64),
  'demo-model-data.js': strModule('window.LLM_DEMO_B64', demoB64),
  'COPYING-wllama.txt': read('COPYING-wllama.txt'),
};

const bytes = await gif.encode(files, { preview: bitnetIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'offline-llm-bitnet', 'offline-llm-bitnet.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/offline-llm-bitnet/offline-llm-bitnet.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (engine + self-test model in-GIF; BitNet weights by asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
