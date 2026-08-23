// Pack apps/offline-llm-gemma4/ source into the downloadable
// site/apps/offline-llm-gemma4/offline-llm-gemma4.gif (see apps/README.md).
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
// NOT in the GIF: the Gemma 4 E2B weights (~1.75 GB) — those ride the
// install-time assets pattern (manifest "assets", pinned by sha256; cached in
// the computer's Blob store). See README.md.
//
// Run:  node apps/offline-llm-gemma4/build.mjs
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gemma4Icon } from './icon.mjs';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush.
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

const helpMd = read('help.md').replace(/^\uFEFF/, '');
if (helpMd.trim().length < 400) throw new Error('help.md must be at least 400 characters after trim');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'help.md': helpMd,
  'wllama-lib.js': lib,
  'wllama-wasm.js': strModule('window.LLM_WASM_B64', wasmB64),
  'demo-model-data.js': strModule('window.LLM_DEMO_B64', demoB64),
  'COPYING-wllama.txt': read('COPYING-wllama.txt'),
};

const bytes = await gif.encode(files, { preview: gemma4Icon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'offline-llm-gemma4', 'offline-llm-gemma4.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/offline-llm-gemma4/offline-llm-gemma4.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (engine + self-test model in-GIF; Gemma 4 weights by asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
