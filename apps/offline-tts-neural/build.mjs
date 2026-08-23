// Pack apps/offline-tts-neural/ source into the downloadable
// site/apps/offline-tts-neural/offline-tts-neural.gif (see apps/README.md).
//
// In the GIF (the engine — docs/tts-neural.md's split):
//   ort.js             → vendor/ort-esm.js (ONNX Runtime Web, MIT), rewritten
//                        from ESM to window.ort. The BUNDLE build, whose
//                        emscripten glue is inlined — see the long note below
//                        for why the 49 KB wasm-only build cannot work here.
//   ort-wasm.js        → window.TTS_ORT_WASM_B64: the runtime's wasm (11.2 MB,
//                        deflates to ~3 MB). Handed to ORT as BYTES via
//                        env.wasm.wasmBinary — the sandbox has no network and
//                        nothing to fetch a .wasm from.
//   phonemizer.js      → vendor/phonemizer-esm.js (espeak-ng compiled to
//                        asm.js, with its data embedded) rewritten from ESM to
//                        window.Phonemizer. Pure JS: no wasm, no worker, no
//                        fetch, no eval — audited below and asserted here.
//   voice-data.js      → the 8 style tables + the token vocabulary.
//   selftest-model.js  → window.TTS_SELFTEST_B64: the ~1.6 KB stand-in model
//                        (tools/make-selftest-model.py) that proves this whole
//                        pipeline offline and in the gate.
// NOT in the GIF: kitten_tts_nano_v0_8.onnx (24 MB) — install-time assets
// pattern, pinned by sha256 in the manifest. See README.md.
//
// Run:  node apps/offline-tts-neural/build.mjs
import { neuralTtsIcon } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

// ---- phonemizer: ESM → plain script ----------------------------------------
// The bundle is self-contained (zero imports); its one export block becomes a
// window global the app reads, so it can be injected as an inline <script>
// under the app CSP (no eval, no modules).
const esm = read('vendor/phonemizer-esm.js');
const EXPORT_RE = /export\s*\{([^}]*)\};?\s*$/;
const m = EXPORT_RE.exec(esm);
if (!m) throw new Error('vendor/phonemizer-esm.js: export block not found — the bundle shape changed; update build.mjs.');
// Entries are `local as exported` — reversed into an object literal. Retyping
// the pair the other way round yields `phonemize is not a function` at runtime
// and nothing at build time, so it is parsed rather than assumed.
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
// The sandbox audit, asserted rather than remembered. phonemizer is asm.js with
// its espeak-ng data embedded, which is exactly why it needs none of these; if
// a future version starts fetching its data or spawning a worker, the app would
// break inside an opaque origin with no network, and it should break HERE.
for (const bad of ['new Worker', 'import.meta', 'new Function', 'WebAssembly']) {
  if (phon.includes(bad)) throw new Error('phonemizer bundle now uses ' + bad + ' — re-audit it against the sandbox before shipping.');
}
if (/<\/script/i.test(phon)) throw new Error('phonemizer bundle contains </script — cannot inline safely.');

// ---- ORT: ESM → plain script, and the glue must be INLINE -------------------
// We ship ort.bundle.min.mjs, NOT the 49 KB ort.wasm.min.js, and the extra
// 419 KB buys the only thing that actually works in the sandbox. The small
// build loads its emscripten glue with a dynamic import() of
// ort-wasm-simd-threaded.mjs, which in an opaque origin with no network is two
// failures at once — measured in the app window:
//   Refused to load the script 'ort-wasm-simd-threaded.mjs' because it violates
//   the following Content Security Policy directive: "script-src 'unsafe-inline'
//   'wasm-unsafe-eval'"
//   ⚠ no available backend found. ERR: [wasm] TypeError: Failed to fetch
//   dynamically imported module
// The bundle variant inlines that glue (import( = 0), so nothing is fetched.
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
// import.meta is MODULE-ONLY SYNTAX: left in place it is a SyntaxError the
// moment the runtime injects this as a classic inline script, and the app dies
// before a line of it runs. All four uses resolve URLs we never take — the
// wasm arrives as bytes via env.wasm.wasmBinary, and the pthread worker needs
// threads we switch off — so they become a URL that parses and is never
// fetched. If one ever IS taken it fails loudly against an unresolvable host
// rather than quietly reaching for the network.
if (!ortJs.includes('import.meta.url')) throw new Error('vendor/ort-esm.js no longer uses import.meta.url — re-check the rewrite in build.mjs.');
ortJs = ortJs.split('import.meta.url').join('"https://ort.invalid/gifos-inlined/"');
for (const bad of ['import.meta', 'import(']) {
  if (ortJs.includes(bad)) throw new Error('ORT bundle still contains ' + bad + ' after the rewrite — it cannot be inlined as a classic script.');
}
if (/^export\s|export\{/m.test(ortJs)) throw new Error('vendor/ort-esm.js still contains an export statement after the rewrite.');
if (/<\/script/i.test(ortJs)) throw new Error('ORT bundle contains </script — cannot inline safely.');

// TWO MINIFIED BUNDLES SHARE ONE SCRIPT SCOPE. Injected as separate classic
// inline scripts they both declare top-level `const ne` (and more), and the
// second one to load dies with "Identifier 'ne' has already been declared" —
// which surfaced as the useless "The pronunciation engine failed to load."
// because window.Phonemizer never got assigned. Each bundle gets its own
// function scope; the globals they are meant to publish are set explicitly by
// the rewrites above, so nothing else depends on their top-level bindings.
const isolate = (src) => '(function(){\n' + src + '\n})();\n';
phon = isolate(phon);
ortJs = isolate(ortJs);

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

// The voice tables and vocabulary are GENERATED but COMMITTED
// (tools/gen-vendor-data.py). Assert their shape here: a truncated table would
// otherwise surface as a voice that sounds subtly wrong for long sentences
// only, which is the worst way to find out.
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
  // The BUNDLE inlines the emscripten glue, not the 11 MB wasm binary itself —
  // that still has to reach ORT, and env.wasm.wasmBinary is how, because the
  // sandbox has nothing to fetch it from.
  'ort-wasm.js': strModule('window.TTS_ORT_WASM_B64', bin('vendor/ort-wasm-simd-threaded.wasm').toString('base64')),
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

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

const bytes = await gif.encode(files, { preview: neuralTtsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'offline-tts-neural', 'offline-tts-neural.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/offline-tts-neural/offline-tts-neural.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (engine + voices + self-test in-GIF; KittenTTS weights by asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
